import {
    DIAG_CELL_MAX, DIAG_SIZE_MAX, DIAG_SIZE_MIN,
} from '../../core/constants.js';

// Returns indices of the longest consecutive run in a sorted integer
// array as { start, len } — `sorted[start..start+len)` is the run.
// Avoids the two per-call sub-array allocations of the previous
// implementation (best + cur arrays grown via .push), at the cost
// of one small 2-key result object. Net: callers in the chord-
// diagram render path no longer churn arrays per visible chord.
export function longestConsecutiveRun(sorted) {
    let bestStart = -1, bestLen = 0;
    let curStart = -1, curLen = 0;
    for (let i = 0; i < sorted.length; i++) {
        if (curLen === 0 || sorted[i] === sorted[curStart + curLen - 1] + 1) {
            if (curLen === 0) curStart = i;
            curLen++;
        } else {
            if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; }
            curStart = i; curLen = 1;
        }
    }
    if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; }
    return { start: bestStart, len: bestLen };
}

/* ── Lyrics overlay (2D canvas on top of WebGL) ─────────────────── */
export function drawChordDiagram(ctx, opts) {
    const {
        name, frets,
        opacity = 1,
        entranceT = 1.0,
        canvasW = 600, canvasH = 400,
        inverted = false,
        sizeSlider = 0.5,
        position = 'tl',
        nStr = 6,
        lyricsBottom = 0,
        stackOffset = 0,
    } = opts;

    // Responsive sizing — CELL derived from panel height + user slider.
    // COLS is the resolved string count from the caller (via resolveStringCount)
    // so bass (4), extended (7/8) arrangements render correctly.
    const COLS = nStr, ROWS = 4;
    // Minimum column span required for PATH B (bracket extension / detection).
    // Math.min(COLS-1, 4) scales with string count:
    //   4-string bass → 3  (max possible span, so 2-4-4-2 shapes qualify)
    //   6-string      → 4  (excludes D major span=2 / common 2-string coincidences)
    //   8-string      → 4  (muted outer strings still leave span ≥ 4 for real barres)
    const MIN_BARRE_SPAN = Math.min(COLS - 1, 4);
    // Maps diagram column index → chord-template frets-array index.
    // Templates are high-e-first: frets[0]=high e, frets[COLS-1]=low E.
    // Non-inverted display (col 0 = high e): getStrIdx(0) = 0        → frets[0]      = high e.
    // Inverted display     (col 0 = low E):  getStrIdx(0) = COLS-1   → frets[COLS-1] = low E.
    const getStrIdx = col => inverted ? (COLS - 1 - col) : col;
    const sizeF  = DIAG_SIZE_MIN + (DIAG_SIZE_MAX - DIAG_SIZE_MIN) * sizeSlider;

    // startFret / isFirstPos must be known before CELL so that fretLabelW
    // can be measured and factored into the width cap.  The old
    // canvasW/(COLS+1.5) guard only approximated 2*PAD and ignored the
    // extra left padding reserved for non-first-position "Nfr" labels.
    const playedFrets = frets.filter(f => f > 0);
    const minFret     = playedFrets.length > 0 ? Math.min(...playedFrets) : 1;
    const startFret   = Math.max(1, minFret);
    const isFirstPos  = startFret === 1;

    // Phase 1 — height + hard-cap estimate, used only to size the label font.
    // Cap against the vertical space available below lyricsBottom so that the
    // diagram does not overflow into the lyrics banner on short split panels with
    // wrapped lyric rows.  Only top-corner positions can overlap the lyrics banner,
    // so lyricsBottom is only subtracted when position is 'tl' or 'tr'; for 'bl'
    // and 'br' the full canvas height is available.
    // Clamp to at least 1 so font/box calculations never receive 0-px input
    // on very short panels (e.g. tiny split cells < 44 px tall).
    const isTopCorner = position === 'tl' || position === 'tr';
    const availH  = canvasH - (isTopCorner ? lyricsBottom : 0);
    const cellEst = Math.max(1, Math.min(
        Math.round(availH * sizeF / (ROWS + 3)),
        DIAG_CELL_MAX,
    ));
    // Extra left padding for the "Nfr" label on non-first-position chords.
    // Measured with ctx.measureText at cellEst so the estimate is exact.
    let fretLabelW = 0;
    if (!isFirstPos) {
        // Measure inside a save/restore so this font assignment does not
        // leak to the caller (the outer ctx.save() happens after CELL is derived).
        ctx.save();
        ctx.font = `italic ${Math.round(cellEst * 0.55)}px sans-serif`;
        fretLabelW = Math.ceil(ctx.measureText(startFret + 'fr').width) + 6;
        ctx.restore();
    }

    // Phase 2 — final CELL: cap against panel height, hard max, and panel width.
    // Two width constraints are needed because PAD has a hard floor of 6:
    //   A) when PAD = CELL*0.65 (large CELL):  CELL*(COLS+0.3) + fretLabelW ≤ canvasW
    //   B) when PAD = 6 floor (small CELL):    CELL*(COLS-1)  + 12 + fretLabelW ≤ canvasW
    // Both are included so boxW ≤ canvasW in every regime.
    // fretLabelW was measured at cellEst ≥ CELL, so the cap is conservative.
    const CELL   = Math.max(1, Math.min(
        cellEst,
        Math.floor((canvasW - fretLabelW) / (COLS + 0.3)),
        Math.floor((canvasW - 2 * 6 - fretLabelW) / Math.max(1, COLS - 1)),
    ));
    const HEADER = Math.round(CELL * 1.6);
    const MARKER = Math.round(CELL * 0.7);
    const DOT_R  = CELL * 0.3;
    const PAD    = Math.max(6, Math.round(CELL * 0.65));
    const gridW  = CELL * (COLS - 1);
    const gridH  = CELL * ROWS;

    const PAD_L  = PAD + fretLabelW;

    const boxW   = gridW + PAD_L + PAD;
    const boxH   = HEADER + MARKER + gridH + PAD;

    // Anchor to chosen corner. Top positions get extra vertical offset
    // to clear the timeline plugin and song name displayed at the top.
    // lyricsBottom is the actual bottom Y of the lyrics banner (returned by
    // drawLyrics), so TOP_Y steps down past all lyric rows regardless of
    // how many wrap lines the current panel width produces.
    const E    = PAD;
    const TOP_Y = Math.round(Math.max(E + canvasH * 0.06, lyricsBottom + E));
    let bx, by;
    if      (position === 'tr') { bx = canvasW - boxW - E; by = TOP_Y + stackOffset; }
    else if (position === 'bl') { bx = E; by = canvasH - boxH - E - stackOffset; }
    else if (position === 'br') { bx = canvasW - boxW - E; by = canvasH - boxH - E - stackOffset; }
    else                        { bx = E; by = TOP_Y + stackOffset; }

    // Clamp so the box never bleeds off-canvas on narrow panels or wide string counts.
    bx = Math.max(0, Math.min(canvasW - boxW, bx));
    by = Math.max(0, Math.min(canvasH - boxH, by));

    // Guard: the canvasH–boxH clamp above can push `by` above lyricsBottom when
    // wrapped lyrics consume nearly the full panel height.  This applies to ALL
    // corner positions: a bottom-corner diagram anchored near the canvas bottom can
    // still reach up into the lyrics banner on very short or narrow panels where
    // boxH is larger than the space below the lyrics.  In those cases skip drawing
    // entirely rather than painting on top of the lyrics banner.
    if (lyricsBottom > 0 && by < lyricsBottom) return 0;

    const gx = bx + PAD_L, gy = by + HEADER + MARKER;

    // Ease-out quadratic entrance scale: 0.85 → 1.0.
    const scale = 1 - 0.15 * (1 - entranceT) * (1 - entranceT);

    ctx.save();
    ctx.globalAlpha = opacity;

    if (scale !== 1.0) {
        const cx = bx + boxW / 2, cy = by + boxH / 2;
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -cy);
    }

    // Background + border.
    ctx.fillStyle = 'rgba(8, 14, 22, 0.88)';
    ctx.beginPath(); ctx.roundRect(bx, by, boxW, boxH, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(bx, by, boxW, boxH, 7); ctx.stroke();

    // Split-root typography: "Dm7" → "D" large bold + "m7" smaller.
    const rootMatch = name.match(/^([A-G][#b]?)(.*)/);
    const root    = rootMatch ? rootMatch[1] : name;
    const quality = rootMatch ? rootMatch[2] : '';
    const rootSize = Math.round(CELL * 1.25);
    const qualSize = Math.round(rootSize * 0.65);
    ctx.textBaseline = 'middle';
    const nameY = by + HEADER * 0.55;
    ctx.font = `bold ${rootSize}px sans-serif`;
    const rootW = ctx.measureText(root).width;
    ctx.font = `${qualSize}px sans-serif`;
    const qualW = quality ? ctx.measureText(quality).width : 0;
    const nameBlockW = rootW + (quality ? qualW + 2 : 0);
    const nameStartX = bx + boxW / 2 - nameBlockW / 2;
    ctx.fillStyle = '#e8d080';
    ctx.font = `bold ${rootSize}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(root, nameStartX, nameY);
    if (quality) {
        ctx.font = `${qualSize}px sans-serif`;
        ctx.fillStyle = 'rgba(232,208,128,0.75)';
        ctx.fillText(quality, nameStartX + rootW + 2, nameY);
    }

    // Nut: CELL-proportional filled rect + subtle highlight line.
    // Thickness is 40% of CELL, floored at 2 px so it stays visible on
    // the smallest diagrams (CELL=1 on compact split panels).
    const NUT_H = Math.round(Math.max(2, CELL * 0.4));
    if (isFirstPos) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(gx, gy - NUT_H, gridW, NUT_H);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(gx, gy - NUT_H, gridW, Math.max(1, Math.round(NUT_H * 0.25)));
    }

    // Fret label for non-first-position chords.
    if (!isFirstPos) {
        ctx.fillStyle = 'rgba(220,200,120,0.9)';
        ctx.font = `italic ${Math.round(CELL * 0.55)}px sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(startFret + 'fr', gx - 4, gy + CELL * 0.5);
    }

    // Fret lines.
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1;
    for (let r = (isFirstPos ? 1 : 0); r <= ROWS; r++) {
        ctx.beginPath();
        ctx.moveTo(gx, gy + r * CELL);
        ctx.lineTo(gx + gridW, gy + r * CELL);
        ctx.stroke();
    }

    // String lines with varying weight: low E heavier, high e lighter.
    // With getStrIdx(col) = col (non-inverted): col 0 (high e) → strIdx=0 → t=0 thin;
    // col COLS-1 (low E) → strIdx=COLS-1 → t=1 thick. Inverted mode naturally mirrors.
    // Weights scale with CELL so strings never bleed into adjacent columns on
    // small-CELL diagrams (e.g. CELL=1 on compact split panels).
    for (let col = 0; col < COLS; col++) {
        const strIdx = getStrIdx(col);
        const t = COLS > 1 ? strIdx / (COLS - 1) : 1;  // 1=low E (thick), 0=high e (thin); guard COLS=1
        ctx.lineWidth = Math.max(0.5, CELL * (0.05 + t * 0.10));
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.moveTo(gx + col * CELL, gy);
        ctx.lineTo(gx + col * CELL, gy + ROWS * CELL);
        ctx.stroke();
    }

    // Barre detection — two complementary paths:
    //
    // PATH A (F-shape / mini-barre): at least two ADJACENT columns are at startFret.
    //   Bracket is initially set to the consecutive run's own endpoints (not the full
    //   startFretCols range) so isolated bass notes at the same fret can't pull the
    //   bracket across an open gap (e.g. "2 0 2 2 0 0" stays bracketed at cols 2..3).
    //
    // PATH B (full-span barre / extension):
    //   When PATH A fired: extend the bracket outward to the full outer startFret span
    //     if the span ≥ MIN_BARRE_SPAN and every column between the outer startFret
    //     columns is fretted (f > 0).
    //   When PATH A did NOT fire: detect standalone full barres (e.g. x24442, x46654)
    //     where only the two outermost strings sit at startFret.  An additional check
    //     ensures that no intermediate column is itself at startFret — this rules out
    //     alternating-fret voicings like "1 3 1 3 1 0" (col 2 at startFret would fire
    //     incorrectly) while still catching B-major-style shapes where the barre
    //     finger covers only the outer two strings.
    //
    // Templates are high-e-first: frets[0]=high e, frets[COLS-1]=low E.
    // Examples (6-string, MIN_BARRE_SPAN=4):
    //   F major [1,1,2,3,3,1]: PATH A run=[4,5] → bracket 4..5; PATH B span=5, all fretted → extends to 0..5 ✓
    //   B major x24442:        PATH A no run; PATH B span=4, all fretted, no inner at startFret → 1..5 ✓
    //   mini-A  x02220:        PATH A run=[2,3,4] → bracket 2..4; PATH B span=2<4 → no extension ✓
    //   D major xx0232:        PATH A run length=1 → no PATH A; PATH B span<4 → no bracket ✓
    //   2 0 2 2 0 0:           PATH A run=[2,3] → bracket 2..3; PATH B span=3<4 → no extension ✓
    //   1 3 1 3 1 0:           PATH A no run; PATH B: inner col 2 at startFret → no bracket ✓
    const startFretCols = [];
    for (let col = 0; col < COLS; col++) {
        if (frets[getStrIdx(col)] === startFret) startFretCols.push(col);
    }
    const barreRun = longestConsecutiveRun(startFretCols);
    let hasBarreArc = barreRun.len >= 2;   // PATH A
    let barreMinCol = hasBarreArc ? startFretCols[barreRun.start] : -1;
    let barreMaxCol = hasBarreArc ? startFretCols[barreRun.start + barreRun.len - 1] : -1;

    if (startFretCols.length >= 2) {             // PATH B
        const minC = startFretCols[0];
        const maxC = startFretCols[startFretCols.length - 1];
        if (maxC - minC >= MIN_BARRE_SPAN) {
            let allFretted = true;
            for (let col = minC; col <= maxC; col++) {
                if (frets[getStrIdx(col)] <= 0) { allFretted = false; break; }
            }
            if (allFretted) {
                if (hasBarreArc) {
                    // PATH A fired: always safe to extend to full outer span.
                    barreMinCol = minC;
                    barreMaxCol = maxC;
                } else {
                    // PATH A did not fire: only draw a bracket when no intermediate
                    // column sits at startFret.  Intermediate startFret columns would
                    // indicate a scattered/alternating voicing rather than a clean
                    // outer-edge barre (e.g. "1 3 1 3 1 0" has col 2 at startFret).
                    let noInnerAtStartFret = true;
                    for (let col = minC + 1; col < maxC; col++) {
                        if (frets[getStrIdx(col)] === startFret) { noInnerAtStartFret = false; break; }
                    }
                    if (noInnerAtStartFret) {
                        hasBarreArc = true;
                        barreMinCol = minC;
                        barreMaxCol = maxC;
                    }
                }
            }
        }
    }
    if (hasBarreArc) {
        const barreY   = gy + CELL * 0.5;
        const capH     = CELL * 0.22;  // vertical offset from barreY to the bracket line
        const capHalf  = Math.max(1, Math.round(CELL * 0.3)); // half-height of the vertical end caps
        // Straight bracket: a horizontal line with short vertical end caps.
        // Stroke scales with CELL so it doesn't swamp tiny cells (floor at 1 px).
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = Math.max(1, CELL * 0.2);
        ctx.beginPath();
        ctx.moveTo(gx + barreMinCol * CELL, barreY - capH);
        ctx.lineTo(gx + barreMaxCol * CELL, barreY - capH);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(gx + barreMinCol * CELL, barreY - capH - capHalf);
        ctx.lineTo(gx + barreMinCol * CELL, barreY - capH + capHalf);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(gx + barreMaxCol * CELL, barreY - capH - capHalf);
        ctx.lineTo(gx + barreMaxCol * CELL, barreY - capH + capHalf);
        ctx.stroke();
    }

    // Open/muted markers + finger dots.
    // Non-inverted: col 0 = high e → getStrIdx(0)=0 → frets[0]; col COLS-1 = low E → frets[COLS-1].
    // Inverted:     col 0 = low E → getStrIdx(0)=COLS-1 → frets[COLS-1]; col COLS-1 = high e → frets[0].
    for (let col = 0; col < COLS; col++) {
        const f = frets[getStrIdx(col)];
        const sx = gx + col * CELL;
        const markerY = gy - MARKER * 0.5;
        if (f < 0) {
            const r = CELL * 0.20;
            ctx.strokeStyle = '#cc4444'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(sx - r, markerY - r); ctx.lineTo(sx + r, markerY + r); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(sx + r, markerY - r); ctx.lineTo(sx - r, markerY + r); ctx.stroke();
        } else if (f === 0) {
            ctx.strokeStyle = '#88bbff'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(sx, markerY, CELL * 0.22, 0, Math.PI * 2); ctx.stroke();
        } else {
            const row = f - startFret;
            if (row >= 0 && row < ROWS) {
                const isBarreCol = hasBarreArc && f === startFret &&
                                   col >= barreMinCol && col <= barreMaxCol;
                ctx.shadowColor = 'rgba(0,0,0,0.5)';
                ctx.shadowBlur = Math.min(4, CELL * 0.4);
                ctx.shadowOffsetX = Math.max(0.5, CELL * 0.1);
                ctx.shadowOffsetY = Math.max(0.5, CELL * 0.1);
                ctx.fillStyle = isBarreCol ? 'rgba(255,255,255,0.85)' : '#ffffff';
                ctx.beginPath();
                ctx.arc(sx, gy + row * CELL + CELL * 0.5, DOT_R, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
            }
        }
    }
    ctx.restore();
    return boxH;
}
