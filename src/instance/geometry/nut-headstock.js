import { T } from '../../core/three.js';
import { K, STR_THICK, S_GAP } from '../../core/constants.js';
import { SETTING_DEFAULTS } from '../../settings/defaults.js';

/**
 * Guitar nut + headstock geometry. Self-contained: reads only the caller's
 * already-computed local layout values (recomputed fresh by `buildBoard()`
 * on every call, so they're explicit params, not deps) plus
 * `ctx.settings.nutColor`/`headstockColor`/`nutHeadstockVisible`, and
 * writes `ctx.board.nutHeadstockGroup`.
 *
 * Disposal: `buildBoard()`'s own generic `fretG.children` traversal
 * disposes `nutHeadstockGroup`'s meshes/materials on rebuild along with
 * everything else in `fretG` — no nut/headstock-specific disposal needed.
 */
function h3dHexOrDefault(hexStr, defHex) {
    const d = defHex || SETTING_DEFAULTS.nutColor;
    const s = (typeof hexStr === 'string' && /^#[0-9a-fA-F]{6}$/.test(hexStr.trim()))
        ? hexStr.trim().toLowerCase()
        : d;
    return parseInt(s.slice(1), 16);
}

export function createNutHeadstockBuilder({ ctx }) {
    function buildNutHeadstock(fretG, nStr, sY, xHeadLeft, nutXC, nutLenX, nutRearX) {
        ctx.board.nutHeadstockGroup = new T.Group();
        const yTopN = Math.max(sY(0), sY(nStr - 1));
        const yBottomN = Math.min(sY(0), sY(nStr - 1));
        const yMidN = (yTopN + yBottomN) / 2;
        const spanY = Math.abs(yTopN - yBottomN) + S_GAP * 1.05;

        const nutD = 0.95 * K;
        const nutZc = -0.62 * K;
        const nutH = spanY * 1.06;
        const nutHalfH = nutH * 0.5;

        const zBack = -1.38 * K;
        const zJoint = -0.58 * K;

        const nutInt = h3dHexOrDefault(ctx.settings.nutColor, SETTING_DEFAULTS.nutColor);
        const hsInt = h3dHexOrDefault(ctx.settings.headstockColor, SETTING_DEFAULTS.headstockColor);
        const nutBase = new T.Color(nutInt);
        const nutHi = nutBase.clone().lerp(new T.Color(0xffffff), 0.14);
        const nutGro = nutBase.clone().multiplyScalar(0.72);
        const hsBase = new T.Color(hsInt);
        const hsDarkC = hsBase.clone().multiplyScalar(0.76);

        const mapleMat = new T.MeshStandardMaterial({
            color: hsBase, roughness: 0.55, metalness: 0.02,
        });
        const mapleDark = new T.MeshStandardMaterial({
            color: hsDarkC, roughness: 0.62, metalness: 0.02,
        });

        const coreLen = Math.max(Math.abs(nutRearX - xHeadLeft), 2 * K);
        const coreCX = (nutRearX + xHeadLeft) * 0.5;
        const headCoreD = 1.05 * K;
        const headCore = new T.Mesh(
            new T.BoxGeometry(coreLen, spanY * 1.12, headCoreD),
            mapleDark,
        );
        headCore.position.set(coreCX, yMidN, zBack - headCoreD * 0.35);
        ctx.board.nutHeadstockGroup.add(headCore);

        const xs = 14;
        const ys = 12;
        const yLo = yMidN - spanY * 0.58;
        const yHi = yMidN + spanY * 0.58;
        const posR = new Float32Array((xs + 1) * (ys + 1) * 3);
        const idxR = [];
        let ri = 0;
        for (let j = 0; j <= ys; j++) {
            const v = j / ys;
            const wy = yLo + v * (yHi - yLo);
            const yArc = 1 - Math.abs((wy - yMidN) / (spanY * 0.55 + 1e-6));
            const yArcCl = Math.max(0, Math.min(1, yArc));
            for (let i = 0; i <= xs; i++) {
                const u = i / xs;
                const wx = xHeadLeft + u * (nutRearX - xHeadLeft);
                const smooth = Math.sin(u * Math.PI * 0.5);
                let wz = zBack + (zJoint - zBack) * smooth;
                wz += 0.14 * K * yArcCl * yArcCl;
                posR[ri++] = wx;
                posR[ri++] = wy;
                posR[ri++] = wz;
            }
        }
        const row = xs + 1;
        for (let j = 0; j < ys; j++) {
            for (let i = 0; i < xs; i++) {
                const a = j * row + i;
                const b = a + row;
                idxR.push(a, b, a + 1, b, b + 1, a + 1);
            }
        }
        const rampGeo = new T.BufferGeometry();
        rampGeo.setAttribute('position', new T.BufferAttribute(posR, 3));
        rampGeo.setIndex(idxR);
        rampGeo.computeVertexNormals();
        ctx.board.nutHeadstockGroup.add(new T.Mesh(rampGeo, mapleMat));

        const boneMat = new T.MeshStandardMaterial({
            color: nutBase, roughness: 0.38, metalness: 0.02,
        });
        const boneTop = new T.MeshStandardMaterial({
            color: nutHi, roughness: 0.32, metalness: 0.02,
        });
        const grooveMat = new T.MeshStandardMaterial({
            color: nutGro, roughness: 0.85, metalness: 0,
        });

        const nutBody = new T.Mesh(
            new T.BoxGeometry(nutLenX, nutH, nutD),
            boneMat,
        );
        nutBody.position.set(nutXC, yMidN, nutZc);
        ctx.board.nutHeadstockGroup.add(nutBody);

        const crownR = nutLenX * 0.52;
        const crownSeg = new T.CylinderGeometry(
            crownR, crownR, nutLenX * 0.92, 20, 1, true,
            Math.PI * 0.08, Math.PI * 0.42,
        );
        const crown = new T.Mesh(crownSeg, boneTop);
        crown.rotation.z = Math.PI * 0.5;
        crown.position.set(
            nutXC,
            yMidN + nutHalfH - 0.02 * K,
            nutZc + nutD * 0.22,
        );
        ctx.board.nutHeadstockGroup.add(crown);

        const slotDrop = 0.11 * K;
        const slotHalfW = STR_THICK * 1.15;
        const slotZ = nutZc + nutD * 0.12;
        for (let st = 0; st < nStr; st++) {
            const gr = new T.Mesh(
                new T.BoxGeometry(slotHalfW * 2, slotDrop, nutD * 0.42),
                grooveMat,
            );
            gr.position.set(nutXC, sY(st), slotZ);
            ctx.board.nutHeadstockGroup.add(gr);
        }
        ctx.board.nutHeadstockGroup.visible = ctx.settings.nutHeadstockVisible;
        fretG.add(ctx.board.nutHeadstockGroup);
    }

    return { buildNutHeadstock };
}
