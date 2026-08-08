import { T } from '../../core/three.js';
import {
    ACCENT_HALO_OP_FAR, ACCENT_HALO_OP_MID, ACCENT_HALO_OP_NEAR, ACCENT_RIM_BASE_EMISSIVE, NH,
    VENUE_GEM_EMISSIVE_MUL,
} from '../../core/constants.js';
import {
    DEFAULT_GEM_GRADIENTS, PALETTES, _customPalette, _darkenInt, _lightenInt,
} from '../../core/palette.js';
import { _venueSceneOverride } from '../../background/venue.js';

/**
 * Live palette/vibrancy/glow material-retint passes. All four walk the
 * same construction-time material-array set, which is why they're
 * bundled into one factory rather than split further.
 *
 * Every material array is a live getter, not a plain dep: this factory
 * must be constructed *before* `createNoteGemVisuals()` runs (its
 * `recolorGemGradients` is passed in as that factory's own
 * `_recolorGemGradients` construction dep, called once during
 * construction). At that point none of these material arrays exist yet —
 * a plain deps snapshot would capture `undefined` forever.
 */
export function createMaterialRetint({
    ctx, noteVerdictState,
    getMStr, getMGlow, getMSus, getMRimFlash, getMStrHitOutline, getMAccentOutline, getMAccentCore,
    getMAccentHaloNear, getMAccentHaloMid, getMAccentHaloFar, getProjMeshArr, getGNoteGrad,
    getMWhiteOutline, getMMissOutline, getMHitBright, getMSusOutline, getMHitSusOutline,
    getMTapChevron, getMBarre,
}) {
    let _paletteColorTmp = null;

    /**
     * Live-swaps the palette by mutating existing materials in place —
     * Three.js colors propagate to sharing meshes on the next render, no
     * rebuild. `mGlow` keeps `.color = white` with the string color only
     * in `.emissive`, preserving the glow look across a palette swap.
     * Per-string fretboard materials built in `buildBoard()` aren't
     * reachable from here — the palette listener re-runs `buildBoard()` separately.
     */
    function applyPaletteToMaterials() {
        const mStr = getMStr(), mGlow = getMGlow(), mSus = getMSus(), mRimFlash = getMRimFlash();
        const mStrHitOutline = getMStrHitOutline(), mAccentOutline = getMAccentOutline();
        const mAccentCore = getMAccentCore();
        const mAccentHaloNear = getMAccentHaloNear(), mAccentHaloMid = getMAccentHaloMid();
        const mAccentHaloFar = getMAccentHaloFar(), projMeshArr = getProjMeshArr();
        for (let s = 0; s < ctx.settings.activePalette.length; s++) {
            const c = ctx.settings.activePalette[s];
            if (mStr[s]) {
                // Gradient strings (0..5) keep a white base so gNoteGrad[s]'s per-vertex colors
                // show pure; only flat strings (6/7) take the palette color directly.
                if (s >= 6) mStr[s].color.setHex(c);
                if (mStr[s].emissive) mStr[s].emissive.setHex(c);
            }
            if (mGlow[s]) mGlow[s].emissive.setHex(c);
            if (mRimFlash[s]) {
                mRimFlash[s].color.setHex(c);
                mRimFlash[s].emissive.setHex(c);
            }
            if (mSus[s]) mSus[s].color.setHex(c);
            if (mStrHitOutline[s]) {
                mStrHitOutline[s].color.setHex(c);
                mStrHitOutline[s].emissive.setHex(c);
            }
            if (mAccentOutline[s]) {
                mAccentOutline[s].color.setHex(c);
                mAccentOutline[s].emissive.setHex(c);
            }
            if (mAccentCore[s]) mAccentCore[s].emissive.setHex(c);
            // Verdict materials use fixed colors (hit/miss), independent of the string palette.
            for (const haloArr of [mAccentHaloNear, mAccentHaloMid, mAccentHaloFar]) {
                if (haloArr[s]) haloArr[s].color.setHex(c);
            }
            if (projMeshArr && projMeshArr[s]) {
                for (const pm of projMeshArr[s]) {
                    if (pm.material) {
                        pm.material.color.setHex(c);
                        pm.material.emissive.setHex(c);
                    }
                }
            }
        }
        // Per-string gem bodies (strings 0..5) are a baked per-vertex gradient, not a flat
        // material — recolor them too so a custom palette reaches gem bodies.
        recolorGemGradients();
        // mGlow's color is a lerp between white and the palette color, so a swap must rebuild
        // it from the new endpoints. applyVibrancy() guards on mGlow not yet being allocated.
        applyVibrancy();
    }

    /**
     * Recomputes the per-vertex gem-gradient colors from the active
     * palette. Built-in palettes (and unchanged slots of a custom
     * palette) keep the hand-tuned {@link DEFAULT_GEM_GRADIENTS} stops; a
     * custom slot derives a top-highlight/bottom-shade from its base
     * color. Mutates the `color` attribute in place — no geometry churn.
     */
    function recolorGemGradients() {
        const gNoteGrad = getGNoteGrad();
        if (!T || !gNoteGrad || !gNoteGrad.length) return;
        const isCustom = (ctx.settings.activePalette === _customPalette);
        const topCol = new T.Color(), botCol = new T.Color(), tmp = new T.Color();
        const halfH = NH / 2;
        for (let s = 0; s < gNoteGrad.length; s++) {
            const g = gNoteGrad[s];
            if (!g || !g.attributes || !g.attributes.color) continue;
            const base = ctx.settings.activePalette[s];
            let topHex, botHex;
            if (isCustom && base !== PALETTES.default[s]) {
                // Match the subtle stock gem shading (bottom ~0.78 of a near-base top) so a
                // custom gem reads as flat-ish in the chosen color rather than a strong gradient.
                topHex = _lightenInt(base, 0.05);
                botHex = _darkenInt(base, 0.78);
            } else {
                const stops = DEFAULT_GEM_GRADIENTS[s];
                if (!stops) continue; // strings 6/7 have no gradient geometry
                topHex = stops[0];
                botHex = stops[1];
            }
            topCol.setHex(topHex);
            botCol.setHex(botHex);
            const pos = g.attributes.position;
            const colAttr = g.attributes.color;
            for (let i = 0; i < pos.count; i++) {
                const t = (pos.getY(i) + halfH) / (2 * halfH); // 0 bottom..1 top
                tmp.copy(botCol).lerp(topCol, t);
                colAttr.setXYZ(i, tmp.r, tmp.g, tmp.b);
            }
            colAttr.needsUpdate = true;
        }
    }

    /**
     * Vibrancy live-update: walks the same material set
     * {@link applyPaletteToMaterials} does, mutating color/opacity/
     * emissiveIntensity — no `needsUpdate` flag needed, Three.js re-reads
     * on the next render. `mGlow.emissiveIntensity` is not written here —
     * that's stomped per-frame by `updateStringHighlights()`, which reads
     * `glowMul`/`_vibrancyIdleOp` directly instead.
     */
    function applyVibrancy() {
        const mStr = getMStr(), mSus = getMSus(), mGlow = getMGlow(), mAccentCore = getMAccentCore();
        const projMeshArr = getProjMeshArr();
        const t = ctx.settings.vibrancy;
        const idleOp     = 0.4  + 0.6  * t;  // mStr / IDLE_OP source
        // Drives projMeshArr ghost-frame opacity; read by drawNote() as `_vibrancyProjOp`,
        // which layers a per-frame factor on top.
        const projIdleOp = 0.15 + 0.35 * t;
        const susOp      = 0.35 + 0.45 * t;  // mSus
        const lineGlowOp = 0.15 + 0.35 * t;  // thin Line glow layer behind each string
        for (let s = 0; s < ctx.settings.activePalette.length; s++) {
            if (mStr[s])  mStr[s].opacity  = idleOp;
            if (mSus[s])  mSus[s].opacity  = susOp;
            if (mGlow[s]) {
                // Hit-note body lerps from white (the pastel look, color via emissive only)
                // toward the palette color as vibrancy -> 1.
                if (!_paletteColorTmp && T) _paletteColorTmp = new T.Color();
                if (_paletteColorTmp) {
                    mGlow[s].color.setHex(0xffffff).lerp(_paletteColorTmp.setHex(ctx.settings.activePalette[s]), t);
                }
            }
            if (mAccentCore[s]) {
                if (!_paletteColorTmp && T) _paletteColorTmp = new T.Color();
                if (_paletteColorTmp) {
                    mAccentCore[s].color.setHex(0xffffff).lerp(_paletteColorTmp.setHex(ctx.settings.activePalette[s]), t);
                }
            }
            if (projMeshArr && projMeshArr[s]) {
                for (const pm of projMeshArr[s]) {
                    if (pm.material) pm.material.opacity = projIdleOp;
                }
            }
        }
        // ctx.board.stringLines[s].material.opacity is overwritten every frame by
        // updateStringHighlights(), which reads _vibrancyIdleOp directly — keep it in sync.
        for (let s = 0; s < ctx.board.stringLineGlows.length; s++) {
            const line = ctx.board.stringLineGlows[s];
            if (line && line.material) line.material.opacity = lineGlowOp;
        }
        ctx.settings._vibrancyIdleOp = idleOp;
        ctx.settings._vibrancyProjOp = projIdleOp;
    }

    function applyGlow() {
        const mStr = getMStr(), projMeshArr = getProjMeshArr();
        const mStrHitOutline = getMStrHitOutline(), mAccentOutline = getMAccentOutline();
        const mWhiteOutline = getMWhiteOutline(), mMissOutline = getMMissOutline();
        const mHitBright = getMHitBright(), mSusOutline = getMSusOutline();
        const mHitSusOutline = getMHitSusOutline(), mTapChevron = getMTapChevron(), mBarre = getMBarre();
        const mAccentHaloNear = getMAccentHaloNear(), mAccentHaloMid = getMAccentHaloMid();
        const mAccentHaloFar = getMAccentHaloFar();
        const g = ctx.settings.glowMul;
        for (let s = 0; s < ctx.settings.activePalette.length; s++) {
            if (mStr[s])  mStr[s].emissiveIntensity  = 0.002 * g;
            // mGlow[s].emissiveIntensity is set per-frame in update() instead.
            if (projMeshArr && projMeshArr[s]) {
                for (const pm of projMeshArr[s]) {
                    if (pm.material) pm.material.emissiveIntensity = 0.002 * g;
                }
            }
            if (mStrHitOutline[s]) mStrHitOutline[s].emissiveIntensity = 1.0 * g;
            if (mAccentOutline[s]) mAccentOutline[s].emissiveIntensity = ACCENT_RIM_BASE_EMISSIVE * g;
            // mAccentCore[].emissiveIntensity is set per-frame in update() alongside mGlow.
        }
        if (mWhiteOutline) mWhiteOutline.emissiveIntensity = 0.6 * g;
        if (mMissOutline)  mMissOutline.emissiveIntensity  = 1.2 * g;
        for (let s = 0; s < mHitBright.length; s++) {
            if (mHitBright[s]) mHitBright[s].emissiveIntensity = 4.0 * g;
        }
        if (mSusOutline)      mSusOutline.emissiveIntensity      = 0.3 * g;
        if (mHitSusOutline)   mHitSusOutline.emissiveIntensity   = 0.7 * g;
        if (mTapChevron)   mTapChevron.emissiveIntensity   = 0.9 * g;
        if (mBarre)        mBarre.emissiveIntensity        = 0.9 * g;
        for (let si = 0; si < ctx.settings.activePalette.length; si++) {
            if (mAccentHaloNear[si]) mAccentHaloNear[si].opacity = ACCENT_HALO_OP_NEAR * g;
            if (mAccentHaloMid[si]) mAccentHaloMid[si].opacity = ACCENT_HALO_OP_MID * g;
            if (mAccentHaloFar[si]) mAccentHaloFar[si].opacity = ACCENT_HALO_OP_FAR * g;
        }
    }

    /**
     * Per-frame verdict-glow apply: applies the level-driven verdict
     * brightness the note-state provider accumulated into
     * `noteVerdictState` last frame (a 1-frame lag is imperceptible),
     * then resets it for this frame's fresh capture in `note.js`'s
     * `drawNote()`. `vg = 1` when no provider alpha was seen (legacy
     * event path / note_detect off), leaving `applyGlow()`'s authored
     * brightness untouched. Only the verdict-only materials (`mHitBright`
     * + its face-fill arrays, and the hit sustain outline) are scaled —
     * never `mStrHitOutline`, the default rim for every fretted note.
     */
    function applyVerdictGlow() {
        const mHitBright = getMHitBright(), mHitSusOutline = getMHitSusOutline();
        const vg = noteVerdictState.sawAlpha ? noteVerdictState.maxAlpha : 1;
        const venueGemMul = _venueSceneOverride ? VENUE_GEM_EMISSIVE_MUL : 1;
        for (let s = 0; s < mHitBright.length; s++) {
            if (mHitBright[s]) mHitBright[s].emissiveIntensity = 4.0 * ctx.settings.glowMul * vg * venueGemMul;
        }
        if (mHitSusOutline) mHitSusOutline.emissiveIntensity = 0.7 * ctx.settings.glowMul * vg * venueGemMul;
        noteVerdictState.maxAlpha = 0;
        noteVerdictState.sawAlpha = false;
    }

    return { applyPaletteToMaterials, recolorGemGradients, applyVibrancy, applyGlow, applyVerdictGlow };
}
