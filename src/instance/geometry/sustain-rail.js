import { T } from '../../core/three.js';
import { pool } from '../../core/pool.js';
import { _makeGaussTex } from '../../core/texture.js';
import { CHORD_BOX_TEAL_HEX } from '../../core/constants.js';

// Chord sustain-length rail (core + bloom halo) and the technique-marker
// plane pool -- three small, adjacent geometry/material/pool clusters moved
// verbatim out of initScene() (Stage 7 Track A). Grouped together because
// they're built back-to-back in the source and share the same construction
// shape (geometry + material + pool(noteG, ...)); nothing else in the
// codebase groups them.
//
// Single construction-time factory, no `frame` tier: everything here is
// built once per initScene() call and never reassigned until the next
// rebuild/teardown -- same deps-only shape as note.js's stable refs.
export function createSustainRailVisuals({ noteG }) {
    // Chord sustain length indicator — thin horizontal plane rails.
    // Unit plane (1×1 in XZ) laid flat; scaled to (railWidth, 1, railLen).
    // A horizontal plane seen from the camera looking down-forward is
    // face-on and has real apparent thickness — unlike T.Line (always 1px).
    // depthTest:false so they never occlude gems; renderOrder 11 places
    // them above lane dividers (2) and chord fill (10), at the same level
    // as chord frame edges (11), and BELOW sustain trails (12/13), note
    // gems (dynamic ≥50), and arp brackets (18). The bloom halo (10) sits
    // behind the core rail (11). Keeping susrail behind note sus trails
    // prevents the rail border from covering individual note tails
    // (sustain/vibrato/tremolo/bend). (Was 14/16 which rendered on top of
    // 12/13 sus trails, causing the outer border to overlap tails.)
    const gSusRail = new T.PlaneGeometry(1, 1);
    gSusRail.rotateX(-Math.PI / 2); // lay flat in XZ plane
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

    // Bloom glow for chord sustain rails — wider plane with a gaussian
    // falloff texture (bright centre → transparent edges in X direction)
    // and additive blending, so it brightens whatever is behind it.
    // renderOrder 4 places it behind the core rail (5).
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

    // Rotatable plane pool for technique markers (pm, mt, hm, hp, H/P, bend).
    // Unlike T.Sprite, a PlaneGeometry mesh accepts rotation.z = approachRot
    // so markers stay coplanar with the gem as it tilts from vertical to flat.
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
