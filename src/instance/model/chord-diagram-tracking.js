import { DIAG_CROSSFADE_S, DIAG_ENTRANCE_S, DIAG_LINGER_S } from '../../core/constants.js';
import { lowerBoundT } from '../../core/chart-util.js';

// Chord-diagram state tracking: picks the most-recently-hit named chord,
// and drives the entrance + crossfade animation timings the 2D overlay
// (instance/overlay/chord-diagram.js) reads. Moved verbatim out of
// update()'s "── Chord diagram: track chord, drive entrance + crossfade
// animations ─" block (Stage 7 Track C).
//
// Unlike every other Track C section, the 7 fields this touches
// (_diagChord/_diagPrev/_diagPrevOpacity/_diagPrevStartOpacity/
// _diagPrevStartT/_diagLastKey/_diagEntranceT) are genuinely CROSS-FRAME
// persistent state, not single-frame-scoped locals -- and they're read by
// a DIFFERENT already-extracted function (draw(), still in main.js, which
// builds the `opts` object chord-diagram.js's drawChordDiagram(ctx, opts)
// actually takes) as well as reset in teardown()/destroy(). To keep the
// blast radius to just this one block, the 7 fields stay bare closure
// `let`s in main.js untouched -- draw()/teardown()/destroy() don't change
// at all. This function takes the current 6 input fields (everything
// except _diagEntranceT, which is pure output, recomputed every call) as
// explicit parameters and returns all 7 new values for main.js to
// destructure-assign back onto the same `let`s.
export function updateChordDiagramTracking(
    chordInference, chords, bundle, now, nStr,
    diagChord, diagPrev, diagPrevOpacity, diagPrevStartOpacity, diagPrevStartT, diagLastKey,
) {
    let newChord = null;
    if (chords) {
        // Only chords in (now - DIAG_LINGER_S, now] — use binary search
        // to skip past old chords, break once we pass `now`.
        const _dlo = lowerBoundT(chords, now - DIAG_LINGER_S);
        for (let _di = _dlo; _di < chords.length; _di++) {
            const ch = chords[_di];
            const chDt = ch.t - now;
            if (chDt > 0) break;
            if (!ch.notes) continue;
            const tmpl = bundle.chordTemplates?.[ch.id];
            const lbl = chordInference.chordTemplateLabel(tmpl);
            // Last valid chord (highest t ≤ now) naturally wins since array is sorted.
            if (lbl && tmpl?.frets) {
                newChord = { name: lbl, frets: tmpl.frets, t: ch.t, t0: ch.t, chDt, nStr };
            }
        }
    }

    // Include frets in the key so two templates sharing a display name but
    // differing in fingering each trigger a fresh crossfade/entrance.
    const newKey = newChord ? newChord.name + '|' + newChord.frets.join(',') : null;
    if (newKey !== diagLastKey) {
        if (diagChord && newKey !== null) {
            // Recompute outgoing alpha from stored event time rather than the
            // stale per-frame chDt; after dropped frames or seeks this prevents
            // the overlay jumping to a stale brightness before the crossfade.
            const freshChDt = diagChord.t !== undefined ? diagChord.t - now : diagChord.chDt;
            const prevOpacity = Math.max(0, Math.min(1, 1 + freshChDt / DIAG_LINGER_S));
            // Only crossfade when the outgoing chord is actually visible at now.
            // freshChDt > 0 means the old chord is in the future (backward seek
            // crossed the chord boundary).  In that case diagChord is stale, so
            // recompute the outgoing diagram from the chart — find the most recent
            // named chord that ends just before newChord.t and use it as diagPrev
            // so that seeking into a historical chord transition fades correctly
            // rather than snapping straight to the new chord.
            if (freshChDt <= 0 && prevOpacity > 0) {
                // Use the string count the outgoing chord was captured with, not the
                // current nStr — an arrangement switch during a 150 ms crossfade
                // must not remap the outgoing diagram onto the new layout.
                diagPrev = { name: diagChord.name, frets: diagChord.frets, nStr: diagChord.nStr ?? nStr, t: diagChord.t0 ?? diagChord.t ?? now };
                diagPrevStartOpacity = prevOpacity;
                diagPrevOpacity = prevOpacity;
                diagPrevStartT = now;
                // entranceT for the outgoing diagram is computed live from diagPrev.t
                // each frame (see draw path), so it rewinds correctly on backward seeks
                // within the crossfade window — no separate snapped state needed here.
            } else if (freshChDt > 0) {
                // Backward seek: diagChord is now in the future.
                // Look up the chart chord immediately before newChord.t to provide
                // the correct historical outgoing diagram for the crossfade.
                let histPrev = null;
                if (chords && newChord) {
                    // Find the most recent named chord before newChord.t.
                    // Chords are sorted ascending, so all matches are before
                    // lowerBoundT(chords, newChord.t); iterate in order and
                    // take the last valid one.
                    const _hpHi = lowerBoundT(chords, newChord.t);
                    for (let _hpi = 0; _hpi < _hpHi; _hpi++) {
                        const ch = chords[_hpi];
                        if (!ch.notes) continue;
                        const tmpl = bundle.chordTemplates?.[ch.id];
                        const lbl = chordInference.chordTemplateLabel(tmpl);
                        if (lbl && tmpl?.frets) {
                            histPrev = { name: lbl, frets: tmpl.frets, t: ch.t, t0: ch.t, nStr };
                        }
                    }
                }
                // Only start a crossfade if we are still within DIAG_CROSSFADE_S of
                // newChord.t; seeking further into the chord skips the crossfade.
                // Also skip if histPrev was no longer visible when newChord started
                // (gap longer than DIAG_LINGER_S), so only genuinely adjacent chord
                // transitions produce a crossfade — not seeks to just after any new
                // chord that happens to have an older chord somewhere earlier in the song.
                const elapsed = newChord ? now - newChord.t : Infinity;
                const histPrevVisible = histPrev && (newChord.t - histPrev.t) < DIAG_LINGER_S;
                if (histPrevVisible && elapsed >= 0 && elapsed < DIAG_CROSSFADE_S) {
                    // Start at the linger opacity the outgoing chord would have had at
                    // newChord.t during forward playback, not always 1.  This prevents
                    // a chord that was mostly faded from appearing brighter on a seek.
                    const histStartOpacity = Math.max(0, Math.min(1,
                        1 - (newChord.t - histPrev.t) / DIAG_LINGER_S));
                    diagPrev = histPrev;
                    diagPrevStartOpacity = histStartOpacity;
                    diagPrevOpacity = Math.max(0, histStartOpacity * (1 - elapsed / DIAG_CROSSFADE_S));
                    diagPrevStartT = newChord.t;
                } else {
                    diagPrev = null; diagPrevOpacity = 0; diagPrevStartOpacity = 0;
                    diagPrevStartT = null;
                }
            } else {
                // prevOpacity <= 0: old chord already fully faded, no crossfade needed.
                diagPrev = null; diagPrevOpacity = 0; diagPrevStartOpacity = 0;
                diagPrevStartT = null;
            }
        } else {
            diagPrev = null; diagPrevOpacity = 0; diagPrevStartOpacity = 0;
            diagPrevStartT = null;
        }
        diagLastKey = newKey;
        // Only update diagChord when the chord key actually changes so that a
        // lingering chord's original nStr is preserved on subsequent frames.
        // (newChord is rebuilt every frame with the live nStr; unconditionally
        // assigning here would stomp the captured nStr if the arrangement switches
        // while the same chord is still in its linger window.)
        diagChord = newChord;
    } else if (newKey !== null && newChord && diagChord) {
        // Same chord re-seen. Update linger expiry (t) when the event time changes.
        // Forward restrum (newChord.t > diagChord.t): extend the linger window
        // but preserve t0 so the entrance animation is NOT replayed — avoids the
        // overlay jumping back to its 0.85× scale on every strum of the same chord.
        // Backward seek to earlier occurrence (newChord.t < diagChord.t): update
        // both t and t0 to restart the entrance animation from the earlier position.
        if (newChord.t !== diagChord.t) {
            diagChord = newChord.t < diagChord.t
                ? { ...diagChord, t: newChord.t, t0: newChord.t }  // backward seek
                : { ...diagChord, t: newChord.t };                 // forward restrum
        }
    }

    // Guard for backward seeks within the same chord (same key, no branch above).
    // If diagPrevStartT is in the future relative to now, the crossfade was set up
    // during a later playback position that has since been seeked past. Clear it so
    // the stale outgoing diagram does not stay fully visible at the seek target.
    if (diagPrev && diagPrevStartT !== null && diagPrevStartT > now) {
        diagPrev = null; diagPrevOpacity = 0; diagPrevStartOpacity = 0;
        diagPrevStartT = null;
    }

    // Entrance: derived from t0 (the original appearance time, not updated on
    // forward restrums) so repeated hits of the same chord do not replay the
    // 0.85→1.0 scale animation. On backward seeks t0 is updated alongside t,
    // so the animation still rewinds correctly to the earlier position.
    const _entranceAnchor = diagChord && (diagChord.t0 ?? diagChord.t);
    const diagEntranceT = (diagChord && _entranceAnchor !== undefined)
        ? Math.min(1.0, Math.max(0, (now - _entranceAnchor) / DIAG_ENTRANCE_S))
        : 1.0;

    // Crossfade: derived from absolute start time so backward seeks within the
    // crossfade window correctly rewind the fade. diagPrev is kept alive (at
    // opacity 0) until the next key change rather than destroyed here, so that a
    // backward seek that re-enters the crossfade window can recompute a positive
    // opacity. Seeks before diagPrevStartT are handled by the guard above.
    if (diagPrev && diagPrevStartT !== null) {
        const fadedT = Math.max(0, now - diagPrevStartT);
        diagPrevOpacity = Math.max(0, diagPrevStartOpacity * (1 - fadedT / DIAG_CROSSFADE_S));
    }

    return {
        diagChord, diagPrev, diagPrevOpacity, diagPrevStartOpacity, diagPrevStartT,
        diagEntranceT, diagLastKey,
    };
}
