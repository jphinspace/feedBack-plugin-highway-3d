import { T } from '../../core/three.js';

// Text-sprite / icon-sprite materials rasterised onto a shared canvas and
// cached by key. Two independent caches live here:
//   - the `txtCache` family (txtMat + the icon variants that also write into
//     it: pinchHarmonicMat, naturalHarmonicMat, muteXMat) — string-keyed,
//     cache-keyed by (style, text, color, wide).
//   - _techMatCache (triMat / bendChevronMat / slideArrowMat) lives in
//     ./tech-materials.js — a separate, NUMBER-keyed cache (hot-path calls
//     from drawNote can't afford a string-concat cache key per call).
//
// TXT_STYLES is a pure preset table, identical for every renderer instance,
// so it's a plain module-level export. The cache itself must NOT be — it is
// per-instance (CLAUDE.md pitfall #2/#14): a module-level singleton would have
// every splitscreen panel's labels overwriting each other's cache entries.
// createTextSpriteCache() is called once per renderer instance; the returned
// bound functions close over that instance's cache, so every existing call
// site (`txtMat(...)`, now `textSprites.txtMat(...)`) is otherwise unchanged.

// ── Text-sprite style presets ─────────────────────────────────────
// Each preset describes how a class of label is rasterised.
// Tweak per-class look here (font, outline color/width, source
// canvas size). `wide` toggles a long aspect ratio for multi-char
// labels (chord/section names, "↑1/2", "~~~").
//
// Knobs:
//   font        — full CSS font shorthand (weight + size + family)
//   wideFont    — same, used when caller passes wide=true
//   srcH        — source-canvas height in px (square; wide=4×).
//                 Keep power-of-two so WebGL1 / Three.js retain
//                 mipmaps + linear-mip-linear filtering — NPOT
//                 textures silently fall back to no-mipmap and
//                 shimmer at distance.
//   stroke      — outline color (null = no outline)
//   strokeW     — outline line-width in source-canvas px
//   shadow      — { color, blur, dx, dy } or null
export const TXT_STYLES = {
    // The two fret-number sets the user wants to pop hardest.
    fretRow: {
        font:     '900 160px "Arial Black", "Helvetica Neue", Arial, sans-serif',
        wideFont: '900 128px "Arial Black", "Helvetica Neue", Arial, sans-serif',
        srcH: 256, stroke: '#0a1018', strokeW: 18,
        shadow: { color: 'rgba(0,0,0,0.7)', blur: 14, dx: 0, dy: 0 },
    },
    noteFret: {
        font:     '900 160px "Arial Black", "Helvetica Neue", Arial, sans-serif',
        wideFont: '900 128px "Arial Black", "Helvetica Neue", Arial, sans-serif',
        srcH: 256, stroke: '#0a1018', strokeW: 18,
        shadow: { color: 'rgba(0,0,0,0.7)', blur: 14, dx: 0, dy: 0 },
    },
    // Ghost-fret labels on the board projection: same weight/size/outline
    // as noteFret, but uses textAlign='center'; textBaseline='middle'
    // (the standard branch in txtMat) so the glyph is truly centred on
    // the PlaneGeometry UV. inkCenterFret's actualBoundingBox path is
    // intentionally NOT activated for this style — that path was designed
    // for Sprites and shifts the canvas origin, which causes visible
    // lower-left drift on Mesh + MeshBasicMaterial (UV-direct mapping).
    ghostFret: {
        font:     '900 160px "Arial Black", "Helvetica Neue", Arial, sans-serif',
        wideFont: '900 128px "Arial Black", "Helvetica Neue", Arial, sans-serif',
        srcH: 256, stroke: '#0a1018', strokeW: 18,
        shadow: { color: 'rgba(0,0,0,0.7)', blur: 14, dx: 0, dy: 0 },
    },
    // Chord names — gold script-style label, lighter outline keeps
    // the colour readable.
    chord: {
        font:     'bold 80px sans-serif',
        wideFont: 'bold 64px sans-serif',
        srcH: 128, stroke: '#0a1018', strokeW: 6, shadow: null,
    },
    // Section banners ("Verse", "Chorus") — same as chord weight.
    section: {
        font:     'bold 80px sans-serif',
        wideFont: 'bold 64px sans-serif',
        srcH: 128, stroke: '#0a1018', strokeW: 6, shadow: null,
    },
    // Technique markers (pinch-harmonic icon, PM, AC, H/P/T, etc.).
    technique: {
        font:     'bold 80px sans-serif',
        wideFont: 'bold 64px sans-serif',
        srcH: 128, stroke: '#0a1018', strokeW: 6, shadow: null,
    },
    // Open-string "0" label on the note body itself.
    open: {
        font:     'bold 80px sans-serif',
        wideFont: 'bold 64px sans-serif',
        srcH: 128, stroke: '#0a1018', strokeW: 6, shadow: null,
    },
};

export function createTextSpriteCache() {
    const txtCache = {};

    function txtMat(text, col, wide, style) {
        const sName = style || 'technique';
        const k = sName + '|' + (wide ? 'W' : '') + text + '|' + col;
        if (txtCache[k]) return txtCache[k];
        const sp = TXT_STYLES[sName] || TXT_STYLES.technique;
        const h  = sp.srcH;
        const str = String(text);
        const font = wide ? sp.wideFont : sp.font;

        let w = wide ? h * 4 : h;

        if (!wide && sName === 'noteFret') {
            // Wide labels (D#2, Bb3) need a canvas wider than srcH; cap so
            // glyphs stay centred at (w/2, h/2) without edge clipping.
            const probe = document.createElement('canvas').getContext('2d');
            probe.font = font;
            const tw = probe.measureText(str).width;
            let pad = 0;
            if (sp.stroke && sp.strokeW > 0) pad += sp.strokeW * 2;
            if (sp.shadow) {
                pad += Math.abs(sp.shadow.dx) + sp.shadow.blur * 2;
            }
            w = Math.min(12 * h, Math.max(h, Math.ceil(tw + pad)));
        }

        const c  = document.createElement('canvas');
        c.width = w; c.height = h;
        const x = c.getContext('2d');
        x.font = font;
        // Fret / open-string digits: anchor from actualBoundingBox so the
        // glyph sits at the true optical centre of the canvas (fixes
        // sprites looking off-centre inside the board ghost and elsewhere).
        const inkCenterFret = !wide && (sName === 'noteFret' || sName === 'open');
        // Ghost fret labels live on a PlaneGeometry Mesh (UV-direct), not a Sprite
        // billboard.  Sprites tolerate slight canvas off-centering because Three.js
        // centres them at their world position; a Mesh does not — the digit lands
        // wherever it sits in UV space.  Use the advance-width centre as the initial
        // pen position and then correct for any ink asymmetry via actualBoundingBox.
        const inkCenterGhost = !wide && sName === 'ghostFret';
        let drawX = w / 2;
        let drawY = h / 2;
        if (inkCenterFret) {
            x.textAlign = 'left';
            x.textBaseline = 'alphabetic';
            const m = x.measureText(str);
            const L = m.actualBoundingBoxLeft;
            const R = m.actualBoundingBoxRight;
            const A = m.actualBoundingBoxAscent;
            const D = m.actualBoundingBoxDescent;
            if (
                L != null && R != null && A != null && D != null &&
                Number.isFinite(L) && Number.isFinite(R) &&
                Number.isFinite(A) && Number.isFinite(D)
            ) {
                const inkW = R - L;
                drawX = (w - inkW) / 2 - L;
                drawY = (h + A - D) / 2;
                // Tab digits sit visually a hair low vs bbox (stroke/shadow);
                // small canvas nudge keeps sprites centred on the board ghost.
                if (sName === 'noteFret') drawY -= h * 0.028;
            } else {
                x.textAlign = 'center';
                x.textBaseline = 'middle';
                drawX = w / 2;
                drawY = h / 2;
            }
        } else if (inkCenterGhost) {
            // Alpha-weighted centroid approach on FILL-ONLY ink (no shadow, no
            // stroke) to find the true ink centre of mass without contamination
            // from the isotropic shadow blur.  For Arial Black "1" the shadow from
            // the thin upper-left flag bleeds leftward and cancels part of the
            // rightward correction when we include it in the scan.  Measuring fill
            // alone isolates the actual glyph shape.
            // 1. Draw fill-only (no shadow, no stroke) at (w/2, h/2) on temp canvas.
            // 2. Compute Σ(px·alpha) / Σ(alpha) → ink centroid.
            // 3. Shift drawX/drawY so centroid lands exactly at (w/2, h/2).
            // Max 4 unique digits (1–4) → cache-miss runs at most 4 times ever.
            x.textAlign = 'center';
            x.textBaseline = 'middle';
            try {
                const tmpC = document.createElement('canvas');
                tmpC.width = w; tmpC.height = h;
                const tc = tmpC.getContext('2d');
                tc.font = font;
                tc.textAlign = 'center';
                tc.textBaseline = 'middle';
                // Deliberately NO shadow and NO stroke — shadow spreads isotropically
                // and muddles the centroid; fill alone gives the cleanest reading.
                tc.fillStyle = '#ffffff';
                tc.fillText(str, w / 2, h / 2);
                const id = tc.getImageData(0, 0, w, h).data;
                // Alpha-weighted centroid — heavier ink pixels (thick vertical stem
                // of "1") outweigh thin/sparse pixels (diagonal flag), producing the
                // correct perceptual centre rather than the geometric bbox midpoint.
                let sumX = 0, sumY = 0, sumA = 0;
                for (let py = 0; py < h; py++) {
                    for (let px = 0; px < w; px++) {
                        const a = id[(py * w + px) * 4 + 3];
                        if (a > 4) { sumX += px * a; sumY += py * a; sumA += a; }
                    }
                }
                if (sumA > 0) {
                    // shift pen so centroid → canvas centre, then add a small
                    // extra rightward nudge (8 %) so the vertical stroke of
                    // narrow digits like "1" sits visually at gem centre rather
                    // than the advance-width centre (which may be slightly left
                    // of the dominant ink mass for Arial Black numerals).
                    drawX = w / 2 + (w / 2 - sumX / sumA) + w * 0.08;
                    drawY = h / 2 + (h / 2 - sumY / sumA);
                }
            } catch (_) { /* fallback: draw at (w/2, h/2) */ }
            // x (real canvas) still has textAlign='center'; textBaseline='middle'
        } else {
            x.textAlign = 'center';
            x.textBaseline = 'middle';
        }
        if (sp.shadow) {
            x.shadowColor   = sp.shadow.color;
            x.shadowBlur    = sp.shadow.blur;
            x.shadowOffsetX = sp.shadow.dx;
            x.shadowOffsetY = sp.shadow.dy;
        }
        if (sp.stroke && sp.strokeW > 0) {
            x.lineJoin    = 'round';
            x.miterLimit  = 2;
            x.strokeStyle = sp.stroke;
            x.lineWidth   = sp.strokeW;
            x.strokeText(str, drawX, drawY);
        }
        x.fillStyle = col;
        x.fillText(str, drawX, drawY);
        const mat = new T.SpriteMaterial({
            map: new T.CanvasTexture(c),
            transparent: true,
            // depthTest:false means later geometry never *fails* depth
            // against these sprites, but without depthWrite:false the
            // sprites still write to the depth buffer (Three.js default
            // is depthWrite:true even for SpriteMaterial). That can
            // make subsequent sprites/labels vanish — match the
            // pattern used by the other sprite materials in this file.
            depthTest: false,
            depthWrite: false,
        });
        txtCache[k] = mat;
        return mat;
    }

    function pinchHarmonicMat(col) {
        const baseCol = new T.Color(col != null ? col : '#ffd84d');
        // v5 — compact concentric ellipses:
        //   1. black outer border  rx=0.430h ry=0.255h
        //   2. string-color body   rx=0.418h ry=0.232h
        //   3. black inner ring    rx=0.407h ry=0.218h
        //   4. string-color inner  rx=0.264h ry=0.218h
        //   5. black center dot    rx=0.134h ry=0.120h
        const k = 'technique|pinchHarmonicIcon|rs2014-v5b|' + baseCol.getHexString();
        if (txtCache[k]) return txtCache[k];

        const h = 512;
        const c = document.createElement('canvas');
        c.width = h; c.height = h;
        const x = c.getContext('2d');
        const TAU = Math.PI * 2;
        const colStr = `rgb(${Math.round(baseCol.r * 255)},${Math.round(baseCol.g * 255)},${Math.round(baseCol.b * 255)})`;

        x.clearRect(0, 0, h, h);
        x.save();
        x.translate(h / 2, h / 2);

        // Form 1 — black outer border
        x.fillStyle = '#000000';
        x.beginPath(); x.ellipse(0, 0, h * 0.430, h * 0.255, 0, 0, TAU); x.fill();

        // Form 2 — string-color main body
        x.fillStyle = colStr;
        x.beginPath(); x.ellipse(0, 0, h * 0.418, h * 0.232, 0, 0, TAU); x.fill();

        // Form 3 — black inner ring
        x.fillStyle = '#000000';
        x.beginPath(); x.ellipse(0, 0, h * 0.407, h * 0.218, 0, 0, TAU); x.fill();

        // Form 4 — string-color inner spot (narrower)
        x.fillStyle = colStr;
        x.beginPath(); x.ellipse(0, 0, h * 0.2637, h * 0.218, 0, 0, TAU); x.fill();

        // Form 5 — black center dot
        x.fillStyle = '#000000';
        x.beginPath(); x.ellipse(0, 0, h * 0.134, h * 0.120, 0, 0, TAU); x.fill();

        x.restore();

        const mat = new T.SpriteMaterial({
            map: new T.CanvasTexture(c),
            transparent: true,
            depthTest: false,
            depthWrite: false,
        });
        txtCache[k] = mat;
        return mat;
    }

    function naturalHarmonicMat() {
        const k = 'technique|naturalHarmonicIcon|pink-ring-v3';
        if (txtCache[k]) return txtCache[k];

        const h = 256;
        const c = document.createElement('canvas');
        c.width = h; c.height = h;
        const x = c.getContext('2d');
        const cx = h / 2;
        const cy = h / 2;
        const TAU = Math.PI * 2;

        x.clearRect(0, 0, h, h);

        const glow = x.createRadialGradient(cx, cy, h * 0.03, cx, cy, h * 0.47);
        glow.addColorStop(0, 'rgba(255,170,255,0.14)');
        glow.addColorStop(0.55, 'rgba(0,0,0,0.22)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = glow;
        x.beginPath();
        x.arc(cx, cy, h * 0.44, 0, TAU);
        x.fill();

        x.shadowColor = 'rgba(0,0,0,0.85)';
        x.shadowBlur = 14;
        x.fillStyle = 'rgba(255, 255, 255, 0.96)';
        x.beginPath();
        x.arc(cx, cy, h * 0.31, 0, TAU);
        x.fill();

        // Punch out the inner gap so the icon reads as a bright ring.
        x.shadowBlur = 0;
        x.globalCompositeOperation = 'destination-out';
        x.beginPath();
        x.arc(cx, cy, h * 0.20, 0, TAU);
        x.fill();
        x.globalCompositeOperation = 'source-over';

        x.shadowColor = 'rgba(0, 0, 0, 0.7)';
        x.shadowBlur = 10;
        x.strokeStyle = 'rgba(255, 255, 255, 0.98)';
        x.lineWidth = 8;
        x.beginPath();
        x.arc(cx, cy, h * 0.255, 0, TAU);
        x.stroke();

        x.shadowColor = 'rgba(0,0,0,0)';
        x.fillStyle = 'rgba(255, 255, 255, 0.98)';
        x.beginPath();
        x.arc(cx, cy, h * 0.12, 0, TAU);
        x.fill();

        const mat = new T.SpriteMaterial({
            map: new T.CanvasTexture(c),
            transparent: true,
            depthTest: false,
            depthWrite: false,
            opacity: 0.96,
        });
        txtCache[k] = mat;
        return mat;
    }

    // Only two PM/FH variants exist (palm-mute = black-on-white,
    // fret-hand mute = white-on-black). drawNote() hits muteXMat per
    // muted chord-note per frame, so dense PM/FH passages were paying
    // for a string concat + Map lookup on every call. Hoist both
    // SpriteMaterial refs and short-circuit before touching the cache.
    // They're populated lazily on first use; teardown still reaches
    // them via the shared ``txtCache`` because muteXMat writes there.
    let _pmXSpriteMat = null;
    let _fhXSpriteMat = null;
    function palmMuteXSpriteMat() {
        return _pmXSpriteMat ?? (_pmXSpriteMat = muteXMat('#000000', '#ffffff'));
    }
    function fretHandMuteXSpriteMat() {
        return _fhXSpriteMat ?? (_fhXSpriteMat = muteXMat('#ffffff', '#000000'));
    }

    function muteXMat(fillCol, strokeCol) {
        const k = 'technique|muteX|v2|' + String(fillCol) + '|' + String(strokeCol);
        if (txtCache[k]) return txtCache[k];

        // lineCap:'square' gives flat tips. For a 45° diagonal the square-cap
        // corners sit at ±outerW/2 rotated 45° from the endpoint — they land
        // outside the canvas unless pad ≥ outerW/√2 (the common mistake is
        // using outerW/2, which is too small). With the correct pad the white
        // cap is fully inside the canvas and the border is visible at every tip.
        const h = 512;
        const outerW = 132, innerW = 114;
        // pad must satisfy: pad ≥ outerW / Math.SQRT2  (≈ outerW × 0.707)
        const pad = Math.ceil(outerW / Math.SQRT2) + 2; // 96
        const c = document.createElement('canvas');
        c.width = h; c.height = h;
        const x = c.getContext('2d');

        x.clearRect(0, 0, h, h);
        x.lineCap = 'square';

        // Draw each diagonal in its own stroke() call — caps of the two
        // diagonals don't interact, and the white outer is drawn before the
        // black inner so the border is clean at every edge and tip.
        x.strokeStyle = strokeCol;
        x.lineWidth = outerW;
        x.beginPath(); x.moveTo(pad, pad); x.lineTo(h - pad, h - pad); x.stroke();
        x.beginPath(); x.moveTo(h - pad, pad); x.lineTo(pad, h - pad); x.stroke();

        x.strokeStyle = fillCol;
        x.lineWidth = innerW;
        x.beginPath(); x.moveTo(pad, pad); x.lineTo(h - pad, h - pad); x.stroke();
        x.beginPath(); x.moveTo(h - pad, pad); x.lineTo(pad, h - pad); x.stroke();

        const mat = new T.SpriteMaterial({
            map: new T.CanvasTexture(c),
            transparent: true,
            depthTest: false,
            depthWrite: false,
        });
        txtCache[k] = mat;
        return mat;
    }
    // Disposal for every entry this cache family created. Replaces the old
    // teardown's dispose-loop-then-reassign (`txtCache = {}`) — deleting each
    // key as it's disposed leaves the same empty-object end state without a
    // reassignment, which would break code holding the pre-factory reference.
    function disposeAll() {
        for (const k in txtCache) {
            const tm = txtCache[k];
            tm.userData.h3dGhostFretMeshMat?.dispose?.();
            tm.userData.h3dGhostFretMeshMat = null;
            tm.userData.h3dTechMeshMat?.dispose?.();
            tm.userData.h3dTechMeshMat = null;
            tm.map?.dispose();
            tm.dispose();
            delete txtCache[k];
        }
    }

    return {
        txtMat, pinchHarmonicMat, naturalHarmonicMat, muteXMat,
        palmMuteXSpriteMat, fretHandMuteXSpriteMat, disposeAll,
    };
}
