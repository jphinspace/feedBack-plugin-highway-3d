import { NEXT_ON_STRING_T_EPS } from '../../core/constants.js';
import { _noteKey, lowerBoundT } from '../../core/chart-util.js';

/**
 * Per-frame chart-derived pre-passes that feed the standalone-note render
 * loop (`instance/render/single-notes.js`) and the arpeggio lane rail, plus
 * their chart-static memoization caches. Each cache is keyed on reference
 * identity of its chart-data inputs (`notes`/`chords`/`handShapes`/
 * `chordTemplates`), which are stable within an arrangement, so a fill only
 * reruns when one of those arrays actually changes.
 */
export function createArpAndSlidePrepasses({ chordInference, arpeggioLaneRail, _scrArpPersistKeys }) {
    let _arpLaneRailHsScratch = [];
    let _arpRailBoundLoScratch = [];
    let _arpRailBoundHiScratch = [];
    let _laneRailFlagsRefHs = null;
    let _laneRailFlagsRefTpl = null;
    let _laneRailBoundsRefHs = null;
    let _laneRailBoundsRefChords = null;
    let _laneRailBoundsRefTpl = null;
    let _laneRailBoundsRefNotes = null;

    let _mergeCacheResult = null;
    let _mergeCacheChordsRef = null;
    let _mergeCacheHsRef = null;
    let _mergeCacheTplRef = null;
    let _arpGhostHsInferScratch = [];
    let _arpGhostInferRefHs = null;
    let _arpGhostInferRefNotes = null;
    let _arpGhostInferRefTpl = null;
    /** Handshape start-times where ghost fret numbers show but `[ ]` brackets are suppressed (synth-chord onset-match, not a genuine arpeggio). Read by `single-notes.js` too. */
    let _arpSynthOnsetHsSet = new Set();

    /**
     * Notes in active arpeggio handshapes must keep rendering their
     * fretboard ghost + brackets until `arpBounds.end`, even after their
     * onset+sustain exits the normal back-window (`t0 = now-0.5s`). Builds
     * a `Set` of `"t_s"` keys so the notes loop can skip the normal window
     * check for these notes.
     */
    function computeArpPersistKeys(arpGhostHsInfer, handShapes, notes, now, t0) {
        _scrArpPersistKeys.clear();
        if (arpGhostHsInfer && handShapes && notes) {
            for (let _hi = 0; _hi < handShapes.length; _hi++) {
                if (!arpGhostHsInfer[_hi]) continue;
                const _hs = handShapes[_hi];
                const _lo = chordInference.hsStart(_hs), _hi2 = chordInference.hsEnd(_hs);
                if (Number.isNaN(_lo) || Number.isNaN(_hi2)) continue;
                if (now > _hi2 + 0.05) continue; // arpeggio already ended
                // Only persist notes that have already exited the normal back-window (onset+sustain
                // < t0) — notes still in the window enter via the normal check.
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

    /**
     * Detects notes that are the slide/link destination of a preceding
     * note. Their gem (outline+core) is suppressed via `skipBody=true`,
     * but the sustain/slide trail still renders. `bundle.notes` carries no
     * authored `linkNext` flag — this is a timing/fret heuristic:
     * - Case 1: source has `sl`/`slu` — destination's fret equals the slide target.
     * - Case 2: same fret (hold), destination has `sl`/`slu` (hold->slide).
     * Sources can be single notes or chord notes.
     */
    function computeSlideTargetSet(notes, bundleChords, slideTargetSet, slideTargetNotesRef, slideTargetChordsRef) {
        if (notes !== slideTargetNotesRef || bundleChords !== slideTargetChordsRef) {
            slideTargetSet = null;
            if (notes && notes.length) {
                const stSet = new Set();
                const checkSrc = (srcT, srcS, srcF, srcSus, srcSl) => {
                    if (!(srcSus > 0)) return;
                    const endT = srcT + srcSus;
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

    /** Arpeggio lane purple-rail authored-marker + bounds caches. `hsLaneRail` empty/falsy returns the "no arpeggio lane rail this frame" all-null case. */
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
        if (_laneRailFlagsRefHs !== hsLaneRail || _laneRailFlagsRefTpl !== chordTemplates) {
            arpeggioLaneRail.fillLaneRailHandShapeFlags(hsLaneRail, chordTemplates, _arpLaneRailHsScratch);
            _laneRailFlagsRefHs = hsLaneRail;
            _laneRailFlagsRefTpl = chordTemplates;
        }
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

    /** Merges chart-format real chord rows with hand-shape-synthesized ones, skipping the merge when inputs match the previous call's. */
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

    /** Drops the nStr-dependent merge cache; call alongside the other string-dependent caches when nStr changes. */
    function resetMergeCache() {
        _mergeCacheResult = null;
    }

    /** Per-frame booleans: each `handShapes[i]` runs `inferArpeggioFromNotePattern` once so the note loop skips an O(hs*notes) rescan. Returns nulls when there are no hand shapes/notes this frame. */
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
