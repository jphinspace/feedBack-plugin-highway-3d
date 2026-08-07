/**
 * Builds a W×1 RGBA gaussian DataTexture for the sustain-rail bloom effect.
 * Alpha follows exp(-0.5*(u-0.5)^2/sigma^2), peaking at 1.0 in the centre.
 * @param {object} ThreeLib - the loaded Three.js module
 * @param {number} [w] - texture width in pixels (must be a power of two)
 * @param {number} [sigma] - gaussian falloff width
 */
export function _makeGaussTex(ThreeLib, w = 128, sigma = 0.28) {
    const data = new Uint8Array(w * 4);
    for (let i = 0; i < w; i++) {
        const u = i / (w - 1);
        const d = (u - 0.5) / sigma;
        const v = Math.exp(-0.5 * d * d);
        const a = Math.round(v * 255);
        data[i * 4]     = 255;
        data[i * 4 + 1] = 255;
        data[i * 4 + 2] = 255;
        data[i * 4 + 3] = a;
    }
    const tex = new ThreeLib.DataTexture(data, w, 1, ThreeLib.RGBAFormat);
    tex.magFilter = ThreeLib.LinearFilter;
    tex.minFilter = ThreeLib.LinearFilter;
    tex.needsUpdate = true;
    return tex;
}
