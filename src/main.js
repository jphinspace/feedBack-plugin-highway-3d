// 3D Highway visualization plugin — Three.js note highway.
// Visual layer from joel's prototype (vibrant palette, glowing strings,
// fret heat, dynamic lane, chord frame-boxes, per-note connector labels,
// board projection, outline+core note meshes) adapted into the
// feedBackViz setRenderer contract (feedBack#36) so it works in the
// main player and per-panel in splitscreen without any architectural
// changes.

import { T, loadThree } from './core/three.js';
import {
    ACCENT_HALO_OP_FAR, ACCENT_HALO_OP_MID, ACCENT_HALO_OP_NEAR, ACCENT_HALO_XY_INNER,
    ACCENT_HALO_XY_MID, ACCENT_HALO_XY_OUTER, ACCENT_HALO_Z_INNER, ACCENT_HALO_Z_MID,
    ACCENT_HALO_Z_OUTER, ACCENT_NOTE_FILL_BOOST, ACCENT_NOTE_LINGER_EPS, ACCENT_NOTE_STR_GLOW,
    ACCENT_RIM_BASE_EMISSIVE, ACCENT_RIM_XY_SCALE_MUL, ACCENT_RIM_Z_SCALE_MUL, AHEAD,
    ARPEGGIO_BOX_BLUE_DARK_HEX, ARPEGGIO_BOX_BLUE_HEX, ARPEGGIO_RIM_BLUE_HEX,
    ARP_FRAME_ONSET_CLUSTER_S, ARP_FRAME_ONSET_PAD_S, ARP_HWY_RAIL_END_TAIL_S,
    ARP_HWY_RAIL_START_LEAD_S, ARP_INFER_MIN_HAND_SHAPE_SPAN_S,
    ARP_INFER_MIN_HITS_VS_SHAPE_CAP, ARP_INFER_MULTI_STRUM_HIT_SLACK,
    ARP_INFER_MULTI_STRUM_WIN_MIN_S, ARP_INFER_STRUM_VS_ARP_SPREAD_MIN_S, BASE_VFOV, BEHIND,
    BEND_ENV_RELEASE_FRAC, BEND_ENV_RISE_FRAC, BEND_HALFSTEP_WORLD_Y, CAM_DIST_BASE,
    CAM_DIST_HYST_C, CAM_DIST_HYST_T, CAM_FOCUS_BLEND_RATE, CAM_FRAME_DIST_FAR,
    CAM_FRAME_DIST_NEAR, CAM_FRAME_D_FAR, CAM_FRAME_D_NEAR, CAM_FRAME_H_FAR, CAM_FRAME_H_NEAR,
    CAM_FRET_EDGE_BLEND, CAM_H_BASE, CAM_LERP_BASE, CAM_LOCK_CENTER_FRET, CAM_LOCK_ZOOM_MAX,
    CAM_LOCK_ZOOM_MIN, CAM_LOOKAHEAD_MEASURES, CAM_LOOKAHEAD_SEC, CAM_TGT_AHEAD_C,
    CAM_TGT_AHEAD_T, CAM_TGT_BEHIND, CAM_TGT_HYST_C, CAM_TGT_HYST_T, CAM_TGT_TAU_C,
    CAM_TGT_TAU_T, CAM_TILT_BAND_C, CAM_TILT_BAND_T, CAM_TILT_STR_C, CAM_TILT_STR_T,
    CHORD_BOX_EDGE_ALPHA, CHORD_BOX_FILL_GRAD_ALPHA, CHORD_BOX_HIT_BRIGHT_HEX,
    CHORD_BOX_MISS_DARK_HEX, CHORD_BOX_TEAL_DARK_HEX, CHORD_BOX_TEAL_HEX,
    CHORD_DIAG_POSITION_IDS, CHORD_FRAME_RIM_FRAC_H, CHORD_FRAME_RIM_MIN,
    CHORD_FRAME_RIM_Z_MIN, CHORD_FRAME_RIM_Z_SCAL, CHORD_HWY_FADE_S, CHORD_HWY_LINGER_S,
    DEFAULT_LOOKAHEAD_FRET_SPAN, DIAG_CELL_MAX, DIAG_CROSSFADE_S, DIAG_ENTRANCE_S,
    DIAG_LINGER_S, DIAG_SIZE_MAX, DIAG_SIZE_MIN, FOCUS_D, FOG_END, FOG_START,
    FRET_COOLDOWN, FRET_LABEL_GOLD_HEX, FRET_LABEL_IDLE_HEX,
    FRET_ROW_FIT_BOOST_MAX, FRET_ROW_FIT_DEADBAND,
    FRET_ROW_FIT_NDC_MIN, FRET_SCALE, FRET_SPACING_ANCHOR_F, FRET_SPACING_STRETCH_ABOVE12,
    FRET_WIRE_ACTIVE_HEX,
    FRET_WIRE_ACTIVE_OP, FRET_WIRE_HIT_DECAY, FRET_WIRE_HIT_EMISSIVE, FRET_WIRE_HIT_HEX,
    FRET_WIRE_HIT_INTENSITY, FRET_WIRE_HIT_OP,
    GHOST_FRET_LBL_FADE_S, GHOST_HOLD_AFTER_ONSET, GHOST_UPCOMING_WIN, HORPLUS_MIN_VFOV,
    HORPLUS_START_ASPECT, HIGHWAY_LANE_STRIPE_EVEN_HEX, HIGHWAY_LANE_STRIPE_ODD_HEX,
    HIGHWAY_LANE_STRIPE_OP_BASE, HIGHWAY_LANE_STRIPE_OP_INT, HIGHWAY_LANE_TIME_SLICES, INLAY_LABEL_FRETS,
    K, LOOKAHEAD_LOCK_ENGAGE_MAXF, LOOKAHEAD_LOCK_RELEASE_MAXF, MAX_RENDER_STRINGS, ND,
    NEXT_ON_STRING_T_EPS, NFRETS, NH, NOTEDETECT_GEM_VERDICT_WINDOW, NSTR, NW, PROJ_GROW_MIN,
    REF_ASPECT, SCALE, SINGLE_SUS_OFFSETS, STR_THICK, S_BASE, S_GAP, TREMOLO_BUMP_S, TS,
    VENUE_BACKDROP_DISTANCE_MUL, VENUE_GEM_EMISSIVE_MUL, VENUE_HAZE_STEADY,
    VENUE_LANE_OP_BOOST, VIBRATO_HALF_WAVE_S, NOTEDETECT_UNMATCHED_LATCH_AFTER
} from './core/constants.js';
import {
    DEFAULT_GEM_GRADIENTS, PALETTES, PALETTE_IDS, S_COL, _customPalette, _darkenInt,
    _h3dHexToInt, _lightenInt
} from './core/palette.js';
import {
    RENDER_ORDER_LAYER_STACK, hwyPostHitTailFadeMul, renderOrderForLayerAtZ
} from './core/render-order.js';
import { _makeGaussTex } from './core/texture.js';
import {
    FRET_WIDTH_MID, _recomputeFretSpacingDerived, dZ, fretLabelScaleForFret, fretMid, fretX,
    initFretSpacing, setFretUniform, slideOffsetWorldX, slideTrailEnd
} from './core/fret-geometry.js';
import {
    _noteKey, _openStringPitchLabelsForTuning, anchorLaneBoundsAt, anchorPlayedFretSpanAt,
    computeBPM, fretColumnMarkersForAnchor, getChartAnchorAt, hwyFirstRelevantFrettedTime,
    laneBoundsFromAnchor, lowerBoundT, resolveStringCount
} from './core/chart-util.js';
import { splitscreenActive, splitscreenCanvasFocused } from './core/splitscreen.js';
import { nextInstanceId } from './core/instance-id.js';
import { _registerTunerShortcut } from './ui/shortcuts.js';
import { _aspectPaneKey, _aspectRegisterPane, _resolveTuneFor, nextPaneCounter } from './ui/aspect-panel.js';
import {
    SETTING_DEFAULTS, LOAD_SETTINGS_SIMPLE_KEY_TO_FIELD, BACKGROUND_STYLE_IDS,
    backgroundAxisColors, highwayAxisColors,
} from './settings/defaults.js';
import {
    emitSettingChange, hasStoredSetting, settingsMemFallback, settingsPanelKey, readGlobalSetting, readSetting,
    subscribeToSettings, unsubscribeFromSettings, freeCamFor,
} from './settings/store.js';
import { _venueCrowdVideos, _venueEffectiveMotionMode, _venueSceneOverride, _venueSwapPlateIfNeeded } from './background/venue.js';
import { acquireBackgroundControl, releaseBackgroundControl } from './ui/player-chrome.js';
import { ZERO_AUDIO_BANDS, getAudioAnalyser, readAudioBands, _resetAnalyserBridgeForTest } from './audio/analyser.js';
import { BACKGROUND_STYLES } from './background/styles/index.js';
import { drawSectionHud, drawToneHud } from './instance/overlay/huds.js';
import { createLyricsCache, drawLyrics } from './instance/overlay/lyrics.js';
import { createChordDiagramCache, drawChordDiagram } from './instance/overlay/chord-diagram.js';
import { createTextSpriteCache } from './instance/render/text-sprites.js';
import { createTechMaterialCache } from './instance/render/tech-materials.js';
import { chordHarmonyLabels, createChordInference } from './instance/model/chord-inference.js';
import { createArpeggioLaneRail } from './instance/render/arpeggio-lane-rail.js';
import { createNoteRenderer } from './instance/render/note.js';
import { createNotedetectListeners } from './instance/notedetect/listeners.js';
import { createCtx } from './instance/ctx.js';
import { createSettingsListener } from './instance/settings-listener.js';
import { pool } from './core/pool.js';
import { createDomAndScene } from './instance/geometry/dom-and-scene.js';
import { createNoteGemVisuals } from './instance/geometry/note-gem-visuals.js';
import { createBoardGhostFrames, createNoteGemPools } from './instance/geometry/note-gem-pools.js';
import { createChordAccentVisuals } from './instance/geometry/chord-accent-visuals.js';
import { createTechniqueInstancedMeshes } from './instance/geometry/technique-instanced-meshes.js';
import { createSustainRailVisuals } from './instance/geometry/sustain-rail.js';
import {
    createFretColumnMarkerPool, createHighwayLanePlane, createLaneDividers,
} from './instance/geometry/lane-and-labels.js';
import { createTapChevronAndLabelPools } from './instance/geometry/tap-chevron-and-label-pools.js';
import { createBeatAndSectionLabels } from './instance/render/beat-and-section-labels.js';
import { finalizeInstancedMeshBatches } from './instance/render/finalize-instanced-meshes.js';
import { createChordRenderer } from './instance/render/chords.js';
import { createSingleNoteRenderer } from './instance/render/single-notes.js';
import { createHighwayLane } from './instance/render/highway-lane.js';
import { createFretColumnMarkers } from './instance/render/fret-column-markers.js';
import { createCameraTarget } from './instance/render/camera-target.js';
import { updateChordDiagramTracking } from './instance/model/chord-diagram-tracking.js';
import { createFretNumberRow } from './instance/render/fret-number-row.js';
import { createFretWireHitFlash } from './instance/render/fret-wire-hit-flash.js';
import { createCameraBootstrap } from './instance/render/camera-bootstrap.js';
import { createArpAndSlidePrepasses } from './instance/model/arp-and-slide-prepasses.js';
import { createFrameState } from './instance/render/note-state.js';
import { createLookaheadPrepasses } from './instance/render/lookahead-prepasses.js';
import { createHitSparks } from './instance/render/hit-sparks.js';
import { createBloomComposer } from './instance/render/bloom-composer.js';
import { createLookaheadMath } from './instance/model/lookahead-math.js';
import { createNoteCameraTargets } from './instance/render/note-camera-targets.js';
import { createScoreFx } from './instance/render/score-fx.js';
import { createNutHeadstockBuilder } from './instance/geometry/nut-headstock.js';
import { createFretMarkersBuilder } from './instance/geometry/fret-markers.js';
import { createBackgroundMount } from './instance/background-mount.js';
import { createMaterialRetint } from './instance/render/material-retint.js';
import { createVerdictPrune } from './instance/notedetect/verdict-prune.js';
import { createCameraLifecycle } from './instance/render/camera-lifecycle.js';
import { camBaseDistU, camLowFretPullbackU, createHelpers, setLabelMap } from './instance/helpers.js';
import {
    bnvSampleAt, canvasSize, darkenHex, disposeGroupTree, effectiveVfov, noteHasVibrato,
    teachingDegreeLabel, teachingFingerLabel, tremoloOffsetWorldX, vibratoSemisAtTime,
} from './instance/model/math.js';
import { fastForwardIndex, isDesktopAudioHost } from './butterchurn/engine.js';
import { applyButterchurnSettingsToAll, loadButterchurnSettings, resetButterchurnSettingsCache } from './butterchurn/prefs.js';
import { updatePanelPreset } from './butterchurn/panel.js';
import { createButterchurnController } from './butterchurn/controller.js';
import { installGlobals } from './globals.js';

// Restore the persisted fret-spacing mode before anything renders. Must
// run before the factory is ever used -- see initFretSpacing()'s doc
// comment in core/fret-geometry.js for why this can't be a module-scope
// side effect inside that file itself.
initFretSpacing();
installGlobals();

/* ======================================================================
 *  Constants
 * ====================================================================== */

// Live-apply hook for the plugin's settings.html. The visualizer's on/off +
// slider controls now live in the standard settings panel (settings.html),
// which persists them into the SETTINGS_LS_KEY blob and then calls this so a mounted
// highway re-reads and applies them immediately. Defined on window at module
// scope so it's available regardless of whether a highway is mounted yet;
// settings.html guards the call with `?.` for the not-yet-loaded case.
window.h3dBcApplySettings = function () {
    resetButterchurnSettingsCache();   // drop the cache so the next read reloads from localStorage
    loadButterchurnSettings();
    applyButterchurnSettingsToAll();
    try { updatePanelPreset(); } catch (e) {}
};

// ── 3D preview: lookahead fret bounds + smoothed focal X / span ─────────

window.h3dSetFretSpacing = mode => {
    // Validate against the two supported modes before persisting so an
    // unexpected input can't leave an invalid value in localStorage
    // (mirrors h3dBgSetFretNumberGhostScope's allowlist guard). No-op
    // when the stored mode is already what was requested.
    const m = mode === 'logarithmic' ? 'logarithmic' : 'uniform';
    try {
        if (localStorage.getItem('highway_3d.fretSpacing') === m) return;
        localStorage.setItem('highway_3d.fretSpacing', m);
    } catch (_) {}
    // Apply live rather than reloading the page — a full page reload
    // reboots the SPA to the home screen (index.html's `.screen.active`),
    // ejecting the user from Settings. Rebind the module-scope flag so
    // panels mounted later this session pick up the new mode, recompute
    // the fretX-derived scalars, then broadcast a change so every mounted
    // panel rebuilds its board. Same live-update path as every other
    // 3D-highway setting.
    setFretUniform(m !== 'logarithmic');
    _recomputeFretSpacingDerived();
    emitSettingChange('fretSpacing');
};

// camBaseDistU/camLowFretPullbackU (camera tgtDist building blocks) -- see
// instance/helpers.js.

/* ======================================================================
 *  Factory — feedBack#36 setRenderer contract
 * ====================================================================== */

function createFactory() {
    const _instanceId = nextInstanceId();
    // Per-instance shared state (Stage 7 Track B) -- see instance/ctx.js's
    // doc comment. Only `ctx.cam` exists so far; more groups land as later
    // phases migrate their consumer clusters onto it.
    const ctx = createCtx(_instanceId);
    // Whether THIS instance holds a refcount on the shared player-chrome
    // control. Guards the init -> init (no destroy) path so one instance
    // can never take two references and pin the control.
    let backgroundControlAcquired = false;

    // ── Per-instance Three.js state ───────────────────────────────────
    let scene = null, cam = null, ren = null;
    let wrap = null;
    // WebGL context-loss recovery. Switching the active window / alt-tabbing
    // (especially on Windows) can trigger a GPU context reset; with no
    // handler the lost context escalates into a render-process crash. The
    // listeners (bound in initScene on ren.domElement, removed in teardown)
    // preventDefault the loss so the browser keeps the context restorable,
    // _ctxLost gates draw() off the dead context, and on restore we reset the
    // viewport + resume (Three re-uploads scene resources on the next render).
    let _ctxLost = false;
    let _onCtxLost = null, _onCtxRestored = null;
    let bcCtrl = null; // Butterchurn audio-reactive background (the 'butterchurn' bg-style)
    let _chartEnv = 0, _chartPrevT = -1, butterchurnBeatIdx = 0, butterchurnNoteIdx = 0, butterchurnChordIdx = 0, butterchurnTintTarget = null;
    let _tintR = 20, _tintG = 24, _tintB = 40; // smoothed instrument-color tint for the bg
    // highway:visibility listener (feedBack#246). Hides the .h3d-wrap
    // overlay when feedBack's canvas is display:none'd (splitscreen
    // case). Without this, the wrap is a *sibling* of #highway so
    // hiding #highway leaves the WebGL scene painting full-screen.
    // Bound in initScene after wrap creation, unbound in destroy().
    let _visibilityHandler = null;
    // highway:canvas-replaced listener — keeps highwayCanvas up to
    // date across context-type swaps (e.g. swapping back to a 2D
    // viz). The visibility handler's identity gate (event.detail.
    // canvas === highwayCanvas) would otherwise stop matching
    // after the swap; this listener follows the documented plugin
    // contract from CLAUDE.md.
    let _canvasReplacedHandler = null;
    let ambLight = null, dirLight = null;
    let fretG = null, tuningLblG = null, noteG = null, beatG = null, lblG = null;
    let gNote = null, gSus = null, gBeat = null, gTapChevron = null;
    // Board-projection ghost-frame geometry factory -- built by
    // createNoteGemVisuals(), called later from the pools section still
    // resident in initScene().
    let mkGhostFrameGeometry = null;
    // Per-string gradient gem geometries (index 0..5). Built in initScene
    // from sampled colour PNGs; each carries a per-vertex colour attribute.
    let gNoteGrad = [];
    let mStr = [], mGlow = [], mSus = [], mStrHitOutline = [], mAccentOutline = [], mAccentCore = [], mAccentHaloNear = [], mAccentHaloMid = [], mAccentHaloFar = [];
    // Pre-built accent-halo shell descriptors per string. Populated after
    // mAccentHaloFar/Mid/Near are materialised; consumed in drawNote()'s
    // hot path so the inner per-note `accentShells = [...]` array literal
    // (3 plain-object allocations per accent gem per frame) is replaced
    // by a stable read. Index 0 = outer, 1 = mid, 2 = near.
    let _accentShellsByString = [];
    let mWhiteOutline = null, mSusOutline = null;
    // Dedicated sustain-trail outline material for the hit verdict.
    // Drawn at opacity 0.45 — lower than mSusOutline (0.75) so the
    // bright green emissive doesn't tint the body interior, and the
    // verdict shows mostly on the outline fringe past the body edges.
    // Only the hit-side rim ships; the verdict on miss is carried by
    // mMissOutline (the gem-border material) instead of a dedicated
    // sustain outline — matches the "outline-only verdict, body retains
    // string colour" doctrine for the rest of the rendering path.
    let mHitSusOutline = null;
    // Shared materials for the legato technique meshes — one per geometry
    // type, reused across every pooled mesh instance to avoid per-mesh
    // material allocation in dense HO/PO/tap passages. Allocated in
    // initScene() alongside the other scene materials and disposed in
    // teardown.
    let mTapChevron = null;
    // Barre indicator material (white vertical line at the barre fret
    // during chord linger). Promoted from inline pool-factory authoring
    // to a named module-scope reference so _applyGlow() can mutate
    // emissiveIntensity in place when the user drags the glow slider.
    let mBarre = null;
    // Notedetect feedback outlines (issue #9). Created in initScene
    // alongside mWhiteOutline; swapped onto the note's outline mesh
    // when a recent notedetect:hit / :miss event matches the note's
    // (s, f, t). The miss gem border uses mMissOutline; the hit side
    // uses per-string mHitBright[s] for the cyan-shifted flash.
    let mMissOutline = null;
    // Per-string hit verdict material used for outline + lateral face fill.
    // Built in initScene() after mGlow. Array share the same material
    // instances so outline and face fill always match exactly.
    let mHitBright = [], mHitBrightArrays = [];
    // Gem-rim hit flash ("just the rims"): per-string materials that flash
    // in the STRING'S OWN colour with the same intensity treatment as the
    // fret wires (FRET_WIRE_HIT_INTENSITY ramp, provider-alpha fade). Shared
    // per string, so the applied intensity is the per-frame MAX alpha across
    // that string's flashing gems — same compromise mGlow already makes.
    let mRimFlash = [];
    const _rimFlashIn = new Float32Array(S_COL.length);
    // [verdict glow] Per-frame accumulation of the note-state provider's
    // alpha (note_detect drives this from the live input level for held
    // sustains, and as a time-fade for fresh strikes). Applied at the top of
    // update() to scale the verdict-glow materials' emissiveIntensity so the
    // gem brightness tracks how hard the string is actually ringing. Stays
    // at "no provider" (vg = 1, unchanged brightness) for the legacy event
    // path or when note_detect is off.
    // Shared with note.js's drawNote(), which writes maxAlpha/sawAlpha (the
    // per-frame verdict-glow accumulator) and streakHits (the #7 consecutive-
    // hit escalation counter) — both written there and read/reset here in
    // update(), on the same frame, so it's a genuinely shared mutable object
    // rather than a construction-time alias or a per-frame "frame" field. See
    // note.js's top-of-file doc comment.
    let noteVerdictState = { maxAlpha: 0, sawAlpha: false, streakHits: 0 };
    // The note-renderer instance (note.js) and the per-frame value bag update()
    // hands to every noteRenderer.drawNote() call this frame. Both live here
    // (not module scope) for the usual per-instance reason -- one note
    // renderer per splitscreen panel. noteRenderer is (re)built in initScene()
    // once the materials/pools it wraps exist; _noteFrame is a single
    // never-reallocated object whose fields update() overwrites each call.
    let noteRenderer = null;
    const _noteFrame = {};
    // Beat lines + section labels (instance/render/beat-and-section-labels.js),
    // (re)built in initScene() alongside noteRenderer.
    let beatAndSectionLabels = null;
    // The chord renderer (instance/render/chords.js), (re)built in
    // initScene() alongside noteRenderer, and its per-frame accumulator --
    // see chords.js's doc comment for why this needs a mutable-object
    // handoff rather than a plain return value (both this loop and the
    // single-notes loop above it write into the same 6 fields across one
    // frame).
    let chordRenderer = null;
    const _chordAccum = {};
    // The standalone-note renderer (instance/render/single-notes.js),
    // (re)built in initScene() alongside noteRenderer/chordRenderer. Reads
    // the same _noteFrame/_chordAccum objects above -- see
    // single-notes.js's doc comment.
    let singleNoteRenderer = null;
    // The dynamic-highway-lane renderer (instance/render/highway-lane.js),
    // (re)built in initScene() alongside the note/chord renderers.
    let highwayLane = null;
    // The fret-column reference marker renderer
    // (instance/render/fret-column-markers.js), (re)built in initScene().
    let fretColumnMarkers = null;
    // Lookahead-camera-mode pure math (instance/model/lookahead-math.js),
    // (re)built in initScene(). Injected as deps into cameraTarget/
    // cameraBootstrap below.
    let lookaheadMath = null;
    // Steady-mode camera-distance/X-target resolver
    // (instance/render/note-camera-targets.js), (re)built in initScene().
    // Injected as a dep into cameraTarget/cameraBootstrap below.
    let noteCameraTargets = null;
    // The camera-target resolver (instance/render/camera-target.js),
    // (re)built in initScene().
    let cameraTarget = null;
    // The fret-number-row renderer (instance/render/fret-number-row.js),
    // (re)built in initScene().
    let fretNumberRow = null;
    // The fret-wire hit-flash applier (instance/render/fret-wire-hit-flash.js),
    // (re)built in initScene().
    let fretWireHitFlash = null;
    // The song-change/camera-bootstrap resolver
    // (instance/render/camera-bootstrap.js), (re)built in initScene().
    let cameraBootstrap = null;
    // The arpeggio-persist / slide-target pre-pass computer
    // (instance/model/arp-and-slide-prepasses.js), (re)built in initScene().
    let arpAndSlidePrepasses = null;
    // The per-string frame-state builder + string-highlight updater
    // (instance/render/note-state.js), (re)built in initScene().
    let frameState = null;
    // Per-frame lookahead/gap prepasses (instance/render/lookahead-prepasses.js),
    // (re)built in initScene().
    let lookaheadPrepasses = null;
    // Magenta-red face fill for miss — see initScene() for construction
    // (uses mMissOutline ×4 + mEdgeTransparent ×2).
    let mMissEdgeArrays = null;
    let mEdgeTransparent = null;
    let pSusOutline = null, pNoteEdge = null;
    let projMeshArr = null;
    let _probe = null;
    /** Snapshotted in update() for drawNote() ghost / glow (single source vs per-caller isNext). */
    let _drawNextByString = null;
    /** Most-recent past event time per string (within 0.6 s back), for _nextAnyT deadline. */
    let _drawRecentByString = null;
    /** Snapshotted in update() — drawNote() is a sibling of update(), not nested in its closure. */
    let _drawChordTemplates = null;
    /** Ditto — drawNote() needs the anchors to resolve the lane's outer
     * wires for an open note's hit flash (an open note has no fret of its
     * own; its slab spans the lane, so the lane edges are what bracket it). */
    let _drawAnchors = null;
    /** Teaching marks sd/ch overlay pref (§6.2.2), mirrored from the 2D
     * highway's `teachingMarksVisible` bundle flag. */
    let _drawTeachingMarks = false;
    /** Fret-hand finger (fg) hint pref, mirrored from the 2D highway's
     * `fingerHintsVisible` bundle flag — default on (shown unless an explicit
     * false), hideable independently of the sd/ch overlays. */
    let _showFingerHints = true;
    let _laneTargetColor = null;
    let _renderScale = 1;
    let lyricsCanvas = null, lyricsCtx = null;
    // FPS counter overlay. EMA-smoothed over ~30 frames so the readout doesn't
    // jitter every rAF tick. Controlled by the 'fpsVisible' setting (SETTING_DEFAULTS).
    // Legacy 'h3d_showFps' localStorage key and window.h3dShowFps are no longer
    // consulted — use the Settings → 3D Highway — Camera → Show FPS counter checkbox.
    let _fpsLastT = 0;
    let _fpsEma = 0;
    let _fpsDisplay = 0;
    let _fpsLastSampleT = 0;
    // The FPS readout is pinned top-right of the highway overlay — the same
    // corner the v3 player chrome stacks its persistent "Up Next" pill and
    // live-performance HUD into, on a higher layer that paints over the
    // canvas. So out of the box the readout sits *behind* that chrome and
    // can't be read (exactly when you've turned it on to judge perf). Rather
    // than relocate it (testers look top-right), we drop it just BELOW
    // whichever of that chrome is showing. Refs are resolved once and cached
    // — never a per-frame querySelector (see CLAUDE.md "never run DOM queries
    // on a per-frame path") — and re-resolved only when a node detaches.
    let _v3HudEls = null;
    // Returns the bottom edge (in overlay-canvas px, which are 1:1 CSS px on
    // this overlay) of the lowest visible top-right v3 chrome element, or 0
    // when none apply (classic v2 UI, or all hidden). Only called while the
    // FPS readout is actually drawn, so the layout reads cost nothing in the
    // common (counter-off) case.
    function _v3TopRightChromeBottom() {
        if (typeof document === 'undefined' || !highwayCanvas) return 0;
        // Only the v3 chrome stacks persistent HUD elements over the canvas's
        // top-right. Gate on the documented detector so this is a strict no-op
        // in classic v2 (where 'hud-time' also exists but sits elsewhere).
        if (!(window.feedBack && window.feedBack.uiVersion === 'v3')) return 0;
        if (!_v3HudEls || _v3HudEls.some((el) => el && !el.isConnected)) {
            _v3HudEls = ['v3-upnext', 'v3-live-performance-hud', 'hud-time']
                .map((id) => document.getElementById(id));
        }
        const top = highwayCanvas.getBoundingClientRect().top;
        let maxBottom = 0;
        for (const el of _v3HudEls) {
            // offsetParent === null ⇒ display:none (a `.hidden` pill/HUD) or
            // not laid out — don't duck under something that isn't shown.
            if (!el || el.offsetParent === null) continue;
            const b = el.getBoundingClientRect().bottom - top;
            if (b > maxBottom) maxBottom = b;
        }
        return maxBottom;
    }
    let _diagChord            = null;
    // Chord diagram OffscreenCanvas render cache -- see
    // instance/overlay/chord-diagram.js's createChordDiagramCache().
    // Constructed once (no per-init Three.js dependency). Cleared on canvas
    // resize (bx/by depend on canvasW/H/lyricsBottom) and on teardown/destroy.
    const chordDiagramCache = createChordDiagramCache();
    let pSusRail = null, gSusRail = null, mSusRailBase = null;
    let pSusRailBloom = null, gSusRailBloom = null, mSusRailBloomBase = null, _bloomGaussTex = null;
    let pTechPlane = null, gTechPlane = null;

    // ── InstancedMesh for PM/FH X markers ────────────────────────────────
    // Replaces pTechPlane pool entries for PM and FH mute techniques,
    // collapsing O(visible-muted-notes) draw calls to 2 per type.
    // pTechPlane pool is still used for H/P triangles, harmonics and bends.
    let imPMTech = null, imFHTech = null;
    let _imGPMTech = null, _imGFHTech = null; // cloned geometries (own instanceAlpha attr)
    let _imPMTechMat = null, _imFHTechMat = null;
    const IM_TECH_CAP = 256;
    const _imPMTechAlphaArr = new Float32Array(IM_TECH_CAP);
    const _imFHTechAlphaArr = new Float32Array(IM_TECH_CAP);
    let _imPMTechCount = 0, _imFHTechCount = 0;

    // ── InstancedMesh for chord strum indicators ──────────────────────────
    // Replaces pPMXFill, pMuteXLines, pFHXFill, pFHXLines pools.
    // Fixed renderOrder per type — no per-instance sort needed.
    let imPMXFill = null, imPMXLines = null, imFHXFill = null, imFHXLines = null;
    let _imPMXFillMat = null, _imPMXLinesMat = null;
    let _imFHXFillMat = null, _imFHXLinesMat = null;
    const IM_STRUM_CAP = 64;
    const _imPMXFillAlphaArr  = new Float32Array(IM_STRUM_CAP);
    const _imPMXLinesAlphaArr = new Float32Array(IM_STRUM_CAP);
    const _imFHXFillAlphaArr  = new Float32Array(IM_STRUM_CAP);
    const _imFHXLinesAlphaArr = new Float32Array(IM_STRUM_CAP);
    let _imPMXFillCount = 0, _imPMXLinesCount = 0, _imFHXFillCount = 0, _imFHXLinesCount = 0;

    // Temporaries for InstancedMesh matrix composition — allocated once in
    // initScene() after Three.js loads, reused every frame without allocation.
    let _imM4 = null, _imPos = null, _imSca = null, _imQ = null, _imAZ = null, _imColor = null;

    let _diagPrev             = null;
    let _diagPrevOpacity      = 0;
    let _diagPrevStartOpacity = 0;
    let _diagPrevStartT       = null;  // bundle.currentTime when crossfade began (drives rewindable fade)
    let _diagEntranceT        = 1.0;
    let _diagLastKey          = null;  // chord identity: name + '|' + frets.join(',')
    // Per-wave cache for fret-column reference markers. Keyed by the
    // wave's beat timestamp. We snapshot { hasLow, hasHigh, fretList,
    // anchorKeyed } at first sight of a wave so its render gate stays consistent through the
    // wave's flight even as activeFrets shifts mid-song. Entries are
    // pruned each frame once their wave has passed `now`.
    let _fretMarkerWaveCache = new Map();
    // Fret connector-label visibility cache: tracks which (time, fret)
    // pairs may show their indicator number per the measure-skip rule
    // (show only the first note with a given fret in a measure; suppress
    // the same fret for the following measure, then allow it again).
    let _fretLabelAllowed = new Set();
    let _fretLabelNotesRef = null;
    // Cache of measure-start times (beats with measure !== -1), rebuilt when
    // the beats array changes. Drives the camera lookahead window
    // (CAM_LOOKAHEAD_MEASURES measures instead of a fixed number of seconds).
    let _measureStarts = [];
    let _measureStartsRef = null;
    // Frame-level dedup: tracks which (40ms-rounded-time, fret) pairs have already
    // rendered a label this frame so that multiple strings at the same fret/onset
    // (arpeggio chords, synthetic chords) never produce stacked duplicate labels.
    const _frameLabeledKeys = new Set();

    // Slide-target gem suppression. A Set of "t_s" keys for notes in
    // bundle.notes that are the linkNext destination of a preceding note
    // (single or chord). The gem is suppressed (skipBody=true) but the
    // sustain/slide trail still renders so the slide motion stays visible.
    let _slideTargetSet = null;
    let _slideTargetNotesRef = null;
    let _slideTargetChordsRef = null;

    let _lastHwW = 0, _lastHwH = 0;
    // Frame counter for throttling the CSS-box drift check in draw()
    // (getBoundingClientRect is a forced layout read; see the comment
    // at the check).
    let _boxCheckCountdown = 0;
    // Last logical (CSS px) size draw()'s resize-detection fallback compared
    // against -- see cameraLifecycle.getAppliedSize() (instance/render/
    // camera-lifecycle.js) for the applied-size/wrap-pinned state itself.
    // _paneAspect lives on ctx.cam now (see instance/ctx.js) -- cached so
    // camUpdate can recompute the horizontal-FOV-hold each frame (and react
    // to live __h3dAspectTune edits) without waiting for a resize.
    // Per-instance fallback id for the wide-pane tuner's pane key, used only
    // when this pane has no arrangement name to key by. Assigned once in
    // init(); overrides keyed off arrangement persist across songs, this
    // fallback is session-only.
    let _paneUid = 0;
    let mBeatM = null, mBeatQ = null;
    // txtMat/pinchHarmonicMat/naturalHarmonicMat/muteXMat + the technique
    // marker sprite cache (triMat/bendChevronMat/slideArrowMat) live in
    // instance/render/{text-sprites,tech-materials}.js now. Both factories
    // are called once per renderer instance so each panel gets its own
    // cache — see the module doc comments for why that must stay per-instance.
    const textSprites = createTextSpriteCache();
    const techMaterials = createTechMaterialCache();
    // Per-instance lyrics row-layout cache — drawLyrics lives in
    // instance/overlay/lyrics.js now, but the cache stays here, one per
    // renderer instance, same reasoning as txtCache: a module-level singleton
    // would have splitscreen panels thrashing each other's cache every frame.
    const lyricsCache = createLyricsCache();
    // Cloned sprite materials cached on individual sprite instances
    // (e.g. pmMark._pmMat). pLbl pool reuses sprites across labels,
    // so when a sprite is later assigned a different material the
    // _pmMat stays referenced on the sprite itself but isn't reached
    // by the scene.traverse-based dispose. Track them here so
    // teardown can dispose them explicitly.
    const _ownedClonedMats = [];
    // Per-mesh technique-marker clones — keyed by mesh, disposed when
    // the source sprite's map changes or on teardown. Replaces the old
    // unbounded push-per-frame approach in _spriteMat2MeshMat.
    const _techMeshMatClones = new Set();
    // Shared (non-clone) materials and geometries that pool factories
    // reference but that aren't guaranteed to be reachable via
    // scene.traverse() — e.g. mLaneEven is only reached if at least one
    // even-numbered fret stripe ever spawns. Track them here so teardown
    // disposes the GPU resource regardless.
    const _ownedSharedMats = [];
    const _ownedSharedGeos = [];

    // Background animation state (issue #13). bgGroup is the parent
    // container for all bg meshes so teardown is one remove + dispose
    // pass. bgState/bgStage/bgMountedStyleId now live privately inside
    // instance/background-mount.js -- see backgroundMount.getBgState().
    let bgGroup = null;
    // bgStyleId / bgIntensity / bgReactive / bgThemeId / hwThemeId live on
    // ctx.settings (Stage 7 Track 3e) -- bgStyleId read in
    // effectiveBackgroundStyleId()/butterchurnModeActive()/
    // mountBackgroundStyle() (plus settings-listener.js's ctx.settings
    // reads); bgIntensity in mountBackgroundStyle() (plus settings-
    // listener.js); bgReactive in draw(); bgThemeId/hwThemeId (BACKGROUND /
    // HIGHWAY axis, applied by _applyBgTheme -- clear + fog + board plane)
    // in _applyBgTheme()/buildBoard().
    // _boardPlaneMat lives on ctx.board now (see instance/ctx.js) -- the
    // fretboard/highway-surface plane material, kept so the theme can
    // recolor it live without rebuilding the board. Set in buildBoard().
    // Per-render opt-out for plugins borrowing the highway as a viz: when the
    // mount bundle sets bgReactive === false, suppress the audio-reactive
    // background for THIS instance only (no shared h3d_bg_* write). Captured
    // from the bundle in init(); applied in loadSettings() so it survives
    // later setting reloads. See init() for the rationale.
    let backgroundReactiveOptOut = false;
    // Active palette for this panel (issue #10). Materials and per-
    // frame color reads inside createFactory all consult this rather
    // than the module-level S_COL, so a palette swap re-tints the
    // panel live without touching module-level state. activePalette /
    // backgroundPaletteSig live on ctx.settings (Stage 7 Track 3e, final
    // batch) -- backgroundPaletteSig is loadSettings()-internal (content
    // signature of the colors last applied, forces a retint when the
    // in-place custom palette changes values without changing array
    // identity).
    // Fret digits on the board ghost (hollow preview at Z=0), not on
    // flying note bodies — see fretNumberGhostScope for chord-hand vs all.
    // showFretOnNote / fretNumberGhostScope live on ctx.settings (Stage 7
    // Track 3e) -- both read only inside update()'s _noteFrame block.
    // Camera-X smoothing dial (issue #34). 0 = twitchy (track every
    // upcoming fret), 1 = calm (ignore small intra-cluster shifts).
    // cameraSmoothing / zoomSmoothing / tiltSmoothing live on ctx.settings
    // (Stage 7 Track 3e) -- read only in update() (first two) or
    // camUpdate() (tiltSmoothing). Per-axis follow-ups: zoom (tgtDist
    // hysteresis) and vertical-tilt (tgtLookY NDC self-correction) each
    // get their own dial, mirroring cameraSmoothing's value when not
    // explicitly stored (loadSettings()) so existing users who only ever
    // moved the camera-smoothing slider get the same calmness on the new
    // axes by default.
    // Camera lock: when true, pin the camera to a fixed wide view of
    // frets 1-12 unless an upcoming note would otherwise be off-screen.
    // The lock disengages while any note above fret 12 is in the
    // lookahead window so the camera can briefly widen to include it,
    // then re-engages once the high note ages out.
    // cameraLockLow / cameraLockZoom (lock disengages while any note above
    // fret 12 is in the lookahead window) / cameraMode / textSize (global
    // text-size multiplier; 0..1 slider mapped to 0.5..1.5×) / glowMul all
    // live on ctx.settings (Stage 7 Track 3e). _textSizeMul is the
    // materialized multiplier — refreshed once per frame at the top of
    // update() and consumed by every text-sprite scale.set call inside
    // update and drawNote.
    let _textSizeMul = 1.0;
    let _textSizeMulApplied = -1;
    // Visual look dials (issue: pastel/washed-out feel + too-much-glow
    // complaint). vibrancy raises idle string/note opacity and de-whites
    // the hit-note body; glow scales every emissive contribution +
    // projection glow layer opacity. Sliders are 0..1; defaults lean
    // vivid + minimal-glow to match the requested out-of-box look.
    // vibrancy / _vibrancyIdleOp / _vibrancyProjOp / _cinematic all live on
    // ctx.settings (Stage 7 Track 3e). _hitFx / _verdictMarks / _timingFx /
    // _streakFx / _bloom also live there -- read only inside update()'s
    // _noteFrame block (first four) or draw() (_bloom). _sparks also moved
    // there.
    // camUpdate()/applySize() -- see instance/render/camera-lifecycle.js.
    // Constructed in initScene() AFTER the createDomAndScene() destructure
    // (needs cam/ren/wrap/lyricsCanvas), but createDomAndScene() itself
    // needs an `applySize` function to hand to its _onCtxRestored listener
    // -- passed as a thin proxy closing over this `let` by reference (same
    // "wrapper indirection" fix material-retint.js used for its own
    // pre-construction-time dependency).
    let cameraLifecycle = null;
    // Bloom composer (#4) -- see instance/render/bloom-composer.js.
    // bloomComposer is constructed once in initScene(); its internal
    // composer/bloomPass state is reset to null by disposeBloomComposer()
    // in teardown() and rebuilt lazily on the next draw() that requests it.
    let bloomComposer = null;
    // Guitar nut + headstock geometry builder
    // (instance/geometry/nut-headstock.js), (re)built in initScene(), called
    // from buildBoard() on every rebuild (palette/theme/lefty/nStr changes).
    let nutHeadstockBuilder = null;
    // Fret wires + fret dots + fret inlay labels builder
    // (instance/geometry/fret-markers.js), (re)built in initScene(), called
    // from buildBoard() on every rebuild.
    let fretMarkersBuilder = null;
    // Background-style mount/unmount/rebuild + scene-color theme applier
    // (instance/background-mount.js), (re)built in initScene(). bgState is
    // now private to this module -- read externally via
    // backgroundMount.getBgState().
    let backgroundMount = null;
    // Live palette/vibrancy/glow material-retint passes
    // (instance/render/material-retint.js), (re)built in initScene() BEFORE
    // createNoteGemVisuals() (which takes materialRetint.recolorGemGradients
    // as a construction-time dep) -- see material-retint.js's doc comment.
    let materialRetint = null;
    // Hit-spark particle system (#3) -- see instance/render/hit-sparks.js.
    // _sparkPts/_sparkBurst/_sparkUpdate are populated by createHitSparks()
    // in initScene(); the backing Float32Arrays are private to that module.
    let _sparkPts = null, _sparkBurst = null, _sparkUpdate = null;
    const _sparkSeen = new Map();     // note-key -> expiry; one burst per hit
    let _juiceLastT = 0;              // frame-dt clock for the juice layer
    let _streakHeat = 0;  // #7 consecutive-hit escalation (streakHits itself lives on noteVerdictState — see its decl above)
    // fretDividersVisible / fretColumnMarkerCadence / sectionLabelsOnHighway
    // / fpsVisible / chordDiagram* / sectionHud* / toneHud* / _bloom /
    // inlayLabelsVisible / nutHeadstockVisible live on ctx.settings (Stage 7
    // Track 3e) -- all read only inside draw() or buildBoard() (last two).
    // tuningLabelsVisible / nutColor / headstockColor live on ctx.settings
    // (Stage 7 Track 3e) -- read only in _syncOpenStringPitchLabels() /
    // buildBoard(). projectionVisible (board "note preview" ghost) and the
    // three slideArrow* previews also live there -- all read only inside
    // update()'s _noteFrame block.
    // bgCustomImageDataUrl / bgCustomImageName / bgCustomVideoName live on
    // ctx.settings (Stage 7 Track 3e) -- read only in mountBackgroundStyle().
    // Data URL is the bytes that drive the 'image' bg style's texture; name
    // is display-only metadata settings.html shows next to the file picker.
    // Video stores the server-side filename only; bytes live on disk via
    // routes.py -- the renderer composes the served URL from this filename
    // in BACKGROUND_STYLES.video.build.
    let settingsListener = null;
    let backgroundLastT = 0;  // ms timestamp for dt

    // Notedetect feedback (issue #9). Per-panel mark queues populated
    // by two event sources: (a) legacy `notedetect:hit` /
    // `notedetect:miss` window CustomEvents, and (b) FeedBack
    // event-bus `note:hit` / `note:miss` events (subscribed in
    // initScene() when window.feedBack exposes both `on` and `off`).
    // Both sources feed the same noteDetectPushMark() helper which dedupes
    // dual emissions. drawNote looks up its (s, f, t) against these
    // arrays each frame and swaps the outline material when a match
    // is current. Marks expire after NOTEDETECT_TTL_MS so the visual flash
    // is brief. Marks self-prune unconditionally in the listener and
    // once per frame in update() to keep the arrays small.
    const NOTEDETECT_TTL_MS = 500;
    const NOTEDETECT_TIME_EPS = 0.01;
    let noteDetectHitMarks = [];
    let noteDetectMissMarks = [];
    let noteDetectOnHit = null, noteDetectOnMiss = null;
    let noteDetectOnBusHit = null, noteDetectOnBusMiss = null;
    let noteDetectLabels = [];
    // Per-chord-occurrence verdict latch for the chord-frame rim
    // tint. Once a chord is observed all-hit/active during its linger
    // fade we latch 'green' here so subsequent frames can't undo it
    // as individual constituent glows decay and getNoteState starts
    // returning null again (which would otherwise flicker the rim
    // back to red mid-linger). Keyed by `${ch.id}|${ch.t}` — ch.id
    // alone is the chord *template* id and is reused across every
    // occurrence of the same shape, so id-only latching would bleed
    // a single clean grab onto every later occurrence of that chord.
    // Pre-hit-line invalidation (chDt > 0 path in the rim selection)
    // evicts a chord's latch the next time it's seen approaching, so
    // loops/rewinds re-judge from scratch and the Map can't grow
    // beyond the current pre-hit-line frontier. Also cleared in
    // destroy().
    let _chordVerdicts = new Map();
    // Numeric encoding for the _chordVerdicts key — replaces
    // ``${ch.id}|${ch.t}`` which allocated a string per chord per
    // frame in detect mode. Encoded so the key is monotonic in
    // chord time and the prune sweep can compare keys directly
    // (no parseFloat / String.slice). The time component sits in
    // the upper bits; chord-template ids share the lower 1e6 slot
    // and ch.id == null reserves idSlot 0 (no real chord id can
    // collide with it because real ids encode as id + 1).
    // ``time * 1e4`` keeps a 0.1 ms resolution — more than enough
    // to disambiguate distinct chord onsets — and stays under the
    // safe-integer limit for any realistic song length.
    const _CV_KEY_TIME_MUL = 1e4;
    const _CV_KEY_TIME_SLOT = 1e6;
    function _encodeChordVerdictKey(ch) {
        const tSlot = Math.round(ch.t * _CV_KEY_TIME_MUL) * _CV_KEY_TIME_SLOT;
        const idSlot = ch.id != null ? ((Number(ch.id) | 0) + 1) : 0;
        return tSlot + idSlot;
    }
    // Per-frame timestamp captured by update() and used by its
    // prune pass for the notedetect mark arrays. drawNote itself
    // no longer reads it — pruning lives once per frame so
    // drawNote's hot path is just the bounded (s, f, t) match.
    let noteDetectFrameNowMs = 0;
    // feedBack#254 — core's per-note judgment provider, captured
    // from `bundle.getNoteState` at the top of each update(). When
    // present it's authoritative over the event-driven marks above:
    // 'hit'/'active' → bright string-tinted outline (mGlow[s]) +
    // bright body + glowing sustain trail + a contained sparkle on
    // the overlay (a held sustain keeps glowing/sparkling for as
    // long as it stays 'active'); 'miss' → red outline (mMissOutline)
    // + suppressed body. null on cores without the API or songs
    // with no scorer registered. Older note_detect builds that only
    // emit notedetect:hit/miss events still work via noteDetectHitMarks.
    let noteDetectGetState = null;
    let noteDetectHasProvider = false;  // true iff a note-state provider is registered (feedBack#254)
    // Sustain verdict latch — persists a provider's hit/miss verdict for the
    // full duration of a sustained note. Once hitGlowDuration expires the
    // provider stops returning state; the latch re-injects the last verdict
    // so the green/red color stays alive until susEnd.
    // Key: Math.round(n.t * 1e4) * 10 + n.s  (matches _ghostPrevBuf scheme)
    // Value: 'hit' | 'hit-live' | 'miss'  ('hit-live' = a live provider hit,
    // tagged live:true, which is NOT re-injected once the provider goes
    // silent — see the live-latch handling in the per-gem loop below).
    let _susVerdictLatch = new Map();

    // Score FX (notedetect game-scoring layer) -- see
    // instance/render/score-fx.js, (re)built in initScene(). _fxOnFx/
    // _fxOnSkin/_fxElemSeen stay here -- they're notedetect/listeners.js's
    // concern (already-extracted, Phase 3c), not score-fx.js's.
    let scoreFx = null;
    // Per-frame chord-verdict Map pruning -- see instance/notedetect/verdict-prune.js.
    let verdictPrune = null;
    let _fxOnFx = null;          // notedetect:fx listener (window)
    let _fxOnSkin = null;        // notedetect:skin bus listener
    // Details seen via element-scoped (bubbled) dispatch. A WeakSet, not a
    // single slot: one judged hit can emit several fx in the same task
    // (milestone + multiplier tier-up), and the deferred window-copy
    // fallback for the FIRST must still see that its element copy arrived
    // after the SECOND overwrote any last-detail slot. GC reclaims
    // entries once notedetect drops the detail objects.
    let _fxElemSeen = new WeakSet();

    // Object pools
    let pNote, pSus, pLbl, pBeat, pSec;
    let pFretLbl, pLane, pLaneDivider;
    // Shared materials/geometry for the lane stripes — see initScene().
    // Hoisted so draw() can reference them when assigning per-stripe.
    let mLaneOdd = null, mLaneEven = null, gLanePlane = null;
    /** Lane fret dividers: default white vs arpeggio frame tint on outer wires only. */
    let mLaneDivider = null, mLaneDividerArp = null, mLaneDividerExt = null;
    /** Shared XY plane for ghost fret digits (lies on board like proj, not billboarding). */
    let gGhostFretPlane = null, pGhostFretLbl = null;
    // Anchor-driven lane scratch buffers. Per-frame the loop builds up
    // to HIGHWAY_LANE_TIME_SLICES segments, but consecutive slices that share
    // an anchor (the common case) collapse into the same entry. Held as
    // four parallel arrays so the per-frame work allocates nothing once
    // the buffers reach their steady-state size.
    const _laneSegDMin = [];
    const _laneSegDMax = [];
    const _laneSegZ0 = [];
    const _laneSegZ1 = [];
    /** Chart-time span per merged lane segment (for per-slice arpeggio rail tint). */
    const _laneSegTLo = [];
    const _laneSegTHi = [];
    const _laneSegArp = [];
    let _laneSegLen = 0;
    let pChordBox, pChordFrameFill, pChordLbl, pBarreLine, pArpBracket, pPMXFill, pFHXFill;
    let gPMXFill = null; // shared geometry for PM X fill — disposed in teardown
    let gFHXFill = null; // shared geometry for FH X fill — disposed in teardown
    let gPMXLines = null, pMuteXLines = null; // PM X lines combined geometry (8 segs as quads)
    let gFHXLines = null, pFHXLines = null;   // FH X lines combined geometry
    let pNoteFretLabel, pConnectorLine, pDropLine, pTapChevron, pAccentHalo;
    let pTeachMarkLbl;  // teaching marks fg/sd label sprites (§6.2.2)
    let pHaloBar = null, gHaloBar = null; // gradient halo bar geometry — replaces per-shell pChordAccentHalo
    let gArpBracket = null; // shared 1×1×1 box geometry for pArpBracket; built once, disposed in teardown
    let pSusRibbon = null, pSusRibbonOl = null;
    let pFretColMarker;
    // Single source of truth for "every pool" — populated once all 33 are
    // created (end of initScene()'s pool-creation block) and walked by the
    // reset loop at the top of update(). Centralizes the reset call so a
    // newly added pool can't be forgotten there (see CLAUDE.md pitfall #1).
    let POOL_REGISTRY;
    /** Horizontal gradient for chord box interior fill. */
    let chordFrameGradTex = null;
    /** Lavender gradient for arpeggio box interior (cyan × lavender blend — fades back to cyan). */
    let chordFrameGradTexArp = null;

    // Fretboard/nut/headstock geometry + materials (stringLines,
    // stringLineGlows, fretWireMats, fretTubeGeo, _boardPlaneMat,
    // nutHeadstockGroup, boardStringStartX, boardTuningLabelX, _inlayLabels,
    // _inlayMats) now live on `ctx.board` -- see instance/ctx.js's doc
    // comment. All written by buildBoard(); read by
    // updateStringHighlights()/_applyVibrancy()/_applyBgTheme()/
    // _syncOpenStringPitchLabels()/update()'s fret-wire-highlight sections/
    // teardown(), none of which rebuild it themselves.
    // Open-string tuning labels beside the headstock (issue: per-song tuning).
    let _tuningLabelSprites = [], _tuningLabelMats = [];
    let _lastOpenStringLblSig = '';
    // Cheap-key cache for _syncOpenStringPitchLabels: skip the expensive
    // labels-array + signature-string build when the inputs that actually
    // change the labels haven't changed reference/value since last frame.
    let _lastSyncTuningRef = undefined;
    let _lastSyncBundleTuningRef = undefined;
    let _lastSyncCapo = NaN;
    let _lastSyncArrIdx = undefined;
    let _lastSyncPaletteRef = null;
    let _lastSyncNStr = -1;
    let _lastSyncTextSizeMul = NaN;
    let _lastSyncStartX = NaN;
    let _lastSyncLabelX = NaN;
    // Scratch Color used by _applyVibrancy() to avoid allocating a
    // fresh THREE.Color each time the user drags a slider.
    // Allocated lazily once Three.js is loaded inside initScene().
    let _paletteColorTmp = null;
    // Per-fret last-active timestamp for lane persistence
    let fretLastActiveTime = new Array(NFRETS + 1).fill(0);

    // Active string count for the current arrangement (resolved each
    // frame from bundle.stringCount and clamped to MAX_RENDER_STRINGS).
    let nStr = NSTR;
    // ── src/instance/helpers.js's per-instance factory ──────────────────
    // validString/filterValidNotes/xFret/xFretMid/boardSpanX/sY/
    // firstEventTimeGreaterThan/drawArpBrackets -- all shared by 2+ of the
    // createX(deps) factories below, so they moved out to their own file
    // (Stage 7, post-3e) instead of staying bare functions in this closure.
    // Constructed HERE (before chordInference, which needs validString/
    // filterValidNotes immediately) rather than inside initScene(): unlike
    // most post-3e slices, chordInference/arpeggioLaneRail are built ONCE
    // per createFactory() call (not per song/per initScene()), so this
    // factory's construction-time deps must all exist by now too --
    // _leftyCached/_invertedCached/_scrEventTimes/_scrEventTimesLen are
    // declared right here (moved up from their old spot further down in
    // this closure) instead of where they used to sit inline with the
    // functions that read them. pArpBracket doesn't exist yet at this
    // point (it's built partway through the FIRST initScene() call) --
    // drawArpBrackets reads it through a live getter instead, so that's
    // fine even called this early.
    let _leftyCached = false;
    let _invertedCached = false;
    // Sorted scalar view of "next event time per string ∪ recent event
    // time per string" -- populated once per frame in update() after
    // _drawNextByString and _drawRecentByString are set. Capacity is fixed
    // (Float64Array) to keep the buffer in stable memory; _scrEventTimesLen
    // tracks the live prefix -- see helpers.js's firstEventTimeGreaterThan().
    const _scrEventTimes = new Float64Array(MAX_RENDER_STRINGS * 2);
    let _scrEventTimesLen = 0;
    const {
        validString, filterValidNotes, resetOobStringWarned, resetFilterValidNotesCache,
        xFret, xFretMid, boardSpanX, sY,
        firstEventTimeGreaterThan: _firstEventTimeGreaterThan, drawArpBrackets,
    } = createHelpers({
        ctx,
        getLeftyCached: () => _leftyCached,
        getInvertedCached: () => _invertedCached,
        getNStr: () => nStr,
        getPArpBracket: () => pArpBracket,
        _scrEventTimes,
        getScrEventTimesLen: () => _scrEventTimesLen,
    });
    // Chord/arpeggio/hand-shape inference (chordShapeSignature,
    // mergeHandShapeSynthChords, fillArpeggioGhostInferFlags, ...) now lives
    // in instance/model/chord-inference.js. validString/filterValidNotes are
    // injected rather than imported, since both are nStr-dependent and stay
    // in this closure — see the module's doc comment.
    const chordInference = createChordInference({ validString, filterValidNotes });
    // Arpeggio lane-rail geometry lives in
    // instance/render/arpeggio-lane-rail.js; it bottoms out in chordInference
    // (hsStart/hsEnd/hsChordIdNorm/handShapeMarkedArpeggio), so it's built
    // right after and takes the already-constructed instance.
    const arpeggioLaneRail = createArpeggioLaneRail({ chordInference, validString, filterValidNotes });
    // Reset the validString()/nStr-dependent chord caches. Called when nStr
    // changes so a string count discovered after the first frame (e.g. a
    // 7-string chart whose stringCount arrives in song_info) doesn't leave
    // string-6+ notes filtered out of cached chord shapes/signatures.
    // _chordSigCache/_chordShapeCache now live in chord-inference.js, hence
    // the delegated half of this reset.
    function _resetStringDependentCaches() {
        resetFilterValidNotesCache();
        chordInference.resetStringDependentCaches();
        // chordInference.mergeHandShapeSynthChords() is nStr-dependent too: its synth
        // notes come from chordNotesFromTemplate() -> validString(). The
        // merge cache (now owned by instance/model/arp-and-slide-prepasses.js,
        // memoised by input identity, not nStr) needs the same drop or
        // string-6+ template notes stay dropped from synth chords after the
        // count grows. draw() only calls this after _isReady (initScene()
        // already ran), so arpAndSlidePrepasses is always constructed here.
        arpAndSlidePrepasses.resetMergeCache();
    }

    // ── Per-frame scratch arrays (hoisted to avoid per-frame allocation) ─────
    // Sized to MAX_RENDER_STRINGS / NFRETS+1 — always large enough for any
    // arrangement. We fill only [0..nStr) each frame and reset with .fill().
    // Holding these at closure scope keeps them in a GC root; the engine can
    // keep them hot in L1/L2 across frames, and no allocation pressure from
    // update() itself.
    const _scrStringSustain      = new Array(MAX_RENDER_STRINGS).fill(false);
    const _scrStringAnticipation = new Array(MAX_RENDER_STRINGS).fill(0);
    const _scrFretHeat           = new Array(NFRETS + 1).fill(0);
    // Fret-wire hit flash. _fwHitIn is per-frame (cleared with the rest of
    // the frame state, written by drawNote when a provider confirms a note);
    // _fwHitGlow persists across frames so the flash can decay smoothly
    // rather than snapping off the frame the provider goes quiet.
    const _fwHitIn               = new Float32Array(NFRETS + 1);
    const _fwHitGlow             = new Float32Array(NFRETS + 1);
    // Per-frame chord accumulator. A chord flashes only the OUTERMOST wires
    // of its shape, but drawNote() sees one chord note at a time and can't
    // know the span — so hits accumulate here keyed by chord, and the flash
    // pass (which runs after every draw loop) resolves min/max into wires.
    // Typically 0-2 entries: only chords with a confirmed hit land here.
    const _fwChordAcc            = new Map();
    let _fwHitPrevTime = -Infinity; // chart time of the last decay step
    let _fwHitColor = null;         // T.Color scratch (built in initScene)
    let _fwHitEmissive = null;
    const _scrStrGlow            = new Array(MAX_RENDER_STRINGS).fill(0.5);
    const _scrAccentFillBoost    = new Array(MAX_RENDER_STRINGS).fill(0);
    const _scrLastFretForString  = new Array(MAX_RENDER_STRINGS).fill(undefined);
    // _scrNextNoteByString / _scrNextNoteByStringData / _scrRecentByString /
    // _scrGhostLastT moved to be private state of
    // instance/render/lookahead-prepasses.js -- verified nothing outside
    // that prepass chain referenced them.
    //
    // _scrGhostPrevBuf stays here: it's ALSO handed to note.js/chords.js
    // below as the same Map reference those modules read from later in the
    // same frame, so it can't become private to lookahead-prepasses.js.
    const _scrGhostPrevBuf       = new Map();
    // Per-string count of upcoming-ghost slots (1/2) claimed so far this
    // frame (board ghost — up to 3 simultaneous previews per string).
    // Reset to 0 each frame alongside the other pool .reset() calls.
    const _scrGhostUpcomingCount = new Array(MAX_RENDER_STRINGS).fill(0);
    // Hoisted scratch for the arp-bracket dedupe within a single draw().
    // Keys are `${chordId}:${occurrenceStart}` strings (cheap to build, low
    // cardinality per frame); values are Sets of string-indices that have
    // already drawn brackets in the AHEAD note-stream pass. Cleared at the
    // top of every chord pass so the Set objects (and the outer Map) are
    // reused across frames instead of reallocated.
    const _scrNoteStreamBracketStrings = new Map();
    // _scrChordNote / _scrAtMinFretArr / _scrAtMinFretLen moved to be
    // private state of instance/render/chords.js -- verified nothing
    // outside the Chords loop referenced them.
    // Reusable Set for arpeggio persistence key lookup — cleared each frame
    // instead of reallocating a new Set.
    const _scrArpPersistKeys = new Set();
    // Reusable Set for active-fret cooldown tracking — cleared each frame.
    const _scrActiveFrets = new Set();
    // _scrEventTimes/_scrEventTimesLen (declared above, alongside the rest
    // of instance/helpers.js's construction), _firstEventTimeGreaterThan,
    // and the lefty/invert-aware board math (xFret/xFretMid/boardSpanX/sY)
    // -- all now come from that same createHelpers() destructure.

    // Camera pose, aspect, and bootstrap/lookahead state (tgtX/curX,
    // tgtDist/curDist, tgtLookY/curLookY, _fretRowFitBoost, aspectScale,
    // _paneAspect, prevLowFretBonus, prevLockActive, _camSnapped,
    // _camPreScanned, _camBootstrapHolding, _camBootstrapMode, _songKey,
    // _lookaheadCamX, _lookaheadFretSpan, _lookaheadCamPrevNow,
    // _lookaheadLowBonusU, _lookaheadHiNeckLatch) now lives on `ctx.cam` --
    // see instance/ctx.js's doc comment for why: it's written by
    // camUpdate()/applySize()/the lookahead helpers/_applyNoteCamTargets()/
    // three sections of update(), all needing the SAME live values, not a
    // per-function copy.

    // ── Sub-frame clock smoothing ─────────────────────────────────────
    // bundle.currentTime is the browser's audio.currentTime, which only
    // refreshes every ~20–23 ms — coarser than a 60/144 Hz rAF frame. Fed
    // straight into note Z-positions it makes the whole highway step in
    // micro-jumps (1–2 static frames, then a jump), most visible as a
    // "stutter" across a dense wall of repeated chords even when FPS is
    // steady. smoothNow() interpolates forward with performance.now()
    // between distinct audio samples (mirroring core highway.js
    // getTime()), tracking the observed playback rate so the speed slider
    // stays accurate, and falls back to the raw value on pause / seek /
    // stall so the scroll never drifts against silent audio.
    let _clkAudioT = NaN;   // last distinct bundle.currentTime sample
    let _clkPerf = NaN;     // performance.now() when that sample arrived
    let _clkRate = 1;       // observed chart-seconds per real-second
    let _frameNow = 0;      // smoothed time for THIS frame (update → camUpdate)

    // Low-overdraw sustain rendering (DEFAULT since perf profiling on
    // dense palm-mute / fret-hand-mute passages). Those sections are GPU
    // fill-bound: the transparent sustain trails/rails stack many blended
    // fragments. Profiling (pinned A/B loop) showed ren.render() p50 at
    // ~7.5 ms vs ~5.9 ms with all the sustain extras off. The additive
    // rail bloom halo (wide gaussian planes, additive blending) is the
    // single most expensive per-pixel contributor, so the lean default
    // drops ONLY the bloom. The trail/ribbon white OUTLINE (mSusOutline,
    // with hit/miss colour) is kept — it's a thin, cheap layer and gives
    // tails their border, so it's worth the small fill cost. Opt back into
    // the full look (re-enable the rail bloom) per browser, no rebuild:
    //   localStorage.h3d_full_sus = '1'   // re-enable rail bloom halo
    //   delete localStorage.h3d_full_sus  // back to lean default
    // Polled at ~1 Hz at the top of update() (perf: localStorage reads
    // are synchronous) so the console flag still takes effect live.
    // The bloom pool/material/gaussian texture are kept intact
    // (still pinned by the bloom unit tests and used by the opt-out path).
    let _leanSus = true;
    let _leanSusPollCounter = 0;

    // Lifecycle flags
    let _isReady = false;
    let _destroyed = false;
    let _invertedForBoard = false;
    let _leftyForBoard = false;
    let _initToken = 0;
    let highwayCanvas = null;

    // ── Focus state (splitscreen dim) ─────────────────────────────────
    let _focusSubscribed = false;
    let _isFocused = true;
    const _onFocusChange = () => _updateFocusState();

    function _unsubscribeFocus() {
        if (!_focusSubscribed) return;
        const ss = window.feedBackSplitscreen;
        if (ss && typeof ss.offFocusChange === 'function') ss.offFocusChange(_onFocusChange);
        _focusSubscribed = false;
    }

    function _updateFocusState() {
        if (_destroyed || !_isReady) return;
        const focused = splitscreenCanvasFocused(highwayCanvas);
        if (focused === _isFocused) return;
        _isFocused = focused;
        if (ambLight) ambLight.intensity = focused ? 0.85 : 0.4;
        if (dirLight) dirLight.intensity = focused ? 0.8 : 0.35;
    }

    function _disposeOpenStringPitchSprites() {
        // Tuning-label materials are clones of cached textSprites.txtMat() entries, so
        // they share the .map (CanvasTexture) with the canonical txtCache
        // material. Disposing the map here would invalidate every other
        // material that references the same cached glyph; teardown()'s
        // txtCache loop is the single owner of those textures.
        for (const m of _tuningLabelMats) {
            try { m.dispose(); } catch (_) { /* idempotent */ }
        }
        _tuningLabelMats = [];
        _tuningLabelSprites = [];
        _lastOpenStringLblSig = '';
        if (!tuningLblG) return;
        while (tuningLblG.children.length) tuningLblG.remove(tuningLblG.children[0]);
    }

    function _openStringLabelSignature(bundle, labels) {
        const si = bundle && bundle.songInfo;
        // Same bundle-first preference as _openStringPitchLabelsForTuning.
        let tStr = '';
        if (bundle && Array.isArray(bundle.tuning)) tStr = bundle.tuning.slice(0, labels.length).join(',');
        else if (si && Array.isArray(si.tuning)) tStr = si.tuning.slice(0, labels.length).join(',');
        // Fallback 0 matches _openStringPitchLabelsForTuning, so the
        // signature reflects exactly what was rendered.
        const capo =
            bundle && Number.isFinite(bundle.capo) ? bundle.capo
                : (si && Number.isFinite(si.capo) ? si.capo : 0);
        const arrIdx = si && si.arrangement_index != null ? si.arrangement_index : '';
        let palSig = '';
        const nLab = labels.length;
        if (ctx.settings.activePalette) {
            // activePalette entries are numeric hex (PALETTES) or already hex strings;
            // convert without instantiating T.Color per string — this signature is
            // built every frame inside _syncOpenStringPitchLabels.
            const lim = Math.min(ctx.settings.activePalette.length, nLab);
            for (let i = 0; i < lim; i++) {
                if (i > 0) palSig += '/';
                const c = ctx.settings.activePalette[i];
                palSig += typeof c === 'number' ? (c >>> 0).toString(16) : String(c);
            }
        }
        return `${nStr}|${capo}|${tStr}|${arrIdx}|${labels.join(',')}|${palSig}|${_textSizeMul.toFixed(3)}|${ctx.board.boardStringStartX.toFixed(6)}|${ctx.board.boardTuningLabelX.toFixed(6)}`;
    }

    function _syncOpenStringPitchLabels(bundle) {
        if (!tuningLblG || !T || !bundle) return;
        if (!ctx.settings.tuningLabelsVisible) {
            tuningLblG.visible = false;
            if (_tuningLabelSprites.length) _disposeOpenStringPitchSprites();
            _lastOpenStringLblSig = '';
            return;
        }
        tuningLblG.visible = true;
        // Cheap-key fast path: compare the inputs that drive the label content
        // against last frame. The signature string + labels array build are
        // both per-frame allocators, so skipping them when nothing changed
        // saves a chunk of GC pressure in the hot render loop.
        const si = bundle.songInfo;
        const tunRef = (si && Array.isArray(si.tuning)) ? si.tuning : null;
        const bundleTunRef = Array.isArray(bundle.tuning) ? bundle.tuning : null;
        const capo =
            Number.isFinite(bundle.capo) ? bundle.capo
                : (si && Number.isFinite(si.capo) ? si.capo : 0);
        const arrIdx = si && si.arrangement_index != null ? si.arrangement_index : undefined;
        if (
            _tuningLabelSprites.length === nStr &&
            _lastSyncTuningRef === tunRef &&
            _lastSyncBundleTuningRef === bundleTunRef &&
            Object.is(_lastSyncCapo, capo) &&
            _lastSyncArrIdx === arrIdx &&
            _lastSyncPaletteRef === ctx.settings.activePalette &&
            _lastSyncNStr === nStr &&
            _lastSyncTextSizeMul === _textSizeMul &&
            _lastSyncStartX === ctx.board.boardStringStartX &&
            _lastSyncLabelX === ctx.board.boardTuningLabelX
        ) return;
        // One of the inputs changed — fall through to the canonical signature
        // check (catches value-equal-but-different-ref tuning arrays).
        const labels = _openStringPitchLabelsForTuning(bundle, si, nStr);
        const sig = _openStringLabelSignature(bundle, labels);
        // Refresh cheap-key cache regardless of signature outcome so future
        // frames can fast-path even when the sig matched.
        _lastSyncTuningRef = tunRef;
        _lastSyncBundleTuningRef = bundleTunRef;
        _lastSyncCapo = capo;
        _lastSyncArrIdx = arrIdx;
        _lastSyncPaletteRef = ctx.settings.activePalette;
        _lastSyncNStr = nStr;
        _lastSyncTextSizeMul = _textSizeMul;
        _lastSyncStartX = ctx.board.boardStringStartX;
        _lastSyncLabelX = ctx.board.boardTuningLabelX;
        if (sig === _lastOpenStringLblSig && _tuningLabelSprites.length === nStr) return;
        _disposeOpenStringPitchSprites();
        _lastOpenStringLblSig = sig;
        // Left of nut/cordas — centered on headstock mass so text does not sit on the strings.
        const labelX = ctx.board.boardTuningLabelX;
        const zLabel = -0.08 * K;
        const scalePx = 2.42 * _textSizeMul * K;
        for (let s = 0; s < nStr; s++) {
            const hex = '#' + new T.Color(ctx.settings.activePalette[s % ctx.settings.activePalette.length]).getHexString();
            const mat = textSprites.txtMat(labels[s] || '?', hex, false, 'noteFret').clone();
            mat.depthTest = false;
            mat.depthWrite = false;
            mat.transparent = true;
            const sp = new T.Sprite(mat);
            sp.center.set(0, 0.5);
            sp.scale.set(scalePx, scalePx, 1);
            sp.position.set(labelX, sY(s), zLabel);
            sp.renderOrder = 8;
            tuningLblG.add(sp);
            _tuningLabelSprites.push(sp);
            _tuningLabelMats.push(mat);
        }
    }

    // ── Object pool ────────────────────────────────────────────────────
    // ── Opt-in perf bench harness (feedBack#226) ──────────────────────
    // Enable with `?h3dbench=1` on the player URL. Aggregates per-segment
    // timings of update() into a console.log every _PB_REPORT_MS.
    //
    // When the bench is OFF, pbBeg/pbEnd/pbReportTick are bound to a
    // single shared empty function literal when this renderer
    // instance is created (createHighway() runs once per panel, not
    // once per module load) — V8 typically inlines empty bodies and
    // the call sites have minimized overhead in the hot path.
    // (Previously they had `if (!_perfBench) return;` guards, which
    // still cost a function-call frame per mark site per frame;
    // Copilot review on #413.) Inlining is a JIT heuristic, not a
    // language guarantee.
    const _perfBench = (() => {
        try { return new URLSearchParams(location.search).get('h3dbench') === '1'; }
        catch (_) { return false; }
    })();
    let pbBeg, pbEnd, pbReportTick;
    if (_perfBench) {
        const _PB_NAMES = ['frame', 'state', 'next', 'mat', 'noteDraw', 'chordDraw', 'render'];
        const _pbStart = new Float64Array(_PB_NAMES.length);
        const _pbAcc = _PB_NAMES.map(() => []);
        const _PB_REPORT_MS = 5000;
        let _pbReportStart = 0;
        let _pbFrameCount = 0;
        pbBeg = function pbBeg(idx) { _pbStart[idx] = performance.now(); };
        pbEnd = function pbEnd(idx) {
            _pbAcc[idx].push(performance.now() - _pbStart[idx]);
        };
        pbReportTick = function pbReportTick() {
            const now = performance.now();
            if (_pbReportStart === 0) {
                // First call: discard the sample(s) that already
                // landed in _pbAcc from the very first frame's
                // pbEnd() calls, so fps and segment stats span the
                // same frame set on every reported window.
                _pbReportStart = now;
                _pbFrameCount = 0;
                for (let i = 0; i < _PB_NAMES.length; i++) _pbAcc[i].length = 0;
                return;
            }
            _pbFrameCount++;
            if (now - _pbReportStart < _PB_REPORT_MS) return;
            const dur = now - _pbReportStart;
            const fps = (_pbFrameCount / dur * 1000).toFixed(1);
            const parts = [];
            for (let i = 0; i < _PB_NAMES.length; i++) {
                const arr = _pbAcc[i];
                if (!arr.length) { parts.push(`${_PB_NAMES[i]}=-`); continue; }
                arr.sort((a, b) => a - b);
                const n = arr.length;
                // Nearest-rank: ceil(p · n) - 1, clamped to [0, n-1].
                // Avoids the off-by-one where Math.floor(n * 0.95)
                // returns the last element (effectively the max)
                // for small samples (e.g. n=20 → idx 19).
                const p50 = arr[Math.max(0, Math.ceil(0.50 * n) - 1)];
                const p95 = arr[Math.max(0, Math.ceil(0.95 * n) - 1)];
                const mx = arr[n - 1];
                parts.push(`${_PB_NAMES[i]} p50=${p50.toFixed(2)} p95=${p95.toFixed(2)} max=${mx.toFixed(2)}`);
                arr.length = 0;
            }
            console.log(`[h3dbench] ${fps}fps (${_pbFrameCount} frames) over ${(dur/1000).toFixed(1)}s — ${parts.join(' | ')}`);
            _pbReportStart = now;
            _pbFrameCount = 0;
        };
    } else {
        pbBeg = pbEnd = pbReportTick = function () {};
    }

    // Cached wrapper for drawChordDiagram -- see
    // instance/overlay/chord-diagram.js's createChordDiagramCache().

    /* ── Scene initialisation ─────────────────────────────────────────── */
    function initScene() {
        if (!highwayCanvas || !highwayCanvas.parentNode) {
            console.error('[3D-Hwy] initScene: canvas has no parent; aborting');
            return false;
        }

        // Reset per-song lane state
        fretLastActiveTime.fill(0);

        // The wrap <div>, WebGL renderer, context-loss handlers, lyrics
        // overlay canvas, and scene/camera/lights -- see
        // instance/geometry/dom-and-scene.js. Not construction-time-only
        // like the other initScene() clusters: the visibility/canvas-
        // replaced listeners it creates outlive this call, so
        // highwayCanvas/_ctxLost are threaded through as live getters/
        // setters rather than plain deps values.
        ({
            wrap, ren, _probe, _onCtxLost, _onCtxRestored, lyricsCanvas, lyricsCtx,
            scene, cam, ambLight, dirLight, _visibilityHandler, _canvasReplacedHandler,
        } = createDomAndScene({
            _instanceId,
            getHighwayCanvas: () => highwayCanvas,
            setHighwayCanvas: (c) => { highwayCanvas = c; },
            setCtxLost: (v) => { _ctxLost = v; },
            butterchurnModeActive,
            // Proxy, not the bare function: cameraLifecycle (which owns the
            // real applySize()) is constructed just below, AFTER this
            // destructure runs (it needs cam/ren/wrap/lyricsCanvas). Safe
            // because _onCtxRestored (the only caller reached through this
            // dep) never fires until long after initScene() has returned.
            applySize: (w, h) => cameraLifecycle.applySize(w, h),
        }));
        // _applyCinematic() reads ambLight/dirLight from THIS closure's
        // `let`s -- must run after the destructure above, not inside the
        // factory (see dom-and-scene.js's doc comment).
        _applyCinematic();

        // camUpdate()/applySize() -- see instance/render/camera-lifecycle.js.
        cameraLifecycle = createCameraLifecycle({
            ctx, cam, _probe, wrap, ren, lyricsCanvas, chordDiagramCache, sY, _paneUid,
            getHighwayCanvas: () => highwayCanvas,
            getNStr: () => nStr,
            getLeftyCached: () => _leftyCached,
            getRenderScale: () => _renderScale,
        });

        // Score FX (notedetect game-scoring layer) -- see
        // instance/render/score-fx.js. Constructed here (before note.js's
        // construction below, which injects scoreFx.fxSpawnPop as a dep,
        // and before the notedetect listener setup further down, which
        // injects scoreFx.fxHandle/fxResolvePalette/getFxGen).
        scoreFx = createScoreFx({
            ctx, getCam: () => cam, getProbe: () => _probe, sY, getNStr: () => nStr,
            noteDetectLabels, getNoteDetectFrameNowMs: () => noteDetectFrameNowMs,
        });

        // Per-frame chord-verdict Map pruning -- see
        // instance/notedetect/verdict-prune.js.
        verdictPrune = createVerdictPrune({
            scoreFx, _chordVerdicts, _susVerdictLatch, _CV_KEY_TIME_MUL, _CV_KEY_TIME_SLOT,
            noteDetectHitMarks, noteDetectMissMarks,
        });

        bloomComposer = createBloomComposer({
            getRenderer: () => ren, getScene: () => scene, getCamera: () => cam,
            canvasSize, getHighwayCanvas: () => highwayCanvas,
        });

        nutHeadstockBuilder = createNutHeadstockBuilder({ ctx });
        fretMarkersBuilder = createFretMarkersBuilder({ ctx, xFret, xFretMid, textSprites });

        backgroundMount = createBackgroundMount({
            ctx, butterchurnModeActive, loadSettings,
            getWrap: () => wrap, getRen: () => ren, getScene: () => scene,
            getCam: () => cam, getAmbLight: () => ambLight,
            getHighwayCanvas: () => highwayCanvas,
            getBgGroup: () => bgGroup,
            getMLaneOdd: () => mLaneOdd, getMLaneEven: () => mLaneEven,
            getLaneTargetColor: () => _laneTargetColor,
            setLaneTargetColor: (v) => { _laneTargetColor = v; },
            getBcCtrl: () => bcCtrl, setBcCtrl: (v) => { bcCtrl = v; },
            setBackgroundLastT: (v) => { backgroundLastT = v; },
        });

        fretG = new T.Group(); scene.add(fretG);
        tuningLblG = new T.Group(); scene.add(tuningLblG);
        noteG = new T.Group(); scene.add(noteG);
        // Hit sparks (#3) -- see instance/render/hit-sparks.js. A pooled
        // additive Points cloud; a small burst fires at a gem on a verified
        // hit (spawned in the verdict block, advanced in the render loop).
        ({ sparkPts: _sparkPts, sparkBurst: _sparkBurst, sparkUpdate: _sparkUpdate } = createHitSparks({ scene }));
        beatG = new T.Group(); scene.add(beatG);
        lblG = new T.Group(); scene.add(lblG);

        // Live palette/vibrancy/glow material-retint passes -- see
        // instance/render/material-retint.js. Constructed HERE, before
        // createNoteGemVisuals() below, because that factory takes
        // materialRetint.recolorGemGradients as its own `_recolorGemGradients`
        // construction-time dep (calls it once during construction, same
        // as the pre-move bare-function-reference behavior) -- at this
        // point in initScene() none of the material arrays below exist
        // yet, so every one of materialRetint's deps is a live getter,
        // not a plain value (see that file's doc comment).
        materialRetint = createMaterialRetint({
            ctx, noteVerdictState,
            getMStr: () => mStr, getMGlow: () => mGlow, getMSus: () => mSus,
            getMRimFlash: () => mRimFlash, getMStrHitOutline: () => mStrHitOutline,
            getMAccentOutline: () => mAccentOutline, getMAccentCore: () => mAccentCore,
            getMAccentHaloNear: () => mAccentHaloNear, getMAccentHaloMid: () => mAccentHaloMid,
            getMAccentHaloFar: () => mAccentHaloFar, getProjMeshArr: () => projMeshArr,
            getGNoteGrad: () => gNoteGrad,
            getMWhiteOutline: () => mWhiteOutline, getMMissOutline: () => mMissOutline,
            getMHitBright: () => mHitBright, getMSusOutline: () => mSusOutline,
            getMHitSusOutline: () => mHitSusOutline,
            getMTapChevron: () => mTapChevron, getMBarre: () => mBarre,
        });

        // Note-gem geometry + every gem/outline/sustain-trail material -- see
        // instance/geometry/note-gem-visuals.js.
        ({
            gNote, gNoteGrad, gSus, gBeat, gTapChevron, mkGhostFrameGeometry,
            mStr, mGlow, mSus, mWhiteOutline, mStrHitOutline, mAccentOutline, mAccentCore,
            mAccentHaloNear, mAccentHaloMid, mAccentHaloFar, _accentShellsByString,
            gHaloBar, pHaloBar, mMissOutline, mEdgeTransparent, mMissEdgeArrays,
            mHitBright, mHitBrightArrays, mRimFlash, mSusOutline, mHitSusOutline,
            mBeatM, mBeatQ, _laneTargetColor, _fwHitColor, _fwHitEmissive,
        } = createNoteGemVisuals({
            activePalette: ctx.settings.activePalette, glowMul: ctx.settings.glowMul, noteG,
            _recolorGemGradients: materialRetint.recolorGemGradients, _ownedSharedGeos, gHaloBar,
        }));
        _fwHitGlow.fill(0);
        _fwHitPrevTime = -Infinity;

        // Board projection ghost frames -- see instance/geometry/note-gem-pools.js.
        ({ projMeshArr } = createBoardGhostFrames({ noteG, activePalette: ctx.settings.activePalette, mkGhostFrameGeometry }));

        // ── Pools ──────────────────────────────────────────────────────
        // Note/sustain/slide-ribbon pools -- see instance/geometry/note-gem-pools.js.
        ({
            pNote, pNoteEdge, pAccentHalo, pSus, pSusOutline, pSusRibbon, pSusRibbonOl,
        } = createNoteGemPools({ noteG, gNote, mStr, mEdgeTransparent, mAccentHaloFar, gSus, mSus, mSusOutline }));
        // Tap-chevron material + label/beat/section pools -- see
        // instance/geometry/tap-chevron-and-label-pools.js.
        ({ mTapChevron, pTapChevron, pLbl, pBeat, pSec } = createTapChevronAndLabelPools({
            noteG, lblG, beatG, textSprites, gTapChevron, gBeat, mBeatQ,
        }));

        // Sustain rail (core + bloom) + technique-marker plane pool -- see
        // instance/geometry/sustain-rail.js.
        ({
            gSusRail, mSusRailBase, pSusRail,
            _bloomGaussTex, gSusRailBloom, mSusRailBloomBase, pSusRailBloom,
            gTechPlane, pTechPlane,
        } = createSustainRailVisuals({ noteG }));

        // InstancedMesh scratch objects + PM/FH tech marker InstancedMeshes --
        // see instance/geometry/technique-instanced-meshes.js.
        ({
            _imM4, _imPos, _imSca, _imQ, _imAZ, _imColor,
            imPMTech, _imGPMTech, _imPMTechMat, imFHTech, _imGFHTech, _imFHTechMat,
        } = createTechniqueInstancedMeshes({
            noteG, gTechPlane, textSprites, IM_TECH_CAP, _imPMTechAlphaArr, _imFHTechAlphaArr,
        }));

        // Fret-number-row label pool, highway lane plane, and ghost fret
        // label pool -- see instance/geometry/lane-and-labels.js.
        ({
            pFretLbl, gLanePlane, mLaneOdd, mLaneEven, pLane, gGhostFretPlane, pGhostFretLbl,
        } = createHighwayLanePlane({ noteG, lblG, textSprites, _ownedSharedMats, _ownedSharedGeos }));

        // Lane fret dividers -- see instance/geometry/lane-and-labels.js.
        ({
            mLaneDivider, mLaneDividerArp, mLaneDividerExt, pLaneDivider,
        } = createLaneDividers({ noteG, _ownedSharedMats }));

        // Chord/arpeggio frame gradient textures, PM/FH strum X fill+lines
        // (IM + pool forms), and the remaining chord/note-label/connector-line
        // pools -- see instance/geometry/chord-accent-visuals.js.
        ({
            chordFrameGradTex, chordFrameGradTexArp, pChordFrameFill, pChordBox,
            gPMXFill, imPMXFill, _imPMXFillMat, gFHXFill, imFHXFill, _imFHXFillMat,
            gPMXLines, imPMXLines, _imPMXLinesMat, gFHXLines, imFHXLines, _imFHXLinesMat,
            pPMXFill, pFHXFill, pMuteXLines, pFHXLines,
            pChordLbl, mBarre, pBarreLine, gArpBracket, pArpBracket,
            pNoteFretLabel, pTeachMarkLbl, pConnectorLine, pDropLine,
        } = createChordAccentVisuals({
            noteG, lblG, textSprites, glowMul: ctx.settings.glowMul, _imColor, IM_STRUM_CAP,
            _imPMXFillAlphaArr, _imFHXFillAlphaArr, _imPMXLinesAlphaArr, _imFHXLinesAlphaArr,
            gPMXLines, gFHXLines, gArpBracket,
        }));

        // Fret-column reference markers (visual cue for X-position to fret-number).
        // Each sprite gets its own clone so the per-frame material.map swap
        // (dark vs light grey) doesn't poison neighbours sharing the same
        // cached texture map.
        // fog:false prevents the scene fog from gradually dimming the sprite
        // as it enters the far end of the highway — opacity is managed
        // manually with a short fade-in so the number appears at its
        // final size the moment it becomes visible rather than seeming to
        // emerge from a tiny dim spec at the horizon.
        // Fret-column reference marker pool -- see instance/geometry/lane-and-labels.js.
        ({ pFretColMarker } = createFretColumnMarkerPool({ lblG, textSprites }));

        POOL_REGISTRY = {
            pNote, pNoteEdge, pAccentHalo, pSus, pSusOutline, pSusRibbon, pSusRibbonOl,
            pTapChevron, pLbl, pBeat, pSec, pSusRail, pSusRailBloom, pTechPlane,
            pFretLbl, pLane, pGhostFretLbl, pLaneDivider, pChordFrameFill, pChordBox,
            pPMXFill, pFHXFill, pMuteXLines, pFHXLines, pChordLbl, pBarreLine, pArpBracket,
            pNoteFretLabel, pTeachMarkLbl, pConnectorLine, pDropLine, pFretColMarker, pHaloBar,
        };

        // (Re)build the note renderer now that every material/pool it wraps
        // exists for this init. Field names match the closure variables 1:1
        // (object shorthand) -- see note.js's doc comment for the two
        // dependency tiers and why each field lives in `deps` vs `frame`.
        noteRenderer = createNoteRenderer({
            gNote, gNoteGrad, mStr, mGlow, mSus, mStrHitOutline, mAccentOutline, mAccentCore,
            mAccentHaloNear, _accentShellsByString, mWhiteOutline, mSusOutline, mHitSusOutline,
            mMissOutline, mHitBright, mHitBrightArrays, mRimFlash, _rimFlashIn, mMissEdgeArrays,
            pSusOutline, pNoteEdge, pTechPlane, pNote, pSus, pGhostFretLbl, pNoteFretLabel,
            pConnectorLine, pDropLine, pTapChevron, pAccentHalo, pTeachMarkLbl, pSusRibbon,
            pSusRibbonOl,
            projMeshArr, _frameLabeledKeys, _susVerdictLatch, _fwHitIn, _fwChordAcc,
            _scrGhostUpcomingCount, _techMeshMatClones, _sparkSeen,
            NOTEDETECT_TIME_EPS, noteDetectHitMarks, noteDetectMissMarks, noteDetectLabels,
            textSprites, techMaterials,
            validString, _setLabelMap: setLabelMap, _firstEventTimeGreaterThan, _fxSpawnPop: scoreFx.fxSpawnPop, _sparkBurst,
            xFretMid, sY,
            noteVerdictState,
        });

        beatAndSectionLabels = createBeatAndSectionLabels({
            pBeat, mBeatM, mBeatQ, pSec, textSprites, boardSpanX, sY, xFret,
        });

        chordRenderer = createChordRenderer({
            pChordBox, pChordFrameFill, pChordLbl, pBarreLine, pArpBracket, pNoteFretLabel,
            pPMXFill, pFHXFill, pMuteXLines, pFHXLines, pHaloBar, pSusRail, pSusRailBloom,
            chordFrameGradTex, chordFrameGradTexArp,
            textSprites, chordInference, noteRenderer,
            validString, filterValidNotes, lowerBoundT, anchorLaneBoundsAt, getChartAnchorAt,
            _firstEventTimeGreaterThan, xFret, xFretMid, sY, _setLabelMap: setLabelMap,
            drawArpBrackets, ctx, _encodeChordVerdictKey,
            _chordVerdicts,
            _noteStreamBracketStrings: _scrNoteStreamBracketStrings,
            _ghostPrevBuf: _scrGhostPrevBuf,
        });

        singleNoteRenderer = createSingleNoteRenderer({
            noteRenderer, arpeggioLaneRail, validString, xFret, xFretMid, sY,
            drawArpBrackets, ctx,
            _ghostPrevBuf: _scrGhostPrevBuf,
            _noteStreamBracketStrings: _scrNoteStreamBracketStrings,
            _frameLabeledKeys,
        });

        highwayLane = createHighwayLane({
            pLane, pLaneDivider, mLaneOdd, mLaneEven, mLaneDivider, mLaneDividerArp, mLaneDividerExt,
            xFret, arpeggioLaneRail, arpeggioLaneDividerXYScaleMatchFrameRim,
        });

        fretColumnMarkers = createFretColumnMarkers({
            pFretColMarker, textSprites, _setLabelMap: setLabelMap, sY, xFretMid, validString, _fretMarkerWaveCache,
        });

        lookaheadMath = createLookaheadMath({
            ctx, xFret, xFretMid, validString, getMeasureStarts: () => _measureStarts,
        });

        noteCameraTargets = createNoteCameraTargets({ ctx, xFretMid, camBaseDistU, camLowFretPullbackU });

        cameraTarget = createCameraTarget({
            ctx, xFretMid, _applyNoteCamTargets: noteCameraTargets.applyNoteCamTargets,
            camLowFretPullbackU, camBaseDistU,
            lookaheadSmoothCamStep: lookaheadMath.lookaheadSmoothCamStep,
            lookaheadTargetWorldX: lookaheadMath.lookaheadTargetWorldX,
        });

        fretNumberRow = createFretNumberRow({ pFretLbl, textSprites, sY, xFretMid });

        fretWireHitFlash = createFretWireHitFlash({
            ctx, _fwHitColor, _fwHitEmissive, _fwHitIn, _fwHitGlow, _fwChordAcc, mRimFlash, _rimFlashIn,
        });

        cameraBootstrap = createCameraBootstrap({
            ctx, xFretMid, camBaseDistU, camLowFretPullbackU,
            lookaheadBootstrapTime: lookaheadMath.lookaheadBootstrapTime,
            lookaheadComputeFretBounds: lookaheadMath.lookaheadComputeFretBounds,
            lookaheadTargetWorldX: lookaheadMath.lookaheadTargetWorldX,
            _applyNoteCamTargets: noteCameraTargets.applyNoteCamTargets, validString, filterValidNotes,
        });

        arpAndSlidePrepasses = createArpAndSlidePrepasses({ chordInference, arpeggioLaneRail, _scrArpPersistKeys });

        frameState = createFrameState({
            validString, filterValidNotes, ctx, mGlow, mAccentCore,
            _scrStringSustain, _scrStringAnticipation, _scrFretHeat, _scrStrGlow, _scrAccentFillBoost,
        });

        lookaheadPrepasses = createLookaheadPrepasses({ validString, filterValidNotes, _scrGhostPrevBuf });

        // ── Pre-warm pools (feedBack#226) ─────────────────────────────
        // Dense 7/8-string charts can outrun the lazy-grow path in the
        // first 1-2s of playback, stalling those frames with `new T.Mesh`
        // allocations *and* growing noteG forever (the pool only hides on
        // reset). Pay the cost up front instead.
        //
        // Trade-off: pre-warming attaches the same meshes to noteG even
        // on 4/6-string charts that may never use them all. The cost is
        // paid at boardInit (during the load spinner — wall-clock time
        // users were already waiting on), so the steady-state win on
        // playback FPS is worth the init-time scene-graph footprint.
        // Caps sized for a typical visible-window worst case (NOT the
        // theoretical max across MAX_RENDER_STRINGS); lazy growth past
        // the warm cap still works for genuinely dense outliers.
        const _WARM_NOTE = 48;
        const _WARM_CHORD = 12;
        const _WARM_LANE = 32;
        const _WARM_BEAT = 24;
        pNote.warm(_WARM_NOTE);
        pNoteEdge.warm(_WARM_NOTE);
        pAccentHalo.warm(_WARM_NOTE);
        pSus.warm(_WARM_NOTE);
        pSusOutline.warm(_WARM_NOTE);
        pSusRibbon.warm(_WARM_NOTE / 2);
        pSusRibbonOl.warm(_WARM_NOTE / 2);
        pTapChevron.warm(_WARM_CHORD);
        pLbl.warm(_WARM_NOTE);
        pSusRail.warm(_WARM_CHORD);
        pSusRailBloom.warm(_WARM_CHORD);
        pTechPlane.warm(_WARM_CHORD);
        pNoteFretLabel.warm(_WARM_NOTE);
        pTeachMarkLbl.warm(_WARM_NOTE);
        pChordFrameFill.warm(_WARM_CHORD);
        pChordBox.warm(_WARM_CHORD);
        pChordLbl.warm(_WARM_CHORD);
        pBarreLine.warm(_WARM_CHORD);
        pArpBracket.warm(_WARM_CHORD);
        pHaloBar.warm(_WARM_CHORD);
        pFretLbl.warm(_WARM_LANE);
        pLane.warm(_WARM_LANE * 2);  // anchor-driven lanes × time slices
        pLaneDivider.warm(_WARM_LANE);
        pGhostFretLbl.warm(_WARM_LANE);
        pFretColMarker.warm(_WARM_LANE);
        pConnectorLine.warm(_WARM_NOTE / 2);
        pDropLine.warm(_WARM_NOTE / 2);
        pBeat.warm(_WARM_BEAT);
        pSec.warm(8);

        loadSettings();
        buildBoard();
        // Apply the scene color theme now that settings + board exist. Sets
        // the clear color + fog tint (board plane was themed in buildBoard).
        // For the default theme this is identical to the hardcoded values
        // initScene seeded above, so nothing changes for existing users.
        backgroundMount.applyBgTheme();

        // Background animations (#13). Read settings keyed by this
        // panel and mount the active style's meshes. Subscribe to
        // in-app settings changes (settings.html via window.h3dBgSet*)
        // so they propagate without a reload. Manual localStorage
        // edits don't fire the pub-sub and require a reload.
        // Push the freshly-loaded vibrancy/glow values into the
        // materials. loadSettings only triggers a palette re-apply
        // when the palette ID actually changed, so a fresh-init user
        // on the default palette would otherwise keep the hardcoded
        // construction-time material values until they touched a
        // slider.
        materialRetint.applyVibrancy();
        materialRetint.applyGlow();
        // inlayLabelsVisible was applied before buildBoard() via loadSettings.
        bgGroup = new T.Group();
        // Note: renderOrder on a Group is a no-op (Three.js Groups
        // are transforms, not rendered objects, so renderOrder only
        // affects the actual meshes inside). mountBackgroundStyle stamps
        // renderOrder = -1 on every child after build, which IS what
        // forces background to render before gameplay geometry.
        // Combined with the deeper-than-note-range placements below,
        // background never paints over notes.
        scene.add(bgGroup);
        backgroundMount.mountBackgroundStyle();
        // The live settings-bus subscriber -- see instance/settings-listener.js.
        // Threaded through as live getters/setters, not plain deps values --
        // see that file's doc comment for why (loadSettings() reassigns most
        // of what this reads, from inside several of its own branches).
        settingsListener = createSettingsListener({
            getFretG: () => fretG, buildBoard, loadSettings, ctx,
            setLastOpenStringLblSig: (v) => { _lastOpenStringLblSig = v; },
            getTuningLabelSprites: () => _tuningLabelSprites,
            _disposeOpenStringPitchSprites,
            _applyVibrancy: materialRetint.applyVibrancy, _applyGlow: materialRetint.applyGlow,
            rebuildBackground: backgroundMount.rebuildBackground,
            _applyBgTheme: backgroundMount.applyBgTheme,
            getBgState: backgroundMount.getBgState,
            effectiveBackgroundStyleId: backgroundMount.effectiveBackgroundStyleId,
        });
        subscribeToSettings(settingsListener);

        // Notedetect feedback (#9) + Score FX listener setup -- see
        // instance/notedetect/listeners.js for the full doc comment. Moved
        // here (Stage 7 Phase 3c) as the first initScene()/teardown() slice;
        // getFxGen/getHighwayCanvas are live getters, not plain values,
        // because the listeners this creates outlive this call and must see
        // _fxGen/highwayCanvas as they are at EVENT-fire time, not at
        // listener-creation time.
        ({
            noteDetectOnHit, noteDetectOnMiss, noteDetectOnBusHit, noteDetectOnBusMiss,
            _fxOnFx, _fxOnSkin,
        } = createNotedetectListeners({
            noteDetectHitMarks, noteDetectMissMarks, _fxElemSeen,
            NOTEDETECT_TIME_EPS, NOTEDETECT_TTL_MS,
            _fxHandle: scoreFx.fxHandle, _fxResolvePalette: scoreFx.fxResolvePalette,
            getFxGen: scoreFx.getFxGen,
            getHighwayCanvas: () => highwayCanvas,
        }));

        return true;
    }

    function loadSettings() {
        const panelKey = settingsPanelKey(highwayCanvas);
        // Every setting that's a direct, unconditional copy into
        // ctx.settings with no follow-on logic -- see settings/defaults.js's
        // LOAD_SETTINGS_SIMPLE_KEY_TO_FIELD doc comment for the full list of
        // keys this excludes and why. Safe to run before every special case
        // below: each of those only ever reads a field this loop already
        // set (bgStyleId, bgThemeId, cameraSmoothing, vibrancy), never the
        // reverse.
        for (const key in LOAD_SETTINGS_SIMPLE_KEY_TO_FIELD) {
            ctx.settings[LOAD_SETTINGS_SIMPLE_KEY_TO_FIELD[key]] = readSetting(panelKey, key);
        }
        // Per-render opt-out (captured from the mount bundle in init): force
        // the reactive background off for THIS instance, overriding the shared
        // setting without writing it back. Re-applied here so it sticks across
        // setting reloads.
        if (backgroundReactiveOptOut) ctx.settings.bgReactive = false;
        if (ctx.settings.bgStyleId === 'butterchurn') ctx.settings.bgReactive = false; // Butterchurn owns the <audio> tap
        const newPaletteId = readSetting(panelKey, 'palette');
        let newPalette;
        if (newPaletteId === 'custom') {
            // Resolve user colors into the stable _customPalette array,
            // mutated in place so the reference identity is preserved.
            let stored = null;
            const raw = readSetting(panelKey, 'customColors');
            if (typeof raw === 'string') { try { stored = JSON.parse(raw); } catch (_) { /* corrupt */ } }
            for (let i = 0; i < _customPalette.length; i++) {
                const v = Array.isArray(stored) ? _h3dHexToInt(stored[i]) : null;
                _customPalette[i] = (v != null) ? v : PALETTES.default[i];
            }
            newPalette = _customPalette;
        } else {
            newPalette = PALETTES[newPaletteId] || PALETTES.default;
        }
        // Signature guards the in-place custom case: when the user edits a
        // color the reference stays === activePalette, so compare contents
        // too to force a retint. backgroundPaletteSig caches the applied colors.
        const newSig = newPalette.join(',');
        if (newPalette !== ctx.settings.activePalette || newSig !== ctx.settings.backgroundPaletteSig) {
            ctx.settings.activePalette = newPalette;
            ctx.settings.backgroundPaletteSig = newSig;
            materialRetint.applyPaletteToMaterials();
        }
        // Highway axis. ONE-TIME BACKWARD-COMPAT BACKFILL: the first time we
        // load with no stored hwTheme (pre-split installs, or anyone who only
        // ever touched the old single "Scene colors" control), seed hwTheme
        // FROM the background pick AND PERSIST it, so an existing 'cathode'
        // selection looks byte-identical right after the upgrade. Persisting
        // immediately (rather than re-inheriting on every read) is what keeps
        // the two axes truly INDEPENDENT thereafter: once hwTheme is stored,
        // changing the Background dropdown no longer drags the Highway
        // surface along, and the settings UI's Highway value can never
        // disagree with what's rendered. Written without emitSettingChange so the
        // backfill can't re-enter the change listener.
        if (hasStoredSetting(panelKey, 'hwTheme')) {
            ctx.settings.hwThemeId = readSetting(panelKey, 'hwTheme');
        } else {
            ctx.settings.hwThemeId = ctx.settings.bgThemeId;
            settingsMemFallback.hwTheme = String(ctx.settings.bgThemeId);
            try { localStorage.setItem('h3d_bg_hwTheme', String(ctx.settings.bgThemeId)); } catch (_) { /* storage blocked — mem fallback still seeds the read */ }
        }
        // Mirror-at-first-read: zoom + tilt sliders inherit cameraSmoothing
        // when the user has never explicitly written them. Once the user
        // moves either slider, the corresponding hasStoredSetting() flips
        // true and the read becomes independent.
        ctx.settings.zoomSmoothing = hasStoredSetting(panelKey, 'zoomSmoothing')
            ? readSetting(panelKey, 'zoomSmoothing')
            : ctx.settings.cameraSmoothing;
        ctx.settings.tiltSmoothing = hasStoredSetting(panelKey, 'tiltSmoothing')
            ? readSetting(panelKey, 'tiltSmoothing')
            : ctx.settings.cameraSmoothing;
        _applyCinematic();
        ctx.settings._vibrancyIdleOp = 0.4  + 0.6  * ctx.settings.vibrancy;
        ctx.settings._vibrancyProjOp = 0.15 + 0.35 * ctx.settings.vibrancy;
        // Custom image asset is a single GLOBAL slot — bytes are
        // shared across panels (per-panel choice is which style
        // each panel renders, not which asset). Reading via
        // readSetting would let a stray h3d_bg_panel<idx>_*
        // override silently re-introduce the per-panel asset
        // duplication this design deliberately avoids (and
        // h3dBgClearCustomImage wouldn't reach those overrides).
        // Read globals directly instead.
        //
        // Precedence: in-memory fallback BEFORE localStorage. The
        // setter always populates settingsMemFallback (even when the
        // localStorage write fails on quota), so the fallback
        // holds the most-recent staged value. Reading localStorage
        // first would mean a failed write leaves the renderer
        // pointed at the previous asset while settings.html shows
        // a "session-only" warning claiming the new bytes are in
        // effect — UI and renderer would silently disagree.
        const memDataUrl = settingsMemFallback.customImageDataUrl;
        const memName    = settingsMemFallback.customImageName;
        try {
            const gDataUrl = (memDataUrl !== undefined) ? memDataUrl : localStorage.getItem('h3d_bg_customImageDataUrl');
            const gName    = (memName    !== undefined) ? memName    : localStorage.getItem('h3d_bg_customImageName');
            ctx.settings.bgCustomImageDataUrl = (gDataUrl != null) ? gDataUrl : SETTING_DEFAULTS.customImageDataUrl;
            ctx.settings.bgCustomImageName    = (gName    != null) ? gName    : SETTING_DEFAULTS.customImageName;
        } catch (_) {
            ctx.settings.bgCustomImageDataUrl = (memDataUrl !== undefined) ? memDataUrl : SETTING_DEFAULTS.customImageDataUrl;
            ctx.settings.bgCustomImageName    = (memName    !== undefined) ? memName    : SETTING_DEFAULTS.customImageName;
        }
        // Custom video filename: also a single global slot, same
        // mem-first precedence as the image keys (a quota-failed
        // setItem leaves settingsMemFallback ahead of localStorage).
        const memVideoName = settingsMemFallback.customVideoName;
        try {
            const gVideoName = (memVideoName !== undefined) ? memVideoName : localStorage.getItem('h3d_bg_customVideoName');
            ctx.settings.bgCustomVideoName = (gVideoName != null) ? gVideoName : SETTING_DEFAULTS.customVideoName;
        } catch (_) {
            ctx.settings.bgCustomVideoName = (memVideoName !== undefined) ? memVideoName : SETTING_DEFAULTS.customVideoName;
        }
    }
    // _applyPaletteToMaterials/_recolorGemGradients/_applyVibrancy/_applyGlow
    // -- see instance/render/material-retint.js.
    // effectiveBackgroundStyleId/syncButterchurnMode/mountBackgroundStyle/
    // unmountBackgroundStyle/rebuildBackground/applyVenueSceneFog/_applyBgTheme
    // -- see instance/background-mount.js.
    // The 'butterchurn' bg-style renders a WebGL MilkDrop canvas BEHIND a
    // transparent highway via the self-contained butterchurn/ controller module,
    // NOT a Three.js fog-scenery style (its scenery falls back to 'off'). Mount
    // is idempotent and driven by the bg-style dropdown through mountBackgroundStyle.
    function butterchurnModeActive() { return ctx.settings.bgStyleId === 'butterchurn'; }

    /* ── Fretboard (static geometry) ────────────────────────────────── */
    // Cinematic lighting (#2): darken ambient so emissive gems have a dark
    // surround to pop against; strengthen the key light for modelling.
    // Toggle via the 'cinematic' setting so it's directly comparable.
    function _applyCinematic() {
        if (!ambLight || !dirLight) return;
        ambLight.intensity = ctx.settings._cinematic ? 0.45 : 0.85;
        dirLight.intensity = ctx.settings._cinematic ? 1.15 : 0.8;
    }
    function buildBoard() {
        // Dispose before clearing (traverse: nut/headstock may live in a Group).
        while (fretG.children.length) {
            const child = fretG.children[0];
            child.traverse((o) => {
                if (o instanceof T.Sprite) return;
                // ctx.board.fretTubeGeo is shared across all fret meshes — disposing it
                // per-mesh here would fire one redundant dispose event per
                // fret. Skip it; it's disposed exactly once below.
                if (o.geometry !== ctx.board.fretTubeGeo) o.geometry?.dispose?.();
                const mat = o.material;
                if (mat) {
                    const mats = Array.isArray(mat) ? mat : [mat];
                    for (const m of mats) m?.dispose?.();
                }
            });
            fretG.remove(child);
        }
        ctx.board.stringLines = [];
        ctx.board.stringLineGlows = [];
        // Fret wire materials were already disposed by the child.traverse()
        // above (each is attached 1:1 to a fret mesh) — just clear the
        // tracking array. The shared ctx.board.fretTubeGeo was skipped by that
        // traverse, so dispose it exactly once here.
        ctx.board.fretWireMats = [];
        ctx.board.fretTubeGeo?.dispose?.();
        ctx.board.fretTubeGeo = null;

        const board = boardSpanX();
        const bw = board.width + 4 * K;

        // Fretboard plane — spans exactly from hit line (Z=0) to the note
        // spawn horizon (-AHEAD * TS), so the far edge aligns with AHEAD.
        const blAhead = TS * AHEAD;
        const pg = new T.PlaneGeometry(bw, blAhead);
        // Board (highway-surface) color comes from the active HIGHWAY scene
        // theme (default theme = the original 0x08080e). Kept on
        // ctx.board._boardPlaneMat so _applyBgTheme can recolor it live without
        // rebuilding the board.
        const pm = new T.MeshLambertMaterial({ color: highwayAxisColors(ctx.settings.hwThemeId).board, transparent: true, opacity: 0.6 });
        ctx.board._boardPlaneMat = pm;
        const p = new T.Mesh(pg, pm);
        p.rotation.x = -Math.PI / 2;
        p.position.set(board.center, S_BASE - NH / 2 - 2 * K, -blAhead / 2);
        fretG.add(p);

        // Thin Line strings (glow layer). Retained in ctx.board.stringLineGlows[]
        // so vibrancy slider changes can mutate opacity in place
        // without rebuilding the board geometry.
        // Nut lateral layout (matches headstock block below): playing strings start at the
        // fretboard-facing edge so they never project through nut/headstock.
        const mir = _leftyCached ? -1 : 1;
        const nutLenX = 1.55 * K;
        const nutXC = -0.78 * K * mir;
        const xHeadLeft = -6.85 * K * mir;
        const nutRearX = nutXC - nutLenX * 0.5;
        const nutFrontX = nutXC + nutLenX * 0.5;
        const nutJoinX = nutFrontX + 0.03 * K;
        const bridgeTipX = xFret(NFRETS) + 2 * K * mir;
        ctx.board.boardStringStartX = Math.min(nutJoinX, bridgeTipX);
        ctx.board.boardTuningLabelX = (nutRearX + xHeadLeft) * 0.5 - 0.15 * K * mir;
        const stringEndX = Math.max(nutJoinX, bridgeTipX);
        const strSpan = Math.max(stringEndX - ctx.board.boardStringStartX, 1.5 * K);

        const lineGlowOp = 0.15 + 0.35 * ctx.settings.vibrancy;
        for (let s = 0; s < nStr; s++) {
            const pts = [new T.Vector3(ctx.board.boardStringStartX, sY(s), 0), new T.Vector3(stringEndX, sY(s), 0)];
            const g = new T.BufferGeometry().setFromPoints(pts);
            const line = new T.Line(g, new T.LineBasicMaterial({ color: ctx.settings.activePalette[s], transparent: true, opacity: lineGlowOp }));
            line.renderOrder = 7; // above sus rails (4/5), below chord fill (10)
            fretG.add(line);
            ctx.board.stringLineGlows.push(line);
        }

        // BoxGeometry strings — emissive glow driven by updateStringHighlights()
        for (let s = 0; s < nStr; s++) {
            const g = new T.BoxGeometry(strSpan, STR_THICK, STR_THICK);
            // Each string gets its own material instance so emissiveIntensity is per-string
            // (and per-frame opacity is set by updateStringHighlights via _vibrancyIdleOp)
            const mat = new T.MeshStandardMaterial({
                color: ctx.settings.activePalette[s], emissive: ctx.settings.activePalette[s],
                emissiveIntensity: 0.002,
                transparent: true, opacity: ctx.settings._vibrancyIdleOp, roughness: 1,
            });
            const mesh = new T.Mesh(g, mat);
            mesh.renderOrder = renderOrderForLayerAtZ(0, 'BOARD_STRING');
            mesh.position.set(ctx.board.boardStringStartX + strSpan * 0.5, sY(s), 0);
            fretG.add(mesh);
            ctx.board.stringLines.push(mesh);
        }

        // Guitar nut + headstock -- see instance/geometry/nut-headstock.js.
        nutHeadstockBuilder.buildNutHeadstock(fretG, nStr, sY, xHeadLeft, nutXC, nutLenX, nutRearX);

        // Fret wires + fret dots + fret inlay labels -- see
        // instance/geometry/fret-markers.js.
        fretMarkersBuilder.buildFretMarkers(fretG, nStr, sY);
    }

    // Lookahead-camera-mode pure math -- see instance/model/lookahead-math.js.

    // Steady-mode camera-distance/X-target resolver -- see
    // instance/render/note-camera-targets.js.

    /** World-scale XY for purple lane rails = arpeggio ``ftSide`` / ``gLaneDivider`` edge (0.15×K). */
    function arpeggioLaneDividerXYScaleMatchFrameRim(accentMul = 1) {
        const yA = sY(0), yB = sY(nStr - 1);
        const yMinF = Math.min(yA, yB) - S_GAP * 0.8;
        const yMaxF = Math.max(yA, yB) + S_GAP * 0.8;
        const fullChordBoxH = yMaxF - yMinF;
        let ft = Math.max(CHORD_FRAME_RIM_MIN * K, fullChordBoxH * CHORD_FRAME_RIM_FRAC_H);
        if (accentMul !== 1 && accentMul > 0) ft *= accentMul;
        const ftSide = ft * 1.55;
        return ftSide / (0.15 * K);
    }

    /* ── Fret-label measure-skip rule ───────────────────────────────── */
    // For each (note_time, fret) pair across standalone notes and chord
    // notes, determine which ones are allowed to display their fret
    // indicator number. Rule: per fret (regardless of string), show the
    // number only on the first note in a given measure; suppress it for
    // the immediately following measure; then allow it again (current
    // measure + 2).
    // Key scheme: Math.round(t * 25) * 100 + fret  (40 ms time buckets).
    // Using a coarse time-bucket (not exact time) ensures that a synthetic
    // chord template whose .t differs from the corresponding standalone
    // arpeggio note by a few ms still resolves to the same key.
    // Only standalone notes (notesArr) populate the set; regular chord notes
    // never show labels, and synthetic chord notes share frets/onsets with
    // their arpeggio counterparts, so the same keys are found at lookup time.
    // Returns a Set of numeric keys (Math.round(t*25)*100 + fret).
    function _buildFretLabelSet(notesArr, _chordsArr, beatsArr) {
        const events = [];
        if (notesArr) {
            for (let _i = 0; _i < notesArr.length; _i++) {
                const _n = notesArr[_i];
                if (_n.f > 0) events.push({ t: _n.t, f: _n.f });
            }
        }
        // Chord events intentionally excluded: regular chord notes don't show
        // fret labels; synthetic chord notes share frets with arpeggio note-stream
        // notes already captured above, so no separate chord processing needed.
        events.sort((a, b) => a.t - b.t);
        const beats = beatsArr || [];
        let beatIdx = 0;
        let currentMeasure = 0;
        const nextShowMeasure = new Map(); // fret → next measure where label is allowed
        const allowed = new Set();
        for (let _ei = 0; _ei < events.length; _ei++) {
            const { t, f } = events[_ei];
            // Advance beats pointer: find the current measure for time t.
            while (beatIdx < beats.length && beats[beatIdx].time <= t + 1e-4) {
                if (beats[beatIdx].measure >= 0) currentMeasure = beats[beatIdx].measure;
                beatIdx++;
            }
            const nextM = nextShowMeasure.get(f) ?? 0;
            if (currentMeasure >= nextM) {
                // Time-bucket key: 40 ms groups absorb timing jitter while
                // still distinguishing notes at different positions in the measure.
                allowed.add(Math.round(t * 25) * 100 + f);
                // Suppress this fret for the next measure; re-allow at +2.
                nextShowMeasure.set(f, currentMeasure + 2);
            }
        }
        return allowed;
    }

    // Smoothed playback clock for this frame. Called once per frame at the
    // top of update(); camUpdate() reads the stored _frameNow afterward so
    // notes and camera share one clock. See the _clk* state block above.
    function smoothNow(bundle) {
        const raw = bundle.currentTime;
        const p = performance.now();
        // Host pause signal (feedBack core's bundle.isPlaying): when the
        // chart clock isn't advancing (paused / stalled / mid-seek), don't
        // extrapolate forward against a frozen audio sample — that creeps
        // the highway ahead by up to the interp cap and then snaps back
        // when dt finally crosses 0.1. Re-anchor to raw so the next
        // playing frame resumes from a clean segment. `=== false` so
        // downlevel hosts (isPlaying undefined) fall through to the
        // staleness-based cap below, preserving prior behavior there.
        if (bundle.isPlaying === false) {
            _clkAudioT = raw;
            _clkPerf = p;
            _clkRate = 1;
            return (_frameNow = raw);
        }
        if (raw !== _clkAudioT) {
            // New audio sample — re-anchor and refine the rate estimate.
            if (!Number.isNaN(_clkPerf)) {
                const dP = (p - _clkPerf) / 1000;
                if (dP > 0.001 && dP < 0.5) {
                    const r = (raw - _clkAudioT) / dP;
                    _clkRate = (r > 0.05 && r < 5) ? r : 1; // seek/loop → reset
                } else if (dP >= 0.5) {
                    _clkRate = 1; // long gap (paused / tab inactive)
                }
            }
            _clkAudioT = raw;
            _clkPerf = p;
            return (_frameNow = raw);
        }
        // Same audio sample as last call — interpolate forward, capped so a
        // stalled main thread or paused audio can't run the clock away.
        const dt = (p - _clkPerf) / 1000;
        if (dt <= 0 || dt > 0.1) return (_frameNow = raw);
        return (_frameNow = _clkAudioT + _clkRate * dt);
    }

    /* ── Per-frame rendering ─────────────────────────────────────────── */
    // ── GPU pre-warm (perf: first-appearance hitches) ─────────────────
    // Three.js compiles a material's shader program and uploads a
    // texture the first frame the owning object renders — profiled as
    // mid-song frame spikes (getParameters / texSubImage2D). Pay those
    // costs during init (load spinner) instead:
    //   _prewarmStatic()      — ren.compile() over the fully-built scene
    //                           + deterministic label textures (fret
    //                           numbers in every per-frame style/colour
    //                           combo).
    //   _prewarmChart(bundle) — chart-dependent labels (chord template
    //                           names, section names); needs the ready
    //                           bundle, so it runs once from the first
    //                           draw() after each init.
    // textSprites.txtMat() rasterises into the unbounded cache these draws hit
    // anyway; ren.initTexture() forces the GPU upload now.
    // setLabelMap() (pooled label sprite texture swap without recompiling)
    // -- see instance/helpers.js.

    let _chartPrewarmed = false;
    function _prewarmTex(mat) {
        if (mat && mat.map && ren) ren.initTexture(mat.map);
    }
    function _prewarmStatic() {
        // MAINTENANCE NOTE: this list must cover every deterministic
        // (chart-independent) material/texture the per-frame paths can
        // request lazily. Adding a new label style or sprite factory to
        // drawNote()/update() without warming it here silently
        // reintroduces a first-appearance texSubImage2D/compile spike
        // mid-song. Chart-dependent labels (chord names, section names)
        // live in _prewarmChart.
        try {
            if (ren && scene && cam) ren.compile(scene, cam);
        } catch (e) { console.warn('[3D-Hwy] prewarm compile:', e); }
        try {
            // Fret-number labels in the per-frame style/colour combos.
            for (let f = 0; f <= NFRETS; f++) {
                _prewarmTex(textSprites.txtMat(f, FRET_LABEL_GOLD_HEX, false, 'noteFret'));
                _prewarmTex(textSprites.txtMat(f, FRET_LABEL_GOLD_HEX, false, 'fretRow'));
                _prewarmTex(textSprites.txtMat(f, FRET_LABEL_IDLE_HEX, false, 'fretRow'));
                _prewarmTex(textSprites.txtMat(f, '#ffffff', false, 'ghostFret'));
            }
            // Teaching marks (drawNote _drawTeachMark): finger hints
            // T/1-4 (teachFg) and scale degrees 0-11 (teachSd).
            _prewarmTex(textSprites.txtMat('T', '#7fd1ff', false, 'teachFg'));
            for (let i = 1; i <= 4; i++) _prewarmTex(textSprites.txtMat(String(i), '#7fd1ff', false, 'teachFg'));
            for (let i = 0; i <= 11; i++) _prewarmTex(textSprites.txtMat(String(i), '#ffcc66', false, 'teachSd'));
            // Technique sprite factories (own caches, keyed by packed
            // number): PM/FH mute X, hammer/pull triangles, bend
            // chevron stacks, slide direction arrows — per string
            // colour of the active palette.
            _prewarmTex(textSprites.palmMuteXSpriteMat());
            _prewarmTex(textSprites.fretHandMuteXSpriteMat());
            const _nWarm = Math.min(
                Math.max(nStr, 6),
                (ctx.settings.activePalette && ctx.settings.activePalette.length) || 0);
            for (let s = 0; s < _nWarm; s++) {
                const hex = ctx.settings.activePalette[s] || 0xffffff;
                _prewarmTex(techMaterials.triMat(true, hex));
                _prewarmTex(techMaterials.triMat(false, hex));
                for (let st = 1; st <= 4; st++) _prewarmTex(techMaterials.bendChevronMat(st, hex));
                const arrowHex = darkenHex(hex, 0.55);
                _prewarmTex(techMaterials.slideArrowMat(true, arrowHex));
                _prewarmTex(techMaterials.slideArrowMat(false, arrowHex));
            }
        } catch (e) { console.warn('[3D-Hwy] prewarm labels:', e); }
    }
    function _prewarmChart(bundle) {
        try {
            const tpls = bundle && bundle.chordTemplates;
            if (Array.isArray(tpls)) {
                for (const tpl of tpls) {
                    if (tpl && tpl.name) _prewarmTex(textSprites.txtMat(tpl.name, '#e8d080', true, 'chord'));
                }
            }
            const secs = bundle && bundle.sections;
            if (Array.isArray(secs)) {
                for (const s of secs) {
                    if (s && s.name) _prewarmTex(textSprites.txtMat(s.name, '#00cccc', true, 'section'));
                }
            }
        } catch (e) { console.warn('[3D-Hwy] prewarm chart labels:', e); }
    }

    function update(bundle) {
        pbBeg(0);
        // [verdict glow] Apply the level-driven verdict brightness captured
        // last frame (1-frame lag is imperceptible), then reset for this
        // frame's capture in the gem path below -- see
        // instance/render/material-retint.js's applyVerdictGlow().
        materialRetint.applyVerdictGlow();
        // Lean sustain rendering is the default (see declaration above):
        // the trail/ribbon outline always draws; only the additive rail
        // bloom halo is dropped. The full look (with bloom) is an opt-out.
        // localStorage.getItem is a synchronous storage read — polled at
        // ~1 Hz instead of every frame; the console flag still takes
        // effect live (within a second).
        if ((_leanSusPollCounter++ % 60) === 0) {
            try {
                _leanSus = localStorage.getItem('h3d_full_sus') !== '1';
            } catch (_) { _leanSus = true; }
        }
        // Materialize the text-size multiplier from the user's slider.
        // textSize ∈ [0,1]; _textSizeMul ∈ [0.5, 1.5] with 0.5 ↦ 1.0×
        // so default behaviour matches what the renderer did pre-slider.
        _textSizeMul = 0.5 + ctx.settings.textSize;
        // Rescale inlay labels to track the live text-size slider.
        // buildBoard() sets an initial scale using (0.5 + textSize) but
        // _textSizeMul is only authoritative from here onward.
        // Guard: only update when the multiplier actually changed.
        if (_textSizeMul !== _textSizeMulApplied) {
            _textSizeMulApplied = _textSizeMul;
            for (let i = 0; i < ctx.board._inlayLabels.length; i++) {
                const f = INLAY_LABEL_FRETS[i];
                const s = 5.5 * _textSizeMul * K * fretLabelScaleForFret(f);
                ctx.board._inlayLabels[i].scale.set(s, s, 1);
            }
        }
        _syncOpenStringPitchLabels(bundle);

        // Single loop over POOL_REGISTRY replaces 33 individually-spelled
        // .reset() calls — see the registry's declaration comment.
        for (const p of Object.values(POOL_REGISTRY)) if (p) p.reset();
        if (projMeshArr) for (const arr of projMeshArr) for (const m of arr) m.visible = false;
        _scrGhostUpcomingCount.fill(0, 0, nStr);
        _imPMTechCount = _imFHTechCount = 0;
        _imPMXFillCount = _imPMXLinesCount = _imFHXFillCount = _imFHXLinesCount = 0;
        // Clear per-frame queues in-place (avoid reallocating the array object).
        noteDetectLabels.length = 0;

        // Prune expired notedetect hit/miss marks -- see
        // instance/notedetect/verdict-prune.js's pruneNotedetectMarks().
        noteDetectFrameNowMs = verdictPrune.pruneNotedetectMarks();
        // feedBack#254 — capture core's per-note judgment provider for
        // this frame's drawNote() calls (held-sustain glow + lit gems).
        // bundle.getNoteState is ALWAYS present (the core stub returns
        // null when no provider is registered), so its existence isn't
        // a "detect mode active" signal on its own.
        // bundle.getNoteStateProvider exposes the registered provider
        // (or null) directly — drive cull-window / chord-rim-floor
        // extensions off that so they don't activate in non-detect
        // mode. Downlevel hosts without getNoteStateProvider fall
        // back to the existence check, matching pre-PR behavior on
        // those builds.
        noteDetectGetState = (bundle && typeof bundle.getNoteState === 'function') ? bundle.getNoteState : null;
        noteDetectHasProvider = (bundle && typeof bundle.getNoteStateProvider === 'function')
            ? bundle.getNoteStateProvider() != null
            : !!noteDetectGetState;

        const now = smoothNow(bundle);
        const t0 = now - BEHIND;
        const t1 = now + AHEAD;
        // With a verdict provider attached, keep notes and chord frames
        // in the outer loop past BEHIND so async verdicts (~0.4 s late)
        // still land while drawable; per-note / per-frame culling is
        // tightened back below.
        const ndVerdictT0 = noteDetectHasProvider
            ? now - Math.max(BEHIND, NOTEDETECT_GEM_VERDICT_WINDOW)
            : t0;
        // Chord-verdict Map pruning -- see instance/notedetect/verdict-prune.js.
        verdictPrune.pruneChordVerdicts(now, ndVerdictT0, noteDetectHasProvider);

        const notes = bundle.notes;
        // Chord merge + arp-ghost-infer memoization -- see
        // instance/model/arp-and-slide-prepasses.js's computeMergedChords/
        // computeArpGhostHsInfer.
        const chords = arpAndSlidePrepasses.computeMergedChords(bundle.chords, bundle.handShapes, bundle.chordTemplates);
        const { arpGhostHsInfer, arpSynthOnsetHsSet } = arpAndSlidePrepasses.computeArpGhostHsInfer(
            bundle.handShapes, bundle.chordTemplates, notes,
        );

        // Arpeggio-persist + slide-target-suppression pre-passes -- see
        // instance/model/arp-and-slide-prepasses.js. Both feed
        // singleNoteRenderer.drawSingleNotes() below.
        const _arpPersistKeys = arpAndSlidePrepasses.computeArpPersistKeys(
            arpGhostHsInfer, bundle.handShapes, notes, now, t0);
        ({
            slideTargetSet: _slideTargetSet,
            slideTargetNotesRef: _slideTargetNotesRef,
            slideTargetChordsRef: _slideTargetChordsRef,
        } = arpAndSlidePrepasses.computeSlideTargetSet(
            notes, bundle.chords, _slideTargetSet, _slideTargetNotesRef, _slideTargetChordsRef));

        // Arpeggio lane purple rails — authored-marker cache + bounds cache.
        // See instance/model/arp-and-slide-prepasses.js's computeLaneRailCaches.
        const { laneRailArpHsFlags, laneRailBoundLo, laneRailBoundHi } = arpAndSlidePrepasses.computeLaneRailCaches(
            bundle.handShapes, chords, bundle.chordTemplates, notes || [],
        );
        const beats = bundle.beats;
        // Rebuild the fret-label visibility set whenever the chart changes.
        if (notes !== _fretLabelNotesRef) {
            _fretLabelAllowed = _buildFretLabelSet(notes, chords, beats);
            _fretLabelNotesRef = notes;
        }
        // Rebuild the measure-start time cache whenever beats change. Only
        // beats that begin a measure carry measure >= 0; intra-measure beats
        // (measure === -1) are skipped. Drives the lookahead window.
        if (beats !== _measureStartsRef) {
            _measureStartsRef = beats;
            const _ms = [];
            if (beats) {
                for (let _bi = 0; _bi < beats.length; _bi++) {
                    const _b = beats[_bi];
                    if (_b && Number.isFinite(_b.measure) && _b.measure >= 0) _ms.push(_b.time);
                }
            }
            _measureStarts = _ms;
        }
        const sections = bundle.sections;
        const anchors = bundle.anchors;

        // Fret-wire anchor highlight -- see
        // instance/render/fret-wire-hit-flash.js.
        fretWireHitFlash.applyFretWireAnchorHighlight(anchors, now);

        const lookaheadBoundsNow = (ctx.settings.cameraMode === 'lookahead')
            ? lookaheadMath.lookaheadComputeFretBounds(now, anchors, notes, chords)
            : null;

        // Per-string sustain/anticipation/fretHeat/glow state -- see
        // instance/render/note-state.js. _fwHitIn/_rimFlashIn/_fwChordAcc
        // reset here too (unrelated to noteState, just colocated for
        // "reuse hoisted scratch arrays" locality) -- fret-wire-hit-
        // flash.js's own deps, left resident.
        _fwHitIn.fill(0);               // this frame's confirmed-hit frets
        _rimFlashIn.fill(0);            // this frame's per-string rim-flash alphas
        _fwChordAcc.clear();
        pbBeg(1);
        const noteState = frameState.buildFrameState(notes, chords, now, nStr);
        pbEnd(1);
        pbBeg(2);
        // ── Next-note-by-string lookahead (for anticipation projection) ──
        const nextNoteByString = lookaheadPrepasses.computeNextNoteByString(notes, chords, now, nStr, fretLastActiveTime);

        _drawNextByString = nextNoteByString;
        _drawChordTemplates = bundle.chordTemplates ?? null;
        _drawAnchors = anchors ?? null;
        _drawTeachingMarks = !!bundle.teachingMarksVisible;
        // Default on: only an explicit false (older bundles omit the flag) hides fg.
        _showFingerHints = bundle.fingerHintsVisible !== false;

        // Built once per update() call (not once per note — noteRenderer.drawNote()
        // is called from two loops below) and handed to every drawNote() call this
        // frame. Everything here is written elsewhere (camUpdate/applySize,
        // loadSettings/the settings listener, the snapshot assignments just above)
        // and only READ by drawNote — see note.js's doc comment for why this is a
        // fresh-each-frame bag rather than a construction-time alias.
        _noteFrame.curX = ctx.cam.curX;
        _noteFrame.activePalette = ctx.settings.activePalette;
        _noteFrame._textSizeMul = _textSizeMul;
        _noteFrame.nStr = nStr;
        _noteFrame._leftyCached = _leftyCached;
        _noteFrame._invertedCached = _invertedCached;
        _noteFrame._drawNextByString = _drawNextByString;
        _noteFrame._drawAnchors = _drawAnchors;
        _noteFrame._drawChordTemplates = _drawChordTemplates;
        _noteFrame._drawTeachingMarks = _drawTeachingMarks;
        _noteFrame._showFingerHints = _showFingerHints;
        _noteFrame.noteDetectFrameNowMs = noteDetectFrameNowMs;
        _noteFrame.noteDetectGetState = noteDetectGetState;
        _noteFrame.noteDetectHasProvider = noteDetectHasProvider;
        _noteFrame.showFretOnNote = ctx.settings.showFretOnNote;
        _noteFrame.fretNumberGhostScope = ctx.settings.fretNumberGhostScope;
        _noteFrame.glowMul = ctx.settings.glowMul;
        _noteFrame._hitFx = ctx.settings._hitFx;
        _noteFrame._sparks = ctx.settings._sparks;
        _noteFrame._verdictMarks = ctx.settings._verdictMarks;
        _noteFrame._streakFx = ctx.settings._streakFx;
        _noteFrame._streakHeat = _streakHeat;
        _noteFrame.projectionVisible = ctx.settings.projectionVisible;
        _noteFrame.slideArrowApproachVisible = ctx.settings.slideArrowApproachVisible;
        _noteFrame.slideArrowNeckVisible = ctx.settings.slideArrowNeckVisible;
        _noteFrame.slideArrowChainPreviewVisible = ctx.settings.slideArrowChainPreviewVisible;
        _noteFrame._vibrancyProjOp = ctx.settings._vibrancyProjOp;
        _noteFrame._timingFx = ctx.settings._timingFx;
        _noteFrame._fretLabelAllowed = _fretLabelAllowed;

        // ── Recent-past event per string (for _nextAnyT deadline) ─────
        _drawRecentByString = lookaheadPrepasses.computeRecentByString(notes, chords, now, nStr);

        // ── Sorted union of next/recent event times ──────────────────
        // Populate the scalar scratch used by _firstEventTimeGreaterThan.
        // _scrEventTimes/_scrEventTimesLen stay main.js-resident (read via
        // closure by _firstEventTimeGreaterThan, itself injected as a dep
        // into note.js/chords.js) — the prepass just computes the new
        // length and hands it back for reassignment.
        _scrEventTimesLen = lookaheadPrepasses.computeEventTimesUnion(
            _drawNextByString, _drawRecentByString, nStr, _scrEventTimes,
        );

        // ── Ghost preview gap prepass ──────────────────────────────────
        // Mutates _scrGhostPrevBuf in place (shared Map, also handed to
        // note.js/chords.js at construction) — nothing to reassign here.
        lookaheadPrepasses.computeGhostPrevGap(notes, chords, now, nStr);

        // Ramp strGlow while the board ghost is visible, then boost
        // accented notes — both write into noteState.strGlow/
        // .accentFillBoost, consumed next by frameState.updateStringHighlights().
        lookaheadPrepasses.rampStrGlowForUpcomingMerge(notes, chords, now, nextNoteByString, noteState);
        lookaheadPrepasses.applyAccentGlow(notes, chords, now, noteState);

        pbEnd(2);
        pbBeg(3);
        // mGlow / mAccentCore emissive writes are folded into
        // updateStringHighlights() — same per-string scratch reads,
        // one pass.
        frameState.updateStringHighlights(noteState, nStr, ctx.settings.glowMul, ctx.settings._vibrancyIdleOp);
        pbEnd(3);

        // Active frets (notes in cooldown window) + highway intensity.
        // highwayIntensity is declared here but seeded on _chordAccum below
        // (with camWX/camWSum/camDistMin/camDistMax/camDistGot) -- both the
        // single-notes loop and the chord loop accumulate into that shared
        // object across the frame; this closure local is only assigned once,
        // via the copy-back after both loops have run (see accum's doc
        // comment in instance/render/single-notes.js).
        let highwayIntensity;
        _scrActiveFrets.clear();
        const activeFrets = _scrActiveFrets;
        for (let f = 1; f <= NFRETS; f++) {
            if (now - fretLastActiveTime[f] < FRET_COOLDOWN) activeFrets.add(f);
        }

        // Camera targeting — steady mode (#34): recency-weighted centroid +
        // hysteresis over [camT0, camT1]. In lookahead mode, see
        // lookaheadBoundsNow + lookaheadSmoothCamStep().
        let cs = 0;
        let camAhead = CAM_TGT_AHEAD_C;
        let camTau = CAM_TGT_TAU_C;
        let camHystF = CAM_TGT_HYST_C;
        let camT0 = now - CAM_TGT_BEHIND;
        let camT1 = now + camAhead;
        let camWX, camWSum, camDistMin, camDistMax, camDistGot;
        const camDistHystF = CAM_DIST_HYST_T + (CAM_DIST_HYST_C - CAM_DIST_HYST_T) * ctx.settings.zoomSmoothing;
        if (!(ctx.settings.cameraMode === 'lookahead')) {
            cs = ctx.settings.cameraSmoothing;
            camAhead = CAM_TGT_AHEAD_T + (CAM_TGT_AHEAD_C - CAM_TGT_AHEAD_T) * cs;
            camTau = CAM_TGT_TAU_T + (CAM_TGT_TAU_C - CAM_TGT_TAU_T) * cs;
            camHystF = CAM_TGT_HYST_T + (CAM_TGT_HYST_C - CAM_TGT_HYST_T) * cs;
            camT0 = now - CAM_TGT_BEHIND;
            camT1 = now + camAhead;
        }

        // Classic path (#34): ctx.cam.tgtDist hysteresis tracks fret span over the
        // narrowed [camT0, camT1]; lookahead mode uses lookaheadBoundsNow + span smoothing.
        //
        // Sustain extension: the outer loop keeps notes/chords
        // whose sustain still rings into the visible window —
        // n.t + (n.sus || 0) >= t0 for notes, ch.t + maxSus >= t0
        // for chords — via the continue-filters below at the top
        // of the single-note and chord branches. camT0 is narrower
        // than t0, so an onset can age past camT0 while still
        // being on screen and audible. Mirror that past-side
        // allowance here so a held low-fret chord keeps
        // contributing to both camDist (zoom) and camWX (X
        // target); otherwise the camera dollies/pans away
        // mid-sustain, re-clipping the very chord the low-fret
        // pullback was added to keep on screen. The future side
        // (camT1) is left alone so the #34 invariant (distant
        // high-fret onsets don't pre-pull the camera) still holds.

        // _noteFrame gets the camera fields both the single-notes loop and
        // drawChords() need (camT0/camT1/camTau/camHystF/camDistHystF/
        // cameraMode/_leanSus), alongside what it already carries for
        // noteRenderer.drawNote() -- one frame bag, populated once before
        // either loop runs.
        _noteFrame.camT0 = camT0;
        _noteFrame.camT1 = camT1;
        _noteFrame.camTau = camTau;
        _noteFrame.camHystF = camHystF;
        _noteFrame.camDistHystF = camDistHystF;
        _noteFrame.cameraMode = ctx.settings.cameraMode;
        _noteFrame._leanSus = _leanSus;
        // _chordAccum is the small mutable object both the single-notes
        // loop and drawChords() accumulate into across the frame
        // (highwayIntensity, camWX, camWSum, camDistMin, camDistMax,
        // camDistGot); seeded once here, read back into this closure's
        // locals after both loops have run.
        _chordAccum.highwayIntensity = 0;
        _chordAccum.camWX = 0;
        _chordAccum.camWSum = 0;
        _chordAccum.camDistMin = 99;
        _chordAccum.camDistMax = 0;
        _chordAccum.camDistGot = false;

        // Song-change detection + first-chart-data camera bootstrap -- see
        // instance/render/camera-bootstrap.js. Both write almost
        // exclusively into ctx.cam; the 5 clock/measure-cache scalars this
        // used to reset inline are reset here on a returned boolean since
        // they're always the same literal values (not computed).
        if (cameraBootstrap.detectSongChangeAndResetCamera(bundle)) {
            // Drop the previous song's measure-start cache. Otherwise
            // lookaheadEndTime() would size the lookahead window off the
            // old measure grid (with the new song's now reset to ~0 this
            // yields a wrong/huge tEnd) until the new beats arrive and
            // rebuild it — the resulting huge fret span over-zooms the
            // first-data snap and stays latched. Clearing it falls back
            // to the seconds window for this frame; the rebuild repopulates
            // it next frame once bundle.beats is the new array.
            _measureStarts = []; _measureStartsRef = null;
            // Drop the clock anchor so the new song's currentTime
            // re-anchors cleanly instead of measuring a bogus rate
            // across the seek-to-0 discontinuity.
            _clkAudioT = NaN; _clkPerf = NaN; _clkRate = 1;
        }
        cameraBootstrap.bootstrapCameraFromChartData(
            notes, chords, anchors, now, nStr, ctx.settings.cameraMode, lookaheadBoundsNow,
            camAhead, camTau, camHystF, camDistHystF, ctx.settings.cameraLockLow, ctx.settings.cameraLockZoom,
        );

        pbBeg(4);
        // Standalone-note render loop -- see instance/render/single-notes.js.
        // Fills lastFretForString (passed to drawChords below, same object
        // reference) and accumulates into the shared _chordAccum object
        // (already seeded above, alongside _noteFrame's camera fields).
        const lastFretForString = _scrLastFretForString;
        singleNoteRenderer.drawSingleNotes(
            notes, anchors, bundle, now, t1, ndVerdictT0, activeFrets, lastFretForString,
            arpGhostHsInfer, _arpPersistKeys, _slideTargetSet, arpSynthOnsetHsSet,
            _chordAccum, _noteFrame,
        );

        pbEnd(4);
        pbBeg(5);
        // Chords -- see instance/render/chords.js. Continues accumulating
        // into the SAME _chordAccum object the single-notes loop just wrote,
        // and reads the SAME _noteFrame camera fields.
        chordRenderer.drawChords(
            chords, notes, anchors, bundle, now, t1, ndVerdictT0,
            activeFrets, lastFretForString, _chordAccum, _noteFrame,
        );
        highwayIntensity = _chordAccum.highwayIntensity;
        camWX = _chordAccum.camWX;
        camWSum = _chordAccum.camWSum;
        camDistMin = _chordAccum.camDistMin;
        camDistMax = _chordAccum.camDistMax;
        camDistGot = _chordAccum.camDistGot;

        // Fret-wire hit flash (apply) -- see
        // instance/render/fret-wire-hit-flash.js.
        _fwHitPrevTime = fretWireHitFlash.applyFretWireHitFlash(now, _drawAnchors, _fwHitPrevTime);


        // Dynamic highway lane + fret-boundary extension lines -- see
        // instance/render/highway-lane.js. hwyLaneFretClipMin/Max are the
        // one piece of state that escapes this section, consumed below by
        // the fret-column reference markers.
        let hwyLaneFretClipMin, hwyLaneFretClipMax;
        ({ hwyLaneFretClipMin, hwyLaneFretClipMax } = highwayLane.drawHighwayLane(
            anchors, bundle, now, chords, activeFrets,
            laneRailArpHsFlags, laneRailBoundLo, laneRailBoundHi,
            highwayIntensity, ctx.settings.fretDividersVisible,
        ));

        // Dynamic fret number row (heat-coloured) -- see
        // instance/render/fret-number-row.js.
        fretNumberRow.drawFretNumberRow(anchors, now, nStr, _textSizeMul);

        // Beat lines + section labels -- see
        // instance/render/beat-and-section-labels.js. Section labels stay
        // gated on sectionLabelsOnHighway (advanced setting, default off)
        // here -- the HUD card (drawSectionHud, called from the lyricsCtx
        // block in draw()) is the primary surface for section info; the
        // on-highway sprites are kept as an opt-in for users who want the
        // in-scene cue.
        beatAndSectionLabels.drawBeatLines(beats, now, t0, t1);
        if (ctx.settings.sectionLabelsOnHighway) beatAndSectionLabels.drawSectionLabels(sections, now, t0, t1, nStr, _textSizeMul);

        // Fret-column reference markers -- see
        // instance/render/fret-column-markers.js.
        fretColumnMarkers.drawFretColumnMarkers(
            beats, now, t1, notes, chords, anchors, ctx.settings.fretColumnMarkerCadence, nStr, _textSizeMul,
            hwyLaneFretClipMin, hwyLaneFretClipMax,
        );

        // Camera target resolution -- see instance/render/camera-target.js.
        // Writes only into ctx.cam (shared dep); nothing escapes downstream.
        cameraTarget.drawCameraTarget(
            ctx.settings.cameraMode, lookaheadBoundsNow, camDistGot, camWX, camWSum, camDistMin, camDistMax,
            camHystF, camDistHystF, _frameNow, ctx.settings.cameraLockLow, ctx.settings.cameraLockZoom,
        );


        // Chord-diagram state tracking -- see
        // instance/model/chord-diagram-tracking.js. The 7 fields stay bare
        // closure `let`s here (draw()/teardown()/destroy() read/reset them
        // directly, unchanged) -- this call just recomputes their new
        // values each frame.
        ({
            diagChord: _diagChord, diagPrev: _diagPrev, diagPrevOpacity: _diagPrevOpacity,
            diagPrevStartOpacity: _diagPrevStartOpacity, diagPrevStartT: _diagPrevStartT,
            diagEntranceT: _diagEntranceT, diagLastKey: _diagLastKey,
        } = updateChordDiagramTracking(
            chordInference, chords, bundle, now, nStr,
            _diagChord, _diagPrev, _diagPrevOpacity, _diagPrevStartOpacity, _diagPrevStartT, _diagLastKey,
        ));
        // Finalise InstancedMesh batches -- see
        // instance/render/finalize-instanced-meshes.js. Must run after all
        // drawNote() / chord-loop writes are done.
        finalizeInstancedMeshBatches({
            imPMTech, imFHTech, imPMXFill, imPMXLines, imFHXFill, imFHXLines,
            _imPMTechCount, _imFHTechCount,
        });

        pbEnd(5);
        pbEnd(0);
        pbReportTick();
    }

    // drawArpBrackets() (the  [ GEM ]  bracket-pair drawer, shared by
    // chords.js and single-notes.js) -- see instance/helpers.js.

    // drawNotedetectLabels / drawScoreFx -- see instance/render/score-fx.js.

    // camUpdate() (smooth camera lerp + self-correcting NDC look-at,
    // including the Horizontal-FOV-hold "Hor+" pane-aspect logic) and
    // applySize() (DPR + canvas size + aspect clamping) -- see
    // instance/render/camera-lifecycle.js, called as cameraLifecycle.x().
    /* ── Teardown ────────────────────────────────────────────────────── */
    function teardown() {
        // Background animations (#13). Drop the listener first so any
        // mid-teardown settings change doesn't try to rebuild a torn-
        // down scene; then dispose the active style's resources.
        if (settingsListener) { unsubscribeFromSettings(settingsListener); settingsListener = null; }
        // WebGL context-loss listeners (bound in initScene on ren.domElement).
        // Remove before ren is disposed below so a torn-down instance can't
        // keep firing them; reset the flag so a reused instance starts clean.
        if (ren && ren.domElement) {
            if (_onCtxLost) { try { ren.domElement.removeEventListener('webglcontextlost', _onCtxLost, false); } catch (e) {} }
            if (_onCtxRestored) { try { ren.domElement.removeEventListener('webglcontextrestored', _onCtxRestored, false); } catch (e) {} }
        }
        _onCtxLost = _onCtxRestored = null;
        _ctxLost = false;
        // Notedetect listeners (issue #9). Remove on destroy so a
        // panel that stops doesn't keep accumulating marks. Marks
        // arrays are cleared too — they hold stale chart positions
        // that next init() may reuse (drawNote keys on (s, f, t)).
        if (noteDetectOnHit) { window.removeEventListener('notedetect:hit', noteDetectOnHit); noteDetectOnHit = null; }
        if (noteDetectOnMiss) { window.removeEventListener('notedetect:miss', noteDetectOnMiss); noteDetectOnMiss = null; }
        if (_fxOnFx) { window.removeEventListener('notedetect:fx', _fxOnFx); _fxOnFx = null; }
        if (window.feedBack && typeof window.feedBack.off === 'function') {
            if (_fxOnSkin) { try { window.feedBack.off('notedetect:skin', _fxOnSkin); } catch (e) {} _fxOnSkin = null; }
            if (noteDetectOnBusHit)  window.feedBack.off('note:hit', noteDetectOnBusHit);
            if (noteDetectOnBusMiss) window.feedBack.off('note:miss', noteDetectOnBusMiss);
            if (_visibilityHandler) {
                try { window.feedBack.off('highway:visibility', _visibilityHandler); } catch (e) {}
            }
            if (_canvasReplacedHandler) {
                try { window.feedBack.off('highway:canvas-replaced', _canvasReplacedHandler); } catch (e) {}
            }
        }
        noteDetectOnBusHit = noteDetectOnBusMiss = null;
        _visibilityHandler = null;
        _canvasReplacedHandler = null;
        noteDetectHitMarks = [];
        noteDetectMissMarks = [];
        noteDetectLabels = [];
        scoreFx.teardownScoreFx();
        _fxElemSeen = new WeakSet();
        _chordVerdicts = new Map();
        if (bcCtrl) { try { bcCtrl.destroy(); } catch (e) {} bcCtrl = null; }
        backgroundMount.unmountBackgroundStyle();
        bgGroup = null; backgroundLastT = 0;
        _diagChord = null; _diagPrev = null; _diagPrevOpacity = 0; _diagPrevStartOpacity = 0; _diagPrevStartT = null;
        _diagEntranceT = 1.0; _diagLastKey = null; chordDiagramCache.clearDiagramCache();

        if (wrap) { wrap.remove(); wrap = null; }
        _disposeOpenStringPitchSprites();
        if (scene) {
            // Don't dispose material.map textures here. Texture
            // lifetime belongs to whoever allocated it; the bg
            // styles' per-layer CanvasTextures (e.g. silhouettes'
            // wrappers around the shared silhouetteCanvas) are released
            // in their own teardowns. txtCache textures are
            // explicitly disposed below; mStr/mGlow/etc. don't have
            // a .map. Disposing here would either double-free or
            // yank a still-in-use texture out from under another
            // mount.
            scene.traverse((obj) => {
                // ctx.board.fretTubeGeo is shared across all fret meshes — dispose it
                // exactly once below, not once per mesh here.
                if (obj.geometry !== ctx.board.fretTubeGeo) obj.geometry?.dispose?.();
                if (obj.material) {
                    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                    for (const m of mats) m?.dispose?.();
                }
            });
            // Shared chord-frame fill gradient — not owned by txtCache;
            // MeshBasicMaterial.dispose() does not release maps.
            chordFrameGradTex?.dispose?.();
            chordFrameGradTexArp?.dispose?.();
        }
        gNote?.dispose?.(); gSus?.dispose?.(); gBeat?.dispose?.(); gSusRail?.dispose?.(); gTapChevron?.dispose?.();
        mSusRailBase?.dispose?.(); mSusRailBase = null; gSusRail = null; pSusRail = null;
        gSusRailBloom?.dispose?.(); mSusRailBloomBase?.dispose?.(); _bloomGaussTex?.dispose?.();
        gSusRailBloom = null; mSusRailBloomBase = null; _bloomGaussTex = null; pSusRailBloom = null;
        gTechPlane?.dispose?.(); gTechPlane = null; pTechPlane = null;
        // InstancedMesh disposal — .dispose() releases instanceMatrix / instanceColor
        // GPU buffers. Geometry and material are disposed separately below.
        imPMTech?.dispose?.(); imPMTech = null;
        imFHTech?.dispose?.(); imFHTech = null;
        imPMXFill?.dispose?.(); imPMXFill = null;
        imPMXLines?.dispose?.(); imPMXLines = null;
        imFHXFill?.dispose?.(); imFHXFill = null;
        imFHXLines?.dispose?.(); imFHXLines = null;
        // Geometry clones for PM/FH tech IMs (own instanceAlpha attribute).
        _imGPMTech?.dispose?.(); _imGPMTech = null;
        _imGFHTech?.dispose?.(); _imGFHTech = null;
        // ShaderMaterials for all 6 IMs.
        _imPMTechMat?.dispose?.();  _imPMTechMat = null;
        _imFHTechMat?.dispose?.();  _imFHTechMat = null;
        _imPMXFillMat?.dispose?.(); _imPMXFillMat = null;
        _imPMXLinesMat?.dispose?.(); _imPMXLinesMat = null;
        _imFHXFillMat?.dispose?.(); _imFHXFillMat = null;
        _imFHXLinesMat?.dispose?.(); _imFHXLinesMat = null;
        _imM4 = _imPos = _imSca = _imQ = _imAZ = _imColor = null;
        gHaloBar?.dispose?.(); gHaloBar = null;
        gArpBracket?.dispose?.(); gArpBracket = null;
        for (const m of mStr) m?.dispose?.();
        for (const m of mGlow) m?.dispose?.();
        for (const m of mSus) m?.dispose?.();
        for (const m of mStrHitOutline) m?.dispose?.();
        for (const m of mAccentOutline) m?.dispose?.();
        for (const m of mAccentCore) m?.dispose?.();
        for (const m of mAccentHaloNear) m?.dispose?.();
        for (const m of mAccentHaloMid) m?.dispose?.();
        for (const m of mAccentHaloFar) m?.dispose?.();
        mBeatM?.dispose?.(); mBeatQ?.dispose?.();
        // Notedetect outline materials (#9). May not be reachable
        // via scene.traverse if no event ever fired (never attached
        // to a mesh), so dispose explicitly.
        mMissOutline?.dispose?.();
        mHitSusOutline?.dispose?.();
        mEdgeTransparent?.dispose?.(); mEdgeTransparent = null;
        for (const m of mHitBright) m?.dispose?.(); mHitBright = []; mHitBrightArrays = [];
        for (const m of mRimFlash) m?.dispose?.(); mRimFlash = [];
        textSprites.disposeAll();
        // Technique-marker sprite materials (triMat / bendChevronMat /
        // slideArrowMat) — own numeric-keyed cache, not reachable via
        // textSprites' cache.
        techMaterials.disposeAll();
        // Dispose per-sprite cloned materials (e.g. pmMark._pmMat).
        // These aren't reachable via scene.traverse once the sprite
        // gets reassigned a different material, so the array tracks
        // them at allocation time.
        for (const m of _ownedClonedMats) m?.dispose?.();
        _ownedClonedMats.length = 0;
        // Per-mesh technique-marker clones (from _spriteMat2MeshMat).
        // The Set tracks the live clone for each pool mesh; dispose all
        // on teardown so no GPU material leaks between init() cycles.
        for (const m of _techMeshMatClones) m?.dispose?.();
        _techMeshMatClones.clear();
        // Shared pool-factory materials/geometries (mLaneOdd/Even, etc.) —
        // see _ownedSharedMats comment near the declaration. Dispose is
        // idempotent so the scene.traverse() pass above won't double-free.
        for (const m of _ownedSharedMats) m?.dispose?.();
        _ownedSharedMats.length = 0;
        for (const g of _ownedSharedGeos) g?.dispose?.();
        _ownedSharedGeos.length = 0;
        if (_sparkPts) { try { _sparkPts.geometry.dispose(); _sparkPts.material.dispose(); } catch (e) {} _sparkPts = null; }
        if (bloomComposer) bloomComposer.disposeBloomComposer();
        if (ren) { ren.dispose(); ren = null; }
        scene = cam = noteG = beatG = lblG = fretG = tuningLblG = null;
        ambLight = dirLight = null;
        mStr = []; mGlow = []; mSus = []; mStrHitOutline = []; mAccentOutline = []; mAccentCore = []; mAccentHaloNear = []; mAccentHaloMid = []; mAccentHaloFar = []; _accentShellsByString = []; mWhiteOutline = mSusOutline = null; mMissOutline = null; mHitSusOutline = null; ctx.board.stringLines = []; ctx.board.stringLineGlows = []; ctx.board._boardPlaneMat = null; ctx.board.fretWireMats = []; ctx.board.fretTubeGeo?.dispose?.(); ctx.board.fretTubeGeo = null;
        for (const m of ctx.board._inlayMats) m?.dispose?.(); ctx.board._inlayMats = []; ctx.board._inlayLabels = [];
        // mTapChevron: dispose explicitly — if no tap marker ever
        // spawned a pooled mesh, the scene.traverse() pass above never
        // reaches this material.
        mTapChevron?.dispose?.();
        mTapChevron = null;
        // mBarre is a shared material that all pBarreLine pool meshes
        // reference. If no barre chord ever appears, the pool factory
        // is never called, so no mesh carries mBarre into the scene
        // and scene.traverse() will miss it. Dispose explicitly here
        // to avoid leaking the GPU resource across panel lifecycles.
        // Three.js dispose() is idempotent, so calling it before or
        // after scene.traverse() is safe in both the instantiated and
        // uninstantiated cases.
        mBarre?.dispose?.(); mBarre = null;
        _paletteColorTmp = null;
        lyricsCanvas = lyricsCtx = null;
        projMeshArr = null;
        _probe = null;
        _drawNextByString = null; _drawRecentByString = null;
        _susVerdictLatch.clear();
        _drawChordTemplates = null;
        _drawAnchors = null;
        _laneTargetColor = null;
        _fwHitColor = _fwHitEmissive = null;
        _fwHitGlow.fill(0);
        _fwChordAcc.clear();
        _fwHitPrevTime = -Infinity;
        _renderScale = 1;
        mBeatM = mBeatQ = null;
        pNote = pNoteEdge = pSus = pSusOutline = pSusRibbon = pSusRibbonOl = pLbl = pBeat = pSec = null;
        pFretLbl = pLane = pLaneDivider = pGhostFretLbl = pChordBox = pChordFrameFill = pChordLbl = pBarreLine = pArpBracket = pNoteFretLabel = pConnectorLine = pDropLine = pTapChevron = pAccentHalo = pHaloBar = pPMXFill = pFHXFill = pMuteXLines = pFHXLines = pTeachMarkLbl = null;
        if (gPMXFill) { gPMXFill.dispose(); gPMXFill = null; }
        if (gFHXFill) { gFHXFill.dispose(); gFHXFill = null; }
        if (gPMXLines) { gPMXLines.dispose(); gPMXLines = null; }
        if (gFHXLines) { gFHXLines.dispose(); gFHXLines = null; }
        mLaneOdd = mLaneEven = mLaneDivider = mLaneDividerArp = gLanePlane = gGhostFretPlane = null;
        chordFrameGradTex = chordFrameGradTexArp = null;
        pFretColMarker = null;
        _fretMarkerWaveCache.clear();
        gNote = gSus = gBeat = gTapChevron = null;
        ctx.cam.tgtX = ctx.cam.curX = xFretMid(CAM_LOCK_CENTER_FRET); ctx.cam.tgtDist = ctx.cam.curDist = CAM_DIST_BASE; ctx.cam.tgtLookY = ctx.cam.curLookY = 0; ctx.cam._fretRowFitBoost = 1; nStr = NSTR; resetOobStringWarned();
        ctx.cam._lookaheadCamX = xFretMid(CAM_LOCK_CENTER_FRET);
        ctx.cam._lookaheadFretSpan = DEFAULT_LOOKAHEAD_FRET_SPAN;
        ctx.cam._lookaheadCamPrevNow = null;
        ctx.cam._lookaheadLowBonusU = 0;
        ctx.cam._lookaheadHiNeckLatch = false;
        _measureStarts = []; _measureStartsRef = null;
        _clkAudioT = NaN; _clkPerf = NaN; _clkRate = 1; _frameNow = 0;
        ctx.cam.prevLowFretBonus = 0;
        ctx.cam.prevLockActive = false;
        ctx.cam._camSnapped = false;
        ctx.cam._camPreScanned = false;
        ctx.cam._camBootstrapHolding = false;
        ctx.cam._camBootstrapMode = null;
        ctx.cam._songKey = null;
        _slideTargetSet = null;
        _slideTargetNotesRef = null;
        _slideTargetChordsRef = null;
    }

    /* ── setRenderer contract ────────────────────────────────────────── */
    return {
        // Tells highway.js this renderer needs a webgl2-capable canvas.
        // Browsers lock a <canvas> to the first context type acquired,
        // so when this renderer is installed mid-session highway.js
        // replaces the underlying <canvas> element so getContext('webgl2')
        // can succeed (see static/highway.js _replaceCanvas).
        contextType: 'webgl2',
        init(canvas, bundle) {
            _unsubscribeFocus();
            if (wrap || ren) {
                teardown();
            }
            _destroyed = _isReady = false;
            _isFocused = true;
            if (!_paneUid) _paneUid = nextPaneCounter();   // fallback pane id (no-arrangement panes)
            _registerTunerShortcut();   // session-global tuner shortcut (self-guarded)
            const myToken = ++_initToken;
            highwayCanvas = canvas;
            _invertedCached = !!(bundle && bundle.inverted);
            _leftyCached = !!(bundle && bundle.lefty);
            _renderScale = (bundle && bundle.renderScale) || 1;
            // Per-render background opt-out. A plugin borrowing the highway as
            // a visualization can set bundle.bgReactive === false to suppress
            // the audio-reactive background for THIS instance only — without
            // writing the shared h3d_bg_* settings (which would also change the
            // host's own highway). Motivation: the reactive bg taps the core
            // <audio> element, and when another consumer already holds it the
            // setup throws + the cleanup AudioContext.close() is an audible
            // click — which a borrower that never taps <audio> (e.g. a
            // contained-playback practice plugin) inherits for no benefit.
            // Default behavior is unchanged when the field is absent.
            backgroundReactiveOptOut = !!(bundle && bundle.bgReactive === false);

            if (splitscreenActive()) {
                window.feedBackSplitscreen.onFocusChange(_onFocusChange);
                _focusSubscribed = true;
            }

            // Async-ready contract (feedBack#36 readyPromise). Resolves
            // when Three.js loaded + scene initialised (_isReady = true).
            // Rejects on any async failure so highway.js can revert.
            let _resolveReady, _rejectReady;
            this.readyPromise = new Promise((res, rej) => {
                _resolveReady = res;
                _rejectReady = rej;
            });
            // Shared rejection for superseded init cycles (destroy() or a
            // newer init() started before this one completed). highway.js
            // ignores the rejection when the renderer is no longer active.
            const _rejectSuperseded = () => _rejectReady(new Error('superseded'));

            loadThree().then(() => {
                if (_destroyed || _initToken !== myToken) {
                    _rejectSuperseded();
                    return;
                }
                try {
                    nStr = resolveStringCount(bundle);
                    _invertedForBoard = _invertedCached;
                    _leftyForBoard = _leftyCached;
                    if (!initScene()) { _unsubscribeFocus(); _rejectReady(new Error('initScene failed')); return; }
                    // Pre-compile shaders + upload deterministic label
                    // textures while the load spinner is still up; the
                    // chart-dependent half runs on first draw() (bundle
                    // arrays are only guaranteed populated post-ready).
                    _prewarmStatic();
                    _chartPrewarmed = false;
                    const sz = canvasSize(highwayCanvas);
                    // Mark ready before RAF so any resize(w,h) calls that arrive
                    // in the meantime (e.g. from sizeCanvases()) are applied directly.
                    _isReady = true;
                    // Claim the shared player-chrome control only now that the
                    // renderer is actually viable. Acquiring at the top of init()
                    // meant a machine without WebGL2 mounted a Background control
                    // for a renderer that never drew a frame, and no failure path
                    // below released it.
                    if (!backgroundControlAcquired) { backgroundControlAcquired = true; acquireBackgroundControl(); }
                    _resolveReady();
                    _updateFocusState();
                    if (sz.w > 0 && sz.h > 0) {
                        cameraLifecycle.applySize(sz.w, sz.h);
                    } else {
                        // Panel container not yet laid out (sizeCanvases() runs after
                        // initPanel() in the setup sequence). Retry each frame until
                        // the panelDiv has real dimensions.
                        (function retrySize() {
                            if (_destroyed || !_isReady) return;
                            const s = canvasSize(highwayCanvas);
                            if (s.w > 0 && s.h > 0) cameraLifecycle.applySize(s.w, s.h);
                            else requestAnimationFrame(retrySize);
                        })();
                    }
                } catch (e) {
                    console.error('[3D-Hwy] init .then() threw:', e);
                    _isReady = false;
                    _unsubscribeFocus(); teardown();
                    _rejectReady(e);
                }
            }).catch(e => {
                if (_initToken !== myToken || _destroyed) {
                    _rejectSuperseded();
                    return;
                }
                console.error('[3D-Hwy] Three.js unavailable:', e);
                _unsubscribeFocus();
                _rejectReady(e);
            });
        },

        // The host throttles paused frames to ~10 fps, on the assumption
        // that a paused chart is a static picture and re-rendering it is
        // pure waste (highway-constants._PAUSED_FRAME_INTERVAL_MS).
        //
        // That stopped being true when the venue landed. The venue backdrop
        // is a PLAYING VIDEO and the crowd reacts on its own clock, and they
        // are drawn into this same canvas as the highway — so throttling the
        // highway throttled the whole room. Pausing the song dropped the
        // venue, the crowd and the stage to 10 fps.
        //
        // Two independent sources of motion, and BOTH must keep their frames:
        //
        //  • a crowd video rolling on its own clock (career venue pack), and
        //  • the venue scene's own fake-depth motion — the backdrop breathes,
        //    the haze drifts, warmth pulses, the shimmer moves. That is
        //    Math.sin(t) in the draw loop (see _venueApplyFakeDepthMotion),
        //    so it only moves while we are actually given frames, and it runs
        //    with NO pack at all.
        //
        // The throttle fires whenever the CHART CLOCK is stalled — which is
        // not just a pause. A count-in and the credits/author overlay stall it
        // exactly the same way, so the venue was stuttering there too.
        //
        // With no venue at all (plain 3D highway) the paused scene really is a
        // still picture: motion mode reads 'off', we claim nothing, and the
        // throttle still saves the GPU as #654 intended.
        needsContinuousFrames() {
            if (!_isReady || _ctxLost) return false;
            for (const v of _venueCrowdVideos) {
                if (v && !v.paused && !v.ended && v.readyState >= 2) return true;
            }
            // 'off' also covers prefers-reduced-motion and "no venue scene".
            try { return _venueEffectiveMotionMode() !== 'off'; } catch (_) { return false; }
        },

        draw(bundle) {
            if (!_isReady) return;
            if (_ctxLost) return;   // GPU context lost (alt-tab / reset) — skip until restored
            if (!_chartPrewarmed) {
                _chartPrewarmed = true;
                _prewarmChart(bundle);
            }
            _invertedCached = !!bundle.inverted;
            _leftyCached = !!bundle.lefty;
            const newNStr = resolveStringCount(bundle);
            const newScale = bundle.renderScale || 1;
            const leftyChanged = _leftyCached !== _leftyForBoard;
            if (_invertedCached !== _invertedForBoard || leftyChanged || newNStr !== nStr) {
                if (newNStr !== nStr) {
                    resetOobStringWarned();
                    // Drop chord caches computed under the old string count
                    // so extended-range notes (string 6+) aren't left
                    // filtered out of cached shapes.
                    _resetStringDependentCaches();
                }
                if (leftyChanged) {
                    ctx.cam.curX = -ctx.cam.curX;
                    ctx.cam.tgtX = -ctx.cam.tgtX;
                    ctx.cam._lookaheadCamX = -ctx.cam._lookaheadCamX;
                }
                nStr = newNStr;
                buildBoard();
                _invertedForBoard = _invertedCached;
                _leftyForBoard = _leftyCached;
            }
            if (newScale !== _renderScale) {
                _renderScale = newScale;
                const s = canvasSize(highwayCanvas);
                if (s.w > 0 && s.h > 0) cameraLifecycle.applySize(s.w, s.h);
            }
            // Keep the render matched to the highway canvas's real box.
            // Two independent drifts to catch each frame:
            //  1. Backing store (canvas.width/height) changed out from under
            //     us — e.g. the splitscreen hw.resize override resizes the
            //     element but never calls renderer.resize(). Also re-sizes
            //     the lyrics overlay canvas via applySize().
            //  2. The CSS box (canvasSize()) drifted while the backing store
            //     held. #highway is flex:1, so its rendered height changes as
            //     the player layout settles right after a song opens — with
            //     no backing-store change and no window 'resize' event, so the
            //     check above never fires. Without this the camera stays framed
            //     for the pre-settle (too-tall) size and crops the near strings
            //     / fret numbers until the user un/re-maximizes the window.
            if (highwayCanvas) {
                // Backing-store drift (branch 1) is detected with cheap
                // property reads every frame. The CSS-box checks (branches
                // 2/3) need canvasSize() → getBoundingClientRect(), a
                // forced layout read — profiled at ~1.2% of throttled
                // main-thread time when run per frame. Throttle the box
                // read to every 10th frame (plus whenever the backing
                // store changed or the wrap isn't pinned yet): the layout
                // settle it exists to catch plays out over hundreds of ms
                // right after a song opens, so a ~166 ms detection cadence
                // loses nothing visible.
                const _bsChanged = highwayCanvas.width !== _lastHwW
                    || highwayCanvas.height !== _lastHwH;
                const _applied = cameraLifecycle.getAppliedSize();
                _boxCheckCountdown = (_boxCheckCountdown + 1) % 10;
                if (_bsChanged || !_applied.pinned || _boxCheckCountdown === 0) {
                    const box = canvasSize(highwayCanvas);
                    if (_bsChanged) {
                        _lastHwW = highwayCanvas.width;
                        _lastHwH = highwayCanvas.height;
                        if (box.w > 0 && box.h > 0) cameraLifecycle.applySize(box.w, box.h);
                    } else if (box.w > 0 && box.h > 0 &&
                            (Math.abs(box.w - _applied.w) > 1 || Math.abs(box.h - _applied.h) > 1)) {
                        cameraLifecycle.applySize(box.w, box.h);
                    } else if (!_applied.pinned && box.w > 0 && box.h > 0 &&
                            highwayCanvas.offsetWidth > 0 && highwayCanvas.offsetHeight > 0) {
                        //  3. The overlay pin couldn't be applied at init because
                        //     #highway had no layout yet (offsetWidth/Height === 0),
                        //     so applySize() only set the wrap height. The canvas has
                        //     now laid out but to the same logical size, so neither
                        //     drift branch above fires — re-run applySize to pin the
                        //     wrap to the canvas box now that its offsets are real.
                        //     Otherwise the overlay stays at top:0;left:0;right:0 and
                        //     a strip of #highway is exposed on first load / split.
                        cameraLifecycle.applySize(box.w, box.h);
                    }
                }
            }
            update(bundle);
            cameraLifecycle.camUpdate(bundle);

            // Background animations (#13). Compute frame dt once,
            // read audio bands when reactivity is on, delegate to
            // the active style's update().
            if (bgGroup && backgroundMount.effectiveBackgroundStyleId() !== 'off') {
                const nowMs = performance.now();
                const dt = backgroundLastT === 0 ? 1 / 60 : Math.min(0.1, (nowMs - backgroundLastT) / 1000);
                backgroundLastT = nowMs;
                const bands = ctx.settings.bgReactive ? readAudioBands() : ZERO_AUDIO_BANDS;
                const style = BACKGROUND_STYLES[backgroundMount.effectiveBackgroundStyleId()];
                const bgState = backgroundMount.getBgState();
                if (style && bgState) {
                    try { style.update(bgState, bands, dt, nowMs / 1000); }
                    catch (e) { console.error('[3D-Hwy] bg update threw', backgroundMount.effectiveBackgroundStyleId(), e); }
                }
            }

            // Browser: the shared analyser can change between songs (a sloppak
            // stems swap replaces it, often on a new context) — or may not have
            // existed when the controller mounted. Keep the visualizer bound to
            // the LIVE analyser by comparing against what the controller
            // actually bound (boundAnalyser()), not a separately-tracked guess:
            // cheap reconnect when it's the same context, full controller
            // rebuild when the context changed (cross-context connectAudio is
            // impossible). Only act once the viz is ready (ready()), so we
            // don't thrash a controller that's still loading async. Done before
            // the render block so a rebuild this frame just skips one bc frame
            // (bcCtrl goes null) without affecting the highway's own render.
            if (bcCtrl && !isDesktopAudioHost() && bcCtrl.ready && bcCtrl.ready()) {
                let a = null;
                try { a = getAudioAnalyser(); } catch (e) { a = null; }
                const an = a && a.analyser;
                const bound = bcCtrl.boundAnalyser ? bcCtrl.boundAnalyser() : null;
                if (an && an !== bound) {
                    if (!(bcCtrl.reconnectAudio && bcCtrl.reconnectAudio(a))) {
                        // Context changed (or reconnect failed) — rebuild via the
                        // proven destroy/create paths so the new context binds.
                        try { bcCtrl.destroy(); } catch (e) {}
                        bcCtrl = null;
                        backgroundMount.syncButterchurnMode();
                    }
                }
            }
            if (bcCtrl) {
                const cfg = loadButterchurnSettings();
                const _ct = bundle.currentTime || 0;
                if (cfg.chartAccents) {
                    if (_ct < _chartPrevT - 0.08 || _ct - _chartPrevT > 1.0) {
                        butterchurnBeatIdx = fastForwardIndex(bundle.beats, _ct, 'time');
                        butterchurnNoteIdx = fastForwardIndex(bundle.notes, _ct, 't');
                        butterchurnChordIdx = fastForwardIndex(bundle.chords, _ct, 't');
                    }
                    const _beats = bundle.beats || [];
                    while (butterchurnBeatIdx < _beats.length && _beats[butterchurnBeatIdx].time <= _ct) {
                        const strong = _beats[butterchurnBeatIdx].measure !== undefined && _beats[butterchurnBeatIdx].measure !== -1;
                        _chartEnv = Math.max(_chartEnv, strong ? 1.0 : 0.6);
                        butterchurnBeatIdx++;
                    }
                    const _notes = bundle.notes || [];
                    let _tintS = -1;
                    while (butterchurnNoteIdx < _notes.length && _notes[butterchurnNoteIdx].t <= _ct) {
                        _chartEnv = Math.max(_chartEnv, 0.6);
                        _tintS = _notes[butterchurnNoteIdx].s;
                        butterchurnNoteIdx++;
                    }
                    const _chords = bundle.chords || [];
                    while (butterchurnChordIdx < _chords.length && _chords[butterchurnChordIdx].t <= _ct) {
                        _chartEnv = Math.max(_chartEnv, 0.95);
                        butterchurnChordIdx++;
                    }
                    if (_tintS >= 0 && ctx.settings.activePalette && ctx.settings.activePalette.length) {
                        butterchurnTintTarget = ctx.settings.activePalette[((_tintS % ctx.settings.activePalette.length) + ctx.settings.activePalette.length) % ctx.settings.activePalette.length];
                    }
                    _chartPrevT = _ct;
                    _chartEnv *= 0.86;
                    bcCtrl.chart(_chartEnv * (cfg.chartStrength != null ? cfg.chartStrength : 1));
                } else {
                    bcCtrl.chart(0);
                }
                if (cfg.colorTint && butterchurnTintTarget != null) {
                    const tr = (butterchurnTintTarget >> 16) & 255, tg = (butterchurnTintTarget >> 8) & 255, tb = butterchurnTintTarget & 255;
                    _tintR += (tr - _tintR) * 0.06; _tintG += (tg - _tintG) * 0.06; _tintB += (tb - _tintB) * 0.06;
                    bcCtrl.tint((Math.round(_tintR) << 16) | (Math.round(_tintG) << 8) | Math.round(_tintB), cfg.tintStrength != null ? cfg.tintStrength : 0.65);
                } else {
                    bcCtrl.tint(null, 0);
                }
                bcCtrl.render();
            }
            {
                const _jNow = performance.now();
                const _jdt = _juiceLastT === 0 ? 1 / 60 : Math.min(0.05, (_jNow - _juiceLastT) / 1000);
                _juiceLastT = _jNow;
                _sparkUpdate(_jdt);
                _streakHeat += (Math.min(1, noteVerdictState.streakHits / 16) - _streakHeat) * 0.08;   // #7 ease heat
            }
            {
                const comp = (ctx.settings._bloom && !splitscreenActive()) ? bloomComposer.getResizedBloomComposer() : null;
                if (comp) {
                    if (ren.toneMapping !== T.ACESFilmicToneMapping) ren.toneMapping = T.ACESFilmicToneMapping;
                    pbBeg(6); comp.render(); pbEnd(6);
                } else {
                    if (ren.toneMapping !== T.NoToneMapping) ren.toneMapping = T.NoToneMapping;
                    pbBeg(6); ren.render(scene, cam); pbEnd(6);
                }
            }
            if (lyricsCtx && lyricsCanvas) {
                lyricsCtx.clearRect(0, 0, lyricsCanvas.width, lyricsCanvas.height);
                // Capture the actual lyrics-banner bottom so overlay cards
                // step down past every wrapped row, not just a 2-row estimate.
                let lyricsBottom = 0;
                if (bundle.lyricsVisible && bundle.lyrics?.length) {
                    lyricsBottom = drawLyrics(bundle.lyrics, bundle.currentTime, lyricsCtx, lyricsCanvas.width, lyricsCanvas.height, lyricsCache) || 0;
                }
                scoreFx.drawNotedetectLabels(lyricsCtx, lyricsCanvas.width, lyricsCanvas.height);
                scoreFx.drawScoreFx(lyricsCtx, lyricsCanvas.width, lyricsCanvas.height);

                // Corner-stacking: overlays drawn first claim the topmost slot;
                // later overlays are pushed down by the accumulated height + gap.
                // Draw order (top → bottom per corner):
                //   1. FPS counter  — always first
                //   2. Section HUD
                //   3. Tone HUD
                //   4. Chord diagram — always last
                const STACK_GAP = 8;
                const cornerStack = { tl: 0, tr: 0, bl: 0, br: 0 };
                const stackPush = (pos, h) => {
                    if (pos in cornerStack && h > 0) cornerStack[pos] += h + STACK_GAP;
                };

                // 1. FPS counter (always top-right, always topmost).
                // EMA update runs unconditionally so the smoothed value is accurate
                // even when fpsVisible is off.
                const _fpsNowMs = performance.now();
                if (_fpsLastT > 0) {
                    const dt = _fpsNowMs - _fpsLastT;
                    if (dt > 0) {
                        const inst = 1000 / dt;
                        _fpsEma = _fpsEma === 0 ? inst : _fpsEma + (inst - _fpsEma) * (1 / 30);
                    }
                }
                _fpsLastT = _fpsNowMs;
                if (ctx.settings.fpsVisible) {
                    if (_fpsNowMs - _fpsLastSampleT > 250) {
                        _fpsDisplay = _fpsEma;
                        _fpsLastSampleT = _fpsNowMs;
                    }
                    const W = lyricsCanvas.width;
                    const H = lyricsCanvas.height;
                    const txt = _fpsDisplay.toFixed(1) + ' fps';
                    lyricsCtx.save();
                    lyricsCtx.font = 'bold 14px ui-monospace, Menlo, Consolas, monospace';
                    lyricsCtx.textAlign = 'right';
                    lyricsCtx.textBaseline = 'top';
                    const _fpsPadX = 8, _fpsPadY = 4;
                    const _fpsMetrics = lyricsCtx.measureText(txt);
                    const _fpsBoxW = Math.ceil(_fpsMetrics.width) + _fpsPadX * 2;
                    const _fpsBoxH = 14 + _fpsPadY * 2;
                    const _fpsE = 8;
                    // Keep it top-right but below the v3 Up Next pill / live HUD
                    // (whichever is showing) so the readout is never occluded.
                    const _fpsBaseY = Math.round(Math.max(
                        _fpsE + H * 0.06,
                        lyricsBottom + _fpsE,
                        _v3TopRightChromeBottom() + _fpsE,
                    ));
                    const _fpsX = W - 8 - _fpsBoxW;
                    const _fpsY = _fpsBaseY + cornerStack['tr'];
                    lyricsCtx.fillStyle = 'rgba(0,0,0,0.55)';
                    lyricsCtx.fillRect(_fpsX, _fpsY, _fpsBoxW, _fpsBoxH);
                    lyricsCtx.fillStyle = _fpsDisplay >= 55 ? '#7fff9a'
                        : _fpsDisplay >= 30 ? '#ffe84d' : '#ff6b6b';
                    lyricsCtx.fillText(txt, _fpsX + _fpsBoxW - _fpsPadX, _fpsY + _fpsPadY);
                    lyricsCtx.restore();
                    stackPush('tr', _fpsBoxH);
                }

                // 2. Section HUD.
                if (ctx.settings.sectionHudVisible && bundle.sections && bundle.sections.length) {
                    const secH = drawSectionHud(lyricsCtx, {
                        sections: bundle.sections,
                        currentTime: bundle.currentTime,
                        canvasW: lyricsCanvas.width, canvasH: lyricsCanvas.height,
                        position: ctx.settings.sectionHudPosition,
                        sizeSlider: ctx.settings.sectionHudSize,
                        lyricsBottom,
                        stackOffset: cornerStack[ctx.settings.sectionHudPosition] || 0,
                    });
                    stackPush(ctx.settings.sectionHudPosition, secH);
                }

                // 3. Tone HUD.
                if (ctx.settings.toneHudVisible && (bundle.toneChanges?.length || bundle.toneBase)) {
                    const toneH = drawToneHud(lyricsCtx, {
                        toneChanges: bundle.toneChanges,
                        toneBase: bundle.toneBase,
                        currentTime: bundle.currentTime,
                        canvasW: lyricsCanvas.width, canvasH: lyricsCanvas.height,
                        position: ctx.settings.toneHudPosition,
                        sizeSlider: ctx.settings.toneHudSize,
                        lyricsBottom,
                        stackOffset: cornerStack[ctx.settings.toneHudPosition] || 0,
                    });
                    stackPush(ctx.settings.toneHudPosition, toneH);
                }

                // 4. Chord diagram — always last (bottommost in the stack).
                // Draw outgoing first so the incoming diagram renders on top,
                // making the entrance scale-in animation visible during crossfades.
                // The outgoing (prev) diagram uses the same corner slot — it is
                // fading out while the incoming one fades in, so they share the
                // same stack position and don't double-count the height.
                if (ctx.settings.chordDiagramVisible && _diagPrev && _diagPrevOpacity > 0) {
                    chordDiagramCache.drawDiagramCached(lyricsCtx, {
                        name: _diagPrev.name, frets: _diagPrev.frets,
                        opacity: _diagPrevOpacity,
                        entranceT: (_diagPrev.t !== undefined)
                            ? Math.min(1.0, Math.max(0, (bundle.currentTime - _diagPrev.t) / DIAG_ENTRANCE_S))
                            : 1.0,
                        canvasW: lyricsCanvas.width, canvasH: lyricsCanvas.height,
                        inverted: _invertedCached,
                        sizeSlider: ctx.settings.chordDiagramSize, position: ctx.settings.chordDiagramPosition,
                        nStr: _diagPrev.nStr ?? nStr,
                        lyricsBottom,
                        stackOffset: cornerStack[ctx.settings.chordDiagramPosition] || 0,
                    });
                    // Don't push here — outgoing and incoming share the same slot.
                }
                if (ctx.settings.chordDiagramVisible && _diagChord) {
                    const diagH = chordDiagramCache.drawDiagramCached(lyricsCtx, {
                        name: _diagChord.name, frets: _diagChord.frets,
                        opacity: Math.max(0, 1 + (_diagChord.t - bundle.currentTime) / DIAG_LINGER_S),
                        entranceT: _diagEntranceT,
                        canvasW: lyricsCanvas.width, canvasH: lyricsCanvas.height,
                        inverted: _invertedCached,
                        sizeSlider: ctx.settings.chordDiagramSize, position: ctx.settings.chordDiagramPosition,
                        nStr: _diagChord.nStr ?? nStr,
                        lyricsBottom,
                        stackOffset: cornerStack[ctx.settings.chordDiagramPosition] || 0,
                    });
                    stackPush(ctx.settings.chordDiagramPosition, diagH);
                }
            }
            // Draw-hook compatibility: fire hooks registered via
            // window.highway.addDrawHook() on our 2D overlay canvas
            // so overlay plugins (fretboard, chord-label HUDs, etc.)
            // continue to render when the 3D renderer is active.
            // The hooks expect a 2D context — lyricsCtx is exactly
            // that, positioned above the WebGL surface.
            if (lyricsCtx && lyricsCanvas &&
                    window.highway &&
                    typeof window.highway.fireDrawHooks === 'function') {
                window.highway.fireDrawHooks(
                    lyricsCtx, lyricsCanvas.width, lyricsCanvas.height
                );
            }
        },

        resize(w, h) {
            if (!_isReady) return;
            const s = canvasSize(highwayCanvas);
            cameraLifecycle.applySize(s.w > 0 ? s.w : w, s.h > 0 ? s.h : h);
        },

        destroy() {
            _destroyed = true; _isReady = false; _diagChord = null; _diagPrev = null; _diagLastKey = null; chordDiagramCache.clearDiagramCache();
            _lastHwW = 0; _lastHwH = 0;
            // _appliedW/_appliedH/_wrapPinned reset dropped: they're now
            // cameraLifecycle's private state, and that whole factory is
            // reconstructed fresh on the next initScene() call (same as
            // every other post-3e slice's private state).
            ctx.cam._paneAspect = 0;
            if (cam && cam.fov !== BASE_VFOV) { cam.fov = BASE_VFOV; cam.updateProjectionMatrix(); }
            if (backgroundControlAcquired) { backgroundControlAcquired = false; releaseBackgroundControl(); }
            _unsubscribeFocus(); teardown();
            highwayCanvas = null;
        },
    };
}

window.feedBackViz_highway_3d = createFactory;
// Per-panel control descriptors (splitscreen). The palette selector was
// removed — per-string colors are set via the core "Highway String Colors"
// UI, which drives both highways by named string.
window.feedBackViz_highway_3d.panelControls = [
    {
        key: 'cameraSmoothing',
        label: 'Camera smoothing (X-pan)',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        default: SETTING_DEFAULTS.cameraSmoothing,
    },
    {
        key: 'cameraLockLow',
        label: 'Lock camera at frets 1-12',
        type: 'toggle',
        default: SETTING_DEFAULTS.cameraLockLow,
    },
    {
        key: 'cameraLockZoom',
        label: 'Locked zoom (In ↔ Out)',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        default: SETTING_DEFAULTS.cameraLockZoom,
    },
];
// Static metadata exposed on the factory:
//   panelControls      - optional, host-readable descriptors for a
//                        curated per-panel control surface. Renderer
//                        values still flow through loadSettings().
//   contextType        - required canvas context type. highway.js
//                        replaces the <canvas> element when the
//                        requested type differs from the current one,
//                        so this renderer can be installed mid-session
//                        even if the canvas was previously bound to 2D.
//   matchesArrangement - Auto-mode predicate. When the picker is on
//                        "Auto", core installs the first registered
//                        viz whose predicate returns truthy on the
//                        current song_info. Lead/Rhythm/Bass/Guitar
//                        arrangements route here; Keys arrangements
//                        are matched by the piano plugin instead.
//                        _canRun3D() in app.js still gates Auto from
//                        picking us on machines without WebGL2.
window.feedBackViz_highway_3d.contextType = 'webgl2';
window.feedBackViz_highway_3d.__test = {
    getAnalyserForBridgeTest: getAudioAnalyser,
    readBandsForBridgeTest: readAudioBands,
    resetAnalyserBridgeForTest: _resetAnalyserBridgeForTest,
};
// Canonical guitar arrangement names (server.py: _ALLOWED_ARRANGEMENT_NAMES)
// are Lead / Rhythm / Bass / Combo. `guitar` is included as a safety
// net for sources that use a generic name (older imports, third-party
// sloppaks). Word boundaries (\b) keep us from accidentally matching
// arrangements that merely contain these as substrings (e.g. a
// "BasslineKeys" arrangement would otherwise match `bass`).
window.feedBackViz_highway_3d.matchesArrangement = function (songInfo) {
    const arr = (songInfo && songInfo.arrangement) || '';
    return /\b(?:lead|rhythm|bass|combo|guitar)\b/i.test(arr);
};

// No imperative register() call needed: feedBack#272 introduced the
// consolidated tour menu, which discovers this plugin's tour automatically
// via /api/plugins (has_tour:true from plugin.json's tour field) and
// gates relevance on whether highway_3d is the active viz. A register()
// call with only injectTriggerInto was a no-op anyway since the new menu
// owns trigger placement; for buildSteps / onStart / onComplete / a
// custom screens override, register() is still the right hook.

