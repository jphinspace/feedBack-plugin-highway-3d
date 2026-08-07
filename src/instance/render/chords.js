import {
    AHEAD, ARPEGGIO_RIM_BLUE_HEX, ARP_FRAME_ONSET_CLUSTER_S, ARP_FRAME_ONSET_PAD_S,
    ARP_INFER_MIN_HAND_SHAPE_SPAN_S, CHORD_BOX_EDGE_ALPHA, CHORD_BOX_HIT_BRIGHT_HEX,
    CHORD_BOX_MISS_DARK_HEX, CHORD_BOX_TEAL_HEX, CHORD_FRAME_RIM_FRAC_H, CHORD_FRAME_RIM_MIN,
    CHORD_FRAME_RIM_Z_MIN, CHORD_FRAME_RIM_Z_SCAL, CHORD_HWY_FADE_S, CHORD_HWY_LINGER_S,
    FRET_LABEL_GOLD_HEX, K, MAX_RENDER_STRINGS, NEXT_ON_STRING_T_EPS, NH, NOTEDETECT_GEM_VERDICT_WINDOW,
    NOTEDETECT_UNMATCHED_LATCH_AFTER, NW, S_GAP,
} from '../../core/constants.js';
import { dZ, fretLabelScaleForFret, fretX } from '../../core/fret-geometry.js';
import { renderOrderForLayerAtZ, hwyPostHitTailFadeMul } from '../../core/render-order.js';
import { chordHarmonyLabels } from '../model/chord-inference.js';

// The chord renderer: chord-frame boxes, sustain rails, arpeggio brackets,
// labels/harmony annotations, barre indicator, and PM/FH strum indicators
// for every visible chord -- moved verbatim out of update()'s single
// `if (chords) { for (...) { ... } }` loop (Stage 7 Track B, 3-ctx-2). This
// is the single largest and most entangled block in the whole file: one
// continuous per-chord loop with ~30 locals computed at the top of each
// iteration (chShape, chordNotes, runSig, isRepeat, chDt, chordCX, ...) and
// consumed by every section below it in the SAME iteration, plus
// loop-carried state comparing EACH chord to the previous one in the same
// pass (runSigPrev, prevChordSig, prevChordTime, prevAnyChordTime -- all
// re-initialised at the top of drawChords() every call, so despite the name
// "prev" this is intra-frame chord-to-chord comparison, not cross-frame
// persistence).
//
// Three dependency shapes, matching the three ways this loop touches
// outside state:
//
// 1. `deps` (createChordRenderer's factory argument, injected once) --
//    pools/materials/caches/functions that are construction-time stable,
//    same as every other extraction this stage. Includes 3 persistent Maps
//    (_chordVerdicts, _noteStreamBracketStrings, _ghostPrevBuf) verified via
//    the whole-file bare-reassignment grep to only be reassigned wholesale
//    in initScene()/teardown() (_chordVerdicts) or not at all
//    (_noteStreamBracketStrings, _ghostPrevBuf) -- safe deps, not `frame`
//    fields, by the same test Phase 3b established.
// 2. `frame` (drawChords's parameter, the SAME `_noteFrame` object
//    update() already builds once per call for noteRenderer.drawNote() --
//    reused rather than duplicated, since several fields overlap exactly
//    (curX, _textSizeMul, nStr, _drawTeachingMarks, noteDetectGetState,
//    noteDetectHasProvider). update() extends `_noteFrame` with the extra
//    fields this loop needs (camT0/camT1/camTau/camHystF/camDistHystF/
//    cameraMode/_leanSus) before calling drawChords, so there is still only
//    ONE frame bag per update() call.
// 3. `accum` -- a small mutable accumulator object for the 6 primitives this
//    loop and the single-notes loop BOTH accumulate into across the same
//    frame (highwayIntensity, camWX, camWSum, camDistMin, camDistMax,
//    camDistGot) and that are read afterward by the camera-target code.
//    Neither `deps` (not construction-stable -- reset every frame) nor
//    `frame` (not read-only -- genuinely written here) fits; same shape as
//    note.js's `noteVerdictState`. update() builds `accum` from the
//    single-notes loop's running totals, passes it in, and reads the
//    mutated properties back into its own closure vars afterward.
//
// `activeFrets` (a Set) and `lastFretForString` (an array) are passed as
// plain per-call parameters -- both are mutated via `.add()`/index-assign
// only (never reassigned), so an object-identity reference is enough; no
// accumulator wrapper needed for either.
//
// `_scrAtMinFretArr`/`_scrAtMinFretLen` (barre-detection scratch) and
// `_scrChordNote` (the drawNote-call scratch object) were previously
// closure-shared with main.js but, on inspection, are referenced ONLY
// inside this loop -- moved to be genuinely private state of this factory
// instead of injected, the same "own it outright" upgrade Phase 1c's caches
// got.
export function createChordRenderer(deps) {
    const {
        pChordBox, pChordFrameFill, pChordLbl, pBarreLine, pArpBracket, pNoteFretLabel,
        pPMXFill, pFHXFill, pMuteXLines, pFHXLines, pHaloBar, pSusRail, pSusRailBloom,
        chordFrameGradTex, chordFrameGradTexArp,
        textSprites, chordInference, noteRenderer,
        validString, filterValidNotes, lowerBoundT, anchorLaneBoundsAt, getChartAnchorAt,
        _firstEventTimeGreaterThan, xFret, xFretMid, sY, _setLabelMap,
        drawArpBrackets, ctx, _encodeChordVerdictKey,
        _chordVerdicts, _noteStreamBracketStrings, _ghostPrevBuf,
    } = deps;

    // Scratch object reused for chord-note drawNote calls so `{ ...cn, t: ch.t }`
    // doesn't allocate a new object per chord note per frame.
    const _scrChordNote = {};
    // Reusable scratch for barre atMinFretStrings computation — avoids the
    // [...chShape].filter().map().sort() chain (3 allocations per chord per frame).
    const _scrAtMinFretArr = new Array(MAX_RENDER_STRINGS).fill(0);
    let _scrAtMinFretLen = 0;

    function drawChords(chords, notes, anchors, bundle, now, t1, ndVerdictT0, activeFrets, lastFretForString, accum, frame) {
        const {
            _textSizeMul, nStr, _drawTeachingMarks, noteDetectGetState, noteDetectHasProvider,
            camT0, camT1, camTau, camHystF, camDistHystF, cameraMode, _leanSus,
        } = frame;
        // Open-string note width: same outer span as chord frame (anchor + padX,
        // or default 4-fret window when chart has no anchor at t). Was a
        // per-frame closure over `anchors` in update() -- rebuilt here as a
        // local (drawChords already receives `anchors` fresh each call, so
        // there's no staleness risk in defining it once per call instead of
        // injecting it).
        const padChordOpenX = NW * 0.4;
        const openNoteLaneBoxW = chartTime => {
            const chAncB = anchorLaneBoundsAt(anchors, chartTime);
            if (chAncB) {
                const xl = fretX(chAncB.dMin);
                const xr = fretX(chAncB.dMax);
                if (xr > xl) return (xr - xl) + padChordOpenX * 2;
            }
            const spanF = 4;
            const fMinCh = 1;
            const fMaxCh = fMinCh + spanF - 1;
            const xl = fretX(fMinCh - 1);
            const xr = fretX(Math.max(fMaxCh, fMinCh + 2));
            if (xr > xl) return (xr - xl) + padChordOpenX * 2;
            return 40 * K;
        };
        if (chords) {
            // Single-pass shape-run tracking: the previous pre-loop scanned
            // every chord (and re-allocated chordInference.chordShapeSignature() per chord)
            // each frame, even though the render loop already iterates the
            // full array. We compute runSig inline once per chord and reuse
            // it for both first-in-run detection and isRepeat below.
            // SHAPE_RUN_GAP_S also resets the run when the time gap from
            // the previous chord exceeds the same 0.5 s window used for
            // isRepeat — a chord shape that re-appears after a real
            // musical gap should re-show its label, not be treated as a
            // continuing run from many bars ago.
            const SHAPE_RUN_GAP_S = 0.5;
            let runSigPrev = null;
            let prevAnyChordTime = -Infinity;
            let prevChordSig = null;
            let prevChordTime = -1;

            // Skip past chords that are too old to render. The per-chord filter
            // (ch.t + _chFilterSus >= ndVerdictT0) passes the earliest chord when
            // ch.t >= ndVerdictT0 - AHEAD (worst case: _chFilterSus = AHEAD for a
            // chord with no explicit sustain). Binary search avoids iterating
            // hundreds of past chords every frame in dense PM/FH sections.
            const _chordsLoIdx = lowerBoundT(chords, ndVerdictT0 - AHEAD);
            // Prime shape-run tracking from the chord immediately before the window
            // so isRepeat and firstInShapeRun are correct on the first visible chord.
            if (_chordsLoIdx > 0) {
                const prevChord = chords[_chordsLoIdx - 1];
                if (prevChord && prevChord.notes) {
                    const prevShapeSig = chordInference.chordShapeSignature(prevChord);
                    if (prevShapeSig !== null) {
                        runSigPrev = prevShapeSig;
                        prevAnyChordTime = prevChord.t;
                        prevChordSig = prevShapeSig;
                        prevChordTime = prevChord.t;
                    }
                }
            }

            for (let ci = _chordsLoIdx; ci < chords.length; ci++) {
                const ch = chords[ci];
                // Chords are time-sorted — everything beyond t1 is outside the
                // visible window and contributes nothing (activeFrets needs t<now+2,
                // highwayIntensity needs dt<AHEAD, both < t1).
                if (ch.t > t1) break;
                const runSig = chordInference.chordShapeSignature(ch);
                let firstInShapeRun;
                if (runSig === null) {
                    firstInShapeRun = true;
                } else {
                    const gap = ch.t - prevAnyChordTime;
                    firstInShapeRun = (runSig !== runSigPrev) || gap > SHAPE_RUN_GAP_S;
                    runSigPrev = runSig;
                    // Only valid chords update the run-gap clock — an entry
                    // whose runSig is null (no notes / unusable chordId)
                    // shouldn't make the next real chord look like a tiny
                    // gap and silently fall into a "still in the run" state.
                    prevAnyChordTime = ch.t;
                }
                if (!ch.notes) continue;
                // Filter chord notes to in-range strings once. All
                // chord-level aggregations (maxSus, repeat-chord
                // signature, open-string centroid, frame-box bounds,
                // active-fret highlights, camera-window dist) read
                // from chordNotes so a clamped 9th-string note can't,
                // for instance, extend the chord's linger beyond its
                // visible sustain.
                const chordNotes = filterValidNotes(ch.notes);
                if (chordNotes.length === 0) continue;
                const chShape = chordInference.mergeChordShape(ch, chordNotes, bundle.chordTemplates);

                if (ch.t > now) {
                    const dt = ch.t - now;
                    if (dt < AHEAD) accum.highwayIntensity = Math.max(accum.highwayIntensity, 1 - dt / AHEAD);
                }
                if (ch.t > now && ch.t < now + 2)
                    for (const cn of chordNotes) { if (cn.f > 0) activeFrets.add(cn.f); }

                let maxSus = 0;
                for (const n of chordNotes) if ((n.sus || 0) > maxSus) maxSus = n.sus;
                // When maxSus=0 (no explicit sustain on chord notes, including
                // all h3dSynth chords) use AHEAD as the filter window so the
                // chord stays in the loop long enough for a handshape-derived
                // sustain rail to finish drawing. The rail itself gates on
                // _dtSusEnd>0, so chords with no actual sustain produce no
                // visual artifact despite staying in the loop longer.
                // ndVerdictT0 extends the window when a note-detect provider is
                // attached so async verdicts still land while drawable.
                const _chFilterSus = maxSus > 0 ? maxSus : AHEAD;
                if (ch.t + _chFilterSus < ndVerdictT0) continue;
                if (ch.t > t1) break;

                // Repeat-chord detection (consecutive same shape, short gap).
                // Reuses runSig computed at loop entry — same signature as the
                // dedicated chordInference.chordShapeSignature() call we used to make twice.
                // Synthetic chords (h3dSynth — injected at handshape onsets by
                // mergeHandShapeSynthChords) are never real strums, so they must
                // not update prevChordSig/prevChordTime. Without this guard a
                // real chord whose handshape generates a synth onset at the
                // handshape start_time (e.g. a slide-in where the real strum
                // falls mid-handshape, > 28 ms after the onset) would see the
                // synth as its "previous chord" and be falsely flagged isRepeat.
                const isRepeat = runSig !== null && prevChordSig === runSig && Math.abs(ch.t - prevChordTime) < 0.5;
                if (!ch.h3dSynth) {
                    prevChordSig = runSig;
                    prevChordTime = ch.t;
                }

                // Anchor selection for chord frame + open-string X + sustain rails:
                // • Upcoming (chDtEarly > 0): onset time — frame previews the correct
                //   neck region before the chord hits the line.
                // • Past, actively sustaining (now < ch.t + maxSus): onset time — frame
                //   stays at the frets where the chord was struck. Using `now` here
                //   causes the frame to jump to whichever anchor is active at `now`,
                //   which may be a different/wider region and makes the sustain box
                //   appear in the wrong fret zone ("invading" adjacent anchors).
                // • Past, linger-only (sustain expired or chord had no sustain): `now`
                //   — brief fade-out frame tracks the current lane position so it
                //   doesn't visibly drift while the lane has already transitioned.
                const chDtEarly = ch.t - now;
                const _chAnchorT = chDtEarly > 0 ? ch.t
                    : (maxSus > 0 && now < ch.t + maxSus) ? ch.t
                    : now;
                const chAncB = anchorLaneBoundsAt(anchors, _chAnchorT);
                // Open-string X: chart <anchor> lane centre when present (not ctx.cam.curX /
                // fretted centroid), matching highway span.
                let chordCX = ctx.cam.curX;
                if (chAncB) chordCX = (xFret(chAncB.dMin) + xFret(chAncB.dMax)) / 2;
                else {
                    let cxL = Infinity, cxR = -Infinity, fretted = 0;
                    for (const cn of chordNotes) {
                        if (cn.f > 0) {
                            const fx = xFretMid(cn.f);
                            if (fx < cxL) cxL = fx;
                            if (fx > cxR) cxR = fx;
                            fretted++;
                        }
                    }
                    if (fretted > 0) chordCX = (cxL + cxR) / 2;
                }

                // Horizontals for chord frame + open-string mesh width. With anchors,
                // span matches HWY lane columns (wire dMin..dMax); no extra pad.
                let chordFrameXL = null, chordFrameXR = null, chordOpenBoxW = null;
                let chordFrameAnchorMatched = false;
                if (chShape.size > 1) {
                    let fMinCh = 99, fMaxCh = 0, anyFretted = false;
                    for (const [, f] of chShape) {
                        if (f > 0) {
                            anyFretted = true;
                            fMinCh = Math.min(fMinCh, f);
                            fMaxCh = Math.max(fMaxCh, f);
                        }
                    }
                    // Prefer the anchor span so chord frames and arpeggio
                    // frames align with the highway lane window — BUT only
                    // when the chord's fretted notes actually fall within
                    // the anchor range. If the anchor at this chord's time
                    // doesn't cover the chord's frets (e.g. a chord at frets
                    // 2–4 with an anchor locked to frets 5–8), the framebox
                    // would clip the very gems it's supposed to contain, so
                    // fall back to chord-fret-based bounds instead.
                    const anchorCoversChordFrets = chAncB && anyFretted
                        ? (fMinCh >= chAncB.dMin && fMaxCh <= chAncB.dMax)
                        : true; // all-open chord: anchor centre is fine
                    if (chAncB && anchorCoversChordFrets) {
                        chordFrameXL = xFret(chAncB.dMin);
                        chordFrameXR = xFret(chAncB.dMax);
                        chordFrameAnchorMatched = true;
                    } else if (anyFretted) {
                        chordFrameXL = xFret(fMinCh - 1);
                        chordFrameXR = xFret(Math.max(fMaxCh, fMinCh + 2));
                    } else {
                        const wNut = openNoteLaneBoxW(ch.t);
                        chordFrameXL = chordCX - wNut * 0.5;
                        chordFrameXR = chordCX + wNut * 0.5;
                    }
                    if (chordFrameXL != null && chordFrameXR != null) {
                        const span = Math.abs(chordFrameXR - chordFrameXL);
                        if (span > 1e-8) {
                            // Anchor-driven lane stripes span [dMin..dMax] wire-to-wire with
                            // no horizontal pad — match that ONLY when the frame is actually
                            // following the anchor (all-open chord, fallback path). The
                            // fretted-span path always pads so the frame breathes around
                            // the outermost fretted notes; without the pad it sat exactly
                            // on the fret lines and looked clipped.
                            if (chordFrameAnchorMatched) chordOpenBoxW = span;
                            else {
                                const padX = NW * 0.4;
                                chordOpenBoxW = span + padX * 2;
                            }
                        }
                    }
                }

                const laneWForOpenStrings = (chordOpenBoxW != null && chordOpenBoxW > 1e-8)
                    ? chordOpenBoxW
                    : openNoteLaneBoxW(ch.t);

                const hsHintFrame = chordInference.chordHandShapeArpeggioHint(ch, bundle.handShapes, bundle.chordTemplates);
                const hsTimeWinFrame = hsHintFrame.hs
                    ? { tLo: chordInference.hsStart(hsHintFrame.hs) - 0.06, tHi: chordInference.hsEnd(hsHintFrame.hs) + 0.06 }
                    : null;
                // chordShapeCoveredByStandaloneNotes is now cached per
                // chord (see _arpCoverCache), so a direct call from the
                // deferChordGems short-circuit chain is both lazy
                // (skipped for branches that don't need it) AND O(1)
                // when re-hit later in the same frame. The previous
                // per-chord IIFE memo is therefore redundant — drop it
                // to avoid the per-chord closure allocation in dense
                // PM/FH passages.
                const inferredArpPattern = (!hsHintFrame.hs
                    || chordInference.handShapeChartSpanSec(hsHintFrame.hs) >= ARP_INFER_MIN_HAND_SHAPE_SPAN_S)
                    && chordInference.inferArpeggioFromNotePattern(
                        ch, chShape, notes, hsTimeWinFrame, bundle.handShapes);
                // Only suppress the chord gems when standalone notes really
                // cover the arpeggio shape; otherwise explicit/synth hand
                // shapes can produce an empty lavender frame with no notes
                // inside (e.g. template-marked `-arp` chord rows).
                // Lazy wrapper so the note-stream scan is skipped when
                // neither branch needs it (short-circuit evaluation).
                const noteStreamCoversArpShape = () => chordInference.chordShapeCoveredByStandaloneNotes(ch, chShape, notes);
                const deferChordGems = (ch.h3dSynth && noteStreamCoversArpShape())
                    || inferredArpPattern
                    || (hsHintFrame.explicit && hsHintFrame.covered && noteStreamCoversArpShape());
                /**
                 * Lavender chord frame + purple highway rails: authored
                 * arpeggio metadata only. RS ``highDensity`` marks gallops /
                 * repeated strums on the same voicing (e.g. Frantic ~2:46) —
                 * not arpeggio; keep ``hd`` for sustain-ribbon width via
                 * ``chordSusTrailMatchArpFrame``.
                 *
                 * Only the chord that INITIATES the handshape span gets
                 * the lavender treatment — subsequent strums of the same
                 * voicing within the same handshape window are repeats and
                 * render as ordinary chord frames. Proximity to
                 * chordInference.hsStart() (≤ 100 ms) identifies the initiating chord
                 * regardless of how wide the span is.
                 */
                const _hsStartT = hsHintFrame.hs ? chordInference.hsStart(hsHintFrame.hs) : NaN;
                const chordHighwayLavenderArpVisual = hsHintFrame.explicit
                    && !isNaN(_hsStartT) && Math.abs(ch.t - _hsStartT) <= 0.1;
                const chordSusTrailMatchArpFrame = chordInference.chordWireHighDensity(ch)
                    || chordHighwayLavenderArpVisual;

                // Onset in window OR chord started before the window
                // but is still sustaining right now. Gate sustain
                // carry-over against the current frame time so camera
                // framing releases as soon as the chord is no longer
                // rendered on screen.
                const chOnsetInWin = ch.t >= camT0 && ch.t <= camT1;
                const chSusActive  = ch.t < camT0 && ch.t + maxSus >= now;
                const chWindowed   = chOnsetInWin || chSusActive;
                // Symmetric decay — see matching comment in the
                // single-note branch. The chord-wide chW uses
                // ch.t (not per-note onset) since chord notes
                // share a strum time.
                const chW          = chWindowed ? Math.exp(-Math.abs(ch.t - now) / camTau) : 0;
                // Next-chord tail: same voicing (``highDensity`` gallop) keeps full linger + optional
                // fade suppression inside [hold−fade, hold]; a voicing change clips the tail to the
                // chart gap so D5→D#5 (~185 ms) does not stack two cyan frames (Frantic ~2:47).
                let cjNext = null;
                for (let j = ci + 1; j < chords.length; j++) {
                    const cj = chords[j];
                    if (!cj?.notes) continue;
                    if (filterValidNotes(cj.notes).length === 0) continue;
                    cjNext = cj;
                    break;
                }
                // Nearest following event (chord OR single note) — used by
                // chordTailMul so the framebox vanishes the moment any next
                // event is played, not just when the next chord arrives.
                // Pull from the same sorted scalar scratch used by drawNote
                // — the per-string Math.min walk became O(log N) over the
                // shared 2*nStr buffer.
                const _chFirstEventAfter = _firstEventTimeGreaterThan(ch.t + 1e-6);
                const _chNextEventT = cjNext != null
                    ? Math.min(cjNext.t, _chFirstEventAfter)
                    : _chFirstEventAfter;
                let chordTailHoldS = CHORD_HWY_LINGER_S;
                let chordNextSoon = false;
                if (cjNext && cjNext.t > ch.t + 1e-6) {
                    // Clip the hold tail to the gap for both same-voicing (repeat)
                    // and different-voicing chords. The chordTailMul instant-cut
                    // check handles the precise zero at onset; the clipped holdS
                    // prevents the outer gate and hwyPostHitTailFadeMul from
                    // lingering past that point.
                    chordTailHoldS = Math.min(CHORD_HWY_LINGER_S, Math.max(cjNext.t - ch.t, 1e-3));
                }
                // feedBack#254 — engine verdicts land ~0.4 s after the
                // chord crosses; on a fast different-voicing sequence
                // the clip above can shrink the rim's draw life below
                // that, so the green/red latch is set but the rim isn't
                // drawn anymore. When a verdict provider is attached,
                // floor the hold at NOTEDETECT_GEM_VERDICT_WINDOW so
                // the tinted rim is actually visible.
                //
                // This deliberately overrides the "voicing-change clip
                // prevents two stacked cyan frames" behavior documented
                // above (the D5→D#5 / Frantic ~2:47 case): the post-hit
                // z clamp (Math.min(0, dZ(chDt)) below) pins extended
                // frames at z=0, so the two frames do overlap in plane
                // — they're distinguished by their now-tinted rim
                // colors (green/red verdict vs teal default) rather
                // than perspective depth. In detect mode that's the
                // right trade: verdict visibility beats the cleaner
                // approach silhouette. Without detect mode the
                // original clip still applies.
                if (noteDetectHasProvider && chordTailHoldS < NOTEDETECT_GEM_VERDICT_WINDOW) {
                    chordTailHoldS = NOTEDETECT_GEM_VERDICT_WINDOW;
                }
                const chordTailFadeS = Math.min(CHORD_HWY_FADE_S, chordTailHoldS);

                // ── Approaching-arpeggio first-note identification ──────────────────
                // When an authored arpeggio chord frame is still approaching (not yet
                // at the hit line), only the first note to be played is shown as a gem.
                // All others are suppressed until chDtEarly <= 0 so the frame doesn't
                // flood the player's view with simultaneous gems before they arrive.
                // The first note is the earliest match in the note stream within the
                // handshape window. If no note-stream note matches the chord shape
                // within the handshape (i.e. there is no sequential arpeggio pattern),
                // _arpApproachFirstNote stays null and ALL chord gems are shown — this
                // handles chords that are played simultaneously even when tagged as arp.
                let _arpApproachFirstNote = null;
                if (chordHighwayLavenderArpVisual && !deferChordGems
                    && chDtEarly > 0 && hsHintFrame.hs) {
                    const _aHsLo = chordInference.hsStart(hsHintFrame.hs);
                    const _aHsHi = chordInference.hsEnd(hsHintFrame.hs);
                    let _aFirstT = Infinity;
                    const _aNLo = lowerBoundT(notes, _aHsLo - 0.08);
                    for (let _ani = _aNLo; _ani < notes.length; _ani++) {
                        const _an = notes[_ani];
                        if (_an.t > _aHsHi + 0.08) break;
                        if (!validString(_an.s)) continue;
                        for (const _acn of chordNotes) {
                            if (_acn.s === _an.s && _acn.f === _an.f && _an.t < _aFirstT) {
                                _aFirstT = _an.t;
                                _arpApproachFirstNote = _acn;
                                break;
                            }
                        }
                    }
                    // No fallback to chordNotes[0]: if the note stream has no sequential
                    // notes matching this shape, the chord is played simultaneously and
                    // all gems must be shown.
                }

                // ── Deferred-arpeggio gem fallback ─────────────────────────────────
                // When gems are deferred to the note stream (deferChordGems=true) but
                // no individual note matching the chord shape falls within the chord's
                // onset cluster window, the frame box has no gems at its Z position.
                // Show all chord gems as a preview so the frame box isn't empty.
                // Uses the same onset window as chordShapeCoveredByStandaloneNotes so
                // the fallback deactivates precisely when the stream truly covers the
                // onset. Inlined (not an IIFE) to skip the per-chord closure allocation.
                let _deferFallback = false;
                if (deferChordGems && chDtEarly > 0) {
                    _deferFallback = true;
                    const _fLo = ch.t - ARP_FRAME_ONSET_PAD_S;
                    const _fHi = ch.t + ARP_FRAME_ONSET_CLUSTER_S;
                    let _fi = lowerBoundT(notes, _fLo - 0.02);
                    for (; _fi < notes.length; _fi++) {
                        const _fn = notes[_fi];
                        if (_fn.t > _fHi) break;
                        if (_fn.t < _fLo) continue;
                        const _fef = chShape.get(_fn.s);
                        if (_fef !== undefined && _fef === _fn.f) { _deferFallback = false; break; }
                    }
                }

                // Suppress gems AND frame for hand-shape-synthesized chords whose
                // notes are already rendered individually via the note stream. Showing
                // chord gems or a framebox for a synth chord that duplicates the note
                // stream looks like phantom notes/chords. Check: any standalone note
                // matching any shape string in the onset window → player is already
                // guided by the note stream. Weaker than chordShapeCoveredByStandaloneNotes
                // (all strings covered) to handle patterns where one shape string only
                // appears well after the onset cluster (e.g. Walk intro, string 5 at
                // +0.7 s outside the 0.26 s window). Inlined for the same reason as
                // _deferFallback above.
                let suppressSynthChord = false;
                if (ch.h3dSynth && notes && chShape.size > 0) {
                    const _sLo = ch.t - ARP_FRAME_ONSET_PAD_S;
                    const _sHi = ch.t + ARP_FRAME_ONSET_CLUSTER_S;
                    let _si = lowerBoundT(notes, _sLo - 0.02);
                    for (; _si < notes.length; _si++) {
                        const _sn = notes[_si];
                        if (_sn.t > _sHi) break;
                        if (_sn.t < _sLo) continue;
                        if (chShape.get(_sn.s) === _sn.f) { suppressSynthChord = true; break; }
                    }
                }

                // suppressSynthChord: skip gems + frame but still call drawNote with
                // skipBody=true so the board projection (fret ghost on fretboard) renders
                // for all shape strings — shows the hand position like a chord would.
                // chordLinksSlide: true when any chord note has a direct sl/slu marker,
                // OR when the chord's sustain connects (via case-2 linkNext) to a note
                // in bundle.notes that has a slide.  Repeated chords matching either
                // condition are treated as normal chords so the player sees the gem.
                let chordLinksSlide = chordNotes.some(cn =>
                    (Number.isFinite(cn.sl) && cn.sl >= 0) ||
                    (Number.isFinite(cn.slu) && cn.slu >= 0));
                if (!chordLinksSlide && isRepeat && maxSus > 0 && notes) {
                    const _EPS = NEXT_ON_STRING_T_EPS;
                    outer: for (const cn of chordNotes) {
                        if (!(cn.sus > 0)) continue;
                        const _endT = ch.t + cn.sus;
                        let _ji = lowerBoundT(notes, _endT - _EPS);
                        for (; _ji < notes.length; _ji++) {
                            const _q = notes[_ji];
                            if (_q.t > _endT + _EPS) break;
                            if (_q.s !== cn.s || Math.abs(_q.t - _endT) >= _EPS) continue;
                            if ((Number.isFinite(_q.sl) && _q.sl >= 0) ||
                                (Number.isFinite(_q.slu) && _q.slu >= 0)) {
                                chordLinksSlide = true; break outer;
                            }
                        }
                    }
                }
                if (!deferChordGems || _deferFallback || suppressSynthChord) {
                    for (const cn of chordNotes) {
                        // Suppress non-first gems while an authored arpeggio frame
                        // approaches — but not for the deferred fallback path, where
                        // all chord gems serve as the only visual preview.
                        // _arpApproachFirstNote is null when no sequential note-stream
                        // pattern was found, so simultaneous chords are unaffected.
                        // suppressSynthChord: show all shape strings for the projection.
                        if (!_deferFallback && !suppressSynthChord && _arpApproachFirstNote !== null && cn !== _arpApproachFirstNote) continue;
                        // Only suppress labels on repeated chord shapes (not on first-in-run);
                        // removed the lastFretForString check — same fix as single notes above.
                        const skipLabel = !firstInShapeRun;
                        // Reuse _scrChordNote scratch instead of `{ ...cn }` spread
                        // (avoids per-chord-note object allocation every frame).
                        Object.assign(_scrChordNote, cn);
                        _scrChordNote.t   = ch.t;
                        _scrChordNote.sus = cn.sus || 0;
                        // `fhm` is omit-when-false in the wire format (unlike `mt`/`pm`
                        // which are always emitted). Before 5913129, chord-level
                        // fretHandMute was folded into `mt` (always-emitted), so
                        // Object.assign would overwrite any stale value. After that
                        // commit fhm is its own field — absent on non-muted notes —
                        // so Object.assign leaves a stale `true` from a previous
                        // muted chord note untouched. Reset it explicitly here.
                        _scrChordNote.fhm = cn.fhm || false;
                        // Same stale-scratch hazard for the bend shape:
                        // `bnv`/`bt` are omit-when-default on the wire, so a
                        // chord note without them would otherwise inherit the
                        // previous note's curve (and bendSemisAtTime would
                        // apply the wrong contour). Reset explicitly.
                        _scrChordNote.bnv = Array.isArray(cn.bnv) ? cn.bnv : undefined;
                        _scrChordNote.bt  = cn.bt || 0;
                        // Same stale-scratch hazard for the teaching marks
                        // (§6.2.2): fg/sd are omit-when-default on the wire,
                        // so a chord note without them must reset to -1 or it
                        // inherits the previous note's finger/degree label.
                        _scrChordNote.fg  = Number.isInteger(cn.fg) ? cn.fg : -1;
                        _scrChordNote.sd  = Number.isInteger(cn.sd) ? cn.sd : -1;
                        noteRenderer.drawNote(
                            _scrChordNote,
                            now,
                            cn.f === 0 ? chordCX : undefined,
                            skipLabel,
                            (isRepeat && !chordLinksSlide) || suppressSynthChord,
                            chordTailHoldS,
                            cn.f === 0 ? laneWForOpenStrings : undefined,
                            true,
                            ch.id,
                            chordSusTrailMatchArpFrame,
                            null,
                            _ghostPrevBuf.get(Math.round(ch.t * 1e4) * 10 + cn.s) ?? -Infinity,
                            chordHighwayLavenderArpVisual || suppressSynthChord || chordInference.chordWireHighDensity(ch),
                            frame,
                        );
                        lastFretForString[cn.s] = cn.f;
                        // gate by THIS note's own sustain against the
                        // current render time — drawNote has already
                        // dropped short-sustain notes whose ringing has
                        // ended, so they should not keep pulling the
                        // camera frame wider than the notes actually
                        // still on screen (chord-wide maxSus would
                        // over-pullback for mixed-sustain chords).
                        if (!(cameraMode === 'lookahead')) {
                        const cnSustainOk = chOnsetInWin || (chSusActive && ch.t + (cn.sus || 0) >= now);
                        if (cn.f > 0 && cnSustainOk) {
                            accum.camWX += xFretMid(cn.f) * chW;
                            accum.camWSum += chW;
                            if (cn.f < accum.camDistMin) accum.camDistMin = cn.f;
                            if (cn.f > accum.camDistMax) accum.camDistMax = cn.f;
                            accum.camDistGot = true;
                        }
                        }
                    }
                }

                // ── Arpeggio note brackets [ ] ────────────────────────
                // Drawn only for explicitly authored arpeggio frames
                // (chordHighwayLavenderArpVisual = explicit handshape arp mark).
                // Covers both paths: gems shown directly from the chord
                // (!deferChordGems) and the deferred-fallback preview path
                // (_deferFallback). The inferred-arpeggio path (inferredArpPattern
                // only, no explicit mark) intentionally does NOT draw brackets —
                // the inference heuristic can false-positive on fast strummed
                // chords, and brackets on non-arp chords confuse players.
                // Note-stream arpeggios draw their own brackets in the notes[]
                // loop above (for notes already in AHEAD). The chord loop covers
                // any strings whose notes haven't entered AHEAD yet — _nsBrackets
                // prevents duplicates for strings already handled by notes[].
                if (chordHighwayLavenderArpVisual) {
                    const _arpBracketDt = ch.t - now;
                    if (_arpBracketDt < AHEAD) {
                        const _arpEnd = (hsHintFrame.hs && !isNaN(chordInference.hsEnd(hsHintFrame.hs)))
                            ? chordInference.hsEnd(hsHintFrame.hs)
                            : ch.t + maxSus + CHORD_HWY_LINGER_S;
                        // The notes[] loop already drew brackets for any note-stream
                        // note that entered AHEAD, recording (chordId:occurrenceStart → strings)
                        // in _noteStreamBracketStrings. Use the same composite key (template id +
                        // handshape start time) so two arp occurrences sharing a chord template
                        // ID are treated as distinct occurrences — not one suppressing the other.
                        const _nsBracketsKey = ch.id + ':' + _hsStartT;
                        const _nsBrackets = _noteStreamBracketStrings.get(_nsBracketsKey);
                        // Open-string bracket X: anchor at handshape start so
                        // position stays fixed even when chordCX drifts with now.
                        const _arpChBrktAncB = !isNaN(_hsStartT)
                            ? anchorLaneBoundsAt(anchors, _hsStartT)
                            : null;
                        const _arpChBrktOpenX = _arpChBrktAncB
                            ? (xFret(_arpChBrktAncB.dMin) + xFret(_arpChBrktAncB.dMax)) / 2
                            : (chordCX ?? ctx.cam.curX);
                        const _arpChBrktOpenW = (() => {
                            if (_arpChBrktAncB) {
                                const _xl = xFret(_arpChBrktAncB.dMin), _xr = xFret(_arpChBrktAncB.dMax);
                                if (_xr > _xl) return _xr - _xl + NW * 0.4 * 2;
                            }
                            return laneWForOpenStrings;
                        })();
                        for (const cn of chordNotes) {
                            if (!validString(cn.s)) continue;
                            if (_nsBrackets && _nsBrackets.has(cn.s)) continue;
                            const _bx = cn.f === 0
                                ? _arpChBrktOpenX
                                : xFretMid(cn.f);
                            const _openHalfW = (cn.f === 0 && _arpChBrktOpenW != null)
                                ? Math.max(0.22, _arpChBrktOpenW * 0.96 / (40 * K)) * 20 * K
                                : null;
                            drawArpBrackets(_bx, sY(cn.s), _arpBracketDt, _arpEnd, now, cn.s, cn.f === 0, _openHalfW);
                        }
                    }
                }

                // Chord frame-box: rim bars + interior fill gradient.
                const chDt = chDtEarly; // already computed above for anchor selection
                const chordTailMul = (() => {
                    // When a next event (chord OR single note) has already crossed
                    // the hit line, hide this frame immediately — no fadeout overlap
                    // when another event is already playing.
                    if (chDt < 0 && _chNextEventT < Infinity && now >= _chNextEventT) {
                        return 0;
                    }
                    return hwyPostHitTailFadeMul(chDt, chordTailHoldS, chordNextSoon, chordTailFadeS);
                })();
                if (chShape.size > 1 && chDt > -chordTailHoldS && chDt < AHEAD && chordOpenBoxW != null
                    && (!suppressSynthChord || chordInference.chordTemplateMarkedArpeggio(ch.id, bundle.chordTemplates))
                ) {
                    const z = Math.min(0, dZ(chDt));
                    const width = chordOpenBoxW;
                    const xLeft = chordFrameXL;
                    const xRight = chordFrameXR;
                    const cx = (xLeft + xRight) * 0.5;
                    const yA = sY(0), yB = sY(nStr - 1);
                    const yMinF = Math.min(yA, yB) - S_GAP * 0.8;
                    const yMaxF = Math.max(yA, yB) + S_GAP * 0.8;
                    const fullChordBoxH = yMaxF - yMinF;
                    let height = fullChordBoxH;
                    if (isRepeat) height *= 0.5;
                    // Repeat frames use half height but anchor at yMinF (board
                    // level) rather than centering in the string range. With the
                    // camera tilted downward, a centered half-height frame puts
                    // its bottom bar mid-strings — far above the board — causing
                    // perspective-induced apparent X-misalignment with the lane
                    // tiles (which sit at board level). Anchoring at yMinF keeps
                    // the bottom bar near the board so both frame and lane tile
                    // edges share the same projected screen X.
                    const yBot = yMinF;
                    const yTop = yMinF + height;
                    const cY = (yBot + yTop) * 0.5;
                    const fade = Math.max(0, 1 - chDt / AHEAD);
                    const chordAccent = chordNotes.some(cn => cn.ac);

                    // Rim thickness from full vertical span — repeat halves inner height only,
                    // not bar thickness vs first chord — see CHORD_FRAME_RIM_* tuning.
                    let ft = Math.max(CHORD_FRAME_RIM_MIN * K, fullChordBoxH * CHORD_FRAME_RIM_FRAC_H);
                    if (chordAccent) ft *= 1.22;
                    // Lavender frame: authored arpeggio marker only.
                    // RS ``highDensity`` is kept out — it tags gallops & repeated
                    // strums (Frantic ~2:46), not arpeggio.
                    const isArpeggioFrame = chordHighwayLavenderArpVisual;
                    const ftSide = isArpeggioFrame ? ft * 1.55 : ft;
                    let rimHex = isArpeggioFrame ? ARPEGGIO_RIM_BLUE_HEX : CHORD_BOX_TEAL_HEX;
                    // Capture the neutral frame color before any verdict overwrite.
                    // Used for the mute X lines so hit/miss feedback only shows on
                    // the outer borders of the framebox, not inside the X pattern.
                    const baseRimHex = rimHex;
                    // feedBack#254 — once the chord crosses the hit
                    // line, tint the teal frame by the note-state
                    // provider verdict: green on a clean grab, red on a
                    // miss. The verdict is async (the engine verifier
                    // reports ~0.4 s after the line), so the frame stays
                    // teal while the verdict is still pending — it must
                    // not flash red before the verdict lands. The green/
                    // red verdict is latched in _chordVerdicts so it
                    // can't flicker as constituent glows decay.
                    // Only engages when a scorer is attached. Arpeggio
                    // frames keep their blue identity.
                    // Per-occurrence key — ch.id is the template id
                    // (reused across same-shape chord occurrences) so
                    // composing it with ch.t gives one entry per
                    // physical onset in the chart.
                    const verdictKey = _encodeChordVerdictKey(ch);
                    // Evict any stale latch the next time the chord
                    // re-enters the pre-hit window (rewinds, section
                    // loops, full restarts). Bounds Map growth too.
                    if (chDt > 0 && _chordVerdicts.has(verdictKey)) {
                        _chordVerdicts.delete(verdictKey);
                    }
                    // The verdict scan no longer skips authored-handshape
                    // frames — power chords sometimes carry an explicit
                    // handshape (RS authoring quirk), which previously
                    // dropped them into the `isArpeggioFrame` path and
                    // left them lavender-blue regardless of hit/miss.
                    // A true arpeggio (handshape over a real sweeping
                    // note run) is unaffected: its constituents are
                    // standalone notes judged at their own times, so the
                    // scan's query at `ch.t` finds nothing for them and
                    // the frame keeps its lavender default.
                    if (chDt <= 0 && noteDetectHasProvider && !isArpeggioFrame) {
                        const latched = _chordVerdicts.get(verdictKey);
                        if (latched === 'green') {
                            rimHex = CHORD_BOX_HIT_BRIGHT_HEX;
                        } else if (latched === 'red') {
                            rimHex = CHORD_BOX_MISS_DARK_HEX;
                        } else if (latched === 'unmatched') {
                            // The first scan past the verdict window
                            // came up empty (no constituent ever had a
                            // state — most often a true arpeggio frame
                            // whose actual notes are judged at their
                            // own times, not at ch.t). Skip the
                            // per-frame provider scan and keep the
                            // frame's default identity (lavender for
                            // arpeggios, teal for chords). See the
                            // unmatched-latch below.
                        } else {
                            // Latch both green AND red:
                            //   - any constituent 'miss' → red latched.
                            //     One decisive miss verdict means the
                            //     chord can't be all-hit; without
                            //     latching, the rim would fall back to
                            //     teal once noteStateFor's miss-wash
                            //     window (~0.6 s TTL) expires and the
                            //     state returns null again.
                            //   - all hit/active → green latched.
                            //   - else (no miss yet, some constituents
                            //     still null) → keep teal default. A
                            //     partial state must not flash red on
                            //     a chord whose verdicts arrive
                            //     incrementally.
                            let allHit = chordNotes.length > 0;
                            let anyMiss = false;
                            let anyState = false;  // true if any constituent had a non-null state this scan
                            for (const cn of chordNotes) {
                                let cs = null;
                                try { cs = noteDetectGetState(cn, ch.t); } catch (e) { cs = null; }
                                const st = (cs && typeof cs === 'object') ? cs.state : cs;
                                if (st === 'hit' || st === 'active') {
                                    anyState = true;
                                } else if (st === 'miss') {
                                    // First miss decides the chord — no
                                    // point querying the rest of the
                                    // constituents this frame; the rim
                                    // is about to be red-latched below.
                                    // Short-circuits provider calls in
                                    // chord-dense passages.
                                    allHit = false;
                                    anyMiss = true;
                                    anyState = true;
                                    break;
                                } else {
                                    // null — undecided yet
                                    allHit = false;
                                }
                            }
                            if (anyMiss) {
                                _chordVerdicts.set(verdictKey, 'red');
                                rimHex = CHORD_BOX_MISS_DARK_HEX;
                            } else if (allHit) {
                                _chordVerdicts.set(verdictKey, 'green');
                                rimHex = CHORD_BOX_HIT_BRIGHT_HEX;
                            } else if (chDt < -NOTEDETECT_UNMATCHED_LATCH_AFTER && !anyState) {
                                // The engine verdict typically lands
                                // ~0.4 s after the chord crosses the
                                // line, so after the
                                // NOTEDETECT_UNMATCHED_LATCH_AFTER threshold
                                // we've already waited well past the
                                // verdict-arrival window. If no
                                // constituent ever returned a non-
                                // null state by then, there's no
                                // verdict coming for this chord
                                // (true arpeggio frames: their actual
                                // notes are judged at their own
                                // times, never at ch.t — the scan
                                // at ch.t finds nothing forever).
                                //
                                // Latch 'unmatched' so subsequent
                                // frames skip the provider scan
                                // entirely. The threshold must be
                                // INSIDE the chord frame's visible
                                // draw window — `chordTailHoldS` is
                                // floored to NOTEDETECT_GEM_VERDICT_
                                // WINDOW (0.75 s) in detect mode, so
                                // chord frames stop drawing at
                                // `chDt < -0.75`; a latch threshold
                                // at `-NOTEDETECT_GEM_VERDICT_WINDOW`
                                // (i.e. exactly -0.75) is unreachable
                                // because the draw gate kicks the
                                // frame out of the loop first. Place
                                // the threshold ~0.55 s past line so
                                // it fires for ~0.2 s of the remaining
                                // visible window — enough frames to
                                // catch and skip future re-scans.
                                //
                                // The !anyState guard keeps the
                                // partial-resolve case (one cn 'hit',
                                // another still null) scanning until
                                // anyMiss / allHit commits it.
                                _chordVerdicts.set(verdictKey, 'unmatched');
                            }
                            // else: no verdict yet → leave teal default
                        }
                    }

                    if (chDt > 0) { // framebox only on highway, not on the fretboard
                    const repDim = isRepeat ? 0.78 : 1;
                    const edgeOp = fade * chordTailMul;
                    const thickZ = Math.max(CHORD_FRAME_RIM_Z_MIN * K, ft * CHORD_FRAME_RIM_Z_SCAL);
                    // Per-depth layer stack: chord frames, gems, technique markers,
                    // and fret labels all derive from RENDER_ORDER_LAYER_STACK so new layers
                    // have one vocabulary instead of ad hoc arithmetic at call sites.
                    // Sub-increments of 0.0001 for intra-chord ordering; safe for any
                    // chord gap >= 0.001 s.
                    const chordFrameRenderOrder = renderOrderForLayerAtZ(z, 'CHORD_FRAME');
                    const drawFrameBox = (px, py, sx, sy, ord, hex = rimHex, op = edgeOp) => {
                        const b = pChordBox.get();
                        b.renderOrder = ord;
                        b.material.color.setHex(hex);
                        b.position.set(px, py, z);
                        b.scale.set(sx, sy, thickZ);
                        b.rotation.set(0, 0, 0);
                        b.material.opacity = op;
                    };
                    const sideHex = isArpeggioFrame ? rimHex : 0x163137;

                    const innerW = Math.max(width - 2 * ftSide, width * 0.45);
                    const innerH = Math.max(height - 2 * ft, height * 0.3);
                    const fill = pChordFrameFill.get();
                    fill.renderOrder = renderOrderForLayerAtZ(z, 'CHORD_FILL');
                    fill.rotation.set(0, 0, 0);
                    fill.position.set(cx, cY, z - 0.004 * K);
                    fill.scale.set(innerW, innerH, 1);
                    fill.material.opacity = fade * repDim * chordTailMul;
                    // Swapping `map` between two non-null gradient textures
                    // doesn't change shader-defining state, so no needsUpdate
                    // — that flag would otherwise force a recompile per frame.
                    fill.material.map = isArpeggioFrame ? chordFrameGradTexArp : chordFrameGradTex;
                    fill.material.color.setRGB(1, 1, 1);

                    const withTopFrame = !isRepeat;
                    // Non-repeat tapers the upper side bars + draws a thin top bar;
                    // hoisted out so ySideHi can match the actual top-bar thickness
                    // (using ft would leave a visible gap between the thin top bar
                    // and the side bars meeting it).
                    const ftThin = ftSide * 0.22;

                    const ySideLo = yBot + ft;
                    const ySideHi = withTopFrame ? yTop - ftThin : yTop - ft * 0.15;
                    const sideH = Math.max(ySideHi - ySideLo, ft * 1.25);
                    const sideCy = ySideLo + sideH * 0.5;

                    // Bottom bar: thin teal (like top bar) + dark corners on top.
                    {
                        const botCW = Math.min(sideH * (isRepeat ? 0.5 : 0.25), width * 0.4);
                        drawFrameBox(cx, yBot + ftThin * 0.5, width, ftThin, chordFrameRenderOrder);
                        drawFrameBox(cx + width * 0.5 - botCW * 0.5, yBot + ft * 0.5, botCW, ft, chordFrameRenderOrder + 0.0001, sideHex);
                        drawFrameBox(cx - width * 0.5 + botCW * 0.5, yBot + ft * 0.5, botCW, ft, chordFrameRenderOrder + 0.0002, sideHex);
                    }

                    if (isRepeat) {
                        // Lower 30%: thick dark segment
                        const repLoH = sideH * 0.3;
                        const repLoCy = ySideLo + repLoH * 0.5;
                        drawFrameBox(cx - width * 0.5 + ftSide * 0.5, repLoCy, ftSide, repLoH, chordFrameRenderOrder + 0.0001, sideHex);
                        drawFrameBox(cx + width * 0.5 - ftSide * 0.5, repLoCy, ftSide, repLoH, chordFrameRenderOrder + 0.0001, sideHex);
                        // Upper 70%: thin teal segment (same style as non-repeat upper)
                        const repHiH = sideH - repLoH;
                        const repHiCy = ySideLo + repLoH + repHiH * 0.5;
                        drawFrameBox(cx - width * 0.5 + ftThin * 0.5, repHiCy, ftThin, repHiH, chordFrameRenderOrder + 0.0001);
                        drawFrameBox(cx + width * 0.5 - ftThin * 0.5, repHiCy, ftThin, repHiH, chordFrameRenderOrder + 0.0001);
                    } else {
                        // Non-repeat: thick sides up to repeat-frame height, then taper to thin above.
                        const threshY = yBot + fullChordBoxH * 0.5; // top of what a repeat frame would be

                        // Lower thick segment (ySideLo → threshY)
                        const loSideH = Math.max(Math.min(threshY, ySideHi) - ySideLo, 0);
                        if (loSideH > 0) {
                            const loCy = ySideLo + loSideH * 0.5;
                            drawFrameBox(cx - width * 0.5 + ftSide * 0.5, loCy, ftSide, loSideH, chordFrameRenderOrder + 0.0001, sideHex);
                            drawFrameBox(cx + width * 0.5 - ftSide * 0.5, loCy, ftSide, loSideH, chordFrameRenderOrder + 0.0001, sideHex);
                        }

                        // Upper thin segment (threshY → ySideHi)
                        const hiSideH = Math.max(ySideHi - threshY, 0);
                        if (hiSideH > 0) {
                            const hiCy = threshY + hiSideH * 0.5;
                            drawFrameBox(cx - width * 0.5 + ftThin * 0.5, hiCy, ftThin, hiSideH, chordFrameRenderOrder + 0.0001);
                            drawFrameBox(cx + width * 0.5 - ftThin * 0.5, hiCy, ftThin, hiSideH, chordFrameRenderOrder + 0.0001);
                        }

                        // Top bar: thin
                        drawFrameBox(cx, yTop - ftThin * 0.5, width, ftThin, chordFrameRenderOrder);
                    }

                    // Accent bloom on frame edges: 4 additive shells with
                    // Gaussian-style falloff. Each border expands only in its
                    // perpendicular axis so bloom never leaves the frame boundary:
                    //   horizontal bars (top/bottom) → expand Y only
                    //   vertical bars (left/right)   → expand X only
                    if (chordAccent && pHaloBar) {
                        // Bloom only on the teal (thin) parts of the frame — the dark
                        // "#163137" L-corners are deliberately left without bloom so they
                        // remain visibly dark (same appearance as non-accent chords).
                        const haloHex = isArpeggioFrame ? ARPEGGIO_RIM_BLUE_HEX : CHORD_BOX_TEAL_HEX;
                        const EXPAND_MAX = 1.45;
                        const dynamicOp = fade * chordTailMul;
                        const drawHaloBar = (px, py, scaleX, scaleY, rotZ) => {
                            const b = pHaloBar.get();
                            b.material.color.setHex(haloHex);
                            b.material.opacity = dynamicOp;
                            b.renderOrder = renderOrderForLayerAtZ(z, 'CHORD_EDGE_GLOW');
                            b.position.set(px, py, z - 0.001 * K);
                            b.scale.set(scaleX, scaleY * EXPAND_MAX * 0.5, thickZ * 2.0);
                            b.rotation.set(0, 0, rotZ);
                        };
                        // Bottom: center-only bloom (skip dark corner areas)
                        const _bCW = Math.min(sideH * (isRepeat ? 0.5 : 0.25), width * 0.4);
                        const centerBotW = width - 2 * _bCW;
                        if (centerBotW > 0)
                            drawHaloBar(cx, yBot + ft * 0.5, centerBotW * 0.5, ft, 0);
                        // Top bar
                        if (withTopFrame)
                            drawHaloBar(cx, yTop - ftThin * 0.5, width * 0.5, ftThin, 0);
                        // Lateral: bloom only on the upper thin-teal segment (skip dark lower segment)
                        if (isRepeat) {
                            const repLoH = sideH * 0.3;
                            const repHiH = sideH - repLoH;
                            if (repHiH > 0) {
                                const repHiCy = ySideLo + repLoH + repHiH * 0.5;
                                drawHaloBar(cx - width * 0.5 + ftSide * 0.5, repHiCy, repHiH * 0.5, ftSide, Math.PI * 0.5);
                                drawHaloBar(cx + width * 0.5 - ftSide * 0.5, repHiCy, repHiH * 0.5, ftSide, Math.PI * 0.5);
                            }
                        } else {
                            const threshY = yBot + fullChordBoxH * 0.5;
                            const hiSideH = Math.max(ySideHi - threshY, 0);
                            if (hiSideH > 0) {
                                const hiCy = threshY + hiSideH * 0.5;
                                drawHaloBar(cx - width * 0.5 + ftSide * 0.5, hiCy, hiSideH * 0.5, ftSide, Math.PI * 0.5);
                                drawHaloBar(cx + width * 0.5 - ftSide * 0.5, hiCy, hiSideH * 0.5, ftSide, Math.PI * 0.5);
                            }
                        }
                    }
                    const chordName = chordInference.chordTemplateLabel(bundle.chordTemplates?.[ch.id]);
                    if (chordName && firstInShapeRun && !chordInference.chordWireHighDensity(ch)) {
                        const lblW = 28 * K, lblH = 9 * K;
                        const lbl = pChordLbl.get();
                        const mat = textSprites.txtMat(chordName, '#e8d080', true, 'chord');
                        _setLabelMap(lbl, mat);
                        lbl.material.opacity = Math.min(1, 0.3 + fade * 0.7) * chordTailMul;
                        // Gold chord name: slight +X shift from flush-left so it sits farther right.
                        const lblWS = lblW * _textSizeMul;
                        const lblHS = lblH * _textSizeMul;
                        const frameLeft = cx - width / 2;
                        const nameShiftX = NW * 0.94;
                        const nameVertTuck = NH * 0.02;
                        lbl.position.set(
                            frameLeft - lblWS / 2 + nameShiftX,
                            yMaxF + lblHS / 2 - nameVertTuck,
                            z);
                        lbl.scale.set(lblWS, lblHS, 1);
                    }

                    // Harmony annotations (§6.3.1 / §6.6) — the chord's
                    // function (fn.rn Roman numeral) and template voicing,
                    // stacked above the chord name. Gated by the
                    // teaching-marks opt-in (mirrors the 2D overlay). Display
                    // only — never grading.
                    if (_drawTeachingMarks && firstInShapeRun && !chordInference.chordWireHighDensity(ch)) {
                        const _tmpl = bundle.chordTemplates?.[ch.id];
                        const _h = chordHarmonyLabels(ch.fn, _tmpl?.voicing, _tmpl?.caged, _tmpl?.guideTones);
                        if (_h.rn || _h.voicing || _h.caged || _h.guideTones) {
                            const hlW = 24 * K * _textSizeMul;
                            const hlH = 9 * K * _textSizeMul;
                            const frameLeft = cx - width / 2;
                            const baseX = frameLeft - hlW / 2 + NW * 0.94;
                            const opacity = Math.min(1, 0.3 + fade * 0.7) * chordTailMul;
                            // Start one chord-name-height above the name and
                            // stack upward so labels never overlap the gems.
                            let hy = yMaxF + hlH * 1.6;
                            const _drawHarmony = (text, colorHex) => {
                                if (!text) return;
                                const s = pChordLbl.get();
                                const m = textSprites.txtMat(text, colorHex, true, 'chord');
                                _setLabelMap(s, m);
                                s.material.opacity = opacity;
                                s.position.set(baseX, hy, z);
                                s.scale.set(hlW, hlH, 1);
                                hy += hlH;
                            };
                            _drawHarmony(_h.rn, '#ffcc66');         // sd teaching color
                            _drawHarmony(_h.voicing, '#7fd1ff');    // fg teaching color
                            _drawHarmony(_h.caged, '#a0ffa0');      // CAGED shape teaching color
                            _drawHarmony(_h.guideTones, '#d0a0ff'); // guide-tone teaching color
                        }
                    }

                    // Shape-based barre detection for the 3D indicator.
                    // Drives off chord notes alone — independent of label
                    // availability, so charts whose chordTemplates lack a
                    // .name still show the barre line.
                    // Matches drawChordDiagram PATH A + PATH B so the highway
                    // line and overlay bracket always agree on the same shapes:
                    //   PATH A: 2+ adjacent strings at the minimum fret.
                    //   PATH B: outer-edge full-span barre (e.g. B major x24442)
                    //           where the two outer strings are at the minimum fret,
                    //           every intermediate string is fretted (f>0), and no
                    //           intermediate string also sits at the minimum fret.
                    // Scattered voicings like "1 3 1 3 1 0" (strings 0,2,4 at
                    // fret 1 but no two adjacent, and string 2 sits at min fret)
                    // correctly produce no indicator.
                    {
                        let bFret = Infinity;
                        for (const [, f] of chShape) {
                            if (f > 0) bFret = Math.min(bFret, f);
                        }
                        // Collect strings at minimum fret into scratch array (no allocation)
                        _scrAtMinFretLen = 0;
                        if (bFret < Infinity) {
                            for (const [s, f] of chShape) {
                                if (f === bFret) _scrAtMinFretArr[_scrAtMinFretLen++] = s;
                            }
                            // insertion sort — array is ≤8 elements
                            for (let _ii = 1; _ii < _scrAtMinFretLen; _ii++) {
                                const _v = _scrAtMinFretArr[_ii];
                                let _jj = _ii - 1;
                                while (_jj >= 0 && _scrAtMinFretArr[_jj] > _v) {
                                    _scrAtMinFretArr[_jj + 1] = _scrAtMinFretArr[_jj]; _jj--;
                                }
                                _scrAtMinFretArr[_jj + 1] = _v;
                            }
                        }
                        // Inline longestConsecutiveRun (no array allocation)
                        let _barreRunStart = -1, _barreRunLen = 0;
                        {
                            let _curStart = -1, _curLen = 0;
                            for (let _ri = 0; _ri < _scrAtMinFretLen; _ri++) {
                                const _rv = _scrAtMinFretArr[_ri];
                                if (_curLen === 0 || _rv === _scrAtMinFretArr[_ri - 1] + 1) {
                                    if (_curLen === 0) _curStart = _rv;
                                    _curLen++;
                                } else {
                                    if (_curLen > _barreRunLen) { _barreRunLen = _curLen; _barreRunStart = _curStart; }
                                    _curStart = _rv; _curLen = 1;
                                }
                            }
                            if (_curLen > _barreRunLen) { _barreRunLen = _curLen; _barreRunStart = _curStart; }
                        }
                        let is3dBarre    = _barreRunLen >= 2;   // PATH A
                        let barreMinStr3d = is3dBarre ? _barreRunStart : -1;
                        let barreMaxStr3d = is3dBarre ? _barreRunStart + _barreRunLen - 1 : -1;

                        // PATH B: outer-edge full-span barre
                        const MIN_BARRE_SPAN_3D = Math.min(nStr - 1, 4);
                        if (_scrAtMinFretLen >= 2) {
                            const minS = _scrAtMinFretArr[0];
                            const maxS = _scrAtMinFretArr[_scrAtMinFretLen - 1];
                            if (maxS - minS >= MIN_BARRE_SPAN_3D) {
                                // chShape is already a Map<s, f> — query it directly
                                // instead of building a transient Set<s> every frame.
                                let allFretted = true;
                                for (let si = minS; si <= maxS; si++) {
                                    if (!chShape.has(si) || chShape.get(si) <= 0) { allFretted = false; break; }
                                }
                                if (allFretted) {
                                    if (is3dBarre) {
                                        // PATH A fired: extend to full outer span.
                                        barreMinStr3d = minS; barreMaxStr3d = maxS;
                                    } else {
                                        // PATH A did not fire: only draw if no inner
                                        // string also sits at the minimum fret.
                                        let innerAtMinFret = false;
                                        for (let _ai = 1; _ai < _scrAtMinFretLen - 1; _ai++) {
                                            const _as = _scrAtMinFretArr[_ai];
                                            if (_as > minS && _as < maxS) { innerAtMinFret = true; break; }
                                        }
                                        if (!innerAtMinFret) {
                                            is3dBarre = true;
                                            barreMinStr3d = minS; barreMaxStr3d = maxS;
                                        }
                                    }
                                }
                            }
                        }

                        if (is3dBarre && chDt <= 0) {
                            const bx = xFretMid(bFret);
                            const yTop = Math.max(sY(barreMinStr3d), sY(barreMaxStr3d));
                            const yBot = Math.min(sY(barreMinStr3d), sY(barreMaxStr3d));
                            const lineH = yTop - yBot;
                            const bl = pBarreLine.get();
                            bl.position.set(bx, (yTop + yBot) / 2, 0.05 * K);
                            bl.scale.set(0.5 * K, lineH, 0.5 * K);
                            bl.material.opacity = 0.8 * chordTailMul;
                        }
                    }

                    // ── Chord fret numbers at the base of the highway ───────────────
                    // Show fret number per unique fretted position for non-repeated
                    // chords so the player can read the shape at a glance.
                    if (!isRepeat) {
                        const _chFretLblAlpha = Math.min(1.0, (AHEAD - chDt) / 0.35) * chordTailMul;
                        const _seenChordFrets = new Set();
                        for (const [, f] of chShape) {
                            if (f <= 0 || _seenChordFrets.has(f)) continue;
                            _seenChordFrets.add(f);
                            const lbl = pNoteFretLabel.get();
                            const mat = textSprites.txtMat(f, FRET_LABEL_GOLD_HEX, false, 'noteFret');
                            _setLabelMap(lbl, mat);
                            lbl.position.set(xFretMid(f), yMinF, z);
                            lbl.renderOrder = renderOrderForLayerAtZ(z, 'CHORD_FRET_LABEL');
                            const _flS = 7.0 * K * (1 + 0.4 * chDt / AHEAD) * _textSizeMul * fretLabelScaleForFret(f);
                            lbl.scale.set(_flS, _flS, 1);
                            lbl.material.opacity = _chFretLblAlpha;
                        }
                    }

                    // ── Palm-mute strum indicator — pool (fill + lines) ──────────────
                    // Per-chord Z-proportional renderOrder: muted fill/lines and
                    // frame edges all use the named layer offsets above.
                    if (isRepeat && chordNotes.some(cn => cn.pm)) {
                        if (pPMXFill) {
                            const xf = pPMXFill.get();
                            xf.renderOrder = renderOrderForLayerAtZ(z, 'CHORD_STRUM_FILL');
                            xf.material.opacity = edgeOp * CHORD_BOX_EDGE_ALPHA;
                            xf.position.set(cx, cY, z - 0.0045 * K);
                            xf.scale.set(innerW * 0.5, -innerH * 0.5, 1);
                            xf.rotation.set(0, 0, 0);
                        }
                        if (pMuteXLines) {
                            const xl = pMuteXLines.get();
                            xl.renderOrder = renderOrderForLayerAtZ(z, 'CHORD_STRUM_LINE');
                            xl.material.opacity = edgeOp * 0.85;
                            xl.material.color.setHex(baseRimHex);
                            xl.position.set(cx, cY, z - 0.005 * K);
                            xl.scale.set(innerW * 0.5, -innerH * 0.5, thickZ * 0.5);
                            xl.rotation.set(0, 0, 0);
                        }
                    }

                    // ── Frethand-mute strum indicator — pool (fill + lines) ───────────
                    if (isRepeat && chordNotes.some(cn => cn.mt || cn.fhm)) {
                        if (pFHXFill) {
                            const xf = pFHXFill.get();
                            xf.renderOrder = renderOrderForLayerAtZ(z, 'CHORD_STRUM_FILL');
                            xf.material.opacity = edgeOp * CHORD_BOX_EDGE_ALPHA;
                            xf.position.set(cx, cY, z - 0.0045 * K);
                            xf.scale.set(innerW * 0.5, -innerH * 0.5, 1);
                            xf.rotation.set(0, 0, 0);
                        }
                        if (pFHXLines) {
                            const xl = pFHXLines.get();
                            xl.renderOrder = renderOrderForLayerAtZ(z, 'CHORD_STRUM_LINE');
                            xl.material.opacity = edgeOp * 0.85;
                            xl.material.color.setHex(baseRimHex);
                            xl.position.set(cx, cY, z - 0.005 * K);
                            xl.scale.set(innerW * 0.5, -innerH * 0.5, thickZ * 0.5);
                            xl.rotation.set(0, 0, 0);
                        }
                    }

                    } // end if (chDt > 0) — framebox + PM/FH mute only on highway

                }

                // ── Chord sustain length indicator — 3D plane rails ─────────────
                // Left + right rail as plane meshes (PlaneGeometry +
                // MeshBasicMaterial) in the WebGL scene so they respect
                // renderOrder (16) and never occlude note gems (20/21).
                // isRepeat chords also draw their rail: each repeat shows a
                // segment from its own onset to the next chord's onset (or the
                // handshape end, whichever is shorter), chaining together to
                // cover the full handshape duration visually.
                if (chShape.size > 1 && chordOpenBoxW != null && chDt < AHEAD) {
                    // Cap handshape-derived sustain at the gap to the next chord.
                    // Each chord (including repeats) only extends to the next
                    // chord's onset, so the rail never lingers past the anchor
                    // region of the current chord.
                    const _nextChordGap = (ci + 1 < chords.length)
                        ? chords[ci + 1].t - ch.t
                        : Infinity;
                    // Use the time remaining in the handshape from this chord's
                    // onset (hsEnd - ch.t), NOT the full handshape span. When
                    // multiple chords share the same handshape window (e.g. A5
                    // at 63.527 and again at 64.137 both fall inside the same
                    // handshape start=63.527 end=64.239), each chord after the
                    // first starts mid-handshape. Using the full span (0.712s)
                    // for the mid-handshape chord gives a rail that extends
                    // 0.611s — far past the handshape end — causing the
                    // "elongated border" that visually swallows subsequent
                    // single notes. Clamping to (hsEnd - ch.t) gives 0.102s,
                    // which correctly terminates at the handshape boundary.
                    const _hsSus = (maxSus === 0 && !deferChordGems && hsHintFrame && hsHintFrame.hs)
                        ? Math.min(Math.max(0, chordInference.hsEnd(hsHintFrame.hs) - ch.t), _nextChordGap)
                        : 0;
                    // "Chord hold": suppressed non-arp synth chord where deferChordGems
                    // zeroed _hsSus. Use h3dSynthEnd (= handshape end_time) instead.
                    const _synthSus = (suppressSynthChord && ch.h3dSynth
                        && !chordInference.chordTemplateMarkedArpeggio(ch.id, bundle.chordTemplates)
                        && ch.h3dSynthEnd != null)
                        ? Math.max(0, ch.h3dSynthEnd - ch.t)
                        : 0;
                    const _rawSus = maxSus > 0 ? maxSus : Math.max(_hsSus, _synthSus);
                    // Apply the 0.4 s visual-minimum only to chords with an
                    // explicit note sustain (maxSus > 0). Handshape-derived
                    // sustain (_hsSus, already capped at _nextChordGap) must
                    // not be inflated — that would undo the gallop cap and
                    // cause the rail to reappear at the old anchor position.
                    const _effSus = maxSus > 0
                        ? Math.max(_rawSus, 0.4)
                        : _rawSus;
                    const _dtSusEnd  = chDt + _effSus;
                    if (_dtSusEnd > 0) {
                        // Clip the rail at the next anchor boundary so it doesn't
                        // extend into a different fret zone. The lane (pLane) slices
                        // correctly per-anchor; a single-segment rail at fixed X would
                        // visually "invade" the neighbouring region when anchors change
                        // within the sustain window.
                        let _dtSusEndRail = _dtSusEnd;
                        if (anchors && anchors.length) {
                            const _susAbsT = chDt > 0 ? ch.t : now;
                            if (getChartAnchorAt(anchors, _susAbsT) !==
                                getChartAnchorAt(anchors, now + _dtSusEnd)) {
                                // Binary search: first anchor starting strictly after _susAbsT.
                                let _lo = 0, _hi = anchors.length;
                                while (_lo < _hi) {
                                    const _mid = (_lo + _hi) >>> 1;
                                    if (anchors[_mid].time <= _susAbsT) _lo = _mid + 1;
                                    else _hi = _mid;
                                }
                                if (_lo < anchors.length)
                                    _dtSusEndRail = anchors[_lo].time - now;
                            }
                        }
                        const _zNear = chDt > 0 ? dZ(chDt) : 0;
                        const _zFar  = dZ(Math.min(_dtSusEndRail, AHEAD));
                        const _railLen = _zNear - _zFar;
                        if (_railLen > 0.001) {
                            const _yA   = sY(0), _yB = sY(nStr - 1);
                            const _yBot = Math.min(_yA, _yB) - S_GAP * 0.8;
                            const _fadeAhead = chDt > 0 ? Math.max(0, 1 - chDt / AHEAD) : 1;
                            const _fadeSus   = Math.min(1, _dtSusEnd / 0.25);
                            const _op  = _fadeAhead * _fadeSus * 0.9;
                            const _hex = chordHighwayLavenderArpVisual ? ARPEGGIO_RIM_BLUE_HEX : CHORD_BOX_TEAL_HEX;
                            const _railW = 1.875 * K; // visual width of each rail strip
                            const _zMid  = _zNear - _railLen * 0.5; // centre in Z
                            for (const [_rx, _inDir] of [[chordFrameXL, -1], [chordFrameXR, 1]]) {
                                const _rxIn = _rx + _inDir * _railW * 0.5;
                                // Core rail
                                const rl = pSusRail.get();
                                rl.material.color.setHex(_hex);
                                rl.material.opacity = _op;
                                rl.position.set(_rxIn, _yBot, _zMid);
                                rl.scale.set(_railW, 1, _railLen);
                                // Bloom glow — wider gaussian plane, additive blending
                                if (!_leanSus) {
                                    const bl = pSusRailBloom.get();
                                    bl.material.color.setHex(_hex);
                                    bl.material.opacity = _op * 0.8;
                                    bl.position.set(_rxIn, _yBot + 0.001, _zMid);
                                    bl.scale.set(3 * K, 1, _railLen);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    return { drawChords };
}
