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

// Background-style mount/unmount/rebuild + scene-color theme application --
// moved verbatim out of main.js (Stage 7, post-3e). effectiveBackgroundStyleId/
// syncButterchurnMode/mountBackgroundStyle/unmountBackgroundStyle/
// rebuildBackground/applyVenueSceneFog/_applyBgTheme were already consumed
// as deps by settings-listener.js (Phase 3c) and/or called directly from
// main.js's initScene()/draw() -- only those call sites needed updating,
// not settings-listener.js itself.
//
// butterchurnModeActive() stays resident in main.js (trivial one-liner,
// `ctx.settings.bgStyleId === 'butterchurn'`) and is injected here as a
// dep, matching the "widely-shared helper stays resident" pattern
// (validString/_setLabelMap elsewhere in this codebase).
//
// _venueSceneOverride is background/venue.js's own `export let` (a live
// binding, same mechanic as core/three.js's `T`) -- imported directly,
// no getter needed, exactly like every other main.js consumer of it.
//
// bgState/bgStage/bgMountedStyleId are private to this module
// (own-it-outright): written only by mountBackgroundStyle()/
// unmountBackgroundStyle(), read externally only via the getBgState()
// getter this module exposes (replacing the getBgState: () => bgState
// closure getter main.js used to hand to settings-listener.js and to
// draw()'s per-frame background-update block).
//
// Everything else genuinely reassigned by code that stays in main.js
// (scene/cam/ren/wrap/ambLight/highwayCanvas -- all (re)assigned by
// createDomAndScene() inside initScene(), same shape bloom-composer.js/
// score-fx.js already use; bgGroup -- (re)assigned by initScene()/
// teardown(); mLaneOdd/mLaneEven -- (re)assigned by
// createHighwayLanePlane()'s destructure; bcCtrl/backgroundLastT --
// also written by draw()'s per-frame block and teardown()) is threaded
// through as live getters (read-only) or getter+setter pairs (read-write).
// _laneTargetColor is written by THIS module (_applyBgTheme, mirroring
// the lit lane color) but also given its initial T.Color instance by
// createNoteGemVisuals()'s destructure and nulled by teardown(), so it's
// a genuine read-modify-write case, not private state -- getter+setter.
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

    // The 'butterchurn' bg-style renders a WebGL MilkDrop canvas BEHIND a
    // transparent highway via the self-contained butterchurn/ controller module,
    // NOT a Three.js fog-scenery style (its scenery falls back to 'off'). Mount
    // is idempotent and driven by the bg-style dropdown through mountBackgroundStyle.
    function syncButterchurnMode() {
        const wrap = getWrap(), ren = getRen();
        let bcCtrl = getBcCtrl();
        if (butterchurnModeActive()) {
            // Recreate when there's no controller, or the last one died during
            // async init (lib/WebGL failure) — a dead controller self-cleaned,
            // so retry here instead of leaving the style permanently broken.
            if ((!bcCtrl || (bcCtrl.dead && bcCtrl.dead())) && wrap) {
                if (bcCtrl) { bcCtrl = null; setBcCtrl(null); }
                // audioProvider reuses this instance's shared analyser (the
                // fog scenery's #audio / stems tap) so the browser path never
                // opens a second createMediaElementSource on #audio.
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
        // Build into a fresh stage group so a partial throw can't
        // orphan meshes inside bgGroup. On success the stage joins
        // bgGroup atomically; on failure the stage and everything
        // in it are disposed and bgState stays null.
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
        // renderOrder on a Group doesn't propagate to its children
        // (Three.js sorts by per-object renderOrder, and a Group is a
        // transform, not a rendered object). Stamp every mesh in the
        // stage so transparent bg objects always sort behind notes
        // regardless of their z relative to gameplay geometry.
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
        if (!getBgGroup()) return;
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
        setBackgroundLastT(0);
    }

    // Venue-only fog/clear/ambient tuning — darker near field, less
    // washed-out gray haze over the playable highway. Restored when
    // venue deactivates.
    function applyVenueSceneFog(active) {
        const scene = getScene(), ren = getRen(), ambLight = getAmbLight();
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
    // freely. Safe to call any time; called from initScene and the
    // scene-theme listener (so a live switch of EITHER dropdown retints
    // only its half immediately).
    //
    // The lane fields are OPTIONAL on a highway theme: one that omits `lane`
    // / `laneDim` falls back to the stock lit/dim lane hexes, so every
    // existing/neutral highway theme stays byte-identical (default blue lane
    // unchanged). Only colored highway themes opt into a coordinated lane.
    function _applyBgTheme() {
        const scene = getScene(), ren = getRen();
        const mLaneOdd = getMLaneOdd(), mLaneEven = getMLaneEven();
        // --- Background axis: clear + fog ---
        const bg = backgroundAxisColors(ctx.settings.bgThemeId);
        if (!_venueSceneOverride) {
            if (scene && scene.fog) scene.fog.color.setHex(bg.fog);
            if (ren) ren.setClearColor(bg.clear, butterchurnModeActive() ? 0 : 1);
        }
        // --- Highway axis: board plane + lane ---
        const hw = highwayAxisColors(ctx.settings.hwThemeId);
        if (ctx.board._boardPlaneMat) ctx.board._boardPlaneMat.color.setHex(hw.board);
        // Lit lane strip + its dimmer alternating row. Fall back to the
        // hardcoded stock lane colors when the highway theme omits them.
        const laneLit = (typeof hw.lane === 'number') ? hw.lane : HIGHWAY_LANE_STRIPE_ODD_HEX;
        const laneDim = (typeof hw.laneDim === 'number') ? hw.laneDim : HIGHWAY_LANE_STRIPE_EVEN_HEX;
        if (mLaneOdd) mLaneOdd.color.setHex(laneLit);
        if (mLaneEven) mLaneEven.color.setHex(laneDim);
        // Keep the (otherwise vestigial) lane target color in sync with the
        // lit lane so any future lane-blend consumer reads the themed value.
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
