import { FRET_SCALE, FRET_SPACING_ANCHOR_F, FRET_SPACING_STRETCH_ABOVE12, NFRETS, K, TS } from './constants.js';

const _fretXLog = f => {
    if (f <= 0) return 0;
    const raw = FRET_SCALE - FRET_SCALE / Math.pow(2, f / 12);
    if (f <= FRET_SPACING_ANCHOR_F) return raw;
    const rawAnchor = FRET_SCALE - FRET_SCALE / Math.pow(2, FRET_SPACING_ANCHOR_F / 12);
    return rawAnchor + (raw - rawAnchor) * FRET_SPACING_STRETCH_ABOVE12;
};
const _fretXUniStep = _fretXLog(NFRETS) / NFRETS;
const _fretXUni = f => f <= 0 ? 0 : f * _fretXUniStep;

let _h3dFretUniform = true;

/** World-space X position of fret `f`, in the user's chosen spacing mode. */
export const fretX = f => _h3dFretUniform ? _fretXUni(f) : _fretXLog(f);

/** World-space X midpoint of fret `f`'s column. */
export const fretMid = f => (f <= 0 ? -2 * K : (fretX(f - 1) + fretX(f)) / 2);

/** World-space width of fret column `f` (wires f-1..f). */
export function fretColumnWorldW(f) {
    const fi = Math.round(Number(f));
    if (!Number.isFinite(fi) || fi <= 0) return Math.abs(fretX(1) - fretX(0));
    const lo = Math.min(NFRETS, Math.max(1, fi));
    return Math.abs(fretX(lo) - fretX(lo - 1));
}

const FRET_LABEL_SCALE_REF_FRET = 5;

/**
 * Reference fret-column width for scaling fret-number labels. A live
 * binding, recomputed by {@link _recomputeFretSpacingDerived} when the
 * spacing mode changes — read it inside function bodies, never snapshot it.
 */
export let _fretLabelScaleRefW = Math.max(1e-8, fretColumnWorldW(FRET_LABEL_SCALE_REF_FRET));

/** Scale multiplier for a fret-number label at fret `f`, relative to the reference column. */
export function fretLabelScaleForFret(f) {
    const w = fretColumnWorldW(f);
    const m = w / _fretLabelScaleRefW;
    return Math.max(0.32, Math.min(1.45, m));
}

/** World-Z offset for a note `dt` seconds from now. */
export const dZ = dt => -dt * TS;

/**
 * Pitched slide uses `sl`, unpitched uses `slu`; `sl` wins when both are present.
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
 * Lateral slide offset along the fretboard during sustain.
 * @param {{ endFret: number, unpitched: boolean } | null} [st_] - result of {@link slideTrailEnd}, computed if omitted
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

/**
 * World-units-per-fret near mid-neck, for the camera-X hysteresis dead
 * zone. A live binding, recomputed by {@link _recomputeFretSpacingDerived}.
 */
export let FRET_WIDTH_MID = fretX(7) - fretX(6);

/** Recomputes the fretX-derived scalars after the spacing mode changes. */
export function _recomputeFretSpacingDerived() {
    _fretLabelScaleRefW = Math.max(1e-8, fretColumnWorldW(FRET_LABEL_SCALE_REF_FRET));
    FRET_WIDTH_MID = fretX(7) - fretX(6);
}

/** Sets the fret-spacing mode (only the declaring module may reassign `_h3dFretUniform`). */
export function setFretUniform(isUniform) {
    _h3dFretUniform = !!isUniform;
}

/**
 * Reads the persisted fret-spacing mode and recomputes the derived scalars.
 * Must be called once from main.js at startup, not at this module's own top
 * level, so importing this module stays side-effect-free.
 */
export function initFretSpacing() {
    try { _h3dFretUniform = localStorage.getItem('highway_3d.fretSpacing') !== 'logarithmic'; } catch (_) {}
    _recomputeFretSpacingDerived();
}
