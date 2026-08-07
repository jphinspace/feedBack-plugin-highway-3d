import { AHEAD, K, NFRETS, NH, NW, S_BASE, S_GAP } from '../core/constants.js';
import { dZ, fretMid, fretX } from '../core/fret-geometry.js';
import { S_COL } from '../core/palette.js';

/**
 * Small helpers shared by more than one render module.
 * {@link camBaseDistU}/{@link camLowFretPullbackU}/{@link setLabelMap} have
 * no per-instance state and are plain named exports. Everything else reads
 * per-instance runtime state that can change without a full re-init
 * (`nStr`, lefty/inverted flags, the arp-bracket pool), so it lives behind
 * one factory, {@link createHelpers}, with live getters for all of it.
 */

/**
 * Camera `tgtDist` building blocks, shared by the dynamic (camera-follow)
 * and locked (frets 1-12) branches so a zoom-curve tuning change lands in both.
 * @param {number} span - camDistMax - camDistMin, in fret-span units
 */
export const camBaseDistU = span => 65 + Math.max(span, 4) * 3;
/** @param {number} minFret - lowest fretted note in the camera window (or 1 for the locked branch) */
export const camLowFretPullbackU = minFret => Math.max(0, 5 - minFret) * 4;

/** Deduped `sprite.material.map` swap — skips the GPU upload/`needsUpdate` when a recycled pooled sprite already shows the same texture. */
export function setLabelMap(sprite, srcMat) {
    const m = sprite.material;
    if (m.map === srcMat.map) return;
    const nullnessChanged = (m.map == null) !== (srcMat.map == null);
    m.map = srcMat.map;
    if (nullnessChanged) m.needsUpdate = true;
}

export function createHelpers({
    ctx, getLeftyCached, getInvertedCached, getNStr, getPArpBracket,
    _scrEventTimes, getScrEventTimesLen,
}) {
    // Suppresses the out-of-range warning after the first hit; reset on teardown
    // or an nStr change (e.g. guitar -> bass), since it's purely a dev-aid log.
    let _oobStringWarned = false;
    function resetOobStringWarned() { _oobStringWarned = false; }

    /** Per-string bounds check used by every loop indexing a per-string array. */
    function validString(s) {
        const nStr = getNStr();
        const ok = Number.isInteger(s) && s >= 0 && s < nStr;
        if (!ok && !_oobStringWarned) {
            _oobStringWarned = true;
            let msg = '[3D-Hwy] dropping notes with s out of range [0,' + nStr + ')';
            if (nStr === S_COL.length) msg += ' (extended-range chart beyond palette size)';
            console.warn(msg);
        }
        return ok;
    }

    /**
     * Drops out-of-range-string notes from a chord's note array, allocating
     * only when there's actually something to drop. Cached by array
     * identity, since the result depends on {@link validString} -> `nStr`:
     * `main.js`'s `_resetStringDependentCaches()` must call
     * {@link resetFilterValidNotesCache} whenever `nStr` changes, or a
     * cache entry built before the real string count arrives would filter
     * out extended-range strings forever.
     */
    let _filterValidNotesCache = new WeakMap();
    function resetFilterValidNotesCache() { _filterValidNotesCache = new WeakMap(); }
    function filterValidNotes(notes) {
        const cached = _filterValidNotesCache.get(notes);
        if (cached !== undefined) return cached;
        let filtered = notes;
        for (let i = 0; i < notes.length; i++) {
            if (!validString(notes[i].s)) {
                filtered = notes.filter(cn => validString(cn.s));
                break;
            }
        }
        _filterValidNotesCache.set(notes, filtered);
        return filtered;
    }

    const xFret = f => (getLeftyCached() ? -fretX(f) : fretX(f));
    const xFretMid = f => (getLeftyCached() ? -fretMid(f) : fretMid(f));
    const boardSpanX = () => {
        const x0 = xFret(0);
        const xN = xFret(NFRETS);
        return {
            min: Math.min(x0, xN),
            max: Math.max(x0, xN),
            center: (x0 + xN) / 2,
            width: Math.abs(xN - x0),
        };
    };
    /** String-to-Y position, respecting the invert display flag. */
    const sY = s => S_BASE + (getInvertedCached() ? s : (getNStr() - 1 - s)) * S_GAP;

    /**
     * Earliest event time strictly greater than `t`, via binary search over
     * the sorted per-frame scratch view `lookaheadPrepasses` populates —
     * O(log N) instead of an O(nStr) rescan per note/chord.
     */
    function firstEventTimeGreaterThan(t) {
        const len = getScrEventTimesLen();
        let lo = 0, hi = len;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (_scrEventTimes[mid] <= t) lo = mid + 1;
            else hi = mid;
        }
        return lo < len ? _scrEventTimes[lo] : Infinity;
    }

    /**
     * Draws a `[ GEM ]` bracket pair for an arpeggio note. While approaching
     * (`bracketDt > 0`) the brackets travel at the gem's Z; once hit they
     * sit at the fretboard plane until `arpEnd`, fading in on approach and
     * out over the last 0.25s. Fretted notes draw `[ ]`; open strings draw
     * `< >` with tips at `openHalfW` if supplied, else a fixed offset.
     */
    function drawArpBrackets(x, y, bracketDt, arpEnd, now, s, isOpen = false, openHalfW = null) {
        if (bracketDt >= AHEAD) return;
        if (bracketDt < 0 && now > arpEnd + 0.05) return;
        const pArpBracket = getPArpBracket();
        if (!pArpBracket) return;

        let alpha;
        if (bracketDt > 0) {
            alpha = 1;
        } else {
            const remaining = arpEnd - now;
            alpha = remaining > 0.25 ? 1 : Math.max(0, remaining / 0.25);
        }
        if (alpha < 0.01) return;

        const bracketZ = bracketDt > 0 ? Math.min(0, dZ(bracketDt)) : 0;
        const col = ctx.settings.activePalette[s % ctx.settings.activePalette.length];
        const barThick = NW * 0.09;
        const bracketH = NH * 1.05;
        const capLen   = NW * 0.42;
        const xOff     = (isOpen && openHalfW != null) ? openHalfW : NW * 0.95;
        const zOff     = 0.006 * K;
        const ord      = 18;

        if (isOpen) {
            // < > chevron — 2 diagonal arms per side; angle from positive-X axis via atan2.
            const armLen = Math.sqrt(capLen * capLen + (bracketH * 0.5) * (bracketH * 0.5));
            const ang    = Math.atan2(bracketH * 0.5, capLen);

            const diagBar = (px, py, rz) => {
                const b = pArpBracket.get();
                b.material.color.setHex(col);
                b.material.opacity = alpha;
                b.renderOrder = ord;
                b.position.set(px, py, bracketZ + zOff);
                b.rotation.set(0, 0, rz);
                b.scale.set(armLen, barThick, barThick);
            };

            diagBar(x - xOff + capLen * 0.5, y + bracketH * 0.25,  ang);
            diagBar(x - xOff + capLen * 0.5, y - bracketH * 0.25, -ang);
            diagBar(x + xOff - capLen * 0.5, y + bracketH * 0.25,  Math.PI - ang);
            diagBar(x + xOff - capLen * 0.5, y - bracketH * 0.25, -Math.PI + ang);
        } else {
            const bar = (px, py, sw, sh) => {
                const b = pArpBracket.get();
                b.material.color.setHex(col);
                b.material.opacity = alpha;
                b.renderOrder = ord;
                b.position.set(px, py, bracketZ + zOff);
                b.rotation.set(0, 0, 0);
                b.scale.set(sw, sh, barThick);
            };

            bar(x - xOff,                     y,                  barThick, bracketH);
            bar(x - xOff + capLen * 0.5, y + bracketH * 0.5, capLen,   barThick);
            bar(x - xOff + capLen * 0.5, y - bracketH * 0.5, capLen,   barThick);
            bar(x + xOff,                     y,                  barThick, bracketH);
            bar(x + xOff - capLen * 0.5, y + bracketH * 0.5, capLen,   barThick);
            bar(x + xOff - capLen * 0.5, y - bracketH * 0.5, capLen,   barThick);
        }
    }

    return {
        validString, filterValidNotes, resetOobStringWarned, resetFilterValidNotesCache,
        xFret, xFretMid, boardSpanX, sY,
        firstEventTimeGreaterThan, drawArpBrackets,
    };
}
