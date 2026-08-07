import { T } from '../../core/three.js';
import { pool } from '../../core/pool.js';
import {
    ACCENT_HALO_OP_FAR, ACCENT_HALO_OP_MID, ACCENT_HALO_OP_NEAR, ACCENT_HALO_XY_INNER,
    ACCENT_HALO_XY_MID, ACCENT_HALO_XY_OUTER, ACCENT_HALO_Z_INNER, ACCENT_HALO_Z_MID,
    ACCENT_HALO_Z_OUTER, ACCENT_RIM_BASE_EMISSIVE,
    FRET_WIRE_HIT_EMISSIVE, FRET_WIRE_HIT_HEX, K, ND, NH, NW,
} from '../../core/constants.js';
import { DEFAULT_GEM_GRADIENTS } from '../../core/palette.js';

// Note-gem geometry + every material that colors a gem/outline/sustain-trail
// (Stage 7 Track B / 3-ctx-3). Moved verbatim out of initScene() — construction-
// time only, no `ctx` needed: every field here is read (never reassigned) by
// everything downstream, verified via a whole-file bare-reassignment grep
// (see CLAUDE.md's "deps/frame/accum" note). `activePalette` and `glowMul`
// are baked into these materials AT CONSTRUCTION TIME, matching the original
// code exactly -- a later palette change retints the built materials in place
// via `_applyPaletteToMaterials()` (still in main.js), it doesn't reconstruct
// them, so a stale `activePalette`/`glowMul` snapshot here is correct, not a bug.
//
// `mkGhostFrameGeometry` is returned (not called here) because its one call
// site (`initScene()`'s board-projection-ghost pool block) is still resident
// in main.js -- kept as a function so that later slice can call it unchanged.
export function createNoteGemVisuals({ activePalette, glowMul, noteG, _recolorGemGradients, _ownedSharedGeos, gHaloBar: _gHaloBarIn }) {
    // Rectangular note geometry
    const gNote = new T.BoxGeometry(NW, NH, ND);
    // Per-string vertical gradient gems — colours sampled from the
    // original colour PNGs (top highlight → deeper bottom). Each gradient
    // string gets its own BoxGeometry clone carrying a per-vertex colour
    // attribute; the gem core swaps to gNoteGrad[s] in drawNote while its
    // material (mStr[s]) is white + vertexColors:true so the gradient
    // shows pure. Strings 6/7 have no entry and fall back to flat gNote.
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
    // Seed gem colors from whatever palette is active at mount (custom
    // colors recolor the gem bodies just like the strings/trails).
    _recolorGemGradients();

    /** Filled ring matching flying-note outline (1.1) minus core (1.0); hollow centre. */
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
    // Tap chevron (open V pointing downward) — filled outline for extrusion into a solid mesh

    const chevronShape = new T.Shape();

    // Adjusting points for a "stubby" look
    // Width: increased to +/- 0.8 for a broader look
    // Height: capped at 0.2 to make it significantly shorter
    chevronShape.moveTo(-0.6, 0.3);   // Top left point (further out, lower down)
    chevronShape.lineTo(0, -0.1);     // Interior vertex (shallower V)
    chevronShape.lineTo(0.6, 0.3);    // Top right point (further out, lower down)

    chevronShape.lineTo(0.8, 0.0);    // Right outer thickness point
    chevronShape.lineTo(0, -0.3);     // Bottom vertex / Outer point (less deep)
    chevronShape.lineTo(-0.8, 0.0);   // Left outer thickness point

    chevronShape.closePath();

    // Create the 3D mesh geometry with a small depth
    const gTapChevron = new T.ExtrudeGeometry(chevronShape, {
        depth: 0.04 * K,
        bevelEnabled: false,
    });

    // Optional: Center the geometry if the pivot point feels off
    gTapChevron.computeBoundingBox();
    const centerOffset = -0.5 * (gTapChevron.boundingBox.max.y + gTapChevron.boundingBox.min.y);
    gTapChevron.translate(0, centerOffset, 0);

    // String materials. Strings 0..5 use a per-vertex gradient (color is
    // white so the gradient baked into gNoteGrad[s] shows pure); strings
    // 6/7 keep a flat colour (vertexColors:false ignores the attribute).
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
    // Stronger coloured rim + body for accented notes (.ac); drawNote swaps these in behind ND hit/miss.
    const mAccentOutline = activePalette.map(c => new T.MeshLambertMaterial({
        color: c, emissive: c, emissiveIntensity: ACCENT_RIM_BASE_EMISSIVE,
        transparent: true, opacity: 1.0, depthWrite: false,
    }));
    // Same colour response as mGlow (vibrancy lerp) but separate emissive drive for extra accent punch.
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
    // Frozen per-string shell descriptors — see _accentShellsByString
    // declaration. Materials live for the renderer's lifetime, so
    // these refs stay valid until teardown() clears them.
    const _accentShellsByString = mAccentHaloFar.map((_, s) => Object.freeze([
        Object.freeze({ mat: mAccentHaloFar[s],  ixy: ACCENT_HALO_XY_OUTER, iz: ACCENT_HALO_Z_OUTER, zK: 0.012 }),
        Object.freeze({ mat: mAccentHaloMid[s],  ixy: ACCENT_HALO_XY_MID,   iz: ACCENT_HALO_Z_MID,   zK: 0.008 }),
        Object.freeze({ mat: mAccentHaloNear[s], ixy: ACCENT_HALO_XY_INNER, iz: ACCENT_HALO_Z_INNER, zK: 0.005 }),
    ]));
    // Chord/arpeggio frame accent bloom — single gradient bar geometry.
    // The 4 bloom shells (expand=1.00/1.10/1.25/1.45, op=0.90/0.65/0.38/0.18)
    // are baked into vertex colours as their additive sum at each Y level,
    // so one mesh per bar replaces 4 per-shell meshes (16→4 draw calls/chord).
    // Normalised Y = ±(expand / EXPAND_MAX); EXPAND_MAX = 1.45.
    // Values > 1.0 in the Float32Array buffer are intentional: WebGL passes
    // them to the shader unchanged, and additive blending clips naturally.
    // Y levels (normalised): ±(shell_expand / 1.45)
    //   ±0.690 = shell 1 edge  ±0.759 = shell 2  ±0.862 = shell 3  ±1.0 = shell 4
    // Brightness = additive sum of all shells covering that band:
    //   |y| < 0.690 → all 4: 0.90+0.65+0.38+0.18 = 2.11
    //   |y| < 0.759 → 3 shells: 0.65+0.38+0.18 = 1.21
    //   |y| < 0.862 → 2 shells: 0.38+0.18 = 0.56
    //   |y| ≤ 1.000 → shell 4 only: 0.18
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
    // Notedetect feedback outline (issue #9): hot magenta-red (0xff0066, hue
    // ~345°) — distinct from the string red 0xff2828 at hue ~0°. Note rendering
    // swaps its outline.material between mWhiteOutline / per-string
    // mHitBright[s] / mMissOutline based on recent notedetect events.
    const mMissOutline = new T.MeshLambertMaterial({ color: 0xff0066, emissive: 0xff0066, emissiveIntensity: 1.2, transparent: true, opacity: 1.0, depthWrite: false });
    // Transparent placeholder for front (+Z, group 4) and back (-Z, group 5)
    // of the lateral face-fill material array. Also the default material for
    // the pNoteEdge pool: pool consumers reassign .material before render, so
    // the placeholder is never displayed — using an explicitly-invisible
    // material makes that intent obvious.
    // BoxGeometry group order: 0=+X, 1=-X, 2=+Y, 3=-Y, 4=+Z(front), 5=-Z(back)
    const mEdgeTransparent = new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    // mMissEdgeArrays: use mMissOutline (same Lambert+emissive material as the gem
    // border) so the lateral face fill matches the outline colour exactly.
    const mMissEdgeArrays = [mMissOutline, mMissOutline, mMissOutline, mMissOutline, mEdgeTransparent, mEdgeTransparent];

    // Hit: fixed neon spring-green on every string — 0x22ff88 is cyan-shifted
    // enough to be readable even on the green string (0x30d040). The outline
    // + lateral faces flash green regardless of which string was hit.
    const mHitBright = activePalette.map(() => new T.MeshLambertMaterial({
        color: 0x22ff88, emissive: 0x22ff88, emissiveIntensity: 4.0 * glowMul,
        transparent: true, opacity: 1.0, depthWrite: false,
    }));
    const mHitBrightArrays = mHitBright.map(m => [m, m, m, m, mEdgeTransparent, mEdgeTransparent]);

    // Rim flash: string-coloured, wire-fashion intensity. Colour and
    // emissive both take the palette colour so the rim reads as the
    // string lighting up, not as a white wash over it.
    const mRimFlash = activePalette.map((c) => new T.MeshLambertMaterial({
        color: c, emissive: c, emissiveIntensity: 1,
        transparent: true, opacity: 1.0, depthWrite: false,
    }));
    // Readability (#2 / charrette): the note gems + their outlines punch THROUGH
    // the distance fog so upcoming notes stay legible as they render in at the
    // horizon. The board, lane, sustains and background scenery keep their
    // atmospheric fog — only the note-defining materials are exempted, so the
    // highway still reads as deep while the notes never dissolve into the haze.
    [mWhiteOutline, mMissOutline].forEach(m => { if (m) m.fog = false; });
    [mStr, mGlow, mStrHitOutline, mHitBright, mRimFlash].forEach(arr => arr && arr.forEach(m => { if (m) m.fog = false; }));
    // Outline materials render at a lower renderOrder than the body.
    // The body is rendered on top with opacity:1 on hit/miss, which
    // fully covers the outline center — only the fringe that extends
    // past the body edges (0.2*K on each side) is visible.
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
