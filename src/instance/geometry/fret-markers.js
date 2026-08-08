import { T } from '../../core/three.js';
import {
    DDOTS, DOTS, FRET_BOW_DZ, FRET_EMISSIVE, FRET_METALNESS, FRET_ROUGHNESS, FRET_TUBE_RADIAL,
    FRET_TUBE_RADIUS, FRET_TUBE_SEG, FRET_WIRE_IDLE_HEX, FRET_WIRE_IDLE_OP, INLAY_LABEL_FRETS,
    K, NFRETS, S_GAP, STR_THICK,
} from '../../core/constants.js';
import { fretLabelScaleForFret } from '../../core/fret-geometry.js';
import { renderOrderForLayerAtZ } from '../../core/render-order.js';

/**
 * Fret wires + fret dots + fret inlay number labels, called from
 * `buildBoard()`'s tail on every rebuild. `fretG`/`nStr`/`sY` are explicit
 * params (recomputed fresh each rebuild); `xFret`/`xFretMid`/`textSprites`
 * are the caller's stable per-instance references.
 *
 * Disposal: `buildBoard()`'s generic `fretG.children` traversal handles the
 * wire/dot mesh geometry+materials on rebuild (it skips
 * `ctx.board.fretTubeGeo`, disposed once by `buildBoard()` beforehand, and
 * skips `T.Sprite` instances — so this function disposes the inlay label
 * sprite materials itself).
 */
export function createFretMarkersBuilder({ ctx, xFret, xFretMid, textSprites }) {
    function buildFretMarkers(fretG, nStr, sY) {
        // Fret wires: bowed metal TubeGeometry, not T.Line (WebGL ignores linewidth > 1px on
        // almost all platforms). The tube bows in Z so the row of frets reads as wrapping a
        // cylindrical neck (FRET_BOW_DZ). MeshStandardMaterial lets ambient+directional light
        // glint across the surface for a polished-steel look, with the per-frame gold albedo
        // (in-anchor) reading as brass. depthTest:false: string BoxGeometry writes depth at
        // Z=+STR_THICK/2, and wires near Z=0 would otherwise fail the depth test at string
        // pixels despite their higher render layer. update()'s ctx.board.fretWireMats loop
        // drives each wire's color to FRET_WIRE_IDLE_*/FRET_WIRE_ACTIVE_* every frame; created
        // at the idle tier so frame 0 already matches.
        const yTop = Math.max(sY(0), sY(nStr - 1));
        const yBottom = Math.min(sY(0), sY(nStr - 1));
        const wireH = (yTop + S_GAP * 0.3) - (yBottom - S_GAP * 0.3);
        const wireMidY = (yTop + yBottom) / 2;
        // Single shared geometry centered at x=0, local Y -half..+half, bowed in Z. Reused by
        // every fret (only mesh position differs); symmetric in Y so invert/lefty stay safe.
        const yHalf = wireH * 0.5;
        const zMults = [0, 0.6, 1, 0.6, 0];
        const tubePath = zMults.map((zm, i) => new T.Vector3(
            0,
            -yHalf + (wireH * i) / (zMults.length - 1),
            FRET_BOW_DZ * zm,
        ));
        const tubeCurve = new T.CatmullRomCurve3(tubePath);
        ctx.board.fretTubeGeo = new T.TubeGeometry(
            tubeCurve, FRET_TUBE_SEG, FRET_TUBE_RADIUS, FRET_TUBE_RADIAL, false,
        );
        for (let f = 0; f <= NFRETS; f++) {
            const x = xFret(f);
            const mat = new T.MeshStandardMaterial({
                color: FRET_WIRE_IDLE_HEX, metalness: FRET_METALNESS, roughness: FRET_ROUGHNESS,
                emissive: FRET_EMISSIVE,
                // depthWrite:false: a transparent fret must not write depth or it can occlude
                // later-drawn transparent elements despite depthTest:false.
                transparent: true, opacity: FRET_WIRE_IDLE_OP, depthTest: false, depthWrite: false,
            });
            const fw = new T.Mesh(ctx.board.fretTubeGeo, mat);
            fw.position.set(x, wireMidY, 0);
            fw.renderOrder = renderOrderForLayerAtZ(0, 'BOARD_FRET_WIRE');
            fretG.add(fw);
            ctx.board.fretWireMats[f] = mat;
        }

        // Fret dots: flat circles facing +Z so they always read as perfect circles from the
        // camera, recessed slightly behind the string plane. depthWrite:false keeps them from
        // stealing the depth buffer from the transparent string meshes.
        const dotRZ = (1.5 * K * 0.9);
        const dg = new T.CircleGeometry(dotRZ, 64);
        const dm = new T.MeshBasicMaterial({
            color: 0x556677,
            transparent: true,
            opacity: 1,
            depthWrite: false,
        });
        const dotZBack = -STR_THICK * 0.85;
        const my = (sY(0) + sY(nStr - 1)) / 2;
        const addDot = (x, y) => {
            const d = new T.Mesh(dg, dm);
            d.position.set(x, y, dotZBack);
            // Above the dynamic lane (1) and its dividers (2) so the translucent lane doesn't
            // paint over the inlay; still below strings/wires/notes.
            d.renderOrder = 3;
            fretG.add(d);
        };
        for (const f of DOTS) {
            const cx = xFretMid(f);
            if (DDOTS.has(f)) {
                addDot(cx, my - S_GAP * 0.7);
                addDot(cx, my + S_GAP * 0.7);
            } else {
                addDot(cx, my);
            }
        }

        // Fret inlay number labels: sit just behind the hit line (Z = -K) so camera-distance
        // sorting in the transparent pass puts them before notes at Z = 0, letting notes paint
        // on top. depthWrite:false so they don't clip incoming notes arriving from negative Z.
        // Scale uses (0.5 + textSize) directly since _textSizeMul isn't refreshed here — update() rescales live.
        for (const m of ctx.board._inlayMats) m.dispose();
        ctx.board._inlayMats = [];
        ctx.board._inlayLabels = [];
        for (const f of INLAY_LABEL_FRETS) {
            const mat = textSprites.txtMat(f, '#7abfcc', false, 'fretRow').clone();
            mat.depthWrite = false;
            mat.opacity = 0.55;
            const lbl = new T.Sprite(mat);
            const scale = 5.5 * (0.5 + ctx.settings.textSize) * fretLabelScaleForFret(f);
            lbl.scale.set(scale * K, scale * K, 1);
            lbl.position.set(xFretMid(f), yTop - S_GAP * 0.4, -K);
            lbl.visible = ctx.settings.inlayLabelsVisible;
            fretG.add(lbl);
            ctx.board._inlayLabels.push(lbl);
            ctx.board._inlayMats.push(mat);
        }
    }

    return { buildFretMarkers };
}
