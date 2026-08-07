import { T } from '../core/three.js';
import {
    FOG_END, FOG_START, HIGHWAY_LANE_STRIPE_EVEN_HEX, HIGHWAY_LANE_STRIPE_ODD_HEX,
} from '../core/constants.js';
import { backgroundAxisColors, highwayAxisColors } from '../settings/defaults.js';
import { BACKGROUND_STYLES } from '../background/styles/index.js';
import { _venueSceneOverride } from '../background/venue.js';
import { getAudioAnalyser } from '../audio/analyser.js';
import { createButterchurnController } from '../butterchurn/controller.js';
import { canvasSize, disposeGroupTree } from './model/math.js';

/**
 * Background-style mount/unmount/rebuild + the two-axis scene-color theme
 * applier. `bgState`/`bgStage`/`bgMountedStyleId` are private to this
 * module, written only by {@link mountBackgroundStyle}/
 * {@link unmountBackgroundStyle}; external readers use {@link getBgState}.
 * Everything else that's genuinely owned elsewhere (scene/cam/ren/wrap/
 * ambLight/highwayCanvas/bgGroup/mLaneOdd/mLaneEven/bcCtrl/backgroundLastT)
 * is threaded through as live getters, or getter+setter pairs where this
 * module also writes.
 */
export function createBackgroundMount({
    ctx, butterchurnModeActive, loadSettings,
    getWrap, getRen, getScene, getCam, getAmbLight, getHighwayCanvas,
    getBgGroup, getMLaneOdd, getMLaneEven,
    getLaneTargetColor, setLaneTargetColor,
    getBcCtrl, setBcCtrl, setBackgroundLastT,
}) {
    let bgState = null;
    let bgStage = null;
    let bgMountedStyleId = null;

    function effectiveBackgroundStyleId() {
        return _venueSceneOverride ? 'venue' : ctx.settings.bgStyleId;
    }

    /**
     * The `'butterchurn'` bg-style renders a WebGL MilkDrop canvas behind a
     * transparent highway via the standalone `butterchurn/` controller, not
     * a Three.js fog-scenery style (its scenery falls back to `'off'`).
     * Idempotent; driven by the bg-style dropdown through {@link mountBackgroundStyle}.
     */
    function syncButterchurnMode() {
        const wrap = getWrap(), ren = getRen();
        let bcCtrl = getBcCtrl();
        if (butterchurnModeActive()) {
            // Recreate when there's no controller or the last one died during async
            // init (lib/WebGL failure) — a dead controller self-cleaned, so retry here.
            if ((!bcCtrl || (bcCtrl.dead && bcCtrl.dead())) && wrap) {
                if (bcCtrl) { bcCtrl = null; setBcCtrl(null); }
                // audioProvider reuses this instance's shared analyser so the browser
                // path never opens a second createMediaElementSource on #audio.
                try {
                    setBcCtrl(createButterchurnController(
                        wrap, () => canvasSize(getHighwayCanvas()),
                        () => { try { return getAudioAnalyser(); } catch (e) { return null; } },
                    ));
                } catch (e) { console.warn('[3D-Hwy] Butterchurn init failed', e); }
            }
            if (ren) ren.setClearColor(0x101820, 0); // transparent so the visualizer shows through
        } else if (bcCtrl) {
            try { bcCtrl.destroy(); } catch (e) {}
            setBcCtrl(null);
            _applyBgTheme(); // restore the opaque themed clear
        }
    }

    function mountBackgroundStyle() {
        const effectiveId = effectiveBackgroundStyleId();
        const style = BACKGROUND_STYLES[effectiveId] || BACKGROUND_STYLES.off;
        // Build into a fresh stage group so a partial throw can't orphan meshes
        // inside bgGroup — on success it joins atomically, on failure it's disposed whole.
        const stage = new T.Group();
        let result = null;
        try {
            result = style.build(stage, {
                intensity: ctx.settings.bgIntensity,
                palette: ctx.settings.activePalette,
                customImageDataUrl: ctx.settings.bgCustomImageDataUrl,
                customVideoName: ctx.settings.bgCustomVideoName,
                cam: getCam(),
            }) || null;
        } catch (e) {
            console.error('[3D-Hwy] bg style build failed', effectiveId, e);
            disposeGroupTree(stage);
            bgState = null;
            bgStage = null;
            bgMountedStyleId = null;
            return;
        }
        // renderOrder on a Group doesn't propagate to children (Three.js sorts per-object),
        // so stamp every mesh to keep transparent bg objects sorted behind notes.
        stage.traverse((c) => { c.renderOrder = -1; });
        getBgGroup().add(stage);
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
        // Belt + suspenders: the stage tree dispose mops up anything a style's teardown missed.
        if (bgStage) {
            bgStage.parent?.remove(bgStage);
            disposeGroupTree(bgStage);
            bgStage = null;
        }
        bgMountedStyleId = null;
    }

    function rebuildBackground() {
        if (!getBgGroup()) return;
        // Order matters: unmount against the (style id, state) pair that built the
        // meshes, BEFORE reloading settings. Reload, then mount with the new id.
        unmountBackgroundStyle();
        loadSettings();
        mountBackgroundStyle();
        applyVenueSceneFog(_venueSceneOverride);
        // Reset dt accounting so the first frame after a switch doesn't see a huge
        // "since last update" window, which would clamp to 0.1 and visibly snap motion.
        setBackgroundLastT(0);
    }

    /** Venue-only fog/clear/ambient tuning (darker, less washed-out over the playable highway); restored when venue deactivates. */
    function applyVenueSceneFog(active) {
        const scene = getScene(), ren = getRen(), ambLight = getAmbLight();
        if (!scene || !scene.fog) return;
        if (active) {
            scene.fog.color.setHex(0x080c12);
            scene.fog.near = FOG_START * 0.98;
            scene.fog.far = FOG_END * 0.98;
            // Keep the clear transparent while Butterchurn is active so venue doesn't occlude it.
            if (ren) ren.setClearColor(0x080c12, butterchurnModeActive() ? 0 : 1);
            if (ambLight) ambLight.intensity = 0.68;
        } else {
            scene.fog.near = FOG_START * 0.8;
            scene.fog.far = FOG_END * 1.2;
            if (ambLight) ambLight.intensity = 0.85;
            _applyBgTheme();
        }
    }

    /**
     * Applies both scene-color axes independently: background (`bgThemeId`
     * — clear + fog, skipped while venue owns them) and highway
     * (`hwThemeId` — board plane + lit/dim lane strip, always applied). A
     * highway theme that omits `lane`/`laneDim` falls back to the stock
     * hexes, so an unthemed highway stays byte-identical to the default.
     */
    function _applyBgTheme() {
        const scene = getScene(), ren = getRen();
        const mLaneOdd = getMLaneOdd(), mLaneEven = getMLaneEven();
        const bg = backgroundAxisColors(ctx.settings.bgThemeId);
        if (!_venueSceneOverride) {
            if (scene && scene.fog) scene.fog.color.setHex(bg.fog);
            if (ren) ren.setClearColor(bg.clear, butterchurnModeActive() ? 0 : 1);
        }
        const hw = highwayAxisColors(ctx.settings.hwThemeId);
        if (ctx.board._boardPlaneMat) ctx.board._boardPlaneMat.color.setHex(hw.board);
        const laneLit = (typeof hw.lane === 'number') ? hw.lane : HIGHWAY_LANE_STRIPE_ODD_HEX;
        const laneDim = (typeof hw.laneDim === 'number') ? hw.laneDim : HIGHWAY_LANE_STRIPE_EVEN_HEX;
        if (mLaneOdd) mLaneOdd.color.setHex(laneLit);
        if (mLaneEven) mLaneEven.color.setHex(laneDim);
        const _laneTargetColor = getLaneTargetColor();
        if (_laneTargetColor) _laneTargetColor.setHex(laneLit);
        else setLaneTargetColor(new T.Color(laneLit));
    }

    function getBgState() {
        return bgState;
    }

    return {
        effectiveBackgroundStyleId, syncButterchurnMode, mountBackgroundStyle,
        unmountBackgroundStyle, rebuildBackground, applyVenueSceneFog, applyBgTheme: _applyBgTheme,
        getBgState,
    };
}
