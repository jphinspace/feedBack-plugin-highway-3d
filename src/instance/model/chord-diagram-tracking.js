import { DIAG_CROSSFADE_S, DIAG_ENTRANCE_S, DIAG_LINGER_S } from '../../core/constants.js';
import { lowerBoundT } from '../../core/chart-util.js';

/**
 * Chord-diagram state tracking: picks the most-recently-hit named chord
 * and drives the entrance + crossfade animation timings the 2D overlay
 * (`instance/overlay/chord-diagram.js`) reads.
 *
 * The 7 fields this touches (`_diagChord`/`_diagPrev`/`_diagPrevOpacity`/
 * `_diagPrevStartOpacity`/`_diagPrevStartT`/`_diagLastKey`/`_diagEntranceT`)
 * are cross-frame persistent state also read by `draw()` and reset by
 * `teardown()`/`destroy()` in `main.js`. To keep those untouched, this
 * function takes the 6 input fields as explicit parameters (everything
 * except `_diagEntranceT`, pure output) and returns all 7 new values for
 * `main.js` to destructure-assign back onto its own `let`s.
 */
export function updateChordDiagramTracking(
    chordInference, chords, bundle, now, nStr,
    diagChord, diagPrev, diagPrevOpacity, diagPrevStartOpacity, diagPrevStartT, diagLastKey,
) {
    let newChord = null;
    if (chords) {
        // Only chords in (now - DIAG_LINGER_S, now] — binary search past old chords, break once past `now`.
        const _dlo = lowerBoundT(chords, now - DIAG_LINGER_S);
        for (let _di = _dlo; _di < chords.length; _di++) {
            const ch = chords[_di];
            const chDt = ch.t - now;
            if (chDt > 0) break;
            if (!ch.notes) continue;
            const tmpl = bundle.chordTemplates?.[ch.id];
            const lbl = chordInference.chordTemplateLabel(tmpl);
            // Last valid chord (highest t <= now) naturally wins since the array is sorted.
            if (lbl && tmpl?.frets) {
                newChord = { name: lbl, frets: tmpl.frets, t: ch.t, t0: ch.t, chDt, nStr };
            }
        }
    }

    // Include frets in the key so two templates sharing a display name but differing in
    // fingering each trigger a fresh crossfade/entrance.
    const newKey = newChord ? newChord.name + '|' + newChord.frets.join(',') : null;
    if (newKey !== diagLastKey) {
        if (diagChord && newKey !== null) {
            // Recompute outgoing alpha from the stored event time rather than the stale
            // per-frame chDt, so dropped frames/seeks don't jump the overlay to a stale brightness.
            const freshChDt = diagChord.t !== undefined ? diagChord.t - now : diagChord.chDt;
            const prevOpacity = Math.max(0, Math.min(1, 1 + freshChDt / DIAG_LINGER_S));
            // freshChDt > 0 means the old chord is now in the future (a backward seek crossed
            // the chord boundary) — diagChord is stale, so recompute the outgoing diagram from
            // the chart instead, so a seek into a historical transition still fades correctly.
            if (freshChDt <= 0 && prevOpacity > 0) {
                // Use the string count the outgoing chord was captured with, not the current
                // nStr, so an arrangement switch mid-crossfade doesn't remap it onto the new layout.
                diagPrev = { name: diagChord.name, frets: diagChord.frets, nStr: diagChord.nStr ?? nStr, t: diagChord.t0 ?? diagChord.t ?? now };
                diagPrevStartOpacity = prevOpacity;
                diagPrevOpacity = prevOpacity;
                diagPrevStartT = now;
                // entranceT for the outgoing diagram is recomputed live from diagPrev.t each
                // frame (see draw path), so it rewinds correctly on backward seeks within the window.
            } else if (freshChDt > 0) {
                // Backward seek: diagChord is now in the future. Look up the chart chord
                // immediately before newChord.t to supply the correct historical outgoing diagram.
                let histPrev = null;
                if (chords && newChord) {
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
                // Only crossfade if still within DIAG_CROSSFADE_S of newChord.t, and only if
                // histPrev was still visible when newChord started — so only genuinely adjacent
                // chord transitions crossfade, not a seek near any older chord in the song.
                const elapsed = newChord ? now - newChord.t : Infinity;
                const histPrevVisible = histPrev && (newChord.t - histPrev.t) < DIAG_LINGER_S;
                if (histPrevVisible && elapsed >= 0 && elapsed < DIAG_CROSSFADE_S) {
                    // Start at the linger opacity the outgoing chord would have had at
                    // newChord.t during forward playback, not always 1.
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
                diagPrev = null; diagPrevOpacity = 0; diagPrevStartOpacity = 0;
                diagPrevStartT = null;
            }
        } else {
            diagPrev = null; diagPrevOpacity = 0; diagPrevStartOpacity = 0;
            diagPrevStartT = null;
        }
        diagLastKey = newKey;
        // Only update diagChord when the key changes, so a lingering chord's captured nStr
        // survives an arrangement switch that happens during its linger window.
        diagChord = newChord;
    } else if (newKey !== null && newChord && diagChord) {
        // Same chord re-seen: forward restrum (newChord.t > diagChord.t) extends the linger
        // window but preserves t0 so the entrance animation doesn't replay. Backward seek to an
        // earlier occurrence (newChord.t < diagChord.t) updates both t and t0 to restart it.
        if (newChord.t !== diagChord.t) {
            diagChord = newChord.t < diagChord.t
                ? { ...diagChord, t: newChord.t, t0: newChord.t }
                : { ...diagChord, t: newChord.t };
        }
    }

    // Guard for a backward seek within the same chord (no branch above): if diagPrevStartT is
    // still in the future relative to now, the crossfade was set up at a position since seeked
    // past — clear it so a stale outgoing diagram doesn't stay fully visible at the seek target.
    if (diagPrev && diagPrevStartT !== null && diagPrevStartT > now) {
        diagPrev = null; diagPrevOpacity = 0; diagPrevStartOpacity = 0;
        diagPrevStartT = null;
    }

    // Entrance derives from t0 (original appearance time, not updated on forward restrums) so
    // repeated hits of the same chord don't replay the 0.85->1.0 scale animation.
    const _entranceAnchor = diagChord && (diagChord.t0 ?? diagChord.t);
    const diagEntranceT = (diagChord && _entranceAnchor !== undefined)
        ? Math.min(1.0, Math.max(0, (now - _entranceAnchor) / DIAG_ENTRANCE_S))
        : 1.0;

    // Crossfade derives from an absolute start time so backward seeks within the window
    // correctly rewind the fade. diagPrev stays alive (at opacity 0) until the next key change
    // rather than being destroyed here, so a re-entered seek can recompute a positive opacity.
    if (diagPrev && diagPrevStartT !== null) {
        const fadedT = Math.max(0, now - diagPrevStartT);
        diagPrevOpacity = Math.max(0, diagPrevStartOpacity * (1 - fadedT / DIAG_CROSSFADE_S));
    }

    return {
        diagChord, diagPrev, diagPrevOpacity, diagPrevStartOpacity, diagPrevStartT,
        diagEntranceT, diagLastKey,
    };
}
