import { NEXT_ON_STRING_T_EPS } from '../../core/constants.js';
import { _noteKey, lowerBoundT } from '../../core/chart-util.js';

// Two small chart-derived pre-passes -- moved verbatim out of update()
// (Stage 7 Track C). Both feed the standalone-note render loop
// (instance/render/single-notes.js) as explicit parameters (arpPersistKeys,
// slideTargetSet); bundled into one file since neither is big enough to
// warrant its own.
export function createArpAndSlidePrepasses({ chordInference, _scrArpPersistKeys }) {
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

    return { computeArpPersistKeys, computeSlideTargetSet };
}
