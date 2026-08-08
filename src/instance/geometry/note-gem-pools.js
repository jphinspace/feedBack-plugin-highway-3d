import { T } from '../../core/three.js';
import { pool } from '../../core/pool.js';
import { SLIDE_RIBBON_INDICES_ARR, SLIDE_RIBBON_SAMPLES } from '../../core/slide-ribbon.js';

/**
 * The note/sustain/slide-ribbon object pools. Construction-time only.
 * Pairs with `note-gem-visuals.js`, which builds the geometries/materials
 * these pools reference, injected as deps.
 */
export function createNoteGemPools({ noteG, gNote, mStr, mEdgeTransparent, mAccentHaloFar, gSus, mSus, mSusOutline }) {
    const pNote = pool(noteG, () => new T.Mesh(gNote, mStr[0]));
    // Pool default is the always-invisible mEdgeTransparent — every consumer reassigns
    // .material before render (to a verdict edge material array).
    const pNoteEdge = pool(noteG, () => new T.Mesh(gNote, mEdgeTransparent));
    const pAccentHalo = pool(noteG, () => new T.Mesh(gNote, mAccentHaloFar[0]));
    const pSus = pool(noteG, () => new T.Mesh(gSus, mSus[0]));
    const pSusOutline = pool(noteG, () => new T.Mesh(gSus, mSusOutline));
    const mkSlideRibbonGeo = () => {
        const nVert = 4 * (SLIDE_RIBBON_SAMPLES + 1);
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(nVert * 3), 3));
        // SLIDE_RIBBON_INDICES_ARR (plain Array) is shared across pool meshes; setIndex()
        // rewraps it into a fresh Uint16BufferAttribute per geometry, so sharing is safe.
        g.setIndex(SLIDE_RIBBON_INDICES_ARR);
        // Static cross-section normals: each ring is an axis-aligned quad, so vertex normals
        // point radially in the XY plane regardless of the slide's Z-curvature — pre-filled
        // once to skip a per-frame computeVertexNormals() pass on every sustained-slide update.
        const SQRT_HALF = Math.SQRT1_2;
        const normals = new Float32Array(nVert * 3);
        for (let k = 0; k <= SLIDE_RIBBON_SAMPLES; k++) {
            const o = k * 12;
            normals[o]     = -SQRT_HALF; normals[o + 1]  = -SQRT_HALF; normals[o + 2]  = 0;
            normals[o + 3] =  SQRT_HALF; normals[o + 4]  = -SQRT_HALF; normals[o + 5]  = 0;
            normals[o + 6] =  SQRT_HALF; normals[o + 7]  =  SQRT_HALF; normals[o + 8]  = 0;
            normals[o + 9] = -SQRT_HALF; normals[o + 10] =  SQRT_HALF; normals[o + 11] = 0;
        }
        g.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
        return g;
    };
    // Ribbon vertex positions mutate every frame but the mesh stays at (0,0,0) and its
    // bounding sphere is never recomputed — frustum culling against that stale origin-centred
    // bound would cull the ribbon as the camera pans away, so it's disabled on these meshes
    // (already gated by t0/t1 reachability before render).
    const pSusRibbon = pool(noteG, () => {
        const m = new T.Mesh(mkSlideRibbonGeo(), mSus[0]);
        m.frustumCulled = false;
        return m;
    });
    const pSusRibbonOl = pool(noteG, () => {
        const m = new T.Mesh(mkSlideRibbonGeo(), mSusOutline);
        m.frustumCulled = false;
        m.renderOrder = -3;
        return m;
    });

    return { pNote, pNoteEdge, pAccentHalo, pSus, pSusOutline, pSusRibbon, pSusRibbonOl };
}

/**
 * Board ghost frame: filled rim (outline 1.1x minus core 1.0x) in string
 * color, matching drawNote's outline/core proportions. 3 slots per string
 * (slot 0 = next-on-string/chord/arp ghost, 1/2 = independent upcoming-note
 * previews), all sharing one geometry since it's identical regardless of
 * string or slot.
 */
export function createBoardGhostFrames({ noteG, activePalette, mkGhostFrameGeometry }) {
    const _ghostFrameGeo = mkGhostFrameGeometry();
    const projMeshArr = activePalette.map((_, s) => [0, 1, 2].map(() => {
        const mat = new T.MeshStandardMaterial({
            color: activePalette[s],
            emissive: activePalette[s],
            emissiveIntensity: 0.002,
            transparent: true,
            opacity: 0.65,
            roughness: 1,
            depthWrite: false,
            depthTest: false,
        });
        const m = new T.Mesh(_ghostFrameGeo, mat);
        m.visible = false;
        // depthTest:false above, so renderOrder alone decides stacking: above sus trails
        // (12/13) but below note gems (20/21), so it stays visible without covering notes.
        m.renderOrder = 14;
        noteG.add(m);
        return m;
    }));

    return { projMeshArr };
}
