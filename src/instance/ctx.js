import { fretMid, fretX } from '../core/fret-geometry.js';
import { CAM_DIST_BASE, CAM_LOCK_CENTER_FRET, DEFAULT_LOOKAHEAD_FRET_SPAN, K } from '../core/constants.js';
import { SETTING_DEFAULTS } from '../settings/defaults.js';
import { PALETTES } from '../core/palette.js';

/**
 * The per-instance shared-state object. Fields with many co-equal readers
 * AND writers (camera pose, board geometry) live here so every consumer
 * holds the same reference and sees writes immediately — no bag-rebuilding,
 * no snapshot staleness. Grow it group-by-group, driven by a real consumer
 * cluster; don't add a group speculatively with no consumer to validate its
 * shape against.
 *
 * Every field must be initialized in the literal (never added ad hoc via
 * `ctx.group.newField = x` after construction) so every `createCtx()` call
 * at a given commit builds the same V8 hidden class — required for
 * `createCtx(1)`/`createCtx(2)` (two splitscreen panels) to share one.
 */
export function createCtx(id) {
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
        /**
         * Fretboard/nut/headstock geometry + materials. Written once per
         * `buildBoard()` call (init, rebuild, or a lefty/string-count
         * change); read by `updateStringHighlights()`, `_applyVibrancy()`,
         * `_applyBgTheme()`, `_syncOpenStringPitchLabels()`, the fret-wire
         * highlight sections of `update()`, and `teardown()`.
         */
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
        /**
         * Settings-driven values from `loadSettings()`. Each field has
         * exactly one writer (`loadSettings()`, plus a couple of documented
         * second writers below) and defaults mirror `SETTING_DEFAULTS`
         * exactly so a fresh ctx matches the pre-`loadSettings()` render.
         */
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
            cameraLockLow: SETTING_DEFAULTS.cameraLockLow,
            cameraLockZoom: SETTING_DEFAULTS.cameraLockZoom,
            textSize: SETTING_DEFAULTS.textSize,
            glowMul: SETTING_DEFAULTS.glow,
            // vibrancy has a second writer: _applyVibrancy() recomputes the two
            // derived fields whenever the palette/materials are retinted.
            vibrancy: SETTING_DEFAULTS.vibrancy,
            _vibrancyIdleOp: 0.4  + 0.6  * SETTING_DEFAULTS.vibrancy,
            _vibrancyProjOp: 0.15 + 0.35 * SETTING_DEFAULTS.vibrancy,
            _cinematic: SETTING_DEFAULTS.cinematic,
            bgStyleId: SETTING_DEFAULTS.style,
            bgIntensity: SETTING_DEFAULTS.intensity,
            inlayLabelsVisible: SETTING_DEFAULTS.inlayLabelsVisible,
            nutHeadstockVisible: SETTING_DEFAULTS.nutHeadstockVisible,
            // activePalette has ~13 readers; construction-time snapshots in initScene()
            // are intentionally stale — _applyPaletteToMaterials()/_recolorGemGradients()
            // keep already-built materials live-retinted. backgroundPaletteSig is a
            // loadSettings()-internal signature cache, always written alongside it.
            activePalette: PALETTES.default,
            backgroundPaletteSig: '',
        },
    };
}
