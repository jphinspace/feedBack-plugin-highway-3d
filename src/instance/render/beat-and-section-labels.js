import { dZ } from '../../core/fret-geometry.js';
import { NH, S_BASE, K } from '../../core/constants.js';

/**
 * Beat lines and on-highway section labels. Each touches exactly one pool
 * + one or two materials and no shared camera/settings state beyond what's
 * passed in per call. `sectionLabelsOnHighway` (the opt-in setting gate)
 * is checked by the caller before calling `drawSectionLabels`, not here.
 */
export function createBeatAndSectionLabels({ pBeat, mBeatM, mBeatQ, pSec, textSprites, boardSpanX, sY, xFret }) {
    function drawBeatLines(beats, now, t0, t1) {
        if (!beats) return;
        const board = boardSpanX();
        const bw2 = board.width + 4 * K;
        let lastM = -1;
        for (const b of beats) {
            const meas = b.measure !== lastM; lastM = b.measure;
            if (b.time < t0 || b.time > t1) continue;
            const bl2 = pBeat.get();
            bl2.material = meas ? mBeatM : mBeatQ;
            bl2.scale.set(bw2, 1, 1);
            bl2.position.set(board.min - 2 * K, S_BASE - NH / 2 - 1.5 * K, dZ(b.time - now));
        }
    }

    function drawSectionLabels(sections, now, t0, t1, nStr, _textSizeMul) {
        if (!sections) return;
        const labelY = Math.max(sY(0), sY(nStr - 1)) + 8 * K;
        for (const s of sections) {
            if (s.time < t0 || s.time > t1) continue;
            const sp = pSec.get();
            sp.material = textSprites.txtMat(s.name, '#00cccc', true, 'section');
            sp.scale.set(20 * K * _textSizeMul, 5 * K * _textSizeMul, 1);
            sp.position.set(xFret(12), labelY, dZ(s.time - now));
        }
    }

    return { drawBeatLines, drawSectionLabels };
}
