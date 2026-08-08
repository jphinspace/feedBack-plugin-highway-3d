import { T } from '../../core/three.js';
import { pool } from '../../core/pool.js';
import {
    ARPEGGIO_BOX_BLUE_DARK_HEX, ARPEGGIO_BOX_BLUE_HEX, CHORD_BOX_EDGE_ALPHA,
    CHORD_BOX_FILL_GRAD_ALPHA, CHORD_BOX_TEAL_DARK_HEX, CHORD_BOX_TEAL_HEX,
    FRET_LABEL_GOLD_HEX,
} from '../../core/constants.js';

/**
 * Chord/arpeggio-frame gradient textures, the PM/FH strum X-mark
 * fill+line geometry (legacy InstancedMesh form plus the current per-chord
 * pool form), and the remaining chord/note-label/connector-line pools.
 * Construction-time only. `gPMXLines`/`gFHXLines`/`gArpBracket` reuse the
 * passed-in value if already built, same as `note-gem-visuals.js`'s `gHaloBar`.
 */
export function createChordAccentVisuals({
    noteG, lblG, textSprites, glowMul, _imColor, IM_STRUM_CAP,
    _imPMXFillAlphaArr, _imFHXFillAlphaArr, _imPMXLinesAlphaArr, _imFHXLinesAlphaArr,
    gPMXLines: _gPMXLinesIn, gFHXLines: _gFHXLinesIn, gArpBracket: _gArpBracketIn,
}) {
    const chR = CHORD_BOX_TEAL_HEX >> 16 & 255;
    const chG = CHORD_BOX_TEAL_HEX >> 8 & 255;
    const chB = CHORD_BOX_TEAL_HEX & 255;
    const dkR = CHORD_BOX_TEAL_DARK_HEX >> 16 & 255;
    const dkG = CHORD_BOX_TEAL_DARK_HEX >> 8 & 255;
    const dkB = CHORD_BOX_TEAL_DARK_HEX & 255;
    const aFill = Math.round(CHORD_BOX_FILL_GRAD_ALPHA * 255);
    const chordFrameGradTex = new T.DataTexture(
        new Uint8Array([ chR, chG, chB, aFill, dkR, dkG, dkB, aFill, chR, chG, chB, aFill ]),
        3, 1, T.RGBAFormat);
    chordFrameGradTex.magFilter = T.LinearFilter;
    chordFrameGradTex.minFilter = T.LinearFilter;
    chordFrameGradTex.wrapS = T.ClampToEdgeWrapping;
    chordFrameGradTex.wrapT = T.ClampToEdgeWrapping;
    // DataTexture defaults to linear color space; flag sRGB so the hex values match other sRGB textures.
    chordFrameGradTex.colorSpace = T.SRGBColorSpace;
    chordFrameGradTex.needsUpdate = true;

    const arR = ARPEGGIO_BOX_BLUE_HEX >> 16 & 255;
    const arG = ARPEGGIO_BOX_BLUE_HEX >> 8 & 255;
    const arB = ARPEGGIO_BOX_BLUE_HEX & 255;
    const arDR = ARPEGGIO_BOX_BLUE_DARK_HEX >> 16 & 255;
    const arDG = ARPEGGIO_BOX_BLUE_DARK_HEX >> 8 & 255;
    const arDB = ARPEGGIO_BOX_BLUE_DARK_HEX & 255;
    const chordFrameGradTexArp = new T.DataTexture(
        new Uint8Array([ arR, arG, arB, aFill, arDR, arDG, arDB, aFill, arR, arG, arB, aFill ]),
        3, 1, T.RGBAFormat);
    chordFrameGradTexArp.magFilter = T.LinearFilter;
    chordFrameGradTexArp.minFilter = T.LinearFilter;
    chordFrameGradTexArp.wrapS = T.ClampToEdgeWrapping;
    chordFrameGradTexArp.wrapT = T.ClampToEdgeWrapping;
    chordFrameGradTexArp.colorSpace = T.SRGBColorSpace;
    chordFrameGradTexArp.needsUpdate = true;

    const pChordFrameFill = pool(noteG, () => new T.Mesh(
        new T.PlaneGeometry(1, 1),
        new T.MeshBasicMaterial({
            map: chordFrameGradTex,
            transparent: true,
            opacity: 1,
            depthWrite: false,
            depthTest: false,
            fog: false,
            side: T.DoubleSide, forceSinglePass: true,
        }),
    ));
    const pChordBox = pool(noteG, () => new T.Mesh(
        new T.BoxGeometry(1, 1, 1),
        new T.MeshBasicMaterial({
            color: CHORD_BOX_TEAL_HEX,
            transparent: true,
            opacity: CHORD_BOX_EDGE_ALPHA,
            depthWrite: false,
            depthTest: false,
            fog: false,
            side: T.DoubleSide, forceSinglePass: true,
        }),
    ));

    // PM strum X fill — 4 corner regions + centre; the 4 arms (L,R,T,B) are left empty.
    // 16 vertices, 14 triangles.
    //  0=A(-1,1)  1=TLC(-0.48,1)  2=T(-0.012,0.257)  3=TRC(0.5,1)
    //  4=BR(1,1)  5=REB(1,0.5)   6=R(0.476,-0.011)  7=RET(1,-0.5)
    //  8=C(1,-1)  9=BRC(0.48,-1) 10=B(-0.003,-0.276) 11=BLC(-0.48,-1)
    // 12=D(-1,-1) 13=LET(-1,-0.5) 14=L(-0.494,-0.011) 15=LEB(-1,0.5)
    let gPMXFill, imPMXFill, _imPMXFillMat;
    {
        // prettier-ignore
        const pos = new Float32Array([
            -1,      1,      0,  //  0  A
            -0.480,  1,      0,  //  1  TLC
            -0.012,  0.257,  0,  //  2  T
             0.500,  1,      0,  //  3  TRC
             1,      1,      0,  //  4  BR
             1,      0.5,    0,  //  5  REB
             0.476, -0.011,  0,  //  6  R
             1,     -0.5,    0,  //  7  RET
             1,     -1,      0,  //  8  C
             0.480, -1,      0,  //  9  BRC
            -0.003, -0.276,  0,  // 10  B
            -0.480, -1,      0,  // 11  BLC
            -1,     -1,      0,  // 12  D
            -1,     -0.5,    0,  // 13  LET
            -0.494, -0.011,  0,  // 14  L
            -1,      0.5,    0,  // 15  LEB
        ]);
        // prettier-ignore
        const idx = new Uint16Array([
            // top-left corner: A,TLC,T,L,LEB
             0,  1,  2,
             0,  2, 14,
             0, 14, 15,
            // top-right corner: TRC,BR,REB,R,T
             3,  4,  5,
             3,  5,  6,
             3,  6,  2,
            // centre: T,R,B,L
             2,  6, 10,
             2, 10, 14,
            // bottom-right corner: RET,C,BRC,B,R
             7,  8,  9,
             7,  9, 10,
             7, 10,  6,
            // bottom-left corner: LET,L,B,BLC,D
            13, 14, 10,
            13, 10, 11,
            13, 11, 12,
        ]);
        gPMXFill = new T.BufferGeometry();
        gPMXFill.setAttribute('position', new T.BufferAttribute(pos, 3));
        gPMXFill.setIndex(new T.BufferAttribute(idx, 1));
    }
    // PM fill — InstancedMesh (black, varying alpha per chord).
    {
        const _imFillVert = [
            'attribute float instanceAlpha;',
            'varying float vAlpha;',
            'void main() {',
            '    vAlpha = instanceAlpha;',
            '    vec4 pos = vec4(position, 1.0);',
            '    #ifdef USE_INSTANCING',
            '    pos = instanceMatrix * pos;',
            '    #endif',
            '    gl_Position = projectionMatrix * modelViewMatrix * pos;',
            '}',
        ].join('\n');
        const _imFillFrag = [
            'varying float vAlpha;',
            'void main() {',
            '    if (vAlpha <= 0.0) discard;',
            '    gl_FragColor = vec4(0.0, 0.0, 0.0, vAlpha);',
            '}',
        ].join('\n');
        const alphaAttr = new T.InstancedBufferAttribute(_imPMXFillAlphaArr, 1);
        alphaAttr.setUsage(T.DynamicDrawUsage);
        gPMXFill.setAttribute('instanceAlpha', alphaAttr);
        _imPMXFillMat = new T.ShaderMaterial({
            vertexShader: _imFillVert, fragmentShader: _imFillFrag,
            transparent: true, depthTest: false, depthWrite: false,
            fog: false, side: T.DoubleSide, forceSinglePass: true,
        });
        imPMXFill = new T.InstancedMesh(gPMXFill, _imPMXFillMat, IM_STRUM_CAP);
        imPMXFill.instanceMatrix.setUsage(T.DynamicDrawUsage);
        imPMXFill.frustumCulled = false;
        imPMXFill.renderOrder = 10.5;
        imPMXFill.count = 0;
        noteG.add(imPMXFill);
    }

    // FH (frethand mute) strum X fill — 5 regions: 4 corner quadrants + centre diamond.
    // 12 vertices, 10 triangles. L/R wings stop at fx=±0.50 (no solid lateral blocks).
    //  0=LET(-0.50,+1)  1=TLC(-0.15,+1)  2=T(0,+0.42)   3=TRC(+0.15,+1)
    //  4=RET(+0.50,+1)  5=REB(+0.50,-1)  6=R(+0.28,0)   7=B(0,-0.42)
    //  8=BRC(+0.15,-1)  9=BLC(-0.15,-1) 10=LEB(-0.50,-1) 11=L(-0.28,0)
    let gFHXFill, imFHXFill, _imFHXFillMat;
    {
        // prettier-ignore
        const pos = new Float32Array([
            -0.50,  1,      0,  //  0  LET
            -0.15,  1,      0,  //  1  TLC
             0,     0.42,   0,  //  2  T
             0.15,  1,      0,  //  3  TRC
             0.50,  1,      0,  //  4  RET
             0.50, -1,      0,  //  5  REB
             0.28,  0,      0,  //  6  R
             0,    -0.42,   0,  //  7  B
             0.15, -1,      0,  //  8  BRC
            -0.15, -1,      0,  //  9  BLC
            -0.50, -1,      0,  // 10  LEB
            -0.28,  0,      0,  // 11  L
        ]);
        // prettier-ignore
        const idx = new Uint16Array([
            // top-left corner: LET,TLC,T,L
             0,  1,  2,
             0,  2, 11,
            // top-right corner: TRC,RET,R,T
             3,  4,  6,
             3,  6,  2,
            // bottom-right corner: REB,R,B,BRC
             5,  6,  7,
             5,  7,  8,
            // bottom-left corner: LEB,L,B,BLC
            10, 11,  7,
            10,  7,  9,
            // centre diamond: L,T,R,B
            11,  2,  6,
            11,  6,  7,
        ]);
        gFHXFill = new T.BufferGeometry();
        gFHXFill.setAttribute('position', new T.BufferAttribute(pos, 3));
        gFHXFill.setIndex(new T.BufferAttribute(idx, 1));
    }
    // FH fill — InstancedMesh (black, varying alpha per chord).
    {
        const _imFillVert = [
            'attribute float instanceAlpha;',
            'varying float vAlpha;',
            'void main() {',
            '    vAlpha = instanceAlpha;',
            '    vec4 pos = vec4(position, 1.0);',
            '    #ifdef USE_INSTANCING',
            '    pos = instanceMatrix * pos;',
            '    #endif',
            '    gl_Position = projectionMatrix * modelViewMatrix * pos;',
            '}',
        ].join('\n');
        const _imFillFrag = [
            'varying float vAlpha;',
            'void main() {',
            '    if (vAlpha <= 0.0) discard;',
            '    gl_FragColor = vec4(0.0, 0.0, 0.0, vAlpha);',
            '}',
        ].join('\n');
        const alphaAttr = new T.InstancedBufferAttribute(_imFHXFillAlphaArr, 1);
        alphaAttr.setUsage(T.DynamicDrawUsage);
        gFHXFill.setAttribute('instanceAlpha', alphaAttr);
        _imFHXFillMat = new T.ShaderMaterial({
            vertexShader: _imFillVert, fragmentShader: _imFillFrag,
            transparent: true, depthTest: false, depthWrite: false,
            fog: false, side: T.DoubleSide, forceSinglePass: true,
        });
        imFHXFill = new T.InstancedMesh(gFHXFill, _imFHXFillMat, IM_STRUM_CAP);
        imFHXFill.instanceMatrix.setUsage(T.DynamicDrawUsage);
        imFHXFill.frustumCulled = false;
        imFHXFill.renderOrder = 10.5;
        imFHXFill.count = 0;
        noteG.add(imFHXFill);
    }

    // PM X lines — 8 segments baked as thin quads in ±1 normalised space. The pool mesh
    // scale's Y is negated per chord to match the XLINES convention (fya>0 = below centre).
    let gPMXLines = _gPMXLinesIn;
    if (!gPMXLines) {
        const HT = 0.016; // normalised half-thickness ≈ lw/hH for a typical chord
        // prettier-ignore
        const XLINES = [
            [-1.000, -0.500, -0.494, -0.011],
            [-1.000,  0.500, -0.494, -0.011],
            [ 1.000, -0.500,  0.476, -0.011],
            [ 1.000,  0.500,  0.476, -0.011],
            [-0.480,  1.000, -0.012,  0.257],
            [ 0.500,  1.000, -0.012,  0.257],
            [ 0.480, -1.000,  0.000, -0.276],
            [-0.480, -1.000, -0.006, -0.276],
        ];
        const pos = new Float32Array(XLINES.length * 4 * 3);
        const idx = new Uint16Array(XLINES.length * 6);
        for (let i = 0; i < XLINES.length; i++) {
            const [xa, ya, xb, yb] = XLINES[i];
            const dx = xb - xa, dy = yb - ya;
            const il = 1 / Math.sqrt(dx * dx + dy * dy);
            const nx = -dy * il, ny = dx * il;
            const vi = i * 12, ii = i * 6, vb = i * 4;
            pos[vi+0]=xa+nx*HT; pos[vi+1]=ya+ny*HT; pos[vi+2]=0;
            pos[vi+3]=xb+nx*HT; pos[vi+4]=yb+ny*HT; pos[vi+5]=0;
            pos[vi+6]=xb-nx*HT; pos[vi+7]=yb-ny*HT; pos[vi+8]=0;
            pos[vi+9]=xa-nx*HT; pos[vi+10]=ya-ny*HT; pos[vi+11]=0;
            idx[ii+0]=vb;   idx[ii+1]=vb+1; idx[ii+2]=vb+2;
            idx[ii+3]=vb;   idx[ii+4]=vb+2; idx[ii+5]=vb+3;
        }
        gPMXLines = new T.BufferGeometry();
        gPMXLines.setAttribute('position', new T.BufferAttribute(pos, 3));
        gPMXLines.setIndex(new T.BufferAttribute(idx, 1));
    }
    // PM lines — InstancedMesh (varying color + alpha per chord). instanceColor (THREE
    // built-in) carries baseRimHex per instance; instanceAlpha carries per-chord opacity.
    let imPMXLines, _imPMXLinesMat;
    {
        const _imLinesVert = [
            'attribute float instanceAlpha;',
            'varying float vAlpha;',
            'varying vec3 vColor;',
            'void main() {',
            '    vAlpha = instanceAlpha;',
            '    #ifdef USE_INSTANCING_COLOR',
            '    vColor = instanceColor;',
            '    #else',
            '    vColor = vec3(1.0);',
            '    #endif',
            '    vec4 pos = vec4(position, 1.0);',
            '    #ifdef USE_INSTANCING',
            '    pos = instanceMatrix * pos;',
            '    #endif',
            '    gl_Position = projectionMatrix * modelViewMatrix * pos;',
            '}',
        ].join('\n');
        const _imLinesFrag = [
            'varying float vAlpha;',
            'varying vec3 vColor;',
            'void main() {',
            '    if (vAlpha <= 0.0) discard;',
            '    gl_FragColor = vec4(vColor, vAlpha);',
            '}',
        ].join('\n');
        const alphaAttr = new T.InstancedBufferAttribute(_imPMXLinesAlphaArr, 1);
        alphaAttr.setUsage(T.DynamicDrawUsage);
        gPMXLines.setAttribute('instanceAlpha', alphaAttr);
        _imPMXLinesMat = new T.ShaderMaterial({
            vertexShader: _imLinesVert, fragmentShader: _imLinesFrag,
            transparent: true, depthTest: false, depthWrite: false,
            fog: false, side: T.DoubleSide, forceSinglePass: true,
        });
        imPMXLines = new T.InstancedMesh(gPMXLines, _imPMXLinesMat, IM_STRUM_CAP);
        imPMXLines.instanceMatrix.setUsage(T.DynamicDrawUsage);
        imPMXLines.frustumCulled = false;
        imPMXLines.renderOrder = 11;
        // Eagerly initialise instanceColor so USE_INSTANCING_COLOR is defined at first compile.
        _imColor.set(1, 1, 1);
        imPMXLines.setColorAt(0, _imColor);
        imPMXLines.instanceColor.setUsage(T.DynamicDrawUsage);
        imPMXLines.count = 0;
        noteG.add(imPMXLines);
    }

    // FH X lines — same scheme, 8 segments from the FH_XLINES pattern.
    let gFHXLines = _gFHXLinesIn;
    if (!gFHXLines) {
        const HT = 0.022; // slightly wider — FH wings are shorter, need more visual weight
        // prettier-ignore
        const FH_XLINES = [
            [-0.50,  1.00, -0.28,  0.00],
            [-0.50, -1.00, -0.28,  0.00],
            [ 0.50,  1.00,  0.28,  0.00],
            [ 0.50, -1.00,  0.28,  0.00],
            [-0.15, -1.00,  0.00, -0.42],
            [ 0.15, -1.00,  0.00, -0.42],
            [ 0.15,  1.00,  0.00,  0.42],
            [-0.15,  1.00,  0.00,  0.42],
        ];
        const pos = new Float32Array(FH_XLINES.length * 4 * 3);
        const idx = new Uint16Array(FH_XLINES.length * 6);
        for (let i = 0; i < FH_XLINES.length; i++) {
            const [xa, ya, xb, yb] = FH_XLINES[i];
            const dx = xb - xa, dy = yb - ya;
            const il = 1 / Math.sqrt(dx * dx + dy * dy);
            const nx = -dy * il, ny = dx * il;
            const vi = i * 12, ii = i * 6, vb = i * 4;
            pos[vi+0]=xa+nx*HT; pos[vi+1]=ya+ny*HT; pos[vi+2]=0;
            pos[vi+3]=xb+nx*HT; pos[vi+4]=yb+ny*HT; pos[vi+5]=0;
            pos[vi+6]=xb-nx*HT; pos[vi+7]=yb-ny*HT; pos[vi+8]=0;
            pos[vi+9]=xa-nx*HT; pos[vi+10]=ya-ny*HT; pos[vi+11]=0;
            idx[ii+0]=vb;   idx[ii+1]=vb+1; idx[ii+2]=vb+2;
            idx[ii+3]=vb;   idx[ii+4]=vb+2; idx[ii+5]=vb+3;
        }
        gFHXLines = new T.BufferGeometry();
        gFHXLines.setAttribute('position', new T.BufferAttribute(pos, 3));
        gFHXLines.setIndex(new T.BufferAttribute(idx, 1));
    }
    // FH lines — InstancedMesh (varying color + alpha per chord).
    let imFHXLines, _imFHXLinesMat;
    {
        const _imLinesVert = [
            'attribute float instanceAlpha;',
            'varying float vAlpha;',
            'varying vec3 vColor;',
            'void main() {',
            '    vAlpha = instanceAlpha;',
            '    #ifdef USE_INSTANCING_COLOR',
            '    vColor = instanceColor;',
            '    #else',
            '    vColor = vec3(1.0);',
            '    #endif',
            '    vec4 pos = vec4(position, 1.0);',
            '    #ifdef USE_INSTANCING',
            '    pos = instanceMatrix * pos;',
            '    #endif',
            '    gl_Position = projectionMatrix * modelViewMatrix * pos;',
            '}',
        ].join('\n');
        const _imLinesFrag = [
            'varying float vAlpha;',
            'varying vec3 vColor;',
            'void main() {',
            '    if (vAlpha <= 0.0) discard;',
            '    gl_FragColor = vec4(vColor, vAlpha);',
            '}',
        ].join('\n');
        const alphaAttr = new T.InstancedBufferAttribute(_imFHXLinesAlphaArr, 1);
        alphaAttr.setUsage(T.DynamicDrawUsage);
        gFHXLines.setAttribute('instanceAlpha', alphaAttr);
        _imFHXLinesMat = new T.ShaderMaterial({
            vertexShader: _imLinesVert, fragmentShader: _imLinesFrag,
            transparent: true, depthTest: false, depthWrite: false,
            fog: false, side: T.DoubleSide, forceSinglePass: true,
        });
        imFHXLines = new T.InstancedMesh(gFHXLines, _imFHXLinesMat, IM_STRUM_CAP);
        imFHXLines.instanceMatrix.setUsage(T.DynamicDrawUsage);
        imFHXLines.frustumCulled = false;
        imFHXLines.renderOrder = 11;
        _imColor.set(1, 1, 1);
        imFHXLines.setColorAt(0, _imColor);
        imFHXLines.instanceColor.setUsage(T.DynamicDrawUsage);
        imFHXLines.count = 0;
        noteG.add(imFHXLines);
    }

    // Pool-based strum-indicator replacements: unlike the fixed-renderOrder IMs above, pools
    // give per-chord Z-proportional renderOrder so far chords can't overdraw nearer ones.
    // Geometry is shared with the (now empty) IMs — MeshBasicMaterial ignores their instance attributes.
    const pPMXFill = pool(noteG, () => new T.Mesh(
        gPMXFill,
        new T.MeshBasicMaterial({
            color: 0x000000, transparent: true, opacity: 1,
            depthWrite: false, depthTest: false, fog: false, side: T.DoubleSide, forceSinglePass: true,
        }),
    ));
    const pFHXFill = pool(noteG, () => new T.Mesh(
        gFHXFill,
        new T.MeshBasicMaterial({
            color: 0x000000, transparent: true, opacity: 1,
            depthWrite: false, depthTest: false, fog: false, side: T.DoubleSide, forceSinglePass: true,
        }),
    ));
    const pMuteXLines = pool(noteG, () => new T.Mesh(
        gPMXLines,
        new T.MeshBasicMaterial({
            color: 0xffffff, transparent: true, opacity: 1,
            depthWrite: false, depthTest: false, fog: false, side: T.DoubleSide, forceSinglePass: true,
        }),
    ));
    const pFHXLines = pool(noteG, () => new T.Mesh(
        gFHXLines,
        new T.MeshBasicMaterial({
            color: 0xffffff, transparent: true, opacity: 1,
            depthWrite: false, depthTest: false, fog: false, side: T.DoubleSide, forceSinglePass: true,
        }),
    ));

    const pChordLbl = pool(lblG,  () => new T.Sprite(textSprites.txtMat('', '#e8d080', true, 'chord').clone()));
    // Single shared barre material — every pool mesh references it, so _applyGlow() can
    // mutate emissiveIntensity once and every recycled/future barre mesh picks it up.
    const mBarre = new T.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.9 * glowMul, transparent: true, depthWrite: false });
    const pBarreLine  = pool(noteG, () => new T.Mesh(new T.BoxGeometry(1, 1, 1), mBarre));
    // Shared geometry — brackets can need many pooled meshes per frame, so per-mesh
    // BoxGeometry allocation would duplicate buffers and add GPU disposal work.
    let gArpBracket = _gArpBracketIn;
    if (!gArpBracket) gArpBracket = new T.BoxGeometry(1, 1, 1);
    const pArpBracket = pool(noteG, () => new T.Mesh(
        gArpBracket,
        new T.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 1.0,
            depthWrite: false,
            depthTest: false,
            fog: false,
        }),
    ));

    const pNoteFretLabel = pool(lblG, () => {
        const _nfl = new T.Sprite(textSprites.txtMat('0', FRET_LABEL_GOLD_HEX, false, 'noteFret').clone());
        _nfl.material.fog = false;
        _nfl.material.depthTest = false;
        return _nfl;
    });
    /** Teaching finger/degree labels — one pool, two get()s per note; the texture swaps per draw via material.map. */
    const pTeachMarkLbl = pool(lblG, () => {
        const _tml = new T.Sprite(textSprites.txtMat('0', '#7fd1ff', false, 'teachMark').clone());
        _tml.material.fog = false;
        _tml.material.depthTest = false;
        return _tml;
    });
    const pConnectorLine = pool(noteG, () => new T.Line(
        new T.BufferGeometry().setFromPoints([new T.Vector3(0, 0, 0), new T.Vector3(0, 1, 0)]),
        new T.LineBasicMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.5, depthTest: false }),
    ));
    const pDropLine = pool(noteG, () => new T.Line(
        new T.BufferGeometry().setFromPoints([new T.Vector3(0, 0, 0), new T.Vector3(0, 1, 0)]),
        new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }),
    ));

    return {
        chordFrameGradTex, chordFrameGradTexArp, pChordFrameFill, pChordBox,
        gPMXFill, imPMXFill, _imPMXFillMat, gFHXFill, imFHXFill, _imFHXFillMat,
        gPMXLines, imPMXLines, _imPMXLinesMat, gFHXLines, imFHXLines, _imFHXLinesMat,
        pPMXFill, pFHXFill, pMuteXLines, pFHXLines,
        pChordLbl, mBarre, pBarreLine, gArpBracket, pArpBracket,
        pNoteFretLabel, pTeachMarkLbl, pConnectorLine, pDropLine,
    };
}
