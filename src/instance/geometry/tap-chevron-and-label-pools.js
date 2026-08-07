import { T } from '../../core/three.js';
import { pool } from '../../core/pool.js';

// The tap-chevron material + 4 small pools (tap chevron, generic technique
// label, beat line, section label) -- moved verbatim out of initScene()
// (Stage 7 Track A). Construction-time only, no `frame` tier -- built once
// per initScene() call, read (never reassigned) by everything downstream.
//
// gTapChevron/gBeat/mBeatQ are built earlier in initScene() by the
// still-monolithic note-gem-visuals cluster -- injected as deps rather than
// imported, since they're per-instance Three.js resources, not pure values.
export function createTapChevronAndLabelPools({ noteG, lblG, beatG, textSprites, gTapChevron, gBeat, mBeatQ }) {
    // One shared material per technique-mesh type. The pool factory
    // hands out fresh meshes that all reference the same material,
    // so a dense HO/PO passage doesn't churn N MeshLambertMaterial
    // allocations and N GPU material switches.
    // Transparent + no depth write/test so the tap chevron draws in
    // the transparent pass where drawNote assigns renderOrder 1000.
    const mTapChevron = new T.MeshLambertMaterial({
        color: 0xd4d4d4,
        emissive: 0xd4d4d4,
        emissiveIntensity: 0.9,
        transparent: true,
        opacity: 0.85,
        side: T.DoubleSide, forceSinglePass: true,
        depthWrite: false,
        depthTest: false,
    });
    const pTapChevron = pool(noteG, () => new T.Mesh(gTapChevron, mTapChevron));
    const pLbl  = pool(lblG,  () => new T.Sprite(textSprites.txtMat('0', '#fff', false, 'technique')));
    const pBeat = pool(beatG, () => new T.Line(gBeat, mBeatQ));
    const pSec  = pool(lblG,  () => new T.Sprite(textSprites.txtMat('', '#0dd', true, 'section')));

    return { mTapChevron, pTapChevron, pLbl, pBeat, pSec };
}
