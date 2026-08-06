import { FRET_SCALE, FRET_SPACING_ANCHOR_F, FRET_SPACING_STRETCH_ABOVE12, NFRETS, K, TS } from './constants.js';

// Fret X positioning, in world units, plus the technique helpers (slide
// trail/offset) that derive their geometry from it.
//
// Two spacing modes, switchable at runtime by the user (Settings > Fret
// spacing): Uniform (equal column width per fret, chart-format style) or
// Logarithmic (real guitar-fret geometry, 12th root of 2). `fretX`/`fretMid`
// are the single source of truth for "where on the X axis is fret N" —
// every board/note/camera calculation elsewhere in the renderer goes
// through them.
//
// `FRET_WIDTH_MID` and the fret-label scale reference width are exported as
// live bindings (`export let`) because they're derived from the spacing mode
// and must be recomputed when it flips (see `_recomputeFretSpacingDerived`).
// Do not snapshot them (`const w = FRET_WIDTH_MID` at module scope in an
// importer) — read them inside function bodies, same rule as `T` in
// ./three.js.

// Logarithmic spacing — mirrors real guitar fret geometry (12th root of 2).
const _fretXLog = f => {
    if (f <= 0) return 0;
    const raw = FRET_SCALE - FRET_SCALE / Math.pow(2, f / 12);
    if (f <= FRET_SPACING_ANCHOR_F) return raw;
    const rawAnchor = FRET_SCALE - FRET_SCALE / Math.pow(2, FRET_SPACING_ANCHOR_F / 12);
    return rawAnchor + (raw - rawAnchor) * FRET_SPACING_STRETCH_ABOVE12;
};
// Uniform spacing — same column width per fret (chart-format style).
// Total board width equals the logarithmic NFRETS position for consistency.
const _fretXUniStep = _fretXLog(NFRETS) / NFRETS;
const _fretXUni = f => f <= 0 ? 0 : f * _fretXUniStep;

// Import-purity note: this used to be `let _h3dFretUniform = true; try {
// _h3dFretUniform = localStorage.getItem(...) !== 'logarithmic'; } catch {}`
// run unconditionally at module scope. That's a bare localStorage read at
// import time, which `node --test` real-importing this module would
// execute on every test run (and which a non-browser embedder couldn't
// satisfy at all). Lifted into `initFretSpacing()`, called once from
// src/main.js — see the ordering note there.
let _h3dFretUniform = true;
export const fretX = f => _h3dFretUniform ? _fretXUni(f) : _fretXLog(f);

export const fretMid = f => (f <= 0 ? -2 * K : (fretX(f - 1) + fretX(f)) / 2);
/** World-space width of fret column (wires f−1 .. f); used to scale row markers past ~12. */
export function fretColumnWorldW(f) {
    const fi = Math.round(Number(f));
    if (!Number.isFinite(fi) || fi <= 0) return Math.abs(fretX(1) - fretX(0));
    const lo = Math.min(NFRETS, Math.max(1, fi));
    return Math.abs(fretX(lo) - fretX(lo - 1));
}
/** Reference column (~mid board): prior fixed K-based sprites matched this neighborhood. */
const FRET_LABEL_SCALE_REF_FRET = 5;
// `let` (not `const`): recomputed by _recomputeFretSpacingDerived when the
// user flips Uniform/Logarithmic at runtime so label scaling tracks the
// new geometry without a page reload.
export let _fretLabelScaleRefW = Math.max(1e-8, fretColumnWorldW(FRET_LABEL_SCALE_REF_FRET));
export function fretLabelScaleForFret(f) {
    const w = fretColumnWorldW(f);
    const m = w / _fretLabelScaleRefW;
    return Math.max(0.32, Math.min(1.45, m));
}
export const dZ = dt => -dt * TS;

/**
 * Pitched slide uses `sl`, unpitched uses `slu` (slide-to vs unpitched slide fields).
 * Prefer `sl` when both are present — matches RS wire.
 * @returns {{ endFret: number, unpitched: boolean } | null}
 */
export function slideTrailEnd(n) {
    const sl = n.sl;
    const slu = n.slu;
    if (Number.isFinite(sl) && sl >= 0) {
        return { endFret: sl | 0, unpitched: false };
    }
    if (Number.isFinite(slu) && slu >= 0) {
        return { endFret: slu | 0, unpitched: true };
    }
    return null;
}

/**
 * Lateral slide offset along the fretboard during sustain — easing
 * mirrors the pitched/unpitched slide offset convention above.
 * @param {{ endFret: number, unpitched: boolean } | null} [st_] from slideTrailEnd
 */
export function slideOffsetWorldX(n, chartTime, st_) {
    const st = st_ || slideTrailEnd(n);
    if (!st || n.f <= 0 || !(n.sus > 0)) return 0;
    const denom = Math.max(n.sus, 1e-6);
    const p = Math.max(0, Math.min(1, (chartTime - n.t) / denom));
    const startX = fretMid(n.f);
    const endX = fretMid(st.endFret);
    const w = st.unpitched
        ? 1 - Math.sin((1 - p) * Math.PI / 2)
        : Math.pow(Math.sin(p * Math.PI / 2), 3);
    return (endX - startX) * w;
}

// World-units-per-fret near mid-neck. Used by the camera-X hysteresis
// gate (issue #34) to convert a fret-equivalent dead zone into world
// units. Pure function of SCALE — hoist out of update()'s hot path.
// `let` (not `const`): recomputed alongside _fretLabelScaleRefW when the
// fret-spacing mode flips at runtime — see _recomputeFretSpacingDerived.
export let FRET_WIDTH_MID = fretX(7) - fretX(6);

// Recompute the fretX-derived scalars baked at module init. Called from
// h3dSetFretSpacing (src/main.js) after _h3dFretUniform flips so label
// scaling and the camera hysteresis threshold track the newly chosen
// spacing — the live alternative to the old location.reload(), which
// ejected the user from Settings back to the home screen. Lives here
// rather than in main.js because it reassigns this module's own `let`
// exports (_fretLabelScaleRefW, FRET_WIDTH_MID) — only the declaring
// module can reassign an exported live binding.
export function _recomputeFretSpacingDerived() {
    _fretLabelScaleRefW = Math.max(1e-8, fretColumnWorldW(FRET_LABEL_SCALE_REF_FRET));
    FRET_WIDTH_MID = fretX(7) - fretX(6);
}

// Same reasoning as _recomputeFretSpacingDerived: h3dSetFretSpacing (still
// in src/main.js, since it also needs _bgEmitChange) sets the spacing mode
// by calling this rather than reassigning _h3dFretUniform directly, because
// an importer can never reassign another module's `let` binding.
export function setFretUniform(isUniform) {
    _h3dFretUniform = !!isUniform;
}

/**
 * Reads the persisted fret-spacing mode from localStorage and computes the
 * derived scalars from it. Called once from src/main.js at startup — NOT at
 * this module's own top level — so importing this module is side-effect-free
 * (real-importable from node --test, safe in non-browser embedders). Module
 * scope above already computed _fretLabelScaleRefW/FRET_WIDTH_MID once using
 * the `true` (uniform) default; this call corrects them to the stored mode.
 * Safe only because src/main.js calls this before the factory is ever used
 * to render anything — see the call site there for the ordering guarantee.
 */
export function initFretSpacing() {
    try { _h3dFretUniform = localStorage.getItem('highway_3d.fretSpacing') !== 'logarithmic'; } catch (_) {}
    _recomputeFretSpacingDerived();
}
