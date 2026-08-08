import {
    BASE_VFOV, HORPLUS_MIN_VFOV, HORPLUS_START_ASPECT, TREMOLO_BUMP_S, VIBRATO_HALF_WAVE_S,
} from '../../core/constants.js';

/** Camera vertical-fov compensation for ultra-wide (Hor+) aspect ratios. */
export function effectiveVfov(aspect, tune) {
    const base = (tune && Number.isFinite(tune.baseVfov)) ? tune.baseVfov : BASE_VFOV;
    if (!tune || !tune.enabled || !Number.isFinite(aspect) || aspect <= 0) return base;
    const start = (Number.isFinite(tune.startAspect) && tune.startAspect > 0)
        ? tune.startAspect : HORPLUS_START_ASPECT;
    if (aspect <= start) return base;
    const floor = Number.isFinite(tune.minVfovDeg) ? tune.minVfovDeg : HORPLUS_MIN_VFOV;
    const DEG = Math.PI / 180;
    // Held horizontal fov: explicit hfovDeg if given, else the horizontal cone the base
    // vertical fov produces at the start aspect.
    const hfov = (Number.isFinite(tune.hfovDeg) && tune.hfovDeg > 0)
        ? tune.hfovDeg * DEG
        : 2 * Math.atan(Math.tan(base * DEG / 2) * start);
    // Vertical fov that reproduces that horizontal cone at this aspect.
    let vfov = 2 * Math.atan(Math.tan(hfov / 2) / aspect) / DEG;
    const blend = Number.isFinite(tune.blend) ? Math.max(0, Math.min(1, tune.blend)) : 1;
    vfov = base + (vfov - base) * blend; // 0 = base, 1 = full Hor+
    if (!Number.isFinite(vfov)) return base;
    return Math.max(floor, Math.min(base, vfov));
}

/** Resilient canvas-dimension lookup: falls back to the parent container, then the player-footer/controls height. */
export function canvasSize(canvas) {
    if (canvas) {
        // A canvas with zero bounds (hidden via any mechanism) falls back to its parent
        // container (the splitscreen panelDiv), which is always visible and correctly sized.
        const rect = canvas.getBoundingClientRect();
        const target = (rect.width === 0 || rect.height === 0) && canvas.parentNode ? canvas.parentNode : canvas;
        const sz = target === canvas ? rect : target.getBoundingClientRect();
        if (sz.width > 0 && sz.height > 0) return { w: sz.width, h: sz.height };
    }
    const ch = (document.getElementById('player-footer')
        || document.getElementById('player-controls'))?.offsetHeight || 50;
    return { w: innerWidth, h: innerHeight - ch };
}

/** Disposes every geometry/material in a Three.js object subtree and detaches it from its parent. */
export function disposeGroupTree(obj) {
    if (!obj) return;
    obj.traverse((child) => {
        child.geometry?.dispose?.();
        const mat = child.material;
        if (mat) {
            const mats = Array.isArray(mat) ? mat : [mat];
            for (const m of mats) m?.dispose?.();
        }
    });
    obj.parent?.remove(obj);
}

/** Darkens a 0xRRGGBB color by `factor` (0..1), for the slide-arrow marker (full string color is too bright next to the gem). */
export function darkenHex(hex, factor) {
    const h = (hex >>> 0) & 0xffffff;
    const r = Math.round(((h >> 16) & 0xff) * factor);
    const g = Math.round(((h >> 8) & 0xff) * factor);
    const b = Math.round((h & 0xff) * factor);
    return (r << 16) | (g << 8) | b;
}

export function noteHasVibrato(n) {
    return !!(n && (n.vb || n.vibrato));
}

/** Fret-hand finger label: '' when unset/out of range, 0 -> 'T' (thumb), 1..4 -> '1'..'4'. Display only, never grading. */
export function teachingFingerLabel(fg) {
    if (!Number.isInteger(fg) || fg < 0 || fg > 4) return '';
    return fg === 0 ? 'T' : String(fg);
}
/** Scale degree label: chromatic 0..11 above the active key tonic; '' when unset/out of range. Display only, never grading. */
export function teachingDegreeLabel(sd) {
    if (!Number.isInteger(sd) || sd < 0 || sd > 11) return '';
    return String(sd);
}

/** Linearly interpolates a bend curve `[{t, v}]` (t = seconds from note onset) at elapsed time `t`, clamped to the endpoints. */
export function bnvSampleAt(bnv, t) {
    if (!Array.isArray(bnv) || bnv.length === 0) return 0;
    if (t <= bnv[0].t) return bnv[0].v;
    const last = bnv[bnv.length - 1];
    if (t >= last.t) return last.v;
    for (let i = 1; i < bnv.length; i++) {
        const a = bnv[i - 1], b = bnv[i];
        if (t <= b.t) {
            const span = b.t - a.t;
            return span > 0 ? a.v + (b.v - a.v) * ((t - a.t) / span) : b.v;
        }
    }
    return last.v;
}

export function vibratoSemisAtTime(n, chartTime) {
    if (!noteHasVibrato(n) || !(n?.sus > 0)) return 0;
    const elapsed = Math.max(0, chartTime - n.t);
    return Math.sin(elapsed * Math.PI / VIBRATO_HALF_WAVE_S);
}

export function tremoloOffsetWorldX(n, chartTime, trailW) {
    if (!(n?.tr) || !(n?.sus > 0)) return 0;
    const elapsed = Math.max(0, chartTime - n.t);
    const phase = (elapsed % TREMOLO_BUMP_S) / TREMOLO_BUMP_S;
    const tri = (Math.abs(phase - 0.5) - 0.25) * 3;
    return trailW * 0.5 * tri;
}
