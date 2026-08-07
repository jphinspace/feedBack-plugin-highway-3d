const THREE_URL = '/static/vendor/three/three.module.min.js';
const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';

/**
 * The loaded Three.js module, or `null` until {@link loadThree} resolves.
 * A live binding: read `T.Foo` inside a function body, never snapshot it
 * at module scope (`const X = T` captures `null` forever).
 */
export let T = null;

let threeLoadPromise = null;

/** Loads Three.js (vendored, falling back to a CDN copy) and resolves once `T` is set. */
export function loadThree() {
    if (!threeLoadPromise) {
        threeLoadPromise = import(THREE_URL)
            .then(mod => { T = mod; return mod; })
            .catch(() => import(THREE_CDN)
                .then(mod => { T = mod; return mod; })
                .catch(e => {
                    console.error('[3D-Hwy] Three.js load failed:', e);
                    threeLoadPromise = null;
                    throw e;
                }));
    }
    return threeLoadPromise;
}

/** Test seam: node --test has no CDN and no WebGL. */
export function __setThreeForTest(mod) { T = mod; }
