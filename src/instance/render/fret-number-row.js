import { DOTS, FRET_LABEL_GOLD_HEX, FRET_LABEL_IDLE_HEX, K, NFRETS, S_GAP } from '../../core/constants.js';
import { fretLabelScaleForFret } from '../../core/fret-geometry.js';
import { anchorPlayedFretSpanAt } from '../../core/chart-util.js';

// The heat-coloured fret-number row below the board -- moved verbatim out
// of update() (Stage 7 Track C). Fully self-contained: construction-time-
// only deps, explicit per-call parameters, nothing escapes downstream.
//
// Two-part fix for issue #35:
//  1. renderOrder = 1000 forces these sprites to the end of the
//     transparent queue so they always paint on top of notes, sustain
//     trails, lane plane, etc. depthTest is already disabled by
//     textSprites.txtMat(), but `depthTest: false` only exempts the
//     sprite from depth comparison — it doesn't pin draw order. Without
//     an explicit renderOrder, a note rendered after the label in the
//     transparent pass would still overdraw it. Match the pattern
//     already used for lane and dividers.
//  2. Y-offset bumped from S_GAP * 0.6 to S_GAP * 1.4 so the label band
//     sits clearly below the lowest string in screen space, even at the
//     largest active scale (intensity-driven, up to ~5.7 * K vertical
//     extent). This buys a real visual gap between notes-on-the-lowest-
//     string and the row, on top of the renderOrder guarantee — labels
//     never share screen with what's happening on the playing strings
//     just above them.
export function createFretNumberRow({ pFretLbl, textSprites, sY, xFretMid }) {
    function drawFretNumberRow(anchors, now, nStr, _textSizeMul) {
        const yBottom = Math.min(sY(0), sY(nStr - 1));
        // anchorSpan: [f0, f1] = [anchor.fret, anchor.fret + width - 1]
        // e.g. { fret:3, width:4 } → f0=3, f1=6 → frets 3,4,5,6 gold.
        const anchorSpan = anchorPlayedFretSpanAt(anchors, now);
        for (let f = 1; f <= NFRETS; f++) {
            const isInAnchor = anchorSpan
                && f >= anchorSpan.f0 && f <= anchorSpan.f1;
            const isMainFret = DOTS.includes(f);
            // Rule 1: show gray label only on main frets (dot positions).
            // Rule 2: show gold label on any fret inside the anchor range.
            // Non-main frets outside the anchor range are hidden entirely.
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
