import { fretMid, fretX } from '../core/fret-geometry.js';
import { CAM_DIST_BASE, CAM_LOCK_CENTER_FRET, DEFAULT_LOOKAHEAD_FRET_SPAN, K } from '../core/constants.js';
import { SETTING_DEFAULTS } from '../settings/defaults.js';
import { PALETTES } from '../core/palette.js';

// The per-instance shared-state object (Stage 7 Track B). Where note.js's
// `deps`/`frame` split works because each field is owned by exactly ONE
// writer (construction-time-stable, or rebuilt fresh each frame by a single
// producer), some state genuinely has MANY co-equal writers -- camera pose
// is written by camUpdate(), applySize(), the lookahead helpers,
// _applyNoteCamTargets(), and three different sections of update() (song-
// change detection, camera bootstrap, camera target), all touching the same
// ~20 fields across the same frame. No single owner exists to hand a
// `deps`/`frame` bag to; every consumer needs to read the CURRENT value and
// have its own writes immediately visible to every other consumer. `ctx` is
// that shared object: every consumer function holds the same reference and
// reads/writes `ctx.cam.field` directly -- no bag-rebuilding, no snapshot
// staleness, because it's the same object for all of them.
//
// Grown incrementally, group by group, driven by whichever consumer cluster
// is being migrated -- NOT built as an upfront speculative 13-group object.
// A speculative ctx.js with zero real consumers was tried once (Stage 7
// Phase 3a) and reverted: with no consumer to validate field names/shapes
// against, there's no way to get the shape right, and unused groups are
// just dead scaffolding. `cam` is the first group, added for the
// camUpdate()/applySize()/buildBoard()-adjacent camera-pose cluster (Track
// B, 3-ctx-1) -- the plan's designated pattern validator for "N functions
// share live state via one object," the role drawNote() played for
// `deps`/`frame`.
//
// "Every field initialised in the literal so V8 keeps one hidden class"
// (the concern that motivates NOT doing ad hoc `ctx.cam.newField = x`
// assignments after construction) is about `createCtx(1)` vs `createCtx(2)`
// -- two splitscreen panels -- sharing a hidden class AT ANY GIVEN COMMIT,
// not about the object's shape being frozen forever. The shape is free to
// grow in later commits as more groups land; each `createCtx()` call at a
// given commit just has to build the same shape as every other call at
// that commit.
export function createCtx(id) {
    // Matches the original declarations' actual initial values exactly:
    // xFretMid(CAM_LOCK_CENTER_FRET) with _leftyCached still at its own
    // default (false) at that point in the closure is just
    // fretMid(CAM_LOCK_CENTER_FRET) -- same numeric value, computed here
    // without depending on the closure's per-instance xFretMid() helper.
    const centerX = fretMid(CAM_LOCK_CENTER_FRET);
    return {
        id,
        cam: {
            // Smoothed camera position + look-at (camUpdate() lerps cur* toward tgt*).
            curX: centerX,
            tgtX: centerX,
            curDist: CAM_DIST_BASE,
            tgtDist: CAM_DIST_BASE,
            curLookY: 0,
            tgtLookY: 0,
            // Fret-row-fit dolly-back multiplier (camUpdate()'s fret-row fit guard).
            _fretRowFitBoost: 1,
            // Cached aspect state (applySize() writes, camUpdate() reads).
            aspectScale: 1,
            _paneAspect: 0,
            // Low-fret pullback + lock-active tracking (_applyNoteCamTargets()).
            prevLowFretBonus: 0,
            prevLockActive: false,
            // First-chart-data bootstrap gating (update()'s song-change-detection +
            // camera-bootstrap sections).
            _camSnapped: false,
            _camPreScanned: false,
            _camBootstrapHolding: false,
            _camBootstrapMode: null,
            _songKey: null,
            // Smoothed lookahead-mode camera target (lookaheadSmoothCamStep()).
            _lookaheadCamX: centerX,
            _lookaheadFretSpan: DEFAULT_LOOKAHEAD_FRET_SPAN,
            _lookaheadCamPrevNow: null,
            _lookaheadLowBonusU: 0,
            _lookaheadHiNeckLatch: false,
        },
        // Fretboard/nut/headstock geometry + materials -- all written once
        // per buildBoard() call (initScene(), a rebuild, or a lefty/string-
        // count change), then read by a handful of other functions
        // (updateStringHighlights(), _applyVibrancy(), _applyBgTheme(),
        // _syncOpenStringPitchLabels(), update()'s fret-wire-highlight
        // sections, teardown()) that never rebuild it themselves. Added
        // alongside `cam` (3-ctx-1b) -- confirmed via the same whole-file
        // grep to share zero fields with `cam`, so this is a fully
        // independent slice, not an extension of the camera-pose migration.
        board: {
            stringLines: [],
            stringLineGlows: [],
            fretWireMats: [],
            fretTubeGeo: null,
            _boardPlaneMat: null,
            nutHeadstockGroup: null,
            boardStringStartX: fretX(0),
            boardTuningLabelX: -4.2 * K,
            _inlayLabels: [],
            _inlayMats: [],
        },
        // Settings-driven values (Stage 7 Track 3e), migrated off bare
        // closure `let`s one independent batch at a time -- unlike `cam`,
        // each field here has exactly ONE writer (loadSettings()) and its
        // reads don't share a function cluster with any other field, so
        // there's no requirement to migrate them all in lockstep. This
        // first batch is every setting read ONLY inside update() (mostly
        // the `_noteFrame` snapshot block) -- the safest, most mechanical
        // group. Defaults mirror SETTING_DEFAULTS exactly so a fresh ctx
        // matches the pre-loadSettings() render (same contract the bare
        // `let`s' own default initialisers used to carry).
        settings: {
            showFretOnNote: SETTING_DEFAULTS.showFretOnNote,
            fretNumberGhostScope: SETTING_DEFAULTS.fretNumberGhostScope,
            cameraMode: SETTING_DEFAULTS.cameraMode,
            _hitFx: SETTING_DEFAULTS.hitFx,
            _sparks: SETTING_DEFAULTS.sparks,
            _verdictMarks: SETTING_DEFAULTS.verdictMarks,
            _timingFx: SETTING_DEFAULTS.timingFx,
            _streakFx: SETTING_DEFAULTS.streakFx,
            fretDividersVisible: SETTING_DEFAULTS.fretDividersVisible,
            fretColumnMarkerCadence: SETTING_DEFAULTS.fretColumnMarkerCadence,
            sectionLabelsOnHighway: SETTING_DEFAULTS.sectionLabelsOnHighway,
            projectionVisible: SETTING_DEFAULTS.projectionVisible,
            slideArrowApproachVisible: SETTING_DEFAULTS.slideArrowApproachVisible,
            slideArrowNeckVisible: SETTING_DEFAULTS.slideArrowNeckVisible,
            slideArrowChainPreviewVisible: SETTING_DEFAULTS.slideArrowChainPreviewVisible,
            // Batch 2: settings read only inside draw()'s HUD/chord-diagram
            // corner-stacking block (plus the bloom composer gate, same
            // function).
            _bloom: SETTING_DEFAULTS.bloom,
            fpsVisible: SETTING_DEFAULTS.fpsVisible,
            chordDiagramVisible: SETTING_DEFAULTS.chordDiagramVisible,
            chordDiagramSize: SETTING_DEFAULTS.chordDiagramSize,
            chordDiagramPosition: SETTING_DEFAULTS.chordDiagramPosition,
            sectionHudVisible: SETTING_DEFAULTS.sectionHudVisible,
            sectionHudPosition: SETTING_DEFAULTS.sectionHudPosition,
            sectionHudSize: SETTING_DEFAULTS.sectionHudSize,
            toneHudVisible: SETTING_DEFAULTS.toneHudVisible,
            toneHudPosition: SETTING_DEFAULTS.toneHudPosition,
            toneHudSize: SETTING_DEFAULTS.toneHudSize,
            // Batch 3: single-function settings spread across
            // _applyBgTheme()/buildBoard() (theme + board colors),
            // _syncOpenStringPitchLabels(), update()/camUpdate() (camera
            // smoothing dials), draw() (bgReactive), and
            // mountBackgroundStyle() (custom asset refs).
            cameraSmoothing: SETTING_DEFAULTS.cameraSmoothing,
            zoomSmoothing: SETTING_DEFAULTS.zoomSmoothing,
            tiltSmoothing: SETTING_DEFAULTS.tiltSmoothing,
            bgReactive: SETTING_DEFAULTS.reactive,
            bgThemeId: SETTING_DEFAULTS.bgTheme,
            hwThemeId: SETTING_DEFAULTS.hwTheme,
            nutColor: SETTING_DEFAULTS.nutColor,
            headstockColor: SETTING_DEFAULTS.headstockColor,
            tuningLabelsVisible: SETTING_DEFAULTS.tuningLabelsVisible,
            bgCustomImageDataUrl: SETTING_DEFAULTS.customImageDataUrl,
            bgCustomImageName: SETTING_DEFAULTS.customImageName,
            bgCustomVideoName: SETTING_DEFAULTS.customVideoName,
            // Batch 4: cameraLockLow/cameraLockZoom (_applyNoteCamTargets()
            // plus two already-extracted call sites that take them as plain
            // params -- camera-target.js, camera-bootstrap.js), textSize
            // (buildBoard()/update()), glowMul (initScene() one-time
            // snapshots, _applyGlow(), update()).
            cameraLockLow: SETTING_DEFAULTS.cameraLockLow,
            cameraLockZoom: SETTING_DEFAULTS.cameraLockZoom,
            textSize: SETTING_DEFAULTS.textSize,
            glowMul: SETTING_DEFAULTS.glow,
            // Batch 5: vibrancy dial + its two DERIVED fields (genuine
            // second writer: loadSettings() computes them from a freshly-
            // read vibrancy, _applyVibrancy() recomputes them whenever the
            // palette/materials are retinted -- both writers now target
            // ctx.settings, kept in sync same as before). _cinematic is a
            // plain single-function (_applyCinematic()) passthrough.
            vibrancy: SETTING_DEFAULTS.vibrancy,
            _vibrancyIdleOp: 0.4  + 0.6  * SETTING_DEFAULTS.vibrancy,
            _vibrancyProjOp: 0.15 + 0.35 * SETTING_DEFAULTS.vibrancy,
            _cinematic: SETTING_DEFAULTS.cinematic,
            // Batch 6: the four settings settings-listener.js previously
            // threaded through as live getters (`getBgStyleId` etc.) because
            // the values were bare main.js closure `let`s reassigned by
            // loadSettings() mid-flight. Now that they live on the SAME
            // stable ctx object settings-listener.js already holds a
            // reference to, the getter indirection is dropped entirely --
            // it reads ctx.settings.x directly, same as its existing
            // ctx.board.* reads.
            bgStyleId: SETTING_DEFAULTS.style,
            bgIntensity: SETTING_DEFAULTS.intensity,
            inlayLabelsVisible: SETTING_DEFAULTS.inlayLabelsVisible,
            nutHeadstockVisible: SETTING_DEFAULTS.nutHeadstockVisible,
            // Batch 7 (final): the last two, and the most cross-cutting --
            // ~13 functions read activePalette (construction-time snapshots
            // in initScene() are intentionally stale, see note-gem-visuals.js's
            // doc comment -- _applyPaletteToMaterials()/_recolorGemGradients()
            // are what keep already-built materials live-retinted).
            // backgroundPaletteSig has zero external readers -- it's a
            // loadSettings()-internal signature cache, migrated alongside
            // activePalette since the two are always written together.
            activePalette: PALETTES.default,
            backgroundPaletteSig: '',
        },
    };
}
