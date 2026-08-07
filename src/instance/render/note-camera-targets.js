import { CAM_LOCK_CENTER_FRET, CAM_LOCK_ZOOM_MAX, CAM_LOCK_ZOOM_MIN, K } from '../../core/constants.js';
import { FRET_WIDTH_MID } from '../../core/fret-geometry.js';

// Steady-mode (#34) camera-distance/X-target resolver -- moved verbatim out
// of main.js (Stage 7, post-3e). Already consumed as a `_applyNoteCamTargets`
// dep by two already-extracted modules (camera-target.js, camera-bootstrap.js)
// before this move; only the construction/injection sites needed updating.
//
// camBaseDistU/camLowFretPullbackU are module-scope pure arrow functions
// (no closure dependency at all -- defined outside createFactory() in
// main.js) passed in as plain deps. ctx and xFretMid are the per-instance
// stable references every camera module already treats as safe deps
// (ctx: same object for the instance's life, only .cam properties mutate;
// xFretMid: a `const` arrow function, never reassigned).
export function createNoteCameraTargets({ ctx, xFretMid, camBaseDistU, camLowFretPullbackU }) {
    function applyNoteCamTargets(wX, wSum, distMin, distMax, distGot,
                                  camHystF, camDistHystF, skipDistHyst) {
        const lockActive = ctx.settings.cameraLockLow && (!distGot || distMax <= 12);
        if (lockActive) {
            // Locked view: frets 0-12 fit in frame, with the peak
            // low-fret bonus baked in so nut chords stay framed.
            // Both halves derive from the same helpers as the
            // dynamic branch so future tuning of the base zoom
            // curve or low-fret pullback can't desync them.
            const lockedBaseU  = camBaseDistU(12);
            const lockedBonusU = camLowFretPullbackU(1);
            // cameraLockZoom slider 0..1 blends between MIN (closest)
            // and MAX (furthest). Default 0.5 maps to ~1.0× so existing
            // users see the same locked view as before this slider.
            const lockZoomMul  = CAM_LOCK_ZOOM_MIN +
                (CAM_LOCK_ZOOM_MAX - CAM_LOCK_ZOOM_MIN) * ctx.settings.cameraLockZoom;
            ctx.cam.tgtX             = xFretMid(CAM_LOCK_CENTER_FRET);
            ctx.cam.tgtDist          = (lockedBaseU + lockedBonusU) * K * lockZoomMul;
            ctx.cam.prevLowFretBonus = lockedBonusU;
        } else if (distGot) {
            // Base zoom scales by fret count (distMax - distMin).
            const baseDistU     = camBaseDistU(distMax - distMin);
            // Low-fret pullback: world-X distance between frets is
            // logarithmic, so a 2-fret span at the nut takes much
            // more horizontal screen than the same span at fret 12.
            // The base term scales by *fret count*, not world-X
            // span, so low-fret clusters were under-allotted camera
            // distance and clipped at the left edge (e.g. F power
            // chord at fret 1 partially off-screen). Add a tapered
            // bonus that kicks in below fret 5 and peaks at fret 1
            // (≈16 extra fret-span units, i.e. 16*K world-units of
            // distance), without affecting mid/high neck framing.
            const lowFretBonusU = camLowFretPullbackU(distMin);
            if (skipDistHyst) {
                // First data frame — no previous ctx.cam.tgtDist state; apply
                // directly without the hysteresis dead-zone check.
                ctx.cam.tgtDist = (baseDistU + lowFretBonusU) * K;
            } else {
                // ctx.cam.tgtDist scales at (3 * K) per fret-span unit, so the
                // hysteresis threshold (a fret-span dead zone) converts
                // to ctx.cam.tgtDist-space by multiplying by 3 * K — NOT by
                // FRET_WIDTH_MID, which is X-axis world-units-per-fret
                // and a different unit (would over-tighten the gate by
                // ~4x at SCALE = 2.25).
                //
                // Hysteresis is applied to the BASE portion only. The
                // lowFretBonus changes by 4 fret-span units per integer
                // fret near the nut, which sits below the default-
                // cameraSmoothing (cs=0.5) dead zone of ~8.25 fret-span
                // units (= 2.75 * 3) and would otherwise be suppressed
                // for fret 2 → 1 / 3 → 1 transitions — exactly the
                // corrections this bonus exists to provide. So gate the
                // base, then always reflect bonus changes on top by
                // tracking the last-committed bonus contribution
                // (ctx.cam.prevLowFretBonus) and adjusting ctx.cam.tgtDist for its
                // delta whether or not the base hysteresis fires.
                //
                // First frame after a lock release bypasses the gate
                // entirely so a >12 fret note that disengaged the lock
                // is guaranteed to widen the view. Without this, a
                // small span jump (12→13 frets) at default settings
                // can sit inside the dead zone and the camera fails
                // to follow the high note that just opened the lock.
                const candidateBase = baseDistU * K;
                const baseTgt       = ctx.cam.tgtDist - ctx.cam.prevLowFretBonus * K;
                const justUnlocked  = ctx.cam.prevLockActive;
                if (justUnlocked || Math.abs(candidateBase - baseTgt) > camDistHystF * 3 * K) {
                    ctx.cam.tgtDist = (baseDistU + lowFretBonusU) * K;
                } else if (lowFretBonusU !== ctx.cam.prevLowFretBonus) {
                    ctx.cam.tgtDist = baseTgt + lowFretBonusU * K;
                }
            }
            ctx.cam.prevLowFretBonus = lowFretBonusU;
        }
        // X-axis: recency-weighted centroid with a hysteresis dead zone
        // so small cluster shifts don't trigger visible pan motion.
        if (!lockActive && wSum > 0) {
            const candidateX = wX / wSum;
            if (Math.abs(candidateX - ctx.cam.tgtX) > camHystF * FRET_WIDTH_MID) ctx.cam.tgtX = candidateX;
        }
        return lockActive;
    }

    return { applyNoteCamTargets };
}
