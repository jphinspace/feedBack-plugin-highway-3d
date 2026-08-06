import {
    SETTING_DEFAULTS, BACKGROUND_STYLE_IDS, SCENE_THEME_IDS, CAMERA_MODE_IDS, FRET_NUMBER_GHOST_SCOPE_IDS,
} from './defaults.js';
import { PALETTE_IDS } from '../core/palette.js';
import { CHORD_DIAG_POSITION_IDS } from '../core/constants.js';

// Per-panel/global localStorage settings read/write, value coercion, and a
// pub-sub bus (subscribeToSettings/emitSettingChange) so settings.html and every live
// renderer panel stay in sync when a setting changes.
//
// settingsMemFallback and settingsListeners are deliberate module singletons: a
// single in-memory shadow and a single subscriber set shared by every
// renderer instance, not per-instance state. writeGlobalSetting stages to
// settingsMemFallback BEFORE localStorage.setItem so readSetting's "memory
// beats persisted" precedence holds even if the localStorage write throws
// partway through (quota exceeded, private-mode restrictions, etc.).


/**
 * localStorage panel key for per-panel background settings ('main' or
 * 'panel<index>'). Defensive on the splitscreen global-name rename in flight,
 * and throw-safe on panelIndexFor — same as freeCamFor — so a misbehaving
 * splitscreen build can't take down background-settings resolution. Only a
 * non-negative integer index yields a 'panel<N>' key; anything else (null,
 * NaN, negative, non-integer) falls back to 'main' so a bad index can never
 * mint a bogus "panelNaN"-style key.
 * @param {HTMLCanvasElement} canvas this renderer's highway canvas
 * @returns {string} 'main' or 'panel<index>'
 */
export function settingsPanelKey(canvas) {
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
 * panelIndexFor. Mirrors the panel resolution in settingsPanelKey.
 * @param {HTMLCanvasElement} canvas this renderer's highway canvas
 * @returns {object|null} the resolved free-camera bridge, or null
 */
export function freeCamFor(canvas) {
    const map = window.__h3dCamCtlPanels;
    if (map) {
        const ss = window.feedBackSplitscreen || window.slopsmithSplitscreen;
        if (ss && typeof ss.panelIndexFor === 'function') {
            try {
                const i = ss.panelIndexFor(canvas);
                // Only a non-negative integer indexes the map (same hardening
                // as settingsPanelKey) — a non-int / negative / string index must not
                // resolve an unintended/inherited property; fall through then.
                if (Number.isInteger(i) && i >= 0 && map[i]) return map[i];
            } catch (e) { /* ignore */ }
        }
    }
    return window.__h3dCamCtl || null;
}
// In-memory fallback for when localStorage is blocked (private mode,
// sandboxed iframes, some test runners). writeGlobalSetting stages the
// value here unconditionally, so it always reflects the most recent
// in-session intent — readSetting prefers it over the global
// localStorage slot to avoid serving a stale persisted value when
// a write failed silently (quota exceeded, etc.). Per-panel
// localStorage overrides still win because they're an explicit
// per-instance opt-out and shouldn't be shadowed by a global edit.
export const settingsMemFallback = Object.create(null);
export function readSetting(panelKey, key) {
    let panelVal = null;
    let globalVal = null;
    try {
        // 'palette' + 'customColors' are GLOBAL-only: the per-panel palette
        // control was removed in favour of the global "Highway String Colors"
        // UI, so a panel must never be shadowed by a stale per-panel override
        // (h3d_bg_panel<idx>_palette / _customColors). Neither is a
        // SETTING_DEFAULTS key, so per-panel scoping never applied to them.
        if (key !== 'palette' && key !== 'customColors') {
            panelVal = localStorage.getItem('h3d_bg_' + panelKey + '_' + key);
        }
        globalVal = localStorage.getItem('h3d_bg_' + key);
    } catch (_) { /* storage blocked — both stay null */ }
    if (panelVal !== null && panelVal !== undefined) return coerceSetting(key, panelVal);
    // Prefer the in-memory staged value over the persisted global slot.
    // writeGlobalSetting always writes to settingsMemFallback first, so the
    // memory value is at least as fresh as the persisted one.
    if (key in settingsMemFallback) return coerceSetting(key, settingsMemFallback[key]);
    if (globalVal !== null && globalVal !== undefined) return coerceSetting(key, globalVal);
    return SETTING_DEFAULTS[key];
}
// Read a setting's GLOBAL value, ignoring any per-panel override. The
// player-chrome control is a single shared instance, so it must always
// read (and write) the global slot. Passing null as a panelKey to
// readSetting happened to work only because 'h3d_bg_null_<key>' never
// exists; this states the intent directly and can't be shadowed if a
// panelKey of null is ever used deliberately. Mirrors the global half of
// readSetting exactly (mem-fallback precedence, then persisted, then
// default).
export function readGlobalSetting(key) {
    let globalVal = null;
    try { globalVal = localStorage.getItem('h3d_bg_' + key); } catch (_) { /* storage blocked */ }
    if (key in settingsMemFallback) return coerceSetting(key, settingsMemFallback[key]);
    if (globalVal !== null && globalVal !== undefined) return coerceSetting(key, globalVal);
    return SETTING_DEFAULTS[key];
}
// Shared "stored string -> bool" coercion for every boolean
// setting. Mirrors settings.html's coerceBool so the renderer and
// the UI hydration always agree on what a corrupted/unknown value
// means (fall back to default rather than silently flipping to
// false). Add new boolean keys to SETTING_DEFAULTS and they pick this
// up via the dispatch below.
export const BOOL_SETTING_KEYS = new Set(['reactive', 'showFretOnNote', 'cameraLockLow', 'inlayLabelsVisible', 'sectionLabelsOnHighway', 'sectionHudVisible', 'nutHeadstockVisible', 'tuningLabelsVisible', 'projectionVisible', 'chordDiagramVisible', 'fpsVisible', 'toneHudVisible', 'fretDividersVisible', 'slideArrowApproachVisible', 'slideArrowNeckVisible', 'slideArrowChainPreviewVisible', 'sparks', 'cinematic', 'verdictMarks', 'timingFx', 'streakFx', 'bloom']);
export function coerceBoolSetting(val, fallback) {
    if (val === 'true' || val === '1') return true;
    if (val === 'false' || val === '0') return false;
    return fallback;
}
// Settings stored as 0..1 floats. cameraSmoothing controls X-pan
// hysteresis; zoomSmoothing the zoom dead zone; tiltSmoothing the
// vertical-tilt deadband + correction strength. All three slider-
// shaped settings share the same parse + clamp behaviour.
export const FLOAT_SETTING_KEYS = new Set(['intensity', 'cameraSmoothing', 'zoomSmoothing', 'tiltSmoothing', 'cameraLockZoom', 'textSize', 'vibrancy', 'glow', 'chordDiagramSize', 'sectionHudSize', 'toneHudSize', 'hitFx']);
export function coerceSetting(key, val) {
    if (FLOAT_SETTING_KEYS.has(key)) {
        const n = parseFloat(val);
        return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : SETTING_DEFAULTS[key];
    }
    if (BOOL_SETTING_KEYS.has(key)) return coerceBoolSetting(val, SETTING_DEFAULTS[key]);
    if (key === 'style') return BACKGROUND_STYLE_IDS.includes(val) ? val : SETTING_DEFAULTS.style;
    if (key === 'palette') return (PALETTE_IDS.includes(val) || val === 'custom') ? val : SETTING_DEFAULTS.palette;
    if (key === 'bgTheme') return SCENE_THEME_IDS.includes(val) ? val : SETTING_DEFAULTS.bgTheme;
    // Highway axis shares the same id-set as the background axis.
    if (key === 'hwTheme') return SCENE_THEME_IDS.includes(val) ? val : SETTING_DEFAULTS.hwTheme;
    if (key === 'chordDiagramPosition')
        return CHORD_DIAG_POSITION_IDS.includes(val) ? val : SETTING_DEFAULTS.chordDiagramPosition;
    if (key === 'sectionHudPosition')
        return ['tl', 'tr', 'bl', 'br'].includes(val) ? val : SETTING_DEFAULTS.sectionHudPosition;
    if (key === 'toneHudPosition')
        return ['tl', 'tr', 'bl', 'br'].includes(val) ? val : SETTING_DEFAULTS.toneHudPosition;
    if (key === 'cameraMode') {
        if (val === 'classic') val = 'steady';
        return CAMERA_MODE_IDS.includes(val) ? val : SETTING_DEFAULTS.cameraMode;
    }
    if (key === 'fretNumberGhostScope')
        return FRET_NUMBER_GHOST_SCOPE_IDS.includes(val) ? val : SETTING_DEFAULTS.fretNumberGhostScope;
    if (key === 'nutColor' || key === 'headstockColor') {
        if (typeof val !== 'string') return SETTING_DEFAULTS[key];
        const t = val.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(t)) return t.toLowerCase();
        return SETTING_DEFAULTS[key];
    }
    if (key === 'fretColumnMarkerCadence') {
        const n = parseInt(val, 10);
        if (!Number.isFinite(n)) return SETTING_DEFAULTS.fretColumnMarkerCadence;
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
export function hasStoredSetting(panelKey, key) {
    try {
        if (localStorage.getItem('h3d_bg_' + panelKey + '_' + key) != null) return true;
    } catch (_) {}
    if (key in settingsMemFallback) return true;
    try {
        if (localStorage.getItem('h3d_bg_' + key) != null) return true;
    } catch (_) {}
    return false;
}
export function writeGlobalSetting(key, val) {
    const s = String(val);
    // Stage in memory FIRST so readSetting's "memory beats global
    // localStorage" precedence has a true freshness guarantee even
    // if localStorage.setItem throws partway through. Without this
    // ordering, a quota exception thrown after the persisted slot
    // was already mutated would leave a stale value in localStorage
    // that's newer than settingsMemFallback.
    settingsMemFallback[key] = s;
    try { localStorage.setItem('h3d_bg_' + key, s); } catch (_) { /* storage blocked */ }
    emitSettingChange(key);
}

// Pub-sub so settings.html can update live across all panel instances.
export const settingsListeners = new Set();
export function subscribeToSettings(fn) { settingsListeners.add(fn); }
export function unsubscribeFromSettings(fn) { settingsListeners.delete(fn); }
export function emitSettingChange(key) {
    for (const fn of settingsListeners) {
        try { fn(key); } catch (e) { console.error('[3D-Hwy] bg listener threw', e); }
    }
}
