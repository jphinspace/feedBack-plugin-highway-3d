import { T } from '../core/three.js';
import { FOG_END } from '../core/constants.js';

// Procedural silhouette bitmap, drawn once and shared across panels.
// The Canvas2D bitmap is module-level (cheap, CPU-only); each layer
// wraps it in its own CanvasTexture so per-layer texture.offset.x
// can drive a seam-free scroll without coupling to other layers /
// panels (a shared CanvasTexture would synchronize all offsets).
let _silCanvas = null;
export function _bgEnsureSilhouetteCanvas() {
    if (_silCanvas) return _silCanvas;
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 64;
    const cx = c.getContext('2d');
    if (!cx) {
        // Restrictive environments (some sandboxed iframes, headless
        // tests) can return null. Without a guard, the clearRect/
        // fillRect calls below would throw TypeError and the silhouette
        // style would never become available.
        throw new Error('[3D-Hwy] 2D canvas context unavailable for silhouette texture');
    }
    cx.clearRect(0, 0, c.width, c.height);
    cx.fillStyle = '#000814';
    let x = 0;
    while (x < c.width) {
        const w = 8 + Math.random() * 30;
        const h = 20 + Math.random() * 40;
        cx.fillRect(x, c.height - h, w, h);
        x += w + Math.random() * 10;
    }
    _silCanvas = c;
    return c;
}

// Helpers shared by the asset-driven bg styles (image, video).
// Both render a "stage backdrop" plane that's full-bleed: sized
// each frame to fill the camera's view frustum at a fixed
// distance and positioned to track the camera (so the user's
// image/video reads as the entire visible BG, with highway and
// notes painting on top via renderOrder).
//
// Distance is chosen far enough back that no note ever lands
// beyond it; depthWrite=false on the plane material plus
// renderOrder=-1 means notes still paint on top regardless.
export const BG_BACKDROP_DISTANCE = FOG_END * 0.95;

// Module-level scratch vector reused each frame to avoid GC
// churn from per-frame Vector3 allocation. Only valid for the
// duration of a single update() call.
const _bgBackdropTmp = (() => {
    // Lazily created when T is available (T isn't bound at module
    // parse time — initScene assigns it inside loadThree().then).
    // Returning a getter that allocates on first read keeps the
    // dependency timing clean.
    let v = null;
    return () => v || (v = new T.Vector3());
})();

// Frustum-fit a plane mesh: scale a unit PlaneGeometry to exactly
// fill the camera's view at the configured distance, then position
// it `distance` units in front of the camera and orient it so the
// texture faces the camera. Called whenever cam.aspect changes
// (resize) and to position-track the camera each frame.
export function _bgFitBackdropPlane(state) {
    const cam = state.cam;
    const d = state.distance;
    const halfFovRad = cam.fov * Math.PI / 360;
    const visibleHeight = 2 * Math.tan(halfFovRad) * d;
    const visibleWidth = visibleHeight * cam.aspect;
    if (state.lastAspect !== cam.aspect ||
        state.lastVisibleHeight !== visibleHeight) {
        state.mesh.scale.set(visibleWidth, visibleHeight, 1);
        state.lastAspect = cam.aspect;
        state.lastVisibleHeight = visibleHeight;
        state.lastVisibleWidth = visibleWidth;
        // Aspect change shifts the cover-crop ratio; re-apply.
        if (state.applyCoverCrop) state.applyCoverCrop();
    }
    // Track camera each frame: position = cam.position +
    // cam.forward * distance, orient toward camera.
    const fwd = cam.getWorldDirection(_bgBackdropTmp());
    state.mesh.position.copy(cam.position).addScaledVector(fwd, d);
    state.mesh.lookAt(cam.position);
}

// Cover-crop a texture to the plane aspect: the larger axis fills
// the plane (cropped if needed), centered. For wider-than-plane
// textures the X offset is left at the centered value but the
// image style's drift loop overwrites it per frame; the video
// style leaves it centered.
export function _bgCoverCrop(tex, srcW, srcH, planeAspect) {
    if (srcW <= 0 || srcH <= 0) return;
    tex.repeat.set(1, 1);
    tex.offset.set(0, 0);
    const srcAspect = srcW / srcH;
    if (srcAspect > planeAspect) {
        tex.repeat.x = planeAspect / srcAspect;
        tex.offset.x = (1 - tex.repeat.x) * 0.5;
    } else {
        tex.repeat.y = srcAspect / planeAspect;
        tex.offset.y = (1 - tex.repeat.y) * 0.5;
    }
    tex.needsUpdate = true;
}
