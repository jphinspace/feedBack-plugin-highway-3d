import { T } from '../../core/three.js';
import { FOG_END, K } from '../../core/consts.js';
import { _bgEnsureSilhouetteCanvas } from '../backdrop.js';

export const silhouettes = {
    build(scene, settings) {
        const canvas = _bgEnsureSilhouetteCanvas();
        // Inside the visible fog range. Fog far = FOG_END * 1.2
        // from the camera, and cam.position.z is dynamic
        // (camUpdate() sets `dist * 0.75`). renderOrder = -1
        // on the bg stage handles "behind notes" regardless
        // of z. Spread the three layers across the back half
        // of the visible fog band for parallax separation.
        const depths = [-FOG_END * 0.55, -FOG_END * 0.70, -FOG_END * 0.85];
        const layers = [];
        const allocated = [];
        try {
            for (const z of depths) {
                // Per-layer CanvasTexture wrapping the shared
                // canvas: lets each layer scroll independently
                // via texture.offset.x without coupling to its
                // siblings or to other panels.
                const tex = new T.CanvasTexture(canvas);
                tex.wrapS = T.RepeatWrapping;
                const geo = new T.PlaneGeometry(800 * K, 50 * K);
                const mat = new T.MeshBasicMaterial({
                    map: tex, transparent: true, opacity: 0.4, depthWrite: false,
                });
                const mesh = new T.Mesh(geo, mat);
                mesh.position.set(0, -10 * K, z);
                scene.add(mesh);
                // Parallax: nearer layers move more than farther
                // ones (perspective). distance = -z; small d ->
                // large parallax. Scaled so the nearest sits
                // around 0.32 and farthest around 0.18.
                const distance = -z;
                const parallax = Math.max(0.05, 1 - distance / (FOG_END * 1.4));
                const layer = { mesh, geo, mat, tex, z, drift: 0, parallax };
                layers.push(layer);
                allocated.push(layer);
            }
            return { layers, intensity: settings.intensity };
        } catch (e) {
            // Build threw partway — clean up any per-layer
            // textures we already created. _bgMountStyle's catch
            // disposes the stage tree's meshes, but a partial-
            // build's CanvasTextures aren't reachable from any
            // mesh yet, so this catch owns them.
            for (const L of allocated) {
                L.tex?.dispose?.();
            }
            throw e;
        }
    },
    update(s, bands, dt) {
        // Intensity multiplier: 0 dims to ~50% of base, 1
        // brightens to ~120%. Below-base values still leave the
        // silhouettes faintly visible so users know the style
        // is on; above-base lets the layers read as a real
        // backdrop on louder passages.
        const intensityMul = 0.5 + s.intensity * 0.7;
        for (const L of s.layers) {
            // Scroll via texture.offset.x with RepeatWrapping —
            // unbounded, no modulus snap. The mesh stays put;
            // the texture wraps continuously across the visible
            // surface. (offset is in normalized texture space,
            // so we keep it small and let the wrap do the job.)
            L.drift += dt * (0.05 + bands.mid * 0.15) * L.parallax;
            L.mat.map.offset.x = L.drift;
            L.mesh.position.y = -10 * K + bands.bass * 4 * K;
            L.mat.opacity = (0.25 + 0.5 * L.parallax) * intensityMul;
        }
    },
    teardown(s) {
        if (!s) return;
        for (const L of s.layers) {
            L.mesh.parent?.remove(L.mesh);
            L.geo.dispose();
            L.mat.dispose();
            L.tex.dispose();
        }
    },
};
