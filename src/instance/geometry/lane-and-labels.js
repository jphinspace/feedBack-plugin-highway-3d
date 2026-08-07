import { T } from '../../core/three.js';
import { pool } from '../../core/pool.js';
import {
    ARPEGGIO_RIM_BLUE_HEX, HIGHWAY_LANE_STRIPE_EVEN_HEX, HIGHWAY_LANE_STRIPE_ODD_HEX, K,
} from '../../core/constants.js';

// Lane fret-divider geometry/materials/pool, and the fret-column reference
// marker pool -- two small, unrelated-but-tiny clusters moved verbatim out
// of initScene() (Stage 7 Track A), bundled into one file since neither is
// big enough to warrant its own.
//
// Construction-time only, no `frame` tier -- built once per initScene()
// call, read (never reassigned) by everything downstream.
export function createLaneDividers({ noteG, _ownedSharedMats }) {
    // Vertical fret dividers within active lane
    const gLaneDivider = new T.BoxGeometry(0.15 * K, 0.15 * K, 1);
    const mLaneDivider = new T.MeshBasicMaterial({
        color: 0x46DDE6, transparent: true, opacity: 1.00, fog: false, depthWrite: false,
    });
    const mLaneDividerArp = new T.MeshBasicMaterial({
        color: ARPEGGIO_RIM_BLUE_HEX,
        transparent: true, opacity: 0.08, fog: false, depthWrite: false,
    });
    const mLaneDividerExt = new T.MeshBasicMaterial({
        color: 0x364D5F, transparent: true, opacity: 0.4, fog: false, depthWrite: false,
    });
    _ownedSharedMats.push(mLaneDivider, mLaneDividerArp, mLaneDividerExt);
    const pLaneDivider = pool(noteG, () => new T.Mesh(gLaneDivider, mLaneDivider));

    return { gLaneDivider, mLaneDivider, mLaneDividerArp, mLaneDividerExt, pLaneDivider };
}

// fog:false prevents the scene fog from gradually dimming the sprite
// as it enters the far end of the highway — opacity is managed
// manually with a short fade-in so the number appears at its
// final size the moment it becomes visible rather than seeming to
// emerge from a tiny dim spec at the horizon.
export function createFretColumnMarkerPool({ lblG, textSprites }) {
    const pFretColMarker = pool(lblG, () => {
        const _sp = new T.Sprite(textSprites.txtMat('0', '#666666', false, 'noteFret').clone());
        // fog=false: prevents scene fog from dimming the sprite as it enters the
        // far end of the highway.  Opacity is managed by the manual fade-in ramp
        // so the number appears smoothly instead of emerging as a dim spec.
        _sp.material.fog = false;
        return _sp;
    });
    return { pFretColMarker };
}

// Dynamic fret-number-row label pool, the highlighted highway lane plane, and
// the board-projection ghost fret-number label pool -- moved verbatim out of
// initScene() (Stage 7 Track B / 3-ctx-3). Construction-time only, no `ctx`
// needed (verified via whole-file bare-reassignment grep).
export function createHighwayLanePlane({ noteG, lblG, textSprites, _ownedSharedMats, _ownedSharedGeos }) {
    // Dynamic fret number labels (heat-coloured, updated each frame)
    const pFretLbl = pool(lblG, () => new T.Sprite(textSprites.txtMat('0', '#888', false, 'fretRow')));

    // Highlight lane plane over active fret range. With the anchor-driven
    // segmented lanes we render up to fret-count × HIGHWAY_LANE_TIME_SLICES (96)
    // pLane meshes per frame, so:
    //   - geometry is a shared PlaneGeometry(1,1) (was per-mesh, never differed)
    //   - 2 shared MeshBasicMaterials (odd / even stripe colour) replace the
    //     per-mesh material clones; the per-frame opacity still travels via
    //     the materials but is set once outside the inner loop, not per-mesh.
    const gLanePlane = new T.PlaneGeometry(1, 1);
    const mLaneOdd = new T.MeshBasicMaterial({
        color: HIGHWAY_LANE_STRIPE_ODD_HEX, transparent: true, opacity: 0, depthWrite: false,
    });
    const mLaneEven = new T.MeshBasicMaterial({
        color: HIGHWAY_LANE_STRIPE_EVEN_HEX, transparent: true, opacity: 0, depthWrite: false,
    });
    // Tracked for explicit disposal in teardown — these materials may
    // not be reachable via scene.traverse() if no lane was ever rendered.
    _ownedSharedMats.push(mLaneOdd, mLaneEven);
    _ownedSharedGeos.push(gLanePlane);
    const pLane = pool(noteG, () => new T.Mesh(gLanePlane, mLaneOdd));

    const gGhostFretPlane = new T.PlaneGeometry(1, 1);
    _ownedSharedGeos.push(gGhostFretPlane);
    const mGhostFretLblPh = new T.MeshBasicMaterial({
        color: 0xffffff, transparent: true, depthTest: false, depthWrite: false,
    });
    _ownedSharedMats.push(mGhostFretLblPh);
    const pGhostFretLbl = pool(noteG, () => {
        const m = new T.Mesh(gGhostFretPlane, mGhostFretLblPh);
        // Must be above the proj frame (renderOrder=14) and opaque
        // geometry — same contract as technique labels (renderOrder=1000):
        // depthTest:false alone is insufficient, renderOrder=1000 needed.
        m.renderOrder = 1000;
        m.frustumCulled = false;
        return m;
    });

    return { pFretLbl, gLanePlane, mLaneOdd, mLaneEven, pLane, gGhostFretPlane, pGhostFretLbl };
}
