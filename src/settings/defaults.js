// Settings identifier lists and default values: the enum-shaped id sets
// settings/store.js's _bgCoerce validates against, plus BG_DEFAULTS (the
// per-instance settings mirror's shape and fallback values) and BG_THEMES
// (the two-axis background/highway color theme table).
//
// The 'venue' background style deliberately does NOT appear in
// BG_STYLE_IDS: it's an internal effective style reached only through the
// viz-picker Venue flow (see bg/venue.js), never a user-selectable
// h3d_bg_style value. Don't derive BG_STYLE_IDS from Object.keys(BG_STYLES)
// once that registry exists (Stage 6) -- the asymmetry is load-bearing.

/** User-selectable via `cameraMode`. Legacy `classic` in storage maps to `steady`. */
export const CAMERA_MODE_IDS = ['steady', 'lookahead'];

export const BG_DEFAULTS = { style: 'particles', intensity: 0.5, reactive: true, palette: 'default', bgTheme: 'default', hwTheme: 'default', showFretOnNote: true, fretNumberGhostScope: 'chords', cameraSmoothing: 0.5, zoomSmoothing: 0.5, tiltSmoothing: 0.5, cameraLockLow: false, cameraLockZoom: 0.5, cameraMode: 'lookahead', nutHeadstockVisible: true, tuningLabelsVisible: true, nutColor: '#f5f3f0', headstockColor: '#d4b48a', textSize: 0.5, vibrancy: 0.85, glow: 0.25, customImageDataUrl: '', customImageName: '', customVideoName: '', chordDiagramVisible: true, chordDiagramSize: 0.5, chordDiagramPosition: 'tl', fretColumnMarkerCadence: 1, projectionVisible: true, inlayLabelsVisible: false, sectionLabelsOnHighway: false, sectionHudVisible: false, sectionHudPosition: 'tr', sectionHudSize: 0.5, toneHudVisible: false, toneHudPosition: 'tl', toneHudSize: 0.5, fpsVisible: false, fretDividersVisible: true, slideArrowApproachVisible: true, slideArrowNeckVisible: true, slideArrowChainPreviewVisible: true, hitFx: 0.7, sparks: true, cinematic: true, verdictMarks: true, timingFx: true, streakFx: true, bloom: true };
// User-selectable, persistable bg styles — must mirror settings.html's
// VALID_STYLES. 'venue' is deliberately NOT here: it is an internal effective
// style reached only via _venueSceneOverride (the viz-picker Venue flow), so
// _bgCoerce must reject a stored h3d_bg_style='venue' — otherwise venue could
// mount outside that flow and settings.html (which can't represent 'venue')
// would be unable to switch back. BG_STYLES still has a 'venue' renderer entry.
export const BG_STYLE_IDS = ['off', 'particles', 'silhouettes', 'lights', 'geometric', 'butterchurn', 'image', 'video'];
// Scene color themes — TWO INDEPENDENT AXES sharing one palette family.
// The combined `BG_THEMES` table below is the single source of truth; each
// entry carries the colors for BOTH axes, but the two axes are selected and
// applied SEPARATELY (two dropdowns, two settings keys):
//   • BACKGROUND axis (setting key `bgTheme`) owns:
//       clear — WebGL clear color (the empty background behind everything)
//       fog   — distance fog tint (kept === clear so the horizon dissolves
//               cleanly instead of showing a seam)
//   • HIGHWAY axis (setting key `hwTheme`) owns:
//       board   — the fretboard / highway-surface plane color
//       lane    — the lit highway lane strip under the gems (optional)
//       laneDim — the lane's dimmer alternating row (optional)
// Because both axes read from the SAME id-set (the keys of this table), ANY
// background id can mix with ANY highway id (e.g. Deep Focus background +
// Cathode Green highway); picking the SAME id in both gives the original
// "matched" combined look. _bgBackgroundColors()/_bgHighwayColors() below
// are the per-axis accessors; both fall back to 'default' for unknown ids.
// 'default' reproduces the original look byte-for-byte on BOTH axes, so
// existing users (and anyone who never touches either setting) see no
// change. A migration in _bgLoadSettings() makes an existing single-`bgTheme`
// pick drive BOTH axes until the user diverges them, so upgrades are
// visually identical too. All themes keep the board very dark and the
// background dark so the bright per-string note gems, lane, and labels
// retain contrast. NOTE: settings.html mirrors these ids in its
// VALID_BG_THEMES set (shared by both dropdowns) — keep them in sync.
// Optional `lane` / `laneDim` fields retint the lit highway lane strip + its
// dimmer alternating row. A theme that omits them falls back to the stock
// blue lane (HWY_LANE_STRIPE_ODD_HEX / _EVEN_HEX); only 'default' relies on
// that fallback (so its output stays byte-identical). Every other theme sets
// its own lane so the Highway axis is visibly distinct entry-to-entry — the
// near-black neutral boards alone aren't separable, so the lane carries it.
// See _applyBgTheme().
export const BG_THEMES = {
    default:    { clear: 0x101820, fog: 0x101820, board: 0x08080e },
    // Cool navy surface + a brighter pure-blue lane, so it reads distinct
    // from 'default' (neutral board + stock teal-blue lane) on the Highway axis.
    midnight:   { clear: 0x0a0e1a, fog: 0x0a0e1a, board: 0x080d1c, lane: 0x244fae, laneDim: 0x122a5e },
    // Lighter NEUTRAL-grey surface + a steel-grey lane — the only mid-dark
    // neutral board, so the surface itself is visibly different from the
    // near-black neutrals around it (board kept dark enough for gem contrast).
    charcoal:   { clear: 0x16181c, fog: 0x16181c, board: 0x141417, lane: 0x525a66, laneDim: 0x282d34 },
    deeppurple: { clear: 0x140a1e, fog: 0x140a1e, board: 0x0b0610, lane: 0x3a1f6e, laneDim: 0x1f1040 },
    forest:     { clear: 0x0a1614, fog: 0x0a1614, board: 0x06100c, lane: 0x15602a, laneDim: 0x0a3318 },
    // Warm dark neutral (espresso/umber) — the first non-cool scene.
    warmslate:  { clear: 0x1c130b, fog: 0x1c130b, board: 0x0e0805, lane: 0x5e3a12, laneDim: 0x341f0a },
    // Recessive near-black neutral (a hair above #000000, ~zero chroma) —
    // maximizes gem-vs-board contrast; a clean stage/stream look. Purest-dark
    // board + a clean steel-cyan lane (brighter/cooler than 'default's muted
    // teal-blue) so the Highway axis reads clearly distinct from default.
    deepfocus:  { clear: 0x0c0c0d, fog: 0x0c0c0d, board: 0x060606, lane: 0x2f7fa0, laneDim: 0x163c4e },
    // Calm dark teal — blue-dominant so it reads distinct from the navy
    // 'midnight' and the green 'forest'.
    deepsea:    { clear: 0x06222b, fog: 0x06222b, board: 0x03141a, lane: 0x0e5a63, laneDim: 0x063338 },
    // Retro CRT glow — a warm AMBER phosphor cast (the classic amber
    // terminal). Amber rather than green so a phosphor board can't crush
    // green/teal gems, and so it stays clearly distinct from 'forest' and
    // 'deepsea'. Board stays very dark / low-chroma to keep gems popping.
    cathode:    { clear: 0x140b03, fog: 0x140b03, board: 0x0c0702, lane: 0x6e4a0e, laneDim: 0x3a2806 },
    // Retro CRT GREEN phosphor — leaned more saturated / cyan-green than
    // 'forest' so it reads as a terminal, not woodland (dRGB 35 vs forest,
    // 32 vs deepsea). Phosphor-green board + green lane. Verified to keep
    // green/teal gems legible (green-on-green floor CR ~2.2).
    cathodegreen: { clear: 0x07301a, fog: 0x07301a, board: 0x031a0c, lane: 0x0e6e2a, laneDim: 0x073a18 },
    // Warm hearth — the first warm-RED scene, pairs with the Ember/Sunrise
    // strings. Deep red, pushed away from the amber 'cathode'/'warmslate'
    // (dRGB ~26 from cathode). Ember-red lane.
    hearth:     { clear: 0x280806, fog: 0x280806, board: 0x1a0606, lane: 0x7a2410, laneDim: 0x3f1409 },
};
export const BG_THEME_IDS = Object.keys(BG_THEMES);
// Shared lookup for the combined entry (both axes are keyed by the same id
// set, so a single id list / coerce check validates either axis).
export function _bgThemeColors(id) { return BG_THEMES[id] || BG_THEMES.default; }
// Per-axis accessors. Background reads clear/fog; highway reads
// board/lane/laneDim. They alias the same table — splitting at read-time
// keeps one source of truth while letting the two dropdowns pick freely.
export function _bgBackgroundColors(id) { return _bgThemeColors(id); }
export function _bgHighwayColors(id) { return _bgThemeColors(id); }

export const FRET_NUMBER_GHOST_SCOPE_IDS = ['chords', 'all'];
