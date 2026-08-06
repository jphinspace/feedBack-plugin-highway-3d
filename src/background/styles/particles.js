import { T } from '../../core/three.js';
import { FOG_END, FOG_START, K } from '../../core/constants.js';

export const particles = {
    build(scene, settings) {
        const N = Math.max(20, Math.floor(80 + 200 * settings.intensity));
        const positions = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 800 * K;
            positions[i * 3 + 1] = (Math.random() - 0.4) * 80 * K;
            // Spawn within the visible fog range. Fog reaches
            // its far limit at FOG_END * 1.2 from the camera,
            // and cam.position.z is updated each frame in
            // camUpdate() (`dist * 0.75`, where dist tracks
            // aspectScale). Anything beyond that camera-relative
            // distance gets fully fogged out, so the cutoff in
            // world z is dynamic — the earlier "push past notes"
            // fix placed particles at -FOG_END * (0.95..1.20)
            // which sat past fog far at any camera z, making
            // them invisible. renderOrder = -1 on the bg stage
            // already keeps particles behind notes regardless
            // of z, so depth-based separation wasn't needed and
            // was actively breaking visibility.
            positions[i * 3 + 2] = -FOG_START - Math.random() * (FOG_END - FOG_START) * 0.85;
        }
        const geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.BufferAttribute(positions, 3));
        const mat = new T.PointsMaterial({
            // size 5*K (bumped from 1.5*K). At distance ~700*K
            // with sizeAttenuation the prior sprite shrank
            // below 2 pixels — practically invisible against
            // dark fog. 5*K reads as a small bright dot.
            // Build-time opacity is overridden every frame in
            // update() — the runtime formula is the source of
            // truth.
            color: 0xa0c0ff, size: 5 * K, transparent: true,
            blending: T.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
        });
        const points = new T.Points(geo, mat);
        scene.add(points);
        return { points, geo, mat, N };
    },
    update(s, bands, dt) {
        const positions = s.geo.attributes.position.array;
        const dx = dt * (3 + bands.mid * 12) * K;
        for (let i = 0; i < s.N; i++) {
            positions[i * 3] += dx;
            if (positions[i * 3] > 400 * K) positions[i * 3] -= 800 * K;
        }
        s.geo.attributes.position.needsUpdate = true;
        // Bumped opacity floor 0.4 → 0.55 + treble headroom
        // 0.4 → 0.45 so particles read as visible specks even
        // when bgReactive is false / treble≈0 (was effectively
        // 0.4 floor, below noise floor against dark fog).
        s.mat.opacity = 0.55 + bands.treble * 0.45;
    },
    teardown(s) {
        if (!s) return;
        s.points.parent?.remove(s.points);
        s.geo.dispose();
        s.mat.dispose();
    },
};
