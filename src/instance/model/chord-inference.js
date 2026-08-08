import {
    ARP_FRAME_ONSET_CLUSTER_S, ARP_FRAME_ONSET_PAD_S, ARP_INFER_MIN_HAND_SHAPE_SPAN_S,
    ARP_INFER_MIN_HITS_VS_SHAPE_CAP, ARP_INFER_MULTI_STRUM_HIT_SLACK,
    ARP_INFER_MULTI_STRUM_WIN_MIN_S, ARP_INFER_STRUM_VS_ARP_SPREAD_MIN_S, NEXT_ON_STRING_T_EPS,
} from '../../core/constants.js';
import { lowerBoundT } from '../../core/chart-util.js';

/**
 * Chord/arpeggio/hand-shape inference: turns chart-format `chordTemplates` +
 * `handShapes` + the raw note stream into what the renderer draws
 * (repeat-run detection, synthesized chords for fingerpicking passages with
 * no `<chord>` events, arpeggio-vs-strum classification, CAGED/guide-tone
 * labels). Every function is a pure chart-data -> derived-data transform;
 * none touch Three.js, the DOM, or per-frame render state.
 *
 * `validString`/`filterValidNotes` are injected rather than imported since
 * they depend on the current arrangement's string count (`nStr`), which
 * still lives in the `createFactory()` closure.
 *
 * The WeakMap caches here are chart-static — computed once per unique
 * chord/hand-shape object and reused every frame. Kept per-instance (not a
 * module singleton) so splitscreen panels showing different songs don't
 * share cache entries.
 */
export function createChordInference({ validString, filterValidNotes }) {
    /** Normalized fingering signature for chord repeat-run detection, or null. Cached via WeakMap. */
    let _chordSigCache = new WeakMap();
    function chordShapeSignature(ch) {
        if (!ch?.notes) return null;
        if (_chordSigCache.has(ch)) return _chordSigCache.get(ch);
        const chordNotes = filterValidNotes(ch.notes);
        let sig = null;
        if (chordNotes.length > 0) {
            sig = chordNotes.slice().sort((a, b) => a.s - b.s).map(n => `${n.s}:${n.f}`).join('|');
        }
        _chordSigCache.set(ch, sig);
        return sig;
    }

    /** Tolerates RS/sloppak boolean-ish `true`/`1` forms. */
    function truthyChartFlag(v) {
        if (v === true || v === 1) return true;
        if (v === '1') return true;
        return typeof v === 'string' && v.toLowerCase() === 'true';
    }

    /** RS/sloppak `hd` (highDensity); tolerates occasional string forms. */
    function chordWireHighDensity(ch) {
        return truthyChartFlag(ch && ch.hd);
    }

    /** UI label for a chord template — `displayName`, falling back to `name`. Always go through this so the two can't drift apart. */
    function chordTemplateLabel(tmpl) {
        if (!tmpl) return '';
        const d = tmpl.displayName;
        if (typeof d === 'string' && d.length > 0) return d;
        const n = tmpl.name;
        return typeof n === 'string' ? n : '';
    }

    /** Arpeggio styling is driven by authored metadata (explicit hand-shape flags, falling back to template markers), not note-stream inference. */
    function chordTemplateMarkedArpeggio(cid, chordTemplates) {
        if (cid == null || !chordTemplates) return false;
        const tmpl = chordTemplates[cid] ?? chordTemplates[Number(cid)];
        if (!tmpl) return false;
        if (truthyChartFlag(tmpl.arp) || truthyChartFlag(tmpl.arpeggio)) return true;
        const displayName = typeof tmpl.displayName === 'string' ? tmpl.displayName.toLowerCase() : '';
        if (displayName.includes('-arp')) return true;
        const name = typeof tmpl.name === 'string' ? tmpl.name.toLowerCase() : '';
        return name.endsWith('(arp)') || name.includes(' arpeggio');
    }

    function handShapeMarkedArpeggio(hs, chordTemplates) {
        if (!hs) return false;
        if (truthyChartFlag(hs.arp) || truthyChartFlag(hs.arpeggio)) return true;
        return chordTemplateMarkedArpeggio(hsChordIdNorm(hs), chordTemplates);
    }

    /**
     * Matching hand-shape metadata for a chord onset. `explicit` follows
     * authored arpeggio markers only; note inference is handled separately
     * by callers that need it. Cached per chord (depends only on `(ch,
     * hss, chordTemplates)`, all chart-static); the cache is swapped
     * whole on `(hss, templates)` ref change so an arrangement switch
     * can't resurrect stale entries.
     */
    const _HINT_NONE = Object.freeze({ explicit: false, covered: false, hs: null });
    let _hintCache = new WeakMap();
    let _hintCacheHsRef = null;
    let _hintCacheTplRef = null;
    function chordHandShapeArpeggioHint(ch, hss, chordTemplates) {
        if (!hss || hss.length === 0) return _HINT_NONE;
        if (_hintCacheHsRef !== hss || _hintCacheTplRef !== chordTemplates) {
            _hintCache = new WeakMap();
            _hintCacheHsRef = hss;
            _hintCacheTplRef = chordTemplates;
        }
        const cached = _hintCache.get(ch);
        if (cached !== undefined) return cached;
        const t = ch.t;
        const cid = ch.id;
        let result = _HINT_NONE;
        for (let i = 0; i < hss.length; i++) {
            const hs = hss[i];
            const tLo = hsStart(hs);
            const tHi = hsEnd(hs);
            if (Number.isNaN(tLo) || Number.isNaN(tHi)) continue;
            if (t + 1e-4 < tLo || t > tHi + 1e-4) continue;
            const hsCid = hsChordIdNorm(hs);
            if (hsCid !== cid && Number(hsCid) !== Number(cid)) continue;
            const explicit = handShapeMarkedArpeggio(hs, chordTemplates);
            result = { explicit, covered: true, hs };
            break;
        }
        _hintCache.set(ch, result);
        return result;
    }

    /** Builds `ch.notes` from `chordTemplates[cid].frets` (-1 omitted). */
    function chordNotesFromTemplate(cid, templates) {
        if (templates == null || cid == null) return [];
        const tmpl = templates[cid] ?? templates[Number(cid)];
        if (!tmpl || !Array.isArray(tmpl.frets)) return [];
        const out = [];
        for (let si = 0; si < tmpl.frets.length; si++) {
            const f = tmpl.frets[si];
            if (f >= 0 && validString(si)) out.push({ s: si, f, sus: 0 });
        }
        return out;
    }

    /**
     * Chart-format fingerpicking passages often have `<handShape>` + per-string
     * `<note>` rows but no `<chord>` events. The 3D chord frame / arp styling
     * only runs over `bundle.chords`, so synthesize minimal chord rows at
     * each hand-shape onset when the chart omits them.
     */
    function mergeHandShapeSynthChords(realChords, handShapes, chordTemplates) {
        if (!handShapes || handShapes.length === 0) return realChords;
        const reals = realChords && realChords.length ? realChords : [];
        const synth = [];
        const seenSynth = new Set();
        const tol = 0.028;
        // Suppress a synth chord box when a real chord with the same trimmed display name
        // played within this window — some charts author several <chordTemplate> rows
        // sharing a display name for fingering variants, and the follow-up hand-shape with
        // no chord row is a fingering hint, not a new strum.
        const SAME_NAME_RUN_S = 0.5;
        const trimmedTemplateName = (cid) => {
            if (cid == null || !chordTemplates) return '';
            const tmpl = chordTemplates[cid] ?? chordTemplates[Number(cid)];
            return chordTemplateLabel(tmpl).trim();
        };
        outer: for (let i = 0; i < handShapes.length; i++) {
            const hs = handShapes[i];
            const cid = hs.chord_id != null ? hs.chord_id : hs.chordId;
            const st = hs.start_time != null ? hs.start_time : hs.startTime;
            if (cid == null || st == null || Number.isNaN(Number(st))) continue;
            const key = `${cid}|${Number(st).toFixed(3)}`;
            if (seenSynth.has(key)) continue;
            seenSynth.add(key);
            const myName = trimmedTemplateName(cid);
            for (let j = 0; j < reals.length; j++) {
                const ch = reals[j];
                const rid = ch.id;
                const sameId = rid === cid || Number(rid) === Number(cid);
                if (sameId && Math.abs(ch.t - st) <= tol) continue outer;
                // A real strum at the same onset already represents this chord — never
                // synthesize a phantom on top of it, even if id/name don't match (e.g. a
                // stale hand-shape template pointing at a pre-edit shape).
                if (Math.abs(ch.t - st) <= tol) continue outer;
                if (!sameId && myName !== '') {
                    const otherName = trimmedTemplateName(rid);
                    if (otherName === myName
                        && st > ch.t
                        && st - ch.t <= SAME_NAME_RUN_S) {
                        continue outer;
                    }
                }
            }
            const notes = chordNotesFromTemplate(cid, chordTemplates);
            if (notes.length === 0) continue;
            const et = hs.end_time != null ? hs.end_time : hs.endTime;
            synth.push({
                t: st,
                id: cid,
                // `hd` is the chart-format highDensity wire field (gallops/repeated strums),
                // not an arpeggio carrier — arp intent comes from chordHandShapeArpeggioHint().
                hd: false,
                notes,
                /** Hand-shape fill-in (no authored chord row) — skip note-stream arp frame. */
                h3dSynth: true,
                /** Hand-shape end time — used to draw the shape-sustain border for non-arp cases. */
                h3dSynthEnd: et != null ? Number(et) : null,
            });
        }
        if (synth.length === 0) return reals;
        const merged = reals.concat(synth);
        merged.sort((a, b) => {
            const dt = a.t - b.t;
            if (Math.abs(dt) > 1e-6) return dt;
            const ia = Number(a.id);
            const ib = Number(b.id);
            return (ia - ib) || 0;
        });
        return merged;
    }

    /** Merges chart-format `chordTemplates[id].frets` with live `chordNote` rows. Cached via WeakMap on the chord object. */
    let _chordShapeCache = new WeakMap();

    /** Drops the validString()/nStr-dependent chord caches this module owns — call alongside the other string-dependent caches when nStr changes. */
    function resetStringDependentCaches() {
        _chordSigCache = new WeakMap();
        _chordShapeCache = new WeakMap();
    }

    function mergeChordShape(ch, chordNotes, templates) {
        if (_chordShapeCache.has(ch)) return _chordShapeCache.get(ch);
        const shape = new Map();
        const tid = ch && ch.id != null ? ch.id : null;
        const tmpl = (tid != null && templates)
            ? (templates[tid] ?? templates[Number(tid)])
            : null;
        if (tmpl && Array.isArray(tmpl.frets)) {
            for (let si = 0; si < tmpl.frets.length; si++) {
                if (!validString(si)) continue;
                const f = tmpl.frets[si];
                if (f >= 0) shape.set(si, f);
            }
        }
        for (let i = 0; i < chordNotes.length; i++) {
            const cn = chordNotes[i];
            if (!validString(cn.s)) continue;
            if (cn.f < 0) shape.delete(cn.s);
            else shape.set(cn.s, cn.f);
        }
        _chordShapeCache.set(ch, shape);
        return shape;
    }

    function hitTimesQualifyArpeggioSpread(hitTimes) {
        if (hitTimes.length < 2) return false;
        hitTimes.sort((a, b) => a - b);
        const spread = hitTimes[hitTimes.length - 1] - hitTimes[0];
        if (spread >= 0.03) return true;
        return hitTimes.length >= 4 && spread >= 0.016;
    }

    /** RS XML/IPC payloads use snake_case or camelCase field names. */
    function hsStart(hs) {
        if (!hs) return NaN;
        const v = hs.start_time != null ? hs.start_time : hs.startTime;
        if (v == null) return NaN;
        const n = Number(v);
        return Number.isNaN(n) ? NaN : n;
    }
    function hsEnd(hs) {
        if (!hs) return NaN;
        const v = hs.end_time != null ? hs.end_time : hs.endTime;
        if (v == null) return NaN;
        const n = Number(v);
        return Number.isNaN(n) ? NaN : n;
    }
    function hsChordIdNorm(hs) {
        if (!hs) return null;
        const v = hs.chord_id != null ? hs.chord_id : hs.chordId;
        return v == null ? null : v;
    }

    /** `<handShape>` chart duration in seconds. */
    function handShapeChartSpanSec(hs) {
        const a = hsStart(hs), b = hsEnd(hs);
        if (Number.isNaN(a) || Number.isNaN(b)) return 0;
        return Math.max(0, b - a);
    }

    /**
     * When `hd` is missing/false, detects arpeggio from the note stream
     * using the full voicing (template ∪ chord notes) — RS often stores
     * plucks only in `notes[]`, not as duplicate chord rows. Cached per
     * chord; invalidates on `(notesArr, hss)` ref change.
     * @param {{ tLo: number, tHi: number } | null} [timeWin] - when set (e.g. from a `<handShape>` span), scan the whole held-shape window
     */
    let _arpInferCache = new WeakMap();
    let _arpInferCacheNotesRef = null;
    let _arpInferCacheHssRef = null;
    function inferArpeggioFromNotePattern(ch, shape, notesArr, timeWin, hss = null) {
        if (!notesArr || notesArr.length === 0 || shape.size < 2) return false;
        if (_arpInferCacheNotesRef !== notesArr || _arpInferCacheHssRef !== hss) {
            _arpInferCache = new WeakMap();
            _arpInferCacheNotesRef = notesArr;
            _arpInferCacheHssRef = hss;
        }
        const cached = _arpInferCache.get(ch);
        if (cached !== undefined) return cached;
        const result = _inferArpeggioFromNotePatternUncached(ch, shape, notesArr, timeWin);
        _arpInferCache.set(ch, result);
        return result;
    }
    function _inferArpeggioFromNotePatternUncached(ch, shape, notesArr, timeWin) {
        const tHi = timeWin ? timeWin.tHi : ch.t + 2.35;
        const tLo = timeWin ? timeWin.tLo : ch.t - 0.28;
        let i2 = lowerBoundT(notesArr, tLo - 0.02);
        const hitTimes = [];
        const hitStrings = new Set();
        for (; i2 < notesArr.length; i2++) {
            const n = notesArr[i2];
            if (n.t > tHi) break;
            if (n.t < tLo) continue;
            if (!validString(n.s)) continue;
            const ef = shape.get(n.s);
            if (ef === undefined || ef !== n.f) continue;
            hitTimes.push(n.t);
            hitStrings.add(n.s);
        }
        if (!hitTimesQualifyArpeggioSpread(hitTimes)) return false;
        // A genuine arpeggio sweeps across the held shape, landing on multiple strings. A
        // single-string match is a repeated gallop that happens to share one string/fret
        // with the chord, not an arpeggio — require at least 2 strings.
        if (hitStrings.size < 2) return false;
        // Far more hits than the shape has strings means the chord's notes are being
        // re-struck repeatedly (a gallop reusing the same strings), not swept once. Apply
        // this check regardless of whether a hand-shape/timeWin is present.
        const winSpan = timeWin ? (timeWin.tHi - timeWin.tLo) : (tHi - tLo);
        if (winSpan > ARP_INFER_MULTI_STRUM_WIN_MIN_S
            && hitTimes.length > shape.size + ARP_INFER_MULTI_STRUM_HIT_SLACK) {
            return false;
        }
        if (timeWin) {
            if (winSpan < 0.70 && hitTimes.length < 4) {
                const spread = hitTimes[hitTimes.length - 1] - hitTimes[0];
                if (spread < ARP_INFER_STRUM_VS_ARP_SPREAD_MIN_S) return false;
            }
            // Reject when there are too few staggered hits for a genuine sweep across the shape.
            const minHits = Math.min(shape.size, ARP_INFER_MIN_HITS_VS_SHAPE_CAP);
            if (hitTimes.length < minHits) return false;
        }
        return true;
    }

    /**
     * True when standalone note rows already cover every string/fret in
     * the arpeggio shape, so drawing the chord gems too would duplicate
     * the same authored passage. Cached per chord (chart-static, keyed on
     * `notesArr` ref).
     */
    let _arpCoverCache = new WeakMap();
    let _arpCoverCacheNotesRef = null;
    function chordShapeCoveredByStandaloneNotes(ch, shape, notesArr, timeWin) {
        if (!notesArr || notesArr.length === 0 || !shape || shape.size === 0) return false;
        if (_arpCoverCacheNotesRef !== notesArr) {
            _arpCoverCache = new WeakMap();
            _arpCoverCacheNotesRef = notesArr;
        }
        const cached = _arpCoverCache.get(ch);
        if (cached !== undefined) return cached;
        const tLo = (timeWin ? timeWin.tLo : ch.t - ARP_FRAME_ONSET_PAD_S) - NEXT_ON_STRING_T_EPS;
        const tHi = (timeWin ? timeWin.tHi : ch.t + ARP_FRAME_ONSET_CLUSTER_S) + NEXT_ON_STRING_T_EPS;
        let i2 = lowerBoundT(notesArr, tLo);
        const matchedStrings = new Set();
        let result = false;
        for (; i2 < notesArr.length; i2++) {
            const n = notesArr[i2];
            if (n.t > tHi) break;
            if (!validString(n.s) || matchedStrings.has(n.s)) continue;
            const ef = shape.get(n.s);
            if (ef === undefined || ef !== n.f) continue;
            matchedStrings.add(n.s);
            if (matchedStrings.size >= shape.size) { result = true; break; }
        }
        _arpCoverCache.set(ch, result);
        return result;
    }

    /**
     * Notes in an inferred arpeggio passage are charted in `notes[]` with
     * staggered times; treat them like chord-cluster notes for
     * chart-format-style board-ghost fret digits.
     */
    function arpeggioChordIdForNote(n, handShapes, chordTemplates, notesArr) {
        if (!handShapes || handShapes.length === 0 || !notesArr || notesArr.length === 0) return null;
        if (!validString(n.s)) return null;
        for (let i = 0; i < handShapes.length; i++) {
            const hs = handShapes[i];
            const hsLo = hsStart(hs);
            const hsHi = hsEnd(hs);
            if (Number.isNaN(hsLo) || Number.isNaN(hsHi)) continue;
            if (n.t + 1e-4 < hsLo || n.t > hsHi + 1e-4) continue;
            const cid = hsChordIdNorm(hs);
            if (cid == null) continue;
            const tmpl = chordTemplates?.[cid] ?? chordTemplates?.[Number(cid)];
            if (!tmpl || !Array.isArray(tmpl.frets)) continue;
            const tf = tmpl.frets[n.s];
            if (typeof tf !== 'number' || tf < 0 || n.f !== tf) continue;
            const synthNotes = chordNotesFromTemplate(cid, chordTemplates);
            if (synthNotes.length === 0) continue;
            const fakeCh = { t: hsLo, id: cid, notes: synthNotes };
            const shape = mergeChordShape(fakeCh, synthNotes, chordTemplates);
            const tw = { tLo: hsLo - 0.06, tHi: hsHi + 0.06 };
            if (handShapeChartSpanSec(hs) < ARP_INFER_MIN_HAND_SHAPE_SPAN_S) continue;
            if (inferArpeggioFromNotePattern(fakeCh, shape, notesArr, tw, handShapes)) return cid;
        }
        return null;
    }

    /**
     * Per-frame warmup: {@link inferArpeggioFromNotePattern} depends only
     * on `handShape × chart`, not the candidate note, so this fills
     * `outFlags[i]` once per `handShapes[i]` instead of recomputing per
     * visible note.
     */
    function fillArpeggioGhostInferFlags(handShapes, chordTemplates, notesArr, outFlags, outSynthOnsetSet = null) {
        for (let i = 0; i < handShapes.length; i++) {
            let infer = false;
            const hs = handShapes[i];
            if (handShapeChartSpanSec(hs) < ARP_INFER_MIN_HAND_SHAPE_SPAN_S) {
                outFlags[i] = false;
                continue;
            }
            const cid = hsChordIdNorm(hs);
            if (cid != null && notesArr.length > 0) {
                const tmpl = chordTemplates?.[cid] ?? chordTemplates?.[Number(cid)];
                if (tmpl && Array.isArray(tmpl.frets)) {
                    const synthNotes = chordNotesFromTemplate(cid, chordTemplates);
                    if (synthNotes.length > 0) {
                        const hsLo = hsStart(hs);
                        const hsHi = hsEnd(hs);
                        const fakeCh = { t: hsLo, id: cid, notes: synthNotes };
                        const shape = mergeChordShape(fakeCh, synthNotes, chordTemplates);
                        const tw = { tLo: hsLo - 0.06, tHi: hsHi + 0.06 };
                        infer = inferArpeggioFromNotePattern(fakeCh, shape, notesArr, tw, handShapes);
                        // Chord-hold gate: inference can fire true when open-string notes
                        // coincidentally match the template's open positions but only a single
                        // fretted (f>0) string is actually played at onset — that's a chord
                        // hold, not an arpeggio, so clear the flag (no brackets).
                        if (infer) {
                            let _frettedCount = 0;
                            let _onsetNote = null;
                            const _fSeen = new Set();
                            let _ci = lowerBoundT(notesArr, tw.tLo - 0.02);
                            for (; _ci < notesArr.length; _ci++) {
                                const _cn = notesArr[_ci];
                                if (_cn.t > tw.tHi + 0.02) break;
                                if (_cn.t < tw.tLo) continue;
                                if (!validString(_cn.s)) continue;
                                if (shape.get(_cn.s) !== _cn.f) continue;
                                if (_cn.f > 0 && !_fSeen.has(_cn.s)) {
                                    _frettedCount++;
                                    _fSeen.add(_cn.s);
                                    if (_onsetNote === null) _onsetNote = _cn;
                                }
                            }
                            if (_frettedCount <= 1 && _onsetNote !== null) {
                                outFlags[i] = false;
                                continue;
                            }
                        }
                        // Non-arp template inferred as arpeggio: suppress brackets. Only
                        // explicit arp-marked templates should show [ ] / < > markers.
                        if (infer && outSynthOnsetSet != null
                            && !handShapeMarkedArpeggio(hs, chordTemplates)) {
                            outSynthOnsetSet.add(hsLo);
                        }
                        // Also treat as arp ghost when the hs generated a suppressed synth chord:
                        // any standalone note in the onset window matches any shape string. This
                        // covers patterns inferArpeggioFromNotePattern rejects (e.g. the
                        // multi-strum guard on a long hs span) but the player still needs the
                        // "hold this shape" ghost fret numbers on the board.
                        if (!infer) {
                            const _oLo = hsLo - ARP_FRAME_ONSET_PAD_S;
                            const _oHi = hsLo + ARP_FRAME_ONSET_CLUSTER_S;
                            let _oi = lowerBoundT(notesArr, _oLo - 0.02);
                            for (; _oi < notesArr.length; _oi++) {
                                const _on = notesArr[_oi];
                                if (_on.t > _oHi) break;
                                if (_on.t < _oLo) continue;
                                if (shape.get(_on.s) === _on.f) {
                                    infer = true;
                                    if (outSynthOnsetSet != null
                                        && !handShapeMarkedArpeggio(hs, chordTemplates)) {
                                        outSynthOnsetSet.add(hsLo);
                                    }
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            outFlags[i] = infer;
        }
    }

    return {
        chordShapeSignature, chordWireHighDensity, chordTemplateLabel,
        chordTemplateMarkedArpeggio, handShapeMarkedArpeggio, chordHandShapeArpeggioHint,
        mergeHandShapeSynthChords, resetStringDependentCaches, mergeChordShape,
        hsStart, hsEnd, hsChordIdNorm, handShapeChartSpanSec, inferArpeggioFromNotePattern,
        chordShapeCoveredByStandaloneNotes, arpeggioChordIdForNote, fillArpeggioGhostInferFlags,
    };
}

/**
 * Harmony annotation display labels: chord function (`fn.rn` Roman
 * numeral), template `voicing`, `caged` shape, and `guideTones`. `''` for
 * each when absent/malformed; `caged`/`guideTones` come back pre-formatted
 * (`"CAGED: E"` / `"gt 4,10"`). Display only — never grading.
 */
export function chordHarmonyLabels(fn, voicing, caged, guideTones) {
    const rn = (fn && typeof fn.rn === 'string') ? fn.rn.trim() : '';
    const vc = (typeof voicing === 'string') ? voicing.trim() : '';
    const cg = (typeof caged === 'string' && /^[CAGED]$/.test(caged.trim()))
        ? 'CAGED: ' + caged.trim() : '';
    const gt = Array.isArray(guideTones)
        ? guideTones.filter(n => Number.isInteger(n) && n >= 0 && n <= 11) : [];
    return { rn, voicing: vc, caged: cg, guideTones: gt.length ? 'gt ' + gt.join(',') : '' };
}
