import { K, GHOST_FRET_LBL_FADE_S } from './constants.js';

/** Draw-order tiebreak layers for objects at the same world depth, back to front. */
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
/** Maps each {@link RENDER_ORDER_LAYER_STACK} name to its index. */
export const RENDER_ORDER_LAYER_INDEX = Object.freeze(RENDER_ORDER_LAYER_STACK.reduce(
    (indexByLayer, layerName, layerIndex) => {
        indexByLayer[layerName] = layerIndex;
        return indexByLayer;
    },
    Object.create(null)
));

/** Base renderOrder at world Z = 0 (the hit line). */
export const RENDER_ORDER_AT_Z_ZERO = 700;
/** Minimum renderOrder for objects far behind the hit line. */
export const RENDER_ORDER_FAR_CLAMP = 50;

/**
 * Computes a renderOrder from world depth plus a named layer: closer objects
 * paint over farther ones, and the layer stack breaks ties at equal depth.
 * The layer index is added as a fraction below 1 so depth always dominates —
 * a farther object can never outrank a nearer one just by its layer.
 * @param {number} worldZ - world-space depth
 * @param {string} layerName - one of {@link RENDER_ORDER_LAYER_STACK}
 * @returns {number} renderOrder
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
 * Post-hit opacity multiplier shared by ghost fret digits and 3D chord UI:
 * full opacity until `holdS - fadeS` after onset, then a linear fade.
 * @param {number} dt - chart time minus now (negative once struck)
 * @param {number} holdS - seconds to hold at full opacity before fading
 * @param {boolean} nextSoon - suppresses the fade for an imminent handoff
 * @param {number} [fadeS] - fade duration
 * @returns {number} opacity multiplier in [0, 1]
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
