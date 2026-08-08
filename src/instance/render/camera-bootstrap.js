import {
    CAM_DIST_BASE, CAM_LOCK_CENTER_FRET, CAM_LOCK_ZOOM_MAX, CAM_LOCK_ZOOM_MIN,
    CAM_TGT_BEHIND, DEFAULT_LOOKAHEAD_FRET_SPAN, K,
} from '../../core/constants.js';
import { hwyFirstRelevantFrettedTime } from '../../core/chart-util.js';

/**
 * Song-change detection + first-chart-data camera bootstrap: two functions
 * always called in sequence (bootstrap fires precisely because song-change
 * may have just reset the snap flags it checks). Both write almost
 * exclusively into `ctx.cam`.
 */
export function createCameraBootstrap({
    ctx, xFretMid, camBaseDistU, camLowFretPullbackU, lookaheadBootstrapTime, lookaheadComputeFretBounds,
    lookaheadTargetWorldX, _applyNoteCamTargets, validString, filterValidNotes,
}) {
    function detectSongChangeAndResetCamera(bundle) {
        // Arrangement switches / splitscreen song changes don't call renderer.destroy/init,
        // so ctx.cam._camSnapped/_camPreScanned would otherwise persist into the new song and
        // the snap pre-pass would never fire again. Detect the change by comparing the
        // current song+arrangement identity against the last-seen key.
        const si = bundle.songInfo;
        // bundle.songInfo has no filename field, so combine window.feedBack.currentSong.filename
        // (set by highway.js from the WS URL) with the arrangement index as the key.
        const currentSong = window.feedBack && window.feedBack.currentSong;
        const key = currentSong ? currentSong.filename + '\0' + (si ? (si.arrangement_index ?? '') : '') : null;
        if (key !== null && key !== ctx.cam._songKey) {
            ctx.cam._songKey = key;
            ctx.cam._camSnapped = false;
            ctx.cam._camPreScanned = false;
            ctx.cam._camBootstrapHolding = false;
            ctx.cam._camBootstrapMode = null;
            ctx.cam.tgtX = ctx.cam.curX = xFretMid(CAM_LOCK_CENTER_FRET);
            ctx.cam.tgtDist = ctx.cam.curDist = CAM_DIST_BASE;
            ctx.cam.prevLowFretBonus = 0;
            ctx.cam.prevLockActive = false;
            ctx.cam._lookaheadCamX = xFretMid(CAM_LOCK_CENTER_FRET);
            ctx.cam._lookaheadFretSpan = DEFAULT_LOOKAHEAD_FRET_SPAN;
            ctx.cam._lookaheadCamPrevNow = null;
            ctx.cam._lookaheadLowBonusU = 0;
            ctx.cam._lookaheadHiNeckLatch = false;
            return true;
        }
        return false;
    }

    function bootstrapCameraFromChartData(
        notes, chords, anchors, now, nStr, cameraMode, lookaheadBoundsNow,
        camAhead, camTau, camHystF, camDistHystF, cameraLockLow, cameraLockZoom,
    ) {
        // Initializes against the first relevant fretted phrase as soon as the complete chart
        // arrays arrive: for a future phrase, samples the same window state live framing will
        // have when the phrase first becomes relevant, then holds it through the silent intro.
        // O(N) once per song/arrangement, a permanent no-op after.
        if (!ctx.cam._camSnapped && !ctx.cam._camPreScanned && notes && chords) {
            ctx.cam._camPreScanned = true;
            const firstFrettedTime = hwyFirstRelevantFrettedTime(
                notes, chords, now, CAM_TGT_BEHIND, nStr);

            if (cameraMode === 'lookahead'
                && (lookaheadBoundsNow || firstFrettedTime !== null)) {
                // Anchors can make the live lookahead valid before the first fretted event
                // does — prefer that already-current framing, only project forward when empty.
                const bootstrapNow = lookaheadBoundsNow
                    ? now
                    : lookaheadBootstrapTime(now, firstFrettedTime);
                const bd = lookaheadBoundsNow
                    || lookaheadComputeFretBounds(bootstrapNow, anchors, notes, chords);
                if (bd) {
                    ctx.cam._lookaheadCamX = lookaheadTargetWorldX(bd.minF, bd.maxF);
                    ctx.cam._lookaheadFretSpan = Math.max(1, bd.maxF - bd.minF + 1);
                    const lockSnapEl = cameraLockLow && bd.maxF <= 12;
                    if (lockSnapEl) {
                        const lockedBaseU = camBaseDistU(12);
                        const lockedBonusU = camLowFretPullbackU(1);
                        const lockZoomMul = CAM_LOCK_ZOOM_MIN +
                            (CAM_LOCK_ZOOM_MAX - CAM_LOCK_ZOOM_MIN) * cameraLockZoom;
                        ctx.cam.tgtX = xFretMid(CAM_LOCK_CENTER_FRET);
                        ctx.cam.tgtDist = (lockedBaseU + lockedBonusU) * K * lockZoomMul;
                        ctx.cam.prevLowFretBonus = lockedBonusU;
                        ctx.cam._lookaheadLowBonusU = lockedBonusU;
                        ctx.cam.prevLockActive = true;
                    } else {
                        const baseDU = camBaseDistU(ctx.cam._lookaheadFretSpan);
                        const lowBU = camLowFretPullbackU(bd.minF);
                        ctx.cam.tgtDist = (baseDU + lowBU) * K;
                        ctx.cam.prevLowFretBonus = lowBU;
                        ctx.cam._lookaheadLowBonusU = lowBU;
                        ctx.cam.tgtX = ctx.cam._lookaheadCamX;
                        ctx.cam.prevLockActive = false;
                    }
                    ctx.cam.curX = ctx.cam.tgtX;
                    ctx.cam.curDist = ctx.cam.tgtDist;
                    ctx.cam._camSnapped = true;
                    ctx.cam._lookaheadCamPrevNow = now;
                    ctx.cam._camBootstrapHolding = bootstrapNow > now && !lookaheadBoundsNow;
                    ctx.cam._camBootstrapMode = ctx.cam._camBootstrapHolding ? cameraMode : null;
                } else {
                    // Defensive fallback for malformed chart timing — the helper found a
                    // fretted event, so this should be unreachable.
                    ctx.cam._camSnapped = true;
                }
            } else if (firstFrettedTime === null) {
                // Empty and all-open charts without lookahead anchor bounds have no horizontal fret target.
                ctx.cam._camSnapped = true;
            } else {
                const bootstrapNow = Math.max(now, firstFrettedTime - camAhead);
                const bootstrapT0 = bootstrapNow - CAM_TGT_BEHIND;
                const bootstrapT1 = bootstrapNow + camAhead;
                let preWX = 0, preWSum = 0;
                let preDistMin = 99, preDistMax = 0, preDistGot = false;

                for (const n of notes) {
                    if (n.t + (n.sus || 0) < bootstrapT0) continue;
                    if (n.t > bootstrapT1) break;
                    if (!validString(n.s)) continue;
                    const nInWin = n.f > 0 && n.t >= bootstrapT0;
                    const nSusNow = n.f > 0 && n.t < bootstrapT0
                        && n.t + (n.sus || 0) >= bootstrapNow;
                    if (nInWin || nSusNow) {
                        const w = Math.exp(-Math.abs(n.t - bootstrapNow) / camTau);
                        preWX += xFretMid(n.f) * w;
                        preWSum += w;
                        if (n.f < preDistMin) preDistMin = n.f;
                        if (n.f > preDistMax) preDistMax = n.f;
                        preDistGot = true;
                    }
                }
                for (const ch of chords) {
                    if (!ch.notes) continue;
                    if (ch.t > bootstrapT1) break;
                    const chNotes = filterValidNotes(ch.notes);
                    if (!chNotes.length) continue;
                    let maxSus = 0;
                    for (const n of chNotes) if ((n.sus || 0) > maxSus) maxSus = n.sus;
                    if (ch.t + maxSus < bootstrapT0) continue;
                    const chOnsetInWin = ch.t >= bootstrapT0;
                    const chSusNow = ch.t < bootstrapT0
                        && ch.t + maxSus >= bootstrapNow;
                    if (!chOnsetInWin && !chSusNow) continue;
                    const chW = Math.exp(-Math.abs(ch.t - bootstrapNow) / camTau);
                    for (const cn of chNotes) {
                        const cnOk = chOnsetInWin
                            || (chSusNow && ch.t + (cn.sus || 0) >= bootstrapNow);
                        if (cn.f > 0 && cnOk) {
                            preWX += xFretMid(cn.f) * chW;
                            preWSum += chW;
                            if (cn.f < preDistMin) preDistMin = cn.f;
                            if (cn.f > preDistMax) preDistMax = cn.f;
                            preDistGot = true;
                        }
                    }
                }

                if (preWSum > 0) {
                    ctx.cam.prevLockActive = _applyNoteCamTargets(
                        preWX, preWSum, preDistMin, preDistMax, preDistGot,
                        camHystF, camDistHystF, /* skipDistHyst= */ true);
                    ctx.cam.curX = ctx.cam.tgtX;
                    ctx.cam.curDist = ctx.cam.tgtDist;
                }
                // Finish defensively in case a malformed event produced no target.
                ctx.cam._camSnapped = true;
                ctx.cam._camBootstrapHolding = preWSum > 0 && bootstrapNow > now;
                ctx.cam._camBootstrapMode = ctx.cam._camBootstrapHolding ? cameraMode : null;
            }
        }
    }

    return { detectSongChangeAndResetCamera, bootstrapCameraFromChartData };
}
