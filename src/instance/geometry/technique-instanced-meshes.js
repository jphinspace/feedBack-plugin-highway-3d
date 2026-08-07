import { T } from '../../core/three.js';

// Shared InstancedMesh scratch objects + the palm-mute/fret-hand-mute "X"
// technique-marker InstancedMeshes -- moved verbatim out of initScene()
// (Stage 7 Track B / 3-ctx-3). Construction-time only, no `ctx` needed:
// everything here is only ever reassigned inside initScene()/teardown()
// (verified via whole-file bare-reassignment grep). `gTechPlane` comes from
// sustain-rail.js's createSustainRailVisuals(), built earlier in the same
// initScene() call -- injected as a dep rather than imported, since it's a
// per-instance Three.js resource, not a pure value.
export function createTechniqueInstancedMeshes({ noteG, gTechPlane, textSprites, IM_TECH_CAP, _imPMTechAlphaArr, _imFHTechAlphaArr }) {
    // ── InstancedMesh temporaries ──────────────────────────────────────
    const _imM4    = new T.Matrix4();
    const _imPos   = new T.Vector3();
    const _imSca   = new T.Vector3();
    const _imQ     = new T.Quaternion();
    const _imAZ    = new T.Vector3(0, 0, 1);
    const _imColor = new T.Color();

    // ── Shared ShaderMaterial templates ───────────────────────────────
    // Vertex shader used by PM-X and FH-X on individual note gems.
    // Three.js injects `USE_INSTANCING` + `instanceMatrix` attribute
    // into the prefix when an InstancedMesh uses a ShaderMaterial.
    const _imTechVert = [
        'attribute float instanceAlpha;',
        'varying float vAlpha;',
        'varying vec2 vUv;',
        'void main() {',
        '    vUv = uv;',
        '    vAlpha = instanceAlpha;',
        '    vec4 pos = vec4(position, 1.0);',
        '    #ifdef USE_INSTANCING',
        '    pos = instanceMatrix * pos;',
        '    #endif',
        '    gl_Position = projectionMatrix * modelViewMatrix * pos;',
        '}',
    ].join('\n');
    const _imTechFrag = [
        'uniform sampler2D map;',
        'varying float vAlpha;',
        'varying vec2 vUv;',
        'void main() {',
        '    vec4 t = texture2D(map, vUv);',
        '    if (t.a * vAlpha < 0.01) discard;',
        '    gl_FragColor = vec4(t.rgb, t.a * vAlpha);',
        '}',
    ].join('\n');

    // ── PM / FH tech marker InstancedMeshes ───────────────────────────
    // Each IM gets a geometry clone so instanceAlpha is a separate buffer.
    const _mkTechIM = (spriteMat, alphaArr) => {
        const geo = gTechPlane.clone();
        const alphaAttr = new T.InstancedBufferAttribute(alphaArr, 1);
        alphaAttr.setUsage(T.DynamicDrawUsage);
        geo.setAttribute('instanceAlpha', alphaAttr);
        const mat = new T.ShaderMaterial({
            uniforms: { map: { value: spriteMat.map } },
            vertexShader: _imTechVert,
            fragmentShader: _imTechFrag,
            transparent: true, depthTest: false, depthWrite: false, side: T.DoubleSide, forceSinglePass: true,
        });
        const im = new T.InstancedMesh(geo, mat, IM_TECH_CAP);
        im.instanceMatrix.setUsage(T.DynamicDrawUsage);
        im.frustumCulled = false;
        im.count = 0;
        noteG.add(im);
        return { im, geo, mat };
    };
    let imPMTech, _imGPMTech, _imPMTechMat, imFHTech, _imGFHTech, _imFHTechMat;
    { const r = _mkTechIM(textSprites.palmMuteXSpriteMat(),    _imPMTechAlphaArr);
      imPMTech = r.im; _imGPMTech = r.geo; _imPMTechMat = r.mat; imPMTech.renderOrder = 702; }
    { const r = _mkTechIM(textSprites.fretHandMuteXSpriteMat(), _imFHTechAlphaArr);
      imFHTech = r.im; _imGFHTech = r.geo; _imFHTechMat = r.mat; imFHTech.renderOrder = 700; }

    return {
        _imM4, _imPos, _imSca, _imQ, _imAZ, _imColor,
        imPMTech, _imGPMTech, _imPMTechMat, imFHTech, _imGFHTech, _imFHTechMat,
    };
}
