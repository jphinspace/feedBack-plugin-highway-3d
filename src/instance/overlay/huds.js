/**
 * Section + tone HUD cards drawn on the 2D overlay canvas. Both are pure
 * `(ctx, opts)` renderers — every value they need arrives through `opts`.
 * Each returns the height it drew (0 if nothing rendered), which the
 * caller pushes onto its per-corner stack so the next card lands below it.
 */

/**
 * Two-line section card: "Now: <current>" / "Up Next: <next> in
 * <countdown>". Position/size mirror the chord-diagram contract: `'tl'`/
 * `'tr'`/`'bl'`/`'br'` anchor corners, `sizeSlider` in `[0,1]` scales card
 * height. Still shows "Up Next" alone during pre-roll, before the first section.
 */
export function drawSectionHud(ctx, opts) {
    const {
        sections, currentTime,
        canvasW, canvasH,
        position = 'tr',
        sizeSlider = 0.5,
        lyricsBottom = 0,
        stackOffset = 0,
    } = opts;
    if (!sections || !sections.length) return 0;

    // sections are time-ordered server-side; single forward scan.
    let curIdx = -1;
    for (let i = 0; i < sections.length; i++) {
        if (sections[i].time <= currentTime) curIdx = i;
        else break;
    }
    const cur  = curIdx >= 0 ? sections[curIdx] : null;
    const next = (curIdx + 1 < sections.length) ? sections[curIdx + 1] : null;
    // Pre-first-section: render "Up Next" alone as an anticipatory cue during the intro.
    if (!cur && !next) return 0;

    const nowName = cur ? cur.name : '';
    // Countdown is a separate span (calmer grey-white) so combining it into one string
    // doesn't inherit the section name's cyan fill.
    let nextName = '';
    let nextCountdown = '';
    if (next) {
        const dt = next.time - currentTime;
        nextName = next.name;
        nextCountdown = dt > 10
            ? 'in ' + Math.round(dt) + 's'
            : 'in ' + Math.max(0, dt).toFixed(1) + 's';
    }

    const sizeF = 0.65 + 0.85 * sizeSlider; // 0.65 .. 1.5
    const baseH = Math.max(34, Math.min(72, Math.round(canvasH * 0.085 * sizeF)));
    const PAD_X = Math.round(baseH * 0.45);
    const PAD_Y = Math.round(baseH * 0.20);
    // Scale applied to nameSize/tagSize/lineH when the unscaled card would overflow a
    // narrow panel; computed below from measured contentW vs. available width.
    let textScale = 1.0;
    const baseLineH    = Math.round(baseH * 0.46);
    const baseNameSize = Math.round(baseH * 0.36);
    const baseTagSize  = Math.round(baseH * 0.24);
    const baseTagGap   = Math.round(baseH * 0.14);

    const TAG_NOW  = 'Now:';
    const TAG_NEXT = 'Up Next:';

    // Unscaled measurement pass — decides whether textScale needs to drop.
    ctx.save();
    ctx.font = `${baseTagSize}px sans-serif`;
    const tagNowWBase  = ctx.measureText(TAG_NOW).width;
    const tagNextWBase = ctx.measureText(TAG_NEXT).width;
    const countdownWBase = nextCountdown ? ctx.measureText(nextCountdown).width : 0;
    ctx.font = `bold ${baseNameSize}px sans-serif`;
    const nowNameWBase  = nowName  ? ctx.measureText(nowName).width  : 0;
    const nextNameWBase = nextName ? ctx.measureText(nextName).width : 0;
    ctx.restore();

    const lineNowWBase  = nowName  ? tagNowWBase  + baseTagGap + nowNameWBase  : 0;
    const lineNextWBase = nextName
        ? tagNextWBase + baseTagGap + nextNameWBase
          + (nextCountdown ? baseTagGap + countdownWBase : 0)
        : 0;
    const contentWBase  = Math.max(lineNowWBase, lineNextWBase);
    const numLines = (nowName ? 1 : 0) + (nextName ? 1 : 0);
    if (numLines === 0) return 0;

    // Width budget: canvasW - 16 minus PAD_X either side. Over budget scales the font down,
    // clamped to 0.55 so labels stay legible on extreme split-panel widths.
    const maxBoxW = Math.max(40, canvasW - 16);
    const availContentW = Math.max(1, maxBoxW - PAD_X * 2);
    if (contentWBase > availContentW) {
        textScale = Math.max(0.55, availContentW / contentWBase);
    }

    const lineH    = Math.max(1, Math.round(baseLineH    * textScale));
    const nameSize = Math.max(1, Math.round(baseNameSize * textScale));
    const tagSize  = Math.max(1, Math.round(baseTagSize  * textScale));
    const TAG_GAP  = Math.max(1, Math.round(baseTagGap   * textScale));

    // Re-measure at the scaled font sizes rather than multiplying base widths by
    // textScale — measureText doesn't scale linearly with font size on every glyph.
    ctx.save();
    ctx.font = `${tagSize}px sans-serif`;
    const tagNowW  = ctx.measureText(TAG_NOW).width;
    const tagNextW = ctx.measureText(TAG_NEXT).width;
    const countdownW = nextCountdown ? ctx.measureText(nextCountdown).width : 0;
    ctx.font = `bold ${nameSize}px sans-serif`;
    const nowNameW  = nowName  ? ctx.measureText(nowName).width  : 0;
    const nextNameW = nextName ? ctx.measureText(nextName).width : 0;
    ctx.restore();

    const lineNowW  = nowName  ? tagNowW  + TAG_GAP + nowNameW  : 0;
    const lineNextW = nextName
        ? tagNextW + TAG_GAP + nextNameW + (nextCountdown ? TAG_GAP + countdownW : 0)
        : 0;
    const contentW = Math.max(lineNowW, lineNextW);

    const boxW = Math.min(maxBoxW, Math.round(contentW + PAD_X * 2));
    const boxH = Math.round(numLines * lineH + PAD_Y * 2);

    const E = Math.round(baseH * 0.25);
    const TOP_Y = Math.round(Math.max(E + canvasH * 0.06, lyricsBottom + E));
    let bx, by;
    if      (position === 'tr') { bx = canvasW - boxW - E; by = TOP_Y + stackOffset; }
    else if (position === 'bl') { bx = E; by = canvasH - boxH - E - stackOffset; }
    else if (position === 'br') { bx = canvasW - boxW - E; by = canvasH - boxH - E - stackOffset; }
    else                        { bx = E; by = TOP_Y + stackOffset; }
    bx = Math.max(0, Math.min(canvasW - boxW, bx));
    by = Math.max(0, Math.min(canvasH - boxH, by));
    // Suppress overlap with the wrapped lyrics banner regardless of corner — bottom-corner
    // cards on short panels can still reach up into it once boxH exceeds the space below.
    if (lyricsBottom > 0 && by < lyricsBottom) return 0;

    ctx.save();
    ctx.fillStyle = 'rgba(8, 14, 22, 0.88)';
    ctx.beginPath(); ctx.roundRect(bx, by, boxW, boxH, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(bx, by, boxW, boxH, 7); ctx.stroke();

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    // Both lines share the same x origin so the tag column aligns vertically.
    const lineX = bx + PAD_X;
    let lineY = by + PAD_Y + lineH / 2;
    const TAG_COLOR = 'rgba(180,190,205,0.85)';
    const NAME_COLOR = '#00cccc';
    const TIME_COLOR = 'rgba(220,225,235,0.9)';

    if (nowName) {
        ctx.font = `${tagSize}px sans-serif`;
        ctx.fillStyle = TAG_COLOR;
        ctx.fillText(TAG_NOW, lineX, lineY);
        ctx.font = `bold ${nameSize}px sans-serif`;
        ctx.fillStyle = NAME_COLOR;
        ctx.fillText(nowName, lineX + tagNowW + TAG_GAP, lineY);
        lineY += lineH;
    }
    if (nextName) {
        ctx.font = `${tagSize}px sans-serif`;
        ctx.fillStyle = TAG_COLOR;
        ctx.fillText(TAG_NEXT, lineX, lineY);
        const nextX = lineX + tagNextW + TAG_GAP;
        ctx.font = `bold ${nameSize}px sans-serif`;
        ctx.fillStyle = NAME_COLOR;
        ctx.fillText(nextName, nextX, lineY);
        if (nextCountdown) {
            ctx.font = `${tagSize}px sans-serif`;
            ctx.fillStyle = TIME_COLOR;
            ctx.fillText(nextCountdown, nextX + nextNameW + TAG_GAP, lineY);
        }
    }
    ctx.restore();
    return boxH;
}

/**
 * Tone-change HUD: active tone + next upcoming tone with a countdown.
 * Mirrors {@link drawSectionHud}'s layout contract with an amber accent
 * instead of cyan.
 */
export function drawToneHud(ctx, opts) {
    const {
        toneChanges, toneBase = '',
        currentTime,
        canvasW, canvasH,
        position = 'tl',
        sizeSlider = 0.5,
        lyricsBottom = 0,
        stackOffset = 0,
    } = opts;

    // Resolve active tone: toneBase before all changes, else the most
    // recent change at or before currentTime.
    // toneChanges items use { t, name } (not { time, name }) — both
    // the legacy import path (server.py xml_tone_changes) and the sloppak
    // path (lib/tones.py sloppak_tone_changes) emit "t" as the key.
    let curName = toneBase;
    let nextChange = null;
    if (toneChanges && toneChanges.length) {
        for (let i = 0; i < toneChanges.length; i++) {
            if (toneChanges[i].t <= currentTime) {
                curName = toneChanges[i].name;
            } else {
                nextChange = toneChanges[i];
                break;
            }
        }
    }
    if (!curName && !nextChange) return 0;

    let nextName = '';
    let nextCountdown = '';
    if (nextChange) {
        const dt = nextChange.t - currentTime;
        nextName = nextChange.name;
        nextCountdown = dt > 10
            ? 'in ' + Math.round(dt) + 's'
            : 'in ' + Math.max(0, dt).toFixed(1) + 's';
    }

    const sizeF = 0.65 + 0.85 * sizeSlider;
    const baseH = Math.max(34, Math.min(72, Math.round(canvasH * 0.085 * sizeF)));
    const PAD_X = Math.round(baseH * 0.45);
    const PAD_Y = Math.round(baseH * 0.20);
    let textScale = 1.0;
    const baseLineH    = Math.round(baseH * 0.46);
    const baseNameSize = Math.round(baseH * 0.36);
    const baseTagSize  = Math.round(baseH * 0.24);
    const baseTagGap   = Math.round(baseH * 0.14);

    const TAG_CUR  = 'Tone:';
    const TAG_NEXT = 'Next:';

    ctx.save();
    ctx.font = `${baseTagSize}px sans-serif`;
    const tagCurWBase  = ctx.measureText(TAG_CUR).width;
    const tagNextWBase = ctx.measureText(TAG_NEXT).width;
    const countdownWBase = nextCountdown ? ctx.measureText(nextCountdown).width : 0;
    ctx.font = `bold ${baseNameSize}px sans-serif`;
    const curNameWBase  = curName  ? ctx.measureText(curName).width  : 0;
    const nextNameWBase = nextName ? ctx.measureText(nextName).width : 0;
    ctx.restore();

    const lineCurWBase  = curName  ? tagCurWBase  + baseTagGap + curNameWBase  : 0;
    const lineNextWBase = nextName
        ? tagNextWBase + baseTagGap + nextNameWBase
          + (nextCountdown ? baseTagGap + countdownWBase : 0)
        : 0;
    const contentWBase = Math.max(lineCurWBase, lineNextWBase);
    const numLines = (curName ? 1 : 0) + (nextName ? 1 : 0);
    if (numLines === 0) return 0;

    const maxBoxW = Math.max(40, canvasW - 16);
    const availContentW = Math.max(1, maxBoxW - PAD_X * 2);
    if (contentWBase > availContentW) {
        textScale = Math.max(0.55, availContentW / contentWBase);
    }

    const lineH    = Math.max(1, Math.round(baseLineH    * textScale));
    const nameSize = Math.max(1, Math.round(baseNameSize * textScale));
    const tagSize  = Math.max(1, Math.round(baseTagSize  * textScale));
    const TAG_GAP  = Math.max(1, Math.round(baseTagGap   * textScale));

    ctx.save();
    ctx.font = `${tagSize}px sans-serif`;
    const tagCurW  = ctx.measureText(TAG_CUR).width;
    const tagNextW = ctx.measureText(TAG_NEXT).width;
    const countdownW = nextCountdown ? ctx.measureText(nextCountdown).width : 0;
    ctx.font = `bold ${nameSize}px sans-serif`;
    const curNameW  = curName  ? ctx.measureText(curName).width  : 0;
    const nextNameW = nextName ? ctx.measureText(nextName).width : 0;
    ctx.restore();

    const lineCurW  = curName  ? tagCurW  + TAG_GAP + curNameW  : 0;
    const lineNextW = nextName
        ? tagNextW + TAG_GAP + nextNameW + (nextCountdown ? TAG_GAP + countdownW : 0)
        : 0;
    const contentW = Math.max(lineCurW, lineNextW);

    const boxW = Math.min(maxBoxW, Math.round(contentW + PAD_X * 2));
    const boxH = Math.round(numLines * lineH + PAD_Y * 2);

    const E = Math.round(baseH * 0.25);
    const TOP_Y = Math.round(Math.max(E + canvasH * 0.06, lyricsBottom + E));
    let bx, by;
    if      (position === 'tr') { bx = canvasW - boxW - E; by = TOP_Y + stackOffset; }
    else if (position === 'bl') { bx = E; by = canvasH - boxH - E - stackOffset; }
    else if (position === 'br') { bx = canvasW - boxW - E; by = canvasH - boxH - E - stackOffset; }
    else                        { bx = E; by = TOP_Y + stackOffset; } // 'tl' default
    bx = Math.max(0, Math.min(canvasW - boxW, bx));
    by = Math.max(0, Math.min(canvasH - boxH, by));
    if (lyricsBottom > 0 && by < lyricsBottom) return 0;

    ctx.save();
    ctx.fillStyle = 'rgba(8, 14, 22, 0.88)';
    ctx.beginPath(); ctx.roundRect(bx, by, boxW, boxH, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(bx, by, boxW, boxH, 7); ctx.stroke();

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    const lineX = bx + PAD_X;
    let lineY = by + PAD_Y + lineH / 2;
    const TAG_COLOR  = 'rgba(180,190,205,0.85)';
    const NAME_COLOR = '#ff9a3c'; // amber — distinct from section cyan
    const TIME_COLOR = 'rgba(220,225,235,0.9)';

    if (curName) {
        ctx.font = `${tagSize}px sans-serif`;
        ctx.fillStyle = TAG_COLOR;
        ctx.fillText(TAG_CUR, lineX, lineY);
        ctx.font = `bold ${nameSize}px sans-serif`;
        ctx.fillStyle = NAME_COLOR;
        ctx.fillText(curName, lineX + tagCurW + TAG_GAP, lineY);
        lineY += lineH;
    }
    if (nextName) {
        ctx.font = `${tagSize}px sans-serif`;
        ctx.fillStyle = TAG_COLOR;
        ctx.fillText(TAG_NEXT, lineX, lineY);
        const nextX = lineX + tagNextW + TAG_GAP;
        ctx.font = `bold ${nameSize}px sans-serif`;
        ctx.fillStyle = NAME_COLOR;
        ctx.fillText(nextName, nextX, lineY);
        if (nextCountdown) {
            ctx.font = `${tagSize}px sans-serif`;
            ctx.fillStyle = TIME_COLOR;
            ctx.fillText(nextCountdown, nextX + nextNameW + TAG_GAP, lineY);
        }
    }
    ctx.restore();
    return boxH;
}
