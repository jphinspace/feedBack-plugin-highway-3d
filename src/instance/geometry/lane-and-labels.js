import { T } from '../../core/three.js';
import { pool } from '../../core/pool.js';
import {
    ARPEGGIO_RIM_BLUE_HEX, HIGHWAY_LANE_STRIPE_EVEN_HEX, HIGHWAY_LANE_STRIPE_ODD_HEX, K,
} from '../../core/constants.js';

/** Lane fret-divider geometry/materials/pool, and the fret-column reference marker pool. Construction-time only. */
export function createLaneDividers({ noteG, _ownedSharedMats }) {
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

export function createFretColumnMarkerPool({ lblG, textSprites }) {
    const pFretColMarker = pool(lblG, () => {
        const _sp = new T.Sprite(textSprites.txtMat('0', '#666666', false, 'noteFret').clone());
        // fog=false prevents scene fog from dimming the sprite as it enters the far end of
        // the highway; opacity is managed by the manual fade-in ramp instead.
        _sp.material.fog = false;
        return _sp;
    });
    return { pFretColMarker };
}

/** Dynamic fret-number-row label pool, the highlighted highway lane plane, and the board-projection ghost fret-number label pool. Construction-time only. */
export function createHighwayLanePlane({ noteG, lblG, textSprites, _ownedSharedMats, _ownedSharedGeos }) {
    const pFretLbl = pool(lblG, () => new T.Sprite(textSprites.txtMat('0', '#888', false, 'fretRow')));

    // Up to fret-count x HIGHWAY_LANE_TIME_SLICES (96) pLane meshes render per frame, so
    // geometry and the two stripe materials are shared rather than per-mesh clones.
    const gLanePlane = new T.PlaneGeometry(1, 1);
    const mLaneOdd = new T.MeshBasicMaterial({
        color: HIGHWAY_LANE_STRIPE_ODD_HEX, transparent: true, opacity: 0, depthWrite: false,
    });
    const mLaneEven = new T.MeshBasicMaterial({
        color: HIGHWAY_LANE_STRIPE_EVEN_HEX, transparent: true, opacity: 0, depthWrite: false,
    });
    // Tracked for explicit teardown disposal — may not be reachable via scene.traverse()
    // if no lane was ever rendered.
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
        // Must draw above the proj frame (renderOrder=14) and opaque geometry: depthTest:false
        // alone is insufficient, renderOrder=1000 is required too (same contract as technique labels).
        m.renderOrder = 1000;
        m.frustumCulled = false;
        return m;
    });

    return { pFretLbl, gLanePlane, mLaneOdd, mLaneEven, pLane, gGhostFretPlane, pGhostFretLbl };
}
