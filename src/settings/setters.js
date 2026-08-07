import { writeGlobalSetting } from './store.js';
import { SETTING_DEFAULTS, SCENE_THEME_IDS, FRET_NUMBER_GHOST_SCOPE_IDS } from './defaults.js';
import { MAX_RENDER_STRINGS } from '../core/constants.js';
import { _h3dHexToInt } from '../core/palette.js';

/**
 * The `h3dBgSet*` setter wall — the only way settings.html or the
 * player-chrome control mutates a background/highway setting. Every setter
 * funnels through {@link writeGlobalSetting}. Bound onto `window` by
 * `src/globals.js`; this file itself never touches `window`.
 *
 * `h3dVenueSet*`/`h3dVenueGet*` live in `background/venue.js` instead,
 * since they read/write that module's own state directly.
 */
export const h3dBgSetStyle = (v) => writeGlobalSetting('style', v);
export const h3dBgSetIntensity = (v) => writeGlobalSetting('intensity', v);
export const h3dBgSetReactive = (v) => writeGlobalSetting('reactive', !!v);
export const h3dBgSetPalette = (v) => writeGlobalSetting('palette', v);

/** Background axis (clear + fog); independent of the highway axis. */
export const h3dBgSetBgTheme = (v) => {
    const s = String(v);
    writeGlobalSetting('bgTheme', SCENE_THEME_IDS.includes(s) ? s : SETTING_DEFAULTS.bgTheme);
};
/** Highway axis (board + lane + laneDim); independent of the background axis. */
export const h3dBgSetHwTheme = (v) => {
    const s = String(v);
    writeGlobalSetting('hwTheme', SCENE_THEME_IDS.includes(s) ? s : SETTING_DEFAULTS.hwTheme);
};

/**
 * Sets a user-defined per-string color set and switches the active palette
 * to `'custom'`. Invalid/missing entries fall back to the default palette
 * per index. Pass `[]` then `h3dBgSetPalette('default')` to revert.
 * @param {Array<string|null|undefined>} hexArray - up to {@link MAX_RENDER_STRINGS} hex strings
 */
export const h3dBgSetStringColors = (hexArray) => {
    const arr = Array.isArray(hexArray) ? hexArray : [];
    const norm = [];
    for (let i = 0; i < MAX_RENDER_STRINGS; i++) {
        const n = _h3dHexToInt(arr[i]);
        norm[i] = (n != null) ? '#' + n.toString(16).padStart(6, '0') : null;
    }
    writeGlobalSetting('customColors', JSON.stringify(norm));
    writeGlobalSetting('palette', 'custom');
};

export const h3dBgSetShowFretOnNote = (v) => writeGlobalSetting('showFretOnNote', !!v);
/** @param {string} v - one of {@link FRET_NUMBER_GHOST_SCOPE_IDS} */
export const h3dBgSetFretNumberGhostScope = (v) => {
    const s = String(v);
    writeGlobalSetting('fretNumberGhostScope', FRET_NUMBER_GHOST_SCOPE_IDS.includes(s) ? s : SETTING_DEFAULTS.fretNumberGhostScope);
};
export const h3dBgSetCameraSmoothing = (v) => writeGlobalSetting('cameraSmoothing', v);
export const h3dBgSetZoomSmoothing = (v) => writeGlobalSetting('zoomSmoothing', v);
export const h3dBgSetTiltSmoothing = (v) => writeGlobalSetting('tiltSmoothing', v);
export const h3dBgSetCameraLockLow = (v) => writeGlobalSetting('cameraLockLow', !!v);
export const h3dBgSetCameraLockZoom = (v) => writeGlobalSetting('cameraLockZoom', v);
/** Legacy `'classic'` maps to `'steady'`. */
export const h3dBgSetCameraMode = (v) => {
    let s = String(v);
    if (s === 'classic') s = 'steady';
    writeGlobalSetting('cameraMode', s);
};
export const h3dBgSetNutHeadstockVisible = (v) => writeGlobalSetting('nutHeadstockVisible', !!v);
export const h3dBgSetTuningLabelsVisible = (v) => writeGlobalSetting('tuningLabelsVisible', !!v);
export const h3dBgSetNutColor = (v) => writeGlobalSetting('nutColor', v);
export const h3dBgSetHeadstockColor = (v) => writeGlobalSetting('headstockColor', v);
export const h3dBgSetTextSize = (v) => writeGlobalSetting('textSize', v);
export const h3dBgSetVibrancy = (v) => writeGlobalSetting('vibrancy', v);
export const h3dBgSetGlow = (v) => writeGlobalSetting('glow', v);
export const h3dBgSetHitFx = (v) => writeGlobalSetting('hitFx', v);
export const h3dBgSetSparks = (v) => writeGlobalSetting('sparks', !!v);
export const h3dBgSetCinematic = (v) => writeGlobalSetting('cinematic', !!v);
export const h3dBgSetVerdictMarks = (v) => writeGlobalSetting('verdictMarks', !!v);
export const h3dBgSetTimingFx = (v) => writeGlobalSetting('timingFx', !!v);
export const h3dBgSetStreakFx = (v) => writeGlobalSetting('streakFx', !!v);
export const h3dBgSetBloom = (v) => writeGlobalSetting('bloom', !!v);
export const h3dBgSetToneHudVisible = (v) => writeGlobalSetting('toneHudVisible', !!v);
export const h3dBgSetToneHudPosition = (v) => writeGlobalSetting('toneHudPosition', v);
export const h3dBgSetToneHudSize = (v) => writeGlobalSetting('toneHudSize', v);
export const h3dBgSetFpsVisible = (v) => writeGlobalSetting('fpsVisible', !!v);
export const h3dBgSetFretDividersVisible = (v) => writeGlobalSetting('fretDividersVisible', !!v);
export const h3dBgSetChordDiagramVisible = (v) => writeGlobalSetting('chordDiagramVisible', !!v);
export const h3dBgSetChordDiagramSize = (v) => writeGlobalSetting('chordDiagramSize', v);
export const h3dBgSetChordDiagramPosition = (v) => writeGlobalSetting('chordDiagramPosition', v);
export const h3dBgSetFretColumnMarkerCadence = (v) => writeGlobalSetting('fretColumnMarkerCadence', v);
export const h3dBgSetInlayLabelsVisible = (v) => writeGlobalSetting('inlayLabelsVisible', !!v);
export const h3dBgSetSectionLabelsOnHighway = (v) => writeGlobalSetting('sectionLabelsOnHighway', !!v);
export const h3dBgSetSectionHudVisible = (v) => writeGlobalSetting('sectionHudVisible', !!v);
export const h3dBgSetSectionHudPosition = (v) => writeGlobalSetting('sectionHudPosition', v);
export const h3dBgSetSectionHudSize = (v) => writeGlobalSetting('sectionHudSize', v);
export const h3dBgSetProjectionVisible = (v) => writeGlobalSetting('projectionVisible', !!v);
export const h3dBgSetSlideArrowApproachVisible = (v) => writeGlobalSetting('slideArrowApproachVisible', !!v);
export const h3dBgSetSlideArrowNeckVisible = (v) => writeGlobalSetting('slideArrowNeckVisible', !!v);
export const h3dBgSetSlideArrowChainPreviewVisible = (v) => writeGlobalSetting('slideArrowChainPreviewVisible', !!v);

/**
 * Sets the custom image asset for the `'image'` background style.
 * @param {{dataUrl?: string, name?: string}} [asset]
 */
export const h3dBgSetCustomImage = (asset) => {
    const a = asset || {};
    writeGlobalSetting('customImageDataUrl', a.dataUrl || '');
    writeGlobalSetting('customImageName', a.name || '');
};
export const h3dBgClearCustomImage = () => {
    writeGlobalSetting('customImageDataUrl', '');
    writeGlobalSetting('customImageName', '');
};

/**
 * Sets the custom video asset for the `'video'` background style. Bytes
 * live on disk under `{config_dir}/plugin_uploads/highway_3d/`, served by
 * `routes.py`; only the filename is stored here.
 * @param {{name?: string}} [asset]
 */
export const h3dBgSetCustomVideo = (asset) => {
    writeGlobalSetting('customVideoName', (asset && asset.name) || '');
};
export const h3dBgClearCustomVideo = () => writeGlobalSetting('customVideoName', '');

/** Alias for {@link h3dBgSetPalette}. */
export const h3dSetPalette = h3dBgSetPalette;
