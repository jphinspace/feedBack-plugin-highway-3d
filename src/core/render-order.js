import { K, GHOST_FRET_LBL_FADE_S } from './constants.js';

export const RENDER_ORDER_LAYER_STACK = Object.freeze([
    'CHORD_FILL',
    'CHORD_STRUM_FILL',
    'CHORD_STRUM_LINE',
    'SUSTAIN_TRAIL',
    'CHORD_FRAME',
    'CHORD_EDGE_GLOW',
    'CONNECTOR_LINE',
    'FRET_COLUMN',
    'ARP_CONNECTOR_LINE',
    'NOTE_OUTLINE',
    'NOTE_CORE',
    'TECHNIQUE_MARKER',
    'BOARD_STRING',
    'BOARD_FRET_WIRE',
    'NOTE_FRET_LABEL',
    'ARP_NOTE_FRET_LABEL',
    'CHORD_FRET_LABEL',
]);
export const RENDER_ORDER_LAYER_INDEX = Object.freeze(RENDER_ORDER_LAYER_STACK.reduce(
    (indexByLayer, layerName, layerIndex) => {
        indexByLayer[layerName] = layerIndex;
        return indexByLayer;
    },
    Object.create(null)
));

export const RENDER_ORDER_AT_Z_ZERO = 700;
export const RENDER_ORDER_FAR_CLAMP = 50;

/**
 * Computes renderOrder from world depth plus a named layer.
 * Closer objects receive larger values and paint over farther objects; the
 * layer stack breaks ties at the same depth, keeping labels above note gems.
 *
 * The layer index is added as a sub-unit fraction (< 1) so the integer
 * depth bucket STRICTLY dominates: a farther object can never outrank a
 * nearer one merely because it sits on a higher layer. Adding the raw index
 * (0..N-1) directly would let the ~N-wide layer span leak across depth
 * buckets and re-introduce far-over-near bleed for notes within ~N draw
 * units of each other. Fraction granularity (1/N ≈ 0.06) stays well above
 * the 0.0001 intra-element sub-increments used at some call sites.
 */
export function renderOrderForLayerAtZ(worldZ, layerName) {
    const layerIndex = RENDER_ORDER_LAYER_INDEX[layerName];
    if (layerIndex === undefined) throw new Error(`Unknown 3D highway depth layer: ${layerName}`);
    const depthRenderOrder = Math.max(
        RENDER_ORDER_FAR_CLAMP,
        Math.round(RENDER_ORDER_AT_Z_ZERO + worldZ / K)
    );
    return depthRenderOrder + layerIndex / RENDER_ORDER_LAYER_STACK.length;
}
/**
 * Post-hit tail fade shared by ghost fret digits and 3D chord UI: full
 * opacity until (holdS − fadeS) after onset, then linear fade over fadeS;
 * canceled when `nextSoon` — for ghosts: next note within `fadeS` of `now`;
 * for chord frame: next chord onset lies in chart time [hold − fade, hold]
 * after the current chord (so fade does not run into a same-window handoff).
 * @param {number} dt chart time minus now (negative once struck)
 * @param {number} fadeS linear fade duration (default: GHOST_FRET_LBL_FADE_S)
 */
export function hwyPostHitTailFadeMul(dt, holdS, nextSoon, fadeS = GHOST_FRET_LBL_FADE_S) {
    if (nextSoon || dt >= 0) return 1;
    const gone = -dt;
    if (gone >= holdS) return 0;
    const fS = Math.min(Math.max(fadeS, 1e-6), holdS);
    const fadeStartT = Math.max(0, holdS - fS);
    if (gone < fadeStartT) return 1;
    return Math.max(0, 1 - (gone - fadeStartT) / fS);
}
