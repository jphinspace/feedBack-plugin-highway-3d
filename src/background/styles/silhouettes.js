import { T } from '../../core/three.js';
import { FOG_END, K } from '../../core/constants.js';
import { ensureSilhouetteCanvas } from '../backdrop.js';

export const silhouettes = {
    build(scene, settings) {
        const canvas = ensureSilhouetteCanvas();
        // Spread across the back half of the visible fog band for parallax separation.
        const depths = [-FOG_END * 0.55, -FOG_END * 0.70, -FOG_END * 0.85];
        const layers = [];
        const allocated = [];
        try {
            for (const z of depths) {
                // Per-layer CanvasTexture wrapping the shared canvas so each layer
                // scrolls independently via texture.offset.x.
                const tex = new T.CanvasTexture(canvas);
                tex.wrapS = T.RepeatWrapping;
                const geo = new T.PlaneGeometry(800 * K, 50 * K);
                const mat = new T.MeshBasicMaterial({
                    map: tex, transparent: true, opacity: 0.4, depthWrite: false,
                });
                const mesh = new T.Mesh(geo, mat);
                mesh.position.set(0, -10 * K, z);
                scene.add(mesh);
                // Nearer layers parallax more than farther ones (nearest ~0.32, farthest ~0.18).
                const distance = -z;
                const parallax = Math.max(0.05, 1 - distance / (FOG_END * 1.4));
                const layer = { mesh, geo, mat, tex, z, drift: 0, parallax };
                layers.push(layer);
                allocated.push(layer);
            }
            return { layers, intensity: settings.intensity };
        } catch (e) {
            // A partial build's CanvasTextures aren't reachable from any mesh yet
            // (mountBackgroundStyle's catch only disposes mesh trees), so free them here.
            for (const L of allocated) {
                L.tex?.dispose?.();
            }
            throw e;
        }
    },
    update(s, bands, dt) {
        const intensityMul = 0.5 + s.intensity * 0.7;
        for (const L of s.layers) {
            // Scroll via unbounded texture.offset.x with RepeatWrapping — no modulus snap needed.
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
