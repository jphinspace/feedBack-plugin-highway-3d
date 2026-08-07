/** User-selectable via `cameraMode`. Legacy `classic` in storage maps to `steady`. */
export const CAMERA_MODE_IDS = ['steady', 'lookahead'];

/** Per-instance settings mirror shape and fallback values. */
export const SETTING_DEFAULTS = { style: 'particles', intensity: 0.5, reactive: true, palette: 'default', bgTheme: 'default', hwTheme: 'default', showFretOnNote: true, fretNumberGhostScope: 'chords', cameraSmoothing: 0.5, zoomSmoothing: 0.5, tiltSmoothing: 0.5, cameraLockLow: false, cameraLockZoom: 0.5, cameraMode: 'lookahead', nutHeadstockVisible: true, tuningLabelsVisible: true, nutColor: '#f5f3f0', headstockColor: '#d4b48a', textSize: 0.5, vibrancy: 0.85, glow: 0.25, customImageDataUrl: '', customImageName: '', customVideoName: '', chordDiagramVisible: true, chordDiagramSize: 0.5, chordDiagramPosition: 'tl', fretColumnMarkerCadence: 1, projectionVisible: true, inlayLabelsVisible: false, sectionLabelsOnHighway: false, sectionHudVisible: false, sectionHudPosition: 'tr', sectionHudSize: 0.5, toneHudVisible: false, toneHudPosition: 'tl', toneHudSize: 0.5, fpsVisible: false, fretDividersVisible: true, slideArrowApproachVisible: true, slideArrowNeckVisible: true, slideArrowChainPreviewVisible: true, hitFx: 0.7, sparks: true, cinematic: true, verdictMarks: true, timingFx: true, streakFx: true, bloom: true };

/**
 * `loadSettings()` key -> `ctx.settings` field map for settings that are a
 * direct, unconditional copy with no follow-on logic. Excludes `palette`
 * (custom-palette resolution), `hwTheme` (backfill from `bgTheme`),
 * `zoomSmoothing`/`tiltSmoothing` (inherit `cameraSmoothing` until first
 * explicit write), and the three `custom*` asset keys (global-only,
 * read via localStorage directly) — those stay hand-written in
 * `loadSettings()`.
 */
export const LOAD_SETTINGS_SIMPLE_KEY_TO_FIELD = {
    style: 'bgStyleId',
    intensity: 'bgIntensity',
    reactive: 'bgReactive',
    bgTheme: 'bgThemeId',
    showFretOnNote: 'showFretOnNote',
    fretNumberGhostScope: 'fretNumberGhostScope',
    cameraSmoothing: 'cameraSmoothing',
    cameraLockLow: 'cameraLockLow',
    cameraLockZoom: 'cameraLockZoom',
    cameraMode: 'cameraMode',
    nutHeadstockVisible: 'nutHeadstockVisible',
    tuningLabelsVisible: 'tuningLabelsVisible',
    nutColor: 'nutColor',
    headstockColor: 'headstockColor',
    textSize: 'textSize',
    vibrancy: 'vibrancy',
    glow: 'glowMul',
    chordDiagramVisible: 'chordDiagramVisible',
    chordDiagramSize: 'chordDiagramSize',
    chordDiagramPosition: 'chordDiagramPosition',
    fretColumnMarkerCadence: 'fretColumnMarkerCadence',
    projectionVisible: 'projectionVisible',
    inlayLabelsVisible: 'inlayLabelsVisible',
    sectionLabelsOnHighway: 'sectionLabelsOnHighway',
    sectionHudVisible: 'sectionHudVisible',
    sectionHudPosition: 'sectionHudPosition',
    sectionHudSize: 'sectionHudSize',
    toneHudVisible: 'toneHudVisible',
    toneHudPosition: 'toneHudPosition',
    toneHudSize: 'toneHudSize',
    fpsVisible: 'fpsVisible',
    fretDividersVisible: 'fretDividersVisible',
    slideArrowApproachVisible: 'slideArrowApproachVisible',
    slideArrowNeckVisible: 'slideArrowNeckVisible',
    slideArrowChainPreviewVisible: 'slideArrowChainPreviewVisible',
    hitFx: '_hitFx',
    sparks: '_sparks',
    cinematic: '_cinematic',
    verdictMarks: '_verdictMarks',
    timingFx: '_timingFx',
    streakFx: '_streakFx',
    bloom: '_bloom',
};

/**
 * User-selectable, persistable background styles; must mirror settings.html's
 * `VALID_STYLES`. `'venue'` is intentionally excluded — it's an internal
 * effective style reached only via the Venue viz-picker flow, never a
 * directly settable value, though `BACKGROUND_STYLES` still has a renderer
 * entry for it.
 */
export const BACKGROUND_STYLE_IDS = ['off', 'particles', 'silhouettes', 'lights', 'geometric', 'butterchurn', 'image', 'video'];

/**
 * Two-axis scene color themes, keyed by one shared id set. The Background
 * axis (setting `bgTheme`) reads `clear`/`fog`; the Highway axis (setting
 * `hwTheme`) reads `board`/`lane`/`laneDim`. Any background id can pair with
 * any highway id. `lane`/`laneDim` are optional; a theme that omits them
 * falls back to the stock highway lane color. Keep in sync with
 * settings.html's `VALID_BG_THEMES`.
 */
export const SCENE_THEMES = {
    default:      { clear: 0x101820, fog: 0x101820, board: 0x08080e },
    midnight:     { clear: 0x0a0e1a, fog: 0x0a0e1a, board: 0x080d1c, lane: 0x244fae, laneDim: 0x122a5e },
    charcoal:     { clear: 0x16181c, fog: 0x16181c, board: 0x141417, lane: 0x525a66, laneDim: 0x282d34 },
    deeppurple:   { clear: 0x140a1e, fog: 0x140a1e, board: 0x0b0610, lane: 0x3a1f6e, laneDim: 0x1f1040 },
    forest:       { clear: 0x0a1614, fog: 0x0a1614, board: 0x06100c, lane: 0x15602a, laneDim: 0x0a3318 },
    warmslate:    { clear: 0x1c130b, fog: 0x1c130b, board: 0x0e0805, lane: 0x5e3a12, laneDim: 0x341f0a },
    deepfocus:    { clear: 0x0c0c0d, fog: 0x0c0c0d, board: 0x060606, lane: 0x2f7fa0, laneDim: 0x163c4e },
    deepsea:      { clear: 0x06222b, fog: 0x06222b, board: 0x03141a, lane: 0x0e5a63, laneDim: 0x063338 },
    cathode:      { clear: 0x140b03, fog: 0x140b03, board: 0x0c0702, lane: 0x6e4a0e, laneDim: 0x3a2806 },
    cathodegreen: { clear: 0x07301a, fog: 0x07301a, board: 0x031a0c, lane: 0x0e6e2a, laneDim: 0x073a18 },
    hearth:       { clear: 0x280806, fog: 0x280806, board: 0x1a0606, lane: 0x7a2410, laneDim: 0x3f1409 },
};

/** IDs of {@link SCENE_THEMES}. */
export const SCENE_THEME_IDS = Object.keys(SCENE_THEMES);

/** Looks up a scene theme, falling back to `'default'` for an unknown id. */
export function sceneThemeColors(id) { return SCENE_THEMES[id] || SCENE_THEMES.default; }

/** Background-axis colors (`clear`/`fog`) for a scene theme id. */
export function backgroundAxisColors(id) { return sceneThemeColors(id); }
/** Highway-axis colors (`board`/`lane`/`laneDim`) for a scene theme id. */
export function highwayAxisColors(id) { return sceneThemeColors(id); }

export const FRET_NUMBER_GHOST_SCOPE_IDS = ['chords', 'all'];
