// Build a horizontal gaussian DataTexture for the sustain-rail bloom effect.
// Returns a W×1 RGBA texture where alpha follows exp(-0.5*(u−0.5)²/σ²),
// peaking at 1.0 in the centre. With the default σ=0.28 the edges retain
// ~0.20 alpha (not fully transparent) — a deliberately soft, wide falloff
// so the additive bloom fades gradually rather than cutting off sharply.
// Power-of-two width keeps WebGL mipmapping happy.
//
// Takes the Three.js module as a parameter rather than importing `T` from
// ./three.js — this function is called during scene setup, well after
// loadThree() has resolved, so it doesn't need the live-binding indirection;
// passing it explicitly also keeps this module trivially unit-testable with
// a plain stub instead of a real Three.js instance.
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
    // LinearFilter on both axes so the bloom plane interpolates smoothly
    // when scaled — the default NearestFilter causes visible banding.
    tex.magFilter = ThreeLib.LinearFilter;
    tex.minFilter = ThreeLib.LinearFilter;
    tex.needsUpdate = true;
    return tex;
}
