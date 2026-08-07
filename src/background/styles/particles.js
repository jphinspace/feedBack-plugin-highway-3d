import { T } from '../../core/three.js';
import { FOG_END, FOG_START, K } from '../../core/constants.js';

export const particles = {
    build(scene, settings) {
        const N = Math.max(20, Math.floor(80 + 200 * settings.intensity));
        const positions = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 800 * K;
            positions[i * 3 + 1] = (Math.random() - 0.4) * 80 * K;
            // Spawn within the visible fog band (fog reaches its far limit at
            // FOG_END * 1.2 from the camera). renderOrder = -1 on the bg stage
            // already keeps particles behind notes regardless of world z.
            positions[i * 3 + 2] = -FOG_START - Math.random() * (FOG_END - FOG_START) * 0.85;
        }
        const geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.BufferAttribute(positions, 3));
        const mat = new T.PointsMaterial({
            // 5*K reads as a small bright dot at typical camera distance; opacity
            // is overridden every frame in update().
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
        s.mat.opacity = 0.55 + bands.treble * 0.45;
    },
    teardown(s) {
        if (!s) return;
        s.points.parent?.remove(s.points);
        s.geo.dispose();
        s.mat.dispose();
    },
};
