import { T } from '../../core/three.js';
import {
    ACCENT_HALO_OP_FAR, ACCENT_HALO_OP_MID, ACCENT_HALO_OP_NEAR, ACCENT_RIM_BASE_EMISSIVE, NH,
    VENUE_GEM_EMISSIVE_MUL,
} from '../../core/constants.js';
import {
    DEFAULT_GEM_GRADIENTS, PALETTES, _customPalette, _darkenInt, _lightenInt,
} from '../../core/palette.js';
import { _venueSceneOverride } from '../../background/venue.js';

// Live palette/vibrancy/glow material-retint passes -- moved verbatim out
// of main.js (Stage 7, post-3e). All four walk the same construction-time
// material-array set (mStr/mGlow/mSus/mRimFlash/mStrHitOutline/
// mAccentOutline/mAccentCore/mAccentHaloNear/Mid/Far/projMeshArr/
// gNoteGrad/mWhiteOutline/mMissOutline/mHitBright/mSusOutline/
// mHitSusOutline/mTapChevron/mBarre), which is exactly why they're
// bundled into one file/one factory rather than split further -- every
// one of these deps is shared across at least two of the four functions.
//
// EVERY material array is a LIVE GETTER, not a plain dep -- this factory
// must be constructed BEFORE createNoteGemVisuals() runs (main.js passes
// this module's recolorGemGradients function to createNoteGemVisuals as
// its own `_recolorGemGradients` dep, exactly like the pre-move code
// passed the bare closure function -- createNoteGemVisuals calls it once
// during construction, see that file's own doc comment for why a stale
// snapshot there is intentional/harmless). At that point in initScene(),
// NONE of these material arrays have been assigned yet (they're all
// outputs of that same createNoteGemVisuals() destructure or a later
// one) -- a plain deps snapshot would capture `undefined` forever. Same
// hazard class as note.js's `_fretLabelAllowed` trap documented in
// CLAUDE.md.
//
// _paletteColorTmp (a lazily-created scratch T.Color) was used nowhere
// else in main.js -- moved to be private state of this module
// (own-it-outright); its `= null` reset in teardown() is no longer
// needed since the whole module is reconstructed fresh on the next
// initScene() call anyway (same as hit-sparks.js's private arrays).
export function createMaterialRetint({
    ctx, noteVerdictState,
    getMStr, getMGlow, getMSus, getMRimFlash, getMStrHitOutline, getMAccentOutline, getMAccentCore,
    getMAccentHaloNear, getMAccentHaloMid, getMAccentHaloFar, getProjMeshArr, getGNoteGrad,
    getMWhiteOutline, getMMissOutline, getMHitBright, getMSusOutline, getMHitSusOutline,
    getMTapChevron, getMBarre,
}) {
    let _paletteColorTmp = null;

    // Live-swap palette by mutating existing materials in place.
    // Three.js colors propagate to all sharing meshes on the next
    // render — no rebuild, no GC. The mGlow material was authored
    // with .color = white and the per-string color in .emissive
    // only; we preserve that here so the glow look stays consistent
    // before/after a palette swap rather than tinting the diffuse
    // white. Lane lines and drop lines that read
    // activePalette[s] per frame pick up automatically. Per-string
    // fretboard materials built inside buildBoard() are independent
    // and aren't reachable from here — buildBoard re-runs from the
    // palette listener to regenerate them with the new colors.
    //
    // projMeshArr holds filled rim meshes (ExtrudeGeometry frame); centre
    // is open. Palette + vibrancy mutate each mesh's material like mStr.
    function applyPaletteToMaterials() {
        const mStr = getMStr(), mGlow = getMGlow(), mSus = getMSus(), mRimFlash = getMRimFlash();
        const mStrHitOutline = getMStrHitOutline(), mAccentOutline = getMAccentOutline();
        const mAccentCore = getMAccentCore();
        const mAccentHaloNear = getMAccentHaloNear(), mAccentHaloMid = getMAccentHaloMid();
        const mAccentHaloFar = getMAccentHaloFar(), projMeshArr = getProjMeshArr();
        for (let s = 0; s < ctx.settings.activePalette.length; s++) {
            const c = ctx.settings.activePalette[s];
            if (mStr[s]) {
                // Gradient strings (0..5) keep a white base so the per-vertex
                // colours in gNoteGrad[s] show pure; only flat strings (6/7)
                // take the palette colour. mStr is MeshBasicMaterial (no
                // emissive) — guard the legacy emissive retint.
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
            // Verdict materials use fixed colours (0x22ff88 hit, 0xff0066 miss)
            // that are independent of the string palette — no retint needed.
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
        // Per-string gem bodies (strings 0..5) are a baked per-vertex
        // gradient (gNoteGrad), not a flat material — recolor them too so a
        // custom palette reaches the note/sustain/vibrato gem bodies.
        recolorGemGradients();
        // Re-apply vibrancy: mGlow's color is a lerp between white and
        // the palette colour, so a palette swap must rebuild that
        // lerp from the new endpoints. Skipped pre-init when mGlow
        // isn't allocated yet — applyVibrancy() guards on that.
        applyVibrancy();
    }

    // Recompute the per-vertex gem-gradient colors from the active palette.
    // Built-in palettes (and unchanged slots of a custom palette) keep the
    // hand-tuned DEFAULT_GEM_GRADIENTS stops so the stock look is preserved;
    // a custom slot derives a top-highlight / bottom-shade from its base
    // color. Mutates the existing 'color' attribute in place (no geometry
    // churn, pooled note meshes pick it up next frame).
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
                // Match the SUBTLE stock gem shading (bottom ≈ 0.78 of a
                // near-base top), so a custom gem reads as a flat-ish gem
                // in the chosen color rather than a strong gradient.
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

    // Vibrancy + glow live-update helpers. Both walk the same
    // material set applyPaletteToMaterials walks (plus the static
    // outline / technique materials) and mutate uniform-backed
    // properties — colour, opacity, emissiveIntensity. No
    // material.needsUpdate flag is needed for these; Three.js
    // re-reads them on the next render call. mGlow.emissiveIntensity
    // and BASE_GLOW/MAX_GLOW/IDLE_OP are NOT written here — those
    // are stomped per-frame inside updateStringHighlights() and the
    // anticipation loop in update(), so they read glowMul /
    // _vibrancyIdleOp / vibrancy directly each frame instead.
    function applyVibrancy() {
        const mStr = getMStr(), mSus = getMSus(), mGlow = getMGlow(), mAccentCore = getMAccentCore();
        const projMeshArr = getProjMeshArr();
        const t = ctx.settings.vibrancy;
        const idleOp     = 0.4  + 0.6  * t;  // mStr / IDLE_OP source
        // projIdleOp drives the projMeshArr ghost-frame opacity and is
        // read by drawNote() as `_vibrancyProjOp`, which layers a
        // per-frame factor on top.
        const projIdleOp = 0.15 + 0.35 * t;
        const susOp      = 0.35 + 0.45 * t;  // mSus
        const lineGlowOp = 0.15 + 0.35 * t;  // thin Line glow layer behind each string
        for (let s = 0; s < ctx.settings.activePalette.length; s++) {
            if (mStr[s])  mStr[s].opacity  = idleOp;
            if (mSus[s])  mSus[s].opacity  = susOp;
            if (mGlow[s]) {
                // Hit-note body lerps from white (current pastel
                // look — colour comes through the emissive only)
                // toward the palette colour as vibrancy → 1, so at
                // vibrancy=1 the white-wash on hit notes goes away.
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
        // ctx.board.stringLines[s].material.opacity is overwritten by
        // updateStringHighlights() every frame, so the closed-form
        // value would be stomped. updateStringHighlights() reads
        // _vibrancyIdleOp directly instead — keep that in sync.
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
            // mGlow[s].emissiveIntensity is per-frame in update();
            // see Phase 4 comment block.
            if (projMeshArr && projMeshArr[s]) {
                for (const pm of projMeshArr[s]) {
                    if (pm.material) pm.material.emissiveIntensity = 0.002 * g;
                }
            }
            if (mStrHitOutline[s]) mStrHitOutline[s].emissiveIntensity = 1.0 * g;
            if (mAccentOutline[s]) mAccentOutline[s].emissiveIntensity = ACCENT_RIM_BASE_EMISSIVE * g;
            // mAccentCore[].emissiveIntensity is per-frame in update()
            // alongside mGlow (accent fill boost).
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

    // Per-frame verdict-glow apply -- moved verbatim out of update() (Stage
    // 7, post-3e). Applies the level-driven verdict brightness the note-
    // state provider accumulated into noteVerdictState LAST frame (a
    // 1-frame lag is imperceptible), then resets it for this frame's fresh
    // capture in the gem path (note.js's drawNote()). vg = 1 when no
    // provider alpha was seen (legacy event path / note_detect off),
    // leaving the authored 4.0/0.7 x glowMul brightness from applyGlow()
    // untouched. Only the verdict-only materials (mHitBright + its
    // face-fill arrays, and the hit sustain outline) are scaled -- never
    // mStrHitOutline, which is the default rim for every fretted note.
    // Fits here rather than a new file because it walks the same
    // mHitBright/mHitSusOutline getters applyGlow() already has.
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
