import { T } from '../../core/three.js';
import { BACKDROP_DISTANCE, coverCropTexture, fitBackdropPlane } from '../backdrop.js';

// Custom video backdrop (#19 follow-up). User uploads a
// .mp4/.webm via settings.html; routes.py stores it on disk and
// serves a same-origin URL (avoids CORS taint on VideoTexture).
// localStorage holds only the filename — bytes live in
// {config_dir}/plugin_uploads/highway_3d/. Per-panel video
// element so each panel can mount/teardown independently;
// browsers cache the video bytes after first fetch so multi-
// panel splitscreen pays only the decoder cost, not the
// network or disk-read cost.
export const video = {
    build(scene, settings) {
        // Lowercase before validation so a manual localStorage
        // edit like `current.MP4` doesn't pass a case-insensitive
        // regex check and then 404 against the server, which
        // only ever produces and serves lowercase
        // current.<ext> (the upload route lowercases the
        // extension; routes.py's GET pattern is case-sensitive).
        const filename = (typeof settings.customVideoName === 'string')
            ? settings.customVideoName.trim().toLowerCase() : '';
        // Strict pattern matches routes.py's deterministic
        // single-slot naming. Any other shape (corrupt
        // localStorage, future schema change) → style is
        // inert, no <video> created, no orphan request to a
        // 404 endpoint.
        if (!/^current\.(mp4|webm)$/.test(filename)) return null;
        const url = '/api/plugins/highway_3d/files/' + filename;

        // Track partial allocations so a throw between any of
        // them can clean up. mountBackgroundStyle's failure path
        // disposes the stage tree but explicitly does NOT
        // dispose textures (per the comment at
        // disposeGroupTree), and the <video> element is
        // parented to document.body — not the stage — so
        // neither would be reached without an explicit catch.
        let videoEl = null, tex = null, geo = null, mat = null, mesh = null;
        try {
            // muted + playsInline + autoplay is the cross-
            // browser recipe that bypasses gesture requirements
            // (Chrome, Firefox, Safari desktop + mobile).
            // preload='auto' lets the first frame land before
            // play() is called. src is deliberately NOT set
            // yet — we want every piece of state (mesh, tex)
            // to exist before the browser can fire
            // loadedmetadata or error events on a cached
            // resource. The handlers close over state.tex /
            // state.mesh; setting src first would create a
            // window where a fast cache hit could fire an
            // event into half-initialized state.
            videoEl = document.createElement('video');
            // No crossOrigin attribute: the URL is same-origin
            // (/api/plugins/highway_3d/files/…), so VideoTexture
            // never sees a tainted canvas. Setting
            // `crossOrigin = "anonymous"` would also strip
            // cookies from the fetch, which would 401 against
            // any cookie-protected feedBack deployment. If
            // this ever needs to fetch cross-origin, switch
            // to `use-credentials` AND have the server send
            // the matching CORS headers.
            videoEl.muted = true;
            videoEl.playsInline = true;
            videoEl.loop = true;
            videoEl.autoplay = true;
            videoEl.preload = 'auto';
            videoEl.style.display = 'none';
            document.body.appendChild(videoEl);

            // Build mesh + texture before registering listeners
            // and before setting src. By the time loadedmetadata
            // or error can fire, state.tex and state.mesh are
            // both populated.
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

            // Full-bleed backdrop: scaled and positioned each
            // frame in update() via fitBackdropPlane.
            // cam + distance + lastAspect / lastVisibleHeight
            // power that helper.
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

            // Cover-crop math runs on loadedmetadata since
            // video dimensions aren't known until then.
            // fitBackdropPlane will also re-apply when the
            // camera aspect changes.
            videoEl.addEventListener('loadedmetadata', () => {
                state.applyCoverCrop();
            });
            videoEl.addEventListener('error', () => {
                // Fired for: codec unsupported, 404 from
                // server, truncated file, etc. Hide the mesh
                // so we don't paint a frozen blank plane on
                // top of fog.
                console.error('[3D-Hwy] custom video load failed', videoEl.error);
                state.mesh.visible = false;
            });

            // Set src last — this is what triggers the async
            // load. With handlers and state in place, any
            // synchronous-feeling event from a cached resource
            // is still safely received and handled.
            videoEl.src = url;

            // play() can reject for transient reasons (tab
            // backgrounded at mount time, low-power mode,
            // brief autoplay-policy timing window) even with
            // muted + autoplay set — but the browser retries
            // on its own once conditions improve (visibility
            // change, foregrounding, gesture). Real load /
            // codec failures come through the `error` event
            // we registered above and DO hide the mesh. So
            // just log here and leave the mesh visible; the
            // next ready frame will paint.
            videoEl.play().catch((err) => {
                console.warn('[3D-Hwy] custom video play() rejected (will retry on visibility/gesture)', err);
            });
            // Initial fit so the first frame is correctly
            // sized and positioned even before update() runs.
            fitBackdropPlane(state);
            return state;
        } catch (err) {
            // Best-effort cleanup of whatever was allocated
            // before the throw. Each step is independently
            // guarded so a secondary failure (e.g. dispose
            // throwing on an already-disposed object) can't
            // mask the original error.
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
        // VideoTexture auto-updates from the playing element —
        // Three.js samples the current frame each render. No
        // per-frame texture mutation here. Drift on offset.x
        // is intentionally omitted: the video's own motion is
        // the "life", drifting the crop on top would feel
        // busy and compete with playback. The only per-frame
        // work is keeping the plane camera-locked and resized
        // when aspect changes (handled inside the helper).
        fitBackdropPlane(s);
    },
    teardown(s) {
        if (!s) return;
        if (s.videoEl) {
            try { s.videoEl.pause(); } catch (_) {}
            s.videoEl.removeAttribute('src');
            // load() with no src tells the browser to release
            // any decoder/buffer state for this element.
            try { s.videoEl.load(); } catch (_) {}
            if (s.videoEl.parentNode) s.videoEl.parentNode.removeChild(s.videoEl);
        }
        if (s.mesh) s.mesh.parent && s.mesh.parent.remove(s.mesh);
        if (s.geo) s.geo.dispose();
        if (s.mat) s.mat.dispose();
        if (s.tex) s.tex.dispose();
    },
};
