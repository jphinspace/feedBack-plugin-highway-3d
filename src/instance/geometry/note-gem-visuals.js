import { T } from '../../core/three.js';
import { pool } from '../../core/pool.js';
import {
    ACCENT_HALO_OP_FAR, ACCENT_HALO_OP_MID, ACCENT_HALO_OP_NEAR, ACCENT_HALO_XY_INNER,
    ACCENT_HALO_XY_MID, ACCENT_HALO_XY_OUTER, ACCENT_HALO_Z_INNER, ACCENT_HALO_Z_MID,
    ACCENT_HALO_Z_OUTER, ACCENT_RIM_BASE_EMISSIVE,
    FRET_WIRE_HIT_EMISSIVE, FRET_WIRE_HIT_HEX, K, ND, NH, NW,
} from '../../core/constants.js';
import { DEFAULT_GEM_GRADIENTS } from '../../core/palette.js';

/**
 * Note-gem geometry + every material that colors a gem/outline/sustain
 * trail. Construction-time only. `activePalette`/`glowMul` are baked into
 * these materials at construction time; a later palette change retints the
 * built materials in place via `_applyPaletteToMaterials()` rather than
 * reconstructing them, so a stale snapshot here is correct by design.
 * {@link mkGhostFrameGeometry} is returned rather than called here since
 * its one call site (the board-projection-ghost pool) is still in `main.js`.
 */
export function createNoteGemVisuals({ activePalette, glowMul, noteG, _recolorGemGradients, _ownedSharedGeos, gHaloBar: _gHaloBarIn }) {
    const gNote = new T.BoxGeometry(NW, NH, ND);
    // Per-string vertical gradient gems. Each gets its own BoxGeometry clone carrying a
    // per-vertex color attribute; drawNote swaps the gem core to gNoteGrad[s] while its
    // material (mStr[s]) is white + vertexColors:true so the gradient shows pure.
    // Strings 6/7 have no entry and fall back to flat gNote.
    const gNoteGrad = DEFAULT_GEM_GRADIENTS.map(([topHex, botHex]) => {
        const g = new T.BoxGeometry(NW, NH, ND);
        const _pos = g.attributes.position;
        const _colors = new Float32Array(_pos.count * 3);
        const _topCol = new T.Color(topHex);
        const _botCol = new T.Color(botHex);
        const _tmpCol = new T.Color();
        const _halfH = NH / 2;
        for (let i = 0; i < _pos.count; i++) {
            const t = (_pos.getY(i) + _halfH) / (2 * _halfH); // 0 bottom..1 top
            _tmpCol.copy(_botCol).lerp(_topCol, t);
            _colors[i * 3] = _tmpCol.r;
            _colors[i * 3 + 1] = _tmpCol.g;
            _colors[i * 3 + 2] = _tmpCol.b;
        }
        g.setAttribute('color', new T.BufferAttribute(_colors, 3));
        _ownedSharedGeos.push(g);
        return g;
    });
    _recolorGemGradients();

    /** Filled ring matching flying-note outline (1.1x) minus core (1.0x); hollow centre. */
    function mkGhostFrameGeometry() {
        const ow = NW * 1.1;
        const oh = NH * 1.1;
        const iw = NW;
        const ih = NH;
        const depth = ND * 2.8;
        const shape = new T.Shape();
        shape.moveTo(-ow / 2, -oh / 2);
        shape.lineTo(-ow / 2, oh / 2);
        shape.lineTo(ow / 2, oh / 2);
        shape.lineTo(ow / 2, -oh / 2);
        shape.lineTo(-ow / 2, -oh / 2);
        const hole = new T.Path();
        hole.moveTo(-iw / 2, -ih / 2);
        hole.lineTo(iw / 2, -ih / 2);
        hole.lineTo(iw / 2, ih / 2);
        hole.lineTo(-iw / 2, ih / 2);
        hole.lineTo(-iw / 2, -ih / 2);
        shape.holes.push(hole);
        const g = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
        g.translate(0, 0, -depth / 2);
        return g;
    }

    const gSus = new T.BoxGeometry(1, 1, 1);
    const gBeat = new T.BufferGeometry().setFromPoints(
        [new T.Vector3(0, 0, 0), new T.Vector3(1, 0, 0)],
    );

    // Tap chevron (open V pointing downward), extruded into a solid mesh.
    const chevronShape = new T.Shape();
    chevronShape.moveTo(-0.6, 0.3);
    chevronShape.lineTo(0, -0.1);
    chevronShape.lineTo(0.6, 0.3);
    chevronShape.lineTo(0.8, 0.0);
    chevronShape.lineTo(0, -0.3);
    chevronShape.lineTo(-0.8, 0.0);
    chevronShape.closePath();
    const gTapChevron = new T.ExtrudeGeometry(chevronShape, {
        depth: 0.04 * K,
        bevelEnabled: false,
    });
    gTapChevron.computeBoundingBox();
    const centerOffset = -0.5 * (gTapChevron.boundingBox.max.y + gTapChevron.boundingBox.min.y);
    gTapChevron.translate(0, centerOffset, 0);

    // Strings 0..5 use a per-vertex gradient (color white so gNoteGrad[s] shows pure);
    // strings 6/7 keep a flat color (vertexColors:false ignores the attribute).
    const mStr = activePalette.map((c, i) => new T.MeshBasicMaterial({
        color: i < 6 ? 0xffffff : c,
        vertexColors: i < 6,
        transparent: true, opacity: 1.0,
    }));
    const mGlow = activePalette.map(c => new T.MeshLambertMaterial({
        color: 0xffffff, emissive: c, emissiveIntensity: 1.5,
        transparent: true, opacity: 1.0, depthWrite: false,
    }));
    const _laneTargetColor = new T.Color(0x4488ff);
    const _fwHitColor = new T.Color(FRET_WIRE_HIT_HEX);
    const _fwHitEmissive = new T.Color(FRET_WIRE_HIT_EMISSIVE);
    const mSus = activePalette.map(c => new T.MeshLambertMaterial({
        color: c, transparent: true, opacity: 0.35,
    }));
    const mWhiteOutline = new T.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6, transparent: true, opacity: 1.0, depthWrite: false });
    const _outlineColors = [0xFF5552, 0xFFF352, 0x31CAFF, 0xFFAE31, 0x84FF42, 0xE639FF];
    const _outlinePalette = activePalette.map((c, i) => _outlineColors[i] ?? c);
    const mStrHitOutline = _outlinePalette.map(c => new T.MeshLambertMaterial({
        color: c, emissive: c, emissiveIntensity: 1.0,
        transparent: true, opacity: 1.0, depthWrite: false,
    }));
    /** Stronger colored rim + body for accented (`.ac`) notes; drawNote swaps these in behind hit/miss. */
    const mAccentOutline = activePalette.map(c => new T.MeshLambertMaterial({
        color: c, emissive: c, emissiveIntensity: ACCENT_RIM_BASE_EMISSIVE,
        transparent: true, opacity: 1.0, depthWrite: false,
    }));
    const mAccentCore = activePalette.map(c => new T.MeshLambertMaterial({
        color: 0xffffff, emissive: c, emissiveIntensity: 1.5,
        transparent: true, opacity: 1.0, depthWrite: false,
    }));
    const mkAccentHaloMats = (baseOp) => activePalette.map(c => new T.MeshBasicMaterial({
        color: new T.Color(c),
        transparent: true,
        opacity: baseOp,
        depthWrite: false,
        depthTest: true,
        blending: T.AdditiveBlending,
        side: T.DoubleSide, forceSinglePass: true,
        fog: true,
    }));
    const mAccentHaloNear = mkAccentHaloMats(ACCENT_HALO_OP_NEAR);
    const mAccentHaloMid = mkAccentHaloMats(ACCENT_HALO_OP_MID);
    const mAccentHaloFar = mkAccentHaloMats(ACCENT_HALO_OP_FAR);
    // Materials live for the renderer's lifetime, so these refs stay valid until teardown().
    const _accentShellsByString = mAccentHaloFar.map((_, s) => Object.freeze([
        Object.freeze({ mat: mAccentHaloFar[s],  ixy: ACCENT_HALO_XY_OUTER, iz: ACCENT_HALO_Z_OUTER, zK: 0.012 }),
        Object.freeze({ mat: mAccentHaloMid[s],  ixy: ACCENT_HALO_XY_MID,   iz: ACCENT_HALO_Z_MID,   zK: 0.008 }),
        Object.freeze({ mat: mAccentHaloNear[s], ixy: ACCENT_HALO_XY_INNER, iz: ACCENT_HALO_Z_INNER, zK: 0.005 }),
    ]));
    /**
     * Chord/arpeggio frame accent bloom bar. The 4 bloom shells
     * (expand=1.00/1.10/1.25/1.45, op=0.90/0.65/0.38/0.18) are baked into
     * vertex colors as their additive sum at each Y level, so one mesh
     * per bar replaces 4 per-shell meshes. Normalized Y = ±(expand/1.45);
     * values >1.0 in the buffer are intentional — additive blending clips
     * them naturally. Resulting bands: |y|<0.690 → 2.11, <0.759 → 1.21,
     * <0.862 → 0.56, ≤1.0 → 0.18.
     */
    let gHaloBar = _gHaloBarIn;
    if (!gHaloBar) {
        // prettier-ignore
        const YS = [-1.000, -0.862, -0.759, -0.690,  0.690, 0.759, 0.862, 1.000];
        // prettier-ignore
        const BS = [ 0.18,   0.56,   1.21,   2.11,   2.11,  1.21,  0.56,  0.18 ];
        const N = YS.length;
        const pos = new Float32Array(N * 2 * 3);
        const col = new Float32Array(N * 2 * 3);
        const idx = new Uint16Array((N - 1) * 6);
        for (let i = 0; i < N; i++) {
            const y = YS[i], b = BS[i];
            const li = (i * 2 + 0) * 3, ri = (i * 2 + 1) * 3;
            pos[li]=-1; pos[li+1]=y; pos[li+2]=0;
            col[li]=b;  col[li+1]=b; col[li+2]=b;
            pos[ri]=+1; pos[ri+1]=y; pos[ri+2]=0;
            col[ri]=b;  col[ri+1]=b; col[ri+2]=b;
        }
        for (let i = 0; i < N - 1; i++) {
            const ii = i * 6, v = i * 2;
            idx[ii+0]=v+0; idx[ii+1]=v+1; idx[ii+2]=v+3;
            idx[ii+3]=v+0; idx[ii+4]=v+3; idx[ii+5]=v+2;
        }
        gHaloBar = new T.BufferGeometry();
        gHaloBar.setAttribute('position', new T.BufferAttribute(pos, 3));
        gHaloBar.setAttribute('color',    new T.BufferAttribute(col, 3));
        gHaloBar.setIndex(new T.BufferAttribute(idx, 1));
    }
    const pHaloBar = pool(noteG, () => new T.Mesh(
        gHaloBar,
        new T.MeshBasicMaterial({
            vertexColors: true,
            transparent: true, opacity: 1.0, depthWrite: false,
            blending: T.AdditiveBlending, side: T.DoubleSide, forceSinglePass: true, fog: false,
        }),
    ));
    // Hot magenta-red (hue ~345°), distinct from string red (hue ~0°). Note rendering swaps
    // its outline material between mWhiteOutline / per-string mHitBright[s] / mMissOutline.
    const mMissOutline = new T.MeshLambertMaterial({ color: 0xff0066, emissive: 0xff0066, emissiveIntensity: 1.2, transparent: true, opacity: 1.0, depthWrite: false });
    // Invisible placeholder for the lateral face-fill material array's front/back groups, and
    // the pNoteEdge pool default — pool consumers always reassign .material before render.
    // BoxGeometry group order: 0=+X, 1=-X, 2=+Y, 3=-Y, 4=+Z(front), 5=-Z(back)
    const mEdgeTransparent = new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const mMissEdgeArrays = [mMissOutline, mMissOutline, mMissOutline, mMissOutline, mEdgeTransparent, mEdgeTransparent];

    // Fixed neon spring-green on every string (cyan-shifted enough to stay readable on the
    // green string itself); the outline + lateral faces flash green regardless of which string.
    const mHitBright = activePalette.map(() => new T.MeshLambertMaterial({
        color: 0x22ff88, emissive: 0x22ff88, emissiveIntensity: 4.0 * glowMul,
        transparent: true, opacity: 1.0, depthWrite: false,
    }));
    const mHitBrightArrays = mHitBright.map(m => [m, m, m, m, mEdgeTransparent, mEdgeTransparent]);

    const mRimFlash = activePalette.map((c) => new T.MeshLambertMaterial({
        color: c, emissive: c, emissiveIntensity: 1,
        transparent: true, opacity: 1.0, depthWrite: false,
    }));
    // Note gems + outlines punch through the distance fog so upcoming notes stay legible near
    // the horizon; the board, lane, sustains, and background scenery keep atmospheric fog.
    [mWhiteOutline, mMissOutline].forEach(m => { if (m) m.fog = false; });
    [mStr, mGlow, mStrHitOutline, mHitBright, mRimFlash].forEach(arr => arr && arr.forEach(m => { if (m) m.fog = false; }));
    // Outline renders at a lower renderOrder than the body; the opaque hit/miss body fully
    // covers the outline center, leaving only the fringe past the body edges visible.
    const mSusOutline     = new T.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.3, transparent: true, opacity: 0.75, depthWrite: false });
    const mHitSusOutline  = new T.MeshLambertMaterial({ color: 0x22ff88, emissive: 0x22ff88, emissiveIntensity: 0.8, transparent: true, opacity: 0.45, depthWrite: false });
    const mBeatM = new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 });
    const mBeatQ = new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07 });

    return {
        gNote, gNoteGrad, gSus, gBeat, gTapChevron, mkGhostFrameGeometry,
        mStr, mGlow, mSus, mWhiteOutline, mStrHitOutline, mAccentOutline, mAccentCore,
        mAccentHaloNear, mAccentHaloMid, mAccentHaloFar, _accentShellsByString,
        gHaloBar, pHaloBar, mMissOutline, mEdgeTransparent, mMissEdgeArrays,
        mHitBright, mHitBrightArrays, mRimFlash, mSusOutline, mHitSusOutline,
        mBeatM, mBeatQ, _laneTargetColor, _fwHitColor, _fwHitEmissive,
    };
}
