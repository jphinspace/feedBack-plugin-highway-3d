import { T } from '../../core/three.js';
import { FOG_END, FOG_START, K } from '../../core/consts.js';
import { PALETTES } from '../../core/palette.js';

export const lights = {
    build(scene, settings) {
        // Lights count scales 6 → 14 over intensity 0 → 1.
        // _bgCoerce clamps intensity to [0,1] before it reaches
        // here, so no further clamp is needed.
        const N = Math.floor(6 + 8 * settings.intensity);
        const lights = [];
        // Palette comes from the calling panel's settings so
        // each splitscreen panel picks its own (issue #10).
        // Falls back to the default palette if the caller
        // doesn't supply one (e.g. an older code path).
        const palette = settings.palette || PALETTES.default;
        for (let i = 0; i < N; i++) {
            const color = palette[i % palette.length];
            // 30*K plane reads as a real stage glow at distance.
            // Build-time opacity is overridden every frame in
            // update() — the runtime formula is the source of
            // truth.
            const geo = new T.PlaneGeometry(30 * K, 30 * K);
            const mat = new T.MeshBasicMaterial({
                color, transparent: true,
                blending: T.AdditiveBlending, depthWrite: false,
            });
            const mesh = new T.Mesh(geo, mat);
            mesh.position.set(
                (Math.random() - 0.5) * 600 * K,
                (Math.random() - 0.3) * 80 * K,
                // Inside visible fog range; renderOrder = -1
                // keeps lights behind notes regardless of z.
                -FOG_START - Math.random() * (FOG_END - FOG_START) * 0.85
            );
            scene.add(mesh);
            lights.push({ mesh, geo, mat, baseScale: 1 + Math.random() * 0.5, phase: Math.random() * Math.PI * 2 });
        }
        return { lights };
    },
    update(s, bands, dt, t) {
        // Bumped opacity floor 0.35 → 0.55 + treble headroom
        // 0.3 → 0.4 so lights read as visible stage glows at
        // distance instead of faint specks (was effectively
        // 0.35 floor since the build-time bump was overridden
        // by this formula).
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
