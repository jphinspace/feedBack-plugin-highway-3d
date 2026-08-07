/**
 * Built-in per-string color palettes. Each has 8 entries (indices 6/7 are
 * supplementary slots for 7/8-string arrangements); index 0 is the low E
 * (thickest) string, matching the chart format's native string indexing.
 * Keep in sync with settings.html's palette-preview swatches.
 */
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

/** IDs of the built-in {@link PALETTES}. */
export const PALETTE_IDS = Object.keys(PALETTES);

/**
 * The user-defined per-string palette, active when `activePalette` is
 * `'custom'`. Mutated in place (not reassigned) so its reference identity
 * stays stable — settings-reload compares `newPalette !== activePalette` by
 * reference to decide whether a retint is needed.
 */
export const _customPalette = PALETTES.default.slice();

/** Parses a `#rgb` or `#rrggbb` hex color string to a 0xRRGGBB integer, or `null`. */
export function _h3dHexToInt(hex) {
    if (typeof hex !== 'string') return null;
    const t = hex.trim().replace(/^#/, '');
    const full = t.length === 3 ? t[0] + t[0] + t[1] + t[1] + t[2] + t[2] : t;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
    return parseInt(full, 16);
}

/** Clamps and rounds a channel value to a valid byte (0-255). */
export function _clampByteI(n) { return n < 0 ? 0 : (n > 255 ? 255 : Math.round(n)); }

/** Darkens a 0xRRGGBB color by `factor` (0 = black, 1 = unchanged). */
export function _darkenInt(hex, factor) {
    const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
    return (_clampByteI(r * factor) << 16) | (_clampByteI(g * factor) << 8) | _clampByteI(b * factor);
}

/** Lightens a 0xRRGGBB color toward white by `t` (0 = unchanged, 1 = white). */
export function _lightenInt(hex, t) {
    const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
    return (_clampByteI(r + (255 - r) * t) << 16) | (_clampByteI(g + (255 - g) * t) << 8) | _clampByteI(b + (255 - b) * t);
}

/**
 * Per-string gem gradient stops `[topHighlight, bottomShade]` for the
 * built-in palettes. A custom palette derives stops for its changed slots
 * via {@link _lightenInt}/{@link _darkenInt} instead. Strings 6/7 have no
 * entry and fall back to a flat color.
 */
export const DEFAULT_GEM_GRADIENTS = [
    [0xec0816, 0xbd0400], // 0 red
    [0xefd20b, 0xceaa00], // 1 yellow
    [0x0b93e9, 0x0e69b2], // 2 blue
    [0xf77b0b, 0xdb5808], // 3 orange
    [0x37c40b, 0x139305], // 4 green
    [0xaf10db, 0x8907af], // 5 violet
];

/** The default palette, for consumers that need a fixed reference length. */
export const S_COL = PALETTES.default;
