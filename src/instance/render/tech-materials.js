import { T } from '../../core/three.js';

/**
 * Technique-marker sprite materials (triangle/chevron/slide-arrow), keyed
 * by a packed number rather than a string — `triMat`/`bendChevronMat` are
 * called from the `drawNote` hot path, so a string-concat key would
 * allocate per note per frame (unlike `text-sprites.js`'s string-keyed
 * cache, which isn't called densely enough for that to matter). Per-instance
 * for the same reason as `text-sprites.js`: a module-level singleton would
 * let splitscreen panels overwrite each other's cache entries.
 */
export function createTechMaterialCache() {
    /** `hex` is a 0xRRGGBB number; the key's low nibble tags the variant (0 ▲, 1 ▼, 3-6 chevron step-count, 8/9 slide arrow) so entries can't collide. */
    const _techMatCache = new Map();

    /** Hammer-on/pull-off triangle marker: a white ▲ (up) / ▼ (down) with a thick border in the gem's string color. */
    function triMat(up, hex) {
        const h = (hex >>> 0) & 0xffffff;
        const key = h * 16 + (up ? 0 : 1);
        const cached = _techMatCache.get(key);
        if (cached) return cached;
        const S = 256, m = S * 0.15;
        const c = document.createElement('canvas');
        c.width = c.height = S;
        const g = c.getContext('2d');
        g.beginPath();
        if (up) { g.moveTo(S / 2, m); g.lineTo(S - m, S - m); g.lineTo(m, S - m); }
        else    { g.moveTo(S / 2, S - m); g.lineTo(S - m, m); g.lineTo(m, m); }
        g.closePath();
        g.lineJoin = 'round';
        g.fillStyle = '#ffffff';
        g.fill();
        g.lineWidth = S * 0.122;
        g.strokeStyle = '#' + (hex >>> 0).toString(16).padStart(6, '0');
        g.stroke();
        const mat = new T.SpriteMaterial({
            map: new T.CanvasTexture(c), transparent: true,
            depthTest: false, depthWrite: false,
        });
        _techMatCache.set(key, mat);
        return mat;
    }

    /** Strength-of-bend chevron stack: `steps` (1-4) chevrons in the gem's string color, one per half-step (chart-format bend notation). */
    function bendChevronMat(steps, hex) {
        const h = (hex >>> 0) & 0xffffff;
        const key = h * 16 + 2 + steps;   // steps 1-4 → low nibble 3-6
        const cached = _techMatCache.get(key);
        if (cached) return cached;
        const S = 256;
        const c = document.createElement('canvas');
        c.width = c.height = S;
        const g = c.getContext('2d');
        g.strokeStyle = '#' + (hex >>> 0).toString(16).padStart(6, '0');
        g.lineWidth = S * 0.10;
        g.lineJoin = g.lineCap = 'round';
        const padX = S * 0.18;
        const rowH = S / steps;
        const amp = Math.min(rowH * 0.55, S * 0.24);
        for (let i = 0; i < steps; i++) {
            const cy = (i + 0.5) * rowH;
            g.beginPath();
            g.moveTo(padX, cy + amp * 0.5);
            g.lineTo(S / 2, cy - amp * 0.5);
            g.lineTo(S - padX, cy + amp * 0.5);
            g.stroke();
        }
        const mat = new T.SpriteMaterial({
            map: new T.CanvasTexture(c), transparent: true,
            depthTest: false, depthWrite: false,
        });
        _techMatCache.set(key, mat);
        return mat;
    }

    /** Slide-direction arrow (›/‹): a filled triangle toward the slide's destination fret, in the gem's already-darkened string color. */
    function slideArrowMat(pointRight, hex) {
        const h = (hex >>> 0) & 0xffffff;
        const key = h * 16 + 8 + (pointRight ? 0 : 1);
        const cached = _techMatCache.get(key);
        if (cached) return cached;
        const S = 256, m = S * 0.18;
        const c = document.createElement('canvas');
        c.width = c.height = S;
        const g = c.getContext('2d');
        g.beginPath();
        if (pointRight) { g.moveTo(S - m, S / 2); g.lineTo(m, m); g.lineTo(m, S - m); }
        else            { g.moveTo(m, S / 2); g.lineTo(S - m, m); g.lineTo(S - m, S - m); }
        g.closePath();
        g.fillStyle = '#' + h.toString(16).padStart(6, '0');
        g.fill();
        const mat = new T.SpriteMaterial({
            map: new T.CanvasTexture(c), transparent: true,
            depthTest: false, depthWrite: false,
        });
        _techMatCache.set(key, mat);
        return mat;
    }

    function disposeAll() {
        for (const tm of _techMatCache.values()) {
            tm.map?.dispose();
            tm.dispose();
        }
        _techMatCache.clear();
    }

    return { triMat, bendChevronMat, slideArrowMat, disposeAll };
}
