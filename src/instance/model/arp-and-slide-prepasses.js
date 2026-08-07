import { NEXT_ON_STRING_T_EPS } from '../../core/constants.js';
import { _noteKey, lowerBoundT } from '../../core/chart-util.js';

// Two small chart-derived pre-passes -- moved verbatim out of update()
// (Stage 7 Track C). Both feed the standalone-note render loop
// (instance/render/single-notes.js) as explicit parameters (arpPersistKeys,
// slideTargetSet); bundled into one file since neither is big enough to
// warrant its own.
export function createArpAndSlidePrepasses({ chordInference, arpeggioLaneRail, _scrArpPersistKeys }) {
    // Lane-rail memoization state (Stage 7, post-3e) -- moved verbatim out
    // of update() alongside the two pre-passes above. Used nowhere else in
    // main.js (verified via whole-file grep before the move), so it's
    // private state of this factory rather than threaded deps -- same
    // "own it outright" upgrade chords.js's `_scrChordNote` got.
    let _arpLaneRailHsScratch = [];
    let _arpRailBoundLoScratch = [];
    let _arpRailBoundHiScratch = [];
    let _laneRailFlagsRefHs = null;
    let _laneRailFlagsRefTpl = null;
    let _laneRailBoundsRefHs = null;
    let _laneRailBoundsRefChords = null;
    let _laneRailBoundsRefTpl = null;
    let _laneRailBoundsRefNotes = null;

    // Chord-merge + arp-ghost-infer memoization state (Stage 7, post-3e) --
    // moved verbatim out of update() alongside the lane-rail caches above.
    // Both depend only on chart-static input arrays (handShapes / chords /
    // chordTemplates / notes), not on `now` -- the bundle hands the same
    // array refs every frame within an arrangement, so a recompute is
    // skippable when the refs are identity-equal to the previous call's.
    let _mergeCacheResult = null;
    let _mergeCacheChordsRef = null;
    let _mergeCacheHsRef = null;
    let _mergeCacheTplRef = null;
    let _arpGhostHsInferScratch = [];
    let _arpGhostInferRefHs = null;
    let _arpGhostInferRefNotes = null;
    let _arpGhostInferRefTpl = null;
    // Handshape start-times where ghost fret numbers show but [ ] brackets
    // are suppressed (synth-chord onset-match cases -- not genuine
    // arpeggios). Mutated in place by fillArpeggioGhostInferFlags and
    // handed back to the caller each call -- not private-only, since
    // single-notes.js reads it too (same shape as arpGhostHsInfer itself).
    let _arpSynthOnsetHsSet = new Set();

    // Notes in active arpeggio handshapes must keep rendering their
    // fretboard ghost + brackets until arpBounds.end, even after their
    // onset+sustain exits the normal back-window (t0 = now-0.5s). Builds a
    // Set of "t_s" keys so the notes loop can skip the normal window check
    // for these notes. _scrArpPersistKeys is a persistent Set (deps, not
    // per-call state) -- cleared and repopulated every call, same as
    // chords.js's persistent Maps.
    function computeArpPersistKeys(arpGhostHsInfer, handShapes, notes, now, t0) {
        _scrArpPersistKeys.clear();
        if (arpGhostHsInfer && handShapes && notes) {
            for (let _hi = 0; _hi < handShapes.length; _hi++) {
                if (!arpGhostHsInfer[_hi]) continue;
                const _hs = handShapes[_hi];
                const _lo = chordInference.hsStart(_hs), _hi2 = chordInference.hsEnd(_hs);
                if (Number.isNaN(_lo) || Number.isNaN(_hi2)) continue;
                if (now > _hi2 + 0.05) continue; // arpeggio already ended
                // Only persist notes that have already exited the normal back-window
                // (onset+sustain < t0). Notes still in the window enter the loop via
                // the normal check; future notes are gated by the t1 check below.
                const _nLo = lowerBoundT(notes, _lo - 0.01);
                for (let _ni = _nLo; _ni < notes.length; _ni++) {
                    const _n = notes[_ni];
                    if (_n.t > _hi2 + 0.05) break;
                    if (_n.t + (_n.sus || 0) < t0) {
                        _scrArpPersistKeys.add(_noteKey(_n.t, _n.s));
                    }
                }
            }
        }
        return _scrArpPersistKeys;
    }

    // Detects notes in `notes` that are the slide/link destination of a
    // preceding note. The gem (outline+core) is suppressed via
    // skipBody=true, but the sustain/slide trail still renders because the
    // trail block is outside the !skipBody gate in drawNote().
    //
    // NOTE: an authored `linkNext` flag is NOT present in bundle.notes —
    // note_to_wire() in lib/song.py emits only t, s, f, sus, sl, slu, bn,
    // ho, po, hm, hp, pm, mt, vb, tr, ac, tp. So this is an intentional
    // timing/fret heuristic, not a link-flag lookup.
    //
    // Two source patterns (source has sus > 0):
    //   Case 1 — source has sl/slu: destination.f === source's slide target
    //   Case 2 — same fret (hold), destination has sl/slu (hold→slide)
    //
    // Sources can be single notes OR chord notes (bundleChords).
    //
    // Chart-static: memoized against (notes, bundleChords) reference
    // identity via the passed-in ref/set state, returned for main.js to
    // hold in its own closure `let`s (same shape as chord-diagram-
    // tracking.js's diag* fields) so teardown() can still reset them directly.
    function computeSlideTargetSet(notes, bundleChords, slideTargetSet, slideTargetNotesRef, slideTargetChordsRef) {
        if (notes !== slideTargetNotesRef || bundleChords !== slideTargetChordsRef) {
            slideTargetSet = null;
            if (notes && notes.length) {
                const stSet = new Set();
                const checkSrc = (srcT, srcS, srcF, srcSus, srcSl) => {
                    if (!(srcSus > 0)) return;
                    const endT = srcT + srcSus;
                    // Reuse the renderer's shared next-on-string tolerance
                    // rather than a separate hardcoded literal.
                    const EPS = NEXT_ON_STRING_T_EPS;
                    let lo = 0, hi = notes.length;
                    while (lo < hi) { const m = (lo + hi) >> 1; if (notes[m].t < endT - EPS) lo = m + 1; else hi = m; }
                    for (let j = lo; j < notes.length; j++) {
                        const q = notes[j];
                        if (q.t > endT + EPS) break;
                        if (q.s !== srcS || q.t <= srcT || Math.abs(q.t - endT) >= EPS) continue;
                        const qSl = (Number.isFinite(q.sl) && q.sl >= 0) ? q.sl
                                  : (Number.isFinite(q.slu) && q.slu >= 0) ? q.slu : -1;
                        if (srcSl >= 0 && q.f === srcSl) { stSet.add(_noteKey(q.t, q.s)); break; } // case 1
                        if (q.f === srcF && qSl >= 0)    { stSet.add(_noteKey(q.t, q.s)); break; } // case 2
                    }
                };
                for (let i = 0; i < notes.length; i++) {
                    const p = notes[i];
                    checkSrc(p.t, p.s, p.f, p.sus,
                        (Number.isFinite(p.sl) && p.sl >= 0) ? p.sl : (Number.isFinite(p.slu) && p.slu >= 0) ? p.slu : -1);
                }
                const rc = bundleChords;
                if (rc && rc.length) {
                    for (let ci = 0; ci < rc.length; ci++) {
                        const ch = rc[ci]; if (!ch.notes) continue;
                        for (let ni = 0; ni < ch.notes.length; ni++) {
                            const cn = ch.notes[ni];
                            checkSrc(ch.t, cn.s, cn.f, cn.sus,
                                (Number.isFinite(cn.sl) && cn.sl >= 0) ? cn.sl : (Number.isFinite(cn.slu) && cn.slu >= 0) ? cn.slu : -1);
                        }
                    }
                }
                if (stSet.size > 0) slideTargetSet = stSet;
            }
            slideTargetNotesRef = notes;
            slideTargetChordsRef = bundleChords;
        }
        return { slideTargetSet, slideTargetNotesRef, slideTargetChordsRef };
    }

    // Arpeggio lane purple-rail authored-marker + bounds caches, keyed off
    // (handShapes, chordTemplates) and (handShapes, chords, chordTemplates,
    // notes) reference identity respectively -- both chart-static, so a
    // dense arrangement skips the O(hs) fill + O(hs × notes) bounds scan
    // most frames. hsLaneRail empty/falsy returns all-null (the "no
    // arpeggio lane rail this frame" case).
    function computeLaneRailCaches(hsLaneRail, chords, chordTemplates, notesArrForRails) {
        if (!hsLaneRail || !hsLaneRail.length) {
            return { laneRailArpHsFlags: null, laneRailBoundLo: null, laneRailBoundHi: null };
        }
        const nHsL = hsLaneRail.length;
        while (_arpLaneRailHsScratch.length < nHsL) _arpLaneRailHsScratch.push(false);
        while (_arpRailBoundLoScratch.length < nHsL) {
            _arpRailBoundLoScratch.push(0);
            _arpRailBoundHiScratch.push(0);
        }
        // Authored-marker flags depend only on (handShapes, templates).
        if (_laneRailFlagsRefHs !== hsLaneRail || _laneRailFlagsRefTpl !== chordTemplates) {
            arpeggioLaneRail.fillLaneRailHandShapeFlags(hsLaneRail, chordTemplates, _arpLaneRailHsScratch);
            _laneRailFlagsRefHs = hsLaneRail;
            _laneRailFlagsRefTpl = chordTemplates;
        }
        // Bounds cache depends on (handShapes, chords, templates, notes).
        if (_laneRailBoundsRefHs !== hsLaneRail
            || _laneRailBoundsRefChords !== chords
            || _laneRailBoundsRefTpl !== chordTemplates
            || _laneRailBoundsRefNotes !== notesArrForRails) {
            arpeggioLaneRail.fillArpeggioRailShapeBoundsCaches(
                hsLaneRail,
                chords ?? [],
                chordTemplates,
                notesArrForRails,
                _arpLaneRailHsScratch,
                _arpRailBoundLoScratch,
                _arpRailBoundHiScratch,
            );
            _laneRailBoundsRefHs = hsLaneRail;
            _laneRailBoundsRefChords = chords;
            _laneRailBoundsRefTpl = chordTemplates;
            _laneRailBoundsRefNotes = notesArrForRails;
        }
        return {
            laneRailArpHsFlags: _arpLaneRailHsScratch,
            laneRailBoundLo: _arpRailBoundLoScratch,
            laneRailBoundHi: _arpRailBoundHiScratch,
        };
    }

    // Merge chart-format real chord rows with hand-shape-synthesized ones,
    // skipping the merge when the three inputs are identity-equal to the
    // previous call's (mergeHandShapeSynthChords is chart-static).
    function computeMergedChords(bundleChords, handShapes, chordTemplates) {
        if (_mergeCacheResult !== null
            && _mergeCacheChordsRef === bundleChords
            && _mergeCacheHsRef === handShapes
            && _mergeCacheTplRef === chordTemplates) {
            return _mergeCacheResult;
        }
        const merged = chordInference.mergeHandShapeSynthChords(bundleChords, handShapes, chordTemplates);
        _mergeCacheResult = merged;
        _mergeCacheChordsRef = bundleChords;
        _mergeCacheHsRef = handShapes;
        _mergeCacheTplRef = chordTemplates;
        return merged;
    }

    // The nStr-dependent caches this module owns need to drop together with
    // main.js's/chord-inference.js's own nStr-dependent caches whenever the
    // string count changes (e.g. a 7-string chart whose stringCount arrives
    // after the first frame) -- called from main.js's
    // _resetStringDependentCaches() as its third leg.
    function resetMergeCache() {
        _mergeCacheResult = null;
    }

    // Per-frame booleans: handShapes[i] passes inferArpeggioFromNotePattern
    // once so the note loop skips an O(hs×notes) rescan. Chart-static --
    // skip the fill when the three inputs are identity-equal to the
    // previous call's. Returns { arpGhostHsInfer: null, ... } when there
    // are no hand shapes / notes this frame (the "nothing to infer" case).
    function computeArpGhostHsInfer(handShapes, chordTemplates, notes) {
        if (!handShapes || !handShapes.length || !notes || !notes.length) {
            return { arpGhostHsInfer: null, arpSynthOnsetHsSet: _arpSynthOnsetHsSet };
        }
        const nHs = handShapes.length;
        while (_arpGhostHsInferScratch.length < nHs) _arpGhostHsInferScratch.push(false);
        if (_arpGhostInferRefHs !== handShapes
            || _arpGhostInferRefNotes !== notes
            || _arpGhostInferRefTpl !== chordTemplates) {
            _arpSynthOnsetHsSet.clear();
            chordInference.fillArpeggioGhostInferFlags(handShapes, chordTemplates, notes, _arpGhostHsInferScratch, _arpSynthOnsetHsSet);
            _arpGhostInferRefHs = handShapes;
            _arpGhostInferRefNotes = notes;
            _arpGhostInferRefTpl = chordTemplates;
        }
        return { arpGhostHsInfer: _arpGhostHsInferScratch, arpSynthOnsetHsSet: _arpSynthOnsetHsSet };
    }

    return {
        computeArpPersistKeys, computeSlideTargetSet, computeLaneRailCaches,
        computeMergedChords, resetMergeCache, computeArpGhostHsInfer,
    };
}
