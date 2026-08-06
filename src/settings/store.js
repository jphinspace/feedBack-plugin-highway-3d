import {
    BG_DEFAULTS, BG_STYLE_IDS, BG_THEME_IDS, CAMERA_MODE_IDS, FRET_NUMBER_GHOST_SCOPE_IDS,
} from './defaults.js';
import { PALETTE_IDS } from '../core/palette.js';
import { CHORD_DIAG_POSITION_IDS } from '../core/constants.js';

// Per-panel/global localStorage settings read/write, value coercion, and a
// pub-sub bus (_bgSubscribe/_bgEmitChange) so settings.html and every live
// renderer panel stay in sync when a setting changes.
//
// _bgMemFallback and _bgListeners are deliberate module singletons: a
// single in-memory shadow and a single subscriber set shared by every
// renderer instance, not per-instance state. _bgWriteGlobal stages to
// _bgMemFallback BEFORE localStorage.setItem so _bgReadSetting's "memory
// beats persisted" precedence holds even if the localStorage write throws
// partway through (quota exceeded, private-mode restrictions, etc.).


/**
 * localStorage panel key for per-panel background settings ('main' or
 * 'panel<index>'). Defensive on the splitscreen global-name rename in flight,
 * and throw-safe on panelIndexFor — same as _freeCamFor — so a misbehaving
 * splitscreen build can't take down background-settings resolution. Only a
 * non-negative integer index yields a 'panel<N>' key; anything else (null,
 * NaN, negative, non-integer) falls back to 'main' so a bad index can never
 * mint a bogus "panelNaN"-style key.
 * @param {HTMLCanvasElement} canvas this renderer's highway canvas
 * @returns {string} 'main' or 'panel<index>'
 */
export function _bgPanelKey(canvas) {
    const ss = window.feedBackSplitscreen || window.slopsmithSplitscreen;
    let idx = null;
    if (ss && typeof ss.panelIndexFor === 'function') {
        try { idx = ss.panelIndexFor(canvas); } catch (e) { idx = null; }
    }
    return (Number.isInteger(idx) && idx >= 0) ? 'panel' + idx : 'main';
}

/**
 * Camera Director bridge resolver. Prefers THIS panel's per-panel camera under
 * splitscreen (window.__h3dCamCtlPanels[panelIndex]) and falls back to the
 * single global (window.__h3dCamCtl); returns null when Camera Director is
 * absent → 100% stock framing. Defensive on the splitscreen global-name rename
 * in flight (feedBackSplitscreen vs slopsmithSplitscreen); throw-safe on
 * panelIndexFor. Mirrors the panel resolution in _bgPanelKey.
 * @param {HTMLCanvasElement} canvas this renderer's highway canvas
 * @returns {object|null} the resolved free-camera bridge, or null
 */
export function _freeCamFor(canvas) {
    const map = window.__h3dCamCtlPanels;
    if (map) {
        const ss = window.feedBackSplitscreen || window.slopsmithSplitscreen;
        if (ss && typeof ss.panelIndexFor === 'function') {
            try {
                const i = ss.panelIndexFor(canvas);
                // Only a non-negative integer indexes the map (same hardening
                // as _bgPanelKey) — a non-int / negative / string index must not
                // resolve an unintended/inherited property; fall through then.
                if (Number.isInteger(i) && i >= 0 && map[i]) return map[i];
            } catch (e) { /* ignore */ }
        }
    }
    return window.__h3dCamCtl || null;
}
// In-memory fallback for when localStorage is blocked (private mode,
// sandboxed iframes, some test runners). _bgWriteGlobal stages the
// value here unconditionally, so it always reflects the most recent
// in-session intent — _bgReadSetting prefers it over the global
// localStorage slot to avoid serving a stale persisted value when
// a write failed silently (quota exceeded, etc.). Per-panel
// localStorage overrides still win because they're an explicit
// per-instance opt-out and shouldn't be shadowed by a global edit.
export const _bgMemFallback = Object.create(null);
export function _bgReadSetting(panelKey, key) {
    let panelVal = null;
    let globalVal = null;
    try {
        // 'palette' + 'customColors' are GLOBAL-only: the per-panel palette
        // control was removed in favour of the global "Highway String Colors"
        // UI, so a panel must never be shadowed by a stale per-panel override
        // (h3d_bg_panel<idx>_palette / _customColors). Neither is a
        // BG_DEFAULTS key, so per-panel scoping never applied to them.
        if (key !== 'palette' && key !== 'customColors') {
            panelVal = localStorage.getItem('h3d_bg_' + panelKey + '_' + key);
        }
        globalVal = localStorage.getItem('h3d_bg_' + key);
    } catch (_) { /* storage blocked — both stay null */ }
    if (panelVal !== null && panelVal !== undefined) return _bgCoerce(key, panelVal);
    // Prefer the in-memory staged value over the persisted global slot.
    // _bgWriteGlobal always writes to _bgMemFallback first, so the
    // memory value is at least as fresh as the persisted one.
    if (key in _bgMemFallback) return _bgCoerce(key, _bgMemFallback[key]);
    if (globalVal !== null && globalVal !== undefined) return _bgCoerce(key, globalVal);
    return BG_DEFAULTS[key];
}
// Read a setting's GLOBAL value, ignoring any per-panel override. The
// player-chrome control is a single shared instance, so it must always
// read (and write) the global slot. Passing null as a panelKey to
// _bgReadSetting happened to work only because 'h3d_bg_null_<key>' never
// exists; this states the intent directly and can't be shadowed if a
// panelKey of null is ever used deliberately. Mirrors the global half of
// _bgReadSetting exactly (mem-fallback precedence, then persisted, then
// default).
export function _bgReadGlobal(key) {
    let globalVal = null;
    try { globalVal = localStorage.getItem('h3d_bg_' + key); } catch (_) { /* storage blocked */ }
    if (key in _bgMemFallback) return _bgCoerce(key, _bgMemFallback[key]);
    if (globalVal !== null && globalVal !== undefined) return _bgCoerce(key, globalVal);
    return BG_DEFAULTS[key];
}
// Shared "stored string -> bool" coercion for every boolean
// setting. Mirrors settings.html's coerceBool so the renderer and
// the UI hydration always agree on what a corrupted/unknown value
// means (fall back to default rather than silently flipping to
// false). Add new boolean keys to BG_DEFAULTS and they pick this
// up via the dispatch below.
export const _BG_BOOL_KEYS = new Set(['reactive', 'showFretOnNote', 'cameraLockLow', 'inlayLabelsVisible', 'sectionLabelsOnHighway', 'sectionHudVisible', 'nutHeadstockVisible', 'tuningLabelsVisible', 'projectionVisible', 'chordDiagramVisible', 'fpsVisible', 'toneHudVisible', 'fretDividersVisible', 'slideArrowApproachVisible', 'slideArrowNeckVisible', 'slideArrowChainPreviewVisible', 'sparks', 'cinematic', 'verdictMarks', 'timingFx', 'streakFx', 'bloom']);
export function _bgCoerceBool(val, fallback) {
    if (val === 'true' || val === '1') return true;
    if (val === 'false' || val === '0') return false;
    return fallback;
}
// Settings stored as 0..1 floats. cameraSmoothing controls X-pan
// hysteresis; zoomSmoothing the zoom dead zone; tiltSmoothing the
// vertical-tilt deadband + correction strength. All three slider-
// shaped settings share the same parse + clamp behaviour.
export const _BG_FLOAT_KEYS = new Set(['intensity', 'cameraSmoothing', 'zoomSmoothing', 'tiltSmoothing', 'cameraLockZoom', 'textSize', 'vibrancy', 'glow', 'chordDiagramSize', 'sectionHudSize', 'toneHudSize', 'hitFx']);
export function _bgCoerce(key, val) {
    if (_BG_FLOAT_KEYS.has(key)) {
        const n = parseFloat(val);
        return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : BG_DEFAULTS[key];
    }
    if (_BG_BOOL_KEYS.has(key)) return _bgCoerceBool(val, BG_DEFAULTS[key]);
    if (key === 'style') return BG_STYLE_IDS.includes(val) ? val : BG_DEFAULTS.style;
    if (key === 'palette') return (PALETTE_IDS.includes(val) || val === 'custom') ? val : BG_DEFAULTS.palette;
    if (key === 'bgTheme') return BG_THEME_IDS.includes(val) ? val : BG_DEFAULTS.bgTheme;
    // Highway axis shares the same id-set as the background axis.
    if (key === 'hwTheme') return BG_THEME_IDS.includes(val) ? val : BG_DEFAULTS.hwTheme;
    if (key === 'chordDiagramPosition')
        return CHORD_DIAG_POSITION_IDS.includes(val) ? val : BG_DEFAULTS.chordDiagramPosition;
    if (key === 'sectionHudPosition')
        return ['tl', 'tr', 'bl', 'br'].includes(val) ? val : BG_DEFAULTS.sectionHudPosition;
    if (key === 'toneHudPosition')
        return ['tl', 'tr', 'bl', 'br'].includes(val) ? val : BG_DEFAULTS.toneHudPosition;
    if (key === 'cameraMode') {
        if (val === 'classic') val = 'steady';
        return CAMERA_MODE_IDS.includes(val) ? val : BG_DEFAULTS.cameraMode;
    }
    if (key === 'fretNumberGhostScope')
        return FRET_NUMBER_GHOST_SCOPE_IDS.includes(val) ? val : BG_DEFAULTS.fretNumberGhostScope;
    if (key === 'nutColor' || key === 'headstockColor') {
        if (typeof val !== 'string') return BG_DEFAULTS[key];
        const t = val.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(t)) return t.toLowerCase();
        return BG_DEFAULTS[key];
    }
    if (key === 'fretColumnMarkerCadence') {
        const n = parseInt(val, 10);
        if (!Number.isFinite(n)) return BG_DEFAULTS.fretColumnMarkerCadence;
        return Math.max(0, Math.min(16, n));
    }
    return val;
}

// Mirror-at-first-read fallback: returns true if the user has ever
// explicitly written `key` (per-panel, in-memory, or global). When
// false, callers should treat the value as "unset" — useful for
// zoomSmoothing / tiltSmoothing which inherit cameraSmoothing's
// value the first time they're read so existing users who calmed
// the camera don't lose calmness on the new axes by default.
export function _bgHasStored(panelKey, key) {
    try {
        if (localStorage.getItem('h3d_bg_' + panelKey + '_' + key) != null) return true;
    } catch (_) {}
    if (key in _bgMemFallback) return true;
    try {
        if (localStorage.getItem('h3d_bg_' + key) != null) return true;
    } catch (_) {}
    return false;
}
export function _bgWriteGlobal(key, val) {
    const s = String(val);
    // Stage in memory FIRST so _bgReadSetting's "memory beats global
    // localStorage" precedence has a true freshness guarantee even
    // if localStorage.setItem throws partway through. Without this
    // ordering, a quota exception thrown after the persisted slot
    // was already mutated would leave a stale value in localStorage
    // that's newer than _bgMemFallback.
    _bgMemFallback[key] = s;
    try { localStorage.setItem('h3d_bg_' + key, s); } catch (_) { /* storage blocked */ }
    _bgEmitChange(key);
}

// Pub-sub so settings.html can update live across all panel instances.
export const _bgListeners = new Set();
export function _bgSubscribe(fn) { _bgListeners.add(fn); }
export function _bgUnsubscribe(fn) { _bgListeners.delete(fn); }
export function _bgEmitChange(key) {
    for (const fn of _bgListeners) {
        try { fn(key); } catch (e) { console.error('[3D-Hwy] bg listener threw', e); }
    }
}
