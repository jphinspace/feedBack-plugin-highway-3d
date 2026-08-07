import {
    SETTING_DEFAULTS, BACKGROUND_STYLE_IDS, SCENE_THEME_IDS, CAMERA_MODE_IDS, FRET_NUMBER_GHOST_SCOPE_IDS,
} from './defaults.js';
import { PALETTE_IDS } from '../core/palette.js';
import { CHORD_DIAG_POSITION_IDS } from '../core/constants.js';

/**
 * Per-panel/global localStorage settings read/write, value coercion, and a
 * pub-sub bus ({@link subscribeToSettings}/{@link emitSettingChange}) that
 * keeps settings.html and every live renderer panel in sync.
 *
 * {@link settingsMemFallback} and {@link settingsListeners} are module
 * singletons: one in-memory shadow and one subscriber set shared by every
 * renderer instance, not per-instance state.
 */

/**
 * localStorage panel key for per-panel background settings.
 * @param {HTMLCanvasElement} canvas - this renderer's highway canvas
 * @returns {string} `'main'` or `'panel<index>'`
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
 * Resolves the Camera Director bridge for a canvas: this panel's per-panel
 * camera under splitscreen, else the single global. Mirrors the panel
 * resolution in {@link settingsPanelKey}.
 * @param {HTMLCanvasElement} canvas - this renderer's highway canvas
 * @returns {object|null} the resolved free-camera bridge, or `null` if Camera Director is absent
 */
export function freeCamFor(canvas) {
    const map = window.__h3dCamCtlPanels;
    if (map) {
        const ss = window.feedBackSplitscreen || window.slopsmithSplitscreen;
        if (ss && typeof ss.panelIndexFor === 'function') {
            try {
                const i = ss.panelIndexFor(canvas);
                if (Number.isInteger(i) && i >= 0 && map[i]) return map[i];
            } catch (e) { /* ignore */ }
        }
    }
    return window.__h3dCamCtl || null;
}

/**
 * In-memory fallback for when localStorage is blocked (private mode,
 * sandboxed iframes, some test runners). {@link writeGlobalSetting} stages
 * here first, so {@link readSetting} can prefer it over localStorage even
 * if a write fails partway through.
 */
export const settingsMemFallback = Object.create(null);

/** Reads a setting for `panelKey`: per-panel override, else in-memory, else global, else default. */
export function readSetting(panelKey, key) {
    let panelVal = null;
    let globalVal = null;
    try {
        // 'palette'/'customColors' are global-only (no per-panel palette UI).
        if (key !== 'palette' && key !== 'customColors') {
            panelVal = localStorage.getItem('h3d_bg_' + panelKey + '_' + key);
        }
        globalVal = localStorage.getItem('h3d_bg_' + key);
    } catch (_) { /* storage blocked — both stay null */ }
    if (panelVal !== null && panelVal !== undefined) return coerceSetting(key, panelVal);
    if (key in settingsMemFallback) return coerceSetting(key, settingsMemFallback[key]);
    if (globalVal !== null && globalVal !== undefined) return coerceSetting(key, globalVal);
    return SETTING_DEFAULTS[key];
}

/** Reads a setting's global value only, ignoring any per-panel override. */
export function readGlobalSetting(key) {
    let globalVal = null;
    try { globalVal = localStorage.getItem('h3d_bg_' + key); } catch (_) { /* storage blocked */ }
    if (key in settingsMemFallback) return coerceSetting(key, settingsMemFallback[key]);
    if (globalVal !== null && globalVal !== undefined) return coerceSetting(key, globalVal);
    return SETTING_DEFAULTS[key];
}

/** Boolean setting keys; an unrecognized stored value falls back to the default rather than `false`. */
export const BOOL_SETTING_KEYS = new Set(['reactive', 'showFretOnNote', 'cameraLockLow', 'inlayLabelsVisible', 'sectionLabelsOnHighway', 'sectionHudVisible', 'nutHeadstockVisible', 'tuningLabelsVisible', 'projectionVisible', 'chordDiagramVisible', 'fpsVisible', 'toneHudVisible', 'fretDividersVisible', 'slideArrowApproachVisible', 'slideArrowNeckVisible', 'slideArrowChainPreviewVisible', 'sparks', 'cinematic', 'verdictMarks', 'timingFx', 'streakFx', 'bloom']);

/** Coerces a stored string to a bool, falling back to `fallback` for anything else. */
export function coerceBoolSetting(val, fallback) {
    if (val === 'true' || val === '1') return true;
    if (val === 'false' || val === '0') return false;
    return fallback;
}

/** Setting keys stored as 0..1 floats. */
export const FLOAT_SETTING_KEYS = new Set(['intensity', 'cameraSmoothing', 'zoomSmoothing', 'tiltSmoothing', 'cameraLockZoom', 'textSize', 'vibrancy', 'glow', 'chordDiagramSize', 'sectionHudSize', 'toneHudSize', 'hitFx']);

/** Coerces a stored raw string to a setting's proper type, validating ids where applicable. */
export function coerceSetting(key, val) {
    if (FLOAT_SETTING_KEYS.has(key)) {
        const n = parseFloat(val);
        return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : SETTING_DEFAULTS[key];
    }
    if (BOOL_SETTING_KEYS.has(key)) return coerceBoolSetting(val, SETTING_DEFAULTS[key]);
    if (key === 'style') return BACKGROUND_STYLE_IDS.includes(val) ? val : SETTING_DEFAULTS.style;
    if (key === 'palette') return (PALETTE_IDS.includes(val) || val === 'custom') ? val : SETTING_DEFAULTS.palette;
    if (key === 'bgTheme') return SCENE_THEME_IDS.includes(val) ? val : SETTING_DEFAULTS.bgTheme;
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

/**
 * Whether the user has ever explicitly written `key` (per-panel, in-memory,
 * or global). `false` means "unset" — used by settings that inherit another
 * setting's value the first time they're read.
 */
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

/** Writes a global setting: stages to {@link settingsMemFallback}, persists, then emits the change. */
export function writeGlobalSetting(key, val) {
    const s = String(val);
    settingsMemFallback[key] = s;
    try { localStorage.setItem('h3d_bg_' + key, s); } catch (_) { /* storage blocked */ }
    emitSettingChange(key);
}

/** Subscribers notified by {@link emitSettingChange}. */
export const settingsListeners = new Set();
export function subscribeToSettings(fn) { settingsListeners.add(fn); }
export function unsubscribeFromSettings(fn) { settingsListeners.delete(fn); }
export function emitSettingChange(key) {
    for (const fn of settingsListeners) {
        try { fn(key); } catch (e) { console.error('[3D-Hwy] bg listener threw', e); }
    }
}
