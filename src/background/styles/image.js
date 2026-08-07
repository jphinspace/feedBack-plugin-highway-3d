import { T } from '../../core/three.js';
import { BACKDROP_DISTANCE, coverCropTexture, fitBackdropPlane } from '../backdrop.js';

/**
 * Custom image backdrop. Renders the user-uploaded image (persisted as a
 * base64 data URL under `h3d_bg_customImageDataUrl`) as a full-bleed,
 * cover-cropped plane with slow horizontal drift. `build()` returns `null`
 * (inert style) when no valid asset is present.
 */
export const image = {
    build(scene, settings) {
        const dataUrl = (typeof settings.customImageDataUrl === 'string')
            ? settings.customImageDataUrl.trim() : '';
        // Reject anything but the raster formats settings.html allows uploading —
        // guards against a corrupted or hand-edited localStorage value reaching TextureLoader.
        if (!/^data:image\/(jpeg|png|webp);/i.test(dataUrl)) return null;
        // Mirrors settings.html's upload-time size cap in case localStorage was edited directly.
        if (dataUrl.length > 2.5 * 1024 * 1024) return null;
        // Mirrors settings.html's upload-time decompression-bomb guard.
        const MAX_IMAGE_DIM = 4096;
        const MAX_IMAGE_PIXELS = 16 * 1024 * 1024;
        const state = {
            mesh: null, geo: null, mat: null, tex: null,
            drift: 0.5, intensity: settings.intensity, loaded: false,
            cam: settings.cam, distance: BACKDROP_DISTANCE,
            lastAspect: 0, lastVisibleHeight: 0,
        };
        state.applyCoverCrop = function () {
            if (!state.tex || !state.tex.image) return;
            coverCropTexture(
                state.tex,
                state.tex.image.width  || 0,
                state.tex.image.height || 0,
                state.cam.aspect,
            );
        };
        const tex = new T.TextureLoader().load(
            dataUrl,
            (loaded) => {
                const imgW = loaded.image?.width  || 0;
                const imgH = loaded.image?.height || 0;
                if (imgW > MAX_IMAGE_DIM || imgH > MAX_IMAGE_DIM || (imgW * imgH) > MAX_IMAGE_PIXELS) {
                    // Hide before Three.js uploads the texture to the GPU on first render.
                    console.warn('[3D-Hwy] custom image dimensions too large to render', imgW + 'x' + imgH);
                    if (state.mesh) state.mesh.visible = false;
                    loaded.dispose();
                    return;
                }
                state.applyCoverCrop();
                // Reset to the centered phase now that repeat.x is final, so drift
                // accumulated during the async decode can't phase-shift the opening crop.
                state.drift = 0.5;
                state.loaded = true;
            },
            undefined,
            (err) => {
                console.error('[3D-Hwy] custom image decode failed', err);
                if (state.mesh) state.mesh.visible = false;
            },
        );
        tex.colorSpace = T.SRGBColorSpace;
        // ClampToEdge: uploads are non-power-of-two, and WebGL1 rejects RepeatWrapping on
        // NPOT textures. The drift below uses a triangle-wave so it never needs to wrap.
        tex.wrapS = T.ClampToEdgeWrapping;
        tex.wrapT = T.ClampToEdgeWrapping;
        tex.generateMipmaps = false;
        tex.minFilter = T.LinearFilter;
        tex.magFilter = T.LinearFilter;
        const geo = new T.PlaneGeometry(1, 1);
        const mat = new T.MeshBasicMaterial({
            map: tex, transparent: false, depthWrite: false, fog: false,
        });
        const mesh = new T.Mesh(geo, mat);
        scene.add(mesh);
        state.mesh = mesh;
        state.geo  = geo;
        state.mat  = mat;
        state.tex  = tex;
        fitBackdropPlane(state);
        return state;
    },
    update(s, bands, dt) {
        if (!s) return;
        fitBackdropPlane(s);
        // Drift stays frozen until decode finishes, so the centered-start intent stays deterministic.
        if (!s.loaded) return;
        // Triangle-wave ping-pong drift within the cropped slack — ClampToEdge can't wrap
        // across the texture boundary, so ping-pong gives the same "alive" feel safely.
        // Taller-than-plane images have zero slack and sit still, which is correct.
        s.drift += dt * 0.02 * s.intensity;
        const slack = Math.max(0, 1 - s.tex.repeat.x);
        const cyc = ((s.drift % 2) + 2) % 2;
        const tri = cyc < 1 ? cyc : 2 - cyc;
        s.tex.offset.x = tri * slack;
    },
    teardown(s) {
        if (!s) return;
        s.mesh.parent && s.mesh.parent.remove(s.mesh);
        s.geo.dispose();
        s.mat.dispose();
        s.tex.dispose();
    },
};
