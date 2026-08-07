import { T } from '../../core/three.js';
import { pool } from '../../core/pool.js';
import { ARPEGGIO_RIM_BLUE_HEX, K } from '../../core/constants.js';

// Lane fret-divider geometry/materials/pool, and the fret-column reference
// marker pool -- two small, unrelated-but-tiny clusters moved verbatim out
// of initScene() (Stage 7 Track A), bundled into one file since neither is
// big enough to warrant its own.
//
// Construction-time only, no `frame` tier -- built once per initScene()
// call, read (never reassigned) by everything downstream.
export function createLaneDividers({ noteG, _ownedSharedMats }) {
    // Vertical fret dividers within active lane
    const gLaneDivider = new T.BoxGeometry(0.15 * K, 0.15 * K, 1);
    const mLaneDivider = new T.MeshBasicMaterial({
        color: 0x46DDE6, transparent: true, opacity: 1.00, fog: false, depthWrite: false,
    });
    const mLaneDividerArp = new T.MeshBasicMaterial({
        color: ARPEGGIO_RIM_BLUE_HEX,
        transparent: true, opacity: 0.08, fog: false, depthWrite: false,
    });
    const mLaneDividerExt = new T.MeshBasicMaterial({
        color: 0x364D5F, transparent: true, opacity: 0.4, fog: false, depthWrite: false,
    });
    _ownedSharedMats.push(mLaneDivider, mLaneDividerArp, mLaneDividerExt);
    const pLaneDivider = pool(noteG, () => new T.Mesh(gLaneDivider, mLaneDivider));

    return { gLaneDivider, mLaneDivider, mLaneDividerArp, mLaneDividerExt, pLaneDivider };
}

// fog:false prevents the scene fog from gradually dimming the sprite
// as it enters the far end of the highway — opacity is managed
// manually with a short fade-in so the number appears at its
// final size the moment it becomes visible rather than seeming to
// emerge from a tiny dim spec at the horizon.
export function createFretColumnMarkerPool({ lblG, textSprites }) {
    const pFretColMarker = pool(lblG, () => {
        const _sp = new T.Sprite(textSprites.txtMat('0', '#666666', false, 'noteFret').clone());
        // fog=false: prevents scene fog from dimming the sprite as it enters the
        // far end of the highway.  Opacity is managed by the manual fade-in ramp
        // so the number appears smoothly instead of emerging as a dim spec.
        _sp.material.fog = false;
        return _sp;
    });
    return { pFretColMarker };
}
