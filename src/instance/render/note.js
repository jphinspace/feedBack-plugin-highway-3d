import { T } from '../../core/three.js';
import {
    ACCENT_RIM_XY_SCALE_MUL, ACCENT_RIM_Z_SCALE_MUL, AHEAD, BEND_ENV_RELEASE_FRAC,
    BEND_ENV_RISE_FRAC, BEND_HALFSTEP_WORLD_Y, CHORD_FRAME_RIM_FRAC_H, CHORD_FRAME_RIM_MIN,
    FRET_LABEL_GOLD_HEX, GHOST_FRET_LBL_FADE_S, GHOST_HOLD_AFTER_ONSET, GHOST_UPCOMING_WIN,
    NEXT_ON_STRING_T_EPS, NFRETS, NH, NOTEDETECT_GEM_VERDICT_WINDOW, NW, PROJ_GROW_MIN,
    SINGLE_SUS_OFFSETS, S_GAP, K, TS,
} from '../../core/constants.js';
import {
    dZ, fretLabelScaleForFret, fretMid, slideOffsetWorldX, slideTrailEnd,
} from '../../core/fret-geometry.js';
import {
    RENDER_ORDER_LAYER_STACK, hwyPostHitTailFadeMul, renderOrderForLayerAtZ,
} from '../../core/render-order.js';
import { SLIDE_RIBBON_SAMPLES } from '../../core/slide-ribbon.js';
import { anchorLaneBoundsAt } from '../../core/chart-util.js';
import {
    bnvSampleAt, darkenHex, noteHasVibrato, teachingDegreeLabel, teachingFingerLabel,
    tremoloOffsetWorldX, vibratoSemisAtTime,
} from '../model/math.js';

/**
 * The note renderer: everything needed to draw one gem/sustain/technique-mark
 * cluster for a single note, plus the small helper cluster it alone uses
 * (ghost fret-digit template lookups, the slide ribbon, bend/vibrato Y offset).
 *
 * Two dependency tiers, matching how each piece of state behaves:
 * 1. `deps` (this factory's argument) — injected once, at construction time.
 *    Every field is either a Three.js material/geometry/pool that
 *    `initScene()` builds fresh and never reassigns until the next re-init,
 *    or a small shared function/Map/Set mutated via its own methods (never
 *    reassigned). `createNoteRenderer()` is called again each time
 *    `initScene()` reruns, right after these are (re)built.
 * 2. `frame` (`drawNote`'s last parameter) — values that change frame-to-frame
 *    (camera position, active settings, notedetect snapshot state) but are
 *    owned and written elsewhere. `update()` builds one `frame` object per
 *    call (not one per note — `drawNote` is called from two loops) and
 *    passes the same reference to every `drawNote()` call that frame, so
 *    there's no staleness risk and no per-note allocation. A field only
 *    belongs in `deps` if a whole-file bare-reassignment grep confirms it's
 *    never rebuilt inside `update()` before `drawNote`'s call sites —
 *    `_fretLabelAllowed` looked construction-stable until that grep found
 *    otherwise.
 *
 * The 3 true write-backs (`noteDetectVerdictMaxAlpha`, `noteDetectVerdictSawAlpha`,
 * `_streakHits`) fit neither tier — written here AND read/reset elsewhere in
 * `update()` on the same frame. They live on `noteVerdictState`, a small
 * object both sides hold the same reference to and mutate directly.
 */
export function createNoteRenderer(deps) {
    const {
        // Materials (per-string arrays / singletons), rebuilt in initScene().
        gNote, gNoteGrad, mStr, mGlow, mSus, mStrHitOutline, mAccentOutline, mAccentCore,
        mAccentHaloNear, _accentShellsByString, mWhiteOutline, mSusOutline, mHitSusOutline,
        mMissOutline, mHitBright, mHitBrightArrays, mRimFlash, _rimFlashIn, mMissEdgeArrays,
        // Pools.
        pSusOutline, pNoteEdge, pTechPlane, pNote, pSus, pGhostFretLbl, pNoteFretLabel,
        pConnectorLine, pDropLine, pTapChevron, pAccentHalo, pTeachMarkLbl, pSusRibbon,
        pSusRibbonOl,
        // Per-instance scratch / cache state, mutated via methods (not reassigned).
        projMeshArr, _frameLabeledKeys, _susVerdictLatch, _fwHitIn, _fwChordAcc,
        _scrGhostUpcomingCount, _techMeshMatClones, _sparkSeen,
        // notedetect arrays/consts, only ever reassigned in initScene()/teardown().
        NOTEDETECT_TIME_EPS, noteDetectHitMarks, noteDetectMissMarks, noteDetectLabels,
        // Sprite/material caches.
        textSprites, techMaterials,
        // Small shared functions, still living in main.js's closure.
        validString, _setLabelMap, _firstEventTimeGreaterThan, _fxSpawnPop, _sparkBurst, xFretMid, sY,
        // Persistent cross-frame accumulator shared with update() — see doc comment above.
        noteVerdictState,
    } = deps;

    function _meshMatForGhostFretDigit(spriteMat) {
        let mb = spriteMat.userData.h3dGhostFretMeshMat;
        if (!mb) {
            mb = new T.MeshBasicMaterial({
                map: spriteMat.map,
                transparent: true,
                depthTest: false,
                depthWrite: false,
            });
            spriteMat.userData.h3dGhostFretMeshMat = mb;
        }
        return mb;
    }

    /**
     * Converts any SpriteMaterial to a MeshBasicMaterial sharing its canvas
     * texture, so technique markers can apply to a rotatable PlaneGeometry
     * mesh instead of a billboard Sprite. Cached on userData to avoid
     * allocations: each pTechPlane mesh holds a `Map<sm.map, clone>` so a
     * recycled mesh used for several techniques (hammer-on, palm-mute,
     * harmonic, bend...) across frames keeps one clone per technique rather
     * than disposing-and-recloning on every switch.
     */
    function _spriteMat2MeshMat(mesh, sm) {
        let perMesh = mesh.userData.h3dTechMeshMatCloneByMap;
        if (perMesh) {
            const hit = perMesh.get(sm.map);
            if (hit) return hit;
        }

        let base = sm.userData.h3dTechMeshMat;
        if (!base) {
            base = new T.MeshBasicMaterial({
                map: sm.map,
                transparent: true,
                // depthTest:false — cross-note Z ordering is handled by per-note
                // renderOrderForLayerAtZ(...) rather than the depth buffer, since close notes
                // often use mGlow (depthWrite:false) and can't reliably occlude via depth alone.
                depthTest: false,
                depthWrite: false,
                // forceSinglePass on every transparent DoubleSide material here: without it,
                // Three r158+ renders these in two passes (back then front), forcing a full
                // getParameters/program-cache lookup per object per frame and doubling draw
                // calls — unnecessary since these are all flat unlit quads with no self-occlusion to sort.
                side: T.DoubleSide, forceSinglePass: true,
            });
            sm.userData.h3dTechMeshMat = base;
        }
        // First conversion for this mesh: the pTechPlane pool factory gave it a placeholder
        // material the caller is about to overwrite. Dispose it now, before it's orphaned and
        // unreachable by teardown's scene.traverse() pass.
        if (!perMesh && mesh.material && mesh.material !== base) {
            mesh.material.dispose?.();
        }
        if (!perMesh) {
            perMesh = new Map();
            mesh.userData.h3dTechMeshMatCloneByMap = perMesh;
        }
        const clone = base.clone();
        perMesh.set(sm.map, clone);
        _techMeshMatClones.add(clone);
        return clone;
    }
    /** Tints the hit feedback by timing (issue #5): on-time green, early cyan, late amber. Falls back to green when timing is unknown. */
    function _timingHex(ts, frame) {
        const { _timingFx } = frame;
        if (!_timingFx || !ts || ts === 'OK') return 0x22ff88;
        if (ts === 'EARLY') return 0x35d6ff;
        if (ts === 'LATE')  return 0xffb84d;
        return 0x22ff88;
    }
    /**
     * Indexed sustain ribbon (~SLIDE_RIBBON_SAMPLES longitudinal slices) for
     * slides, bends, vibrato and tremolo — a smooth contour vs. stacked
     * BoxGeometry segments.
     */
    function slideRibbonUpdatePositions(geom, strandBaseX, tw, th, y, sliceDur, susStart, now, n, slideSt, frame) {
        const { _leftyCached } = frame;
        const pa = geom.attributes.position.array;
        const S = SLIDE_RIBBON_SAMPLES;
        // slideOffsetWorldX returns a right-handed delta (built from non-lefty fretMid);
        // strandBaseX is already lefty-mirrored via xFretMid at the call site, so the delta
        // needs the same sign flip to track the mirrored fretboard direction.
        const dirMul = _leftyCached ? -1 : 1;
        let v = 0;
        for (let k = 0; k <= S; k++) {
            const Tk = susStart + (k / S) * sliceDur;
            const zk = dZ(Tk - now);
            const xc = strandBaseX
                + dirMul * slideOffsetWorldX(n, Tk, slideSt)
                + tremoloOffsetWorldX(n, Tk, tw);
            const yc = y + techniqueYOffsetWorld(n, Tk, frame);
            pa[v++] = xc - tw * 0.5; pa[v++] = yc - th * 0.5; pa[v++] = zk;
            pa[v++] = xc + tw * 0.5; pa[v++] = yc - th * 0.5; pa[v++] = zk;
            pa[v++] = xc + tw * 0.5; pa[v++] = yc + th * 0.5; pa[v++] = zk;
            pa[v++] = xc - tw * 0.5; pa[v++] = yc + th * 0.5; pa[v++] = zk;
        }
        geom.attributes.position.needsUpdate = true;
        // Normals are pre-baked at geometry creation (mkSlideRibbonGeo); axis-aligned
        // cross-section means they don't need per-frame recompute.
    }

    function bendVisualDirY(stringIdx, frame) {
        const { nStr, _invertedCached } = frame;
        if (!Number.isFinite(stringIdx) || nStr <= 1) return 1;
        const visualIdx = _invertedCached ? stringIdx : (nStr - 1 - stringIdx);
        return visualIdx >= (nStr - 1) * 0.5 ? -1 : 1;
    }

    function bendSemisAtTime(n, chartTime) {
        if (!(n?.sus > 0)) return 0;
        // When the note carries an authoritative bend curve, sample its real shape at the
        // elapsed time so the gem's Y gesture and sustain ribbon follow the actual bend
        // (pre-bend, round-trip, release, ...). Negative samples clamp to 0 (upward-only).
        if (Array.isArray(n.bnv) && n.bnv.length) {
            return Math.max(0, bnvSampleAt(n.bnv, chartTime - n.t));
        }
        const bn = Number(n?.bn) || 0;
        if (!(bn > 0)) return 0;
        const p = Math.max(0, Math.min(1, (chartTime - n.t) / Math.max(n.sus, 1e-6)));
        // Fallback: synthesize rise -> hold -> release from the scalar peak (ramp over the
        // first ~35%, hold, release over the last ~30%) rather than a monotone climb.
        const RISE = BEND_ENV_RISE_FRAC, REL = BEND_ENV_RELEASE_FRAC;
        let env;
        if (p < RISE) env = p / RISE;
        else if (p < 1 - REL) env = 1;
        else env = (1 - p) / REL;
        return bn * Math.max(0, Math.min(1, env));
    }

    function techniqueYOffsetWorld(n, chartTime, frame) {
        if (!(n?.sus > 0)) return 0;
        const bendSemi = bendSemisAtTime(n, chartTime);
        const vibratoSemi = vibratoSemisAtTime(n, chartTime);
        if (bendSemi === 0 && vibratoSemi === 0) return 0;
        return bendVisualDirY(n.s, frame) * BEND_HALFSTEP_WORLD_Y * (bendSemi + vibratoSemi);
    }

    /* ── Note renderer ───────────────────────────────────────────────── */
    /** Chart-format `<chordTemplates>` frets: -1 = unused, 0 = open, n>0 = fret. Ghost digit for chord notes uses the template row so it matches the XML diagram, not a divergent chordNote.f. */
    function _templateFretForChordGhost(chordId, stringIdx, noteFret, frame) {
        const { _drawChordTemplates } = frame;
        if (chordId == null) return noteFret;
        // Coerce: some upstream paths (e.g. hs.chord_id from sloppaks) hand us string ids like "12".
        const cid = typeof chordId === 'number' ? chordId : Number(chordId);
        if (!Number.isFinite(cid)) return noteFret;
        const fr = _drawChordTemplates?.[cid]?.frets;
        if (!Array.isArray(fr) || stringIdx < 0 || stringIdx >= fr.length) return noteFret;
        const tf = fr[stringIdx];
        if (typeof tf !== 'number' || tf < 0) return noteFret;
        return tf;
    }
    /** Chart-format-style ghost digit: finger position (1=index..4=pinky) from the chord template. Null when no finger data exists (GP imports emit all -1; open strings skip since "0" is already shown via the open-string path). */
    function _templateFingerForChordGhost(chordId, stringIdx, frame) {
        const { _drawChordTemplates } = frame;
        if (chordId == null) return null;
        const cid = typeof chordId === 'number' ? chordId : Number(chordId);
        if (!Number.isFinite(cid)) return null;
        const fi = _drawChordTemplates?.[cid]?.fingers;
        if (!Array.isArray(fi) || stringIdx < 0 || stringIdx >= fi.length) return null;
        const tf = fi[stringIdx];
        if (typeof tf !== 'number' || tf <= 0) return null; // -1 unused, 0 open (gem path handles it)
        return tf; // 1-4
    }
    /**
     * Renders one board-ghost fret digit onto a pooled label mesh, flat in
     * the board XY plane at (x, y, 0) — a Mesh, not a Sprite billboard, so
     * perspective + projRim match the 3D ghost frame. Shared by `drawNote`'s
     * Primary ghost slot and its Upcoming slots.
     */
    function drawGhostFretLabel(x, y, projRim, fretDisplay, alpha, growScale, fretForScale, frame) {
        const { _textSizeMul } = frame;
        const lb = pGhostFretLbl.get();
        const sprMat = textSprites.txtMat(fretDisplay, '#ffffff', false, 'ghostFret');
        const baseGhostMat = _meshMatForGhostFretDigit(sprMat);
        let instMat = lb.userData.h3dGhostFretLblInstMat;
        if (!instMat || instMat.map !== baseGhostMat.map) {
            if (instMat) {
                try { instMat.dispose(); } catch (_) { /* idempotent */ }
            }
            instMat = baseGhostMat.clone();
            instMat.transparent = true;
            instMat.needsUpdate = true;
            lb.userData.h3dGhostFretLblInstMat = instMat;
        }
        instMat.opacity = alpha;
        instMat.depthTest = false;
        lb.material = instMat;
        lb.renderOrder = 1000;
        const ghostOuterL = Math.max(NW * 1.1, NH * 1.1);
        const ghostLblS = 0.7 * ghostOuterL * _textSizeMul * fretLabelScaleForFret(fretForScale);
        const ghostLblScaled = ghostLblS * growScale;
        lb.scale.set(ghostLblScaled, ghostLblScaled, 1);
        // Z=0 matches the projection frame plane exactly — a positive-Z offset here would
        // project leftward vs the frame, since the camera sits offset from the fret centre.
        lb.position.set(x, y, 0);
        lb.rotation.set(0, 0, projRim);
    }

    // skipLabel: don't draw per-note connector label (repeated fret)
    // skipBody:  don't draw the 3D note mesh (repeat chord — still shows projection)
    // showDropLine: draw a white vertical drop line from note to below board (arpeggio / synth chord notes)
    function drawNote(n, now, openX, skipLabel, skipBody, linger = 0.10, openChordBoxWidth, fromChord = false, chordId, susTrailMatchArpFrame = false, arpBounds = null, prevOnsetT = -Infinity, showDropLine = false, frame) {
        // `frame` is a single object update() builds once per call (not once per note) holding
        // everything that varies frame-to-frame but isn't owned by this module.
        const {
            curX, activePalette, _textSizeMul, nStr, _leftyCached, _invertedCached,
            _drawNextByString, _drawAnchors, _drawChordTemplates, _drawTeachingMarks,
            _showFingerHints, noteDetectFrameNowMs, noteDetectGetState, noteDetectHasProvider,
            showFretOnNote, fretNumberGhostScope, glowMul, _hitFx, _sparks, _verdictMarks,
            _streakFx, _streakHeat, projectionVisible, slideArrowApproachVisible,
            slideArrowNeckVisible, slideArrowChainPreviewVisible, _vibrancyProjOp, _timingFx,
            _fretLabelAllowed,
        } = frame;
        const s = n.s;
        // Belt + suspenders: callers already gate via validString(), but drawNote is also
        // entered through { ...cn } chord-note spreads, so re-check before indexing material arrays.
        if (!validString(s)) return;
        const nxFrame = _drawNextByString && _drawNextByString[s];
        const dt = n.t - now;
        const ghostHold = fromChord ? linger : GHOST_HOLD_AFTER_ONSET;
        const nextTAligned = nxFrame != null && Math.abs(nxFrame.t - n.t) < NEXT_ON_STRING_T_EPS;
        const ghostPastHold = dt <= 0 && dt > -ghostHold
            && (nxFrame == null || nxFrame.t > n.t - 1e-6);
        const isNextOnString = nextTAligned || ghostPastHold;
        const y = sY(s);
        const susEnd = n.t + (n.sus || 0);
        const hasSus = n.sus > 0;
        // Nearest event time across ALL strings strictly after this note, from the sorted
        // union built once per frame in update(). _drawRecentByString is folded in so that
        // once an event passes `now` (and leaves _drawNextByString) the deadline still holds
        // — otherwise the next future event would reset _nextAnyT and old gems would linger.
        const _nextAnyT = _firstEventTimeGreaterThan(n.t + 1e-6);
        // Deadline: absolute time after which the gem is culled.
        //   Sustain long (sus >= linger): die immediately at susEnd — no tail.
        //   Sustain short (sus < linger):  tail = linger - sus after susEnd,
        //     capped by gap to next note (any string) so the gem disappears
        //     when the next note arrives if it comes before the tail runs out.
        //   No sustain: linger from onset, same gap-cap rule.
        let _lingerDeadline;
        if (hasSus) {
            const extraLinger = Math.max(0, linger - (n.sus || 0));
            // _nextAnyT cap only applies to the post-sustain linger tail — for long sustains
            // (extraLinger = 0) the deadline is exactly susEnd, so other strings never cut a held sustain short.
            _lingerDeadline = extraLinger > 0
                ? Math.min(susEnd + extraLinger, _nextAnyT)
                : susEnd;
        } else {
            const _gap = _nextAnyT - n.t;
            _lingerDeadline = n.t + (_gap < linger ? _gap : linger);
        }
        const _overLinger = now > _lingerDeadline;
        // Arp-persisted notes past their time bypass the early exit so the board projection
        // (fretboard ghost + fret labels) keeps rendering until arpBounds.end. The gem/sustain
        // blocks are gated by arpGhostOnlyMode.
        const arpGhostShouldRun = arpBounds != null
            && (arpBounds.start - now) < 0.6   // same as PROJ_WIN
            && now <= arpBounds.end + 0.05;
        const arpGhostOnlyMode = arpGhostShouldRun
            && _overLinger && (!hasSus || now > susEnd);
        // Smart cull: keep the gem alive only if a note-state verdict is available to display.
        // Probe result cached in noteDetectProbed/noteDetectProbedState so the later
        // getNoteState query reuses it (avoids two provider calls). arpGhostShouldRun takes
        // precedence — arp ghosts stay alive regardless of verdict state.
        let noteDetectProbed = false;
        let noteDetectProbedState = null;
        if (_overLinger && (!hasSus || now > susEnd) && !arpGhostShouldRun) {
            // Prune the sustain-verdict latch before any cull-path return — the matching
            // delete in the sustain-render block only runs when the note isn't culled, so
            // without this a sustained note crossing susEnd the same frame _overLinger goes
            // true would leak its latch entry until teardown/seek. !hasSus notes never wrote
            // to the latch, so delete is a harmless no-op there.
            if (hasSus) _susVerdictLatch.delete(Math.round(n.t * 1e4) * 10 + n.s);
            if (!noteDetectHasProvider || dt < -NOTEDETECT_GEM_VERDICT_WINDOW) return;
            let noteDetectProbe = null;
            try { noteDetectProbe = noteDetectGetState(n, n.t); } catch (e) { noteDetectProbe = null; }
            noteDetectProbed = true;
            noteDetectProbedState = noteDetectProbe;
            const _probeSt = (noteDetectProbe && typeof noteDetectProbe === 'object') ? noteDetectProbe.state : noteDetectProbe;
            if (_probeSt !== 'hit' && _probeSt !== 'active' && _probeSt !== 'miss') return;
        }

        const sustained = dt < 0 && hasSus && now <= susEnd;
        const hitDist = Math.abs(dt);
        const hit = hitDist < 0.15 || sustained || (noteDetectHasProvider && dt < 0);
        const hitFade = sustained ? 0.7 : (hitDist < 0.15 ? 1 - hitDist / 0.15 : 0);
        // skipBody (slide-target gem suppression) only applies to this note's own pre-hit
        // approach — it exists so the destination's approaching gem doesn't duplicate the
        // source note's gem, already sliding toward this fret. Once hit, the gem renders
        // normally so a chained slide keeps following.
        const effSkipBody = skipBody && dt > 0;
        const hasTechniqueVibrato = noteHasVibrato(n);
        const techniqueYNow = sustained ? techniqueYOffsetWorld(n, now, frame) : 0;
        const noteZ = sustained ? 0 : Math.min(0, dZ(dt));
        // Per-note Z-based renderOrder: far notes render first (get overdrawn by close
        // geometry), close notes render last (appear on top). RENDER_ORDER_LAYER_STACK
        // decides the local stack for outline, core, technique symbols, and fret labels.
        const xBase = n.f === 0 ? (openX !== undefined ? openX : curX) : xFretMid(n.f);
        // Slide-in-progress: glide the gem (and everything anchored to it — outline, core,
        // halo, technique markers) from its starting fret toward the slide's end fret over
        // the sustain, the same way techniqueYOffsetWorld offsets the gem in Y for bends.
        const slideSt = slideTrailEnd(n);
        // Once hit, keep gliding (and then holding at the end fret) for as long as the gem
        // stays on screen — not just while `sustained` (now <= susEnd) — or the gem would snap
        // back to its starting fret during the brief post-sustain linger tail.
        // slideOffsetWorldX's `p` clamps to 1 once now > susEnd, so this naturally holds at
        // the slide's end position during that tail.
        const slideXNow = (dt < 0 && hasSus && slideSt)
            ? (_leftyCached ? -1 : 1) * slideOffsetWorldX(n, now, slideSt)
            : 0;
        const x = xBase + slideXNow;
        const isHarm = n.hm || n.hp;

        // Open chord notes: wide default mesh is capped to chord frame width.
        const OPEN_NOTE_WORLD_W = 40 * K;
        let openWScale = 1;
        if (n.f === 0 && openChordBoxWidth != null && openChordBoxWidth > 1e-8) {
            openWScale = Math.max(0.22, (openChordBoxWidth * 0.96) / OPEN_NOTE_WORLD_W);
        }

        // Hoisted so both !skipBody blocks (gem and technique labels) and the unconditional
        // sustain trail share one declaration. Safe no-ops when skipBody=true (slide targets).
        const openSlabThickMul = n.f === 0 ? 1.5 : 1;
        const approachRot = n.f > 0 ? Math.max(0, Math.min(1, dt / AHEAD)) * Math.PI / 2 : 0;
        // Ghost preview window capped to the gap from the previous note on this string, so
        // dense passages don't show the preview 0.6s ahead with no visible gem. Minimum 0.05s
        // so the ghost isn't fully suppressed in very tight passages.
        const _rawGap = n.t - prevOnsetT;
        const effectiveProjWin = _rawGap > 0 ? Math.min(0.6, Math.max(0.05, _rawGap)) : 0.6;
        const projFactorG = Math.max(0, Math.min(1, 1 - Math.max(dt, 0) / effectiveProjWin));
        const inGhostWin = n.f > 0 && isNextOnString && dt > -ghostHold && dt < effectiveProjWin && projFactorG > 0.001;
        // Query the provider once per note, before both !skipBody blocks, so _showHit can be
        // a const and noteDetectGood is available for the sustain trail (which renders even
        // when skipBody=true for slide targets).
        let noteDetectGood = false;    // true when provider confirms hit/active
        let _hitPunch = 1;      // per-gem scale-punch on a fresh hit
        let noteDetectState = null;    // 'hit'|'active'|'miss'|null; null → fall back to proximity heuristic
        let noteDetectChordState = null;       // raw provider response — truthy when provider returned a verdict
        let noteDetectChordStateIsObj = false; // typeof noteDetectChordState === 'object'
        let noteDetectFaceMat = null;  // [mat×4, transparent×2] array for lateral face fill, or null
        if (noteDetectGetState) {
            // Reuse the smart-cull probe result if already called above; otherwise probe now.
            let _raw = null;
            if (noteDetectProbed) {
                _raw = noteDetectProbedState;
            } else {
                try { _raw = noteDetectGetState(n, n.t); } catch (e) { _raw = null; }
            }
            if (_raw) {
                noteDetectChordStateIsObj = typeof _raw === 'object';
                const _st = noteDetectChordStateIsObj ? _raw.state : _raw;
                if (_st === 'miss') {
                    noteDetectState = 'miss';
                    noteDetectChordState = _raw;
                } else if (_st === 'hit' || _st === 'active') {
                    noteDetectState = _st;
                    noteDetectGood = true;
                    noteDetectChordState = _raw;
                }
            }
        }

        // Feed the provider alpha into the per-frame max so update()'s top scales the
        // verdict-glow brightness by live level (note_detect returns alpha = live input level
        // for held sustains, and a time-fade for fresh strikes). Only object responses carry
        // an alpha; latch/legacy string responses leave brightness at full.
        if (noteDetectGood && noteDetectChordStateIsObj && noteDetectChordState && typeof noteDetectChordState.alpha === 'number') {
            noteVerdictState.sawAlpha = true;
            if (noteDetectChordState.alpha > noteVerdictState.maxAlpha) noteVerdictState.maxAlpha = noteDetectChordState.alpha;
        }

        // ── Sustain verdict latch ────────────────────────────────────
        // note_detect's hitGlowDuration (~0.5s) and the legacy mark TTL (500ms) both expire
        // before a long chart sustain ends. For any sustained note, latch the verdict from
        // either source (provider or legacy noteDetectHitMarks/MissMarks) and re-inject it so
        // hit/miss color persists for the full hold — works with both the modern provider path
        // and the legacy event path.
        if (hasSus) {
            const _sk = Math.round(n.t * 1e4) * 10 + n.s;
            // Resolve current verdict: provider takes priority, else scan the legacy mark
            // arrays so a hit/miss event that arrived this frame can seed the latch.
            let _lv_cur = noteDetectState;
            let _lv_good = noteDetectGood;
            if (!_lv_cur) {
                for (let _mi = 0; _mi < noteDetectHitMarks.length; _mi++) {
                    const _mm = noteDetectHitMarks[_mi];
                    if (_mm.s === n.s && _mm.f === n.f && Math.abs(_mm.noteTime - n.t) < NOTEDETECT_TIME_EPS) {
                        _lv_cur = 'hit'; _lv_good = true; break;
                    }
                }
                if (!_lv_cur) {
                    for (let _mi = 0; _mi < noteDetectMissMarks.length; _mi++) {
                        const _mm = noteDetectMissMarks[_mi];
                        if (_mm.s === n.s && _mm.f === n.f && Math.abs(_mm.noteTime - n.t) < NOTEDETECT_TIME_EPS) {
                            _lv_cur = 'miss'; _lv_good = false; break;
                        }
                    }
                }
            }
            if (_lv_cur) {
                // Fresh verdict (provider or legacy mark) — save to latch. Distinguish a live
                // provider hit (note_detect tags ring-tracking 'active' responses with
                // live:true) from a legacy/brief one: a live hit must NOT be re-injected once
                // the provider goes silent (that kept muted sustains lit), whereas the legacy
                // event path still needs the latch to bridge its ~0.5s mark TTL across a hold.
                const _live = noteDetectChordStateIsObj && noteDetectChordState && noteDetectChordState.live === true;
                _susVerdictLatch.set(_sk, _lv_good ? (_live ? 'hit-live' : 'hit') : 'miss');
                // If the verdict came from a legacy mark (provider was silent), propagate it
                // to noteDetectState/Good/ChordState now so the sustain trail picks up the
                // same colour this frame instead of waiting until the mark expires.
                if (!noteDetectState) {
                    if (_lv_good) {
                        noteDetectState = 'active'; noteDetectGood = true;
                        noteDetectChordState = 'active'; noteDetectChordStateIsObj = false;
                    } else {
                        noteDetectState = 'miss';
                        noteDetectChordState = 'miss'; noteDetectChordStateIsObj = false;
                    }
                }
            } else if (dt < 0 && now < susEnd) {
                // No current verdict — reuse latch if available. dt < 0 guards against
                // coloring notes that haven't crossed the hit line yet (approaching notes must
                // never inherit a latch from a previous play-through).
                const _lv = _susVerdictLatch.get(_sk);
                if (_lv === 'hit') {
                    // Legacy/brief provider or event-path hit: bridge the gap across the hold
                    // (the mark/glow TTL expires before a long chart sustain ends).
                    noteDetectState = 'active'; noteDetectGood = true;
                    noteDetectChordState = 'active'; noteDetectChordStateIsObj = false;
                } else if (_lv === 'hit-live') {
                    // Live provider is authoritative for the active glow: returns 'active'
                    // only while the string is actually ringing, null once muted/decayed.
                    // Don't re-inject a stale 'active' — leave the gem un-lit when the
                    // provider is silent; a re-strike relights it via the provider next frame.
                } else if (_lv === 'miss') {
                    noteDetectState = 'miss';
                    noteDetectChordState = 'miss'; noteDetectChordStateIsObj = false;
                }
            }
            if (now >= susEnd) _susVerdictLatch.delete(_sk);
        }

        const _showHit = (noteDetectState === 'miss') ? false
            : (noteDetectState ? noteDetectGood
            : (hit || (n.f > 0 && inGhostWin)));

        // ── Fret-wire hit flash ───────────────────────────────────────
        // A confirmed note lights the wires that bracket it:
        //   single, fretted (f > 0) → the wire behind it (f-1) and the wire it's pressed against (f).
        //   open (f = 0)  → the outer wires of the anchor lane — the open slab (see xBase /
        //           openNoteLaneBoxW) sits exactly between them, the same relationship a
        //           fretted note has to its own two wires.
        //   chord   → only the outermost wires of the whole shape. drawNote() is the chord
        //           loop's per-note call and can't see the span from here, so chord hits
        //           accumulate into _fwChordAcc and the flash pass resolves min/max fret →
        //           outer wires once the loop has finished.
        // Gated on noteDetectGood, not _showHit: only a scorer's verdict counts, never the
        // proximity heuristic that merely means "near the line".
        if (noteDetectGood) {
            const _fwA = (noteDetectChordStateIsObj && noteDetectChordState && typeof noteDetectChordState.alpha === 'number')
                ? Math.max(0, Math.min(1, noteDetectChordState.alpha))
                : 1;
            if (fromChord) {
                // ch.id can be absent (pitfall #8) — fall back to the chord's time, which is
                // what n.t already carries for a chord note.
                const _fwK = (chordId !== undefined && chordId !== null) ? chordId : `t${n.t}`;
                let _fwE = _fwChordAcc.get(_fwK);
                if (!_fwE) {
                    _fwE = { minF: Infinity, maxF: -Infinity, a: 0, openA: 0, t: n.t };
                    _fwChordAcc.set(_fwK, _fwE);
                }
                if (n.f > 0 && n.f <= NFRETS) {
                    if (_fwA > _fwE.a) _fwE.a = _fwA;
                    if (n.f < _fwE.minF) _fwE.minF = n.f;
                    if (n.f > _fwE.maxF) _fwE.maxF = n.f;
                } else if (n.f === 0 && _fwA > _fwE.openA) {
                    _fwE.openA = _fwA;   // open strings in the chord → lane edges
                }
            } else if (n.f > 0 && n.f <= NFRETS) {
                if (_fwA > _fwHitIn[n.f - 1]) _fwHitIn[n.f - 1] = _fwA;
                if (_fwA > _fwHitIn[n.f]) _fwHitIn[n.f] = _fwA;
            } else if (n.f === 0) {
                // Sampled at the note's own time, matching how the open slab's width is
                // derived (openNoteLaneBoxW(n.t)) so the flashed wires are the ones the slab
                // is actually drawn between, even if the lane has since moved.
                const _fwB = anchorLaneBoundsAt(_drawAnchors, n.t);
                if (_fwB) {
                    if (_fwA > _fwHitIn[_fwB.dMin]) _fwHitIn[_fwB.dMin] = _fwA;
                    if (_fwA > _fwHitIn[_fwB.dMax]) _fwHitIn[_fwB.dMax] = _fwA;
                }
            }
        }

        if (!effSkipBody && !arpGhostOnlyMode && !_overLinger) {

            // ── Outline (slightly larger, bright emissive) ────────────
            // Notedetect feedback (issue #9): if a recent hit/miss event matches this note's
            // (s, f, t), swap the outline tint. Linear scan over a small bounded array
            // (typical queues 0-5 entries, expired marks pruned by the listener). Hit takes
            // precedence over miss so the user sees the more positive feedback if both happen.
            let noteDetectOutline = (n.f > 0 && mStrHitOutline[s]) ? mStrHitOutline[s] : mWhiteOutline;
            // update() prunes expired marks once per frame and caches performance.now() in
            // noteDetectFrameNowMs, so the hot path here just does the bounded match — every
            // entry already has expiresAt > noteDetectFrameNowMs.
            let noteDetectMatchedMark = null;
            let noteDetectHadHitMark = false;
            if (noteDetectHitMarks.length) {
                for (let i = 0; i < noteDetectHitMarks.length; i++) {
                    const m = noteDetectHitMarks[i];
                    if (m.s === n.s && m.f === n.f && Math.abs(m.noteTime - n.t) < NOTEDETECT_TIME_EPS) {
                        noteDetectOutline = mHitBright[s] ?? mGlow[s]; noteDetectFaceMat = mHitBrightArrays[s] ?? null; noteDetectMatchedMark = m; noteDetectHadHitMark = true; break;
                    }
                }
            }
            if (!noteDetectHadHitMark && noteDetectMissMarks.length) {
                for (let i = 0; i < noteDetectMissMarks.length; i++) {
                    const m = noteDetectMissMarks[i];
                    if (m.s === n.s && m.f === n.f && Math.abs(m.noteTime - n.t) < NOTEDETECT_TIME_EPS) {
                        noteDetectOutline = mMissOutline; noteDetectFaceMat = mMissEdgeArrays; noteDetectMatchedMark = m; break;
                    }
                }
            }
            if (noteDetectMatchedMark && noteDetectMatchedMark.labels && noteDetectMatchedMark.labels.length) {
                noteDetectLabels.push({
                    x,
                    y: y + NH * 1.7,
                    z: noteZ + 0.02,
                    labels: noteDetectMatchedMark.labels,
                });
            }
            // (approachRot / PROJ_WIN_G / projFactorG / inGhostWin hoisted above)

            const rimXY = n.ac ? ACCENT_RIM_XY_SCALE_MUL : 1;
            const rimZ = n.ac ? ACCENT_RIM_Z_SCALE_MUL : 1;

            // Apply outline + lateral face-fill overrides from provider verdict (feedBack#254):
            // hit/active → green outline (mHitBright[s]) + green lateral faces; miss →
            // magenta-red outline (mMissOutline) + dark lateral faces; front/back stay transparent.
            if (noteDetectChordState) {
                const _vAlpha = (noteDetectChordStateIsObj && typeof noteDetectChordState.alpha === 'number') ? noteDetectChordState.alpha : 1;
                if (noteDetectState === 'miss') {
                    noteDetectOutline = mMissOutline;
                    noteDetectFaceMat = mMissEdgeArrays;
                    noteVerdictState.streakHits = 0;            // break the streak (heat eases down)
                    if (_verdictMarks) noteDetectLabels.push({ x, y: y + NH * 1.7, z: noteZ + 0.02, labels: [{ text: '✗', color: '#ff5a7a' }] });
                } else if (noteDetectGood) {
                    // Rim flashes in the string's own colour, wire-fashion (intensity applied
                    // per string in the flash pass).
                    noteDetectOutline = mRimFlash[s] ?? mHitBright[s] ?? mGlow[s];
                    noteDetectFaceMat = mHitBrightArrays[s] ?? null;
                    // Clamp like the wire path does — a provider returning alpha > 1 must not
                    // over-drive emissiveIntensity.
                    const _rimA = Math.max(0, Math.min(1, _vAlpha));
                    if (_rimA > _rimFlashIn[s]) _rimFlashIn[s] = _rimA;
                    _hitPunch = 1 + 0.22 * _hitFx * _vAlpha;   // scale-punch (biggest at strike, eases)
                    if (_verdictMarks) { const _tc = _timingHex(noteDetectMatchedMark && noteDetectMatchedMark.timingState, frame); noteDetectLabels.push({ x, y: y + NH * 1.7, z: noteZ + 0.02, labels: [{ text: '✓', color: '#' + _tc.toString(16).padStart(6, '0') }] }); }
                    if (_sparks && _hitFx > 0 && _vAlpha > 0.5) {
                        const _spk = s + '|' + n.f + '|' + n.t.toFixed(2);
                        if (!(_sparkSeen.get(_spk) > now)) {
                            _sparkSeen.set(_spk, now + 1.0);
                            if (_sparkSeen.size > 600) _sparkSeen.clear();
                            noteVerdictState.streakHits++;
                            const _heatMul = _streakFx ? (1 + 0.85 * _streakHeat) : 1;   // escalate
                            _sparkBurst(x, y, noteZ, _timingHex(noteDetectMatchedMark && noteDetectMatchedMark.timingState, frame), Math.round((4 + 7 * _hitFx) * _heatMul));
                        }
                    }
                }
            }

            // Score pop: the first frame a gem's verdict carries points (notedetect >=1.13
            // object verdicts), float a "+N" above it. popKey dedupes — chord members all hand
            // back the chord-level key, so a chord pops once, not once per gem; the _fxSeen
            // TTL also stops a sustain's long-lived verdict from re-popping every frame.
            if (noteDetectGood && noteDetectChordStateIsObj
                    && noteDetectChordState.points !== undefined && noteDetectChordState.popKey != null) {
                _fxSpawnPop(noteDetectChordState.popKey, noteDetectChordState.points, noteDetectChordState.mult,
                    x, y + NH * 2.2, noteZ + 0.02);
            }

            // Accent: soft neon outer glow (three additive shells behind outline/core, colour =
            // string hue). Suppressed on a provider miss verdict — a bright accent halo around
            // a missed gem muddies the dark-core-plus-red-rim fail signal, matching the same
            // miss-over-accent priority the gem core material applies below.
            if (n.ac && noteDetectState !== 'miss' && mAccentHaloNear[s]) {
                const rZ = approachRot;
                const accentShells = _accentShellsByString[s];
                for (let hi = 0; hi < accentShells.length; hi++) {
                    const sh = accentShells[hi];
                    const glow = pAccentHalo.get();
                    glow.material = sh.mat;
                    glow.rotation.z = rZ;
                    glow.position.set(x, y + techniqueYNow, noteZ - sh.zK * K);
                    if (n.f === 0) {
                        // Inside a chord/arpeggio frame: bloom only vertically so the halo
                        // doesn't burst past the box edges horizontally. Outside a frame:
                        // modest horizontal cap (1.4x) so it doesn't overflow adjacent lanes.
                        const openIxy = fromChord ? 1.0 : Math.min(sh.ixy, 1.4);
                        const slabPuff = Math.max(1.4, sh.ixy);
                        glow.scale.set(
                            (40 * K / NW) * rimXY * openIxy * openWScale,
                            0.1 * openSlabThickMul * slabPuff,
                            0.6 * rimZ * sh.iz,
                        );
                    } else {
                        glow.scale.set(rimXY * sh.ixy, rimXY * sh.ixy, 2.5 * rimZ * sh.iz);
                    }
                }
            }
            const outline = pNote.get();
            // Verdict beats accent on the outline so hit/miss feedback isn't hidden by
            // mAccentOutline — mirrors the miss-over-accent priority above.
            const noteDetectVerdict = (noteDetectChordState && (noteDetectState === 'miss' || noteDetectGood))
                || !!noteDetectMatchedMark;
            outline.material = (n.ac && !noteDetectVerdict) ? mAccentOutline[s] : noteDetectOutline;
            // outline + core share the pNote pool, so set geometry explicitly each frame (a
            // recycled mesh may carry a gradient geometry from a prior core use).
            outline.geometry = gNote;
            outline.renderOrder = renderOrderForLayerAtZ(noteZ, 'NOTE_OUTLINE');
            outline.position.set(x, y + techniqueYNow, noteZ);
            outline.rotation.z = approachRot;
            const ndRim = 1.1;
            if (n.f === 0) {
                outline.scale.set(
                    (35 * K / NW) * ndRim * rimXY * openWScale,
                    0.1 * ndRim * openSlabThickMul,
                    0.6 * ndRim * rimZ,
                );
            } else {
                outline.scale.set(ndRim * rimXY, ndRim * rimXY, 2.8 * rimZ);
            }

            // ── Lateral face fill (top / bottom / left / right only) ─────
            // Material array: groups 0-3 (±X ±Y) get the verdict colour; groups 4-5 (+Z front /
            // -Z back) are transparent so the front face shows only the core body's string colour.
            if (noteDetectFaceMat) {
                const edges = pNoteEdge.get();
                edges.material = noteDetectFaceMat;
                edges.renderOrder = renderOrderForLayerAtZ(noteZ, 'TECHNIQUE_MARKER');
                edges.position.set(x, y + techniqueYNow, noteZ + 0.001);
                edges.rotation.z = approachRot;
                if (n.f === 0) {
                    edges.scale.set(
                        (40 * K / NW) * rimXY * openWScale * 1.02,
                        0.1 * openSlabThickMul * 1.02,
                        0.6 * rimZ * 1.02,
                    );
                } else {
                    edges.scale.set(rimXY * 1.02, rimXY * 1.02, 2.5 * rimZ * 1.02);
                }
            }

            // ── Core (filled note body) ───────────────────────────────
            const core = pNote.get();
            // Body always keeps the string colour; verdict feedback is carried by the outline
            // shell and lateral face fill.
            core.material = n.ac ? mAccentCore[s] : mStr[s];
            // Gradient gem body for strings 0..5; flat box otherwise.
            core.geometry = (!n.ac && gNoteGrad[s]) ? gNoteGrad[s] : gNote;
            core.renderOrder = renderOrderForLayerAtZ(noteZ, 'NOTE_CORE');
            core.position.set(x, y + techniqueYNow, noteZ + 0.001);
            core.rotation.z = approachRot;
            if (n.f === 0) {
                core.scale.set(
                    (40 * K / NW) * rimXY * openWScale,
                    0.1 * openSlabThickMul,
                    0.6 * rimZ,
                );
            } else {
                core.scale.set(rimXY, rimXY, 2.5 * rimZ);
            }
            if (_hitPunch !== 1) core.scale.multiplyScalar(_hitPunch);   // hit scale-punch
            // Fret digits on fretted (n.f > 0) flying notes deliberately omitted — the
            // showFretOnNote setting promises digits on the fretboard ghost only, at
            // pGhostFretLbl below, never on the gems coming down the highway.
        } // end gem block — technique labels reopen !skipBody below

        // ── Sustain trail ─────────────────────────────────────────────
        // Rendered for ALL notes with sustain, including skipBody=true slide-target notes
        // (e.g. linkNext hold->slide: gem suppressed, slide trail stays visible as the
        // continuation of the sustain). noteDetectGetState is queried for every note, so the
        // trail picks bright mGlow[s] when the provider confirms hit/active and dim mSus[s]
        // otherwise — a slide-target trail is not forced dim.
        // Chord-member open strings (fromChord && f === 0) skip the sustain trail entirely —
        // fretted constituents already carry the chord's sustains; the note BODY still draws above.
        if (hasSus && !_overLinger && !(fromChord && n.f === 0)) {
                const susStart = Math.max(n.t, now);
                const remSus = susEnd - susStart;
                if (remSus > 0.01) {
                    const sliceDur = Math.min(remSus, AHEAD);
                    let tw = NW * 0.85 * (n.f === 0 ? openWScale : 1);
                    let th = NH * 0.12 * (n.f === 0 ? openWScale : 1) * openSlabThickMul;
                    if (susTrailMatchArpFrame) {
                        const yA = sY(0), yB = sY(nStr - 1);
                        const yMinF = Math.min(yA, yB) - S_GAP * 0.8;
                        const yMaxF = Math.max(yA, yB) + S_GAP * 0.8;
                        const fullChordBoxH = yMaxF - yMinF;
                        const ft = Math.max(CHORD_FRAME_RIM_MIN * K, fullChordBoxH * CHORD_FRAME_RIM_FRAC_H);
                        const ftSide = ft * 1.55;
                        if (n.f > 0) {
                            th = ftSide;
                        } else {
                            th = Math.max(th, ftSide * openSlabThickMul);
                        }
                        tw = Math.max(tw, ftSide * 1.05);
                    }
                    // Standalone open strings get two parallel trails offset along X, echoing
                    // the wide flat open-note body; fretted notes keep the single-trail path.
                    // Offsets scale by openWScale (clamped >= 0.22) so the trails stay under
                    // the body's edges regardless of anchor lane width; chord-member open
                    // strings can't reach here (guarded at the hasSus check above).
                    const offsets = (n.f === 0)
                        ? [-(NW * 3 * openWScale), NW * 3 * openWScale]
                        : SINGLE_SUS_OFFSETS;
                    const ribbonSusTrail = !!(
                        (slideSt && n.f > 0 && (n.sus || 0) > 1e-4)
                        || (Number(n.bn) > 0)
                        || (Array.isArray(n.bnv) && n.bnv.length > 0)
                        || n.tr
                        || hasTechniqueVibrato
                    );
                    // Outline material for the sustain trail border — same materials as the
                    // gem border so hit/miss colours are perceptually identical across gem
                    // outline, lateral faces, and sustain trail rim.
                    const _susOlMat = noteDetectState === 'miss' ? mMissOutline
                        : noteDetectGood ? (mHitBright[s] ?? mHitSusOutline)
                        : mSusOutline;
                    const emitSusStrip = (xCenter, segLen, zCenter) => {
                        // Same depth-bucket scheme as chord frames, using the ordered
                        // sustain-trail layer so same-depth frames win while closer trail
                        // segments still beat farther frames.
                        const trailRenderOrder = renderOrderForLayerAtZ(Math.min(0, zCenter), 'SUSTAIN_TRAIL');
                        for (let i = 0; i < offsets.length; i++) {
                            const xOff = xCenter + offsets[i];
                            const trOut = pSusOutline.get();
                            trOut.material = _susOlMat;
                            trOut.renderOrder = trailRenderOrder;
                            trOut.position.set(xOff, y, zCenter);
                            trOut.scale.set(tw + 0.4 * K, th + 0.4 * K, segLen);
                            const tr = pSus.get();
                            tr.material = noteDetectState ? mGlow[s] : mSus[s];
                            tr.renderOrder = trailRenderOrder + 0.0005;
                            tr.position.set(xOff, y, zCenter);
                            tr.scale.set(tw, th, segLen);
                        }
                    };
                    if (!ribbonSusTrail) {
                        const len = sliceDur * TS;
                        const zPos = dZ(susStart - now) - len / 2;
                        emitSusStrip(x, len, zPos);
                    } else {
                        // Same depth-based renderOrder as box trail — ribbon center at
                        // susStart + sliceDur/2, using TS so it matches dZ().
                        const _ribDt = Math.max(0, susStart + sliceDur / 2 - now);
                        const ribbonRenderOrder = renderOrderForLayerAtZ(-_ribDt * TS, 'SUSTAIN_TRAIL');
                        for (let si = 0; si < offsets.length; si++) {
                            const strandX = xBase + offsets[si];
                            const olMesh = pSusRibbonOl.get();
                            olMesh.renderOrder = ribbonRenderOrder;
                            olMesh.scale.set(1, 1, 1);
                            olMesh.rotation.set(0, 0, 0);
                            olMesh.position.set(0, 0, 0);
                            olMesh.material = _susOlMat;
                            slideRibbonUpdatePositions(
                                olMesh.geometry, strandX,
                                tw + 0.4 * K, th + 0.4 * K,
                                y, sliceDur, susStart, now, n, slideSt, frame,
                            );
                            const body = pSusRibbon.get();
                            body.renderOrder = ribbonRenderOrder + 0.0005;
                            body.scale.set(1, 1, 1);
                            body.rotation.set(0, 0, 0);
                            body.position.set(0, 0, 0);
                            body.material = noteDetectState ? mGlow[s] : mSus[s];
                            slideRibbonUpdatePositions(
                                body.geometry, strandX, tw, th, y,
                                sliceDur, susStart, now, n, slideSt, frame,
                            );
                        }
                    }
                }
        }

        // Shared by both slide-arrow blocks so the neck-preview arrow below can match the
        // on-note arrow's size once the note arrives (also read by the technique-labels block for its own scaling).
        const LBL_MULT = 1.6;
        // Fade-in window for the neck-preview slide arrow below.
        const GHOST_UPCOMING_WIN = 0.6;

        // ── Slide direction arrow (neck preview) ─────────────────────
        // A standalone preview of the same arrow, sitting flat on the neck (Z=0) at the note's
        // resting fret. Full size from the moment it appears, linear fade-in over the same
        // GHOST_UPCOMING_WIN window the board-projection ghost note uses. Stops at dt <= 0,
        // handing off to the on-note arrow.
        // Placed outside the !effSkipBody block (unlike the on-note arrow above) so a note
        // whose own gem is suppressed (slide destination) can still preview its own outgoing
        // slide ahead of time — i.e. chained slides — when slideArrowChainPreviewVisible is on.
        if (slideArrowNeckVisible && dt > 0 && slideSt && validString(s) && !arpGhostOnlyMode && !_overLinger
            && (!skipBody || slideArrowChainPreviewVisible)) {
            const slideDirN = Math.sign(fretMid(slideSt.endFret) - fretMid(n.f)) * (_leftyCached ? -1 : 1);
            if (slideDirN !== 0) {
                const neckAlpha = Math.max(0, Math.min(1, 1 - dt / GHOST_UPCOMING_WIN));
                if (neckAlpha > 0.001) {
                    const arrowHexN = darkenHex(activePalette[s], 0.55);
                    const arrowSmN = techMaterials.slideArrowMat(slideDirN > 0, arrowHexN);
                    const arrowN = pTechPlane.get();
                    arrowN.material = _spriteMat2MeshMat(arrowN, arrowSmN);
                    const arrowScaleN = NH * 1.1 * LBL_MULT * _textSizeMul;
                    arrowN.scale.set(arrowScaleN, arrowScaleN, 1);
                    arrowN.position.set(x + slideDirN * NW * 1.15, y, 0);
                    arrowN.rotation.z = 0;
                    arrowN.renderOrder = renderOrderForLayerAtZ(0, 'TECHNIQUE_MARKER');
                    arrowN.material.opacity = neckAlpha;
                }
            }
        }

        if (!effSkipBody && !arpGhostOnlyMode && !_overLinger) {
            // ── Technique labels ──────────────────────────────────────
            // Label scale = base x LBL_MULT x distFactor. distFactor compensates for
            // perspective shrink so a label far from the camera (note approaching at dt~AHEAD)
            // doesn't collapse to a single dim pixel; LBL_MULT bumps every base scale uniformly.
            //
            // Offsets scale with sLbl too, growing in world units to compensate for
            // perspective — otherwise stacked labels would overlap and the first label would
            // overlap the note at the AHEAD edge. In screen space the offset stays roughly
            // constant, so labels appear anchored to the note.
            const distFactor = 1 + Math.max(0, Math.min(1, dt / AHEAD)) * 1.5;
            // Folds the user's text-size multiplier into sLbl so technique labels (bend,
            // H/P/T arrows, tremolo) plus on-body markers (palm mute, pinch-harmonic icon)
            // all scale alongside the rest.
            const sLbl = LBL_MULT * distFactor * _textSizeMul;
            // textSprites.txtMat(..., 'technique') disables depthTest; without a high
            // renderOrder the transparent note core (mStr) can still paint afterward and hide
            // H/P/T, PM X, bends, etc.
            const techniqueMarkerRenderOrder = renderOrderForLayerAtZ(noteZ, 'TECHNIQUE_MARKER');
            let yo = y + techniqueYNow + NH * 0.8 * sLbl;
            const specialMarkerScale = n.f === 0
                ? NH * 1.5 * sLbl * openWScale
                : NH * 1.5 * sLbl;
            // ── Slide direction arrow (on the note/gem) ─────────────────
            // A small ›/‹ chevron beside the note pointing toward the slide's destination
            // fret. Visible for the note's whole time on screen at constant full opacity, no fade or grow.
            if (slideArrowApproachVisible && slideSt && validString(s)) {
                const slideDir = Math.sign(fretMid(slideSt.endFret) - fretMid(n.f)) * (_leftyCached ? -1 : 1);
                if (slideDir !== 0) {
                    const arrowHex = darkenHex(activePalette[s], 0.55);
                    const arrowSm = techMaterials.slideArrowMat(slideDir > 0, arrowHex);
                    const arrow = pTechPlane.get();
                    arrow.material = _spriteMat2MeshMat(arrow, arrowSm);
                    const arrowScale = NH * 1.1 * sLbl;
                    arrow.scale.set(arrowScale, arrowScale, 1);
                    arrow.position.set(x + slideDir * NW * 1.15, y + techniqueYNow, noteZ + K);
                    // No rotation, ever — the gem itself rotates in (approachRot) as it
                    // approaches, but that would tilt the chevron and make its direction ambiguous.
                    arrow.rotation.z = 0;
                    arrow.renderOrder = techniqueMarkerRenderOrder;
                    arrow.material.opacity = 1;
                }
            }
            // Derive the peak from bn OR the bnv curve — bn SHOULD be the peak whenever bnv
            // exists; this is the robustness fallback for a note carrying an authoritative
            // curve with bn left at 0.
            const _bnvPeak = (Array.isArray(n.bnv) && n.bnv.length)
                ? n.bnv.reduce((m, p) => Math.max(m, Number(p.v) || 0), 0) : 0;
            const _bendPeak = Math.max(Number(n.bn) || 0, _bnvPeak);
            if (_bendPeak > 0) {
                // Bend chevron stack — PlaneGeometry mesh so it tilts with the gem
                // (approachRot). Fixed world size so it perspective-shrinks naturally.
                const steps = Math.max(1, Math.min(4, Math.round(_bendPeak)));
                const bendSm = techMaterials.bendChevronMat(steps, activePalette[s] || 0xffffff);
                const l = pTechPlane.get();
                l.material = _spriteMat2MeshMat(l, bendSm);
                const cs = NH * 2.4;
                l.scale.set(cs, cs, 1);
                l.position.set(x, y + techniqueYNow + NH * 1.1, noteZ + K);
                l.rotation.z = approachRot;
                l.renderOrder = techniqueMarkerRenderOrder;
                yo = Math.max(yo, y + techniqueYNow + NH * 2.5); // reserve stack space above the chevron
            }
            if (n.ho || n.po || n.tp) {
                if (n.ho || n.po) {
                    // Hammer-on / pull-off: ▲/▼ triangle — PlaneGeometry mesh so it tilts with
                    // the gem instead of billboarding.
                    const triSm = techMaterials.triMat(!!n.po, activePalette[s] || 0xffffff);
                    const tri = pTechPlane.get();
                    tri.material = _spriteMat2MeshMat(tri, triSm);
                    tri.scale.set(NH * 1.8, NH * 1.60, 1);
                    tri.position.set(x, y + techniqueYNow, noteZ + K);
                    tri.rotation.z = approachRot;
                    tri.renderOrder = techniqueMarkerRenderOrder;
                    yo = Math.max(yo, y + techniqueYNow + NH * 1.0); // reserve stack space above the triangle
                } else {
                    const chevron = pTapChevron.get();
                    const chevronScale = NH * 0.8 * sLbl;
                    chevron.position.set(x, y + techniqueYNow, noteZ + 1.1 * K);
                    chevron.rotation.z = approachRot;
                    chevron.scale.set(chevronScale, chevronScale, 1);
                    chevron.renderOrder = techniqueMarkerRenderOrder;
                }
            }
            // Tremolo label ('~~~') removed — trail shape already conveys it visually.
            if (n.pm || n.mt || n.fhm) {
                // Muted notes: pool-based plane with per-note Z-proportional renderOrder, so
                // PM/FH markers from far notes can't overdraw chord frames/gems of nearer
                // chords. PM = black X / white border; FH/MT = inverse.
                const _fhm = !!(n.mt || n.fhm);
                const _pmSprite = _fhm ? textSprites.fretHandMuteXSpriteMat() : textSprites.palmMuteXSpriteMat();
                const _pmMark = pTechPlane.get();
                _pmMark.material = _spriteMat2MeshMat(_pmMark, _pmSprite);
                _pmMark.material.opacity = _showHit ? 1.0 : 0.8;
                // Arms cover 62.5% of canvas → scale 1/0.625 = 1.60.
                const _sx = n.f === 0 ? NW * 1.60 * openWScale : NW * 1.60;
                _pmMark.scale.set(_sx, NH * 1.60, 1);
                _pmMark.position.set(x, y + techniqueYNow, noteZ + K);
                _pmMark.rotation.z = approachRot;
                _pmMark.renderOrder = techniqueMarkerRenderOrder;
            }
            // hm / hp — PlaneGeometry overlay sized like the palm-mute X, so the symbol only
            // appears on the front face and matches its proportions.
            if (n.hm || n.hp) {
                const harmSprite = n.hm ? textSprites.naturalHarmonicMat() : textSprites.pinchHarmonicMat(activePalette[s]);
                const harmMark = pTechPlane.get();
                harmMark.material = _spriteMat2MeshMat(harmMark, harmSprite);
                harmMark.material.opacity = _showHit ? 1.0 : 0.85;
                const harmScaleX = n.f === 0 ? NW * 1.90 * openWScale : NW * 1.90;
                harmMark.scale.set(harmScaleX, NH * 2.0, 1);
                harmMark.position.set(x, y + techniqueYNow, noteZ + K);
                harmMark.rotation.z = approachRot;
                harmMark.renderOrder = techniqueMarkerRenderOrder;
            }

            // ── Per-note fret connector label ─────────────────────────
            if (n.f > 0 && !skipLabel) {
                const minStringY = Math.min(sY(0), sY(nStr - 1));
                const labelY = minStringY - S_GAP * 0.8;
                // Fade in over 0.35s at the far end; stay at full opacity until the note hits
                // (dt = 0). No pre-hit fade-out, to avoid the label disappearing before the note arrives.
                const alpha = dt >= 0 ? Math.min(1.0, (AHEAD - dt) / 0.35) : 0;
                // Arpeggio notes use the arpeggio fret-label layer at the same depth so they
                // stay above non-arp connector lines of the same chord.
                const _isArpNote = arpBounds !== null;

                // String-coloured connector line — standalone notes only. Arpeggio and chord
                // notes already have a drop line to the board.
                if (!fromChord) {
                    const line = pConnectorLine.get();
                    line.position.set(x, labelY, noteZ);
                    // Half-length (50% shorter), anchored at the fret-label end.
                    line.scale.set(1, (y - labelY) * 0.5, 1);
                    // Tint the line with the incoming note's string colour. mStr is white for
                    // gradient strings, so use the canonical flat palette colour instead.
                    if (activePalette[s] != null) line.material.color.setHex(activePalette[s]);
                    line.renderOrder = renderOrderForLayerAtZ(noteZ,
                        _isArpNote
                            ? 'ARP_CONNECTOR_LINE'
                            : 'CONNECTOR_LINE'
                    );
                    line.material.opacity = alpha * 0.8;
                }

                // Regular chord notes (fromChord=true, arpBounds=null) never show fret labels
                // — only standalone notes and arpeggio note-stream notes (fromChord=true with
                // arpBounds!=null) show labels. Key uses 40ms buckets (same formula as
                // _buildFretLabelSet) so the lookup matches exactly even with ±20ms time
                // drift. Frame-dedup prevents multiple strings at the same onset/fret from
                // stacking duplicate labels.
                const _flFrameKey = Math.round(n.t * 25) * 100 + n.f;
                const _showNum = (!fromChord || arpBounds !== null)
                    && _fretLabelAllowed.has(_flFrameKey)
                    && !_frameLabeledKeys.has(_flFrameKey);
                if (_showNum) {
                    _frameLabeledKeys.add(_flFrameKey);
                    const fretLabel  = pNoteFretLabel.get();
                    const cachedMat  = textSprites.txtMat(n.f, FRET_LABEL_GOLD_HEX, false, 'noteFret');
                    _setLabelMap(fretLabel, cachedMat);
                    fretLabel.position.set(x, labelY, noteZ);
                    fretLabel.renderOrder = renderOrderForLayerAtZ(noteZ,
                        _isArpNote
                            ? 'ARP_NOTE_FRET_LABEL'
                            : 'NOTE_FRET_LABEL'
                    );
                    // Same scale ramp as fret column markers: 2x base at max lookahead,
                    // converging to 1x at hit line, matching row labels.
                    const flS = 7.0 * K * (1 + 0.4 * Math.max(0, dt) / AHEAD) * _textSizeMul * fretLabelScaleForFret(n.f);
                    fretLabel.scale.set(flS, flS, 1);
                    fretLabel.material.opacity = alpha;
                }

                // Teaching marks (display only, never grading): fret-hand finger (fg) renders
                // by default to the right of the fret label (hideable via the finger-hints
                // toggle); scale degree (sd) is opt-in and renders to the left.
                if (alpha > 0 && n.f > 0) {
                    const _tmS = 5.0 * K * _textSizeMul * fretLabelScaleForFret(n.f);
                    const _drawTeachMark = (text, colorHex, dx, cacheKey) => {
                        if (!text) return;
                        const spr = pTeachMarkLbl.get();
                        const m = textSprites.txtMat(text, colorHex, false, cacheKey);
                        _setLabelMap(spr, m);
                        spr.position.set(x + dx, labelY, noteZ);
                        spr.renderOrder = renderOrderForLayerAtZ(noteZ,
                            _isArpNote ? 'ARP_NOTE_FRET_LABEL' : 'NOTE_FRET_LABEL');
                        spr.scale.set(_tmS, _tmS, 1);
                        spr.material.opacity = alpha;
                    };
                    if (_showFingerHints) {
                        _drawTeachMark(teachingFingerLabel(n.fg), '#7fd1ff', NW * 0.95, 'teachFg');
                    }
                    if (_drawTeachingMarks) {
                        _drawTeachMark(teachingDegreeLabel(n.sd), '#ffcc66', -NW * 0.95, 'teachSd');
                    }
                }
            }
        }

        // ── Fret number for synthetic chord notes rendered with skipBody=true ──
        // suppressSynthChord paths skip the !skipBody block entirely, so their fret label
        // never fires from inside it — handled here, outside the gate, with the same
        // measure-based + frame-dedup rules so a corresponding standalone arpeggio note that
        // already showed a label this frame isn't duplicated.
        if (skipBody && fromChord && !skipLabel && n.f > 0 && dt >= 0) {
            const _fl2FrameKey = Math.round(n.t * 25) * 100 + n.f;
            if (_fretLabelAllowed.has(_fl2FrameKey)
                && !_frameLabeledKeys.has(_fl2FrameKey)) {
                _frameLabeledKeys.add(_fl2FrameKey);
                const _minStrY2 = Math.min(sY(0), sY(nStr - 1));
                const _labelY2  = _minStrY2 - S_GAP * 0.8;
                const _alpha2   = Math.min(1.0, (AHEAD - dt) / 0.35);
                const _isArp2   = arpBounds !== null;
                const fl2 = pNoteFretLabel.get();
                const cm2 = textSprites.txtMat(n.f, FRET_LABEL_GOLD_HEX, false, 'noteFret');
                _setLabelMap(fl2, cm2);
                fl2.position.set(x, _labelY2, noteZ);
                fl2.renderOrder = renderOrderForLayerAtZ(noteZ,
                    _isArp2
                        ? 'ARP_NOTE_FRET_LABEL'
                        : 'NOTE_FRET_LABEL'
                );
                const _flS2 = 7.0 * K * (1 + 0.4 * dt / AHEAD) * _textSizeMul * fretLabelScaleForFret(n.f);
                fl2.scale.set(_flS2, _flS2, 1);
                fl2.material.opacity = _alpha2;
            }
        }

        // ── Drop line for chord / arpeggio notes ──────────────────────────
        // Styled to match the standalone single-note connector: tinted with the incoming
        // note's string colour and 50% length (anchored at the fret-label end), instead of a
        // full-height white line to the board.
        const _wantDropLine = pDropLine && n.f > 0 && dt >= 0 && fromChord && showDropLine && !skipBody;
        if (_wantDropLine) {
            const _minStrY = Math.min(sY(0), sY(nStr - 1));
            const _dropY = _minStrY - S_GAP * 0.8;
            const _alpha = Math.min(1.0, (AHEAD - dt) / 0.35);
            const dl = pDropLine.get();
            dl.position.set(x, _dropY, noteZ);
            // Half-length, anchored at the label end (matches single notes).
            dl.scale.set(1, (y - _dropY) * 0.5, 1);
            // String-colour tint (palette is canonical; mStr is white for gradient strings).
            if (activePalette[s] != null) dl.material.color.setHex(activePalette[s]);
            dl.renderOrder = renderOrderForLayerAtZ(noteZ, 'CONNECTOR_LINE');
            dl.material.depthTest = false;
            dl.material.opacity = _alpha * 0.8;
        }

        // ── Board ghost: filled rim at Z=0 (up to 3 slots/string) ────
        // Lead notes (!fromChord, so !arpGhostActive too) use a fixed GHOST_UPCOMING_WIN
        // pre-impact ramp instead of the gap-capped effectiveProjWin, so fast same-string runs
        // don't pop in at full size right before impact. Chords/arps keep effectiveProjWin.
        // Arp ghosts always use the full 0.6s window — their timing is authored, not gap-driven.
        const _PROJ_WIN_ARP = 0.6;
        const ghostWin = fromChord ? effectiveProjWin : GHOST_UPCOMING_WIN;
        const projFactor = Math.max(0, Math.min(1, 1 - Math.max(dt, 0) / ghostWin));
        // isBlocked suppresses the pre-impact ghost in a note's last 150ms so it doesn't peek
        // out from under the incoming note body. Scoped to chord notes only — for plain lead
        // notes this previously suppressed the board-ghost frame for every sustained note's
        // last 150ms, making it vanish right before impact and reappear during the post-hit
        // linger. Also excludes slide notes (!slideSt): a sliding gem glides off the start
        // fret via slideXNow, so the body no longer covers the ghost and the slide's own
        // preview should show. Gated on dt > 0 so the post-hit linger (dt <= 0) keeps the ghost.
        const isBlocked = fromChord && dt > 0 && dt < 0.15 && n.sus > 0 && !slideSt;

        // For arpeggio notes: ALL notes show their ghost simultaneously the moment the first
        // note enters _PROJ_WIN_ARP — using arpBounds.start as the shared reference makes
        // every note in the arpeggio fade in together, keyed off that single anchor.
        const arpDtToStart = arpBounds != null ? arpBounds.start - now : Infinity;
        const arpProjFactor = Math.max(0, Math.min(1, 1 - Math.max(arpDtToStart, 0) / _PROJ_WIN_ARP));
        const arpGhostActive = arpBounds != null
            && arpDtToStart < _PROJ_WIN_ARP
            && now <= arpBounds.end + 0.05;
        // Ghost stays at final "on the board" orientation — not the incoming approachRot sweep
        // — so it nests with the note at impact. projRim/projScale/bodyDim are pure functions
        // of effSkipBody/_vibrancyProjOp, hoisted here so both the Primary ghost (below) and
        // the Upcoming-slot ghosts (further down) can use them.
        const projRim = 0; // harmonic gems now land horizontal (no diamond offset)
        // _vibrancyProjOp (0.15..0.5) is the vibrancy-scaled idle floor; scale the whole
        // opacity by (_vibrancyProjOp / 0.15) so the slider affects the projection the same
        // way it affects note bodies.
        const projScale = _vibrancyProjOp / 0.15;
        // effSkipBody: a slide-destination note whose own gem is suppressed pre-hit isn't dimmed once hit.
        const bodyDim = effSkipBody ? 0.38 : 1;
        if (n.f > 0 && projectionVisible && (
            (!_overLinger && isNextOnString && dt > -ghostHold && dt < ghostWin && projFactor > 0.001 && !isBlocked)
            || arpGhostActive
        )) {
            const proj = projMeshArr[s][0];
            // Arp ghost: uniform opacity keyed off arpBounds.start so all notes fade in/out
            // together regardless of individual dt values.
            let arpGhostAlpha = 1;
            if (arpGhostActive) {
                const remainingP = arpBounds.end - now;
                const fadeOutP = remainingP < 0.25 ? Math.max(0, remainingP / 0.25) : 1;
                arpGhostAlpha = Math.min(arpProjFactor, fadeOutP);
            }
            // Chart-format-style ghost: a single 0->1 progress value drives both the fade-in
            // (opacity/emissive) and the grow-from-small scale on the frame mesh and
            // fret-digit label — arp ghosts use arpGhostAlpha, non-arp ghosts use projFactor.
            const ghostProgress = arpGhostActive ? arpGhostAlpha : projFactor;
            const projGrowScale = PROJ_GROW_MIN + (1 - PROJ_GROW_MIN) * ghostProgress;
            const rimSolid = arpGhostActive
                ? 0.75 * arpGhostAlpha
                : projFactor * 0.94;
            proj.material.opacity = Math.min(0.96,
                projScale * rimSolid * (0.5 + 0.5 * glowMul) * bodyDim);
            proj.material.emissiveIntensity = arpGhostActive
                ? 0.35 * arpGhostAlpha * glowMul * bodyDim
                : projFactor * 0.55 * glowMul * bodyDim;
            proj.position.set(x, y, 0);
            proj.scale.set(projGrowScale, projGrowScale, projGrowScale);
            proj.rotation.z = projRim;
            proj.visible = true;

            const ghostFretOk = showFretOnNote && (
                arpGhostActive ||
                fretNumberGhostScope === 'all' ||
                (fretNumberGhostScope === 'chords' && fromChord)
            );
            if (ghostFretOk && pGhostFretLbl) {
                // chord-hand style → show finger number (1-4) from the chord template; fall
                // back to fret number when no finger data exists (GP imports, open strings, non-chord notes).
                const ghostFretDisplay = fromChord && fretNumberGhostScope === 'chords'
                    ? (_templateFingerForChordGhost(chordId, n.s, frame) ?? _templateFretForChordGhost(chordId, n.s, n.f, frame))
                    : fromChord
                        ? _templateFretForChordGhost(chordId, n.s, n.f, frame)
                        : n.f;
                let ghostFretLblAlpha = 1;
                if (arpGhostActive) {
                    // Reuse arpGhostAlpha — already encodes fade-in (keyed off
                    // arpBounds.start via arpProjFactor) + fade-out.
                    ghostFretLblAlpha = arpGhostAlpha;
                } else if (ghostPastHold) {
                    const nextSoon = nxFrame != null && nxFrame.t > n.t + 1e-6
                        && (nxFrame.t - now) <= GHOST_FRET_LBL_FADE_S;
                    const ghostFadeS = Math.min(GHOST_FRET_LBL_FADE_S, ghostHold);
                    ghostFretLblAlpha = hwyPostHitTailFadeMul(dt, ghostHold, nextSoon, ghostFadeS);
                } else {
                    // Pre-impact approach: fade the digit in alongside the frame (projFactor),
                    // instead of popping in at full alpha.
                    ghostFretLblAlpha = projFactor;
                }
                const _ghostFretForScale = fromChord && fretNumberGhostScope === 'chords'
                    ? n.f
                    : ghostFretDisplay;
                drawGhostFretLabel(x, y, projRim, ghostFretDisplay, ghostFretLblAlpha, projGrowScale, _ghostFretForScale, frame);
            }
        }

        // ── Upcoming board ghosts (slots 1/2): up to 2 additional, independent pre-impact
        // previews per string for plain lead notes, chart-format-style. Primary (slot 0,
        // above) already shows the very next note on this string; this sibling block shows
        // the 1-2 notes after that, each on its own mesh with its own fixed-GHOST_UPCOMING_WIN
        // ramp — fixes fast same-string runs where every note after the first had almost no
        // ramp time (capped at the gap to the previous note on that string).
        // !nextTAligned excludes exactly the note Primary is already showing, so a note is
        // never drawn in two slots at once.
        if (n.f > 0 && projectionVisible && !fromChord && !nextTAligned
            && dt > 0 && dt < GHOST_UPCOMING_WIN) {
            const slotIdx = 1 + _scrGhostUpcomingCount[s];
            if (slotIdx <= 2) {
                _scrGhostUpcomingCount[s]++;
                // Same formula as Primary's projFactor for !fromChord notes (ghostWin ===
                // GHOST_UPCOMING_WIN there too) — keeps the size/brightness curve continuous
                // as a note's rank improves frame-to-frame (slot 2 -> 1 -> 0).
                const upcomingProgress = projFactor;
                const proj = projMeshArr[s][slotIdx];
                const rimSolid = upcomingProgress * 0.94;
                proj.material.opacity = Math.min(0.96,
                    projScale * rimSolid * (0.5 + 0.5 * glowMul) * bodyDim);
                proj.material.emissiveIntensity = upcomingProgress * 0.55 * glowMul * bodyDim;
                const growScale = PROJ_GROW_MIN + (1 - PROJ_GROW_MIN) * upcomingProgress;
                proj.position.set(x, y, 0);
                proj.scale.set(growScale, growScale, growScale);
                proj.rotation.z = projRim;
                proj.visible = true;

                if (showFretOnNote && fretNumberGhostScope === 'all' && pGhostFretLbl) {
                    drawGhostFretLabel(x, y, projRim, n.f, upcomingProgress, growScale, n.f, frame);
                }
            }
        }
    }

    return { drawNote };
}
