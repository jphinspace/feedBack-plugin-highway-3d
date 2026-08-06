import { _bgWriteGlobal } from './store.js';
import { BG_DEFAULTS, BG_THEME_IDS, FRET_NUMBER_GHOST_SCOPE_IDS } from './defaults.js';
import { MAX_RENDER_STRINGS } from '../core/constants.js';
import { _h3dHexToInt } from '../core/palette.js';

// The h3dBgSet* setter wall. These are the ONLY way any code (settings.html,
// the player-chrome control) mutates a background/highway setting -- every
// setter funnels through _bgWriteGlobal, which stages the value, persists
// it, and fires the change pub-sub. Named exports here, bound onto
// `window` by src/globals.js -- this file itself never touches `window`,
// so globals.js stays the one auditable place the external surface is
// assembled.
//
// The h3dVenueSet*/h3dVenueGet* family and the venue-specific bg/hwTheme-
// adjacent state live in bg/venue.js instead of here (not yet extracted --
// see the split plan) because they read/write venue.js's own mutable
// state directly, which only the declaring module can do.

// Settings.html setters — global keys; per-panel overrides via direct
// localStorage edits today, runtime UI in a follow-up.
export const h3dBgSetStyle = (v) => _bgWriteGlobal('style', v);
export const h3dBgSetIntensity = (v) => _bgWriteGlobal('intensity', v);
export const h3dBgSetReactive = (v) => _bgWriteGlobal('reactive', !!v);
export const h3dBgSetPalette = (v) => _bgWriteGlobal('palette', v);
// BACKGROUND scene-color axis (clear + fog only). Validated against
// BG_THEME_IDS in _bgCoerce; the listener re-applies clear/fog live and
// independently of the highway axis.
export const h3dBgSetBgTheme = (v) => {
    const s = String(v);
    _bgWriteGlobal('bgTheme', BG_THEME_IDS.includes(s) ? s : BG_DEFAULTS.bgTheme);
};
// HIGHWAY scene-color axis (board + lane + laneDim). Same id-set as the
// background axis, so any highway can mix with any background. The listener
// re-applies the board plane + lane live and independently.
export const h3dBgSetHwTheme = (v) => {
    const s = String(v);
    _bgWriteGlobal('hwTheme', BG_THEME_IDS.includes(s) ? s : BG_DEFAULTS.hwTheme);
};
// Apply a user-defined per-string color set (core theming UI). `hexArray`
// is up to 8 hex strings; invalid/missing entries fall back to the default
// palette per index. Writes the colors, then flips the palette to 'custom'
// — the palette listener retints all materials + rebuilds the board live.
// Pass null/[] then h3dBgSetPalette('default') to revert.
export const h3dBgSetStringColors = (hexArray) => {
    const arr = Array.isArray(hexArray) ? hexArray : [];
    const norm = [];
    for (let i = 0; i < MAX_RENDER_STRINGS; i++) {
        const n = _h3dHexToInt(arr[i]);
        norm[i] = (n != null) ? '#' + n.toString(16).padStart(6, '0') : null;
    }
    _bgWriteGlobal('customColors', JSON.stringify(norm));
    _bgWriteGlobal('palette', 'custom');
};
export const h3dBgSetShowFretOnNote = (v) => _bgWriteGlobal('showFretOnNote', !!v);
export const h3dBgSetFretNumberGhostScope = (v) => {
    const s = String(v);
    _bgWriteGlobal('fretNumberGhostScope', FRET_NUMBER_GHOST_SCOPE_IDS.includes(s) ? s : BG_DEFAULTS.fretNumberGhostScope);
};
export const h3dBgSetCameraSmoothing = (v) => _bgWriteGlobal('cameraSmoothing', v);
export const h3dBgSetZoomSmoothing = (v) => _bgWriteGlobal('zoomSmoothing', v);
export const h3dBgSetTiltSmoothing = (v) => _bgWriteGlobal('tiltSmoothing', v);
export const h3dBgSetCameraLockLow = (v) => _bgWriteGlobal('cameraLockLow', !!v);
export const h3dBgSetCameraLockZoom = (v) => _bgWriteGlobal('cameraLockZoom', v);
export const h3dBgSetCameraMode = (v) => {
    let s = String(v);
    if (s === 'classic') s = 'steady';
    _bgWriteGlobal('cameraMode', s);
};
export const h3dBgSetNutHeadstockVisible = (v) => _bgWriteGlobal('nutHeadstockVisible', !!v);
export const h3dBgSetTuningLabelsVisible = (v) => _bgWriteGlobal('tuningLabelsVisible', !!v);
export const h3dBgSetNutColor = (v) => _bgWriteGlobal('nutColor', v);
export const h3dBgSetHeadstockColor = (v) => _bgWriteGlobal('headstockColor', v);
export const h3dBgSetTextSize = (v) => _bgWriteGlobal('textSize', v);
export const h3dBgSetVibrancy = (v) => _bgWriteGlobal('vibrancy', v);
export const h3dBgSetGlow = (v) => _bgWriteGlobal('glow', v);
export const h3dBgSetHitFx = (v) => _bgWriteGlobal('hitFx', v);
export const h3dBgSetSparks = (v) => _bgWriteGlobal('sparks', !!v);
export const h3dBgSetCinematic = (v) => _bgWriteGlobal('cinematic', !!v);
export const h3dBgSetVerdictMarks = (v) => _bgWriteGlobal('verdictMarks', !!v);
export const h3dBgSetTimingFx = (v) => _bgWriteGlobal('timingFx', !!v);
export const h3dBgSetStreakFx = (v) => _bgWriteGlobal('streakFx', !!v);
export const h3dBgSetBloom = (v) => _bgWriteGlobal('bloom', !!v);
export const h3dBgSetToneHudVisible = (v) => _bgWriteGlobal('toneHudVisible', !!v);
export const h3dBgSetToneHudPosition = (v) => _bgWriteGlobal('toneHudPosition', v);
export const h3dBgSetToneHudSize = (v) => _bgWriteGlobal('toneHudSize', v);
export const h3dBgSetFpsVisible = (v) => _bgWriteGlobal('fpsVisible', !!v);
export const h3dBgSetFretDividersVisible = (v) => _bgWriteGlobal('fretDividersVisible', !!v);
export const h3dBgSetChordDiagramVisible = (v) => _bgWriteGlobal('chordDiagramVisible', !!v);
export const h3dBgSetChordDiagramSize = (v) => _bgWriteGlobal('chordDiagramSize', v);
export const h3dBgSetChordDiagramPosition = (v) => _bgWriteGlobal('chordDiagramPosition', v);
export const h3dBgSetFretColumnMarkerCadence = (v) => _bgWriteGlobal('fretColumnMarkerCadence', v);
export const h3dBgSetInlayLabelsVisible = (v) => _bgWriteGlobal('inlayLabelsVisible', !!v);
export const h3dBgSetSectionLabelsOnHighway = (v) => _bgWriteGlobal('sectionLabelsOnHighway', !!v);
export const h3dBgSetSectionHudVisible = (v) => _bgWriteGlobal('sectionHudVisible', !!v);
export const h3dBgSetSectionHudPosition = (v) => _bgWriteGlobal('sectionHudPosition', v);
export const h3dBgSetSectionHudSize = (v) => _bgWriteGlobal('sectionHudSize', v);
export const h3dBgSetProjectionVisible = (v) => _bgWriteGlobal('projectionVisible', !!v);
export const h3dBgSetSlideArrowApproachVisible = (v) => _bgWriteGlobal('slideArrowApproachVisible', !!v);
export const h3dBgSetSlideArrowNeckVisible = (v) => _bgWriteGlobal('slideArrowNeckVisible', !!v);
export const h3dBgSetSlideArrowChainPreviewVisible = (v) => _bgWriteGlobal('slideArrowChainPreviewVisible', !!v);
// Custom image asset for the 'image' bg style (#19). Composite setter:
// writes both the data URL (the bytes that drive the texture) and the
// display filename, each emitting a change event. The listener
// rebuilds on customImageDataUrl change when the image style is
// active; customImageName is display-only and skips rebuild.
export const h3dBgSetCustomImage = (asset) => {
    const a = asset || {};
    _bgWriteGlobal('customImageDataUrl', a.dataUrl || '');
    _bgWriteGlobal('customImageName', a.name || '');
};
export const h3dBgClearCustomImage = () => {
    _bgWriteGlobal('customImageDataUrl', '');
    _bgWriteGlobal('customImageName', '');
};
// Custom video asset for the 'video' bg style (#19 follow-up).
// Bytes live on disk under {config_dir}/plugin_uploads/highway_3d/
// and are served by routes.py — localStorage only stores the
// filename, which the renderer maps to the served URL. Single
// global slot; the file picker in settings.html POSTs to the
// upload route and then calls this setter with the response name.
export const h3dBgSetCustomVideo = (asset) => {
    _bgWriteGlobal('customVideoName', (asset && asset.name) || '');
};
export const h3dBgClearCustomVideo = () => _bgWriteGlobal('customVideoName', '');
// Back-compat alias for any caller that picked up the original
// (inconsistent) name during this PR's review window.
export const h3dSetPalette = h3dBgSetPalette;
