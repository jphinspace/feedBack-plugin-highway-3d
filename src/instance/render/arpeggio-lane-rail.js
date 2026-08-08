import { ARP_HWY_RAIL_END_TAIL_S, ARP_HWY_RAIL_START_LEAD_S, BEHIND } from '../../core/constants.js';

/**
 * Arpeggio lane-rail geometry: the purple vertical rails drawn on the
 * highway lane for the duration of a hand-shape's arpeggio window, plus
 * the note/chord-id lookups that gate note-level arpeggio visuals. Split
 * out from `./chord-inference.js` because it answers "where does the
 * rail/gem render" rather than "what is this chord/hand-shape", though it
 * still bottoms out in that module's `hsStart`/`hsEnd`/`hsChordIdNorm`/
 * `handShapeMarkedArpeggio`, taken as a dependency. `validString`/
 * `filterValidNotes` are injected for the same nStr-dependency reason as
 * `chord-inference.js`. The two WeakMap caches are chart-static and kept
 * per-instance so splitscreen panels don't share entries.
 */
export function createArpeggioLaneRail({ chordInference, validString, filterValidNotes }) {
    /** Chart-static WeakMap cache: note object -> chord-id (or null). Depends only on the note's (t, s, f) and the chart's handShapes + chordTemplates. */
    const _ARP_CID_NULL = Object.freeze({});
    const _arpCidCache = new WeakMap();
    function arpeggioChordIdForNoteWithInferCache(n, handShapes, chordTemplates, notesArr, hsInferFlags) {
        const cached = _arpCidCache.get(n);
        if (cached !== undefined) return cached === _ARP_CID_NULL ? null : cached;
        let result = null;
        if (!handShapes || handShapes.length === 0 || !notesArr || notesArr.length === 0 || !hsInferFlags) {
            result = chordInference.arpeggioChordIdForNote(n, handShapes, chordTemplates, notesArr);
        } else if (validString(n.s)) {
            for (let i = 0; i < handShapes.length; i++) {
                if (!hsInferFlags[i]) continue;
                const hs = handShapes[i];
                const hsLo = chordInference.hsStart(hs);
                const hsHi = chordInference.hsEnd(hs);
                if (Number.isNaN(hsLo) || Number.isNaN(hsHi)) continue;
                if (n.t + 1e-4 < hsLo || n.t > hsHi + 1e-4) continue;
                const cid = chordInference.hsChordIdNorm(hs);
                if (cid == null) continue;
                const tmpl = chordTemplates?.[cid] ?? chordTemplates?.[Number(cid)];
                if (!tmpl || !Array.isArray(tmpl.frets)) continue;
                const tf = tmpl.frets[n.s];
                if (typeof tf !== 'number' || tf < 0 || n.f !== tf) continue;
                result = cid;
                break;
            }
        }
        _arpCidCache.set(n, result === null ? _ARP_CID_NULL : result);
        return result;
    }

    /**
     * `{start, end}` chart-time bounds of the arpeggio handshape containing
     * this note, or `null`. Uses `hsInferFlags` to skip ruled-out
     * handshapes; falls back to a full scan when null. Chart-static WeakMap
     * cache; `_ARP_BOUNDS_NULL` distinguishes "no matching hs" from "uncached".
     */
    const _ARP_BOUNDS_NULL = Object.freeze({});
    const _arpBoundsCache = new WeakMap();
    function arpHsBoundsForNote(n, handShapes, hsInferFlags) {
        if (!handShapes || handShapes.length === 0) return null;
        const cached = _arpBoundsCache.get(n);
        if (cached !== undefined) return cached === _ARP_BOUNDS_NULL ? null : cached;
        let result = null;
        for (let i = 0; i < handShapes.length; i++) {
            if (hsInferFlags && !hsInferFlags[i]) continue;
            const hs = handShapes[i];
            const lo = chordInference.hsStart(hs);
            const hi = chordInference.hsEnd(hs);
            if (Number.isNaN(lo) || Number.isNaN(hi)) continue;
            if (n.t + 1e-4 < lo || n.t > hi + 1e-4) continue;
            result = { start: lo, end: hi };
            break;
        }
        _arpBoundsCache.set(n, result === null ? _ARP_BOUNDS_NULL : result);
        return result;
    }

    function handShapeIsArpeggioForLaneRail(hs, chordTemplates) {
        return chordInference.handShapeMarkedArpeggio(hs, chordTemplates);
    }

    /**
     * Chart-time window for purple rails: hand-shape span clipped to
     * matching `chords[].t` and template notes in the passage — the same
     * times that drive the 3D arpeggio frame, avoiding rails that start
     * before the box or end before the last arpeggiated note.
     */
    function effectiveArpRailChartBoundsForHandShape(hs, chords, chordTemplates, notesArr) {
        let shapeLo = chordInference.hsStart(hs);
        const _hsEndOrig = chordInference.hsEnd(hs);
        let shapeHi = _hsEndOrig;
        const cid = chordInference.hsChordIdNorm(hs);
        if (Number.isNaN(shapeLo) || Number.isNaN(shapeHi)) {
            return { shapeLo: 1e9, shapeHi: -1e9 };
        }
        if (notesArr && notesArr.length > 0 && chordTemplates && cid != null) {
            const tmpl = chordTemplates[cid] ?? chordTemplates[Number(cid)];
            if (tmpl && Array.isArray(tmpl.frets)) {
                let tFirst = null;
                let tLast = null;
                for (let i = 0; i < notesArr.length; i++) {
                    const n = notesArr[i];
                    if (n.t + 1e-4 < shapeLo - 0.18 || n.t > shapeHi + 0.45) continue;
                    if (!validString(n.s)) continue;
                    const tf = tmpl.frets[n.s];
                    if (typeof tf !== 'number' || tf < 0 || n.f !== tf) continue;
                    if (tFirst === null || n.t < tFirst) tFirst = n.t;
                    if (tLast === null || n.t > tLast) tLast = n.t;
                }
                if (tFirst != null) shapeLo = Math.max(shapeLo, tFirst);
                if (tLast != null) shapeHi = Math.max(shapeHi, tLast);
            }
        }
        if (chords && chords.length && cid != null) {
            let tMinC = null;
            let tMaxC = null;
            for (let j = 0; j < chords.length; j++) {
                const ch = chords[j];
                if (ch.id !== cid && Number(ch.id) !== Number(cid)) continue;
                if (ch.t + 1e-4 < shapeLo || ch.t > shapeHi + 0.28) continue;
                if (tMinC === null || ch.t < tMinC) tMinC = ch.t;
                if (tMaxC === null || ch.t > tMaxC) tMaxC = ch.t;
            }
            if (tMinC != null) shapeLo = Math.max(shapeLo, tMinC);
            if (tMaxC != null) shapeHi = Math.max(shapeHi, tMaxC);
        }
        shapeLo -= ARP_HWY_RAIL_START_LEAD_S;
        // Only extend past the handshape end when notes/chords genuinely reach beyond it —
        // otherwise the tail would make the rail visually larger than the handshape duration.
        if (shapeHi > _hsEndOrig) shapeHi += ARP_HWY_RAIL_END_TAIL_S;
        return { shapeLo, shapeHi };
    }

    /** Caches the authored arpeggio marker per hand shape. */
    function fillLaneRailHandShapeFlags(handShapes, chordTemplates, outFlags) {
        const nHs = handShapes.length;
        for (let i = 0; i < nHs; i++) {
            outFlags[i] = handShapeIsArpeggioForLaneRail(handShapes[i], chordTemplates);
        }
    }

    function fillArpeggioRailShapeBoundsCaches(
        handShapes, chords, chordTemplates, notesArr, laneRailFlags, loOut, hiOut,
    ) {
        const nHs = handShapes.length;
        for (let i = 0; i < nHs; i++) {
            if (!laneRailFlags[i]) continue;
            const b = effectiveArpRailChartBoundsForHandShape(
                handShapes[i], chords, chordTemplates, notesArr,
            );
            loOut[i] = b.shapeLo;
            hiOut[i] = b.shapeHi;
        }
    }

    /** Whether `[tChartLo, tChartHi]` overlaps any active arpeggio hand-shape's bounds. */
    function arpeggioLaneOuterRailChartIntervalOverlaps(
        tChartLo,
        tChartHi,
        handShapes,
        boundLo,
        boundHi,
        laneRailFlags,
    ) {
        if (!handShapes || handShapes.length === 0) return false;
        if (!laneRailFlags) return false;
        if (tChartHi < tChartLo) {
            const s = tChartLo;
            tChartLo = tChartHi;
            tChartHi = s;
        }
        for (let i = 0; i < handShapes.length; i++) {
            if (!laneRailFlags[i]) continue;
            const shapeLo = boundLo[i];
            const shapeHi = boundHi[i];
            if (tChartHi < shapeLo - 1e-4 || tChartLo > shapeHi + 1e-4) continue;
            return true;
        }
        return false;
    }

    function arpeggioLaneOuterRailLaneSlice(
        dt0, dt1, nowClock,
        handShapes, boundLo, boundHi, laneRailFlags,
    ) {
        const tLo = nowClock + Math.min(dt0, dt1) - BEHIND;
        const tHi = nowClock + Math.max(dt0, dt1) - BEHIND;
        return arpeggioLaneOuterRailChartIntervalOverlaps(
            tLo, tHi, handShapes, boundLo, boundHi, laneRailFlags,
        );
    }

    /**
     * True when chart time `chartT` falls inside an arpeggio hand-shape.
     * Uses a short end tail only — no `CHORD_HWY_LINGER_S` — so purple
     * lane rails match visible highway slices and don't leak after shapes end.
     */
    function arpeggioLaneOuterRailAtChartTime(
        chartT, handShapes, boundLo, boundHi, laneRailFlags,
    ) {
        return arpeggioLaneOuterRailChartIntervalOverlaps(
            chartT, chartT, handShapes, boundLo, boundHi, laneRailFlags,
        );
    }

    /**
     * Same `chordAccent ? ft *= 1.22` boost as the 3D arpeggio chord rim,
     * so lane rails match an accented frame when the active hand shape
     * links to a chord row carrying `.ac` notes.
     */
    function arpeggioLaneDividerFrameAccentMul(nowT, handShapes, chords, boundLo, boundHi, laneRailFlags) {
        if (!handShapes || handShapes.length === 0 || !chords || chords.length === 0) return 1;
        if (!laneRailFlags) return 1;
        for (let i = 0; i < handShapes.length; i++) {
            if (!laneRailFlags[i]) continue;
            const shapeLo = boundLo[i];
            const shapeHi = boundHi[i];
            if (nowT + 1e-4 < shapeLo || nowT > shapeHi + 1e-4) continue;

            const cid = chordInference.hsChordIdNorm(handShapes[i]);
            if (cid == null) return 1;
            for (let j = 0; j < chords.length; j++) {
                const ch = chords[j];
                if (ch.id !== cid && Number(ch.id) !== Number(cid)) continue;
                if (Math.abs(ch.t - chordInference.hsStart(handShapes[i])) > 0.12) continue;
                const chordNotes = ch.notes ? filterValidNotes(ch.notes) : [];
                if (chordNotes.some(cn => cn.ac)) return 1.22;
                return 1;
            }
            return 1;
        }
        return 1;
    }

    return {
        arpeggioChordIdForNoteWithInferCache, arpHsBoundsForNote,
        fillLaneRailHandShapeFlags, fillArpeggioRailShapeBoundsCaches,
        arpeggioLaneOuterRailLaneSlice, arpeggioLaneOuterRailAtChartTime,
        arpeggioLaneDividerFrameAccentMul,
    };
}
