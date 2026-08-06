import { T } from '../../core/three.js';
import { FOG_END, K } from '../../core/constants.js';

export const geometric = {
    build(scene, settings) {
        const meshes = [];
        // Bumped opacity floor (0.25 → 0.45) + ceiling so the
        // wireframes read as real shapes instead of barely-
        // there ghosts at low intensity.
        const op = 0.45 + 0.25 * settings.intensity;
        const ico = new T.Mesh(
            new T.IcosahedronGeometry(30 * K, 1),
            new T.MeshBasicMaterial({ color: 0x6080c0, wireframe: true, transparent: true, opacity: op, depthWrite: false }),
        );
        // Inside visible fog range; renderOrder = -1 keeps
        // wireframes behind notes regardless of z.
        ico.position.set(-100 * K, 30 * K, -FOG_END * 0.65);
        scene.add(ico);
        meshes.push(ico);
        const torus = new T.Mesh(
            new T.TorusGeometry(22 * K, 4 * K, 6, 12),
            new T.MeshBasicMaterial({ color: 0xc06080, wireframe: true, transparent: true, opacity: op * 0.9, depthWrite: false }),
        );
        torus.position.set(120 * K, 20 * K, -FOG_END * 0.75);
        scene.add(torus);
        meshes.push(torus);
        return { meshes };
    },
    update(s, bands, dt) {
        const speed = 0.2 + bands.mid * 0.4;
        const pulse = 1 + bands.bass * 0.25;
        for (const m of s.meshes) {
            m.rotation.x += dt * speed * 0.3;
            m.rotation.y += dt * speed * 0.4;
            m.scale.setScalar(pulse);
        }
    },
    teardown(s) {
        if (!s) return;
        for (const m of s.meshes) {
            m.parent?.remove(m);
            m.geometry.dispose();
            m.material.dispose();
        }
    },
};
