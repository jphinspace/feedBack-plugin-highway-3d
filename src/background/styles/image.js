import { T } from '../../core/three.js';
import { BG_BACKDROP_DISTANCE, _bgCoverCrop, _bgFitBackdropPlane } from '../backdrop.js';

// Custom image backdrop (#19). User uploads a JPG/PNG/WebP
// through settings.html; the bytes are persisted as a base64
// data URL in localStorage under h3d_bg_customImageDataUrl and
// passed in via settings.customImageDataUrl. Renders as a
// PlaneGeometry in the silhouette parallax band, "cover" cropped
// (via texture.repeat / offset) so non-matching aspects fill
// the plane without distortion. Slow horizontal drift on
// texture.offset.x for life. When no asset is uploaded, build
// returns null and the style is inert (settings.html disables
// the picker option in that case).
export const image = {
    build(scene, settings) {
        // Upfront validation: only accept the same raster image
        // formats settings.html lets the user upload (jpeg /
        // png / webp). Without this, a corrupt localStorage
        // value (truncated base64, wrong scheme, plain string)
        // OR an unsupported type (e.g. data:image/svg+xml)
        // reaches TextureLoader and can fail asynchronously
        // after the plane has been mounted — a silent black
        // backdrop with no clear cause. Returning null here
        // treats invalid bytes the same as "no asset uploaded":
        // style is inert, the user can clear and re-upload
        // from settings.html.
        const dataUrl = (typeof settings.customImageDataUrl === 'string')
            ? settings.customImageDataUrl.trim() : '';
        if (!/^data:image\/(jpeg|png|webp);/i.test(dataUrl)) return null;
        // Renderer-side encoded-length cap. settings.html
        // enforces the same limit on upload, but a manually
        // edited localStorage value (or legacy data from
        // before the upload guard existed) could still feed
        // an arbitrarily large data URL into TextureLoader
        // and burn memory / CPU during decode. Treat overlong
        // values as "no asset" — style is inert, user can
        // clear and re-upload from settings.
        if (dataUrl.length > 2.5 * 1024 * 1024) return null;
        // Renderer-side decompression-bomb caps. Mirror
        // settings.html's upload-time guard so a manual
        // localStorage edit (or legacy data from before that
        // guard existed) can't sneak a 50000×50000 PNG past
        // and OOM the GPU on texture upload.
        const MAX_IMAGE_DIM = 4096;
        const MAX_IMAGE_PIXELS = 16 * 1024 * 1024;
        // Full-bleed backdrop: unit plane, scaled per frame in
        // _bgFitBackdropPlane to fill the camera's view at
        // BG_BACKDROP_DISTANCE. fog: false so the backdrop
        // shows in full color; notes drawn on top still pick
        // up atmospheric fog as before.
        const state = {
            mesh: null, geo: null, mat: null, tex: null,
            drift: 0.5, intensity: settings.intensity, loaded: false,
            cam: settings.cam, distance: BG_BACKDROP_DISTANCE,
            lastAspect: 0, lastVisibleHeight: 0,
        };
        // Helper closure for cover-crop refresh — called both
        // on async decode (initial) and from _bgFitBackdropPlane
        // when the camera aspect changes (resize).
        state.applyCoverCrop = function () {
            if (!state.tex || !state.tex.image) return;
            _bgCoverCrop(
                state.tex,
                state.tex.image.width  || 0,
                state.tex.image.height || 0,
                state.cam.aspect,
            );
        };
        const tex = new T.TextureLoader().load(
            dataUrl,
            (loaded) => {
                // Image dimensions are only known after async decode.
                const imgW = loaded.image?.width  || 0;
                const imgH = loaded.image?.height || 0;
                if (imgW > MAX_IMAGE_DIM || imgH > MAX_IMAGE_DIM || (imgW * imgH) > MAX_IMAGE_PIXELS) {
                    // Bail before the texture gets uploaded to
                    // the GPU (Three.js uploads on first render
                    // of a visible mesh — hiding the mesh here
                    // skips that). Disposing the texture too,
                    // belt-and-suspenders, in case anything
                    // else holds a reference.
                    console.warn('[3D-Hwy] custom image dimensions too large to render', imgW + 'x' + imgH);
                    if (state.mesh) state.mesh.visible = false;
                    loaded.dispose();
                    return;
                }
                state.applyCoverCrop();
                // Reset drift to the centered triangle-wave
                // phase now that repeat.x is final. Without
                // this reset, drift accumulated during the
                // async decode would phase-shift the initial
                // offset by a non-deterministic amount —
                // wider images would open at whatever crop
                // the elapsed-decode-time happened to land on.
                state.drift = 0.5;
                state.loaded = true;
            },
            undefined,
            // Async-failure path: the upfront regex catches the
            // common "corrupted/truncated bytes" case, but a
            // valid-looking data URL can still fail to decode
            // (e.g. wrong MIME / unsupported codec). Hide the
            // mesh so we don't paint a frozen blank plane on
            // top of fog, and log so the failure isn't silent.
            (err) => {
                console.error('[3D-Hwy] custom image decode failed', err);
                if (state.mesh) state.mesh.visible = false;
            },
        );
        tex.colorSpace = T.SRGBColorSpace;
        // ClampToEdge on both axes — user uploads are non-
        // power-of-two in general, and WebGL1 rejects RepeatWrapping
        // on NPOT textures (renders black or emits GL errors). The
        // drift logic below uses a triangle-wave so the offset
        // stays inside [0, 1-repeat] and never needs wrap.
        tex.wrapS = T.ClampToEdgeWrapping;
        tex.wrapT = T.ClampToEdgeWrapping;
        // User uploads aren't power-of-two in general; mipmaps
        // are noisy for a single static backdrop and burn memory.
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
        // Initial fit so the first frame is correctly sized
        // and positioned, even if update() hasn't run yet.
        _bgFitBackdropPlane(state);
        return state;
    },
    update(s, bands, dt) {
        if (!s) return;
        // Track camera position / aspect every frame. The
        // helper resizes the plane and refreshes cover-crop
        // when aspect changes, and re-positions the plane to
        // stay BG_BACKDROP_DISTANCE in front of the camera.
        _bgFitBackdropPlane(s);
        // Skip drift advance until the texture has finished
        // decoding. Without this guard, drift accumulates
        // during the async load while repeat.x is still 1
        // (its default), and once the cover-crop applies the
        // image opens at a phase-shifted offset whose value
        // depends on how long the decode took — the
        // "centered start" intent becomes non-deterministic.
        if (!s.loaded) return;
        // Triangle-wave ping-pong drift inside the cropped slack.
        // ClampToEdge on wrapS means we cannot wrap across the
        // texture boundary (would render edge pixels stretched);
        // ping-pong oscillates the visible window between the
        // image's left and right edges, which gives the same
        // "alive" feel without the WebGL1 NPOT-Repeat hazard.
        // Slack is the horizontal margin between the cropped
        // window and the texture edges; for taller-than-plane
        // images repeat.x stays 1, slack collapses to 0, and
        // the offset stays at 0 — the image sits still, which
        // is correct (it's already filling horizontally).
        s.drift += dt * 0.02 * s.intensity;
        const slack = Math.max(0, 1 - s.tex.repeat.x);
        // Period of 2 drift units ≈ 100 s at intensity = 0.5;
        // gentle, cinematic. cyc ∈ [0, 2), tri ∈ [0, 1] then back.
        const cyc = ((s.drift % 2) + 2) % 2;
        const tri = cyc < 1 ? cyc : 2 - cyc;
        s.tex.offset.x = tri * slack;
    },
    teardown(s) {
        if (!s) return;
        s.mesh.parent && s.mesh.parent.remove(s.mesh);
        s.geo.dispose();
        s.mat.dispose();
        // This style owns the texture lifecycle (per the comment
        // at _bgDisposeGroupTree: tree dispose does NOT touch
        // material.map textures).
        s.tex.dispose();
    },
};
