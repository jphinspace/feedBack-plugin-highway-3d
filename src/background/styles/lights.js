import { T } from '../../core/three.js';
import { FOG_END, FOG_START, K } from '../../core/constants.js';
import { PALETTES } from '../../core/palette.js';

export const lights = {
    build(scene, settings) {
        const N = Math.floor(6 + 8 * settings.intensity);
        const lights = [];
        const palette = settings.palette || PALETTES.default;
        for (let i = 0; i < N; i++) {
            const color = palette[i % palette.length];
            const geo = new T.PlaneGeometry(30 * K, 30 * K);
            const mat = new T.MeshBasicMaterial({
                color, transparent: true,
                blending: T.AdditiveBlending, depthWrite: false,
            });
            const mesh = new T.Mesh(geo, mat);
            mesh.position.set(
                (Math.random() - 0.5) * 600 * K,
                (Math.random() - 0.3) * 80 * K,
                -FOG_START - Math.random() * (FOG_END - FOG_START) * 0.85
            );
            scene.add(mesh);
            lights.push({ mesh, geo, mat, baseScale: 1 + Math.random() * 0.5, phase: Math.random() * Math.PI * 2 });
        }
        return { lights };
    },
    update(s, bands, dt, t) {
        for (const L of s.lights) {
            const pulse = 1 + bands.bass * 1.5 + Math.sin(t * 1.5 + L.phase) * 0.2;
            L.mesh.scale.set(L.baseScale * pulse, L.baseScale * pulse, 1);
            L.mat.opacity = 0.55 + bands.treble * 0.4;
        }
    },
    teardown(s) {
        if (!s) return;
        for (const L of s.lights) {
            L.mesh.parent?.remove(L.mesh);
            L.geo.dispose();
            L.mat.dispose();
        }
    },
};
