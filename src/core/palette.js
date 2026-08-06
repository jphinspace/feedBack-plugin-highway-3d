// Per-string color palettes: the built-in presets, the user-customizable
// palette, and the hex-math helpers that derive custom gem gradients from a
// chosen base color.
//
// `_customPalette` is exported as `const` but its CONTENTS are mutated
// in place (see settings/store.js's palette-resolution path, still in
// src/main.js as of this module's extraction) so the array's identity never
// changes. That identity stability is load-bearing: a settings-reload path
// compares `newPalette !== activePalette` to decide whether a retint is
// needed, and a content signature (`backgroundPaletteSig`) drives the actual
// re-tint on custom edits. Replacing this with a freshly-allocated array on
// every settings load would silently break live custom-palette editing.

// Selectable per-string color palettes (issue #10). Each palette has
// 8 entries to match MAX_RENDER_STRINGS so 6/7/8-string arrangements
// all index safely. Default is the canonical chart-format classic
// mapping (low E=red, A=yellow, D=blue, G=orange, B=green,
// high E=purple); Neon pushes saturation harder; Pastel desaturates
// for long-session comfort; Colorblind (high contrast) is derived from
// the chart format's built-in colorblind-mode palette, but this preset
// intentionally keeps some entries tuned for feedBack rather than
// reproducing every original hex value verbatim. The chart-format base
// values came from community reverse-engineering of the original chart
// files; do not treat the tuned values below as the exact original
// palette.
// In feedBack's index convention s=0 is the low E (thickest) and
// s=5 is the high E (thinnest), matching the chart format's native string
// indexing. Per-index ordering is preserved across all palettes so
// switching between them never reassigns a string to a different
// colour family. Indices 6/7 are supplementary slots used for
// 7/8-string arrangements.
// NOTE: settings.html mirrors these arrays in its hydration script
// for the palette-preview swatches — keep them in sync.
export const PALETTES = {
    default: [
        0xe61f26, 0xecd234, 0x1096e6, 0xf18313,
        0x3fc413, 0xb518d9, 0xff6bd5, 0x6bffe6,
    ],
    neon: [
        0xff0030, 0xffe800, 0x0080ff, 0xff8030,
        0x40ff50, 0xb050ff, 0xff40d0, 0x40ffd0,
    ],
    pastel: [
        0xe89aa0, 0xefdf90, 0x9adfee, 0xefb898,
        0xa6e0a8, 0xc4a6e0, 0xe0a6c8, 0xa6e0d8,
    ],
    colorblind_hc: [
        0xa42424, 0xa3f300, 0x19abfc, 0xda7e41,
        0x30d0a0, 0x7648a7, 0xff6bd5, 0x6bffe6,
    ],
};
export const PALETTE_IDS = Object.keys(PALETTES);
// User-defined per-string colors (core "Highway String Colors" theming).
// Persisted as a JSON hex array under the bg setting key 'customColors';
// when the active palette id is 'custom' the renderer resolves this into
// numeric hex, falling back to the default palette per missing index.
// Mutated in place by _resolveCustomPalette so the reference stays stable.
export const _customPalette = PALETTES.default.slice();
export function _h3dHexToInt(hex) {
    if (typeof hex !== 'string') return null;
    const t = hex.trim().replace(/^#/, '');
    const full = t.length === 3 ? t[0] + t[0] + t[1] + t[1] + t[2] + t[2] : t;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
    return parseInt(full, 16);
}
// Numeric (0xRRGGBB) darken/lighten — used to derive the gem-gradient
// top-highlight / bottom-shade stops from a custom per-string base color
// so the note bodies follow the custom palette (mirrors the 2D highway's
// dim/bright derivation). factor 0..1 keeps that fraction of each channel;
// lighten mixes t toward white.
export function _clampByteI(n) { return n < 0 ? 0 : (n > 255 ? 255 : Math.round(n)); }
export function _darkenInt(hex, factor) {
    const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
    return (_clampByteI(r * factor) << 16) | (_clampByteI(g * factor) << 8) | _clampByteI(b * factor);
}
export function _lightenInt(hex, t) {
    const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
    return (_clampByteI(r + (255 - r) * t) << 16) | (_clampByteI(g + (255 - g) * t) << 8) | _clampByteI(b + (255 - b) * t);
}
// Default per-string gem gradient stops [topHighlight, bottomShade] —
// sampled from the original colour PNGs. Used verbatim for the built-in
// palettes (and for unchanged slots of a custom palette) so the stock look
// is byte-for-byte preserved; custom slots derive their stops from the
// chosen base color via _lightenInt/_darkenInt. Strings 6/7 have no entry
// and fall back to flat gNote.
export const DEFAULT_GEM_GRADIENTS = [
    [0xec0816, 0xbd0400], // 0 red
    [0xefd20b, 0xceaa00], // 1 yellow
    [0x0b93e9, 0x0e69b2], // 2 blue
    [0xf77b0b, 0xdb5808], // 3 orange
    [0x37c40b, 0x139305], // 4 green
    [0xaf10db, 0x8907af], // 5 violet
];
// Default palette at module scope so out-of-IIFE consumers (e.g. the
// out-of-range warning's reference to "palette size") still have a
// canonical length to compare against.
export const S_COL = PALETTES.default;
