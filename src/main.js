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
    CHORD_FRAME_RIM_Z_MIN, CHORD_FRAME_RIM_Z_SCAL, CHORD_HWY_FADE_S, CHORD_HWY_LINGER_S, DDOTS,
    DEFAULT_LOOKAHEAD_FRET_SPAN, DIAG_CELL_MAX, DIAG_CROSSFADE_S, DIAG_ENTRANCE_S,
    DIAG_LINGER_S, DIAG_SIZE_MAX, DIAG_SIZE_MIN, DOTS, FOCUS_D, FOG_END, FOG_START,
    FRET_BOW_DZ, FRET_COOLDOWN, FRET_EMISSIVE, FRET_LABEL_GOLD_HEX, FRET_LABEL_IDLE_HEX,
    FRET_METALNESS, FRET_ROUGHNESS, FRET_ROW_FIT_BOOST_MAX, FRET_ROW_FIT_DEADBAND,
    FRET_ROW_FIT_NDC_MIN, FRET_SCALE, FRET_SPACING_ANCHOR_F, FRET_SPACING_STRETCH_ABOVE12,
    FRET_TUBE_RADIAL, FRET_TUBE_RADIUS, FRET_TUBE_SEG, FRET_WIRE_ACTIVE_HEX,
    FRET_WIRE_ACTIVE_OP, FRET_WIRE_HIT_DECAY, FRET_WIRE_HIT_EMISSIVE, FRET_WIRE_HIT_HEX,
    FRET_WIRE_HIT_INTENSITY, FRET_WIRE_HIT_OP, FRET_WIRE_IDLE_HEX, FRET_WIRE_IDLE_OP,
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
import { SETTING_DEFAULTS, BACKGROUND_STYLE_IDS, backgroundAxisColors, highwayAxisColors } from './settings/defaults.js';
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
import { drawChordDiagram } from './instance/overlay/chord-diagram.js';
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

// Camera tgtDist building blocks. Both the dynamic (camera-follow)
// and locked (frets 1-12) branches compose tgtDist from these, so
// any future tuning of the base zoom curve or low-fret pullback
// lands in both branches without drift.
//   span    — camDistMax - camDistMin in fret-span units
//   minFret — lowest fretted note in the camera window (or 1 for
//             the locked branch, which assumes nut chords)
const camBaseDistU = span => 65 + Math.max(span, 4) * 3;
const camLowFretPullbackU = minFret => Math.max(0, 5 - minFret) * 4;

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
    // The camera-target resolver (instance/render/camera-target.js),
    // (re)built in initScene().
    let cameraTarget = null;
    // The fret-number-row renderer (instance/render/fret-number-row.js),
    // (re)built in initScene().
    let fretNumberRow = null;
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
    // Chord diagram render cache. Keys: static layout inputs joined as a
    // string. Values: OffscreenCanvas (or <canvas>) rendered at opacity=1
    // entranceT=1 — composited each frame via drawImage + globalAlpha.
    // Cleared on canvas resize (bx/by depend on canvasW/H/lyricsBottom)
    // and on teardown/destroy.
    const _diagRenderCache = new Map();
    // Cap chosen to cover the ~5–6 active chord shapes per phrase while
    // keeping the cached-OffscreenCanvas footprint bounded (~50 MB per
    // panel at typical 1920×1080). A structural fix — caching a
    // tightly-sized box surface instead of the full overlay canvas —
    // is tracked as a follow-up.
    const _DIAG_CACHE_MAX  = 6;
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
    // Per-frame booleans: handShapes[i] passes inferArpeggioFromNotePattern
    // once (see fillArpeggioGhostInferFlags) so the note loop skips O(hs×notes)
    // rescans — ref fillArpeggioGhostInferFlags in update().
    let _arpGhostHsInferScratch = [];
    // Handshape start-times where ghost fret numbers show but [ ] brackets are suppressed
    // (synth-chord onset-match cases — not genuine arpeggios).
    let _arpSynthOnsetHsSet = new Set();
    /** Per-frame: ``handShapeIsArpeggioForLaneRail`` baked once — lane slices were O(96 × hs × infer). */
    let _arpLaneRailHsScratch = [];
    let _arpRailBoundLoScratch = [];
    let _arpRailBoundHiScratch = [];

    // ── Cross-frame caches for chart-static derivations ──────────────
    // The merge + arp-flag fills below depend only on chart-static
    // input arrays (handShapes / chords / chordTemplates / notes),
    // not on `now`. The bundle hands us the same array refs every
    // frame within an arrangement, so we can skip the recompute when
    // the inputs are identity-equal to the previous frame's. On dense
    // arrangements this avoids per-frame Set construction, nested
    // O(hs × notes) scans, and a sort — significant FPS recovery.
    let _mergeCacheResult = null;
    let _mergeCacheChordsRef = null;
    let _mergeCacheHsRef = null;
    let _mergeCacheTplRef = null;

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

    let _arpGhostInferRefHs = null;
    let _arpGhostInferRefNotes = null;
    let _arpGhostInferRefTpl = null;

    // Slide-target gem suppression. A Set of "t_s" keys for notes in
    // bundle.notes that are the linkNext destination of a preceding note
    // (single or chord). The gem is suppressed (skipBody=true) but the
    // sustain/slide trail still renders so the slide motion stays visible.
    let _slideTargetSet = null;
    let _slideTargetNotesRef = null;
    let _slideTargetChordsRef = null;

    let _laneRailFlagsRefHs = null;
    let _laneRailFlagsRefTpl = null;

    let _laneRailBoundsRefHs = null;
    let _laneRailBoundsRefChords = null;
    let _laneRailBoundsRefTpl = null;
    let _laneRailBoundsRefNotes = null;
    let _lastHwW = 0, _lastHwH = 0;
    // Frame counter for throttling the CSS-box drift check in draw()
    // (getBoundingClientRect is a forced layout read; see the comment
    // at the check).
    let _boxCheckCountdown = 0;
    // Last logical (CSS px) size handed to applySize(). #highway is a
    // flex:1 item, so its real rendered box (canvasSize()) can change as
    // the player layout settles after a song opens WITHOUT the backing
    // store (canvas.width) changing — which the _lastHwW/H check below
    // would miss. Tracking the applied logical size lets draw() detect
    // that CSS-box drift and re-frame, instead of the user having to
    // un/re-maximize the window.
    let _appliedW = 0, _appliedH = 0;
    // _paneAspect lives on ctx.cam now (see instance/ctx.js) -- cached so
    // camUpdate can recompute the horizontal-FOV-hold each frame (and react
    // to live __h3dAspectTune edits) without waiting for a resize.
    // Per-instance fallback id for the wide-pane tuner's pane key, used only
    // when this pane has no arrangement name to key by. Assigned once in
    // init(); overrides keyed off arrangement persist across songs, this
    // fallback is session-only.
    let _paneUid = 0;
    // True once applySize() has pinned the .h3d-wrap overlay to the
    // highway canvas's offset box. Stays false while the canvas has no
    // layout yet (init() can run before #highway has a real box, where
    // applySize falls back to the parent-panel size and only sets the
    // wrap height). The rAF loop re-pins once the canvas lays out even
    // when the logical render size is unchanged — otherwise the overlay
    // would stay at top:0;left:0;right:0 and expose a strip of #highway.
    let _wrapPinned = false;
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
    // pass. bgState is the active style's per-panel state object.
    let bgGroup = null, bgStage = null, bgState = null;
    let bgMountedStyleId = null;
    let bgStyleId = 'particles', bgIntensity = 0.5, bgReactive = true;
    // Active scene color theme (background + highway surface). Read in
    // loadSettings, applied by _applyBgTheme (clear + fog + board plane).
    let bgThemeId = 'default';   // BACKGROUND axis (clear + fog)
    let hwThemeId = 'default';   // HIGHWAY axis (board + lane + laneDim)
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
    // panel live without touching module-level state.
    let activePalette = PALETTES.default;
    // Content signature of the colors last applied to materials; lets
    // loadSettings force a retint when the in-place custom palette
    // changes values without changing array identity.
    let backgroundPaletteSig = '';
    // Fret digits on the board ghost (hollow preview at Z=0), not on
    // flying note bodies — see fretNumberGhostScope for chord-hand vs all.
    let showFretOnNote = false;
    let fretNumberGhostScope = 'chords';
    // Camera-X smoothing dial (issue #34). 0 = twitchy (track every
    // upcoming fret), 1 = calm (ignore small intra-cluster shifts).
    // Cached here and refreshed via the bg listener to avoid a
    // per-frame localStorage hit inside update().
    let cameraSmoothing = 0.5;
    // Per-axis follow-ups: zoom (tgtDist hysteresis) and vertical-tilt
    // (tgtLookY NDC self-correction) each get their own dial. Same
    // 0..1 shape; same caching pattern. Both mirror cameraSmoothing's
    // value when not explicitly stored, so existing users who only
    // ever moved the camera-smoothing slider get the same calmness on
    // the new axes by default.
    let zoomSmoothing = 0.5;
    let tiltSmoothing = 0.5;
    // Camera lock: when true, pin the camera to a fixed wide view of
    // frets 1-12 unless an upcoming note would otherwise be off-screen.
    // The lock disengages while any note above fret 12 is in the
    // lookahead window so the camera can briefly widen to include it,
    // then re-engages once the high note ages out.
    let cameraLockLow = false;
    // Zoom-level for the locked view. Slider 0..1 maps to a multiplier
    // on the locked tgtDist: 0 → CAM_LOCK_ZOOM_MIN (closest, biggest
    // fretboard), 0.5 → 1.0× (the default locked view), 1 → CAM_LOCK_ZOOM_MAX
    // (furthest). Inactive when the lock isn't engaged.
    let cameraLockZoom = 0.5;
    /** 'steady' = recency-weighted centroid + hysteresis (#34); 'lookahead' = wide preview window + smooth focal. */
    let cameraMode = SETTING_DEFAULTS.cameraMode;
    // Global text-size multiplier for in-scene text sprites (chord
    // names, fret labels, section banners, technique markers, etc.).
    // Slider is 0..1; mapped to a 0.5..1.5× multiplier with 0.5 = 1.0×
    // (current default behaviour). _textSizeMul is the materialized
    // multiplier — refreshed once per frame at the top of update()
    // and consumed by every text-sprite scale.set call inside update
    // and drawNote.
    let textSize = 0.5;
    let _textSizeMul = 1.0;
    let _textSizeMulApplied = -1;
    // Visual look dials (issue: pastel/washed-out feel + too-much-glow
    // complaint). vibrancy raises idle string/note opacity and de-whites
    // the hit-note body; glow scales every emissive contribution +
    // projection glow layer opacity. Sliders are 0..1; defaults lean
    // vivid + minimal-glow to match the requested out-of-box look.
    // _vibrancyIdleOp / _vibrancyProjOp are cached so
    // updateStringHighlights() and drawNote() don't recompute the
    // linear blend every frame.
    let vibrancy            = SETTING_DEFAULTS.vibrancy;
    let glowMul             = SETTING_DEFAULTS.glow;
    let _hitFx              = SETTING_DEFAULTS.hitFx;
    let _sparks             = SETTING_DEFAULTS.sparks;
    let _cinematic          = SETTING_DEFAULTS.cinematic;
    let _verdictMarks       = SETTING_DEFAULTS.verdictMarks;
    let _timingFx           = SETTING_DEFAULTS.timingFx;
    let _streakFx           = SETTING_DEFAULTS.streakFx;
    let _bloom              = SETTING_DEFAULTS.bloom;
    let _composer = null, _bloomPass = null, _bloomLoad = null, _bloomW = 0, _bloomH = 0;
    let _sparkPts = null, _sparkPos = null, _sparkCol = null, _sparkVel = null, _sparkLife = null;
    const _SPARK_N = 256;
    const _sparkSeen = new Map();     // note-key -> expiry; one burst per hit
    let _juiceLastT = 0;              // frame-dt clock for the juice layer
    let _streakHeat = 0;  // #7 consecutive-hit escalation (streakHits itself lives on noteVerdictState — see its decl above)
    let fpsVisible           = SETTING_DEFAULTS.fpsVisible;
    let fretDividersVisible  = SETTING_DEFAULTS.fretDividersVisible;
    let chordDiagramVisible  = SETTING_DEFAULTS.chordDiagramVisible;
    let chordDiagramSize     = SETTING_DEFAULTS.chordDiagramSize;
    let chordDiagramPosition = SETTING_DEFAULTS.chordDiagramPosition;
    let fretColumnMarkerCadence = SETTING_DEFAULTS.fretColumnMarkerCadence;
    let inlayLabelsVisible = SETTING_DEFAULTS.inlayLabelsVisible;
    let sectionLabelsOnHighway = SETTING_DEFAULTS.sectionLabelsOnHighway;
    let sectionHudVisible      = SETTING_DEFAULTS.sectionHudVisible;
    let sectionHudPosition     = SETTING_DEFAULTS.sectionHudPosition;
    let sectionHudSize         = SETTING_DEFAULTS.sectionHudSize;
    let toneHudVisible         = SETTING_DEFAULTS.toneHudVisible;
    let toneHudPosition        = SETTING_DEFAULTS.toneHudPosition;
    let toneHudSize            = SETTING_DEFAULTS.toneHudSize;
    let nutHeadstockVisible    = SETTING_DEFAULTS.nutHeadstockVisible;
    let tuningLabelsVisible    = SETTING_DEFAULTS.tuningLabelsVisible;
    let nutColor               = SETTING_DEFAULTS.nutColor;
    let headstockColor         = SETTING_DEFAULTS.headstockColor;
    let projectionVisible      = SETTING_DEFAULTS.projectionVisible;   // board "note preview" ghost on the fretboard
    let slideArrowApproachVisible = SETTING_DEFAULTS.slideArrowApproachVisible; // slide-direction arrow riding with the note/gem
    let slideArrowNeckVisible      = SETTING_DEFAULTS.slideArrowNeckVisible;    // slide-direction arrow preview on the neck
    let slideArrowChainPreviewVisible = SETTING_DEFAULTS.slideArrowChainPreviewVisible; // early neck preview for chained/multi-leg slides
    let _vibrancyIdleOp = 0.4  + 0.6  * SETTING_DEFAULTS.vibrancy;
    let _vibrancyProjOp = 0.15 + 0.35 * SETTING_DEFAULTS.vibrancy;
    // Custom image asset (issue #19). Data URL is the bytes that
    // drive the 'image' bg style's texture; name is display-only
    // metadata that settings.html shows next to the file picker.
    let bgCustomImageDataUrl = '';
    let bgCustomImageName = '';
    // Custom video asset (issue #19 follow-up). Stores the
    // server-side filename only; bytes live on disk via routes.py.
    // The renderer composes the served URL from this filename in
    // BACKGROUND_STYLES.video.build.
    let bgCustomVideoName = '';
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
    // Previous-frame `now` for the chord-verdicts pruner — on a
    // backward seek the latches behind that time become "future"
    // entries the forward-only prune can't reach, so we wipe the
    // map instead of paying an O(n) scan per frame to find them.
    let _chordVerdictsLastNow = null;
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

    // ── Score FX (notedetect game-scoring layer, notedetect ≥1.13) ──
    // Two channels: (1) per-note "+N" score pops, sourced from the
    // note-state provider's new { points, mult, popKey } fields at the
    // moment a gem's verdict lands; (2) session-level bursts/pulses from
    // the new `notedetect:fx` event (streak milestones, multiplier tier
    // changes, streak breaks). Everything renders on the 2D overlay
    // canvas (same layer as drawNotedetectLabels) — no Three.js objects,
    // no textSprites.txtMat() cache entries, nothing to dispose. Pools are fixed-
    // size slot arrays created once per factory instance; when all slots
    // are busy a new effect is simply dropped.
    const _FX_POP_LIFE_MS = 700;
    const _FX_BURST_LIFE_MS = 900;
    const _FX_BURST_N = 36;
    const _fxPops = Array.from({ length: 24 }, () => (
        { active: false, x: 0, y: 0, z: 0, bornMs: 0, text: '', mult: 1 }
    ));
    const _fxBursts = Array.from({ length: 4 }, () => ({
        active: false, bornMs: 0,
        px: new Float32Array(_FX_BURST_N), py: new Float32Array(_FX_BURST_N),
        vx: new Float32Array(_FX_BURST_N), vy: new Float32Array(_FX_BURST_N),
    }));
    // popKey -> expiry ms. Dedupes pops (chord members share the chord's
    // popKey; sustains keep returning points for the whole glow window).
    const _fxSeen = new Map();
    let _fxOnFx = null;          // notedetect:fx listener (window)
    let _fxOnSkin = null;        // notedetect:skin bus listener
    // Generation counter: bumped by teardown() so the deferred window-
    // copy fallback (a zero-delay task the listener removal can't cancel)
    // bails instead of re-arming ring/burst state after teardown — or,
    // worse, leaking a stale event into a subsequent init's fresh state.
    let _fxGen = 0;
    let _fxLastFxDetail = null;  // reference dedup: window + instanceRoot dispatches share one detail
    // Details seen via element-scoped (bubbled) dispatch. A WeakSet, not a
    // single slot: one judged hit can emit several fx in the same task
    // (milestone + multiplier tier-up), and the deferred window-copy
    // fallback for the FIRST must still see that its element copy arrived
    // after the SECOND overwrote any last-detail slot. GC reclaims
    // entries once notedetect drops the detail objects.
    let _fxElemSeen = new WeakSet();
    let _fxRingMs = -1e9;        // multiplier ring-pulse anchor
    let _fxRingMult = 1;
    // Canvas-side palette per notedetect skin (mirrors the accents in
    // notedetect's assets/plugin.css; fonts are document-loaded by that
    // stylesheet so the overlay canvas can use the family names).
    const _FX_PALETTES = {
        neon:    { accent: '#00f0ff', accent2: '#ff2ec4', font: 'Orbitron' },
        esports: { accent: '#e8b43a', accent2: '#f5f5f4', font: 'Rajdhani' },
        metal:   { accent: '#ffb347', accent2: '#ff6b35', font: 'Russo One' },
    };
    let _fxPalette = _FX_PALETTES.neon;
    function _fxResolvePalette() {
        let skin = null;
        try { skin = localStorage.getItem('feedBack_notedetect_skin'); } catch (e) {}
        _fxPalette = _FX_PALETTES[skin] || _FX_PALETTES.neon;
    }
    function _fxSpawnPop(popKey, points, mult, x, y, z) {
        if (_fxSeen.has(popKey)) return;
        const nowMs = noteDetectFrameNowMs || performance.now();
        _fxSeen.set(popKey, nowMs + 4000);
        for (let i = 0; i < _fxPops.length; i++) {
            const p = _fxPops[i];
            if (p.active) continue;
            p.active = true;
            p.x = x; p.y = y; p.z = z;
            p.bornMs = nowMs;
            p.text = '+' + points;
            p.mult = mult || 1;
            return;
        }
    }
    function _fxSpawnBurst(nowMs) {
        for (let i = 0; i < _fxBursts.length; i++) {
            const b = _fxBursts[i];
            if (b.active) continue;
            b.active = true;
            b.bornMs = nowMs;
            for (let j = 0; j < _FX_BURST_N; j++) {
                const a = (j / _FX_BURST_N) * Math.PI * 2;
                const sp = 2 + (j % 5) * 0.8;
                b.px[j] = 0; b.py[j] = 0;
                b.vx[j] = Math.cos(a) * sp;
                b.vy[j] = Math.sin(a) * sp - 1.2;
            }
            return;
        }
    }
    function _fxHandle(d) {
        // Reference dedup — notedetect dispatches the SAME detail object
        // on window and on its instanceRoot; whichever arrives first wins.
        if (d === _fxLastFxDetail) return;
        _fxLastFxDetail = d;
        const nowMs = performance.now();
        if (d.fxType === 'milestone') {
            _fxSpawnBurst(nowMs);
        } else if (d.fxType === 'multiplier' && d.mult > (d.prevMult || 1)) {
            _fxRingMs = nowMs;
            _fxRingMult = d.mult;
        }
        // NOTE: 'streakBreak' is deliberately unhandled. It used to arm a
        // full-screen red flash; that effect was removed outright (it washed
        // the whole panel mid-song, including the notes you were trying to
        // read). The event is simply ignored now. The other streak feedback —
        // the hit-heat spark escalation gated on _streakFx in drawNote — is
        // unaffected. Don't reintroduce a full-panel fill here.
    }

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
    // Set true once a chart with out-of-range s indices has triggered
    // its warning. Reset only on teardown or when nStr changes (e.g.
    // arrangement switch from guitar to bass) — same-nStr songs share
    // the suppression, which is fine for what is purely a developer
    // aid log.
    let _oobStringWarned = false;

    // Per-string bounds check used by every loop that indexes a
    // per-string array (noteState.*, nextNoteByString, lastFretForString,
    // mStr/mGlow/mSus, ...). Skipping out-of-range s upstream keeps
    // sparse-array extension out of those arrays AND keeps drawNote's
    // material lookup safe in one place.
    function validString(s) {
        const ok = Number.isInteger(s) && s >= 0 && s < nStr;
        if (!ok && !_oobStringWarned) {
            _oobStringWarned = true;
            let msg = '[3D-Hwy] dropping notes with s out of range [0,' + nStr + ')';
            if (nStr === S_COL.length) msg += ' (extended-range chart beyond palette size)';
            console.warn(msg);
        }
        return ok;
    }

    // filter() allocates a new array per chord per frame, even though
    // the vast majority of charts have no out-of-range strings. Scan
    // first; only allocate when there's actually something to drop.
    // The unfiltered array is reused as-is in the common case.
    //
    // Result is cached by ``ch.notes`` identity — call sites (chord
    // render loop, camera pre-pass, strGlow / accent prepasses, cjNext
    // peek) hit the same chord-notes array many times per frame, and
    // the array contents are chart-static for the lifetime of the
    // arrangement. The cache stores either the input array itself
    // (common case) or the filtered copy, so the identity-preservation
    // contract callers depend on is unchanged.
    // NOTE: this cache (and _chordSigCache / _chordShapeCache, now in
    // instance/model/chord-inference.js) keys on the notes/chord object but
    // its result depends on validString() → nStr. If first computed while
    // nStr is still the default 6 (an early frame before song_info applies
    // stringCount), string-6+ notes get filtered out and would stay gone
    // forever. The nStr-change handler resets all three via
    // _resetStringDependentCaches() so extended-range (7+ string) charts
    // recompute once the real string count arrives.
    let _filterValidNotesCache = new WeakMap();
    function filterValidNotes(notes) {
        const cached = _filterValidNotesCache.get(notes);
        if (cached !== undefined) return cached;
        let filtered = notes;
        for (let i = 0; i < notes.length; i++) {
            if (!validString(notes[i].s)) {
                filtered = notes.filter(cn => validString(cn.s));
                break;
            }
        }
        _filterValidNotesCache.set(notes, filtered);
        return filtered;
    }
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
        _filterValidNotesCache = new WeakMap();
        chordInference.resetStringDependentCaches();
        // chordInference.mergeHandShapeSynthChords() is nStr-dependent too: its synth
        // notes come from chordNotesFromTemplate() -> validString(). The
        // merge result is memoised by input identity (not nStr), so force a
        // recompute or string-6+ template notes stay dropped from synth
        // chords after the count grows.
        _mergeCacheResult = null;
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
    const _scrNextNoteByString   = new Array(MAX_RENDER_STRINGS).fill(null);
    const _scrLastFretForString  = new Array(MAX_RENDER_STRINGS).fill(undefined);
    // Scratch buffer for the recent-past-event prepass (~0.6 s back) — avoids
    // re-allocating a per-string Array every frame. Re-filled with -Infinity
    // at the top of each prepass run.
    const _scrRecentByString     = new Array(MAX_RENDER_STRINGS).fill(-Infinity);
    // Scratch buffers for the ghost-preview gap prepass — refilled each
    // frame to avoid the `new Array(nStr)` + `Object.create(null)` churn.
    // The Map is cleared at the top of the prepass; live entries are
    // consumed by drawNote() reads later in the same frame.
    const _scrGhostLastT         = new Array(MAX_RENDER_STRINGS).fill(-Infinity);
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
    // Scratch objects for the nextNoteByString prepass — chord notes need
    // a merged `{ ...cn, t: ch.t }` object, but spread allocates every frame.
    // One scratch object per string (max MAX_RENDER_STRINGS) is safe because:
    // (a) the prepass writes each string's entry at most once per frame,
    // (b) drawNote() reads nxFrame.t before the next frame's prepass can overwrite.
    const _scrNextNoteByStringData = Array.from({ length: MAX_RENDER_STRINGS }, () => ({}));
    // Reusable Set for arpeggio persistence key lookup — cleared each frame
    // instead of reallocating a new Set.
    const _scrArpPersistKeys = new Set();
    // Reusable Set for active-fret cooldown tracking — cleared each frame.
    const _scrActiveFrets = new Set();
    // Sorted scalar view of "next event time per string ∪ recent event
    // time per string" — populated once per frame in update() after
    // _drawNextByString and _drawRecentByString are set. drawNote() and
    // the chord render loop both need "earliest event time strictly
    // greater than t" to deadline-cap gem visibility; the previous
    // implementation re-scanned both per-string arrays (2 * nStr
    // lookups) per note/chord per frame, which is hot in dense
    // PM/FH/arpeggio passages. With this scratch the same query is
    // O(log N) over at most 2 * MAX_RENDER_STRINGS = 16 entries via
    // _firstEventTimeGreaterThan(). Capacity is fixed (Float64Array)
    // to keep the buffer in stable memory; _scrEventTimesLen tracks
    // the live prefix.
    const _scrEventTimes    = new Float64Array(MAX_RENDER_STRINGS * 2);
    let   _scrEventTimesLen = 0;
    function _firstEventTimeGreaterThan(t) {
        let lo = 0, hi = _scrEventTimesLen;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (_scrEventTimes[mid] <= t) lo = mid + 1;
            else hi = mid;
        }
        return lo < _scrEventTimesLen ? _scrEventTimes[lo] : Infinity;
    }

    // Camera state
    let _leftyCached = false;
    const xFret = f => (_leftyCached ? -fretX(f) : fretX(f));
    const xFretMid = f => (_leftyCached ? -fretMid(f) : fretMid(f));
    const boardSpanX = () => {
        const x0 = xFret(0);
        const xN = xFret(NFRETS);
        return {
            min: Math.min(x0, xN),
            max: Math.max(x0, xN),
            center: (x0 + xN) / 2,
            width: Math.abs(xN - x0),
        };
    };

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
    let _invertedCached = false;
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

    // ── String-to-Y (respects invert) ─────────────────────────────────
    const sY = s => S_BASE + (_invertedCached ? s : (nStr - 1 - s)) * S_GAP;

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
        if (activePalette) {
            // activePalette entries are numeric hex (PALETTES) or already hex strings;
            // convert without instantiating T.Color per string — this signature is
            // built every frame inside _syncOpenStringPitchLabels.
            const lim = Math.min(activePalette.length, nLab);
            for (let i = 0; i < lim; i++) {
                if (i > 0) palSig += '/';
                const c = activePalette[i];
                palSig += typeof c === 'number' ? (c >>> 0).toString(16) : String(c);
            }
        }
        return `${nStr}|${capo}|${tStr}|${arrIdx}|${labels.join(',')}|${palSig}|${_textSizeMul.toFixed(3)}|${ctx.board.boardStringStartX.toFixed(6)}|${ctx.board.boardTuningLabelX.toFixed(6)}`;
    }

    function _syncOpenStringPitchLabels(bundle) {
        if (!tuningLblG || !T || !bundle) return;
        if (!tuningLabelsVisible) {
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
            _lastSyncPaletteRef === activePalette &&
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
        _lastSyncPaletteRef = activePalette;
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
            const hex = '#' + new T.Color(activePalette[s % activePalette.length]).getHexString();
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

    // Cached wrapper for drawChordDiagram. When entranceT === 1 (scale
    // transform is identity) the diagram is rendered once to an
    // OffscreenCanvas and reused every subsequent frame via drawImage +
    // globalAlpha. During the 0.2 s entrance animation (entranceT < 1)
    // the scale transform is non-trivial so we fall through to a fresh
    // render — that window is ~12 frames at 60 fps, negligible.
    //
    // Returns boxH (diagram card height in px) so the draw loop can
    // accumulate per-corner stack offsets when multiple overlays share
    // the same corner position.
    function _drawDiagramCached(ctx, opts) {
        const { opacity = 1, entranceT = 1.0, canvasW, canvasH } = opts;
        if (opacity <= 0) return 0;
        if (entranceT < 1.0) {
            return drawChordDiagram(ctx, opts) || 0;
        }
        const { name, frets, nStr, inverted, sizeSlider, position, lyricsBottom = 0, stackOffset = 0 } = opts;
        const key = name + '|' + (frets || []).join(',') + '|' + nStr + '|' +
                    (inverted ? 1 : 0) + '|' + sizeSlider + '|' + position + '|' +
                    canvasW + '|' + canvasH + '|' + lyricsBottom + '|' + stackOffset;
        let entry = _diagRenderCache.get(key);
        if (!entry) {
            let oc;
            try { oc = new OffscreenCanvas(canvasW, canvasH); }
            catch (_) { oc = document.createElement('canvas'); oc.width = canvasW; oc.height = canvasH; }
            const boxH = drawChordDiagram(oc.getContext('2d'), { ...opts, opacity: 1, entranceT: 1 }) || 0;
            if (_diagRenderCache.size >= _DIAG_CACHE_MAX) {
                _diagRenderCache.delete(_diagRenderCache.keys().next().value);
            }
            entry = { oc, boxH };
            _diagRenderCache.set(key, entry);
        }
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.drawImage(entry.oc, 0, 0);
        ctx.restore();
        return entry.boxH;
    }

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
            butterchurnModeActive, applySize,
        }));
        // _applyCinematic() reads ambLight/dirLight from THIS closure's
        // `let`s -- must run after the destructure above, not inside the
        // factory (see dom-and-scene.js's doc comment).
        _applyCinematic();

        fretG = new T.Group(); scene.add(fretG);
        tuningLblG = new T.Group(); scene.add(tuningLblG);
        noteG = new T.Group(); scene.add(noteG);
        // Hit sparks (#3): a pooled additive Points cloud; a small burst fires at a
        // gem on a verified hit (spawned in the verdict block, advanced in the render loop).
        _sparkPos = new Float32Array(_SPARK_N * 3); _sparkCol = new Float32Array(_SPARK_N * 3);
        _sparkVel = new Float32Array(_SPARK_N * 3); _sparkLife = new Float32Array(_SPARK_N);
        {
            const sg = new T.BufferGeometry();
            sg.setAttribute('position', new T.BufferAttribute(_sparkPos, 3).setUsage(T.DynamicDrawUsage));
            sg.setAttribute('color', new T.BufferAttribute(_sparkCol, 3).setUsage(T.DynamicDrawUsage));
            const sm = new T.PointsMaterial({ size: 1.0 * K, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, blending: T.AdditiveBlending, sizeAttenuation: true });
            _sparkPts = new T.Points(sg, sm); _sparkPts.frustumCulled = false; _sparkPts.renderOrder = 8;
            scene.add(_sparkPts);
        }
        beatG = new T.Group(); scene.add(beatG);
        lblG = new T.Group(); scene.add(lblG);

        // Note-gem geometry + every gem/outline/sustain-trail material -- see
        // instance/geometry/note-gem-visuals.js.
        ({
            gNote, gNoteGrad, gSus, gBeat, gTapChevron, mkGhostFrameGeometry,
            mStr, mGlow, mSus, mWhiteOutline, mStrHitOutline, mAccentOutline, mAccentCore,
            mAccentHaloNear, mAccentHaloMid, mAccentHaloFar, _accentShellsByString,
            gHaloBar, pHaloBar, mMissOutline, mEdgeTransparent, mMissEdgeArrays,
            mHitBright, mHitBrightArrays, mRimFlash, mSusOutline, mHitSusOutline,
            mBeatM, mBeatQ, _laneTargetColor, _fwHitColor, _fwHitEmissive,
        } = createNoteGemVisuals({ activePalette, glowMul, noteG, _recolorGemGradients, _ownedSharedGeos, gHaloBar }));
        _fwHitGlow.fill(0);
        _fwHitPrevTime = -Infinity;

        // Board projection ghost frames -- see instance/geometry/note-gem-pools.js.
        ({ projMeshArr } = createBoardGhostFrames({ noteG, activePalette, mkGhostFrameGeometry }));

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
            noteG, lblG, textSprites, glowMul, _imColor, IM_STRUM_CAP,
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
            validString, _setLabelMap, _firstEventTimeGreaterThan, _fxSpawnPop, _sparkBurst,
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
            _firstEventTimeGreaterThan, xFret, xFretMid, sY, _setLabelMap,
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
            pFretColMarker, textSprites, _setLabelMap, sY, xFretMid, validString, _fretMarkerWaveCache,
        });

        cameraTarget = createCameraTarget({
            ctx, xFretMid, _applyNoteCamTargets, camLowFretPullbackU, camBaseDistU,
            lookaheadSmoothCamStep, lookaheadTargetWorldX,
        });

        fretNumberRow = createFretNumberRow({ pFretLbl, textSprites, sY, xFretMid });

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
        _applyBgTheme();

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
        _applyVibrancy();
        _applyGlow();
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
        mountBackgroundStyle();
        // The live settings-bus subscriber -- see instance/settings-listener.js.
        // Threaded through as live getters/setters, not plain deps values --
        // see that file's doc comment for why (loadSettings() reassigns most
        // of what this reads, from inside several of its own branches).
        settingsListener = createSettingsListener({
            getFretG: () => fretG, buildBoard, loadSettings, ctx,
            getInlayLabelsVisible: () => inlayLabelsVisible,
            getNutHeadstockVisible: () => nutHeadstockVisible,
            setLastOpenStringLblSig: (v) => { _lastOpenStringLblSig = v; },
            getTuningLabelSprites: () => _tuningLabelSprites,
            _disposeOpenStringPitchSprites,
            _applyVibrancy, _applyGlow,
            getBgStyleId: () => bgStyleId, rebuildBackground, _applyBgTheme,
            getBgState: () => bgState, getBgIntensity: () => bgIntensity,
            effectiveBackgroundStyleId,
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
            _fxHandle, _fxResolvePalette,
            getFxGen: () => _fxGen,
            getHighwayCanvas: () => highwayCanvas,
        }));

        return true;
    }

    function loadSettings() {
        const panelKey = settingsPanelKey(highwayCanvas);
        bgStyleId = readSetting(panelKey, 'style');
        bgIntensity = readSetting(panelKey, 'intensity');
        bgReactive = readSetting(panelKey, 'reactive');
        // Per-render opt-out (captured from the mount bundle in init): force
        // the reactive background off for THIS instance, overriding the shared
        // setting without writing it back. Re-applied here so it sticks across
        // setting reloads.
        if (backgroundReactiveOptOut) bgReactive = false;
        if (bgStyleId === 'butterchurn') bgReactive = false; // Butterchurn owns the <audio> tap
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
        if (newPalette !== activePalette || newSig !== backgroundPaletteSig) {
            activePalette = newPalette;
            backgroundPaletteSig = newSig;
            _applyPaletteToMaterials();
        }
        bgThemeId = readSetting(panelKey, 'bgTheme');
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
            hwThemeId = readSetting(panelKey, 'hwTheme');
        } else {
            hwThemeId = bgThemeId;
            settingsMemFallback.hwTheme = String(bgThemeId);
            try { localStorage.setItem('h3d_bg_hwTheme', String(bgThemeId)); } catch (_) { /* storage blocked — mem fallback still seeds the read */ }
        }
        showFretOnNote = readSetting(panelKey, 'showFretOnNote');
        fretNumberGhostScope = readSetting(panelKey, 'fretNumberGhostScope');
        cameraSmoothing = readSetting(panelKey, 'cameraSmoothing');
        // Mirror-at-first-read: zoom + tilt sliders inherit cameraSmoothing
        // when the user has never explicitly written them. Once the user
        // moves either slider, the corresponding hasStoredSetting() flips
        // true and the read becomes independent.
        zoomSmoothing = hasStoredSetting(panelKey, 'zoomSmoothing')
            ? readSetting(panelKey, 'zoomSmoothing')
            : cameraSmoothing;
        tiltSmoothing = hasStoredSetting(panelKey, 'tiltSmoothing')
            ? readSetting(panelKey, 'tiltSmoothing')
            : cameraSmoothing;
        cameraLockLow = readSetting(panelKey, 'cameraLockLow');
        cameraLockZoom = readSetting(panelKey, 'cameraLockZoom');
        cameraMode = readSetting(panelKey, 'cameraMode');
        textSize             = readSetting(panelKey, 'textSize');
        vibrancy             = readSetting(panelKey, 'vibrancy');
        glowMul              = readSetting(panelKey, 'glow');
        _hitFx               = readSetting(panelKey, 'hitFx');
        _sparks              = readSetting(panelKey, 'sparks');
        _cinematic           = readSetting(panelKey, 'cinematic');
        _verdictMarks        = readSetting(panelKey, 'verdictMarks');
        _timingFx            = readSetting(panelKey, 'timingFx');
        _streakFx            = readSetting(panelKey, 'streakFx');
        _bloom               = readSetting(panelKey, 'bloom');
        _applyCinematic();
        fpsVisible           = readSetting(panelKey, 'fpsVisible');
        fretDividersVisible  = readSetting(panelKey, 'fretDividersVisible');
        chordDiagramVisible  = readSetting(panelKey, 'chordDiagramVisible');
        chordDiagramSize     = readSetting(panelKey, 'chordDiagramSize');
        chordDiagramPosition = readSetting(panelKey, 'chordDiagramPosition');
        fretColumnMarkerCadence = readSetting(panelKey, 'fretColumnMarkerCadence');
        inlayLabelsVisible = readSetting(panelKey, 'inlayLabelsVisible');
        sectionLabelsOnHighway = readSetting(panelKey, 'sectionLabelsOnHighway');
        sectionHudVisible      = readSetting(panelKey, 'sectionHudVisible');
        sectionHudPosition     = readSetting(panelKey, 'sectionHudPosition');
        sectionHudSize         = readSetting(panelKey, 'sectionHudSize');
        toneHudVisible         = readSetting(panelKey, 'toneHudVisible');
        toneHudPosition        = readSetting(panelKey, 'toneHudPosition');
        toneHudSize            = readSetting(panelKey, 'toneHudSize');
        nutHeadstockVisible    = readSetting(panelKey, 'nutHeadstockVisible');
        tuningLabelsVisible    = readSetting(panelKey, 'tuningLabelsVisible');
        nutColor               = readSetting(panelKey, 'nutColor');
        headstockColor         = readSetting(panelKey, 'headstockColor');
        projectionVisible      = readSetting(panelKey, 'projectionVisible');
        slideArrowApproachVisible = readSetting(panelKey, 'slideArrowApproachVisible');
        slideArrowNeckVisible     = readSetting(panelKey, 'slideArrowNeckVisible');
        slideArrowChainPreviewVisible = readSetting(panelKey, 'slideArrowChainPreviewVisible');
        _vibrancyIdleOp = 0.4  + 0.6  * vibrancy;
        _vibrancyProjOp = 0.15 + 0.35 * vibrancy;
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
            bgCustomImageDataUrl = (gDataUrl != null) ? gDataUrl : SETTING_DEFAULTS.customImageDataUrl;
            bgCustomImageName    = (gName    != null) ? gName    : SETTING_DEFAULTS.customImageName;
        } catch (_) {
            bgCustomImageDataUrl = (memDataUrl !== undefined) ? memDataUrl : SETTING_DEFAULTS.customImageDataUrl;
            bgCustomImageName    = (memName    !== undefined) ? memName    : SETTING_DEFAULTS.customImageName;
        }
        // Custom video filename: also a single global slot, same
        // mem-first precedence as the image keys (a quota-failed
        // setItem leaves settingsMemFallback ahead of localStorage).
        const memVideoName = settingsMemFallback.customVideoName;
        try {
            const gVideoName = (memVideoName !== undefined) ? memVideoName : localStorage.getItem('h3d_bg_customVideoName');
            bgCustomVideoName = (gVideoName != null) ? gVideoName : SETTING_DEFAULTS.customVideoName;
        } catch (_) {
            bgCustomVideoName = (memVideoName !== undefined) ? memVideoName : SETTING_DEFAULTS.customVideoName;
        }
    }
    // Live-swap palette by mutating existing materials in place.
    // Three.js colors propagate to all sharing meshes on the next
    // render — no rebuild, no GC. The mGlow material was authored
    // with .color = white and the per-string color in .emissive
    // only; we preserve that here so the glow look stays consistent
    // before/after a palette swap rather than tinting the diffuse
    // white. Lane lines and drop lines that read
    // activePalette[s] per frame pick up automatically. Per-string
    // fretboard materials built inside buildBoard() are independent
    // and aren't reachable from here — buildBoard re-runs from the
    // palette listener to regenerate them with the new colors.
    //
    // projMeshArr holds filled rim meshes (ExtrudeGeometry frame); centre
    // is open. Palette + vibrancy mutate each mesh's material like mStr.
    function _applyPaletteToMaterials() {
        for (let s = 0; s < activePalette.length; s++) {
            const c = activePalette[s];
            if (mStr[s]) {
                // Gradient strings (0..5) keep a white base so the per-vertex
                // colours in gNoteGrad[s] show pure; only flat strings (6/7)
                // take the palette colour. mStr is MeshBasicMaterial (no
                // emissive) — guard the legacy emissive retint.
                if (s >= 6) mStr[s].color.setHex(c);
                if (mStr[s].emissive) mStr[s].emissive.setHex(c);
            }
            if (mGlow[s]) mGlow[s].emissive.setHex(c);
            if (mRimFlash[s]) {
                mRimFlash[s].color.setHex(c);
                mRimFlash[s].emissive.setHex(c);
            }
            if (mSus[s]) mSus[s].color.setHex(c);
            if (mStrHitOutline[s]) {
                mStrHitOutline[s].color.setHex(c);
                mStrHitOutline[s].emissive.setHex(c);
            }
            if (mAccentOutline[s]) {
                mAccentOutline[s].color.setHex(c);
                mAccentOutline[s].emissive.setHex(c);
            }
            if (mAccentCore[s]) mAccentCore[s].emissive.setHex(c);
            // Verdict materials use fixed colours (0x22ff88 hit, 0xff0066 miss)
            // that are independent of the string palette — no retint needed.
            for (const haloArr of [mAccentHaloNear, mAccentHaloMid, mAccentHaloFar]) {
                if (haloArr[s]) haloArr[s].color.setHex(c);
            }
            if (projMeshArr && projMeshArr[s]) {
                for (const pm of projMeshArr[s]) {
                    if (pm.material) {
                        pm.material.color.setHex(c);
                        pm.material.emissive.setHex(c);
                    }
                }
            }
        }
        // Per-string gem bodies (strings 0..5) are a baked per-vertex
        // gradient (gNoteGrad), not a flat material — recolor them too so a
        // custom palette reaches the note/sustain/vibrato gem bodies.
        _recolorGemGradients();
        // Re-apply vibrancy: mGlow's color is a lerp between white and
        // the palette colour, so a palette swap must rebuild that
        // lerp from the new endpoints. Skipped pre-init when mGlow
        // isn't allocated yet — _applyVibrancy() guards on that.
        _applyVibrancy();
    }

    // Recompute the per-vertex gem-gradient colors from the active palette.
    // Built-in palettes (and unchanged slots of a custom palette) keep the
    // hand-tuned DEFAULT_GEM_GRADIENTS stops so the stock look is preserved;
    // a custom slot derives a top-highlight / bottom-shade from its base
    // color. Mutates the existing 'color' attribute in place (no geometry
    // churn, pooled note meshes pick it up next frame).
    function _recolorGemGradients() {
        if (!T || !gNoteGrad || !gNoteGrad.length) return;
        const isCustom = (activePalette === _customPalette);
        const topCol = new T.Color(), botCol = new T.Color(), tmp = new T.Color();
        const halfH = NH / 2;
        for (let s = 0; s < gNoteGrad.length; s++) {
            const g = gNoteGrad[s];
            if (!g || !g.attributes || !g.attributes.color) continue;
            const base = activePalette[s];
            let topHex, botHex;
            if (isCustom && base !== PALETTES.default[s]) {
                // Match the SUBTLE stock gem shading (bottom ≈ 0.78 of a
                // near-base top), so a custom gem reads as a flat-ish gem
                // in the chosen color rather than a strong gradient.
                topHex = _lightenInt(base, 0.05);
                botHex = _darkenInt(base, 0.78);
            } else {
                const stops = DEFAULT_GEM_GRADIENTS[s];
                if (!stops) continue; // strings 6/7 have no gradient geometry
                topHex = stops[0];
                botHex = stops[1];
            }
            topCol.setHex(topHex);
            botCol.setHex(botHex);
            const pos = g.attributes.position;
            const colAttr = g.attributes.color;
            for (let i = 0; i < pos.count; i++) {
                const t = (pos.getY(i) + halfH) / (2 * halfH); // 0 bottom..1 top
                tmp.copy(botCol).lerp(topCol, t);
                colAttr.setXYZ(i, tmp.r, tmp.g, tmp.b);
            }
            colAttr.needsUpdate = true;
        }
    }

    // Vibrancy + glow live-update helpers. Both walk the same
    // material set _applyPaletteToMaterials walks (plus the static
    // outline / technique materials) and mutate uniform-backed
    // properties — colour, opacity, emissiveIntensity. No
    // material.needsUpdate flag is needed for these; Three.js
    // re-reads them on the next render call. mGlow.emissiveIntensity
    // and BASE_GLOW/MAX_GLOW/IDLE_OP are NOT written here — those
    // are stomped per-frame inside updateStringHighlights() and the
    // anticipation loop in update(), so they read glowMul /
    // _vibrancyIdleOp / vibrancy directly each frame instead.
    function _applyVibrancy() {
        const t = vibrancy;
        const idleOp     = 0.4  + 0.6  * t;  // mStr / IDLE_OP source
        // projIdleOp drives the projMeshArr ghost-frame opacity and is
        // read by drawNote() as `_vibrancyProjOp`, which layers a
        // per-frame factor on top.
        const projIdleOp = 0.15 + 0.35 * t;
        const susOp      = 0.35 + 0.45 * t;  // mSus
        const lineGlowOp = 0.15 + 0.35 * t;  // thin Line glow layer behind each string
        for (let s = 0; s < activePalette.length; s++) {
            if (mStr[s])  mStr[s].opacity  = idleOp;
            if (mSus[s])  mSus[s].opacity  = susOp;
            if (mGlow[s]) {
                // Hit-note body lerps from white (current pastel
                // look — colour comes through the emissive only)
                // toward the palette colour as vibrancy → 1, so at
                // vibrancy=1 the white-wash on hit notes goes away.
                if (!_paletteColorTmp && T) _paletteColorTmp = new T.Color();
                if (_paletteColorTmp) {
                    mGlow[s].color.setHex(0xffffff).lerp(_paletteColorTmp.setHex(activePalette[s]), t);
                }
            }
            if (mAccentCore[s]) {
                if (!_paletteColorTmp && T) _paletteColorTmp = new T.Color();
                if (_paletteColorTmp) {
                    mAccentCore[s].color.setHex(0xffffff).lerp(_paletteColorTmp.setHex(activePalette[s]), t);
                }
            }
            if (projMeshArr && projMeshArr[s]) {
                for (const pm of projMeshArr[s]) {
                    if (pm.material) pm.material.opacity = projIdleOp;
                }
            }
        }
        // ctx.board.stringLines[s].material.opacity is overwritten by
        // updateStringHighlights() every frame, so the closed-form
        // value would be stomped. updateStringHighlights() reads
        // _vibrancyIdleOp directly instead — keep that in sync.
        for (let s = 0; s < ctx.board.stringLineGlows.length; s++) {
            const line = ctx.board.stringLineGlows[s];
            if (line && line.material) line.material.opacity = lineGlowOp;
        }
        _vibrancyIdleOp = idleOp;
        _vibrancyProjOp = projIdleOp;
    }
    function _applyGlow() {
        const g = glowMul;
        for (let s = 0; s < activePalette.length; s++) {
            if (mStr[s])  mStr[s].emissiveIntensity  = 0.002 * g;
            // mGlow[s].emissiveIntensity is per-frame in update();
            // see Phase 4 comment block.
            if (projMeshArr && projMeshArr[s]) {
                for (const pm of projMeshArr[s]) {
                    if (pm.material) pm.material.emissiveIntensity = 0.002 * g;
                }
            }
            if (mStrHitOutline[s]) mStrHitOutline[s].emissiveIntensity = 1.0 * g;
            if (mAccentOutline[s]) mAccentOutline[s].emissiveIntensity = ACCENT_RIM_BASE_EMISSIVE * g;
            // mAccentCore[].emissiveIntensity is per-frame in update()
            // alongside mGlow (accent fill boost).
        }
        if (mWhiteOutline) mWhiteOutline.emissiveIntensity = 0.6 * g;
        if (mMissOutline)  mMissOutline.emissiveIntensity  = 1.2 * g;
        for (let s = 0; s < mHitBright.length; s++) {
            if (mHitBright[s]) mHitBright[s].emissiveIntensity = 4.0 * g;
        }
        if (mSusOutline)      mSusOutline.emissiveIntensity      = 0.3 * g;
        if (mHitSusOutline)   mHitSusOutline.emissiveIntensity   = 0.7 * g;
        if (mTapChevron)   mTapChevron.emissiveIntensity   = 0.9 * g;
        if (mBarre)        mBarre.emissiveIntensity        = 0.9 * g;
        for (let si = 0; si < activePalette.length; si++) {
            if (mAccentHaloNear[si]) mAccentHaloNear[si].opacity = ACCENT_HALO_OP_NEAR * g;
            if (mAccentHaloMid[si]) mAccentHaloMid[si].opacity = ACCENT_HALO_OP_MID * g;
            if (mAccentHaloFar[si]) mAccentHaloFar[si].opacity = ACCENT_HALO_OP_FAR * g;
        }
    }
    function effectiveBackgroundStyleId() {
        return _venueSceneOverride ? 'venue' : bgStyleId;
    }
    // The 'butterchurn' bg-style renders a WebGL MilkDrop canvas BEHIND a
    // transparent highway via the self-contained butterchurn/ controller module,
    // NOT a Three.js fog-scenery style (its scenery falls back to 'off'). Mount
    // is idempotent and driven by the bg-style dropdown through mountBackgroundStyle.
    function butterchurnModeActive() { return bgStyleId === 'butterchurn'; }
    function syncButterchurnMode() {
        if (butterchurnModeActive()) {
            // Recreate when there's no controller, or the last one died during
            // async init (lib/WebGL failure) — a dead controller self-cleaned,
            // so retry here instead of leaving the style permanently broken.
            if ((!bcCtrl || (bcCtrl.dead && bcCtrl.dead())) && wrap) {
                if (bcCtrl) bcCtrl = null;
                // audioProvider reuses this instance's shared analyser (the
                // fog scenery's #audio / stems tap) so the browser path never
                // opens a second createMediaElementSource on #audio.
                try { bcCtrl = createButterchurnController(wrap, () => canvasSize(highwayCanvas), () => { try { return getAudioAnalyser(); } catch (e) { return null; } }); }
                catch (e) { console.warn('[3D-Hwy] Butterchurn init failed', e); }
            }
            if (ren) ren.setClearColor(0x101820, 0); // transparent so the visualizer shows through
        } else if (bcCtrl) {
            try { bcCtrl.destroy(); } catch (e) {}
            bcCtrl = null;
            _applyBgTheme(); // restore the opaque themed clear
        }
    }
    function mountBackgroundStyle() {
        const effectiveId = effectiveBackgroundStyleId();
        const style = BACKGROUND_STYLES[effectiveId] || BACKGROUND_STYLES.off;
        // Build into a fresh stage group so a partial throw can't
        // orphan meshes inside bgGroup. On success the stage joins
        // bgGroup atomically; on failure the stage and everything
        // in it are disposed and bgState stays null.
        const stage = new T.Group();
        let result = null;
        try {
            result = style.build(stage, {
                intensity: bgIntensity,
                palette: activePalette,
                customImageDataUrl: bgCustomImageDataUrl,
                customVideoName: bgCustomVideoName,
                cam: cam,
            }) || null;
        } catch (e) {
            console.error('[3D-Hwy] bg style build failed', effectiveId, e);
            disposeGroupTree(stage);
            bgState = null;
            bgStage = null;
            bgMountedStyleId = null;
            return;
        }
        // renderOrder on a Group doesn't propagate to its children
        // (Three.js sorts by per-object renderOrder, and a Group is a
        // transform, not a rendered object). Stamp every mesh in the
        // stage so transparent bg objects always sort behind notes
        // regardless of their z relative to gameplay geometry.
        stage.traverse((c) => { c.renderOrder = -1; });
        bgGroup.add(stage);
        bgStage = stage;
        bgState = result;
        bgMountedStyleId = effectiveId;
        syncButterchurnMode();
    }
    function unmountBackgroundStyle() {
        const mountedId = bgMountedStyleId || effectiveBackgroundStyleId();
        const style = BACKGROUND_STYLES[mountedId] || BACKGROUND_STYLES.off;
        try { style.teardown(bgState); } catch (e) { console.error('[3D-Hwy] bg teardown', e); }
        bgState = null;
        // Belt + suspenders: even if a style's teardown forgets to
        // dispose something, the stage tree dispose mops up.
        if (bgStage) {
            bgStage.parent?.remove(bgStage);
            disposeGroupTree(bgStage);
            bgStage = null;
        }
        bgMountedStyleId = null;
    }
    // Recursively dispose geometries / materials attached to an
    // Object3D tree, then detach. Used as a safety net during
    // mountBackgroundStyle failures and on unmountBackgroundStyle.
    //
    // Deliberately does NOT dispose material.map textures — texture
    // lifetime belongs to whoever allocated the texture. The
    // silhouettes style allocates a per-layer CanvasTexture wrapping
    // the shared silhouetteCanvas bitmap, and disposes those textures in
    // its own teardown. Disposing them here would double-dispose,
    // and any future plugin texture sharing across panels (e.g. an
    // upcoming custom-background feature) would break the same way.
    // Style teardown owns texture release.
    function rebuildBackground() {
        if (!bgGroup) return;
        // Order matters: teardown must run against the (style id,
        // state) pair that built the meshes, so unmount BEFORE
        // reloading settings. Reload, then mount with the new id.
        unmountBackgroundStyle();
        loadSettings();
        mountBackgroundStyle();
        applyVenueSceneFog(_venueSceneOverride);
        // Reset dt accounting so the first frame after a switch
        // doesn't see a huge "since last update" window — that
        // would clamp to 0.1 and visibly snap motion / rotation.
        backgroundLastT = 0;
    }
    // Venue-only fog/clear/ambient tuning — darker near field, less
    // washed-out gray haze over the playable highway. Restored when
    // venue deactivates.
    function applyVenueSceneFog(active) {
        if (!scene || !scene.fog) return;
        if (active) {
            scene.fog.color.setHex(0x080c12);
            scene.fog.near = FOG_START * 0.98;
            scene.fog.far = FOG_END * 0.98;
            // Keep the clear transparent while Butterchurn is active so the
            // venue scene doesn't occlude the visualizer behind the highway.
            if (ren) ren.setClearColor(0x080c12, butterchurnModeActive() ? 0 : 1);
            if (ambLight) ambLight.intensity = 0.68;
        } else {
            // Restore the user's scene-color theme (clear + fog) rather than
            // the old hardcoded gray, so deactivating venue doesn't wipe a
            // chosen background theme. _applyBgTheme reads the current theme.
            scene.fog.near = FOG_START * 0.8;
            scene.fog.far = FOG_END * 1.2;
            if (ambLight) ambLight.intensity = 0.85;
            _applyBgTheme();
        }
    }

    // Apply BOTH scene-color axes, each from its own setting key:
    //   • BACKGROUND (bgThemeId): the WebGL clear color + the distance-fog
    //     tint. Skipped while the venue scene is active (venue owns those —
    //     see applyVenueSceneFog).
    //   • HIGHWAY (hwThemeId): the fretboard/highway-surface plane + the lit
    //     highway lane strip (the bright quad under the gems) + its dimmer
    //     alternating row. Always themed; venue doesn't touch them.
    // The two axes are independent, so picking a different id in each mixes
    // freely. Safe to call any time; called from initScene, buildBoard, and
    // the scene-theme listener (so a live switch of EITHER dropdown retints
    // only its half immediately).
    //
    // The lane fields are OPTIONAL on a highway theme: one that omits `lane`
    // / `laneDim` falls back to the stock lit/dim lane hexes, so every
    // existing/neutral highway theme stays byte-identical (default blue lane
    // unchanged). Only colored highway themes opt into a coordinated lane.
    function _applyBgTheme() {
        // --- Background axis: clear + fog ---
        const bg = backgroundAxisColors(bgThemeId);
        if (!_venueSceneOverride) {
            if (scene && scene.fog) scene.fog.color.setHex(bg.fog);
            if (ren) ren.setClearColor(bg.clear, butterchurnModeActive() ? 0 : 1);
        }
        // --- Highway axis: board plane + lane ---
        const hw = highwayAxisColors(hwThemeId);
        if (ctx.board._boardPlaneMat) ctx.board._boardPlaneMat.color.setHex(hw.board);
        // Lit lane strip + its dimmer alternating row. Fall back to the
        // hardcoded stock lane colors when the highway theme omits them.
        const laneLit = (typeof hw.lane === 'number') ? hw.lane : HIGHWAY_LANE_STRIPE_ODD_HEX;
        const laneDim = (typeof hw.laneDim === 'number') ? hw.laneDim : HIGHWAY_LANE_STRIPE_EVEN_HEX;
        if (mLaneOdd) mLaneOdd.color.setHex(laneLit);
        if (mLaneEven) mLaneEven.color.setHex(laneDim);
        // Keep the (otherwise vestigial) lane target color in sync with the
        // lit lane so any future lane-blend consumer reads the themed value.
        if (_laneTargetColor) _laneTargetColor.setHex(laneLit);
        else _laneTargetColor = new T.Color(laneLit);
    }

    /* ── Fretboard (static geometry) ────────────────────────────────── */
    function _h3dHexOrDefault(hexStr, defHex) {
        const d = defHex || SETTING_DEFAULTS.nutColor;
        const s = (typeof hexStr === 'string' && /^#[0-9a-fA-F]{6}$/.test(hexStr.trim()))
            ? hexStr.trim().toLowerCase()
            : d;
        return parseInt(s.slice(1), 16);
    }
    // Cinematic lighting (#2): darken ambient so emissive gems have a dark
    // surround to pop against; strengthen the key light for modelling.
    // Toggle via the 'cinematic' setting so it's directly comparable.
    function _applyCinematic() {
        if (!ambLight || !dirLight) return;
        ambLight.intensity = _cinematic ? 0.45 : 0.85;
        dirLight.intensity = _cinematic ? 1.15 : 0.8;
    }
    function _sparkBurst(x, y, z, hex, count) {
        if (!_sparkPts || count <= 0) return;
        const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255;
        let made = 0;
        for (let i = 0; i < _SPARK_N && made < count; i++) {
            if (_sparkLife[i] > 0) continue;
            const j = i * 3, ang = Math.random() * Math.PI * 2, sp = (5 + Math.random() * 12) * K;
            _sparkPos[j] = x; _sparkPos[j + 1] = y; _sparkPos[j + 2] = z;
            _sparkVel[j] = Math.cos(ang) * sp; _sparkVel[j + 1] = (12 + Math.random() * 24) * K; _sparkVel[j + 2] = Math.sin(ang) * sp * 0.55;
            _sparkCol[j] = r; _sparkCol[j + 1] = g; _sparkCol[j + 2] = b;
            _sparkLife[i] = 0.30 + Math.random() * 0.16; made++;
        }
    }
    function _sparkUpdate(dt) {
        if (!_sparkPts) return;
        const grav = 55 * K; let any = false;
        for (let i = 0; i < _SPARK_N; i++) {
            if (_sparkLife[i] <= 0) continue;
            const j = i * 3;
            _sparkLife[i] -= dt;
            if (_sparkLife[i] <= 0) { _sparkCol[j] = _sparkCol[j + 1] = _sparkCol[j + 2] = 0; continue; }
            any = true;
            _sparkVel[j + 1] -= grav * dt;
            _sparkPos[j] += _sparkVel[j] * dt; _sparkPos[j + 1] += _sparkVel[j + 1] * dt; _sparkPos[j + 2] += _sparkVel[j + 2] * dt;
            const fade = 1 - Math.min(1, dt * 3.2);
            _sparkCol[j] *= fade; _sparkCol[j + 1] *= fade; _sparkCol[j + 2] *= fade;
        }
        _sparkPts.geometry.attributes.position.needsUpdate = true;
        _sparkPts.geometry.attributes.color.needsUpdate = true;
        _sparkPts.visible = any;
    }
    // #4 Bloom: lazy-load the vendored postprocessing addons and build an
    // EffectComposer (RenderPass -> UnrealBloomPass -> OutputPass/ACES). Returns
    // the composer once ready, or null (caller falls back to a direct render).
    function _bloomEnsure() {
        if (_composer) return _composer;
        if (_bloomLoad || !ren || !scene || !cam) return null;
        const A = '/static/vendor/three/addons/';
        _bloomLoad = Promise.all([
            import(A + 'postprocessing/EffectComposer.js'),
            import(A + 'postprocessing/RenderPass.js'),
            import(A + 'postprocessing/UnrealBloomPass.js'),
            import(A + 'postprocessing/OutputPass.js'),
        ]).then(([EC, RP, UB, OP]) => {
            try {
                const sz = canvasSize(highwayCanvas) || { w: 1280, h: 720 };
                const w = Math.max(2, sz.w | 0), h = Math.max(2, sz.h | 0);
                // Multisampled (WebGL2 MSAA) HalfFloat target so anti-aliasing
                // survives the bloom path — EffectComposer's default target has no
                // `samples`, which is why bloom-on looked jagged (worst on non-Retina
                // DPR1 displays that have no supersampling cushion).
                const _bloomRT = new T.WebGLRenderTarget(w, h, { type: T.HalfFloatType, samples: 4 });
                const comp = new EC.EffectComposer(ren, _bloomRT);
                comp.addPass(new RP.RenderPass(scene, cam));
                _bloomPass = new UB.UnrealBloomPass(new T.Vector2(w, h), 0.65, 0.5, 0.82); // strength, radius, threshold (high → only emissive blooms)
                comp.addPass(_bloomPass);
                comp.addPass(new OP.OutputPass());
                comp.setSize(w, h);
                _bloomW = w; _bloomH = h; _composer = comp;
            } catch (e) { console.warn('[3D-Hwy] bloom init failed', e); _composer = null; }
        }).catch((e) => console.warn('[3D-Hwy] bloom modules failed', e));
        return null;
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
        const pm = new T.MeshLambertMaterial({ color: highwayAxisColors(hwThemeId).board, transparent: true, opacity: 0.6 });
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

        const lineGlowOp = 0.15 + 0.35 * vibrancy;
        for (let s = 0; s < nStr; s++) {
            const pts = [new T.Vector3(ctx.board.boardStringStartX, sY(s), 0), new T.Vector3(stringEndX, sY(s), 0)];
            const g = new T.BufferGeometry().setFromPoints(pts);
            const line = new T.Line(g, new T.LineBasicMaterial({ color: activePalette[s], transparent: true, opacity: lineGlowOp }));
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
                color: activePalette[s], emissive: activePalette[s],
                emissiveIntensity: 0.002,
                transparent: true, opacity: _vibrancyIdleOp, roughness: 1,
            });
            const mesh = new T.Mesh(g, mat);
            mesh.renderOrder = renderOrderForLayerAtZ(0, 'BOARD_STRING');
            mesh.position.set(ctx.board.boardStringStartX + strSpan * 0.5, sY(s), 0);
            fretG.add(mesh);
            ctx.board.stringLines.push(mesh);
        }

        // Guitar nut + headstock — grouped so visibility + colors are user-tunable.
        {
            ctx.board.nutHeadstockGroup = new T.Group();
            const yTopN = Math.max(sY(0), sY(nStr - 1));
            const yBottomN = Math.min(sY(0), sY(nStr - 1));
            const yMidN = (yTopN + yBottomN) / 2;
            const spanY = Math.abs(yTopN - yBottomN) + S_GAP * 1.05;

            const nutD = 0.95 * K;
            const nutZc = -0.62 * K;
            const nutH = spanY * 1.06;
            const nutHalfH = nutH * 0.5;

            const zBack = -1.38 * K;
            const zJoint = -0.58 * K;

            const nutInt = _h3dHexOrDefault(nutColor, SETTING_DEFAULTS.nutColor);
            const hsInt = _h3dHexOrDefault(headstockColor, SETTING_DEFAULTS.headstockColor);
            const nutBase = new T.Color(nutInt);
            const nutHi = nutBase.clone().lerp(new T.Color(0xffffff), 0.14);
            const nutGro = nutBase.clone().multiplyScalar(0.72);
            const hsBase = new T.Color(hsInt);
            const hsDarkC = hsBase.clone().multiplyScalar(0.76);

            const mapleMat = new T.MeshStandardMaterial({
                color: hsBase, roughness: 0.55, metalness: 0.02,
            });
            const mapleDark = new T.MeshStandardMaterial({
                color: hsDarkC, roughness: 0.62, metalness: 0.02,
            });

            const coreLen = Math.max(Math.abs(nutRearX - xHeadLeft), 2 * K);
            const coreCX = (nutRearX + xHeadLeft) * 0.5;
            const headCoreD = 1.05 * K;
            const headCore = new T.Mesh(
                new T.BoxGeometry(coreLen, spanY * 1.12, headCoreD),
                mapleDark,
            );
            headCore.position.set(coreCX, yMidN, zBack - headCoreD * 0.35);
            ctx.board.nutHeadstockGroup.add(headCore);

            const xs = 14;
            const ys = 12;
            const yLo = yMidN - spanY * 0.58;
            const yHi = yMidN + spanY * 0.58;
            const posR = new Float32Array((xs + 1) * (ys + 1) * 3);
            const idxR = [];
            let ri = 0;
            for (let j = 0; j <= ys; j++) {
                const v = j / ys;
                const wy = yLo + v * (yHi - yLo);
                const yArc = 1 - Math.abs((wy - yMidN) / (spanY * 0.55 + 1e-6));
                const yArcCl = Math.max(0, Math.min(1, yArc));
                for (let i = 0; i <= xs; i++) {
                    const u = i / xs;
                    const wx = xHeadLeft + u * (nutRearX - xHeadLeft);
                    const smooth = Math.sin(u * Math.PI * 0.5);
                    let wz = zBack + (zJoint - zBack) * smooth;
                    wz += 0.14 * K * yArcCl * yArcCl;
                    posR[ri++] = wx;
                    posR[ri++] = wy;
                    posR[ri++] = wz;
                }
            }
            const row = xs + 1;
            for (let j = 0; j < ys; j++) {
                for (let i = 0; i < xs; i++) {
                    const a = j * row + i;
                    const b = a + row;
                    idxR.push(a, b, a + 1, b, b + 1, a + 1);
                }
            }
            const rampGeo = new T.BufferGeometry();
            rampGeo.setAttribute('position', new T.BufferAttribute(posR, 3));
            rampGeo.setIndex(idxR);
            rampGeo.computeVertexNormals();
            ctx.board.nutHeadstockGroup.add(new T.Mesh(rampGeo, mapleMat));

            const boneMat = new T.MeshStandardMaterial({
                color: nutBase, roughness: 0.38, metalness: 0.02,
            });
            const boneTop = new T.MeshStandardMaterial({
                color: nutHi, roughness: 0.32, metalness: 0.02,
            });
            const grooveMat = new T.MeshStandardMaterial({
                color: nutGro, roughness: 0.85, metalness: 0,
            });

            const nutBody = new T.Mesh(
                new T.BoxGeometry(nutLenX, nutH, nutD),
                boneMat,
            );
            nutBody.position.set(nutXC, yMidN, nutZc);
            ctx.board.nutHeadstockGroup.add(nutBody);

            const crownR = nutLenX * 0.52;
            const crownSeg = new T.CylinderGeometry(
                crownR, crownR, nutLenX * 0.92, 20, 1, true,
                Math.PI * 0.08, Math.PI * 0.42,
            );
            const crown = new T.Mesh(crownSeg, boneTop);
            crown.rotation.z = Math.PI * 0.5;
            crown.position.set(
                nutXC,
                yMidN + nutHalfH - 0.02 * K,
                nutZc + nutD * 0.22,
            );
            ctx.board.nutHeadstockGroup.add(crown);

            const slotDrop = 0.11 * K;
            const slotHalfW = STR_THICK * 1.15;
            const slotZ = nutZc + nutD * 0.12;
            for (let st = 0; st < nStr; st++) {
                const gr = new T.Mesh(
                    new T.BoxGeometry(slotHalfW * 2, slotDrop, nutD * 0.42),
                    grooveMat,
                );
                gr.position.set(nutXC, sY(st), slotZ);
                ctx.board.nutHeadstockGroup.add(gr);
            }
            ctx.board.nutHeadstockGroup.visible = nutHeadstockVisible;
            fretG.add(ctx.board.nutHeadstockGroup);
        }

        // Fret wires — bowed metal TubeGeometry (backported from
        // highway_babylon). Board-string and fret-wire layers live in
        // RENDER_ORDER_LAYER_STACK so the fretboard draws above note
        // symbols and below fret labels.
        // Tube (not T.Line): WebGL ignores linewidth > 1px on almost all
        // platforms, so Line objects always render as hairlines. The tube
        // bows in Z (middle strings pushed away from camera) so the row of
        // frets reads as wrapping a cylindrical neck — see FRET_BOW_DZ.
        // MeshStandardMaterial (vs the old flat MeshBasic): the scene's
        // ambient+directional light glints across the rounded surface for a
        // polished-steel look; the per-frame gold albedo (in-anchor) then
        // reads as brass. depthTest:false: string BoxGeometry (MeshStandard,
        // depthWrite:true) writes depth at Z=+STR_THICK/2; wires near Z=0
        // would fail the depth test at string pixels despite higher layer.
        // Colors are updated each frame by the ctx.board.fretWireMats loop in update(),
        // which drives every wire to one of two tiers: FRET_WIRE_IDLE_* by
        // default, FRET_WIRE_ACTIVE_* inside the anchor lane. The material is
        // created at the idle tier so frame 0 (before update() first runs)
        // already matches.
        const yTop = Math.max(sY(0), sY(nStr - 1));
        const yBottom = Math.min(sY(0), sY(nStr - 1));
        const wireH = (yTop + S_GAP * 0.3) - (yBottom - S_GAP * 0.3);
        const wireMidY = (yTop + yBottom) / 2;
        // Single shared geometry centered at x=0, local Y -half..+half,
        // bowed in Z by FRET_BOW_DZ * [0,0.6,1,0.6,0]. Reused by every fret
        // (only mesh position differs). Symmetric in Y → invert/lefty-safe.
        const yHalf = wireH * 0.5;
        const zMults = [0, 0.6, 1, 0.6, 0];
        const tubePath = zMults.map((zm, i) => new T.Vector3(
            0,
            -yHalf + (wireH * i) / (zMults.length - 1),
            FRET_BOW_DZ * zm,
        ));
        const tubeCurve = new T.CatmullRomCurve3(tubePath);
        ctx.board.fretTubeGeo = new T.TubeGeometry(
            tubeCurve, FRET_TUBE_SEG, FRET_TUBE_RADIUS, FRET_TUBE_RADIAL, false,
        );
        for (let f = 0; f <= NFRETS; f++) {
            const x = xFret(f);
            const mat = new T.MeshStandardMaterial({
                color: FRET_WIRE_IDLE_HEX, metalness: FRET_METALNESS, roughness: FRET_ROUGHNESS,
                emissive: FRET_EMISSIVE,
                // depthWrite:false (matches other transparent overlays here):
                // a transparent fret must not write depth or it can occlude
                // later-drawn transparent elements despite depthTest:false.
                transparent: true, opacity: FRET_WIRE_IDLE_OP, depthTest: false, depthWrite: false,
            });
            const fw = new T.Mesh(ctx.board.fretTubeGeo, mat);
            fw.position.set(x, wireMidY, 0);
            fw.renderOrder = renderOrderForLayerAtZ(0, 'BOARD_FRET_WIRE');
            fretG.add(fw);
            ctx.board.fretWireMats[f] = mat;
        }

        // Fret dots — flat circles (CircleGeometry) lying in the XY plane and
        // facing +Z so they always appear as perfect circles from the camera.
        // depthWrite:false so they don't steal the depth buffer from the
        // transparent string meshes. Slight negative Z recessed under the
        // string plane. Radius 10% below the former 1.5*K dots.
        const dotRZ = (1.5 * K * 0.9);
        const dg = new T.CircleGeometry(dotRZ, 64);
        const dm = new T.MeshBasicMaterial({
            color: 0x556677,
            transparent: true,
            opacity: 1,
            depthWrite: false,
        });
        const dotZBack = -STR_THICK * 0.85;
        const my = (sY(0) + sY(nStr - 1)) / 2;
        const addDot = (x, y) => {
            const d = new T.Mesh(dg, dm);
            d.position.set(x, y, dotZBack);
            // Above the dynamic lane (1) and its dividers (2) so the
            // translucent blue lane no longer paints over and hides the
            // inlay; still well below strings / wires / notes,
            // so those keep drawing on top of the inlay.
            d.renderOrder = 3;
            fretG.add(d);
        };
        for (const f of DOTS) {
            const cx = xFretMid(f);
            if (DDOTS.has(f)) {
                addDot(cx, my - S_GAP * 0.7);
                addDot(cx, my + S_GAP * 0.7);
            } else {
                addDot(cx, my);
            }
        }

        // Fret inlay number labels — sprites sitting just behind the hit line
        // (Z = -K) so camera-distance sorting in the transparent pass puts
        // them before notes at Z = 0, letting notes paint on top.
        // Materials are cloned from the txtMat cache with depthWrite:false so
        // the sprites don't write stale depth values that would clip incoming
        // notes (which arrive from large negative Z). Clones are tracked in
        // ctx.board._inlayMats for explicit disposal on rebuild and destroy().
        // Scale uses (0.5 + textSize) directly — _textSizeMul is stale here
        // (only refreshed at the top of update()); update() rescales live.
        for (const m of ctx.board._inlayMats) m.dispose();
        ctx.board._inlayMats = [];
        ctx.board._inlayLabels = [];
        for (const f of INLAY_LABEL_FRETS) {
            const mat = textSprites.txtMat(f, '#7abfcc', false, 'fretRow').clone();
            mat.depthWrite = false;
            mat.opacity = 0.55;
            const lbl = new T.Sprite(mat);
            const scale = 5.5 * (0.5 + textSize) * fretLabelScaleForFret(f);
            lbl.scale.set(scale * K, scale * K, 1);
            lbl.position.set(xFretMid(f), yTop - S_GAP * 0.4, -K);
            lbl.visible = inlayLabelsVisible;
            fretG.add(lbl);
            ctx.board._inlayLabels.push(lbl);
            ctx.board._inlayMats.push(mat);
        }
    }

    /* ── String glow (called each frame) ────────────────────────────── */
    function updateStringHighlights(noteState) {
        // Glow slider scales both the idle floor and anticipation peak,
        // so glowMul=0 fully silences the per-string emissive pulse.
        // Vibrancy controls the idle opacity floor — anticipation
        // still rides on top regardless of vibrancy so play-feedback
        // through the opacity channel survives even at glowMul=0.
        //
        // Folded with the post-noteState mGlow / mAccentCore writes
        // (was a separate `for (s = 0; s < nStr)` loop in update()),
        // so the per-string scratch arrays stay hot in L1 across all
        // material writes for a given string.
        const BASE_GLOW = 0.02 * glowMul;
        const MAX_GLOW  = 3.5  * glowMul;
        const IDLE_OP   = _vibrancyIdleOp;
        const g = glowMul;
        const venueGemMul = _venueSceneOverride ? VENUE_GEM_EMISSIVE_MUL : 1;

        for (let s = 0; s < nStr; s++) {
            const mesh = ctx.board.stringLines[s];
            if (mesh) {
                const intensity = Math.max(
                    noteState.stringSustain[s] ? 1 : 0,
                    noteState.stringAnticipation[s] || 0,
                );
                mesh.material.emissiveIntensity = BASE_GLOW + intensity * MAX_GLOW;
                mesh.material.opacity = IDLE_OP + intensity * (1 - IDLE_OP);
                mesh.scale.set(1, 1 + intensity * 0.3, 1 + intensity * 0.3);
            }
            // Hit-note emissive — same write pattern as the standalone
            // loop that previously lived at update()'s post-call site.
            // The glow slider scales it here since this assignment
            // stomps anything _applyGlow() set statically.
            const bg = noteState.strGlow[s] * g;
            if (mGlow[s]) mGlow[s].emissiveIntensity = bg * venueGemMul;
            if (mAccentCore[s]) {
                mAccentCore[s].emissiveIntensity =
                    (bg + noteState.accentFillBoost[s] * g) * venueGemMul;
            }
        }
    }

    /* ── Lookahead fret bounds + smooth camera ───────────────────────── */
    // End time of the lookahead window = start of the measure that is
    // CAM_LOOKAHEAD_MEASURES measures ahead of the current one. Uses the
    // _measureStarts cache (times of beats with measure !== -1). With no
    // beats it falls back to CAM_LOOKAHEAD_SEC seconds. Past the last known
    // measure it extrapolates using the average measure duration.
    function lookaheadEndTime(now) {
        const ms = _measureStarts;
        if (!ms || ms.length === 0) return now + CAM_LOOKAHEAD_SEC;
        // Binary search: lo = first index with ms[lo] > now.
        let lo = 0, hi = ms.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (ms[mid] <= now) lo = mid + 1; else hi = mid; }
        const curIdx = lo - 1;                       // current measure (-1 if before the first)
        const targetIdx = curIdx + CAM_LOOKAHEAD_MEASURES;
        if (targetIdx >= 0 && targetIdx < ms.length) return ms[targetIdx];
        // Past the last measure: extrapolate using the average measure duration.
        if (ms.length >= 2) {
            const avg = (ms[ms.length - 1] - ms[0]) / (ms.length - 1);
            if (avg > 0) return ms[ms.length - 1] + (targetIdx - (ms.length - 1)) * avg;
        }
        return now + CAM_LOOKAHEAD_SEC;
    }

    // Earliest future chart time whose lookahead end reaches eventTime.
    // lookaheadEndTime() is monotonic but measure-stepped, so a small
    // bounded binary search works for both measure grids and the seconds
    // fallback without duplicating/inverting its edge-case logic.
    function lookaheadBootstrapTime(now, eventTime) {
        if (!(eventTime > now) || lookaheadEndTime(now) >= eventTime) return now;
        let lo = now;
        let hi = eventTime;
        for (let i = 0; i < 32; i++) {
            const mid = (lo + hi) * 0.5;
            if (lookaheadEndTime(mid) >= eventTime) hi = mid;
            else lo = mid;
        }
        return hi;
    }

    function lookaheadComputeFretBounds(now, anchors, notes, chords) {
        const tEnd = lookaheadEndTime(now);
        let minF = 99;
        let maxF = 0;
        let any = false;
        if (anchors && anchors.length) {
            for (let tt = now; tt <= tEnd + 1e-9; tt += 0.125) {
                const a = getChartAnchorAt(anchors, tt);
                if (!a) continue;
                let fStart = Math.round(Number(a.fret));
                if (!Number.isFinite(fStart) || fStart < 1) fStart = 1;
                let w = Number(a.width);
                if (!Number.isFinite(w)) w = 4;
                w = Math.max(1, Math.round(w));
                const fHi = Math.min(NFRETS, fStart + w - 1);
                minF = Math.min(minF, fStart);
                maxF = Math.max(maxF, fHi);
                any = true;
            }
        }
        const consider = f => {
            if (!(f > 0)) return;
            minF = Math.min(minF, f);
            maxF = Math.max(maxF, f);
            any = true;
        };
        if (notes) {
            let i = lowerBoundT(notes, now);
            for (; i < notes.length; i++) {
                const n = notes[i];
                if (n.t > tEnd) break;
                if (!validString(n.s)) continue;
                consider(n.f);
            }
        }
        if (chords) {
            let i = lowerBoundT(chords, now);
            for (; i < chords.length; i++) {
                const ch = chords[i];
                if (ch.t > tEnd) break;
                if (!ch.notes) continue;
                for (const cn of ch.notes) {
                    if (!validString(cn.s)) continue;
                    consider(cn.f);
                }
            }
        }
        if (!any || minF > maxF) return null;
        return { minF, maxF };
    }

    function lookaheadTargetWorldX(minF, maxF) {
        const wb = CAM_FRET_EDGE_BLEND;
        const middle = (xFretMid(minF) + xFretMid(maxF)) * 0.5;
        const weighted = 0.6 * xFret(0) + 0.4 * xFret(NFRETS);
        return middle * (1 - wb) + weighted * wb;
    }

    function lookaheadSmoothCamStep(dtSec, tgtXWorld, tgtSpanInt) {
        const d = Math.min(0.2, Math.max(1e-4, dtSec));
        const fs = 1 - Math.pow(1 - CAM_FOCUS_BLEND_RATE, d);
        ctx.cam._lookaheadCamX = tgtXWorld * fs + ctx.cam._lookaheadCamX * (1 - fs);
        ctx.cam._lookaheadFretSpan = tgtSpanInt * fs + ctx.cam._lookaheadFretSpan * (1 - fs);
    }

    /* ── Camera target helper ────────────────────────────────────────── */
    // Compute and apply ctx.cam.tgtX + ctx.cam.tgtDist from note-window-accumulated data.
    // Used by BOTH the snap pre-pass (before drawNote() calls, skipDistHyst=true)
    // and the main per-frame camera-target block (skipDistHyst=false) so the
    // two paths can never drift out of sync.
    //
    // wX/wSum        recency-weighted fret-position centroid accumulator
    // distMin/Max    min/max fret seen in the camera targeting window
    // distGot        true iff at least one fretted note was in the window
    // camHystF       X-axis hysteresis factor (from cameraSmoothing)
    // camDistHystF   dist hysteresis factor (from zoomSmoothing)
    // skipDistHyst   true on the snap/first-data frame — no previous ctx.cam.tgtDist
    //                state exists, so bypass the dead-zone gate
    //
    // Side-effects: updates ctx.cam.tgtX, ctx.cam.tgtDist, ctx.cam.prevLowFretBonus.
    // Returns: computed lockActive flag (caller is responsible for setting
    //          ctx.cam.prevLockActive from the returned value).
    function _applyNoteCamTargets(wX, wSum, distMin, distMax, distGot,
                                  camHystF, camDistHystF, skipDistHyst) {
        const lockActive = cameraLockLow && (!distGot || distMax <= 12);
        if (lockActive) {
            // Locked view: frets 0-12 fit in frame, with the peak
            // low-fret bonus baked in so nut chords stay framed.
            // Both halves derive from the same helpers as the
            // dynamic branch so future tuning of the base zoom
            // curve or low-fret pullback can't desync them.
            const lockedBaseU  = camBaseDistU(12);
            const lockedBonusU = camLowFretPullbackU(1);
            // cameraLockZoom slider 0..1 blends between MIN (closest)
            // and MAX (furthest). Default 0.5 maps to ~1.0× so existing
            // users see the same locked view as before this slider.
            const lockZoomMul  = CAM_LOCK_ZOOM_MIN +
                (CAM_LOCK_ZOOM_MAX - CAM_LOCK_ZOOM_MIN) * cameraLockZoom;
            ctx.cam.tgtX             = xFretMid(CAM_LOCK_CENTER_FRET);
            ctx.cam.tgtDist          = (lockedBaseU + lockedBonusU) * K * lockZoomMul;
            ctx.cam.prevLowFretBonus = lockedBonusU;
        } else if (distGot) {
            // Base zoom scales by fret count (distMax - distMin).
            const baseDistU     = camBaseDistU(distMax - distMin);
            // Low-fret pullback: world-X distance between frets is
            // logarithmic, so a 2-fret span at the nut takes much
            // more horizontal screen than the same span at fret 12.
            // The base term scales by *fret count*, not world-X
            // span, so low-fret clusters were under-allotted camera
            // distance and clipped at the left edge (e.g. F power
            // chord at fret 1 partially off-screen). Add a tapered
            // bonus that kicks in below fret 5 and peaks at fret 1
            // (≈16 extra fret-span units, i.e. 16*K world-units of
            // distance), without affecting mid/high neck framing.
            const lowFretBonusU = camLowFretPullbackU(distMin);
            if (skipDistHyst) {
                // First data frame — no previous ctx.cam.tgtDist state; apply
                // directly without the hysteresis dead-zone check.
                ctx.cam.tgtDist = (baseDistU + lowFretBonusU) * K;
            } else {
                // ctx.cam.tgtDist scales at (3 * K) per fret-span unit, so the
                // hysteresis threshold (a fret-span dead zone) converts
                // to ctx.cam.tgtDist-space by multiplying by 3 * K — NOT by
                // FRET_WIDTH_MID, which is X-axis world-units-per-fret
                // and a different unit (would over-tighten the gate by
                // ~4x at SCALE = 2.25).
                //
                // Hysteresis is applied to the BASE portion only. The
                // lowFretBonus changes by 4 fret-span units per integer
                // fret near the nut, which sits below the default-
                // cameraSmoothing (cs=0.5) dead zone of ~8.25 fret-span
                // units (= 2.75 * 3) and would otherwise be suppressed
                // for fret 2 → 1 / 3 → 1 transitions — exactly the
                // corrections this bonus exists to provide. So gate the
                // base, then always reflect bonus changes on top by
                // tracking the last-committed bonus contribution
                // (ctx.cam.prevLowFretBonus) and adjusting ctx.cam.tgtDist for its
                // delta whether or not the base hysteresis fires.
                //
                // First frame after a lock release bypasses the gate
                // entirely so a >12 fret note that disengaged the lock
                // is guaranteed to widen the view. Without this, a
                // small span jump (12→13 frets) at default settings
                // can sit inside the dead zone and the camera fails
                // to follow the high note that just opened the lock.
                const candidateBase = baseDistU * K;
                const baseTgt       = ctx.cam.tgtDist - ctx.cam.prevLowFretBonus * K;
                const justUnlocked  = ctx.cam.prevLockActive;
                if (justUnlocked || Math.abs(candidateBase - baseTgt) > camDistHystF * 3 * K) {
                    ctx.cam.tgtDist = (baseDistU + lowFretBonusU) * K;
                } else if (lowFretBonusU !== ctx.cam.prevLowFretBonus) {
                    ctx.cam.tgtDist = baseTgt + lowFretBonusU * K;
                }
            }
            ctx.cam.prevLowFretBonus = lowFretBonusU;
        }
        // X-axis: recency-weighted centroid with a hysteresis dead zone
        // so small cluster shifts don't trigger visible pan motion.
        if (!lockActive && wSum > 0) {
            const candidateX = wX / wSum;
            if (Math.abs(candidateX - ctx.cam.tgtX) > camHystF * FRET_WIDTH_MID) ctx.cam.tgtX = candidateX;
        }
        return lockActive;
    }

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
    // Swap a pooled label sprite's cached texture WITHOUT recompiling.
    // Setting material.needsUpdate bumps material.version, which forces
    // Three.js through getParameters/getProgramCacheKey on the next
    // render. Swapping one non-null texture for another does NOT change
    // the compiled program (the USE_MAP define is unchanged); only a
    // null <-> non-null transition does, and pooled label sprites are
    // constructed with a non-null map, so in practice this never
    // recompiles. (Note: the DOMINANT getParameters churn turned out to
    // be Three's transparent-DoubleSide two-pass path — see the
    // forceSinglePass comment in _spriteMat2MeshMat — this helper
    // removes the label-swap contribution on top of that.)
    function _setLabelMap(sprite, srcMat) {
        const m = sprite.material;
        if (m.map === srcMat.map) return;
        const nullnessChanged = (m.map == null) !== (srcMat.map == null);
        m.map = srcMat.map;
        if (nullnessChanged) m.needsUpdate = true;
    }

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
                (activePalette && activePalette.length) || 0);
            for (let s = 0; s < _nWarm; s++) {
                const hex = activePalette[s] || 0xffffff;
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
        // frame's capture in the gem path below. vg = 1 when no provider
        // alpha was seen (legacy event path / note_detect off), leaving the
        // authored 4.0/0.7 × glowMul brightness from _applyGlow() untouched.
        // Only the verdict-only materials (mHitBright + its face-fill arrays,
        // and the hit sustain outline) are scaled — never mStrHitOutline,
        // which is the default rim for every fretted note.
        {
            const vg = noteVerdictState.sawAlpha ? noteVerdictState.maxAlpha : 1;
            const venueGemMul = _venueSceneOverride ? VENUE_GEM_EMISSIVE_MUL : 1;
            for (let s = 0; s < mHitBright.length; s++) {
                if (mHitBright[s]) mHitBright[s].emissiveIntensity = 4.0 * glowMul * vg * venueGemMul;
            }
            if (mHitSusOutline) mHitSusOutline.emissiveIntensity = 0.7 * glowMul * vg * venueGemMul;
            noteVerdictState.maxAlpha = 0;
            noteVerdictState.sawAlpha = false;
        }
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
        _textSizeMul = 0.5 + textSize;
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

        // Prune expired notedetect marks once per frame instead of
        // once per drawNote call (issue #9 perf nit). drawNote then
        // only does the bounded (s, f, t) match — no per-note
        // performance.now() / filter() needed. No arr[0] gate: the
        // dedupe path can refresh any entry's expiresAt, so gating on
        // arr[0] would silently skip expired entries behind it.
        noteDetectFrameNowMs = performance.now();
        // In-place prune — avoids allocating a new array every frame.
        // Marks are tiny (0–5 entries typically), so a backwards splice
        // loop is cheap and keeps the existing array object alive.
        if (noteDetectHitMarks.length) {
            for (let _pi = noteDetectHitMarks.length - 1; _pi >= 0; _pi--) {
                if (noteDetectHitMarks[_pi].expiresAt <= noteDetectFrameNowMs) noteDetectHitMarks.splice(_pi, 1);
            }
        }
        if (noteDetectMissMarks.length) {
            for (let _pi = noteDetectMissMarks.length - 1; _pi >= 0; _pi--) {
                if (noteDetectMissMarks[_pi].expiresAt <= noteDetectFrameNowMs) noteDetectMissMarks.splice(_pi, 1);
            }
        }
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
        // Prune _chordVerdicts latches whose chord has fully scrolled
        // past the loop's verdict-window cull. Forward playback never
        // re-encounters a chord, so without this prune the map would
        // grow unbounded for the rest of the song (each chord onset
        // contributes one entry, ~hundreds for a typical song).
        // verdictKey is now an integer encoded by _encodeChordVerdictKey
        // — time component sits in the upper bits, so a direct
        // ``k < pruneBeforeKey`` test prunes correctly without
        // parseFloat / String.slice on every entry.
        //
        // Backward seek (now < lastNow): every latched entry's
        // chord time is now ahead of `now`, the forward-only check
        // below would skip them all and the map would grow on every
        // loop. Clear wholesale — the chord-loop's `chDt > 0` eviction
        // re-creates entries as chords re-enter the pre-hit window.
        //
        // Forward playback: iterate every entry. An earlier `break`
        // optimization assumed Map insertion order tracked chord
        // time, but entries are inserted when a verdict OBSERVATION
        // lands — so a later chord whose verdict arrived first could
        // sit before an earlier chord whose verdict was still
        // pending, and breaking on the first in-window entry would
        // leave the now-older later-inserted entries un-pruned. Full
        // scan is O(n) but n is bounded (chord count in the song,
        // ~hundreds) so the per-frame cost is microseconds.
        if (noteDetectHasProvider && _chordVerdictsLastNow !== null && now < _chordVerdictsLastNow - 0.25) {
            // Backward seek — wipe all verdict latches so notes re-judge
            // from scratch regardless of whether chords were present.
            _chordVerdicts.clear();
            _susVerdictLatch.clear();
            // Score-pop dedup too: a practice loop / rewind re-judges
            // the same popKeys, and the wall-time TTL alone would
            // suppress their fresh "+N" pops for up to 4 s.
            _fxSeen.clear();
        }
        if (noteDetectHasProvider && _chordVerdicts.size > 0) {
            if (_chordVerdictsLastNow !== null && now < _chordVerdictsLastNow - 0.25) {
                // already cleared above
            } else {
                const pruneBefore = ndVerdictT0 - 0.5; // safety margin
                const pruneBeforeKey = Math.round(pruneBefore * _CV_KEY_TIME_MUL) * _CV_KEY_TIME_SLOT;
                for (const k of _chordVerdicts.keys()) {
                    if (k < pruneBeforeKey) _chordVerdicts.delete(k);
                }
            }
        }
        _chordVerdictsLastNow = now;

        const notes = bundle.notes;
        // Skip the merge when inputs are identity-equal to the last
        // frame's; mergeHandShapeSynthChords is chart-static.
        let chords;
        if (_mergeCacheResult !== null
            && _mergeCacheChordsRef === bundle.chords
            && _mergeCacheHsRef === bundle.handShapes
            && _mergeCacheTplRef === bundle.chordTemplates) {
            chords = _mergeCacheResult;
        } else {
            chords = chordInference.mergeHandShapeSynthChords(
                bundle.chords,
                bundle.handShapes,
                bundle.chordTemplates,
            );
            _mergeCacheResult = chords;
            _mergeCacheChordsRef = bundle.chords;
            _mergeCacheHsRef = bundle.handShapes;
            _mergeCacheTplRef = bundle.chordTemplates;
        }

        let arpGhostHsInfer = null;
        const hsForArpGhost = bundle.handShapes;
        if (hsForArpGhost && hsForArpGhost.length && notes && notes.length) {
            const nHs = hsForArpGhost.length;
            while (_arpGhostHsInferScratch.length < nHs) _arpGhostHsInferScratch.push(false);
            // fillArpeggioGhostInferFlags is chart-static — skip if
            // the input refs match the previous frame's.
            if (_arpGhostInferRefHs !== hsForArpGhost
                || _arpGhostInferRefNotes !== notes
                || _arpGhostInferRefTpl !== bundle.chordTemplates) {
                _arpSynthOnsetHsSet.clear();
                chordInference.fillArpeggioGhostInferFlags(hsForArpGhost, bundle.chordTemplates, notes, _arpGhostHsInferScratch, _arpSynthOnsetHsSet);
                _arpGhostInferRefHs = hsForArpGhost;
                _arpGhostInferRefNotes = notes;
                _arpGhostInferRefTpl = bundle.chordTemplates;
            }
            arpGhostHsInfer = _arpGhostHsInferScratch;
        }

        // ── Arpeggio-persist pre-pass ─────────────────────────────────
        // Notes in active arpeggio handshapes must keep rendering their
        // fretboard ghost + brackets until arpBounds.end, even after
        // their onset+sustain exits the normal back-window (t0 = now-0.5s).
        // Build a Set of "t_s" keys so the notes loop can skip the normal
        // window check for these notes.
        // Reuse hoisted Set — clear instead of reallocating every frame.
        _scrArpPersistKeys.clear();
        const _arpPersistKeys = _scrArpPersistKeys;
        if (arpGhostHsInfer && bundle.handShapes && notes) {
            for (let _hi = 0; _hi < bundle.handShapes.length; _hi++) {
                if (!arpGhostHsInfer[_hi]) continue;
                const _hs = bundle.handShapes[_hi];
                const _lo = chordInference.hsStart(_hs), _hi2 = chordInference.hsEnd(_hs);
                if (Number.isNaN(_lo) || Number.isNaN(_hi2)) continue;
                if (now > _hi2 + 0.05) continue; // arpeggio already ended
                // Only persist notes that have already exited the normal back-window
                // (onset+sustain < t0). Notes still in the window enter the loop via
                // the normal check; future notes are gated by the t1 check below.
                const _nLo = lowerBoundT(notes, _lo - 0.01);
                for (let _ni = _nLo; _ni < notes.length; _ni++) {
                    const _n = notes[_ni];
                    if (_n.t > _hi2 + 0.05) break;
                    if (_n.t + (_n.sus || 0) < t0) {
                        _arpPersistKeys.add(_noteKey(_n.t, _n.s));
                    }
                }
            }
        }

        // ── Slide-target gem-suppression pre-pass (chart-static) ──────
        // Detects notes in bundle.notes that are the slide/link destination
        // of a preceding note. The gem (outline+core) is suppressed via
        // skipBody=true, but the sustain/slide trail still renders because
        // the trail block is now outside the !skipBody gate in drawNote().
        //
        // NOTE: an authored `linkNext` flag is NOT present in bundle.notes —
        // note_to_wire() in lib/song.py emits only t, s, f, sus, sl, slu,
        // bn, ho, po, hm, hp, pm, mt, vb, tr, ac, tp. So this is an
        // intentional timing/fret heuristic, not a link-flag lookup.
        //
        // Two source patterns (source has sus > 0):
        //   Case 1 — source has sl/slu: destination.f === source's slide target
        //   Case 2 — same fret (hold), destination has sl/slu (hold→slide)
        //
        // Sources can be single notes OR chord notes (bundle.chords).
        if (notes !== _slideTargetNotesRef || bundle.chords !== _slideTargetChordsRef) {
            _slideTargetSet = null;
            if (notes && notes.length) {
                const stSet = new Set();
                const checkSrc = (srcT, srcS, srcF, srcSus, srcSl) => {
                    if (!(srcSus > 0)) return;
                    const endT = srcT + srcSus;
                    // Reuse the renderer's shared next-on-string tolerance
                    // rather than a separate hardcoded literal.
                    const EPS = NEXT_ON_STRING_T_EPS;
                    let lo = 0, hi = notes.length;
                    while (lo < hi) { const m = (lo + hi) >> 1; if (notes[m].t < endT - EPS) lo = m + 1; else hi = m; }
                    for (let j = lo; j < notes.length; j++) {
                        const q = notes[j];
                        if (q.t > endT + EPS) break;
                        if (q.s !== srcS || q.t <= srcT || Math.abs(q.t - endT) >= EPS) continue;
                        const qSl = (Number.isFinite(q.sl) && q.sl >= 0) ? q.sl
                                  : (Number.isFinite(q.slu) && q.slu >= 0) ? q.slu : -1;
                        if (srcSl >= 0 && q.f === srcSl) { stSet.add(_noteKey(q.t, q.s)); break; } // case 1
                        if (q.f === srcF && qSl >= 0)    { stSet.add(_noteKey(q.t, q.s)); break; } // case 2
                    }
                };
                for (let i = 0; i < notes.length; i++) {
                    const p = notes[i];
                    checkSrc(p.t, p.s, p.f, p.sus,
                        (Number.isFinite(p.sl) && p.sl >= 0) ? p.sl : (Number.isFinite(p.slu) && p.slu >= 0) ? p.slu : -1);
                }
                const rc = bundle.chords;
                if (rc && rc.length) {
                    for (let ci = 0; ci < rc.length; ci++) {
                        const ch = rc[ci]; if (!ch.notes) continue;
                        for (let ni = 0; ni < ch.notes.length; ni++) {
                            const cn = ch.notes[ni];
                            checkSrc(ch.t, cn.s, cn.f, cn.sus,
                                (Number.isFinite(cn.sl) && cn.sl >= 0) ? cn.sl : (Number.isFinite(cn.slu) && cn.slu >= 0) ? cn.slu : -1);
                        }
                    }
                }
                if (stSet.size > 0) _slideTargetSet = stSet;
            }
            _slideTargetNotesRef = notes;
            _slideTargetChordsRef = bundle.chords;
        }

        /** Arpeggio lane purple rails — authored-marker cache + bounds cache. */
        let laneRailArpHsFlags = null;
        let laneRailBoundLo = null;
        let laneRailBoundHi = null;
        const hsLaneRail = bundle.handShapes;
        const notesArrForRails = notes || [];
        if (hsLaneRail && hsLaneRail.length) {
            const nHsL = hsLaneRail.length;
            while (_arpLaneRailHsScratch.length < nHsL) _arpLaneRailHsScratch.push(false);
            while (_arpRailBoundLoScratch.length < nHsL) {
                _arpRailBoundLoScratch.push(0);
                _arpRailBoundHiScratch.push(0);
            }
            // Authored-marker flags depend only on (handShapes, templates).
            if (_laneRailFlagsRefHs !== hsLaneRail
                || _laneRailFlagsRefTpl !== bundle.chordTemplates) {
                arpeggioLaneRail.fillLaneRailHandShapeFlags(hsLaneRail, bundle.chordTemplates, _arpLaneRailHsScratch);
                _laneRailFlagsRefHs = hsLaneRail;
                _laneRailFlagsRefTpl = bundle.chordTemplates;
            }
            // Bounds cache depends on (handShapes, chords, templates, notes).
            if (_laneRailBoundsRefHs !== hsLaneRail
                || _laneRailBoundsRefChords !== chords
                || _laneRailBoundsRefTpl !== bundle.chordTemplates
                || _laneRailBoundsRefNotes !== notesArrForRails) {
                arpeggioLaneRail.fillArpeggioRailShapeBoundsCaches(
                    hsLaneRail,
                    chords ?? [],
                    bundle.chordTemplates,
                    notesArrForRails,
                    _arpLaneRailHsScratch,
                    _arpRailBoundLoScratch,
                    _arpRailBoundHiScratch,
                );
                _laneRailBoundsRefHs = hsLaneRail;
                _laneRailBoundsRefChords = chords;
                _laneRailBoundsRefTpl = bundle.chordTemplates;
                _laneRailBoundsRefNotes = notesArrForRails;
            }
            laneRailArpHsFlags = _arpLaneRailHsScratch;
            laneRailBoundLo = _arpRailBoundLoScratch;
            laneRailBoundHi = _arpRailBoundHiScratch;
        }
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

        // ── Fret wire anchor highlight ─────────────────────────────────
        // Default all wires to gray; wires inside the active anchor range
        // turn gold to match the dynamic highway lane boundary exactly.
        // Uses laneBoundsFromAnchor() — the same helper the lane uses —
        // so the gold fret wires on the board align with the lane edges:
        //   dMin = fret - 1,  dMax = fret + width - 1
        // e.g. { fret:3, width:4 } → dMin=2, dMax=6 → wires 2,3,4,5,6 gold.
        if (ctx.board.fretWireMats.length) {
            const _fwBounds = anchors && anchors.length
                ? anchorLaneBoundsAt(anchors, now) : null;
            const _fwMin = _fwBounds ? _fwBounds.dMin : -1;
            const _fwMax = _fwBounds ? _fwBounds.dMax : -1;
            for (let _f = 0; _f <= NFRETS; _f++) {
                const _m = ctx.board.fretWireMats[_f];
                if (!_m) continue;
                if (_fwMin >= 0 && _f >= _fwMin && _f <= _fwMax) {
                    _m.color.setHex(FRET_WIRE_ACTIVE_HEX);
                    _m.opacity = FRET_WIRE_ACTIVE_OP;
                } else {
                    _m.color.setHex(FRET_WIRE_IDLE_HEX);
                    _m.opacity = FRET_WIRE_IDLE_OP;
                }
                // Baseline emissive every frame: the hit-flash pass below
                // lerps these toward FRET_WIRE_HIT_* in place, so they must
                // be re-seeded or a flash would never fade back out.
                _m.emissive.setHex(FRET_EMISSIVE);
                _m.emissiveIntensity = 1;
            }
        }

        const lookaheadBoundsNow = (cameraMode === 'lookahead')
            ? lookaheadComputeFretBounds(now, anchors, notes, chords)
            : null;

        // ── Frame state ───────────────────────────────────────────────
        // Reuse hoisted scratch arrays — reset only the live [0..nStr) /
        // [0..NFRETS] range instead of allocating new arrays every frame.
        _scrStringSustain.fill(false, 0, nStr);
        _scrStringAnticipation.fill(0, 0, nStr);
        _scrFretHeat.fill(0);           // always NFRETS+1, cheap flat fill
        _fwHitIn.fill(0);               // this frame's confirmed-hit frets
        _rimFlashIn.fill(0);            // this frame's per-string rim-flash alphas
        _fwChordAcc.clear();
        _scrStrGlow.fill(0.5, 0, nStr);
        _scrAccentFillBoost.fill(0, 0, nStr);
        const noteState = {
            stringSustain:    _scrStringSustain,
            stringAnticipation: _scrStringAnticipation,
            fretHeat:         _scrFretHeat,
            strGlow:          _scrStrGlow,
            /** Per-string extra drive for `.ac` gem fill only (`mAccentCore`). */
            accentFillBoost:  _scrAccentFillBoost,
        };

        pbBeg(1);
        // Compute sustain / anticipation / fret heat / per-string glow.
        // Use lowerBoundT to skip notes far in the past (>30s sustain is
        // unrealistic); break once notes are >2s ahead (nothing beyond
        // contributes to fretHeat/anticipation/strGlow).
        if (notes) {
            const _fsLo = lowerBoundT(notes, now - 30);
            for (let _ni = _fsLo; _ni < notes.length; _ni++) {
                const n = notes[_ni];
                if (!validString(n.s)) continue;
                const dt = n.t - now;
                if (dt > 2.0) break;
                const susEnd = n.t + (n.sus || 0);
                if (dt > 0 && dt < 0.6)
                    noteState.stringAnticipation[n.s] = Math.max(noteState.stringAnticipation[n.s], 1 - dt / 0.6);
                if (n.f > 0) {
                    if (now >= n.t && now <= susEnd) noteState.fretHeat[n.f] = 1;
                    else if (n.t > now) noteState.fretHeat[n.f] = Math.max(noteState.fretHeat[n.f], Math.max(0, 1 - dt / 2));
                }
                if (now >= n.t && now <= susEnd) noteState.stringSustain[n.s] = true;
                const sustained = dt < 0 && (n.sus || 0) > 0 && now <= susEnd;
                const hitDist = Math.abs(dt);
                if (hitDist < 0.15 || sustained) {
                    const hitFade = sustained ? 0.7 : (1 - hitDist / 0.15);
                    noteState.strGlow[n.s] = Math.max(noteState.strGlow[n.s], 1.0 + hitFade * 1.5);
                }
            }
        }
        if (chords) {
            // Skip chords further than 30s in the past (covers any sustained chord).
            const _cfsLo = lowerBoundT(chords, now - 30);
            for (let _cni = _cfsLo; _cni < chords.length; _cni++) {
                const ch = chords[_cni];
                if (!ch.notes) continue;
                const dt = ch.t - now;
                if (dt > 2.0) break;
                const chordNotes = filterValidNotes(ch.notes);
                if (chordNotes.length === 0) continue;
                let maxSus = 0;
                for (const n of chordNotes) if ((n.sus || 0) > maxSus) maxSus = n.sus;
                const susEnd = ch.t + maxSus;
                for (const cn of chordNotes) {
                    if (dt > 0 && dt < 0.6)
                        noteState.stringAnticipation[cn.s] = Math.max(noteState.stringAnticipation[cn.s], 1 - dt / 0.6);
                    if (cn.f > 0) {
                        if (now >= ch.t && now <= susEnd) { noteState.fretHeat[cn.f] = 1; continue; }
                        if (ch.t > now) noteState.fretHeat[cn.f] = Math.max(noteState.fretHeat[cn.f], Math.max(0, 1 - dt / 2));
                    }
                }
                if (now >= ch.t && now <= susEnd)
                    for (const cn of chordNotes) noteState.stringSustain[cn.s] = true;
                const sustained = dt < 0 && maxSus > 0 && now <= susEnd;
                const hitDist = Math.abs(dt);
                if (hitDist < 0.15 || sustained) {
                    const hitFade = sustained ? 0.7 : (1 - hitDist / 0.15);
                    for (const cn of chordNotes) {
                        noteState.strGlow[cn.s] = Math.max(noteState.strGlow[cn.s], 1.0 + hitFade * 1.5);
                    }
                }
            }
        }

        pbEnd(1);
        pbBeg(2);
        // ── Next-note-by-string lookahead (for anticipation projection) ──
        // Ghost projection window is 0.6s; fretLastActiveTime needs +2s.
        // Use lowerBoundT to skip past notes and break at +2s.
        _scrNextNoteByString.fill(null, 0, nStr);
        const nextNoteByString = _scrNextNoteByString;
        if (notes) {
            const _nnLo = lowerBoundT(notes, now);
            for (let _ni = _nnLo; _ni < notes.length; _ni++) {
                const n = notes[_ni];
                if (n.t > now + 2) break;
                if (!validString(n.s)) continue;
                if (!nextNoteByString[n.s] || n.t < nextNoteByString[n.s].t) nextNoteByString[n.s] = n;
                if (n.f > 0) fretLastActiveTime[n.f] = now;
            }
        }
        if (chords) {
            // Time-sorted: lowerBoundT skips past historical chords in O(log N)
            // instead of walking the entire prefix every frame.
            const _ncLo = lowerBoundT(chords, now);
            for (let _ci = _ncLo; _ci < chords.length; _ci++) {
                const ch = chords[_ci];
                if (ch.t > now + 2) break;
                if (!ch.notes || ch.t <= now) continue;
                for (const cn of ch.notes) {
                    if (!validString(cn.s)) continue;
                    if (!nextNoteByString[cn.s] || ch.t < nextNoteByString[cn.s].t) {
                        // Reuse per-string scratch object — avoids `{ ...cn, t }` spread allocation.
                        const _sd = _scrNextNoteByStringData[cn.s];
                        Object.assign(_sd, cn);
                        _sd.t = ch.t;
                        nextNoteByString[cn.s] = _sd;
                    }
                    if (cn.f > 0) fretLastActiveTime[cn.f] = now;
                }
            }
        }

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
        _noteFrame.activePalette = activePalette;
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
        _noteFrame.showFretOnNote = showFretOnNote;
        _noteFrame.fretNumberGhostScope = fretNumberGhostScope;
        _noteFrame.glowMul = glowMul;
        _noteFrame._hitFx = _hitFx;
        _noteFrame._sparks = _sparks;
        _noteFrame._verdictMarks = _verdictMarks;
        _noteFrame._streakFx = _streakFx;
        _noteFrame._streakHeat = _streakHeat;
        _noteFrame.projectionVisible = projectionVisible;
        _noteFrame.slideArrowApproachVisible = slideArrowApproachVisible;
        _noteFrame.slideArrowNeckVisible = slideArrowNeckVisible;
        _noteFrame.slideArrowChainPreviewVisible = slideArrowChainPreviewVisible;
        _noteFrame._vibrancyProjOp = _vibrancyProjOp;
        _noteFrame._timingFx = _timingFx;
        _noteFrame._fretLabelAllowed = _fretLabelAllowed;

        // ── Recent-past event per string (for _nextAnyT deadline) ─────
        // Once a note/chord passes `now` it leaves _drawNextByString,
        // resetting _nextAnyT and letting old gems linger too long.
        // Scan back at least CHORD_HWY_LINGER_S so the deadline logic
        // can see every event that lands inside any active linger
        // window (chord frame linger and gem linger both cap at
        // CHORD_HWY_LINGER_S — a tighter scan would miss events in
        // (now - CHORD_HWY_LINGER_S, now - 0.6) and let the frame
        // linger past the next event).
        {
            // Hoisted scratch — avoids `new Array(nStr).fill(...)` every frame.
            const _recArr = _scrRecentByString;
            for (let i = 0; i < nStr; i++) _recArr[i] = -Infinity;
            if (notes) {
                let _ri = lowerBoundT(notes, now);
                for (let i = _ri - 1; i >= 0; i--) {
                    const n = notes[i];
                    if (n.t < now - CHORD_HWY_LINGER_S) break;
                    if (validString(n.s) && n.t > _recArr[n.s]) _recArr[n.s] = n.t;
                }
            }
            if (chords) {
                // Time-sorted: start at the last chord ≤ now instead of
                // chords.length-1 (which walks past every future chord
                // when `now` is early in the song).
                //
                // lowerBoundT returns the first index with t >= now. If
                // chords share the same timestamp, walk forward through
                // the t===now run to the LAST one (so all duplicates at
                // `now` are included — the original `if (ch.t > now)
                // continue` scan-from-end included them all). When no
                // chord is exactly at `now`, start one slot back.
                const _ncHi = lowerBoundT(chords, now);
                let _ci = _ncHi;
                if (_ci < chords.length && chords[_ci].t === now) {
                    while (_ci + 1 < chords.length && chords[_ci + 1].t === now) _ci++;
                } else {
                    _ci -= 1;
                }
                for (; _ci >= 0; _ci--) {
                    const ch = chords[_ci];
                    if (ch.t < now - CHORD_HWY_LINGER_S) break;
                    if (!ch.notes) continue;
                    for (const cn of ch.notes) {
                        if (validString(cn.s) && ch.t > _recArr[cn.s]) _recArr[cn.s] = ch.t;
                    }
                }
            }
            _drawRecentByString = _recArr;
        }

        // ── Sorted union of next/recent event times ──────────────────
        // Populate the scalar scratch used by _firstEventTimeGreaterThan
        // — at most 2 * nStr finite values, then sorted ascending.
        // Float64Array.subarray returns a view, so .sort() runs in place
        // over the live prefix without copying or allocating.
        // Pulls directly from _drawNextByString / _drawRecentByString
        // (closure-scoped, populated just above) so we're independent of
        // the recent-event prepass's inner-block ``_recArr`` alias.
        _scrEventTimesLen = 0;
        for (let s = 0; s < nStr; s++) {
            const nf = _drawNextByString[s];
            if (nf) {
                const tn = nf.t;
                if (Number.isFinite(tn)) _scrEventTimes[_scrEventTimesLen++] = tn;
            }
            const rt = _drawRecentByString[s];
            if (Number.isFinite(rt)) _scrEventTimes[_scrEventTimesLen++] = rt;
        }
        if (_scrEventTimesLen > 1) {
            _scrEventTimes.subarray(0, _scrEventTimesLen).sort();
        }

        // ── Ghost preview gap prepass ──────────────────────────────────
        // For each note/chord in the upcoming 0.65s window, record the
        // onset time of its immediate predecessor on the same string.
        // drawNote() uses this to shrink the ghost preview window from
        // the fixed 0.6s down to min(0.6, gap) so in dense passages the
        // fret label doesn't float 0.6s ahead with no gem in sight.
        //
        // Two-pointer merge over time-sorted notes + chords so the
        // predecessor is correct even when notes and chords interleave.
        // Map with numeric key avoids per-frame string allocation;
        // key = Math.round(t*1e4)*10 + s (unique for notes > 0.1 ms apart).
        // Buffer is hoisted (_scrGhostPrevBuf) and cleared at the top of
        // the prepass; per-string predecessor tracker likewise (_scrGhostLastT).
        _scrGhostPrevBuf.clear();
        const _ghostPrevBuf = _scrGhostPrevBuf;
        {
            for (let _i = 0; _i < nStr; _i++) _scrGhostLastT[_i] = -Infinity;
            const _gLastT = _scrGhostLastT;
            let _gni = notes ? lowerBoundT(notes, now - 1) : 0;
            let _gci = 0;
            if (chords) while (_gci < chords.length && chords[_gci].t < now - 1) _gci++;
            while (true) {
                const nt = (notes && _gni < notes.length) ? notes[_gni].t : Infinity;
                const ct = (chords && _gci < chords.length) ? chords[_gci].t : Infinity;
                const minT = nt <= ct ? nt : ct;
                if (minT > now + 0.65 || minT === Infinity) break;
                if (nt <= ct) {
                    const n = notes[_gni++];
                    if (validString(n.s)) {
                        _ghostPrevBuf.set(Math.round(n.t * 1e4) * 10 + n.s, _gLastT[n.s]);
                        _gLastT[n.s] = n.t;
                    }
                } else {
                    const ch = chords[_gci++];
                    if (ch.notes) for (const cn of ch.notes) {
                        if (validString(cn.s)) {
                            _ghostPrevBuf.set(Math.round(ch.t * 1e4) * 10 + cn.s, _gLastT[cn.s]);
                            _gLastT[cn.s] = ch.t;
                        }
                    }
                }
            }
        }

        // Ramp strGlow while the board ghost is visible so the flying note
        // core + rim read as one solid string-coloured shape with proj.
        // Window is (0, PROJ_WIN_MERGE=0.6s) — use lowerBoundT + break.
        const PROJ_WIN_MERGE = 0.6;
        if (notes) {
            const _sgLo = lowerBoundT(notes, now);
            for (let _ni = _sgLo; _ni < notes.length; _ni++) {
                const n = notes[_ni];
                if (!validString(n.s) || n.f <= 0) continue;
                const dt = n.t - now;
                if (dt >= PROJ_WIN_MERGE) break;
                const nn = nextNoteByString[n.s];
                if (!nn || Math.abs(nn.t - n.t) > NEXT_ON_STRING_T_EPS) continue;
                const blend = 1 - dt / PROJ_WIN_MERGE;
                noteState.strGlow[n.s] = Math.max(noteState.strGlow[n.s], 1.0 + blend * 1.2);
            }
        }
        if (chords) {
            const _projLo = lowerBoundT(chords, now);
            for (let projChordIdx = _projLo; projChordIdx < chords.length; projChordIdx++) {
                const ch = chords[projChordIdx];
                if (!ch.notes || ch.t <= now) continue;
                const dt = ch.t - now;
                if (dt >= PROJ_WIN_MERGE) break;
                const chordNotes = filterValidNotes(ch.notes);
                for (const cn of chordNotes) {
                    if (cn.f <= 0) continue;
                    const nn = nextNoteByString[cn.s];
                    if (!nn || Math.abs(nn.t - ch.t) > NEXT_ON_STRING_T_EPS) continue;
                    const blend = 1 - dt / PROJ_WIN_MERGE;
                    noteState.strGlow[cn.s] = Math.max(noteState.strGlow[cn.s], 1.0 + blend * 1.2);
                }
            }
        }

        // Accent: brighter note body (`mGlow` in drawNote) instead of the old '>' sprite.
        // Notes are sorted — break once past the AHEAD window.
        if (notes) {
            const _acLo = lowerBoundT(notes, now - AHEAD);
            for (let _ni = _acLo; _ni < notes.length; _ni++) {
                const n = notes[_ni];
                if (!validString(n.s) || !n.ac) continue;
                const dt = n.t - now;
                if (dt > AHEAD) break;
                const susEnd = n.t + (n.sus || 0);
                const hasSus = (n.sus || 0) > 0;
                if (dt < -ACCENT_NOTE_LINGER_EPS && (!hasSus || now > susEnd)) continue;
                noteState.strGlow[n.s] = Math.max(noteState.strGlow[n.s], ACCENT_NOTE_STR_GLOW);
                noteState.accentFillBoost[n.s] = Math.max(
                    noteState.accentFillBoost[n.s],
                    ACCENT_NOTE_FILL_BOOST,
                );
            }
        }
        if (chords) {
            const _acChordLo = lowerBoundT(chords, now - 30);
            for (let _aci = _acChordLo; _aci < chords.length; _aci++) {
                const ch = chords[_aci];
                if (!ch.notes) continue;
                const dt = ch.t - now;
                if (dt > AHEAD) break;
                const chordNotes = filterValidNotes(ch.notes);
                if (!chordNotes.length) continue;
                let maxSus = 0;
                for (const x of chordNotes) if ((x.sus || 0) > maxSus) maxSus = x.sus;
                const susEnd = ch.t + maxSus;
                const hasChordSus = maxSus > 0;
                if (dt < -ACCENT_NOTE_LINGER_EPS && (!hasChordSus || now > susEnd)) continue;
                for (const cn of chordNotes) {
                    if (!validString(cn.s) || !cn.ac) continue;
                    noteState.strGlow[cn.s] = Math.max(noteState.strGlow[cn.s], ACCENT_NOTE_STR_GLOW);
                    noteState.accentFillBoost[cn.s] = Math.max(
                        noteState.accentFillBoost[cn.s],
                        ACCENT_NOTE_FILL_BOOST,
                    );
                }
            }
        }

        pbEnd(2);
        pbBeg(3);
        // mGlow / mAccentCore emissive writes are folded into
        // updateStringHighlights() — same per-string scratch reads,
        // one pass.
        updateStringHighlights(noteState);
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
        const camDistHystF = CAM_DIST_HYST_T + (CAM_DIST_HYST_C - CAM_DIST_HYST_T) * zoomSmoothing;
        if (!(cameraMode === 'lookahead')) {
            cs = cameraSmoothing;
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
        _noteFrame.cameraMode = cameraMode;
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

        // ── Song-change detection ─────────────────────────────────────────
        // reconnect() (used for arrangement switches and splitscreen song
        // changes) does not call renderer.destroy/init, so ctx.cam._camSnapped and
        // ctx.cam._camPreScanned would persist into the new song and the snap pre-pass
        // would never fire again.  Detect the change by comparing the current
        // song+arrangement identity against the last-seen key, and reset the
        // camera snap state (and the camera position itself) whenever it flips.
        {
            const si = bundle.songInfo;
            // bundle.songInfo has no filename field (the WS song_info message
            // never includes it).  Use window.feedBack.currentSong.filename
            // — set by highway.js from the WS URL — combined with the
            // arrangement index as a reliable per-song-arrangement key.
            const currentSong = window.feedBack && window.feedBack.currentSong;
            const key = currentSong ? currentSong.filename + '\0' + (si ? (si.arrangement_index ?? '') : '') : null;
            if (key !== null && key !== ctx.cam._songKey) {
                ctx.cam._songKey = key;
                ctx.cam._camSnapped = false;
                ctx.cam._camPreScanned = false;
                ctx.cam._camBootstrapHolding = false;
                ctx.cam._camBootstrapMode = null;
                ctx.cam.tgtX = ctx.cam.curX = xFretMid(CAM_LOCK_CENTER_FRET);
                ctx.cam.tgtDist = ctx.cam.curDist = CAM_DIST_BASE;
                ctx.cam.prevLowFretBonus = 0;
                ctx.cam.prevLockActive = false;
                ctx.cam._lookaheadCamX = xFretMid(CAM_LOCK_CENTER_FRET);
                ctx.cam._lookaheadFretSpan = DEFAULT_LOOKAHEAD_FRET_SPAN;
                ctx.cam._lookaheadCamPrevNow = null;
                ctx.cam._lookaheadLowBonusU = 0;
                ctx.cam._lookaheadHiNeckLatch = false;
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
        }

        // ── Camera bootstrap (first chart data) ──────────────────────────
        // Initialize against the first relevant fretted phrase as soon as
        // the complete chart arrays arrive. For a future phrase, sample the
        // same window state that live framing will have when the phrase
        // first becomes relevant, then hold it through the silent intro.
        // This is O(N) once per song/arrangement and a permanent no-op after.
        if (!ctx.cam._camSnapped && !ctx.cam._camPreScanned && notes && chords) {
            ctx.cam._camPreScanned = true;
            const firstFrettedTime = hwyFirstRelevantFrettedTime(
                notes, chords, now, CAM_TGT_BEHIND, nStr);

            if (cameraMode === 'lookahead'
                && (lookaheadBoundsNow || firstFrettedTime !== null)) {
                // Anchors can make the live lookahead valid before the first
                // fretted event does. Prefer that already-current framing;
                // only project forward when the live window is truly empty.
                const bootstrapNow = lookaheadBoundsNow
                    ? now
                    : lookaheadBootstrapTime(now, firstFrettedTime);
                const bd = lookaheadBoundsNow
                    || lookaheadComputeFretBounds(bootstrapNow, anchors, notes, chords);
                if (bd) {
                    ctx.cam._lookaheadCamX = lookaheadTargetWorldX(bd.minF, bd.maxF);
                    ctx.cam._lookaheadFretSpan = Math.max(1, bd.maxF - bd.minF + 1);
                    const lockSnapEl = cameraLockLow && bd.maxF <= 12;
                    if (lockSnapEl) {
                        const lockedBaseU = camBaseDistU(12);
                        const lockedBonusU = camLowFretPullbackU(1);
                        const lockZoomMul = CAM_LOCK_ZOOM_MIN +
                            (CAM_LOCK_ZOOM_MAX - CAM_LOCK_ZOOM_MIN) * cameraLockZoom;
                        ctx.cam.tgtX = xFretMid(CAM_LOCK_CENTER_FRET);
                        ctx.cam.tgtDist = (lockedBaseU + lockedBonusU) * K * lockZoomMul;
                        ctx.cam.prevLowFretBonus = lockedBonusU;
                        ctx.cam._lookaheadLowBonusU = lockedBonusU;
                        ctx.cam.prevLockActive = true;
                    } else {
                        const baseDU = camBaseDistU(ctx.cam._lookaheadFretSpan);
                        const lowBU = camLowFretPullbackU(bd.minF);
                        ctx.cam.tgtDist = (baseDU + lowBU) * K;
                        ctx.cam.prevLowFretBonus = lowBU;
                        ctx.cam._lookaheadLowBonusU = lowBU;
                        ctx.cam.tgtX = ctx.cam._lookaheadCamX;
                        ctx.cam.prevLockActive = false;
                    }
                    ctx.cam.curX = ctx.cam.tgtX;
                    ctx.cam.curDist = ctx.cam.tgtDist;
                    ctx.cam._camSnapped = true;
                    ctx.cam._lookaheadCamPrevNow = now;
                    ctx.cam._camBootstrapHolding = bootstrapNow > now && !lookaheadBoundsNow;
                    ctx.cam._camBootstrapMode = ctx.cam._camBootstrapHolding ? cameraMode : null;
                } else {
                    // Defensive fallback for malformed chart timing. The
                    // helper found a fretted event, so this should be
                    // unreachable; keeping the default is safer than a
                    // delayed mid-song snap.
                    ctx.cam._camSnapped = true;
                }
            } else if (firstFrettedTime === null) {
                // Empty and all-open charts without lookahead anchor bounds
                // have no horizontal fret target.
                ctx.cam._camSnapped = true;
            } else {
                const bootstrapNow = Math.max(now, firstFrettedTime - camAhead);
                const bootstrapT0 = bootstrapNow - CAM_TGT_BEHIND;
                const bootstrapT1 = bootstrapNow + camAhead;
                let preWX = 0, preWSum = 0;
                let preDistMin = 99, preDistMax = 0, preDistGot = false;

                for (const n of notes) {
                    if (n.t + (n.sus || 0) < bootstrapT0) continue;
                    if (n.t > bootstrapT1) break;
                    if (!validString(n.s)) continue;
                    const nInWin = n.f > 0 && n.t >= bootstrapT0;
                    const nSusNow = n.f > 0 && n.t < bootstrapT0
                        && n.t + (n.sus || 0) >= bootstrapNow;
                    if (nInWin || nSusNow) {
                        const w = Math.exp(-Math.abs(n.t - bootstrapNow) / camTau);
                        preWX += xFretMid(n.f) * w;
                        preWSum += w;
                        if (n.f < preDistMin) preDistMin = n.f;
                        if (n.f > preDistMax) preDistMax = n.f;
                        preDistGot = true;
                    }
                }
                for (const ch of chords) {
                    if (!ch.notes) continue;
                    if (ch.t > bootstrapT1) break;
                    const chNotes = filterValidNotes(ch.notes);
                    if (!chNotes.length) continue;
                    let maxSus = 0;
                    for (const n of chNotes) if ((n.sus || 0) > maxSus) maxSus = n.sus;
                    if (ch.t + maxSus < bootstrapT0) continue;
                    const chOnsetInWin = ch.t >= bootstrapT0;
                    const chSusNow = ch.t < bootstrapT0
                        && ch.t + maxSus >= bootstrapNow;
                    if (!chOnsetInWin && !chSusNow) continue;
                    const chW = Math.exp(-Math.abs(ch.t - bootstrapNow) / camTau);
                    for (const cn of chNotes) {
                        const cnOk = chOnsetInWin
                            || (chSusNow && ch.t + (cn.sus || 0) >= bootstrapNow);
                        if (cn.f > 0 && cnOk) {
                            preWX += xFretMid(cn.f) * chW;
                            preWSum += chW;
                            if (cn.f < preDistMin) preDistMin = cn.f;
                            if (cn.f > preDistMax) preDistMax = cn.f;
                            preDistGot = true;
                        }
                    }
                }

                if (preWSum > 0) {
                    ctx.cam.prevLockActive = _applyNoteCamTargets(
                        preWX, preWSum, preDistMin, preDistMax, preDistGot,
                        camHystF, camDistHystF, /* skipDistHyst= */ true);
                    ctx.cam.curX = ctx.cam.tgtX;
                    ctx.cam.curDist = ctx.cam.tgtDist;
                }
                // The relevant-event helper and this accumulator share
                // validity/window rules; still finish defensively if a
                // malformed event could not produce a target.
                ctx.cam._camSnapped = true;
                ctx.cam._camBootstrapHolding = preWSum > 0 && bootstrapNow > now;
                ctx.cam._camBootstrapMode = ctx.cam._camBootstrapHolding ? cameraMode : null;
            }
        }

        pbBeg(4);
        // Standalone-note render loop -- see instance/render/single-notes.js.
        // Fills lastFretForString (passed to drawChords below, same object
        // reference) and accumulates into the shared _chordAccum object
        // (already seeded above, alongside _noteFrame's camera fields).
        const lastFretForString = _scrLastFretForString;
        singleNoteRenderer.drawSingleNotes(
            notes, anchors, bundle, now, t1, ndVerdictT0, activeFrets, lastFretForString,
            arpGhostHsInfer, _arpPersistKeys, _slideTargetSet, _arpSynthOnsetHsSet,
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

        // ── Fret-wire hit flash (apply) ───────────────────────────────
        // Runs here, after the note + chord draw loops, so it sees this
        // frame's verdicts (_fwHitIn) rather than the previous frame's —
        // the base tier loop that seeds color/opacity/emissive sits far
        // above, before any note has been drawn.
        //
        // _fwHitGlow decays exponentially in CHART time, so the tail is
        // frame-rate independent and honours playback speed. Seeking
        // backward resets it — otherwise a flash from a hit we jumped away
        // from would linger on the wire.
        if (ctx.board.fretWireMats.length && _fwHitColor) {
            // Resolve accumulated chord hits: a chord's flash frames the
            // LANE, not its own shape. The lit lane strip spans the anchor's
            // width (min ~4 frets), which can run a fret past the chord's
            // outermost fret — and a bracket one wire INSIDE the lit lane
            // reads as misaligned. So a chord lights the anchor lane's edge
            // wires: the exact wires the lane strip spans, and the same pair
            // open strings already use. The shape's own outer pair (wire
            // behind the lowest fret, wire at the highest) survives only as
            // the fallback for charts with no anchors.
            for (const _fwE of _fwChordAcc.values()) {
                const _fwA = Math.max(_fwE.a, _fwE.openA);
                if (_fwA <= 0) continue;
                let _w0 = -1, _w1 = -1;
                const _fwB = anchorLaneBoundsAt(_drawAnchors, _fwE.t);
                if (_fwB) {
                    _w0 = _fwB.dMin;
                    _w1 = _fwB.dMax;
                } else if (_fwE.maxF >= _fwE.minF) {
                    _w0 = Math.max(0, _fwE.minF - 1);
                    _w1 = Math.min(NFRETS, _fwE.maxF);
                }
                if (_w0 < 0) continue; // all-open chord on an anchor-less chart
                if (_fwA > _fwHitIn[_w0]) _fwHitIn[_w0] = _fwA;
                if (_fwA > _fwHitIn[_w1]) _fwHitIn[_w1] = _fwA;
            }

            const _fwDt = now - _fwHitPrevTime;
            if (!(_fwDt >= 0) || _fwDt > 1) _fwHitGlow.fill(0); // first frame, seek, or long stall
            const _fwDecay = (_fwDt > 0 && _fwDt <= 1)
                ? Math.exp(-_fwDt / FRET_WIRE_HIT_DECAY)
                : 0;
            _fwHitPrevTime = now;
            // Decay EVERY wire's glow state, but flash only the OUTERMOST
            // pair of lit wires. Fast passages overlap their decay tails, so
            // without this a run of consecutive notes lights a picket fence
            // of wires at once; collapsing to the outer pair keeps the whole
            // lit span reading as ONE bracket — the same rule chords already
            // follow, applied across everything currently glowing. Interior
            // wires keep decaying invisibly (the base tier loop re-seeds
            // their materials each frame), so the bracket tightens naturally
            // as outer tails expire.
            let _fwLo = -1, _fwHi = -1;
            for (let _f = 0; _f <= NFRETS; _f++) {
                const _g = Math.max(_fwHitIn[_f], _fwHitGlow[_f] * _fwDecay);
                _fwHitGlow[_f] = _g;
                if (_g < 0.004) continue;   // below perceptible
                if (_fwLo < 0) _fwLo = _f;
                _fwHi = _f;
            }
            for (let _i = 0; _i < 2; _i++) {
                const _f = _i === 0 ? _fwLo : _fwHi;
                if (_f < 0) break;                       // nothing lit
                if (_i === 1 && _f === _fwLo) break;     // single wire lit
                const _g = _fwHitGlow[_f];
                const _m = ctx.board.fretWireMats[_f];
                if (!_m) continue;
                _m.color.lerp(_fwHitColor, _g);
                _m.emissive.lerp(_fwHitEmissive, _g);
                _m.emissiveIntensity = 1 + (FRET_WIRE_HIT_INTENSITY - 1) * _g;
                _m.opacity += (FRET_WIRE_HIT_OP - _m.opacity) * _g;
            }

            // Gem-rim flash: same intensity ramp as the wires, in the
            // string's own colour. No decay tail of our own — the material
            // is only ever ASSIGNED while the provider confirms the note,
            // and the provider's alpha already fades; when it goes silent
            // the outline reverts and idle intensity is irrelevant.
            for (let _s = 0; _s < mRimFlash.length; _s++) {
                const _m = mRimFlash[_s];
                if (_m) _m.emissiveIntensity = 1 + (FRET_WIRE_HIT_INTENSITY - 1) * _rimFlashIn[_s];
            }
        }

        // Dynamic highway lane + fret-boundary extension lines -- see
        // instance/render/highway-lane.js. hwyLaneFretClipMin/Max are the
        // one piece of state that escapes this section, consumed below by
        // the fret-column reference markers.
        let hwyLaneFretClipMin, hwyLaneFretClipMax;
        ({ hwyLaneFretClipMin, hwyLaneFretClipMax } = highwayLane.drawHighwayLane(
            anchors, bundle, now, chords, activeFrets,
            laneRailArpHsFlags, laneRailBoundLo, laneRailBoundHi,
            highwayIntensity, fretDividersVisible,
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
        if (sectionLabelsOnHighway) beatAndSectionLabels.drawSectionLabels(sections, now, t0, t1, nStr, _textSizeMul);

        // Fret-column reference markers -- see
        // instance/render/fret-column-markers.js.
        fretColumnMarkers.drawFretColumnMarkers(
            beats, now, t1, notes, chords, anchors, fretColumnMarkerCadence, nStr, _textSizeMul,
            hwyLaneFretClipMin, hwyLaneFretClipMax,
        );

        // Camera target resolution -- see instance/render/camera-target.js.
        // Writes only into ctx.cam (shared dep); nothing escapes downstream.
        cameraTarget.drawCameraTarget(
            cameraMode, lookaheadBoundsNow, camDistGot, camWX, camWSum, camDistMin, camDistMax,
            camHystF, camDistHystF, _frameNow, cameraLockLow, cameraLockZoom,
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

    /**
     * Draw  [ GEM ]  bracket pair for an arpeggio note.
     *
     * While the note is approaching (bracketDt > 0) the brackets travel at the
     * same Z as the gem.  Once the note hits the line (bracketDt <= 0) the
     * brackets sit at Z = 0 (the fretboard plane) and persist until arpEnd.
     * They fade in with approach and fade out in the last 0.25 s of the arpeggio.
     *
     * Fretted notes: `[ ]` — 3 BoxGeometry bars per side (vertical + 2 caps).
     * Open strings:  `< >` — 2 diagonal arms per side, tips at note edges.
     *
     * openHalfW (optional) — half-width of the open note body; when supplied,
     * the < > tips are placed at the actual edges of the note rather than a
     * fixed offset.
     */
    function drawArpBrackets(x, y, bracketDt, arpEnd, now, s, isOpen = false, openHalfW = null) {
        if (bracketDt >= AHEAD) return;
        if (bracketDt < 0 && now > arpEnd + 0.05) return;
        if (!pArpBracket) return;

        let alpha;
        if (bracketDt > 0) {
            // Match the chord frame box visibility: full opacity throughout the
            // entire AHEAD window so brackets appear the moment the frame enters
            // view, not after a slow linear fade from alpha≈0 at 3 s out.
            alpha = 1;
        } else {
            const remaining = arpEnd - now;
            alpha = remaining > 0.25 ? 1 : Math.max(0, remaining / 0.25);
        }
        if (alpha < 0.01) return;

        const bracketZ = bracketDt > 0 ? Math.min(0, dZ(bracketDt)) : 0;
        const col = activePalette[s % activePalette.length];
        const barThick = NW * 0.09;
        const bracketH = NH * 1.05;
        const capLen   = NW * 0.42;
        const xOff     = (isOpen && openHalfW != null) ? openHalfW : NW * 0.95;
        const zOff     = 0.006 * K;
        const ord      = 18;

        if (isOpen) {
            // < > chevron — 2 diagonal arms per side.
            // Arm goes from tip outward; angle from positive-X axis via atan2.
            const armLen = Math.sqrt(capLen * capLen + (bracketH * 0.5) * (bracketH * 0.5));
            const ang    = Math.atan2(bracketH * 0.5, capLen); // upper-right arm angle

            const diagBar = (px, py, rz) => {
                const b = pArpBracket.get();
                b.material.color.setHex(col);
                b.material.opacity = alpha;
                b.renderOrder = ord;
                b.position.set(px, py, bracketZ + zOff);
                b.rotation.set(0, 0, rz);
                b.scale.set(armLen, barThick, barThick);
            };

            // < tip at (x - xOff), arms open to the right
            diagBar(x - xOff + capLen * 0.5, y + bracketH * 0.25,  ang);
            diagBar(x - xOff + capLen * 0.5, y - bracketH * 0.25, -ang);

            // > tip at (x + xOff), arms open to the left
            diagBar(x + xOff - capLen * 0.5, y + bracketH * 0.25,  Math.PI - ang);
            diagBar(x + xOff - capLen * 0.5, y - bracketH * 0.25, -Math.PI + ang);
        } else {
            const bar = (px, py, sw, sh) => {
                const b = pArpBracket.get();
                b.material.color.setHex(col);
                b.material.opacity = alpha;
                b.renderOrder = ord;
                b.position.set(px, py, bracketZ + zOff);
                b.rotation.set(0, 0, 0);
                b.scale.set(sw, sh, barThick);
            };

            // Left bracket  [  – vertical bar then caps opening to the right
            bar(x - xOff,                     y,                  barThick, bracketH);
            bar(x - xOff + capLen * 0.5, y + bracketH * 0.5, capLen,   barThick);
            bar(x - xOff + capLen * 0.5, y - bracketH * 0.5, capLen,   barThick);

            // Right bracket  ]  – vertical bar then caps opening to the left
            bar(x + xOff,                     y,                  barThick, bracketH);
            bar(x + xOff - capLen * 0.5, y + bracketH * 0.5, capLen,   barThick);
            bar(x + xOff - capLen * 0.5, y - bracketH * 0.5, capLen,   barThick);
        }
    }

    function drawNotedetectLabels(ctx, W, H) {
        if (!noteDetectLabels.length || !cam || !_probe) return;
        ctx.save();
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const item of noteDetectLabels) {
            _probe.set(item.x, item.y, item.z);
            _probe.project(cam);
            if (_probe.z < -1 || _probe.z > 1) continue;
            const sx = (_probe.x * 0.5 + 0.5) * W;
            const sy = (-_probe.y * 0.5 + 0.5) * H;
            for (let i = 0; i < item.labels.length; i++) {
                const label = item.labels[i];
                const y = sy + (i - (item.labels.length - 1) / 2) * 15;
                ctx.lineWidth = 4;
                ctx.strokeStyle = 'rgba(0,0,0,0.8)';
                ctx.strokeText(label.text, sx, y);
                ctx.fillStyle = label.color;
                ctx.fillText(label.text, sx, y);
            }
        }
        ctx.restore();
    }

    // Score FX overlay pass — "+N" pops rising off their gems, milestone
    // particle bursts / multiplier ring-pulses / streak-break flickers
    // anchored on the strike line. Same overlay layer + projection
    // pattern as drawNotedetectLabels; costs one early-out when nothing
    // is active.
    function drawScoreFx(ctx, W, H) {
        if (!cam || !_probe) return;
        const nowMs = noteDetectFrameNowMs || performance.now();
        // TTL-prune the pop dedup keys (bounded: only notes hit in the
        // last few seconds).
        if (_fxSeen.size) {
            for (const [k, exp] of _fxSeen) {
                if (exp <= nowMs) _fxSeen.delete(k);
            }
        }
        let anyPop = false;
        for (let i = 0; i < _fxPops.length; i++) {
            if (_fxPops[i].active) { anyPop = true; break; }
        }
        let anyBurst = false;
        for (let i = 0; i < _fxBursts.length; i++) {
            if (_fxBursts[i].active) { anyBurst = true; break; }
        }
        const ringAge = nowMs - _fxRingMs;
        if (!anyPop && !anyBurst && ringAge >= 600) return;

        const pal = _fxPalette;
        ctx.save();

        // Strike-line center in screen px — anchor for bursts + pulses.
        let cx = W / 2, cy = H * 0.72, centerOk = false;
        {
            const fretMidY = (sY(0) + sY(nStr - 1)) / 2;
            _probe.set(ctx.cam.curX, fretMidY, 0);
            _probe.project(cam);
            if (_probe.z >= -1 && _probe.z <= 1) {
                cx = (_probe.x * 0.5 + 0.5) * W;
                cy = (-_probe.y * 0.5 + 0.5) * H;
                centerOk = true;
            }
        }

        // Multiplier ring-pulse: one expanding ring on tier-up; the ×4
        // tier pulses in the secondary accent like the HUD badge.
        if (centerOk && ringAge < 600) {
            const t = ringAge / 600;
            const ease = 1 - Math.pow(1 - t, 2);
            ctx.beginPath();
            ctx.arc(cx, cy, 20 + ease * Math.min(W, H) * 0.28, 0, Math.PI * 2);
            ctx.strokeStyle = _fxRingMult >= 4 ? pal.accent2 : pal.accent;
            ctx.globalAlpha = 0.6 * (1 - t);
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        // Milestone bursts.
        if (anyBurst && centerOk) {
            for (let i = 0; i < _fxBursts.length; i++) {
                const b = _fxBursts[i];
                if (!b.active) continue;
                const age = nowMs - b.bornMs;
                if (age >= _FX_BURST_LIFE_MS) { b.active = false; continue; }
                const t = age / _FX_BURST_LIFE_MS;
                ctx.globalAlpha = 1 - t;
                for (let j = 0; j < _FX_BURST_N; j++) {
                    b.px[j] += b.vx[j];
                    b.py[j] += b.vy[j];
                    b.vy[j] += 0.08;
                    ctx.fillStyle = (j & 1) ? pal.accent : pal.accent2;
                    ctx.fillRect(cx + b.px[j] - 2, cy + b.py[j] - 2, 4, 4);
                }
                ctx.globalAlpha = 1;
            }
        }

        // "+N" pops: rise off the gem and fade over the back half.
        if (anyPop) {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            for (let i = 0; i < _fxPops.length; i++) {
                const p = _fxPops[i];
                if (!p.active) continue;
                const age = nowMs - p.bornMs;
                if (age >= _FX_POP_LIFE_MS) { p.active = false; continue; }
                _probe.set(p.x, p.y, p.z);
                _probe.project(cam);
                if (_probe.z < -1 || _probe.z > 1) continue;
                const t = age / _FX_POP_LIFE_MS;
                const sx = (_probe.x * 0.5 + 0.5) * W;
                const sy2 = (-_probe.y * 0.5 + 0.5) * H - t * 30;
                ctx.globalAlpha = t < 0.4 ? 1 : 1 - (t - 0.4) / 0.6;
                ctx.font = `bold ${13 + (p.mult - 1) * 2}px '${pal.font}', sans-serif`;
                ctx.lineWidth = 4;
                ctx.strokeStyle = 'rgba(0,0,0,0.8)';
                ctx.strokeText(p.text, sx, sy2);
                ctx.fillStyle = pal.accent;
                ctx.fillText(p.text, sx, sy2);
            }
            ctx.globalAlpha = 1;
        }

        ctx.restore();
    }

    // Horizontal-FOV-hold ("Hor+"). Returns the vertical fov (deg) the
    // camera should use for the given pane aspect. With the bridge off (or
    // absent), or at/under the start aspect, it returns the base vertical
    // fov unchanged — an exact no-op, so normal panes render identically to
    // before. Past the start aspect it lowers the vertical fov to keep the
    // horizontal cone ~constant, so the neck fills an ultra-wide pane
    // instead of collapsing into a central sliver. Pure + finite-guarded.

    /* ── Camera smooth lerp ──────────────────────────────────────────── */
    function camUpdate(bundle) {
        const bpm = computeBPM(bundle.beats, bundle.currentTime);
        const lerp = CAM_LERP_BASE * Math.max(bpm, 60) / 120;

        // ── Horizontal-FOV-hold + optional wide-pane pose nudges ──
        // Driven by window.__h3dAspectTune (default off → exact no-op).
        // _resolveTuneFor(paneKey) returns the shared base with THIS pane's
        // overrides (if any) laid on top, so a single split pane can be framed
        // independently. The base is seeded from defaults + localStorage on
        // first read, so a persisted tuning session applies on load without
        // opening the panel. Every field is finite-coerced. When disabled (or
        // splitOnly and not in a split) the tune is treated as null, so
        // effectiveVfov returns the base vertical fov and cam.fov is restored
        // to it. The fov write is guarded on an actual change so a steady pane
        // costs nothing.
        const _paneKey = _aspectPaneKey(
            bundle && bundle.songInfo && bundle.songInfo.arrangement, _paneUid);
        // Only feed the Target-picker registry while the tuner is open (same
        // gate as the readout). Closed → nothing is registered, so the registry
        // can't grow for users who never open the panel; the key is still
        // resolved below so any saved overrides keep applying.
        if (window.__h3dAspectPanelOpen) _aspectRegisterPane(_paneKey);
        const _aspTune = _resolveTuneFor(_paneKey);
        const _aspActive = !!(_aspTune && _aspTune.enabled
            && !(_aspTune.splitOnly && !splitscreenActive()));
        const _tune = _aspActive ? _aspTune : null;
        const _vfov = effectiveVfov(ctx.cam._paneAspect, _tune);
        if (Number.isFinite(_vfov) && Math.abs(_vfov - cam.fov) > 1e-4) {
            cam.fov = _vfov;
            cam.updateProjectionMatrix();
        }
        // Publish a per-pane live readout for the tuner panel (only while it's
        // open, so the steady path stays allocation-free). Keyed by pane so
        // the panel can show the reading for whichever target is selected.
        if (window.__h3dAspectPanelOpen) {
            const _ro = window.__h3dAspectReadout || (window.__h3dAspectReadout = {});
            const _slot = _ro[_paneKey] || (_ro[_paneKey] = {});
            _slot.aspect = ctx.cam._paneAspect; _slot.vfov = _vfov;
            _ro.__last = _paneKey;
        }
        // Optional pose nudges (height / dolly / pitch) to chase a low-flat
        // wide-pane look if fov alone isn't enough. Gated to wide panes and
        // suppressed while the Camera Director owns the view (it wins).
        const _startAspect = (_tune && Number.isFinite(_tune.startAspect) && _tune.startAspect > 0)
            ? _tune.startAspect : HORPLUS_START_ASPECT;
        // Resolve the Camera Director bridge once (per-panel under splitscreen,
        // else global). Used both for the wide-pane gate and the transforms below.
        const _freeCam = freeCamFor(highwayCanvas);
        const _dirActive = !!(_freeCam && _freeCam.enabled);
        const _wide = !!(_tune && ctx.cam._paneAspect > _startAspect) && !_dirActive;
        const _poseHMul = (_wide && Number.isFinite(_tune.heightMul)) ? _tune.heightMul : 1;
        const _poseDMul = (_wide && Number.isFinite(_tune.distMul)) ? _tune.distMul : 1;
        const _poseLookYAdd = (_wide && Number.isFinite(_tune.pitchAdd)) ? _tune.pitchAdd * K : 0;
        const _poseLookZMul = (_wide && Number.isFinite(_tune.lookDepthMul) && _tune.lookDepthMul > 0)
            ? _tune.lookDepthMul : 1;

        ctx.cam.curX += (ctx.cam.tgtX - ctx.cam.curX) * lerp;
        // The fret-row fit guard (end of camUpdate) may dolly the camera back
        // via ctx.cam._fretRowFitBoost; the span-driven ctx.cam.tgtDist still owns zooming IN.
        ctx.cam.curDist += (ctx.cam.tgtDist * ctx.cam._fretRowFitBoost - ctx.cam.curDist) * lerp;
        const dist = ctx.cam.curDist * ctx.cam.aspectScale;
        const h = CAM_H_BASE * (dist / CAM_DIST_BASE);

        // Zoom-interpolated framing multipliers: tight (NEAR) -> lower/closer;
        // wide (FAR, fret 1<->20) -> higher/pulled back.
        const _zt = Math.max(0, Math.min(1,
            (dist - CAM_FRAME_DIST_NEAR) / (CAM_FRAME_DIST_FAR - CAM_FRAME_DIST_NEAR)));
        const _hMul = CAM_FRAME_H_NEAR + (CAM_FRAME_H_FAR - CAM_FRAME_H_NEAR) * _zt;
        const _dMul = CAM_FRAME_D_NEAR + (CAM_FRAME_D_FAR - CAM_FRAME_D_NEAR) * _zt;
        const shoulderOffset = (_leftyCached ? -1 : 1) * 10 * K;
        let _camX = ctx.cam.curX + shoulderOffset, _camY = h * _hMul, _camZ = dist * _dMul;
        // Optional wide-pane pose nudges (default identity → no-op).
        if (_poseHMul !== 1) _camY *= _poseHMul;
        if (_poseDMul !== 1) _camZ *= _poseDMul;
        // ── Free-camera user tweaks (orbit / height / zoom / pan) ──
        // Driven by the Camera Director plugin via the camera bridge:
        // window.__h3dCamCtlPanels[panelIndexFor(canvas)] when split (this
        // panel's own camera), falling back to the global window.__h3dCamCtl.
        // Layered ON TOP of the auto-framing so note tracking still works.
        // The bridge is read once into _freeCam and reused for both the
        // position and the look-at transforms; every field is coerced to a
        // finite number before use so a malformed object can never feed NaN
        // into cam.position / cam.lookAt.
        // _freeCam resolved above via freeCamFor(highwayCanvas): the
        // per-panel __h3dCamCtlPanels entry, else global __h3dCamCtl, else null.
        const _lookAtZ = -FOCUS_D * 0.35 * _poseLookZMul;
        if (_freeCam && _freeCam.enabled) {
            const _distMul = Number.isFinite(_freeCam.distMul) ? _freeCam.distMul : 1;
            const _heightMul = Number.isFinite(_freeCam.heightMul) ? _freeCam.heightMul : 1;
            const _yaw = Number.isFinite(_freeCam.yaw) ? _freeCam.yaw : 0;
            const _tx = ctx.cam.curX, _ty = ctx.cam.curLookY, _tz = _lookAtZ; // look target
            let _vx = _camX - _tx, _vy = _camY - _ty, _vz = _camZ - _tz;
            _vx *= _distMul; _vy *= _distMul; _vz *= _distMul; // zoom (dolly)
            _vy *= _heightMul;                                 // height
            const _cy = Math.cos(_yaw), _sy = Math.sin(_yaw);  // orbit around Y
            const _rx = _vx * _cy - _vz * _sy, _rz = _vx * _sy + _vz * _cy;
            _camX = _tx + _rx; _camY = _ty + _vy; _camZ = _tz + _rz;
        }
        cam.position.set(_camX, _camY, _camZ);

        // Self-correcting look-at Y: project the fretboard's near-edge centre
        // to NDC space. If it drifts toward the frame edge, nudge ctx.cam.tgtLookY
        // toward the fretboard centre so the camera tilts to re-frame it.
        // This lets the camera adapt to any panel aspect ratio automatically.
        const fretMidY = (sY(0) + sY(nStr - 1)) / 2;
        _probe.set(ctx.cam.curX, fretMidY, 0);                  // play-line fretboard centre
        cam.lookAt(ctx.cam.curX, ctx.cam.curLookY + _poseLookYAdd, _lookAtZ);    // tentative look — needed for project()
        cam.updateMatrixWorld();
        _probe.project(cam);                             // _probe.y → NDC in [-1, 1]

        // Keep fretboard centre in the lower third of the screen (NDC ≈ -0.35).
        // The deadband width and correction strength are both blended
        // between Twitchy and Calm bounds by the user's tiltSmoothing
        // setting — twitchy = re-frame aggressively (narrow band, strong
        // nudge); calm = let small drift ride (wide band, weak nudge).
        const DESIRED_NDC_Y = -0.35;
        const tiltBand   = CAM_TILT_BAND_T + (CAM_TILT_BAND_C - CAM_TILT_BAND_T) * tiltSmoothing;
        const tiltStr    = CAM_TILT_STR_T  + (CAM_TILT_STR_C  - CAM_TILT_STR_T)  * tiltSmoothing;
        if (_probe.y < DESIRED_NDC_Y - tiltBand || _probe.y > DESIRED_NDC_Y + tiltBand) {
            // _probe.y too low → fretboard near bottom → ctx.cam.tgtLookY decreases → camera tilts down → fretboard rises
            // _probe.y too high → fretboard near top  → ctx.cam.tgtLookY increases → camera tilts up   → fretboard drops
            const correction = (DESIRED_NDC_Y - _probe.y) * fretMidY * tiltStr;
            ctx.cam.tgtLookY = Math.max(-fretMidY, Math.min(fretMidY, ctx.cam.tgtLookY - correction));
        }
        ctx.cam.curLookY += (ctx.cam.tgtLookY - ctx.cam.curLookY) * lerp;

        // Final look-at with the corrected Y (overrides the tentative one above).
        // User tilt (pitch) + pan offsets layer on top when the free-cam is
        // enabled; each is coerced to a finite number to avoid a NaN look-at.
        if (_freeCam && _freeCam.enabled) {
            const _panX = Number.isFinite(_freeCam.panX) ? _freeCam.panX : 0;
            const _panY = Number.isFinite(_freeCam.panY) ? _freeCam.panY : 0;
            const _pitch = Number.isFinite(_freeCam.pitch) ? _freeCam.pitch : 0;
            cam.lookAt(ctx.cam.curX + _panX * K, ctx.cam.curLookY + (_pitch + _panY) * K, _lookAtZ);
        } else {
            cam.lookAt(ctx.cam.curX, ctx.cam.curLookY + _poseLookYAdd, _lookAtZ);
        }

        // ── Fret-row fit guard ────────────────────────────────────────────
        // Project the fret-number-row band (just below the lowest string, at
        // the play line) with the final camera. If it sits below the safe
        // bottom line, dolly back (raise ctx.cam._fretRowFitBoost → applied to the
        // ctx.cam.curDist lerp target next frame) until it clears; relax lazily once
        // there's comfortable headroom. Asymmetric + deadbanded so it
        // converges without hunting, and capped so the zoom can't pop. It
        // cooperates with the tilt loop above rather than fighting it: pulling
        // back shrinks the scene, the tilt loop keeps the board centre anchored
        // at DESIRED_NDC_Y, so only the row's bottom headroom changes. Skipped
        // while the free-cam (Camera Director) owns the view.
        if (_freeCam && _freeCam.enabled) {
            if (ctx.cam._fretRowFitBoost !== 1) ctx.cam._fretRowFitBoost = 1;
        } else {
            cam.updateMatrixWorld();
            const _rowY = Math.min(sY(0), sY(nStr - 1)) - S_GAP * 1.4;
            _probe.set(ctx.cam.curX, _rowY, 0.5 * K);
            _probe.project(cam);                              // _probe.y → NDC; < -1 = off the bottom
            const _rowNdcY = _probe.y;
            if (_rowNdcY < FRET_ROW_FIT_NDC_MIN) {
                // Row below the safe line → pull back promptly, proportional to
                // the deficit so it converges in a few frames without overshoot.
                const _need = FRET_ROW_FIT_NDC_MIN - _rowNdcY;
                ctx.cam._fretRowFitBoost = Math.min(FRET_ROW_FIT_BOOST_MAX,
                    ctx.cam._fretRowFitBoost + Math.min(0.05, _need * 0.4));
            } else if (_rowNdcY > FRET_ROW_FIT_NDC_MIN + FRET_ROW_FIT_DEADBAND
                       && ctx.cam._fretRowFitBoost > 1) {
                // Comfortable headroom → relax the dolly back toward normal, lazily.
                ctx.cam._fretRowFitBoost = Math.max(1, ctx.cam._fretRowFitBoost - 0.01);
            }
        }
    }

    /* ── Resize helper ───────────────────────────────────────────────── */
    function applySize(w, h) {
        if (!ren || !cam || !wrap) return;
        if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
        const baseDPR = splitscreenActive() ? Math.min(devicePixelRatio, 1.25) : Math.min(devicePixelRatio, 2);
        ren.setPixelRatio(_renderScale * baseDPR);
        ren.setSize(w, h);
        // Pin the overlay to #highway's exact box so it fully covers the
        // canvas. The wrap is anchored to top:0/left:0/right:0 of its
        // offset parent, which only lines up with #highway when the
        // canvas sits at the parent's origin. The v3 player can place
        // chrome above the canvas, shifting the wrap up so its lower edge
        // falls short of #highway — leaving a strip of the canvas exposed
        // (the reported gap, where the previous renderer's frame showed
        // through). The wrap is a sibling of highwayCanvas, so they share
        // an offset parent; tracking the canvas's box keeps the overlay
        // flush in single-player and splitscreen alike.
        //
        // Derive the box from the SAME getBoundingClientRect measurements
        // that drive ren.setSize(w, h) — NOT integer offsetTop/Width — so
        // the overlay matches the renderer exactly. Under browser zoom or
        // fractional flex layouts the canvas lands on sub-pixel bounds;
        // offsetWidth/Top round to whole pixels and would leave the wrap up
        // to 1px short of (or shifted from) the canvas, reopening the
        // exposed edge strip. Position is taken relative to the containing
        // block's padding edge (clientTop/Left strip the parent's border),
        // which is what `top`/`left` resolve against for the absolutely
        // positioned wrap. Guarded on a laid-out canvas (offsetWidth/Height
        // > 0); otherwise fall back to the static top:0/left:0/right:0.
        if (highwayCanvas && highwayCanvas.offsetWidth > 0 && highwayCanvas.offsetHeight > 0) {
            const _pinParent = wrap.offsetParent || highwayCanvas.parentNode;
            const _cr = highwayCanvas.getBoundingClientRect();
            const _pr = _pinParent ? _pinParent.getBoundingClientRect() : { top: 0, left: 0 };
            const _pbTop = _pinParent ? _pinParent.clientTop : 0;
            const _pbLeft = _pinParent ? _pinParent.clientLeft : 0;
            wrap.style.top = (_cr.top - _pr.top - _pbTop) + 'px';
            wrap.style.left = (_cr.left - _pr.left - _pbLeft) + 'px';
            wrap.style.right = 'auto';
            wrap.style.width = _cr.width + 'px';
            wrap.style.height = _cr.height + 'px';
            _wrapPinned = true;
        } else {
            // Canvas not laid out (e.g. init ran before #highway had a real
            // box, or a panel hide/show where canvasSize() falls back to the
            // parent panel). Reset to the static anchor — if we had pinned
            // before, the old top/left/right:auto/width would otherwise stay
            // and the wrap would reappear at a stale horizontal position on
            // the next show. Leave _wrapPinned false so the rAF loop re-pins
            // once the canvas materializes again.
            wrap.style.top = '0';
            wrap.style.left = '0';
            wrap.style.right = '0';
            wrap.style.width = 'auto';
            wrap.style.height = h + 'px';
            _wrapPinned = false;
        }
        if (lyricsCanvas) { lyricsCanvas.width = w; lyricsCanvas.height = h; }
        _diagRenderCache.clear();
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
        ctx.cam.aspectScale = Math.max(1, REF_ASPECT / Math.max(cam.aspect, 0.5));
        // Cache the pane aspect for the horizontal-FOV-hold in camUpdate.
        // cam.fov itself is owned by camUpdate (not set here) so live
        // __h3dAspectTune edits apply every frame without a resize.
        ctx.cam._paneAspect = cam.aspect;
        _appliedW = w; _appliedH = h;
    }

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
        for (const p of _fxPops) p.active = false;
        for (const b of _fxBursts) b.active = false;
        _fxSeen.clear();
        _fxGen++;   // invalidate any pending deferred window-copy fallbacks
        _fxLastFxDetail = null;
        _fxElemSeen = new WeakSet();
        _fxRingMs = -1e9;
        _chordVerdicts = new Map();
        if (bcCtrl) { try { bcCtrl.destroy(); } catch (e) {} bcCtrl = null; }
        unmountBackgroundStyle();
        bgGroup = null; backgroundLastT = 0;
        _diagChord = null; _diagPrev = null; _diagPrevOpacity = 0; _diagPrevStartOpacity = 0; _diagPrevStartT = null;
        _diagEntranceT = 1.0; _diagLastKey = null; _diagRenderCache.clear();

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
        if (_composer) { try { _composer.dispose(); if (_bloomPass && _bloomPass.dispose) _bloomPass.dispose(); } catch (e) {} _composer = null; _bloomPass = null; }
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
        ctx.cam.tgtX = ctx.cam.curX = xFretMid(CAM_LOCK_CENTER_FRET); ctx.cam.tgtDist = ctx.cam.curDist = CAM_DIST_BASE; ctx.cam.tgtLookY = ctx.cam.curLookY = 0; ctx.cam._fretRowFitBoost = 1; nStr = NSTR; _oobStringWarned = false;
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
                        applySize(sz.w, sz.h);
                    } else {
                        // Panel container not yet laid out (sizeCanvases() runs after
                        // initPanel() in the setup sequence). Retry each frame until
                        // the panelDiv has real dimensions.
                        (function retrySize() {
                            if (_destroyed || !_isReady) return;
                            const s = canvasSize(highwayCanvas);
                            if (s.w > 0 && s.h > 0) applySize(s.w, s.h);
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
                    _oobStringWarned = false;
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
                if (s.w > 0 && s.h > 0) applySize(s.w, s.h);
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
                _boxCheckCountdown = (_boxCheckCountdown + 1) % 10;
                if (_bsChanged || !_wrapPinned || _boxCheckCountdown === 0) {
                    const box = canvasSize(highwayCanvas);
                    if (_bsChanged) {
                        _lastHwW = highwayCanvas.width;
                        _lastHwH = highwayCanvas.height;
                        if (box.w > 0 && box.h > 0) applySize(box.w, box.h);
                    } else if (box.w > 0 && box.h > 0 &&
                            (Math.abs(box.w - _appliedW) > 1 || Math.abs(box.h - _appliedH) > 1)) {
                        applySize(box.w, box.h);
                    } else if (!_wrapPinned && box.w > 0 && box.h > 0 &&
                            highwayCanvas.offsetWidth > 0 && highwayCanvas.offsetHeight > 0) {
                        //  3. The overlay pin couldn't be applied at init because
                        //     #highway had no layout yet (offsetWidth/Height === 0),
                        //     so applySize() only set the wrap height. The canvas has
                        //     now laid out but to the same logical size, so neither
                        //     drift branch above fires — re-run applySize to pin the
                        //     wrap to the canvas box now that its offsets are real.
                        //     Otherwise the overlay stays at top:0;left:0;right:0 and
                        //     a strip of #highway is exposed on first load / split.
                        applySize(box.w, box.h);
                    }
                }
            }
            update(bundle);
            camUpdate(bundle);

            // Background animations (#13). Compute frame dt once,
            // read audio bands when reactivity is on, delegate to
            // the active style's update().
            if (bgGroup && effectiveBackgroundStyleId() !== 'off') {
                const nowMs = performance.now();
                const dt = backgroundLastT === 0 ? 1 / 60 : Math.min(0.1, (nowMs - backgroundLastT) / 1000);
                backgroundLastT = nowMs;
                const bands = bgReactive ? readAudioBands() : ZERO_AUDIO_BANDS;
                const style = BACKGROUND_STYLES[effectiveBackgroundStyleId()];
                if (style && bgState) {
                    try { style.update(bgState, bands, dt, nowMs / 1000); }
                    catch (e) { console.error('[3D-Hwy] bg update threw', effectiveBackgroundStyleId(), e); }
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
                        syncButterchurnMode();
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
                    if (_tintS >= 0 && activePalette && activePalette.length) {
                        butterchurnTintTarget = activePalette[((_tintS % activePalette.length) + activePalette.length) % activePalette.length];
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
                const comp = (_bloom && !splitscreenActive()) ? _bloomEnsure() : null;
                if (comp) {
                    const bsz = canvasSize(highwayCanvas);
                    if (bsz && bsz.w > 0 && bsz.h > 0 && (bsz.w !== _bloomW || bsz.h !== _bloomH)) {
                        comp.setSize(bsz.w | 0, bsz.h | 0); _bloomW = bsz.w | 0; _bloomH = bsz.h | 0;
                    }
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
                drawNotedetectLabels(lyricsCtx, lyricsCanvas.width, lyricsCanvas.height);
                drawScoreFx(lyricsCtx, lyricsCanvas.width, lyricsCanvas.height);

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
                if (fpsVisible) {
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
                if (sectionHudVisible && bundle.sections && bundle.sections.length) {
                    const secH = drawSectionHud(lyricsCtx, {
                        sections: bundle.sections,
                        currentTime: bundle.currentTime,
                        canvasW: lyricsCanvas.width, canvasH: lyricsCanvas.height,
                        position: sectionHudPosition,
                        sizeSlider: sectionHudSize,
                        lyricsBottom,
                        stackOffset: cornerStack[sectionHudPosition] || 0,
                    });
                    stackPush(sectionHudPosition, secH);
                }

                // 3. Tone HUD.
                if (toneHudVisible && (bundle.toneChanges?.length || bundle.toneBase)) {
                    const toneH = drawToneHud(lyricsCtx, {
                        toneChanges: bundle.toneChanges,
                        toneBase: bundle.toneBase,
                        currentTime: bundle.currentTime,
                        canvasW: lyricsCanvas.width, canvasH: lyricsCanvas.height,
                        position: toneHudPosition,
                        sizeSlider: toneHudSize,
                        lyricsBottom,
                        stackOffset: cornerStack[toneHudPosition] || 0,
                    });
                    stackPush(toneHudPosition, toneH);
                }

                // 4. Chord diagram — always last (bottommost in the stack).
                // Draw outgoing first so the incoming diagram renders on top,
                // making the entrance scale-in animation visible during crossfades.
                // The outgoing (prev) diagram uses the same corner slot — it is
                // fading out while the incoming one fades in, so they share the
                // same stack position and don't double-count the height.
                if (chordDiagramVisible && _diagPrev && _diagPrevOpacity > 0) {
                    _drawDiagramCached(lyricsCtx, {
                        name: _diagPrev.name, frets: _diagPrev.frets,
                        opacity: _diagPrevOpacity,
                        entranceT: (_diagPrev.t !== undefined)
                            ? Math.min(1.0, Math.max(0, (bundle.currentTime - _diagPrev.t) / DIAG_ENTRANCE_S))
                            : 1.0,
                        canvasW: lyricsCanvas.width, canvasH: lyricsCanvas.height,
                        inverted: _invertedCached,
                        sizeSlider: chordDiagramSize, position: chordDiagramPosition,
                        nStr: _diagPrev.nStr ?? nStr,
                        lyricsBottom,
                        stackOffset: cornerStack[chordDiagramPosition] || 0,
                    });
                    // Don't push here — outgoing and incoming share the same slot.
                }
                if (chordDiagramVisible && _diagChord) {
                    const diagH = _drawDiagramCached(lyricsCtx, {
                        name: _diagChord.name, frets: _diagChord.frets,
                        opacity: Math.max(0, 1 + (_diagChord.t - bundle.currentTime) / DIAG_LINGER_S),
                        entranceT: _diagEntranceT,
                        canvasW: lyricsCanvas.width, canvasH: lyricsCanvas.height,
                        inverted: _invertedCached,
                        sizeSlider: chordDiagramSize, position: chordDiagramPosition,
                        nStr: _diagChord.nStr ?? nStr,
                        lyricsBottom,
                        stackOffset: cornerStack[chordDiagramPosition] || 0,
                    });
                    stackPush(chordDiagramPosition, diagH);
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
            applySize(s.w > 0 ? s.w : w, s.h > 0 ? s.h : h);
        },

        destroy() {
            _destroyed = true; _isReady = false; _diagChord = null; _diagPrev = null; _diagLastKey = null; _diagRenderCache.clear();
            _lastHwW = 0; _lastHwH = 0;
            _appliedW = 0; _appliedH = 0;
            ctx.cam._paneAspect = 0;
            if (cam && cam.fov !== BASE_VFOV) { cam.fov = BASE_VFOV; cam.updateProjectionMatrix(); }
            _wrapPinned = false;
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

