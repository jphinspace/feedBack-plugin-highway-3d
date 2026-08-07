import { AHEAD, GHOST_HOLD_AFTER_ONSET, K, NW } from '../../core/constants.js';
import { fretX } from '../../core/fret-geometry.js';
import { _noteKey, anchorLaneBoundsAt, lowerBoundT } from '../../core/chart-util.js';

// The standalone-note render loop -- moved verbatim out of update()'s
// "── Single notes ──" section (Stage 7 Track B, Track C). This is the
// note.js/chords.js sibling: it calls noteRenderer.drawNote() for every
// standalone (non-chord) note, draws that note's arpeggio brackets, and
// accumulates the same 6 camera/highway primitives chords.js accumulates
// for its own chord notes right afterward in the same frame.
//
// Two dependency shapes, matching note.js/chords.js's precedent:
//
// 1. `deps` (createSingleNoteRenderer's factory argument, injected once) --
//    per-instance closures (xFret/xFretMid/sY/validString -- lefty/nStr-
//    aware, can't be static imports), the noteRenderer/arpeggioLaneRail
//    facades, drawArpBrackets, ctx, and two persistent Maps
//    (_noteStreamBracketStrings, _ghostPrevBuf) SHARED with chords.js --
//    both loops read/write the same Map instances across the same frame
//    (this loop clears+populates _noteStreamBracketStrings; chords.js
//    checks it to skip duplicate bracket draws on a string this loop
//    already bracketed). _frameLabeledKeys is note.js's own per-frame
//    label-dedup set; this loop owns the once-per-frame .clear() since it
//    runs before chords.js in the same update() call.
// 2. `frame` (drawSingleNotes's parameter, the SAME `_noteFrame` object
//    update() builds once per call for noteRenderer.drawNote() AND
//    chordRenderer.drawChords() -- reused, not duplicated. update() now
//    populates the camera fields (camT0/camT1/camTau/camHystF/
//    camDistHystF/cameraMode/_leanSus) before calling EITHER loop (moved
//    earlier during this extraction -- previously they were only added
//    after this loop, purely for chords.js's benefit, since this loop
//    read the bare closure locals directly).
//
// `accum` is the SAME `_chordAccum` object chords.js's doc comment
// describes -- update() now seeds it once (highwayIntensity:0, camWX:0,
// camWSum:0, camDistMin:99, camDistMax:0, camDistGot:false) before calling
// this loop, which accumulates into it directly; chordRenderer.drawChords()
// continues accumulating into the SAME object afterward; update() copies
// the final values out to its own closure locals once, after both loops
// have run. This removes the previous copy-bare-vars-into-accum step
// (this loop used to write bare closure locals that were copied into
// `_chordAccum` only after it returned) -- accum was already the
// documented destination for both loops, so seeding it once up front is a
// simplification, not new behaviour: the same values reach the same
// downstream (Dynamic highway lane, Camera target) closure locals.
//
// `activeFrets` (Set) and `lastFretForString` (array) are passed as plain
// per-call parameters, same as chords.js -- both mutated via `.add()` /
// index-assign only, so an object-identity reference is enough.
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
        // Reset the per-frame fret-label dedup set so stacked labels from
        // multiple strings at the same onset/fret (arpeggio, synth chord) don't repeat.
        _frameLabeledKeys.clear();
        // Tracks which (chordId → Set<stringIndex>) pairs already had
        // brackets drawn by the note-stream loop, so the chord loop can
        // skip duplicate bracket draws for the same string.
        // Hoisted Map — clear (rather than reallocate) so the per-frame
        // chord-bracket dedupe doesn't churn GC in dense arpeggio passages.
        // (The inner Sets stored as values lose their Map reference on
        // .clear() and get GC'd along with the keys; only the outer Map
        // is reused.)
        _noteStreamBracketStrings.clear();
        lastFretForString.fill(undefined, 0, nStr);

        // Open-string note width: same outer span as chord frame (anchor + padX,
        // or default 4-fret window when chart has no anchor at t).
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
            // Start 30s before now — conservative enough to include any arpeggio
            // persist window while skipping the bulk of old notes in long songs.
            // The arpPersistKeys check below guards the rare notes that are even
            // older and still visible (only possible for unrealistically long HS).
            const _noteRenderLo = lowerBoundT(notes, now - 30);
            for (let _ni = _noteRenderLo; _ni < notes.length; _ni++) {
                const n = notes[_ni];
                if (n.f > 0 && n.t > now && n.t < now + 2) activeFrets.add(n.f);
                if (n.t > now) {
                    const dt = n.t - now;
                    if (dt < AHEAD) accum.highwayIntensity = Math.max(accum.highwayIntensity, 1 - dt / AHEAD);
                }
                // Far-future notes are always skipped — arpGhostActive
                // timing handles when the ghost appears for upcoming arp notes.
                // Notes are time-sorted so everything beyond t1 can be skipped entirely.
                if (n.t > t1) break;
                // Past-window arp notes are exempted from the back-window skip
                // so their fretboard ghost + brackets persist until arpBounds.end.
                // ndVerdictT0 extends the window when a note-detect provider is
                // attached so async verdicts still land while drawable.
                const _inArpPersist = arpPersistKeys.has(_noteKey(n.t, n.s));
                if (!_inArpPersist && n.t + (n.sus || 0) < ndVerdictT0) continue;
                if (!validString(n.s)) continue;
                // Suppress the gem for linkNext slide-target notes (skipBody=true).
                // The sustain/slide trail still renders because it now lives outside
                // the !skipBody gate in drawNote().
                const _isSlideTgt = !!(slideTargetSet && slideTargetSet.has(_noteKey(n.t, n.s)));
                // Always show the fret label — suppressing it for repeated frets on the same
                // string caused the label to be invisible throughout the note's flight and
                // only appear moments before being played (when the previous note's linger
                // window expired).  Each note now owns its label for its full flight.
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
                            // Open-string bracket X: always use the anchor at the
                            // handshape START time (not n.t, not now) so the bracket
                            // position stays fixed throughout the arpeggio even when
                            // the chart anchor changes mid-pattern.
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
                            // Record that this (chordId:occurrenceStart, string) pair has brackets
                            // so the chord loop doesn't draw a second set on the same string.
                            // Key includes the arp occurrence start time so two separate arp
                            // sequences sharing the same chord template ID don't suppress each other.
                            const _nsbKey = arGhostCid + ':' + _arpBoundsForNote.start;
                            let _nsbSet = _noteStreamBracketStrings.get(_nsbKey);
                            if (!_nsbSet) { _nsbSet = new Set(); _noteStreamBracketStrings.set(_nsbKey, _nsbSet); }
                            _nsbSet.add(n.s);
                        }
                    }
                }
                lastFretForString[n.s] = n.f;
                // Onset in window OR started before the window but
                // still sustaining right now. Gate sustain carry-over
                // against the current frame time so camera framing
                // releases as soon as the sustain is no longer
                // rendered on screen.
                if (!(cameraMode === 'lookahead')) {
                const nInWin = n.t >= camT0 && n.t <= camT1;
                const nSusActive = n.t < camT0 && n.t + (n.sus || 0) >= now;
                if (n.f > 0 && (nInWin || nSusActive)) {
                    // Symmetric decay around now: previously this
                    // clamped n.t - now at 0, giving every past-
                    // onset note weight 1. That was a tolerable
                    // approximation when the past window was 0.2 s
                    // (camT0), but the sustain extension widens
                    // the past side to seconds for held notes — a
                    // 2-second-old ringing sustain would otherwise
                    // pin camWX as strongly as a fresh note and
                    // stale-out the framing for the current
                    // phrase. Math.abs lets old sustains decay on
                    // the same time-constant as future notes,
                    // matching each mode's intent: twitchy
                    // (camTau=0.35 s) drops a 0.2 s-old note's
                    // weight to ~0.56 (consistent with "react to
                    // recent only"), calm (camTau=0.9 s) to ~0.80
                    // (consistent with "average a wider window").
                    // Weight is still 1 at onset.
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
