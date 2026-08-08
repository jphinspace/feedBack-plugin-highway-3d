import { AHEAD, DOTS, K, S_GAP } from '../../core/constants.js';
import { dZ, fretLabelScaleForFret } from '../../core/fret-geometry.js';
import { fretColumnMarkersForAnchor, getChartAnchorAt, lowerBoundT } from '../../core/chart-util.js';
import { renderOrderForLayerAtZ } from '../../core/render-order.js';

/**
 * Fret-column reference markers: every Nth measure, a row of fret-number
 * sprites spawns on the board floor and scrolls toward the hit line.
 * `hwyLaneFretClipMin`/`hwyLaneFretClipMax` come from
 * `instance/render/highway-lane.js`, computed earlier in the same
 * `update()` call. `_fretMarkerWaveCache` is a persistent Map kept as a
 * `main.js`-level dep (not private factory state) because `teardown()`
 * clears the same object.
 */
export function createFretColumnMarkers({
    pFretColMarker, textSprites, _setLabelMap, sY, xFretMid, validString, _fretMarkerWaveCache,
}) {
    function drawFretColumnMarkers(
        beats, now, t1, notes, chords, anchors, fretColumnMarkerCadence, nStr, _textSizeMul,
        hwyLaneFretClipMin, hwyLaneFretClipMax,
    ) {
        // Per-wave gate cache: hasLow/hasHigh/fretList snapshotted at first sight of a wave so
        // the render decision stays stable through its full flight — otherwise activeFrets
        // shifting mid-song would drop markers mid-flight.
        if (beats && fretColumnMarkerCadence > 0) {
            if (_fretMarkerWaveCache.size > 0) {
                for (const k of _fretMarkerWaveCache.keys()) {
                    if (k < now) _fretMarkerWaveCache.delete(k);
                }
            }
            const minStringY = Math.min(sY(0), sY(nStr - 1));
            const labelY = minStringY - S_GAP * 0.8;
            for (const b of beats) {
                // Non-downbeats are encoded as measure=-1; only measure starts spawn waves.
                if (b.measure < 0) continue;
                if (b.time < 0 || b.time > t1) continue;
                if (b.time <= now) continue;
                if ((b.measure | 0) % fretColumnMarkerCadence !== 0) continue;

                // Snapshot the active-range gate at first sight of this wave, scanning a 2s
                // window from b.time rather than activeFrets (which only covers now+2s, while
                // waves become visible up to AHEAD=3s ahead — using activeFrets would cache a
                // false negative for far waves and suppress the row for its whole flight).
                let cached = _fretMarkerWaveCache.get(b.time);
                if (!cached) {
                    let hasLow = false, hasHigh = false;
                    const wT0 = b.time, wT1 = b.time + 2;
                    if (notes) {
                        const startI = lowerBoundT(notes, wT0);
                        for (let i = startI; i < notes.length; i++) {
                            const n = notes[i];
                            if (n.t > wT1) break;
                            if (!validString(n.s) || n.f <= 0) continue;
                            if (n.f <= 12) hasLow = true; else hasHigh = true;
                            if (hasLow && hasHigh) break;
                        }
                    }
                    if ((!hasLow || !hasHigh) && chords) {
                        const startI = lowerBoundT(chords, wT0);
                        outer: for (let i = startI; i < chords.length; i++) {
                            const ch = chords[i];
                            if (ch.t > wT1) break outer;
                            if (!ch.notes) continue;
                            for (const cn of ch.notes) {
                                if (!validString(cn.s) || cn.f <= 0) continue;
                                if (cn.f <= 12) hasLow = true; else hasHigh = true;
                                if (hasLow && hasHigh) break outer;
                            }
                        }
                    }
                    const anc = anchors && anchors.length ? getChartAnchorAt(anchors, b.time) : null;
                    const anchorFret = anc != null ? Number(anc.fret) : NaN;
                    const anchorKeyed = Number.isFinite(anchorFret) && anchorFret >= 0;
                    const fretList = anchorKeyed
                        ? fretColumnMarkersForAnchor(anchorFret, DOTS)
                        : DOTS.slice();
                    cached = { hasLow, hasHigh, fretList, anchorKeyed };
                    _fretMarkerWaveCache.set(b.time, cached);
                }
                if (!cached.hasLow && !cached.hasHigh && !cached.anchorKeyed) continue;

                const dt = b.time - now;
                // Fade in over 0.35s from the maximum lookahead distance so the label appears at
                // its correct final size immediately, rather than emerging through scene fog
                // (fog is disabled on the sprite material; this manual ramp replaces it).
                const _colFadeIn = Math.min(1.0, (AHEAD - dt) / 0.35);
                if (_colFadeIn <= 0) continue;

                const z = dZ(dt);
                // Matches the per-note connector fret label's scale so cadence markers read the
                // same size at a given Z, with no extra world-scale boost.
                const clipMin = hwyLaneFretClipMin;
                const clipMax = hwyLaneFretClipMax;
                const fretList = cached.fretList || DOTS;
                const anchorKeyedRow = !!cached.anchorKeyed;
                for (const f of fretList) {
                    let show;
                    if (anchorKeyedRow) {
                        show = true;
                    } else {
                        if (f === 12) show = cached.hasLow || cached.hasHigh;
                        else if (f < 12) show = cached.hasLow;
                        else show = cached.hasHigh;
                    }
                    if (!show) continue;
                    if (!anchorKeyedRow && clipMin != null && (f <= clipMin || f > clipMax)) continue;
                    // Fixed color avoids mid-flight color flips from activeFrets only covering
                    // now+2s while waves appear at AHEAD=3s.
                    const color = '#888888';
                    const sp = pFretColMarker.get();
                    const m = textSprites.txtMat(f, color, false, 'noteFret');
                    _setLabelMap(sp, m);
                    sp.material.opacity = 0.85 * _colFadeIn;
                    sp.position.set(xFretMid(f), labelY, z);
                    // Z-proportional: sits between chord frame and note gem at the same depth,
                    // so neither overdraws the marker.
                    sp.renderOrder = renderOrderForLayerAtZ(z, 'FRET_COLUMN');
                    // Scale grows linearly from 2x at max lookahead to 1x at the hit line;
                    // combined with perspective attenuation it starts larger and converges to
                    // the row-label size at z=0.
                    const sz = 7.0 * K * (1 + 0.4 * dt / AHEAD) * _textSizeMul * fretLabelScaleForFret(f);
                    sp.scale.set(sz, sz, 1);
                }

            }
        }
    }

    return { drawFretColumnMarkers };
}
