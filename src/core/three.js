// Three.js — lazily loaded, memoized. `T` is a live binding: every consumer
// module does `import { T } from '../core/three.js'` and reads `T.Foo` inside
// function bodies. ES live bindings propagate this module's reassignment of
// `T` (inside loadThree()) to every importer automatically.
//
// Do NOT snapshot `T` at module scope in a consumer (`const X = T;` would
// capture `null` forever, since loadThree() hasn't resolved yet when other
// modules are first evaluated). Reading `T.Foo` inside a function body,
// after loadThree()'s promise has resolved, is the only supported pattern.

// Three.js is vendored under static/vendor/three/ in core (pinned r170 —
// see static/vendor/three/VERSION). The bundled plugin loads from the
// same origin to avoid the first-launch CDN round-trip and to pin the
// version against breakages from upstream Three.js drift.
const THREE_URL = '/static/vendor/three/three.module.min.js';
const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';

export let T = null;
let threeLoadPromise = null;
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
