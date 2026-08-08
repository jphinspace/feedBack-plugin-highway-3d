import { T } from '../../core/three.js';
import { BASE_VFOV, FOG_END, FOG_START, K } from '../../core/constants.js';
import { canvasSize } from '../model/math.js';

/**
 * The wrap `<div>`, WebGL renderer, context-loss handlers, lyrics overlay
 * canvas, and Three.js scene/camera/lights. Unlike other `initScene()`
 * clusters, the `highway:visibility`/`highway:canvas-replaced` listeners
 * created here outlive the `initScene()` call, and `_canvasReplacedHandler`
 * reassigns `highwayCanvas`, read from dozens of call sites elsewhere — so
 * `highwayCanvas`/`_ctxLost` use live getter/setter closures over the real
 * `main.js` variables rather than plain `deps`. `wrap` itself doesn't need
 * that: `teardown()` unregisters both listeners before any later
 * `initScene()` creates a new `wrap`.
 */
export function createDomAndScene({
    _instanceId, getHighwayCanvas, setHighwayCanvas, setCtxLost,
    butterchurnModeActive, applySize,
}) {
    const wrap = document.createElement('div');
    wrap.id = 'h3d-wrap-' + _instanceId;
    wrap.className = 'h3d-wrap';
    wrap.dataset.h3dInstance = String(_instanceId);
    wrap.style.cssText = 'position:absolute;top:0;left:0;right:0;z-index:2;pointer-events:none;';
    // Mark this instance as the primary tour target so the tour engine spotlights a
    // unique element rather than the first of potentially many splitscreen wraps.
    document.querySelectorAll('.h3d-wrap[data-h3d-primary]').forEach(
        el => el.removeAttribute('data-h3d-primary'));
    wrap.setAttribute('data-h3d-primary', '');
    getHighwayCanvas().parentNode.insertBefore(wrap, getHighwayCanvas().nextSibling);

    // The wrap is a sibling of #highway, so it needs its own visibility sync — display:none
    // on #highway would otherwise leave this painting full-screen. Guarded lazy bind
    // tolerates hosts that don't yet expose feedBack.on/off.
    let _visibilityHandler = null;
    let _canvasReplacedHandler = null;
    if (window.feedBack
        && typeof window.feedBack.on === 'function'
        && typeof window.feedBack.off === 'function') {
        _visibilityHandler = (e) => {
            if (!wrap) return;
            // Filter by canvas identity so one hidden splitscreen panel doesn't hide every panel's overlay.
            if (!e || !e.detail || e.detail.canvas !== getHighwayCanvas()) return;
            const v = e.detail.visible;
            wrap.style.display = v === false ? 'none' : '';
        };
        try {
            window.feedBack.on('highway:visibility', _visibilityHandler);
        } catch (e) {
            _visibilityHandler = null;
        }
        // Tracks canvas-replaced so the visibility handler's identity gate still matches
        // after core swaps the <canvas> element for a context-type change.
        _canvasReplacedHandler = (e) => {
            if (!e || !e.detail) return;
            if (e.detail.oldCanvas !== getHighwayCanvas()) return;
            setHighwayCanvas(e.detail.newCanvas);
            if (wrap) {
                const v = getHighwayCanvas() && getHighwayCanvas().offsetParent !== null;
                wrap.style.display = v ? '' : 'none';
            }
        };
        try {
            window.feedBack.on('highway:canvas-replaced', _canvasReplacedHandler);
        } catch (e) {
            _canvasReplacedHandler = null;
        }
        // Sync once at bind time: the event is transition-only, so a canvas already hidden
        // at mount (e.g. plugin loaded mid-splitscreen) would otherwise never be caught.
        if (_visibilityHandler) {
            try {
                const initialVisible = getHighwayCanvas()
                    && getHighwayCanvas().offsetParent !== null;
                wrap.style.display = initialVisible ? '' : 'none';
            } catch (e) { /* ignore — initial sync is best-effort */ }
        }
    }

    // powerPreference steers GPU selection toward the discrete/high-performance GPU
    // on dual-GPU machines, and the high-performance power profile on single-GPU desktops.
    const ren = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: true });
    const _probe = new T.Vector3();
    ren.setClearColor(0x101820, butterchurnModeActive() ? 0 : 1);
    wrap.appendChild(ren.domElement);

    // WebGL context-loss recovery, bound on Three's own canvas. preventDefault() keeps the
    // context restorable instead of escalating to a render-process crash; _ctxLost then
    // makes draw() bail so no GL work runs on the dead context.
    const _onCtxLost = (e) => {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        setCtxLost(true);
        console.warn('[3D-Hwy] WebGL context lost — pausing render until it is restored.');
    };
    const _onCtxRestored = () => {
        setCtxLost(false);
        console.warn('[3D-Hwy] WebGL context restored — resuming render.');
        try { const s = canvasSize(getHighwayCanvas()); if (s.w > 0 && s.h > 0) applySize(s.w, s.h); } catch (err) {}
    };
    ren.domElement.addEventListener('webglcontextlost', _onCtxLost, false);
    ren.domElement.addEventListener('webglcontextrestored', _onCtxRestored, false);

    const lyricsCanvas = document.createElement('canvas');
    lyricsCanvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:1;';
    const lyricsCtx = lyricsCanvas.getContext('2d');
    wrap.appendChild(lyricsCanvas);

    const scene = new T.Scene();
    scene.fog = new T.Fog(0x101820, FOG_START * 0.8, FOG_END * 1.2);

    const cam = new T.PerspectiveCamera(BASE_VFOV, 1, 0.01, FOG_END * 3);

    const ambLight = new T.AmbientLight(0xffffff, 0.85);
    scene.add(ambLight);
    const dirLight = new T.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(40 * K, 120 * K, 80 * K);
    scene.add(dirLight);
    // _applyCinematic() must run AFTER main.js destructure-assigns this factory's return —
    // called from here it would read main.js's still-null ambLight/dirLight and no-op.

    return {
        wrap, ren, _probe, _onCtxLost, _onCtxRestored, lyricsCanvas, lyricsCtx,
        scene, cam, ambLight, dirLight, _visibilityHandler, _canvasReplacedHandler,
    };
}
