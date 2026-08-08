import {
    FRET_EMISSIVE, FRET_WIRE_ACTIVE_HEX, FRET_WIRE_ACTIVE_OP, FRET_WIRE_HIT_DECAY,
    FRET_WIRE_HIT_INTENSITY, FRET_WIRE_HIT_OP, FRET_WIRE_IDLE_HEX, FRET_WIRE_IDLE_OP, NFRETS,
} from '../../core/constants.js';
import { anchorLaneBoundsAt } from '../../core/chart-util.js';

/**
 * Fret-wire per-frame material updates. Two functions, always called in
 * the same relative order each frame: {@link applyFretWireAnchorHighlight}
 * seeds the baseline wire color/opacity/emissive first, then
 * {@link applyFretWireHitFlash} (much later, after the note + chord draw
 * loops) lerps toward the hit colors on top of that baseline — re-seeding
 * every frame is what lets a flash fade back out instead of latching.
 *
 * `_fwHitGlow` decays exponentially in chart time (frame-rate independent,
 * honors playback speed); a backward seek resets it so a flash from a hit
 * jumped away from doesn't linger. `_fwHitPrevTime` is a scalar, passed in
 * and returned for `main.js` to reassign onto its own closure `let`
 * (primitives can't be shared by reference the way the typed
 * arrays/Maps here are).
 */
export function createFretWireHitFlash({ ctx, _fwHitColor, _fwHitEmissive, _fwHitIn, _fwHitGlow, _fwChordAcc, mRimFlash, _rimFlashIn }) {
    /**
     * Defaults all wires to gray; wires inside the active anchor range turn
     * gold to match the dynamic highway lane boundary exactly, using the
     * same `anchorLaneBoundsAt()` helper the lane itself uses.
     */
    function applyFretWireAnchorHighlight(anchors, now) {
        if (ctx.board.fretWireMats.length) {
            const _fwBounds = anchors && anchors.length
                ? anchorLaneBoundsAt(anchors, now) : null;
            const _fwMin = _fwBounds ? _fwBounds.dMin : -1;
            const _fwMax = _fwBounds ? _fwBounds.dMax : -1;
            for (let _f = 0; _f <= NFRETS; _f++) {
                const _m = ctx.board.fretWireMats[_f];
                if (!_m) continue;
                if (_fwMin >= 0 && _f >= _fwMin && _f <= _fwMax) {
                    _m.color.setHex(FRET_WIRE_ACTIVE_HEX);
                    _m.opacity = FRET_WIRE_ACTIVE_OP;
                } else {
                    _m.color.setHex(FRET_WIRE_IDLE_HEX);
                    _m.opacity = FRET_WIRE_IDLE_OP;
                }
                // Re-seeded every frame since the hit-flash pass lerps these toward
                // FRET_WIRE_HIT_* in place — without this a flash would never fade out.
                _m.emissive.setHex(FRET_EMISSIVE);
                _m.emissiveIntensity = 1;
            }
        }
    }

    function applyFretWireHitFlash(now, _drawAnchors, _fwHitPrevTime) {
        if (ctx.board.fretWireMats.length && _fwHitColor) {
            // A chord's flash frames the LANE, not its own shape: the lit lane strip spans the
            // anchor's width (min ~4 frets), which can run a fret past the chord's outermost
            // fret, and a bracket one wire inside the lit lane reads as misaligned. So a chord
            // lights the anchor lane's edge wires — falling back to the shape's own outer pair
            // only for charts with no anchors.
            for (const _fwE of _fwChordAcc.values()) {
                const _fwA = Math.max(_fwE.a, _fwE.openA);
                if (_fwA <= 0) continue;
                let _w0 = -1, _w1 = -1;
                const _fwB = anchorLaneBoundsAt(_drawAnchors, _fwE.t);
                if (_fwB) {
                    _w0 = _fwB.dMin;
                    _w1 = _fwB.dMax;
                } else if (_fwE.maxF >= _fwE.minF) {
                    _w0 = Math.max(0, _fwE.minF - 1);
                    _w1 = Math.min(NFRETS, _fwE.maxF);
                }
                if (_w0 < 0) continue; // all-open chord on an anchor-less chart
                if (_fwA > _fwHitIn[_w0]) _fwHitIn[_w0] = _fwA;
                if (_fwA > _fwHitIn[_w1]) _fwHitIn[_w1] = _fwA;
            }

            const _fwDt = now - _fwHitPrevTime;
            if (!(_fwDt >= 0) || _fwDt > 1) _fwHitGlow.fill(0); // first frame, seek, or long stall
            const _fwDecay = (_fwDt > 0 && _fwDt <= 1)
                ? Math.exp(-_fwDt / FRET_WIRE_HIT_DECAY)
                : 0;
            _fwHitPrevTime = now;
            // Decay every wire's glow state, but flash only the outermost pair of lit wires —
            // fast passages overlap their decay tails, so without this a run of consecutive
            // notes lights a picket fence of wires; collapsing to the outer pair keeps the lit
            // span reading as one bracket (the same rule chords follow). Interior wires keep
            // decaying invisibly and the bracket tightens naturally as outer tails expire.
            let _fwLo = -1, _fwHi = -1;
            for (let _f = 0; _f <= NFRETS; _f++) {
                const _g = Math.max(_fwHitIn[_f], _fwHitGlow[_f] * _fwDecay);
                _fwHitGlow[_f] = _g;
                if (_g < 0.004) continue;   // below perceptible
                if (_fwLo < 0) _fwLo = _f;
                _fwHi = _f;
            }
            for (let _i = 0; _i < 2; _i++) {
                const _f = _i === 0 ? _fwLo : _fwHi;
                if (_f < 0) break;                       // nothing lit
                if (_i === 1 && _f === _fwLo) break;     // single wire lit
                const _g = _fwHitGlow[_f];
                const _m = ctx.board.fretWireMats[_f];
                if (!_m) continue;
                _m.color.lerp(_fwHitColor, _g);
                _m.emissive.lerp(_fwHitEmissive, _g);
                _m.emissiveIntensity = 1 + (FRET_WIRE_HIT_INTENSITY - 1) * _g;
                _m.opacity += (FRET_WIRE_HIT_OP - _m.opacity) * _g;
            }

            // Gem-rim flash: same intensity ramp, in the string's own color. No decay tail of
            // its own — the material is only assigned while the provider confirms the note, and
            // the provider's alpha already fades.
            for (let _s = 0; _s < mRimFlash.length; _s++) {
                const _m = mRimFlash[_s];
                if (_m) _m.emissiveIntensity = 1 + (FRET_WIRE_HIT_INTENSITY - 1) * _rimFlashIn[_s];
            }
        }
        return _fwHitPrevTime;
    }

    return { applyFretWireAnchorHighlight, applyFretWireHitFlash };
}
