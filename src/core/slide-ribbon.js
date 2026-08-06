/** Longitudinal samples for sustain-technique prism (indexed BufferGeometry). */
export const SLIDE_RIBBON_SAMPLES = 96;
/** Pre-built index buffer: `SLIDE_RIBBON_SAMPLES` × 8 tris × 3 verts. */
export const SLIDE_RIBBON_INDICES = (() => {
    const S = SLIDE_RIBBON_SAMPLES;
    const idx = new Uint16Array(S * 24);
    let o = 0;
    for (let k = 0; k < S; k++) {
        const b = k * 4;
        const nx = (k + 1) * 4;
        // Bottom (-Y outward)
        idx[o++] = b; idx[o++] = b + 1; idx[o++] = nx + 1;
        idx[o++] = b; idx[o++] = nx + 1; idx[o++] = nx;
        // Top (+Y outward)
        idx[o++] = b + 3; idx[o++] = nx + 3; idx[o++] = nx + 2;
        idx[o++] = b + 3; idx[o++] = nx + 2; idx[o++] = b + 2;
        // Left (-X outward)
        idx[o++] = b; idx[o++] = nx; idx[o++] = nx + 3;
        idx[o++] = b; idx[o++] = nx + 3; idx[o++] = b + 3;
        // Right (+X outward)
        idx[o++] = b + 1; idx[o++] = b + 2; idx[o++] = nx + 2;
        idx[o++] = b + 1; idx[o++] = nx + 2; idx[o++] = nx + 1;
    }
    return idx;
})();
// Three r170's setIndex() only wraps plain Arrays into Uint16BufferAttribute;
// typed-array input gets assigned raw onto .index, which trips WebGL's
// byteLength check. Convert once at module init so each pooled geometry
// reuses the same Array reference instead of allocating per mesh.
export const SLIDE_RIBBON_INDICES_ARR = Array.from(SLIDE_RIBBON_INDICES);
