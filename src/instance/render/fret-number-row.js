import { DOTS, FRET_LABEL_GOLD_HEX, FRET_LABEL_IDLE_HEX, K, NFRETS, S_GAP } from '../../core/constants.js';
import { fretLabelScaleForFret } from '../../core/fret-geometry.js';
import { anchorPlayedFretSpanAt } from '../../core/chart-util.js';

/**
 * The heat-colored fret-number row below the board.
 *
 * `renderOrder = 1000` forces these sprites to the end of the transparent
 * queue so they always paint on top of notes/trails/lane — `depthTest:
 * false` alone (set by `textSprites.txtMat()`) exempts them from depth
 * comparison but doesn't pin draw order. `S_GAP * 1.4` Y-offset keeps the
 * label band clearly below the lowest string even at the largest active
 * scale, so labels never share screen space with the playing strings.
 */
export function createFretNumberRow({ pFretLbl, textSprites, sY, xFretMid }) {
    function drawFretNumberRow(anchors, now, nStr, _textSizeMul) {
        const yBottom = Math.min(sY(0), sY(nStr - 1));
        const anchorSpan = anchorPlayedFretSpanAt(anchors, now);
        for (let f = 1; f <= NFRETS; f++) {
            const isInAnchor = anchorSpan
                && f >= anchorSpan.f0 && f <= anchorSpan.f1;
            const isMainFret = DOTS.includes(f);
            // Gray label only on main frets (dot positions); gold label on any fret inside the
            // anchor range; non-main frets outside the anchor range are hidden entirely.
            if (!isInAnchor && !isMainFret) continue;
            const lb = pFretLbl.get();
            lb.material = textSprites.txtMat(f,
                isInAnchor ? FRET_LABEL_GOLD_HEX : FRET_LABEL_IDLE_HEX,
                false, 'fretRow');
            lb.position.set(xFretMid(f), yBottom - S_GAP * 1.4, 0.5 * K);
            lb.material.opacity = isInAnchor ? 1.0 : 0.55;
            const scale = 5.95 * _textSizeMul * fretLabelScaleForFret(f);
            lb.scale.set(scale * K, scale * K, 1);
            lb.renderOrder = 1000;
        }
    }

    return { drawFretNumberRow };
}
