import { T } from '../../core/three.js';
import { pool } from '../../core/pool.js';
import { _makeGaussTex } from '../../core/texture.js';
import { CHORD_BOX_TEAL_HEX } from '../../core/constants.js';

/** Chord sustain-length rail (core + bloom halo) and the technique-marker plane pool. Construction-time only. */
export function createSustainRailVisuals({ noteG }) {
    // Chord sustain length indicator: a horizontal plane rail (not T.Line, which stays 1px
    // regardless of distance) laid flat, scaled to (railWidth, 1, railLen).
    // renderOrder 11 sits above lane dividers (2) and chord fill (10), level with chord frame
    // edges (11), below sustain trails (12/13), note gems (dynamic >=50), and arp brackets (18)
    // — keeping it behind note sustain trails so the rail border doesn't cover individual tails.
    const gSusRail = new T.PlaneGeometry(1, 1);
    gSusRail.rotateX(-Math.PI / 2);
    const mSusRailBase = new T.MeshBasicMaterial({
        color: CHORD_BOX_TEAL_HEX,
        transparent: true, opacity: 0.85,
        depthTest: false, depthWrite: false,
        fog: false, side: T.DoubleSide, forceSinglePass: true,
    });
    const pSusRail = pool(noteG, () => {
        const m = new T.Mesh(gSusRail, mSusRailBase.clone());
        m.renderOrder = 5; // below strings (7) so strings render on top
        return m;
    });

    // Bloom glow for the sustain rail: wider plane, gaussian falloff texture, additive
    // blending; renderOrder 4 keeps it behind the core rail (5).
    const _bloomGaussTex = _makeGaussTex(T);
    const gSusRailBloom = new T.PlaneGeometry(1, 1);
    gSusRailBloom.rotateX(-Math.PI / 2);
    const mSusRailBloomBase = new T.MeshBasicMaterial({
        color: CHORD_BOX_TEAL_HEX,
        map: _bloomGaussTex,
        transparent: true, opacity: 0.55,
        blending: T.AdditiveBlending,
        depthTest: false, depthWrite: false,
        fog: false, side: T.DoubleSide, forceSinglePass: true,
    });
    const pSusRailBloom = pool(noteG, () => {
        const m = new T.Mesh(gSusRailBloom, mSusRailBloomBase.clone());
        m.renderOrder = 4; // below strings (7) so strings render on top
        return m;
    });

    // Rotatable plane pool for technique markers (pm, mt, hm, hp, H/P, bend). Unlike
    // T.Sprite, a plane mesh accepts rotation.z so markers stay coplanar with the gem
    // as it tilts from vertical to flat.
    const gTechPlane = new T.PlaneGeometry(1, 1);
    const pTechPlane = pool(noteG, () => {
        const m = new T.Mesh(gTechPlane, new T.MeshBasicMaterial({
            transparent: true, depthTest: false, depthWrite: false, side: T.DoubleSide, forceSinglePass: true,
        }));
        m.renderOrder = 1000;
        return m;
    });

    return {
        gSusRail, mSusRailBase, pSusRail,
        _bloomGaussTex, gSusRailBloom, mSusRailBloomBase, pSusRailBloom,
        gTechPlane, pTechPlane,
    };
}
