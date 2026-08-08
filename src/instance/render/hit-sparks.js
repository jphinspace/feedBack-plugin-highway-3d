import { T } from '../../core/three.js';
import { K } from '../../core/constants.js';

const SPARK_N = 256;

/**
 * Hit-spark particle system: a pooled additive Points cloud. A small burst
 * fires at a gem on a verified hit ({@link sparkBurst}, injected into
 * `note.js`'s `createNoteRenderer`), advanced once per frame via
 * {@link sparkUpdate}. `sparkPts` is returned so `main.js`'s `teardown()`
 * can keep disposing it directly.
 */
export function createHitSparks({ scene }) {
    const sparkPos = new Float32Array(SPARK_N * 3);
    const sparkCol = new Float32Array(SPARK_N * 3);
    const sparkVel = new Float32Array(SPARK_N * 3);
    const sparkLife = new Float32Array(SPARK_N);

    const sg = new T.BufferGeometry();
    sg.setAttribute('position', new T.BufferAttribute(sparkPos, 3).setUsage(T.DynamicDrawUsage));
    sg.setAttribute('color', new T.BufferAttribute(sparkCol, 3).setUsage(T.DynamicDrawUsage));
    const sm = new T.PointsMaterial({
        size: 1.0 * K, vertexColors: true, transparent: true, opacity: 0.8,
        depthWrite: false, blending: T.AdditiveBlending, sizeAttenuation: true,
    });
    const sparkPts = new T.Points(sg, sm);
    sparkPts.frustumCulled = false;
    sparkPts.renderOrder = 8;
    scene.add(sparkPts);

    function sparkBurst(x, y, z, hex, count) {
        if (count <= 0) return;
        const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255;
        let made = 0;
        for (let i = 0; i < SPARK_N && made < count; i++) {
            if (sparkLife[i] > 0) continue;
            const j = i * 3, ang = Math.random() * Math.PI * 2, sp = (5 + Math.random() * 12) * K;
            sparkPos[j] = x; sparkPos[j + 1] = y; sparkPos[j + 2] = z;
            sparkVel[j] = Math.cos(ang) * sp; sparkVel[j + 1] = (12 + Math.random() * 24) * K; sparkVel[j + 2] = Math.sin(ang) * sp * 0.55;
            sparkCol[j] = r; sparkCol[j + 1] = g; sparkCol[j + 2] = b;
            sparkLife[i] = 0.30 + Math.random() * 0.16; made++;
        }
    }

    function sparkUpdate(dt) {
        const grav = 55 * K; let any = false;
        for (let i = 0; i < SPARK_N; i++) {
            if (sparkLife[i] <= 0) continue;
            const j = i * 3;
            sparkLife[i] -= dt;
            if (sparkLife[i] <= 0) { sparkCol[j] = sparkCol[j + 1] = sparkCol[j + 2] = 0; continue; }
            any = true;
            sparkVel[j + 1] -= grav * dt;
            sparkPos[j] += sparkVel[j] * dt; sparkPos[j + 1] += sparkVel[j + 1] * dt; sparkPos[j + 2] += sparkVel[j + 2] * dt;
            const fade = 1 - Math.min(1, dt * 3.2);
            sparkCol[j] *= fade; sparkCol[j + 1] *= fade; sparkCol[j + 2] *= fade;
        }
        sparkPts.geometry.attributes.position.needsUpdate = true;
        sparkPts.geometry.attributes.color.needsUpdate = true;
        sparkPts.visible = any;
    }

    return { sparkPts, sparkBurst, sparkUpdate };
}
