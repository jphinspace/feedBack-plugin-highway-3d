import { T } from '../core/three.js';
import { FOG_END } from '../core/constants.js';

/**
 * Procedural silhouette bitmap, drawn once and shared across panels. Each
 * layer wraps this in its own `CanvasTexture` so per-layer `texture.offset.x`
 * can scroll independently without coupling panels together.
 */
let silhouetteCanvas = null;
export function ensureSilhouetteCanvas() {
    if (silhouetteCanvas) return silhouetteCanvas;
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 64;
    const cx = c.getContext('2d');
    if (!cx) throw new Error('[3D-Hwy] 2D canvas context unavailable for silhouette texture');
    cx.clearRect(0, 0, c.width, c.height);
    cx.fillStyle = '#000814';
    let x = 0;
    while (x < c.width) {
        const w = 8 + Math.random() * 30;
        const h = 20 + Math.random() * 40;
        cx.fillRect(x, c.height - h, w, h);
        x += w + Math.random() * 10;
    }
    silhouetteCanvas = c;
    return c;
}

/**
 * Distance for the full-bleed "stage backdrop" plane the image/video styles
 * mount, sized each frame to fill the camera frustum and tracked to the
 * camera. Far enough back that no note ever passes it; `depthWrite: false` +
 * `renderOrder: -1` keep notes painting on top regardless.
 */
export const BACKDROP_DISTANCE = FOG_END * 0.95;

/** Scratch vector reused per frame to avoid per-frame `Vector3` allocation; valid only within one {@link fitBackdropPlane} call. */
const backdropScratchVec = (() => {
    let v = null;
    return () => v || (v = new T.Vector3());
})();

/** Scales `state.mesh` to fill the camera view at `state.distance` and tracks the camera each frame. Call on resize and every frame. */
export function fitBackdropPlane(state) {
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
        if (state.applyCoverCrop) state.applyCoverCrop();
    }
    const fwd = cam.getWorldDirection(backdropScratchVec());
    state.mesh.position.copy(cam.position).addScaledVector(fwd, d);
    state.mesh.lookAt(cam.position);
}

/**
 * Cover-crops `tex` to `planeAspect`: the larger axis fills the plane
 * (cropped if needed), centered. The image style's drift loop overwrites the
 * X offset per frame for wider-than-plane textures; the video style leaves it centered.
 */
export function coverCropTexture(tex, srcW, srcH, planeAspect) {
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
