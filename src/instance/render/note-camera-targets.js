import { CAM_LOCK_CENTER_FRET, CAM_LOCK_ZOOM_MAX, CAM_LOCK_ZOOM_MIN, K } from '../../core/constants.js';
import { FRET_WIDTH_MID } from '../../core/fret-geometry.js';

export function createNoteCameraTargets({ ctx, xFretMid, camBaseDistU, camLowFretPullbackU }) {
    function applyNoteCamTargets(wX, wSum, distMin, distMax, distGot,
                                  camHystF, camDistHystF, skipDistHyst) {
        const lockActive = ctx.settings.cameraLockLow && (!distGot || distMax <= 12);
        if (lockActive) {
            // Locked view: frets 0-12 fit in frame, with the peak low-fret bonus baked in so
            // nut chords stay framed. Both halves derive from the same helpers as the dynamic
            // branch so future zoom-curve tuning can't desync them.
            const lockedBaseU  = camBaseDistU(12);
            const lockedBonusU = camLowFretPullbackU(1);
            // cameraLockZoom slider 0..1 blends MIN (closest) to MAX (furthest); default 0.5
            // maps to ~1.0x so existing users see the same locked view as before this slider.
            const lockZoomMul  = CAM_LOCK_ZOOM_MIN +
                (CAM_LOCK_ZOOM_MAX - CAM_LOCK_ZOOM_MIN) * ctx.settings.cameraLockZoom;
            ctx.cam.tgtX             = xFretMid(CAM_LOCK_CENTER_FRET);
            ctx.cam.tgtDist          = (lockedBaseU + lockedBonusU) * K * lockZoomMul;
            ctx.cam.prevLowFretBonus = lockedBonusU;
        } else if (distGot) {
            // Base zoom scales by fret count (distMax - distMin).
            const baseDistU     = camBaseDistU(distMax - distMin);
            // World-X distance between frets is logarithmic, so a low-fret span takes far more
            // horizontal screen than the same span at fret 12. The base term scales by fret
            // count, not world-X span, so low-fret clusters were under-allotted camera distance
            // and clipped at the left edge — add a tapered bonus peaking at fret 1.
            const lowFretBonusU = camLowFretPullbackU(distMin);
            if (skipDistHyst) {
                // First data frame — no previous ctx.cam.tgtDist state; apply directly.
                ctx.cam.tgtDist = (baseDistU + lowFretBonusU) * K;
            } else {
                // tgtDist scales at (3*K) per fret-span unit, so the hysteresis threshold
                // converts to tgtDist-space via 3*K — not FRET_WIDTH_MID, which is a different
                // (X-axis world-units-per-fret) unit and would over-tighten the gate ~4x.
                //
                // Hysteresis applies to the base portion only: the low-fret bonus changes by 4
                // fret-span units per integer fret near the nut, below the default dead zone
                // (~8.25 units), so it's tracked separately (prevLowFretBonus) and its delta is
                // always reflected regardless of whether the base hysteresis fires.
                //
                // The first frame after a lock release bypasses the gate entirely, so a >12
                // fret note that disengaged the lock is guaranteed to widen the view — a small
                // span jump right after unlock could otherwise sit inside the dead zone.
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
        // X-axis: recency-weighted centroid with a hysteresis dead zone so small cluster shifts
        // don't trigger visible pan motion.
        if (!lockActive && wSum > 0) {
            const candidateX = wX / wSum;
            if (Math.abs(candidateX - ctx.cam.tgtX) > camHystF * FRET_WIDTH_MID) ctx.cam.tgtX = candidateX;
        }
        return lockActive;
    }

    return { applyNoteCamTargets };
}
