import { AHEAD, K, NFRETS, NH, NW, S_BASE, S_GAP } from '../core/constants.js';
import { dZ, fretMid, fretX } from '../core/fret-geometry.js';
import { S_COL } from '../core/palette.js';

// Small helpers used by more than one already-extracted render module --
// moved out of main.js (Stage 7, post-3e) after a user question about why
// drawArpBrackets() sat alone in main.js turned into "check for others like
// it." All of these were found the same way: still bare functions/consts in
// main.js, injected as a construction-time dep into 2+ of the createX(deps)
// factories elsewhere in this directory.
//
// Two genuinely different lifetimes forced two shapes in this one file:
//   - camBaseDistU/camLowFretPullbackU/setLabelMap have ZERO closure
//     dependencies -- plain named exports, importable directly.
//   - Everything else reads per-instance runtime state (nStr/_leftyCached/
//     _invertedCached change on a lefty/string-count flip WITHOUT a full
//     re-init; pArpBracket doesn't exist until partway through the FIRST
//     initScene() call, well after this factory needs to be constructed --
//     see main.js's construction-site comment for why) -- one factory,
//     createHelpers(), with live getters for all of it.

// Camera tgtDist building blocks. Both the dynamic (camera-follow) and
// locked (frets 1-12) branches compose tgtDist from these, so any future
// tuning of the base zoom curve or low-fret pullback lands in both
// branches without drift.
//   span    — camDistMax - camDistMin in fret-span units
//   minFret — lowest fretted note in the camera window (or 1 for the
//             locked branch, which assumes nut chords)
export const camBaseDistU = span => 65 + Math.max(span, 4) * 3;
export const camLowFretPullbackU = minFret => Math.max(0, 5 - minFret) * 4;

// Three.js sprite material.map swap, deduped. Recycled pooled sprites
// (chord names, fret labels, ...) keep a stale .map from whatever text they
// last showed; every call site checks identity first so a steady label
// doesn't pay a redundant GPU upload / needsUpdate flag every frame. (Note:
// the DOMINANT getParameters churn turned out to be Three's transparent-
// DoubleSide two-pass path -- see the forceSinglePass comment in
// _spriteMat2MeshMat in main.js -- this helper removes the label-swap
// contribution on top of that.)
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
    // ── String validity ────────────────────────────────────────────────
    // Set true once a chart with out-of-range s indices has triggered its
    // warning. Reset only on teardown or when nStr changes (e.g. arrangement
    // switch from guitar to bass) -- same-nStr songs share the suppression,
    // which is fine for what is purely a developer aid log.
    let _oobStringWarned = false;
    function resetOobStringWarned() { _oobStringWarned = false; }

    // Per-string bounds check used by every loop that indexes a per-string
    // array (noteState.*, nextNoteByString, lastFretForString, mStr/mGlow/
    // mSus, ...). Skipping out-of-range s upstream keeps sparse-array
    // extension out of those arrays AND keeps drawNote's material lookup
    // safe in one place.
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

    // filter() allocates a new array per chord per frame, even though the
    // vast majority of charts have no out-of-range strings. Scan first;
    // only allocate when there's actually something to drop. The
    // unfiltered array is reused as-is in the common case.
    //
    // Result is cached by ``ch.notes`` identity -- call sites (chord render
    // loop, camera pre-pass, strGlow / accent prepasses, cjNext peek) hit
    // the same chord-notes array many times per frame, and the array
    // contents are chart-static for the lifetime of the arrangement. The
    // cache stores either the input array itself (common case) or the
    // filtered copy, so the identity-preservation contract callers depend
    // on is unchanged.
    // NOTE: this cache (and _chordSigCache / _chordShapeCache, in
    // instance/model/chord-inference.js) keys on the notes/chord object but
    // its result depends on validString() -> nStr. If first computed while
    // nStr is still the default 6 (an early frame before song_info
    // applies stringCount), string-6+ notes get filtered out and would
    // stay gone forever. main.js's _resetStringDependentCaches() resets
    // all three via resetFilterValidNotesCache() below (this module's
    // share) so extended-range (7+ string) charts recompute once the real
    // string count arrives.
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

    // ── Board position math (lefty/invert-aware) ───────────────────────
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
    // String-to-Y (respects invert).
    const sY = s => S_BASE + (getInvertedCached() ? s : (getNStr() - 1 - s)) * S_GAP;

    // ── Sorted event-time lookup ────────────────────────────────────────
    // "Earliest event time strictly greater than t" over the sorted scratch
    // view lookaheadPrepasses.computeEventTimesUnion() populates once per
    // frame in update() -- O(log N) over at most 2 * MAX_RENDER_STRINGS
    // entries, replacing a 2*nStr rescan per note/chord per frame that was
    // hot in dense PM/FH/arpeggio passages. drawNote() and the chord render
    // loop both need this to deadline-cap gem visibility.
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
     * Draw  [ GEM ]  bracket pair for an arpeggio note.
     *
     * While the note is approaching (bracketDt > 0) the brackets travel at
     * the same Z as the gem. Once the note hits the line (bracketDt <= 0)
     * the brackets sit at Z = 0 (the fretboard plane) and persist until
     * arpEnd. They fade in with approach and fade out in the last 0.25 s
     * of the arpeggio.
     *
     * Fretted notes: `[ ]` — 3 BoxGeometry bars per side (vertical + 2 caps).
     * Open strings:  `< >` — 2 diagonal arms per side, tips at note edges.
     *
     * openHalfW (optional) — half-width of the open note body; when
     * supplied, the < > tips are placed at the actual edges of the note
     * rather than a fixed offset.
     */
    function drawArpBrackets(x, y, bracketDt, arpEnd, now, s, isOpen = false, openHalfW = null) {
        if (bracketDt >= AHEAD) return;
        if (bracketDt < 0 && now > arpEnd + 0.05) return;
        const pArpBracket = getPArpBracket();
        if (!pArpBracket) return;

        let alpha;
        if (bracketDt > 0) {
            // Match the chord frame box visibility: full opacity throughout
            // the entire AHEAD window so brackets appear the moment the
            // frame enters view, not after a slow linear fade from alpha≈0
            // at 3 s out.
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
            // < > chevron — 2 diagonal arms per side.
            // Arm goes from tip outward; angle from positive-X axis via atan2.
            const armLen = Math.sqrt(capLen * capLen + (bracketH * 0.5) * (bracketH * 0.5));
            const ang    = Math.atan2(bracketH * 0.5, capLen); // upper-right arm angle

            const diagBar = (px, py, rz) => {
                const b = pArpBracket.get();
                b.material.color.setHex(col);
                b.material.opacity = alpha;
                b.renderOrder = ord;
                b.position.set(px, py, bracketZ + zOff);
                b.rotation.set(0, 0, rz);
                b.scale.set(armLen, barThick, barThick);
            };

            // < tip at (x - xOff), arms open to the right
            diagBar(x - xOff + capLen * 0.5, y + bracketH * 0.25,  ang);
            diagBar(x - xOff + capLen * 0.5, y - bracketH * 0.25, -ang);

            // > tip at (x + xOff), arms open to the left
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

            // Left bracket  [  – vertical bar then caps opening to the right
            bar(x - xOff,                     y,                  barThick, bracketH);
            bar(x - xOff + capLen * 0.5, y + bracketH * 0.5, capLen,   barThick);
            bar(x - xOff + capLen * 0.5, y - bracketH * 0.5, capLen,   barThick);

            // Right bracket  ]  – vertical bar then caps opening to the left
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
