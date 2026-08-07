import { T } from '../../core/three.js';
import {
    DDOTS, DOTS, FRET_BOW_DZ, FRET_EMISSIVE, FRET_METALNESS, FRET_ROUGHNESS, FRET_TUBE_RADIAL,
    FRET_TUBE_RADIUS, FRET_TUBE_SEG, FRET_WIRE_IDLE_HEX, FRET_WIRE_IDLE_OP, INLAY_LABEL_FRETS,
    K, NFRETS, S_GAP, STR_THICK,
} from '../../core/constants.js';
import { fretLabelScaleForFret } from '../../core/fret-geometry.js';
import { renderOrderForLayerAtZ } from '../../core/render-order.js';

// Fret wires + fret dots + fret inlay number labels -- moved verbatim out
// of buildBoard()'s tail (Stage 7, post-3e). Bundled into one file/one
// function since all three are built back-to-back off the same yTop/
// yBottom/sY/nStr locals (same "small adjacent clusters, same construction
// shape" grouping sustain-rail.js used for its own trio).
//
// fretG/nStr/sY are explicit params (recomputed fresh by buildBoard() on
// every rebuild, not deps). xFret/xFretMid/textSprites are the caller's
// stable per-instance references (xFret/xFretMid are `const` arrow
// functions, never reassigned; textSprites is the per-instance
// createTextSpriteCache() instance, same lifetime as this whole factory).
//
// Disposal: buildBoard()'s own generic `fretG.children` traversal handles
// the wire/dot mesh geometry+materials on rebuild (it explicitly skips
// ctx.board.fretTubeGeo, disposed once by buildBoard() itself beforehand).
// The traversal also explicitly skips T.Sprite instances, so the inlay
// label sprites' cloned materials need their own explicit disposal --
// this function does that itself now (own-it-outright), same as before
// the move.
export function createFretMarkersBuilder({ ctx, xFret, xFretMid, textSprites }) {
    function buildFretMarkers(fretG, nStr, sY) {
        // Fret wires — bowed metal TubeGeometry (backported from
        // highway_babylon). Board-string and fret-wire layers live in
        // RENDER_ORDER_LAYER_STACK so the fretboard draws above note
        // symbols and below fret labels.
        // Tube (not T.Line): WebGL ignores linewidth > 1px on almost all
        // platforms, so Line objects always render as hairlines. The tube
        // bows in Z (middle strings pushed away from camera) so the row of
        // frets reads as wrapping a cylindrical neck — see FRET_BOW_DZ.
        // MeshStandardMaterial (vs the old flat MeshBasic): the scene's
        // ambient+directional light glints across the rounded surface for a
        // polished-steel look; the per-frame gold albedo (in-anchor) then
        // reads as brass. depthTest:false: string BoxGeometry (MeshStandard,
        // depthWrite:true) writes depth at Z=+STR_THICK/2; wires near Z=0
        // would fail the depth test at string pixels despite higher layer.
        // Colors are updated each frame by the ctx.board.fretWireMats loop in update(),
        // which drives every wire to one of two tiers: FRET_WIRE_IDLE_* by
        // default, FRET_WIRE_ACTIVE_* inside the anchor lane. The material is
        // created at the idle tier so frame 0 (before update() first runs)
        // already matches.
        const yTop = Math.max(sY(0), sY(nStr - 1));
        const yBottom = Math.min(sY(0), sY(nStr - 1));
        const wireH = (yTop + S_GAP * 0.3) - (yBottom - S_GAP * 0.3);
        const wireMidY = (yTop + yBottom) / 2;
        // Single shared geometry centered at x=0, local Y -half..+half,
        // bowed in Z by FRET_BOW_DZ * [0,0.6,1,0.6,0]. Reused by every fret
        // (only mesh position differs). Symmetric in Y → invert/lefty-safe.
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
                // depthWrite:false (matches other transparent overlays here):
                // a transparent fret must not write depth or it can occlude
                // later-drawn transparent elements despite depthTest:false.
                transparent: true, opacity: FRET_WIRE_IDLE_OP, depthTest: false, depthWrite: false,
            });
            const fw = new T.Mesh(ctx.board.fretTubeGeo, mat);
            fw.position.set(x, wireMidY, 0);
            fw.renderOrder = renderOrderForLayerAtZ(0, 'BOARD_FRET_WIRE');
            fretG.add(fw);
            ctx.board.fretWireMats[f] = mat;
        }

        // Fret dots — flat circles (CircleGeometry) lying in the XY plane and
        // facing +Z so they always appear as perfect circles from the camera.
        // depthWrite:false so they don't steal the depth buffer from the
        // transparent string meshes. Slight negative Z recessed under the
        // string plane. Radius 10% below the former 1.5*K dots.
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
            // Above the dynamic lane (1) and its dividers (2) so the
            // translucent blue lane no longer paints over and hides the
            // inlay; still well below strings / wires / notes,
            // so those keep drawing on top of the inlay.
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

        // Fret inlay number labels — sprites sitting just behind the hit line
        // (Z = -K) so camera-distance sorting in the transparent pass puts
        // them before notes at Z = 0, letting notes paint on top.
        // Materials are cloned from the txtMat cache with depthWrite:false so
        // the sprites don't write stale depth values that would clip incoming
        // notes (which arrive from large negative Z). Clones are tracked in
        // ctx.board._inlayMats for explicit disposal on rebuild and destroy().
        // Scale uses (0.5 + textSize) directly — _textSizeMul is stale here
        // (only refreshed at the top of update()); update() rescales live.
        // The generic fretG.children traversal at the top of buildBoard()
        // explicitly SKIPS T.Sprite instances, so inlay labels need their
        // own explicit disposal here before rebuilding.
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
