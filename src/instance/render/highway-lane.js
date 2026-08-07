import {
    AHEAD, BEHIND, HIGHWAY_LANE_STRIPE_OP_BASE, HIGHWAY_LANE_STRIPE_OP_INT,
    HIGHWAY_LANE_TIME_SLICES, K, NFRETS, NH, S_BASE, TS, VENUE_LANE_OP_BOOST,
} from '../../core/constants.js';
import { dZ } from '../../core/fret-geometry.js';
import { getChartAnchorAt, laneBoundsFromAnchor } from '../../core/chart-util.js';
import { _venueSceneOverride } from '../../background/venue.js';

// The dynamic highway lane (the highlighted strip under active frets) +
// its nested fret-boundary extension lines -- moved verbatim out of
// update() (Stage 7 Track C). Construction-time-only deps (pools/
// materials/facades), same as every initScene()-cluster extraction;
// the interesting part is the per-call surface:
//
// - `highwayIntensity` and `fretDividersVisible` are read-only snapshots
//   for this call (both fully settled by the time update() reaches this
//   point in the frame -- highwayIntensity via the single-notes/chords
//   accum copy-back, fretDividersVisible a settings snapshot that never
//   changes mid-frame), so they're plain parameters, not live getters.
// - `hwyLaneArpOuterDividers`/`arpLaneRimAccentMul`/`arpLaneS` (the arp-
//   outer-rail prep block) turned out to be used ONLY inside this
//   section (verified via whole-file grep) despite being computed
//   earlier in update(), ahead of the unrelated "Fret-wire hit flash"
//   block -- moved to be fully local here; nothing else in update()
//   ever reads them, and the fret-wire block doesn't touch any of the
//   lane-rail variables either, so reordering the (independent) prep
//   after fret-wire-hit-flash instead of before it is a no-op for
//   observable behaviour.
// - `_laneSeg*` (the parallel scratch arrays for the anchor-driven
//   segmented lane) were previously main.js closure-level scratch but,
//   like chords.js's `_scrChordNote`, are referenced ONLY inside this
//   section -- moved to be genuinely private state of this factory.
// - Returns `{ hwyLaneFretClipMin, hwyLaneFretClipMax }`: the one piece
//   of state that escapes this section, consumed later in update() by
//   the fret-column reference markers (their cadence-row clipping).
export function createHighwayLane({
    pLane, pLaneDivider, mLaneOdd, mLaneEven, mLaneDivider, mLaneDividerArp, mLaneDividerExt,
    xFret, arpeggioLaneRail, arpeggioLaneDividerXYScaleMatchFrameRim,
}) {
    const _laneSegDMin = [];
    const _laneSegDMax = [];
    const _laneSegZ0 = [];
    const _laneSegZ1 = [];
    const _laneSegTLo = [];
    const _laneSegTHi = [];
    const _laneSegArp = [];
    let _laneSegLen = 0;

    function drawHighwayLane(
        anchors, bundle, now, chords, activeFrets,
        laneRailArpHsFlags, laneRailBoundLo, laneRailBoundHi,
        highwayIntensity, fretDividersVisible,
    ) {
        let hwyLaneFretClipMin = null, hwyLaneFretClipMax = null;

        const handShapesRails = bundle.handShapes;
        const hwyLaneArpOuterDividers = !!(handShapesRails && handShapesRails.length && laneRailArpHsFlags
            && arpeggioLaneRail.arpeggioLaneOuterRailAtChartTime(
                now, handShapesRails, laneRailBoundLo, laneRailBoundHi, laneRailArpHsFlags,
            ));
        const arpLaneRimAccentMul = hwyLaneArpOuterDividers && laneRailArpHsFlags && handShapesRails
            ? arpeggioLaneRail.arpeggioLaneDividerFrameAccentMul(
                now, handShapesRails, chords, laneRailBoundLo, laneRailBoundHi, laneRailArpHsFlags,
            )
            : 1;
        const arpLaneS = hwyLaneArpOuterDividers
            ? arpeggioLaneDividerXYScaleMatchFrameRim(arpLaneRimAccentMul)
            : 1;

        // ── Dynamic highway lane ──────────────────────────────────────
        // Chart <anchor> tags drive the lane whenever they exist — do not
        // require nearby notes (activeFrets) or camera-driven activity.
        const hasChartAnchors = anchors && anchors.length;
        if (hasChartAnchors || activeFrets.size > 0) {
            // Lane tint: one translucent quad per playable fret column, exact
            // wire→wire span (no horizontal pad) — see HIGHWAY_LANE_STRIPE_*.
            const boardY = S_BASE - NH / 2 - 2 * K;

            if (hasChartAnchors) {
                const nearB = laneBoundsFromAnchor(getChartAnchorAt(anchors, now));
                if (nearB) {
                    hwyLaneFretClipMin = nearB.dMin;
                    hwyLaneFretClipMax = nearB.dMax;
                }

                // Span the full (AHEAD + BEHIND) window so the lane's far edge
                // lands at dZ(AHEAD) = -AHEAD*TS, aligned with the note horizon.
                // Using just AHEAD here made the far edge stop at -TS*(AHEAD-BEHIND),
                // leaving the last BEHIND seconds of notes without a lane underneath.
                const sliceDt = (AHEAD + BEHIND) / HIGHWAY_LANE_TIME_SLICES;
                // Single-pass build-and-merge into the parallel-array
                // scratch buffers. Consecutive slices that resolve to the
                // same anchor bounds collapse into one segment by extending
                // its z1; otherwise a new entry appends. No per-frame array
                // or {b,z0,z1} object allocations.
                _laneSegLen = 0;
                for (let k = 0; k < HIGHWAY_LANE_TIME_SLICES; k++) {
                    const dt0 = k * sliceDt;
                    const dt1 = (k + 1) * sliceDt;
                    const tC = now + (dt0 + dt1) * 0.5 - BEHIND;
                    const b = laneBoundsFromAnchor(getChartAnchorAt(anchors, tC));
                    if (!b) continue;
                    // The lane STOPS AT THE HIT LINE (z = 0) — issue #991. The
                    // slice window starts BEHIND seconds in the past, so the
                    // first slices map to positive z, i.e. past the hit line
                    // toward the player. Nothing is ever drawn there: notes and
                    // chord frames clamp to Math.min(0, dZ(dt)), so that strip
                    // is lane with nothing on it. Clamp the NEAR edge only —
                    // the far edge stays at dZ(AHEAD+BEHIND)+TS*BEHIND = -AHEAD*TS,
                    // aligned with the note horizon, exactly as before.
                    const z0 = Math.min(0, dZ(dt0) + TS * BEHIND);
                    const z1 = Math.min(0, dZ(dt1) + TS * BEHIND);
                    // Slice lies entirely past the hit line -> zero length, nothing
                    // to draw. Skip before the arp probe so it costs nothing.
                    if (z0 === z1) continue;
                    const arpSlice = (laneRailArpHsFlags && handShapesRails && handShapesRails.length)
                        ? arpeggioLaneRail.arpeggioLaneOuterRailLaneSlice(
                            dt0, dt1, now,
                            handShapesRails, laneRailBoundLo, laneRailBoundHi, laneRailArpHsFlags,
                        )
                        : false;
                    if (_laneSegLen > 0
                        && _laneSegDMin[_laneSegLen - 1] === b.dMin
                        && _laneSegDMax[_laneSegLen - 1] === b.dMax
                        && arpSlice === _laneSegArp[_laneSegLen - 1]) {
                        _laneSegZ1[_laneSegLen - 1] = z1;
                        _laneSegTHi[_laneSegLen - 1] = tC;
                    } else if (_laneSegLen > 0
                        && _laneSegDMin[_laneSegLen - 1] === b.dMin
                        && _laneSegDMax[_laneSegLen - 1] === b.dMax
                        && arpSlice !== _laneSegArp[_laneSegLen - 1]) {
                        _laneSegDMin[_laneSegLen] = b.dMin;
                        _laneSegDMax[_laneSegLen] = b.dMax;
                        _laneSegZ0[_laneSegLen] = z0;
                        _laneSegZ1[_laneSegLen] = z1;
                        _laneSegTLo[_laneSegLen] = tC;
                        _laneSegTHi[_laneSegLen] = tC;
                        _laneSegArp[_laneSegLen] = arpSlice;
                        _laneSegLen++;
                    } else {
                        _laneSegDMin[_laneSegLen] = b.dMin;
                        _laneSegDMax[_laneSegLen] = b.dMax;
                        _laneSegZ0[_laneSegLen] = z0;
                        _laneSegZ1[_laneSegLen] = z1;
                        _laneSegTLo[_laneSegLen] = tC;
                        _laneSegTHi[_laneSegLen] = tC;
                        _laneSegArp[_laneSegLen] = arpSlice;
                        _laneSegLen++;
                    }
                }
                {
                    const laneOp = (HIGHWAY_LANE_STRIPE_OP_BASE + highwayIntensity * HIGHWAY_LANE_STRIPE_OP_INT)
                        * (_venueSceneOverride ? VENUE_LANE_OP_BOOST : 1);
                    // 2 shared materials (odd/even); opacity travels via the
                    // material so set it once per frame, not per mesh.
                    mLaneOdd.opacity = laneOp;
                    mLaneEven.opacity = laneOp;
                    for (let s = 0; s < _laneSegLen; s++) {
                        const segZ0 = _laneSegZ0[s];
                        const segZ1 = _laneSegZ1[s];
                        const stripLen = Math.max(Math.abs(segZ1 - segZ0), 1e-6);
                        const zc = (segZ0 + segZ1) * 0.5;
                        const fLow = _laneSegDMin[s] + 1;
                        const fHi = _laneSegDMax[s];
                        for (let f = fLow; f <= fHi; f++) {
                            const xl = xFret(f - 1), xr = xFret(f);
                            const laneW = Math.abs(xr - xl);
                            const lane = pLane.get();
                            lane.position.set((xl + xr) * 0.5, boardY + 0.02 * K, zc);
                            lane.rotation.x = -Math.PI / 2;
                            lane.scale.set(laneW, stripLen, 1);
                            const odd = ((f - fLow) & 1) === 0;
                            lane.material = odd ? mLaneOdd : mLaneEven;
                            lane.renderOrder = 1;
                        }
                    }
                }

                {
                    const yPos = boardY + 0.03 * K;
                    const divOpArp = Math.min(0.92, 0.16 + highwayIntensity * 0.42);
                    if (mLaneDividerArp) {
                        mLaneDividerArp.opacity = divOpArp;
                    }

                    for (let s = 0; s < _laneSegLen; s++) {
                        const segZ0 = _laneSegZ0[s];
                        const segZ1 = _laneSegZ1[s];
                        const dz = Math.max(Math.abs(segZ1 - segZ0), 1e-6);
                        const zMid = (segZ0 + segZ1) * 0.5;
                        const dMinSeg = _laneSegDMin[s];
                        const dMaxSeg = _laneSegDMax[s];
                        const fDiv0 = Math.floor(dMinSeg);
                        const fDiv1 = Math.ceil(dMaxSeg);
                        for (let f = fDiv0; f <= fDiv1; f++) {
                            if (_laneSegArp[s] && (f === fDiv0 || f === fDiv1)) continue;
                            const div = pLaneDivider.get();
                            div.position.set(xFret(f), yPos, zMid);
                            div.material = mLaneDivider;
                            div.scale.set(1, 1, dz);
                            div.renderOrder = 2;
                        }
                    }
                    for (let s = 0; s < _laneSegLen; s++) {
                        if (!_laneSegArp[s]) continue;
                        const dMinSeg = _laneSegDMin[s];
                        const dMaxSeg = _laneSegDMax[s];
                        const fL = Math.floor(dMinSeg);
                        const fR = Math.ceil(dMaxSeg);
                        const segZ0 = _laneSegZ0[s];
                        const segZ1 = _laneSegZ1[s];
                        const arpRailLen = Math.max(Math.abs(segZ1 - segZ0), 1e-6);
                        const zArpMid = (segZ0 + segZ1) * 0.5;
                        const tMidSeg = (_laneSegTLo[s] + _laneSegTHi[s]) * 0.5;
                        const arpMulSeg = (laneRailArpHsFlags && handShapesRails && handShapesRails.length)
                            ? arpeggioLaneRail.arpeggioLaneDividerFrameAccentMul(
                                tMidSeg, handShapesRails, chords,
                                laneRailBoundLo, laneRailBoundHi, laneRailArpHsFlags,
                            )
                            : 1;
                        const arpSSeg = arpeggioLaneDividerXYScaleMatchFrameRim(arpMulSeg);
                        for (const xf of [fL, fR]) {
                            const div = pLaneDivider.get();
                            div.position.set(xFret(xf), yPos, zArpMid);
                            div.material = mLaneDividerArp;
                            div.scale.set(arpSSeg, arpSSeg, arpRailLen);
                            div.renderOrder = 2;
                        }
                    }
                }
            } else {
                let dMin, dMax;
                let divMin, divMax;
                let minF = 99, maxF = 0;
                activeFrets.forEach(f => { if (f > 0) { minF = Math.min(minF, f); maxF = Math.max(maxF, f); } });
                dMin = minF - 1;
                dMax = maxF;
                const MIN_LANE_SPAN_FRETS = 4;
                let span = dMax - dMin;
                if (span > MIN_LANE_SPAN_FRETS) {
                    dMin = Math.round((dMin + dMax - MIN_LANE_SPAN_FRETS) / 2);
                    dMax = dMin + MIN_LANE_SPAN_FRETS;
                    if (dMax > NFRETS) {
                        dMax = NFRETS;
                        dMin = dMax - MIN_LANE_SPAN_FRETS;
                    }
                    if (dMin < 0) {
                        dMin = 0;
                        dMax = MIN_LANE_SPAN_FRETS;
                    }
                } else if (span < MIN_LANE_SPAN_FRETS) {
                    const need = MIN_LANE_SPAN_FRETS - span;
                    dMax = Math.min(NFRETS, dMax + need);
                    if (dMax - dMin < MIN_LANE_SPAN_FRETS) {
                        dMin = Math.max(0, dMin - (MIN_LANE_SPAN_FRETS - (dMax - dMin)));
                    }
                }
                if (dMax < dMin) dMax = dMin;
                hwyLaneFretClipMin = dMin;
                hwyLaneFretClipMax = dMax;
                divMin = dMin;
                divMax = dMax;

                // Far edge at -AHEAD*TS (the note horizon), near edge at the
                // hit line (z = 0) — the lane does not run past it toward the
                // player, where nothing is ever drawn (#991). Spanning
                // AHEAD+BEHIND and shifting by +TS*BEHIND put the near edge at
                // +TS*BEHIND; spanning AHEAD alone keeps the same far edge.
                const laneLen = TS * AHEAD;
                const zLane = -laneLen / 2;
                const laneOp = (HIGHWAY_LANE_STRIPE_OP_BASE + highwayIntensity * HIGHWAY_LANE_STRIPE_OP_INT)
                    * (_venueSceneOverride ? VENUE_LANE_OP_BOOST : 1);
                mLaneOdd.opacity = laneOp;
                mLaneEven.opacity = laneOp;
                const fLow = dMin + 1;
                const fHi = dMax;
                for (let f = fLow; f <= fHi; f++) {
                    const xl = xFret(f - 1), xr = xFret(f);
                    const laneWStrip = Math.abs(xr - xl);
                    const lane = pLane.get();
                    lane.position.set((xl + xr) / 2, boardY + 0.02 * K, zLane);
                    lane.rotation.x = -Math.PI / 2;
                    lane.scale.set(laneWStrip, laneLen, 1);
                    const odd = ((f - fLow) & 1) === 0;
                    lane.material = odd ? mLaneOdd : mLaneEven;
                    lane.renderOrder = 1;
                }

                if (highwayIntensity > 0.05) {
                    // Matches the lane above: ends at the hit line (#991).
                    const divLen = TS * AHEAD;
                    const yPos = boardY + 0.03 * K;
                    const divOp2 = 0.02 + highwayIntensity * 0.1;
                    const divOpArp2 = Math.min(0.92, 0.16 + highwayIntensity * 0.42);
                    if (mLaneDivider && mLaneDividerArp) {
                        mLaneDivider.opacity = divOp2;
                        mLaneDividerArp.opacity = divOpArp2;
                    }
                    const fDivA = Math.floor(divMin);
                    const fDivB = Math.ceil(divMax);
                    for (let f = fDivA; f <= fDivB; f++) {
                        if (hwyLaneArpOuterDividers && (f === fDivA || f === fDivB)) continue;
                        const div = pLaneDivider.get();
                        div.position.set(xFret(f), yPos, -divLen * 0.5);
                        div.material = mLaneDivider;
                        div.scale.set(1, 1, divLen);
                        div.renderOrder = 2;
                    }
                    if (hwyLaneArpOuterDividers) {
                        for (const xf of [fDivA, fDivB]) {
                            const div = pLaneDivider.get();
                            div.position.set(xFret(xf), yPos, zLane);
                            div.material = mLaneDividerArp;
                            div.scale.set(arpLaneS, arpLaneS, laneLen);
                            div.renderOrder = 2;
                        }
                    }
                }
            }

            // ── Fret boundary extension lines ─────────────────────────
            if (mLaneDividerExt && fretDividersVisible) {
                // Same hit-line stop as the lane (#991) — otherwise these lines
                // would be the only floor geometry still running past it.
                const extLaneLen = TS * AHEAD;
                const extZMid = -extLaneLen / 2;
                const extYPos = boardY + 0.03 * K;
                mLaneDividerExt.opacity = Math.max(0.3, 0.3 + highwayIntensity * 0.15);
                for (let f = 0; f <= NFRETS; f++) {
                    const div = pLaneDivider.get();
                    div.position.set(xFret(f), extYPos, extZMid);
                    div.material = mLaneDividerExt;
                    div.scale.set(1, 1, extLaneLen);
                    div.renderOrder = 2;
                }
            }
        }

        return { hwyLaneFretClipMin, hwyLaneFretClipMax };
    }

    return { drawHighwayLane };
}
