import {
    FRET_EMISSIVE, FRET_WIRE_ACTIVE_HEX, FRET_WIRE_ACTIVE_OP, FRET_WIRE_HIT_DECAY,
    FRET_WIRE_HIT_INTENSITY, FRET_WIRE_HIT_OP, FRET_WIRE_IDLE_HEX, FRET_WIRE_IDLE_OP, NFRETS,
} from '../../core/constants.js';
import { anchorLaneBoundsAt } from '../../core/chart-util.js';

// Fret-wire per-frame material updates -- moved verbatim out of update()
// (Stage 7 Track C), two functions always called in the same relative
// order each frame: the anchor highlight seeds the baseline wire color/
// opacity/emissive every frame FIRST, then the hit flash (much later in
// update(), after the note + chord draw loops) lerps toward the hit
// colors on top of that baseline -- re-seeding the baseline every frame is
// what lets a flash fade back out instead of latching.
//
// _fwHitGlow decays exponentially in CHART time, so the tail is frame-rate
// independent and honours playback speed. Seeking backward resets it --
// otherwise a flash from a hit we jumped away from would linger on the wire.
//
// _fwHitIn/_fwHitGlow/_fwChordAcc/_rimFlashIn are persistent typed arrays/
// Maps also written by note.js/chords.js elsewhere in the same frame --
// injected as deps (same object references), verified via whole-file
// bare-reassignment grep to never be reassigned as variables, only mutated.
// _fwHitPrevTime is a genuine read-modify-write scalar (a JS primitive, so
// it can't be shared by reference) -- passed in as an explicit parameter
// and returned as the new value for main.js to reassign onto its own
// closure `let`.
export function createFretWireHitFlash({ ctx, _fwHitColor, _fwHitEmissive, _fwHitIn, _fwHitGlow, _fwChordAcc, mRimFlash, _rimFlashIn }) {
    // Default all wires to gray; wires inside the active anchor range turn
    // gold to match the dynamic highway lane boundary exactly. Uses
    // laneBoundsFromAnchor() — the same helper the lane uses — so the gold
    // fret wires on the board align with the lane edges:
    //   dMin = fret - 1,  dMax = fret + width - 1
    // e.g. { fret:3, width:4 } → dMin=2, dMax=6 → wires 2,3,4,5,6 gold.
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
                // Baseline emissive every frame: the hit-flash pass below
                // lerps these toward FRET_WIRE_HIT_* in place, so they must
                // be re-seeded or a flash would never fade back out.
                _m.emissive.setHex(FRET_EMISSIVE);
                _m.emissiveIntensity = 1;
            }
        }
    }

    function applyFretWireHitFlash(now, _drawAnchors, _fwHitPrevTime) {
        if (ctx.board.fretWireMats.length && _fwHitColor) {
            // Resolve accumulated chord hits: a chord's flash frames the
            // LANE, not its own shape. The lit lane strip spans the anchor's
            // width (min ~4 frets), which can run a fret past the chord's
            // outermost fret — and a bracket one wire INSIDE the lit lane
            // reads as misaligned. So a chord lights the anchor lane's edge
            // wires: the exact wires the lane strip spans, and the same pair
            // open strings already use. The shape's own outer pair (wire
            // behind the lowest fret, wire at the highest) survives only as
            // the fallback for charts with no anchors.
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
            // Decay EVERY wire's glow state, but flash only the OUTERMOST
            // pair of lit wires. Fast passages overlap their decay tails, so
            // without this a run of consecutive notes lights a picket fence
            // of wires at once; collapsing to the outer pair keeps the whole
            // lit span reading as ONE bracket — the same rule chords already
            // follow, applied across everything currently glowing. Interior
            // wires keep decaying invisibly (the base tier loop re-seeds
            // their materials each frame), so the bracket tightens naturally
            // as outer tails expire.
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

            // Gem-rim flash: same intensity ramp as the wires, in the
            // string's own colour. No decay tail of our own — the material
            // is only ever ASSIGNED while the provider confirms the note,
            // and the provider's alpha already fades; when it goes silent
            // the outline reverts and idle intensity is irrelevant.
            for (let _s = 0; _s < mRimFlash.length; _s++) {
                const _m = mRimFlash[_s];
                if (_m) _m.emissiveIntensity = 1 + (FRET_WIRE_HIT_INTENSITY - 1) * _rimFlashIn[_s];
            }
        }
        return _fwHitPrevTime;
    }

    return { applyFretWireAnchorHighlight, applyFretWireHitFlash };
}
