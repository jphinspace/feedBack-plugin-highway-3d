import { AHEAD, GHOST_HOLD_AFTER_ONSET, K, NW } from '../../core/constants.js';
import { fretX } from '../../core/fret-geometry.js';
import { _noteKey, anchorLaneBoundsAt, lowerBoundT } from '../../core/chart-util.js';

/**
 * The standalone-note render loop — `chords.js`'s sibling. Calls
 * `noteRenderer.drawNote()` for every standalone (non-chord) note, draws
 * that note's arpeggio brackets, and accumulates the same camera/highway
 * primitives `chords.js` accumulates for its own chord notes right
 * afterward in the same frame.
 *
 * Two dependency shapes, matching `note.js`/`chords.js`:
 * 1. `deps` (injected once): per-instance closures (lefty/nStr-aware, so
 *    not static imports), the `noteRenderer`/`arpeggioLaneRail` facades,
 *    `ctx`, and two persistent Maps shared with `chords.js`
 *    (`_noteStreamBracketStrings`, `_ghostPrevBuf`) — both loops read/write
 *    the same instances across the same frame: this loop clears +
 *    populates `_noteStreamBracketStrings`, `chords.js` checks it to skip
 *    duplicate bracket draws on a string this loop already bracketed.
 *    `_frameLabeledKeys` is owned here (cleared once per frame) since this
 *    loop runs before `chords.js` in the same `update()` call.
 * 2. `frame` (parameter): the same `_noteFrame` object `update()` builds
 *    once per call for both `noteRenderer.drawNote()` and
 *    `chordRenderer.drawChords()`.
 *
 * `accum` is the same `_chordAccum` object both loops accumulate into —
 * `update()` seeds it once before either loop runs and copies the final
 * values out to its own closure locals once both have finished.
 * `activeFrets` (Set) and `lastFretForString` (array) are plain per-call
 * parameters, mutated via `.add()`/index-assign, same as `chords.js`.
 */
export function createSingleNoteRenderer(deps) {
    const {
        noteRenderer, arpeggioLaneRail, validString, xFret, xFretMid, sY,
        drawArpBrackets, ctx, _ghostPrevBuf, _noteStreamBracketStrings, _frameLabeledKeys,
    } = deps;

    function drawSingleNotes(
        notes, anchors, bundle, now, t1, ndVerdictT0, activeFrets, lastFretForString,
        arpGhostHsInfer, arpPersistKeys, slideTargetSet, arpSynthOnsetHsSet,
        accum, frame,
    ) {
        const { nStr, camT0, camT1, camTau, cameraMode } = frame;
        // Reset the per-frame fret-label dedup set so stacked labels from multiple strings at
        // the same onset/fret (arpeggio, synth chord) don't repeat.
        _frameLabeledKeys.clear();
        // Tracks which (chordId -> Set<stringIndex>) pairs already had brackets drawn by this
        // loop, so the chord loop can skip duplicates. Cleared (not reallocated) to avoid GC
        // churn in dense arpeggio passages; the value Sets lose their Map reference on clear().
        _noteStreamBracketStrings.clear();
        lastFretForString.fill(undefined, 0, nStr);

        // Open-string note width: same outer span as the chord frame (anchor + padX, or a
        // default 4-fret window when the chart has no anchor at t).
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

        if (notes) {
            // Start 30s before now — conservative enough to include any arpeggio persist
            // window while skipping the bulk of old notes in long songs; arpPersistKeys below
            // guards the rare notes even older than that (unrealistically long hand-shapes).
            const _noteRenderLo = lowerBoundT(notes, now - 30);
            for (let _ni = _noteRenderLo; _ni < notes.length; _ni++) {
                const n = notes[_ni];
                if (n.f > 0 && n.t > now && n.t < now + 2) activeFrets.add(n.f);
                if (n.t > now) {
                    const dt = n.t - now;
                    if (dt < AHEAD) accum.highwayIntensity = Math.max(accum.highwayIntensity, 1 - dt / AHEAD);
                }
                // Notes are time-sorted so everything beyond t1 can be skipped entirely.
                if (n.t > t1) break;
                // Past-window arp notes are exempted from the back-window skip so their
                // fretboard ghost + brackets persist until arpBounds.end. ndVerdictT0 extends
                // the window when a note-detect provider is attached so async verdicts still land.
                const _inArpPersist = arpPersistKeys.has(_noteKey(n.t, n.s));
                if (!_inArpPersist && n.t + (n.sus || 0) < ndVerdictT0) continue;
                if (!validString(n.s)) continue;
                // Suppress the gem for linkNext slide-target notes; the sustain/slide trail
                // still renders since it lives outside the !skipBody gate in drawNote().
                const _isSlideTgt = !!(slideTargetSet && slideTargetSet.has(_noteKey(n.t, n.s)));
                // Every note owns its label for its full flight — suppressing it for repeated
                // frets on the same string made the label invisible until moments before being played.
                const skipLabel = false;
                let singleOpenX;
                if (n.f === 0) {
                    const ab = anchorLaneBoundsAt(anchors, n.t);
                    if (ab) singleOpenX = (xFret(ab.dMin) + xFret(ab.dMax)) / 2;
                }
                const singleOpenLaneW = n.f === 0 ? openNoteLaneBoxW(n.t) : undefined;
                const arGhostCid = arpeggioLaneRail.arpeggioChordIdForNoteWithInferCache(
                    n,
                    bundle.handShapes,
                    bundle.chordTemplates,
                    notes,
                    arpGhostHsInfer,
                );
                const _arpBoundsForNote = arGhostCid != null
                    ? arpeggioLaneRail.arpHsBoundsForNote(n, bundle.handShapes, arpGhostHsInfer)
                    : null;
                noteRenderer.drawNote(
                    n,
                    now,
                    singleOpenX,
                    skipLabel,
                    _isSlideTgt,
                    GHOST_HOLD_AFTER_ONSET,
                    singleOpenLaneW,
                    arGhostCid != null,
                    arGhostCid,
                    arGhostCid != null,
                    _arpBoundsForNote,
                    _ghostPrevBuf.get(Math.round(n.t * 1e4) * 10 + n.s) ?? -Infinity,
                    _arpBoundsForNote !== null, // showDropLine: white line for arp note-stream notes
                    frame,
                );
                if (arGhostCid != null) {
                    const _arpBounds = _arpBoundsForNote;
                    if (_arpBounds) {
                        // Synth-onset-match handshapes show ghost fret numbers but not [ ] brackets.
                        if (!arpSynthOnsetHsSet.has(_arpBounds.start)) {
                            // Open-string bracket X uses the anchor at the handshape START time (not
                            // n.t, not now) so the bracket position stays fixed throughout the arpeggio
                            // even if the chart anchor changes mid-pattern.
                            const _arpBrktAncB = n.f === 0
                                ? anchorLaneBoundsAt(anchors, _arpBounds.start)
                                : null;
                            const _bx = n.f === 0
                                ? (_arpBrktAncB
                                    ? (xFret(_arpBrktAncB.dMin) + xFret(_arpBrktAncB.dMax)) / 2
                                    : (singleOpenX !== undefined ? singleOpenX : ctx.cam.curX))
                                : xFretMid(n.f);
                            const _openHalfW = (() => {
                                if (n.f !== 0) return null;
                                if (_arpBrktAncB) {
                                    const _xl = xFret(_arpBrktAncB.dMin), _xr = xFret(_arpBrktAncB.dMax);
                                    if (_xr > _xl) return Math.max(0.22, (_xr - _xl + NW * 0.4 * 2) * 0.96 / (40 * K)) * 20 * K;
                                }
                                return singleOpenLaneW != null ? Math.max(0.22, singleOpenLaneW * 0.96 / (40 * K)) * 20 * K : null;
                            })();
                            drawArpBrackets(_bx, sY(n.s), _arpBounds.start - now, _arpBounds.end, now, n.s, n.f === 0, _openHalfW);
                            // Records that this (chordId:occurrenceStart, string) pair has brackets so
                            // the chord loop doesn't draw a second set on the same string. The key
                            // includes the occurrence start time so two arp sequences sharing the same
                            // chord template ID don't suppress each other.
                            const _nsbKey = arGhostCid + ':' + _arpBoundsForNote.start;
                            let _nsbSet = _noteStreamBracketStrings.get(_nsbKey);
                            if (!_nsbSet) { _nsbSet = new Set(); _noteStreamBracketStrings.set(_nsbKey, _nsbSet); }
                            _nsbSet.add(n.s);
                        }
                    }
                }
                lastFretForString[n.s] = n.f;
                // Onset in window OR started before it but still sustaining now — gated against
                // the current frame time so camera framing releases once the sustain stops rendering.
                if (!(cameraMode === 'lookahead')) {
                const nInWin = n.t >= camT0 && n.t <= camT1;
                const nSusActive = n.t < camT0 && n.t + (n.sus || 0) >= now;
                if (n.f > 0 && (nInWin || nSusActive)) {
                    // Symmetric decay around now (Math.abs), not just for future notes: the
                    // sustain extension widens the past side to seconds for held notes, so
                    // clamping at 0 would let a multi-second-old ringing sustain pin camWX as
                    // strongly as a fresh note. This lets old sustains decay on the same
                    // time-constant as future notes — twitchy mode (camTau=0.35s) drops a
                    // 0.2s-old note's weight to ~0.56, calm mode (camTau=0.9s) to ~0.80; weight
                    // is still 1 at onset either way.
                    const w = Math.exp(-Math.abs(n.t - now) / camTau);
                    accum.camWX   += xFretMid(n.f) * w;
                    accum.camWSum += w;
                    if (n.f < accum.camDistMin) accum.camDistMin = n.f;
                    if (n.f > accum.camDistMax) accum.camDistMax = n.f;
                    accum.camDistGot = true;
                }
                }
            }
        }
    }

    return { drawSingleNotes };
}
