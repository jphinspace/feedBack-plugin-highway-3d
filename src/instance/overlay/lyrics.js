// Lyrics overlay — top-centre 2D canvas renderer with syllable-level
// highlighting (current syllable white, played muted, upcoming dim).
//
// The row-layout cache used to be a closure `let _lyrRowsCache`. It is
// per-instance state (each splitscreen panel measures against its own canvas
// width), so it must NOT become a module-level singleton — panels would fight
// over one cache and thrash it every frame. Instead the caller owns it:
// createLyricsCache() per renderer instance, passed in as the last argument.

export function createLyricsCache() { return { rows: null }; }

export function drawLyrics(lyrics, currentTime, ctx, W, H, cache) {
    if (!lyrics._lines) {
        const lines = [];
        let line = null, word = null;
        const flushWord = () => { if (word && word.length) line.words.push(word); word = null; };
        const flushLine = () => { flushWord(); if (line && line.words.length) lines.push(line); line = null; };
        for (let i = 0; i < lyrics.length; i++) {
            const l = lyrics[i];
            const raw = l.w || '';
            const endsLine = raw.endsWith('+');
            const continuesWord = raw.endsWith('-');
            if (line && i > 0 && l.t - (lyrics[i - 1].t + lyrics[i - 1].d) > 4.0) flushLine();
            if (!line) line = { words: [], start: l.t, end: l.t + l.d };
            if (!word) word = [];
            word.push(l);
            line.end = Math.max(line.end, l.t + l.d);
            if (!continuesWord) flushWord();
            if (endsLine) flushLine();
        }
        flushLine();
        lyrics._lines = lines;
    }
    const allLines = lyrics._lines;
    if (!allLines.length) return 0;

    let currentIdx = -1;
    for (let i = 0; i < allLines.length; i++) {
        if (allLines[i].start <= currentTime) currentIdx = i;
        else break;
    }
    if (currentIdx === -1) {
        if (allLines[0].start - currentTime > 2.0) return 0;
        currentIdx = 0;
    }
    const currentLine = allLines[currentIdx];
    const nextLine = allLines[currentIdx + 1] || null;
    const gapToNext = nextLine ? (nextLine.start - currentLine.end) : Infinity;
    if (currentTime > currentLine.end + 0.5 && gapToNext > 3.0) return 0;

    const linesToShow = [currentLine];
    if (nextLine && gapToNext <= 3.0) linesToShow.push(nextLine);

    const fontSize = Math.max(18, H * 0.028) | 0;
    const lineY = H * 0.04;
    const sylText = s => { const t = s.w || ''; return (t.endsWith('+') || t.endsWith('-')) ? t.slice(0, -1) : t; };

    ctx.font = `bold ${fontSize}px sans-serif`;
    let rows, spaceWidth, bgWidth;
    const _lc = cache.rows;
    if (_lc && _lc.lyricsRef === lyrics && _lc.idx === currentIdx
        && _lc.shown === linesToShow.length
        && _lc.fontSize === fontSize && _lc.W === W) {
        rows = _lc.rows; spaceWidth = _lc.spaceWidth; bgWidth = _lc.bgWidth;
    } else {
        spaceWidth = ctx.measureText(' ').width;
        const maxWidth = W * 0.8;

        rows = [];
        for (const authoredLine of linesToShow) {
            let row = [], rowWidth = 0;
            for (const wordSyls of authoredLine.words) {
                const parts = [];
                let wordWidth = 0;
                for (const s of wordSyls) {
                    const text = sylText(s);
                    const w = ctx.measureText(text).width;
                    parts.push({ syl: s, text, width: w });
                    wordWidth += w;
                }
                const advance = wordWidth + spaceWidth;
                if (row.length > 0 && rowWidth + advance > maxWidth) { rows.push(row); row = []; rowWidth = 0; }
                row.push({ parts, advance });
                rowWidth += advance;
            }
            if (row.length) rows.push(row);
        }

        bgWidth = 0;
        for (const row of rows) {
            const rw = row.reduce((s, w) => s + w.advance, 0) - spaceWidth;
            if (rw > bgWidth) bgWidth = rw;
        }
        bgWidth = Math.min(bgWidth + 30, W * 0.85);
        cache.rows = {
            lyricsRef: lyrics, idx: currentIdx,
            shown: linesToShow.length, fontSize, W,
            rows, spaceWidth, bgWidth,
        };
    }

    const rowHeight = fontSize + 6;
    const totalHeight = rows.length * rowHeight + 10;

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath();
    const bx = W / 2 - bgWidth / 2, by = lineY - 4, br = 8;
    ctx.moveTo(bx + br, by); ctx.lineTo(bx + bgWidth - br, by);
    ctx.quadraticCurveTo(bx + bgWidth, by, bx + bgWidth, by + br);
    ctx.lineTo(bx + bgWidth, by + totalHeight - br);
    ctx.quadraticCurveTo(bx + bgWidth, by + totalHeight, bx + bgWidth - br, by + totalHeight);
    ctx.lineTo(bx + br, by + totalHeight);
    ctx.quadraticCurveTo(bx, by + totalHeight, bx, by + totalHeight - br);
    ctx.lineTo(bx, by + br);
    ctx.quadraticCurveTo(bx, by, bx + br, by);
    ctx.closePath();
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        const rowWidth = row.reduce((s, w) => s + w.advance, 0) - spaceWidth;
        let xPos = W / 2 - rowWidth / 2;
        const yPos = lineY + r * rowHeight + 2;
        for (const w of row) {
            for (const part of w.parts) {
                const l = part.syl;
                const isActive = currentTime >= l.t && currentTime < l.t + l.d;
                const isPast = currentTime >= l.t + l.d;
                ctx.fillStyle = isActive ? '#4ae0ff' : isPast ? '#8899aa' : '#556677';
                ctx.font = `${isActive ? 'bold' : 'normal'} ${fontSize}px sans-serif`;
                ctx.fillText(part.text, xPos, yPos);
                xPos += part.width;
            }
            xPos += spaceWidth;
        }
    }
    // Return the actual bottom Y of the rendered background box so callers
    // (e.g. drawChordDiagram) can avoid overlapping it.
    return Math.round(by + totalHeight);
}
