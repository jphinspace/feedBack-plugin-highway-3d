import { T } from '../../core/three.js';
import {
  BASE_VFOV, FOG_END, FOG_START, K,
} from '../../core/constants.js';
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
  wrap.id = `highway_3d_dev-wrap-${_instanceId}`;
  wrap.className = 'h3d-wrap';
  wrap.dataset.highway3dDevInstance = String(_instanceId);
  wrap.style.cssText = 'position:absolute;top:0;left:0;right:0;z-index:2;pointer-events:none;';
  let _visibilityHandler = null;
  let _canvasReplacedHandler = null;
  let ren = null;
  let _onCtxLost = null;
  let _onCtxRestored = null;
  let hostBus = null;
  try {
    // Construct every fallible rendering resource while the wrapper is still
    // detached. In particular, a WebGL context failure must not leave an
    // orphan sibling or host-bus subscription behind.
    ren = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: true });
    const _probe = new T.Vector3();
    ren.setClearColor(0x101820, butterchurnModeActive() ? 0 : 1);
    wrap.appendChild(ren.domElement);

    // WebGL context-loss recovery, bound on Three's own canvas. preventDefault() keeps the
    // context restorable instead of escalating to a render-process crash; _ctxLost then
    // makes draw() bail so no GL work runs on the dead context.
    _onCtxLost = (e) => {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      setCtxLost(true);
      console.warn('[3D-Hwy] WebGL context lost — pausing render until it is restored.');
    };
    _onCtxRestored = () => {
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

    const highwayCanvas = getHighwayCanvas();
    if (!highwayCanvas?.parentNode) throw new Error('highway canvas is not mounted');
    highwayCanvas.parentNode.insertBefore(wrap, highwayCanvas.nextSibling);
    // Mark this instance as the primary tour target only after the new wrap
    // has mounted successfully, so a failed setup cannot demote the live one.
    document.querySelectorAll('.h3d-wrap[data-highway-3d-dev-primary]').forEach(
      (el) => el.removeAttribute('data-highway-3d-dev-primary'),
    );
    wrap.setAttribute('data-highway-3d-dev-primary', '');

    // The wrap is a sibling of #highway, so it needs its own visibility sync.
    hostBus = window.feedBack;
    if (hostBus && typeof hostBus.on === 'function' && typeof hostBus.off === 'function') {
      _visibilityHandler = (e) => {
        if (!e || !e.detail || e.detail.canvas !== getHighwayCanvas()) return;
        wrap.style.display = e.detail.visible === false ? 'none' : '';
      };
      try {
        hostBus.on('highway:visibility', _visibilityHandler);
      } catch (e) {
        try { hostBus.off('highway:visibility', _visibilityHandler); } catch (_) { /* attach may have partially succeeded */ }
        _visibilityHandler = null;
      }
      _canvasReplacedHandler = (e) => {
        if (!e || !e.detail || e.detail.oldCanvas !== getHighwayCanvas()) return;
        setHighwayCanvas(e.detail.newCanvas);
        const v = getHighwayCanvas() && getHighwayCanvas().offsetParent !== null;
        wrap.style.display = v ? '' : 'none';
      };
      try {
        hostBus.on('highway:canvas-replaced', _canvasReplacedHandler);
      } catch (e) {
        try { hostBus.off('highway:canvas-replaced', _canvasReplacedHandler); } catch (_) { /* attach may have partially succeeded */ }
        _canvasReplacedHandler = null;
      }
      if (_visibilityHandler) {
        try {
          const initialVisible = getHighwayCanvas()
            && getHighwayCanvas().offsetParent !== null;
          wrap.style.display = initialVisible ? '' : 'none';
        } catch (e) { /* initial sync is best-effort */ }
      }
    }

    // _applyCinematic() must run AFTER main.js destructure-assigns this factory's return.
    return {
      wrap,
      ren,
      _probe,
      _onCtxLost,
      _onCtxRestored,
      lyricsCanvas,
      lyricsCtx,
      scene,
      cam,
      ambLight,
      dirLight,
      _visibilityHandler,
      _canvasReplacedHandler,
    };
  } catch (error) {
    if (hostBus && typeof hostBus.off === 'function') {
      if (_visibilityHandler) {
        try { hostBus.off('highway:visibility', _visibilityHandler); } catch (_) { /* best effort */ }
      }
      if (_canvasReplacedHandler) {
        try { hostBus.off('highway:canvas-replaced', _canvasReplacedHandler); } catch (_) { /* best effort */ }
      }
    }
    if (ren?.domElement) {
      if (_onCtxLost) {
        try { ren.domElement.removeEventListener('webglcontextlost', _onCtxLost, false); } catch (_) { /* best effort */ }
      }
      if (_onCtxRestored) {
        try { ren.domElement.removeEventListener('webglcontextrestored', _onCtxRestored, false); } catch (_) { /* best effort */ }
      }
    }
    try { ren?.dispose?.(); } catch (_) { /* best effort */ }
    try { wrap.remove(); } catch (_) { /* best effort */ }
    throw error;
  }
}
