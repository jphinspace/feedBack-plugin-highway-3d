import {
    CAM_FOCUS_BLEND_RATE, CAM_FRET_EDGE_BLEND, CAM_LOOKAHEAD_MEASURES, CAM_LOOKAHEAD_SEC, NFRETS,
} from '../../core/constants.js';
import { getChartAnchorAt, lowerBoundT } from '../../core/chart-util.js';

// Lookahead-camera-mode pure math -- moved verbatim out of main.js (Stage 7,
// post-3e). `getMeasureStarts` is a live getter, not a deps snapshot:
// _measureStarts is a bare main.js closure `let` REASSIGNED (new array
// reference, not mutated in place) whenever update() rebuilds it from fresh
// beats data, on song-change reset, and on teardown() -- a one-time
// construction-time snapshot would go stale after the very first rebuild.
// Same shape as dom-and-scene.js's getHighwayCanvas / bloom-composer.js's
// getRenderer.
//
// lookaheadEndTime() is purely internal (only ever called by the other four
// functions in this file, never from main.js) -- not returned.
export function createLookaheadMath({ ctx, xFret, xFretMid, validString, getMeasureStarts }) {
    // Earliest chart time CAM_LOOKAHEAD_MEASURES measures ahead of `now`,
    // using the cached measure-start times. With no beats it falls back to
    // CAM_LOOKAHEAD_SEC seconds. Past the last known measure, extrapolates
    // using the average measure duration.
    function lookaheadEndTime(now) {
        const ms = getMeasureStarts();
        if (!ms || ms.length === 0) return now + CAM_LOOKAHEAD_SEC;
        // Binary search: lo = first index with ms[lo] > now.
        let lo = 0, hi = ms.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (ms[mid] <= now) lo = mid + 1; else hi = mid; }
        const curIdx = lo - 1;                       // current measure (-1 if before the first)
        const targetIdx = curIdx + CAM_LOOKAHEAD_MEASURES;
        if (targetIdx >= 0 && targetIdx < ms.length) return ms[targetIdx];
        // Past the last measure: extrapolate using the average measure duration.
        if (ms.length >= 2) {
            const avg = (ms[ms.length - 1] - ms[0]) / (ms.length - 1);
            if (avg > 0) return ms[ms.length - 1] + (targetIdx - (ms.length - 1)) * avg;
        }
        return now + CAM_LOOKAHEAD_SEC;
    }

    // Earliest future chart time whose lookahead end reaches eventTime.
    // lookaheadEndTime() is monotonic but measure-stepped, so a small
    // bounded binary search works for both measure grids and the seconds
    // fallback without duplicating/inverting its edge-case logic.
    function lookaheadBootstrapTime(now, eventTime) {
        if (!(eventTime > now) || lookaheadEndTime(now) >= eventTime) return now;
        let lo = now;
        let hi = eventTime;
        for (let i = 0; i < 32; i++) {
            const mid = (lo + hi) * 0.5;
            if (lookaheadEndTime(mid) >= eventTime) hi = mid;
            else lo = mid;
        }
        return hi;
    }

    function lookaheadComputeFretBounds(now, anchors, notes, chords) {
        const tEnd = lookaheadEndTime(now);
        let minF = 99;
        let maxF = 0;
        let any = false;
        if (anchors && anchors.length) {
            for (let tt = now; tt <= tEnd + 1e-9; tt += 0.125) {
                const a = getChartAnchorAt(anchors, tt);
                if (!a) continue;
                let fStart = Math.round(Number(a.fret));
                if (!Number.isFinite(fStart) || fStart < 1) fStart = 1;
                let w = Number(a.width);
                if (!Number.isFinite(w)) w = 4;
                w = Math.max(1, Math.round(w));
                const fHi = Math.min(NFRETS, fStart + w - 1);
                minF = Math.min(minF, fStart);
                maxF = Math.max(maxF, fHi);
                any = true;
            }
        }
        const consider = f => {
            if (!(f > 0)) return;
            minF = Math.min(minF, f);
            maxF = Math.max(maxF, f);
            any = true;
        };
        if (notes) {
            let i = lowerBoundT(notes, now);
            for (; i < notes.length; i++) {
                const n = notes[i];
                if (n.t > tEnd) break;
                if (!validString(n.s)) continue;
                consider(n.f);
            }
        }
        if (chords) {
            let i = lowerBoundT(chords, now);
            for (; i < chords.length; i++) {
                const ch = chords[i];
                if (ch.t > tEnd) break;
                if (!ch.notes) continue;
                for (const cn of ch.notes) {
                    if (!validString(cn.s)) continue;
                    consider(cn.f);
                }
            }
        }
        if (!any || minF > maxF) return null;
        return { minF, maxF };
    }

    function lookaheadTargetWorldX(minF, maxF) {
        const wb = CAM_FRET_EDGE_BLEND;
        const middle = (xFretMid(minF) + xFretMid(maxF)) * 0.5;
        const weighted = 0.6 * xFret(0) + 0.4 * xFret(NFRETS);
        return middle * (1 - wb) + weighted * wb;
    }

    function lookaheadSmoothCamStep(dtSec, tgtXWorld, tgtSpanInt) {
        const d = Math.min(0.2, Math.max(1e-4, dtSec));
        const fs = 1 - Math.pow(1 - CAM_FOCUS_BLEND_RATE, d);
        ctx.cam._lookaheadCamX = tgtXWorld * fs + ctx.cam._lookaheadCamX * (1 - fs);
        ctx.cam._lookaheadFretSpan = tgtSpanInt * fs + ctx.cam._lookaheadFretSpan * (1 - fs);
    }

    return {
        lookaheadBootstrapTime, lookaheadComputeFretBounds, lookaheadTargetWorldX, lookaheadSmoothCamStep,
    };
}
