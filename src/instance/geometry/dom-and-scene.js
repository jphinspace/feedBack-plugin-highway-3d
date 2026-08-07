import { T } from '../../core/three.js';
import { BASE_VFOV, FOG_END, FOG_START, K } from '../../core/constants.js';
import { canvasSize } from '../model/math.js';

// The wrap <div>, WebGL renderer, context-loss handlers, lyrics overlay
// canvas, and Three.js scene/camera/lights -- moved verbatim out of
// initScene() (Stage 7 Track B / 3-ctx-3). Unlike every other initScene()
// cluster extracted so far, this one is NOT construction-time-only: the
// highway:visibility / highway:canvas-replaced listeners this creates
// outlive the initScene() call (same "long-lived listener" shape the
// notedetect-listeners slice found), and `_canvasReplacedHandler`
// REASSIGNS `highwayCanvas` -- a value read from dozens of call sites
// across the whole file, not just this cluster. That reassignment can't
// be captured as a plain deps value (it would go stale after the first
// canvas swap) or returned like the other clusters (nothing here "returns"
// at the moment the swap happens, long after this factory call is gone).
//
// So `highwayCanvas`/`_ctxLost` use the live-getter/setter shape instead:
// getHighwayCanvas()/setHighwayCanvas() and setCtxLost() close over the
// REAL main.js variables and stay valid for as long as the listeners do.
// `wrap` itself doesn't need this treatment -- teardown() unregisters both
// listeners (window.feedBack.off(...)) before any later initScene() call
// creates a new `wrap`, so the listeners' closure over the LOCAL `wrap`
// this factory creates never goes stale during its own lifetime.
export function createDomAndScene({
    _instanceId, getHighwayCanvas, setHighwayCanvas, setCtxLost,
    butterchurnModeActive, applySize,
}) {
    const wrap = document.createElement('div');
    wrap.id = 'h3d-wrap-' + _instanceId;
    wrap.className = 'h3d-wrap';
    wrap.dataset.h3dInstance = String(_instanceId);
    wrap.style.cssText = 'position:absolute;top:0;left:0;right:0;z-index:2;pointer-events:none;';
    // Mark this instance as the primary tour target so the tour engine
    // always spotlights a unique element (selector '.h3d-wrap[data-h3d-primary]')
    // rather than the first of potentially many splitscreen wraps.
    document.querySelectorAll('.h3d-wrap[data-h3d-primary]').forEach(
        el => el.removeAttribute('data-h3d-primary'));
    wrap.setAttribute('data-h3d-primary', '');
    getHighwayCanvas().parentNode.insertBefore(wrap, getHighwayCanvas().nextSibling);

    // Subscribe to highway:visibility (feedBack#246) so the
    // .h3d-wrap overlay hides in sync with the feedBack canvas.
    // The wrap is a sibling of #highway, so display:none on
    // #highway leaves us painting full-screen otherwise.
    // Guarded lazy bind: tolerate hosts that don't yet expose
    // feedBack.on/off (older feedBack versions, headless
    // tests).
    let _visibilityHandler = null;
    let _canvasReplacedHandler = null;
    if (window.feedBack
        && typeof window.feedBack.on === 'function'
        && typeof window.feedBack.off === 'function') {
        _visibilityHandler = (e) => {
            if (!wrap) return;
            // Filter by canvas identity (splitscreen-safe).
            // Each createHighway() instance emits its own
            // visibility events on the shared feedBack bus —
            // without this gate, one hidden panel would also
            // hide every other panel's 3D overlay.
            if (!e || !e.detail || e.detail.canvas !== getHighwayCanvas()) return;
            const v = e.detail.visible;
            wrap.style.display = v === false ? 'none' : '';
        };
        try {
            window.feedBack.on('highway:visibility', _visibilityHandler);
        } catch (e) {
            _visibilityHandler = null;
        }
        // Track canvas-replaced so the visibility handler's
        // identity gate continues to match after core swaps the
        // <canvas> element for a context-type change.
        _canvasReplacedHandler = (e) => {
            if (!e || !e.detail) return;
            // Only update if the swap involves OUR canvas — in
            // splitscreen each panel has its own canvas.
            if (e.detail.oldCanvas !== getHighwayCanvas()) return;
            setHighwayCanvas(e.detail.newCanvas);
            // Re-sync wrap visibility from the new canvas in
            // case its initial displayed-state differs.
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
        // Sync once at bind time: the event is transition-only,
        // so if the canvas was already hidden when we mounted
        // (e.g. plugin loaded while splitscreen was active),
        // we'd never receive an emit and would leave the wrap
        // visible. Compute from the local highwayCanvas (not
        // window.highway.isVisible) so splitscreen panels get
        // their own per-instance answer instead of inheriting
        // the main highway's state.
        if (_visibilityHandler) {
            try {
                const initialVisible = getHighwayCanvas()
                    && getHighwayCanvas().offsetParent !== null;
                wrap.style.display = initialVisible ? '' : 'none';
            } catch (e) { /* ignore — initial sync is best-effort */ }
        }
    }

    // powerPreference hints the platform to use the discrete /
    // high-performance GPU and a higher power profile for this WebGL
    // context. On laptops / iGPU+dGPU machines (Windows, macOS) it
    // steers GPU selection to the dGPU; on single-dGPU desktops it
    // requests the high-performance power profile. (It does not by
    // itself force NVIDIA's utilisation-driven clock ramp on Linux.)
    const ren = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: true });
    const _probe = new T.Vector3();
    ren.setClearColor(0x101820, butterchurnModeActive() ? 0 : 1);
    wrap.appendChild(ren.domElement);

    // WebGL context-loss recovery (see the _ctxLost declaration). Bound
    // on Three's own canvas — the context that actually resets on a GPU
    // reset / alt-tab. preventDefault() keeps the context restorable
    // instead of letting the loss escalate to a render-process crash;
    // _ctxLost then makes draw() bail so no GL work runs on the dead
    // context; on restore we reset the viewport and resume (Three
    // re-uploads geometry/materials/textures lazily on the next render).
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
    // _applyCinematic() reads ambLight/dirLight from main.js's OWN closure
    // `let`s -- it must run AFTER main.js destructure-assigns this factory's
    // return, not from in here (where main.js's ambLight/dirLight are still
    // null/stale, and the call would silently no-op).

    return {
        wrap, ren, _probe, _onCtxLost, _onCtxRestored, lyricsCanvas, lyricsCtx,
        scene, cam, ambLight, dirLight, _visibilityHandler, _canvasReplacedHandler,
    };
}
