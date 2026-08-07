import { T } from '../../core/three.js';
import { pool } from '../../core/pool.js';
import { SLIDE_RIBBON_INDICES_ARR, SLIDE_RIBBON_SAMPLES } from '../../core/slide-ribbon.js';

// The note/sustain/slide-ribbon object pools -- moved verbatim out of
// initScene() (Stage 7 Track B / 3-ctx-3). Construction-time only, no `ctx`
// needed: every field here is only ever reassigned inside initScene() /
// teardown() (verified via whole-file bare-reassignment grep). Pairs with
// note-gem-visuals.js, which builds the geometries/materials these pools
// reference (gNote, mStr, mEdgeTransparent, mAccentHaloFar, gSus, mSus,
// mSusOutline) -- injected as deps rather than imported, since they're
// per-instance Three.js resources built earlier in the same initScene() call.
export function createNoteGemPools({ noteG, gNote, mStr, mEdgeTransparent, mAccentHaloFar, gSus, mSus, mSusOutline }) {
    const pNote = pool(noteG, () => new T.Mesh(gNote, mStr[0]));
    // Pool default is the always-invisible mEdgeTransparent — every
    // consumer reassigns .material before render (to a verdict edge
    // material array), so the placeholder is never displayed.
    const pNoteEdge = pool(noteG, () => new T.Mesh(gNote, mEdgeTransparent));
    const pAccentHalo = pool(noteG, () => new T.Mesh(gNote, mAccentHaloFar[0]));
    const pSus = pool(noteG, () => new T.Mesh(gSus, mSus[0]));
    const pSusOutline = pool(noteG, () => new T.Mesh(gSus, mSusOutline));
    const mkSlideRibbonGeo = () => {
        const nVert = 4 * (SLIDE_RIBBON_SAMPLES + 1);
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(nVert * 3), 3));
        // SLIDE_RIBBON_INDICES_ARR is the plain-Array form (see module-init
        // comment) shared across pool meshes; setIndex() rewraps it into a
        // fresh Uint16BufferAttribute per geometry, so the share is safe.
        g.setIndex(SLIDE_RIBBON_INDICES_ARR);
        // Static cross-section normals: each ring is an axis-aligned quad,
        // so vertex normals point radially in the XY plane regardless of
        // the slide's Z-direction curvature. Pre-fill once and skip the
        // per-frame computeVertexNormals() pass that previously ran on
        // every sustained-slide update (Copilot perf finding on PR #215).
        const SQRT_HALF = Math.SQRT1_2;
        const normals = new Float32Array(nVert * 3);
        for (let k = 0; k <= SLIDE_RIBBON_SAMPLES; k++) {
            const o = k * 12;
            // v0 (-X,-Y), v1 (+X,-Y), v2 (+X,+Y), v3 (-X,+Y)
            normals[o]     = -SQRT_HALF; normals[o + 1]  = -SQRT_HALF; normals[o + 2]  = 0;
            normals[o + 3] =  SQRT_HALF; normals[o + 4]  = -SQRT_HALF; normals[o + 5]  = 0;
            normals[o + 6] =  SQRT_HALF; normals[o + 7]  =  SQRT_HALF; normals[o + 8]  = 0;
            normals[o + 9] = -SQRT_HALF; normals[o + 10] =  SQRT_HALF; normals[o + 11] = 0;
        }
        g.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
        return g;
    };
    // Ribbon meshes mutate vertex positions every frame in
    // slideRibbonUpdatePositions but the mesh itself stays at (0,0,0)
    // and the geometry's bounding sphere is never recomputed. With
    // frustum culling on, Three.js tests the (0,0,0)-centred bounds
    // and culls the ribbon as soon as the camera pans away from world
    // origin, so slides flicker in/out. Disable culling on these
    // meshes — the ribbon footprint is small and they're already
    // gated by t0/t1 reachability before render.
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

// Board ghost: filled rim (ExtrudeGeometry w/ hole) in string colour. Matches
// outline 1.1x vs core 1.0x like drawNote; centre stays empty. 3 slots per
// string (up to 3 simultaneous ghost previews, chart-format style): slot 0 is
// the "next on string" / chord / arp ghost (unchanged selection logic), slots
// 1/2 are independent "upcoming" lead-note previews. All slots share one
// geometry -- it's identical (NW/NH/ND-based) regardless of string or slot,
// so one ExtrudeGeometry serves all nStr*3 meshes. Construction-time only,
// same verification as createNoteGemPools above.
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
        // Board projection ghost frame. depthTest:false above, so
        // renderOrder alone decides stacking — keep it above the
        // sus trails (12/13) but below note gems (20/21) so it
        // stays visible on the fretboard without covering notes.
        m.renderOrder = 14;
        noteG.add(m);
        return m;
    }));

    return { projMeshArr };
}
