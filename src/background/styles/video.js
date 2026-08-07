import { T } from '../../core/three.js';
import { BACKDROP_DISTANCE, coverCropTexture, fitBackdropPlane } from '../backdrop.js';

/**
 * Custom video backdrop. The uploaded file is stored on disk under
 * `{config_dir}/plugin_uploads/highway_3d/` and served same-origin by
 * `routes.py`; localStorage holds only the filename. Each panel gets its
 * own `<video>` element so panels mount/teardown independently.
 */
export const video = {
    build(scene, settings) {
        // Lowercased because routes.py's upload route only ever produces/serves
        // lowercase current.<ext>, and its GET pattern is case-sensitive.
        const filename = (typeof settings.customVideoName === 'string')
            ? settings.customVideoName.trim().toLowerCase() : '';
        if (!/^current\.(mp4|webm)$/.test(filename)) return null;
        const url = '/api/plugins/highway_3d/files/' + filename;

        // Tracked for cleanup on a throw partway through — the <video> element is
        // parented to document.body, not the stage, so teardown wouldn't otherwise reach it.
        let videoEl = null, tex = null, geo = null, mat = null, mesh = null;
        try {
            videoEl = document.createElement('video');
            // No crossOrigin: the URL is same-origin, so setting it would strip cookies
            // and break auth on a cookie-protected deployment.
            videoEl.muted = true;
            videoEl.playsInline = true;
            videoEl.loop = true;
            videoEl.autoplay = true;
            videoEl.preload = 'auto';
            videoEl.style.display = 'none';
            document.body.appendChild(videoEl);

            tex = new T.VideoTexture(videoEl);
            tex.colorSpace = T.SRGBColorSpace;
            tex.wrapS = T.ClampToEdgeWrapping;
            tex.wrapT = T.ClampToEdgeWrapping;
            tex.minFilter = T.LinearFilter;
            tex.magFilter = T.LinearFilter;
            tex.generateMipmaps = false;
            geo = new T.PlaneGeometry(1, 1);
            mat = new T.MeshBasicMaterial({
                map: tex, transparent: false, depthWrite: false, fog: false,
            });
            mesh = new T.Mesh(geo, mat);
            scene.add(mesh);

            const state = {
                videoEl, mesh, geo, mat, tex,
                cam: settings.cam, distance: BACKDROP_DISTANCE,
                lastAspect: 0, lastVisibleHeight: 0,
            };
            state.applyCoverCrop = function () {
                if (!state.videoEl) return;
                coverCropTexture(
                    state.tex,
                    state.videoEl.videoWidth  || 0,
                    state.videoEl.videoHeight || 0,
                    state.cam.aspect,
                );
            };

            videoEl.addEventListener('loadedmetadata', () => {
                state.applyCoverCrop();
            });
            videoEl.addEventListener('error', () => {
                console.error('[3D-Hwy] custom video load failed', videoEl.error);
                state.mesh.visible = false;
            });

            // src is set last, once every listener and state field it could trigger is ready.
            videoEl.src = url;

            // play() rejection here is usually transient (backgrounded tab, autoplay-policy
            // timing) and the browser retries on its own; real failures come through 'error'.
            videoEl.play().catch((err) => {
                console.warn('[3D-Hwy] custom video play() rejected (will retry on visibility/gesture)', err);
            });
            fitBackdropPlane(state);
            return state;
        } catch (err) {
            try {
                if (videoEl) {
                    videoEl.pause();
                    videoEl.removeAttribute('src');
                    videoEl.load();
                    if (videoEl.parentNode) videoEl.parentNode.removeChild(videoEl);
                }
            } catch (_) { /* ignore */ }
            try { if (mesh && mesh.parent) mesh.parent.remove(mesh); } catch (_) { /* ignore */ }
            try { if (geo) geo.dispose(); } catch (_) { /* ignore */ }
            try { if (mat) mat.dispose(); } catch (_) { /* ignore */ }
            try { if (tex) tex.dispose(); } catch (_) { /* ignore */ }
            throw err;
        }
    },
    update(s) {
        if (!s) return;
        // VideoTexture auto-samples the playing element; drift is intentionally omitted
        // since the video's own motion is already the "life" here.
        fitBackdropPlane(s);
    },
    teardown(s) {
        if (!s) return;
        if (s.videoEl) {
            try { s.videoEl.pause(); } catch (_) {}
            s.videoEl.removeAttribute('src');
            try { s.videoEl.load(); } catch (_) {}
            if (s.videoEl.parentNode) s.videoEl.parentNode.removeChild(s.videoEl);
        }
        if (s.mesh) s.mesh.parent && s.mesh.parent.remove(s.mesh);
        if (s.geo) s.geo.dispose();
        if (s.mat) s.mat.dispose();
        if (s.tex) s.tex.dispose();
    },
};
