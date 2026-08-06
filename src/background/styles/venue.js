import { T } from '../../core/three.js';
import { FOG_END, K, VENUE_BACKDROP_DISTANCE_MUL, VENUE_HAZE_STEADY } from '../../core/constants.js';
import { _bgEmitChange } from '../../settings/store.js';
import { BG_BACKDROP_DISTANCE, _bgCoverCrop, _bgFitBackdropPlane } from '../backdrop.js';
import {
    _bgVenueMoodCoeffs, _venueApplyFakeDepthMotion, _venueCrowdMix, _venueCrowdRev,
    _venueCrowdVideos, _venueInstrumentPov, _venueLoadPlateForPov, _venueMoodState,
    _venueSetSceneAssetsLoaded, _venueSetSceneLoadFailed, _venueSetSceneOverride,
    _venueSwapPlateIfNeeded, _venueTextureCache,
} from '../venue.js';

// Venue visualization — generated small-club raster bg plate
// behind the highway. Activated via h3dVenueSceneSetActive(true)
// when Visualization = Venue; does not persist as a user bg style.
export const venue = {
    build(scene, settings) {
        const coeffs = _bgVenueMoodCoeffs(_venueMoodState);
        const state = {
            backdrop: null,
            haze: null,
            loader: null,
            instrumentPov: _venueInstrumentPov,
            plateLoading: false,
            pending: 1,
            loaded: false,
            failed: false,
        };

        function _venueMarkLoaded() {
            state.pending--;
            if (state.pending <= 0 && !state.failed) {
                state.loaded = true;
                _venueSetSceneAssetsLoaded(true);
                _venueSetSceneLoadFailed(false);
                try {
                    if (typeof window !== 'undefined' && window.v3VenueScene3d &&
                        typeof window.v3VenueScene3d.onAssetsLoaded === 'function') {
                        window.v3VenueScene3d.onAssetsLoaded();
                    }
                } catch (_) { /* visual-only */ }
            }
        }
        function _venueMarkFailed(msg) {
            if (state.failed) return;
            state.failed = true;
            _venueSetSceneLoadFailed(true);
            _venueSetSceneAssetsLoaded(false);
            console.warn('[venue-scene] ' + msg);
            _venueSetSceneOverride(false);
            _bgEmitChange('venueScene');
            try {
                if (typeof window !== 'undefined' && window.v3VenueScene3d &&
                    typeof window.v3VenueScene3d.onAssetsFailed === 'function') {
                    window.v3VenueScene3d.onAssetsFailed(msg);
                }
            } catch (_) { /* visual-only */ }
        }

        const loader = new T.TextureLoader();
        state.loader = loader;
        const backdrop = {
            mesh: null, geo: null, mat: null, tex: null,
            cam: settings.cam, distance: BG_BACKDROP_DISTANCE * VENUE_BACKDROP_DISTANCE_MUL,
            lastAspect: 0, lastVisibleHeight: 0, lastVisibleWidth: 0, loaded: false,
        };
        backdrop.geo = new T.PlaneGeometry(1, 1);
        backdrop.mat = new T.MeshBasicMaterial({
            color: 0xffffff, transparent: false, depthWrite: false, fog: false,
        });
        backdrop.mesh = new T.Mesh(backdrop.geo, backdrop.mat);
        backdrop.mesh.visible = false;
        scene.add(backdrop.mesh);
        state.backdrop = backdrop;
        backdrop.applyCoverCrop = function () {
            if (!backdrop.tex || !backdrop.tex.image) return;
            _bgCoverCrop(
                backdrop.tex,
                backdrop.tex.image.width || 0,
                backdrop.tex.image.height || 0,
                backdrop.cam.aspect,
            );
        };
        _venueLoadPlateForPov(
            loader,
            _venueInstrumentPov,
            backdrop,
            () => _venueMarkLoaded(),
            () => _venueMarkFailed('failed to load small-club bg plate'),
        );

        // Crowd video planes (career mode): two crossfading layers
        // just in front of the static plate (which stays mounted as
        // the no-pack / load-failure fallback). Textures bind lazily
        // in update() when venue-crowd.js assigns video elements.
        state.crowd = { layers: [], rev: -1 };
        for (let i = 0; i < 2; i++) {
            const geo = new T.PlaneGeometry(1, 1);
            const mat = new T.MeshBasicMaterial({
                color: 0xffffff, transparent: true, opacity: 0,
                depthWrite: false, fog: false,
            });
            const mesh = new T.Mesh(geo, mat);
            mesh.visible = false;
            // Layer 1 sits nearest so three.js's back-to-front
            // transparent sort draws it after layer 0.
            const layer = {
                mesh, geo, mat, tex: null, videoEl: null,
                cam: settings.cam,
                distance: BG_BACKDROP_DISTANCE * (i === 0 ? 1.04 : 1.03),
                lastAspect: 0, lastVisibleHeight: 0,
            };
            layer.applyCoverCrop = function () {
                if (!layer.videoEl || !layer.tex) return;
                _bgCoverCrop(
                    layer.tex,
                    layer.videoEl.videoWidth || 0,
                    layer.videoEl.videoHeight || 0,
                    layer.cam.aspect,
                );
            };
            scene.add(mesh);
            state.crowd.layers.push(layer);
        }

        const hazeGeo = new T.PlaneGeometry(280 * K, 40 * K);
        const hazeMat = new T.MeshBasicMaterial({
            color: 0x101820, transparent: true, opacity: coeffs.haze,
            depthWrite: false, fog: false,
        });
        const hazeMesh = new T.Mesh(hazeGeo, hazeMat);
        hazeMesh.position.set(0, -12 * K, -FOG_END * 0.70);
        scene.add(hazeMesh);
        state.haze = {
            mesh: hazeMesh, geo: hazeGeo, mat: hazeMat, baseOp: coeffs.haze,
            baseX: 0, baseY: -12 * K, baseZ: -FOG_END * 0.70,
        };

        return state;
    },
    update(s, bands, dt, t) {
        if (!s || s.failed) return;
        _venueSwapPlateIfNeeded(s);
        const coeffs = _bgVenueMoodCoeffs(_venueMoodState);
        if (s.backdrop && s.backdrop.loaded) {
            _bgFitBackdropPlane(s.backdrop);
        }
        const motion = _venueApplyFakeDepthMotion(s, coeffs, t);
        if (s.backdrop && s.backdrop.loaded && s.backdrop.mat && !motion.breathe && !motion.warmthPulse) {
            const warm = coeffs.warmth;
            s.backdrop.mat.color.setRGB(warm, warm * 0.98, warm * 0.95);
        }
        if (s.haze && s.haze.mat && !motion.hazeDrift && !motion.shimmer) {
            s.haze.mat.opacity = (s.haze.baseOp || VENUE_HAZE_STEADY)
                * (coeffs.haze / VENUE_HAZE_STEADY);
        }
        if (s.crowd) {
            // Rebind VideoTextures when venue-crowd.js (re)assigns
            // elements. VideoTexture samples the element every frame,
            // so a src change on the same element needs no rebind.
            if (s.crowd.rev !== _venueCrowdRev) {
                s.crowd.rev = _venueCrowdRev;
                s.crowd.layers.forEach((layer, i) => {
                    const el = _venueCrowdVideos[i];
                    if (layer.videoEl === el) return;
                    if (layer.tex) { layer.mat.map = null; layer.tex.dispose(); layer.tex = null; }
                    layer.videoEl = el;
                    layer.lastAspect = 0; // force refit + recrop
                    if (el) {
                        const tex = new T.VideoTexture(el);
                        tex.colorSpace = T.SRGBColorSpace;
                        tex.wrapS = T.ClampToEdgeWrapping;
                        tex.wrapT = T.ClampToEdgeWrapping;
                        tex.minFilter = T.LinearFilter;
                        tex.magFilter = T.LinearFilter;
                        tex.generateMipmaps = false;
                        layer.tex = tex;
                        layer.mat.map = tex;
                    }
                    layer.mat.needsUpdate = true;
                });
            }
            const warm = coeffs.warmth;
            s.crowd.layers.forEach((layer, i) => {
                const el = layer.videoEl;
                // videoWidth === 0 until metadata lands — showing the
                // plane before that paints a black flash over the plate.
                const ready = !!el && el.videoWidth > 0;
                // venue-crowd.js swaps src on the same element (loop ↔
                // stinger); a new intrinsic size needs a fresh
                // cover-crop, which _bgFitBackdropPlane only reapplies
                // on camera aspect changes.
                if (ready && (layer.lastVidW !== el.videoWidth ||
                              layer.lastVidH !== el.videoHeight)) {
                    layer.lastVidW = el.videoWidth;
                    layer.lastVidH = el.videoHeight;
                    layer.applyCoverCrop();
                }
                // Layer 0 (rear) stays fully opaque whenever any of the
                // fade involves it: two half-transparent layers would
                // let the static plate behind bleed through (~25% at
                // mid-fade). The crossfade is therefore layer 1 (front)
                // fading over an opaque layer 0 — in both directions.
                const opacity = i === 0
                    ? (_venueCrowdMix < 0.999 ? 1 : 0)
                    : _venueCrowdMix;
                layer.mat.opacity = opacity;
                layer.mesh.visible = ready && opacity > 0.01;
                if (layer.mesh.visible) {
                    layer.mat.color.setRGB(warm, warm * 0.98, warm * 0.95);
                    _bgFitBackdropPlane(layer);
                }
            });
        }
    },
    teardown(s) {
        if (!s) return;
        _venueSetSceneAssetsLoaded(false);
        for (const key of ['backdrop', 'haze']) {
            const p = s[key];
            if (!p) continue;
            p.mesh?.parent?.remove(p.mesh);
            p.geo?.dispose?.();
            if (p.mat) {
                p.mat.map = null;
                p.mat.dispose?.();
            }
        }
        // Crowd planes: this style owns the VideoTextures; the
        // <video> elements belong to venue-crowd.js and survive.
        if (s.crowd) {
            for (const layer of s.crowd.layers) {
                layer.mesh?.parent?.remove(layer.mesh);
                layer.geo?.dispose?.();
                if (layer.mat) {
                    layer.mat.map = null;
                    layer.mat.dispose?.();
                }
                layer.tex?.dispose?.();
            }
        }
        // Dispose the cached plate textures too — the module-level cache
        // otherwise keeps every loaded POV plate GPU-resident for the
        // page lifetime (steady VRAM growth across POV/arrangement swaps).
        try {
            _venueTextureCache.forEach((tex) => { tex?.dispose?.(); });
        } catch (_) { /* visual-only */ }
        _venueTextureCache.clear();
    },
};
