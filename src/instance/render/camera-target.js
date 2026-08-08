import {
    CAM_FOCUS_BLEND_RATE, CAM_LOCK_CENTER_FRET, CAM_LOCK_ZOOM_MAX, CAM_LOCK_ZOOM_MIN, K,
    LOOKAHEAD_LOCK_ENGAGE_MAXF, LOOKAHEAD_LOCK_RELEASE_MAXF,
} from '../../core/constants.js';

/**
 * Camera target resolution: the classic-mode/lookahead-mode branch that
 * decides `ctx.cam.tgtX`/`tgtDist` for `camUpdate()` (called separately,
 * after `update()` returns) to smooth toward. `lockActive`/
 * `bootstrapHoldActive` are purely local — never read again after this
 * function returns.
 */
export function createCameraTarget({
    ctx, xFretMid, _applyNoteCamTargets, camLowFretPullbackU, camBaseDistU,
    lookaheadSmoothCamStep, lookaheadTargetWorldX,
}) {
    function drawCameraTarget(
        cameraMode, lookaheadBoundsNow, camDistGot, camWX, camWSum, camDistMin, camDistMax,
        camHystF, camDistHystF, _frameNow, cameraLockLow, cameraLockZoom,
    ) {
        let lockActive;
        let bootstrapHoldActive = false;
        if (ctx.cam._camBootstrapHolding) {
            if (ctx.cam._camBootstrapMode !== cameraMode) {
                ctx.cam._camBootstrapHolding = false;
                ctx.cam._camBootstrapMode = null;
            } else {
                const liveFramingReady = cameraMode === 'lookahead'
                    ? lookaheadBoundsNow !== null
                    : camDistGot;
                if (liveFramingReady) {
                    ctx.cam._camBootstrapHolding = false;
                    ctx.cam._camBootstrapMode = null;
                } else {
                    bootstrapHoldActive = true;
                }
            }
        }

        if (bootstrapHoldActive) {
            // Keep the chart-load target intact until the ordinary live path can compute the
            // same phrase. Camera Director still layers its free-camera transform in camUpdate().
            lockActive = ctx.cam.prevLockActive;
        } else if (!(cameraMode === 'lookahead')) {
            lockActive = _applyNoteCamTargets(
                camWX, camWSum, camDistMin, camDistMax, camDistGot,
                camHystF, camDistHystF, /* skipDistHyst= */ false);
            ctx.cam.prevLockActive = lockActive;
        } else {
            const lookaheadMaxF = lookaheadBoundsNow ? lookaheadBoundsNow.maxF : 0;
            const lookaheadHasBounds = lookaheadBoundsNow != null;

            let dtSec = 1 / 120;
            if (ctx.cam._lookaheadCamPrevNow !== null) {
                const rawDt = _frameNow - ctx.cam._lookaheadCamPrevNow;
                if (rawDt > -1 && rawDt < 2) dtSec = Math.min(0.2, Math.max(1 / 960, rawDt));
            }
            ctx.cam._lookaheadCamPrevNow = _frameNow;
            const dBlend = Math.min(0.2, Math.max(1e-4, dtSec));
            const lowBlendFs = 1 - Math.pow(1 - CAM_FOCUS_BLEND_RATE, dBlend);

            if (!lookaheadHasBounds || lookaheadMaxF <= LOOKAHEAD_LOCK_ENGAGE_MAXF)
                ctx.cam._lookaheadHiNeckLatch = false;
            else if (lookaheadMaxF >= LOOKAHEAD_LOCK_RELEASE_MAXF)
                ctx.cam._lookaheadHiNeckLatch = true;

            const lookaheadLockLowEligible = cameraLockLow
                && (!lookaheadHasBounds
                    || (!ctx.cam._lookaheadHiNeckLatch && lookaheadMaxF <= 12));

            let rawLowBU;
            if (lookaheadLockLowEligible) {
                rawLowBU = camLowFretPullbackU(1);
            } else if (lookaheadBoundsNow) {
                rawLowBU = camLowFretPullbackU(lookaheadBoundsNow.minF);
            } else {
                rawLowBU = camLowFretPullbackU(CAM_LOCK_CENTER_FRET);
            }
            ctx.cam._lookaheadLowBonusU = rawLowBU * lowBlendFs + ctx.cam._lookaheadLowBonusU * (1 - lowBlendFs);

            if (lookaheadLockLowEligible) {
                const lockedBaseU = camBaseDistU(12);
                const lockZoomMul = CAM_LOCK_ZOOM_MIN +
                    (CAM_LOCK_ZOOM_MAX - CAM_LOCK_ZOOM_MIN) * cameraLockZoom;
                lookaheadSmoothCamStep(dtSec, xFretMid(CAM_LOCK_CENTER_FRET), 12);
                ctx.cam.tgtX = ctx.cam._lookaheadCamX;
                ctx.cam.tgtDist = (lockedBaseU + ctx.cam._lookaheadLowBonusU) * K * lockZoomMul;
                ctx.cam.prevLowFretBonus = ctx.cam._lookaheadLowBonusU;
                lockActive = true;
            } else {
                if (lookaheadBoundsNow) {
                    const tgtWX = lookaheadTargetWorldX(
                        lookaheadBoundsNow.minF, lookaheadBoundsNow.maxF);
                    const tgtSpanInt = Math.max(
                        1, lookaheadBoundsNow.maxF - lookaheadBoundsNow.minF + 1);
                    lookaheadSmoothCamStep(dtSec, tgtWX, tgtSpanInt);
                    ctx.cam.tgtDist = (camBaseDistU(ctx.cam._lookaheadFretSpan) + ctx.cam._lookaheadLowBonusU) * K;
                    ctx.cam.prevLowFretBonus = ctx.cam._lookaheadLowBonusU;
                } else {
                    lookaheadSmoothCamStep(dtSec, ctx.cam._lookaheadCamX, ctx.cam._lookaheadFretSpan);
                    ctx.cam.tgtDist = (camBaseDistU(ctx.cam._lookaheadFretSpan) + ctx.cam._lookaheadLowBonusU) * K;
                    ctx.cam.prevLowFretBonus = ctx.cam._lookaheadLowBonusU;
                }
                ctx.cam.tgtX = ctx.cam._lookaheadCamX;
                lockActive = false;
            }
            ctx.cam.prevLockActive = lockActive;
        }
    }

    return { drawCameraTarget };
}
