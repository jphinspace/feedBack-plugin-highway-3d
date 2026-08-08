import { T } from '../../core/three.js';

/**
 * Bloom: lazy-loads the vendored postprocessing addons and builds an
 * EffectComposer (RenderPass -> UnrealBloomPass -> OutputPass/ACES).
 * `draw()`'s own render dispatch (the toneMapping toggle + `comp.render()`
 * vs `ren.render()` choice) stays in `main.js` as the per-frame
 * orchestration decision.
 *
 * `ren`/`scene`/`cam`/`highwayCanvas` are bare `main.js` closure `let`s
 * reassigned by `initScene()`/`teardown()`, not stable object references,
 * so they're threaded through as live getters — read at call time, same
 * timing as a direct closure-variable read.
 */
export function createBloomComposer({ getRenderer, getScene, getCamera, canvasSize, getHighwayCanvas }) {
    let composer = null;
    let bloomPass = null;
    let bloomLoad = null;
    let bloomW = 0;
    let bloomH = 0;

    function ensureBloomComposer() {
        if (composer) return composer;
        const ren = getRenderer(), scene = getScene(), cam = getCamera();
        if (bloomLoad || !ren || !scene || !cam) return null;
        const A = '/static/vendor/three/addons/';
        bloomLoad = Promise.all([
            import(A + 'postprocessing/EffectComposer.js'),
            import(A + 'postprocessing/RenderPass.js'),
            import(A + 'postprocessing/UnrealBloomPass.js'),
            import(A + 'postprocessing/OutputPass.js'),
        ]).then(([EC, RP, UB, OP]) => {
            try {
                const sz = canvasSize(getHighwayCanvas()) || { w: 1280, h: 720 };
                const w = Math.max(2, sz.w | 0), h = Math.max(2, sz.h | 0);
                // Multisampled (WebGL2 MSAA) HalfFloat target so anti-aliasing survives the
                // bloom path — EffectComposer's default target has no `samples`, which made
                // bloom-on look jagged (worst on non-Retina DPR1 displays).
                const bloomRT = new T.WebGLRenderTarget(w, h, { type: T.HalfFloatType, samples: 4 });
                const comp = new EC.EffectComposer(getRenderer(), bloomRT);
                comp.addPass(new RP.RenderPass(getScene(), getCamera()));
                bloomPass = new UB.UnrealBloomPass(new T.Vector2(w, h), 0.65, 0.5, 0.82); // strength, radius, threshold (high → only emissive blooms)
                comp.addPass(bloomPass);
                comp.addPass(new OP.OutputPass());
                comp.setSize(w, h);
                bloomW = w; bloomH = h; composer = comp;
            } catch (e) { console.warn('[3D-Hwy] bloom init failed', e); composer = null; }
        }).catch((e) => console.warn('[3D-Hwy] bloom modules failed', e));
        return null;
    }

    /** Returns the composer resized to the current canvas backing size, or `null` if not ready. */
    function getResizedBloomComposer() {
        const comp = ensureBloomComposer();
        if (!comp) return null;
        const bsz = canvasSize(getHighwayCanvas());
        if (bsz && bsz.w > 0 && bsz.h > 0 && (bsz.w !== bloomW || bsz.h !== bloomH)) {
            comp.setSize(bsz.w | 0, bsz.h | 0); bloomW = bsz.w | 0; bloomH = bsz.h | 0;
        }
        return comp;
    }

    function disposeBloomComposer() {
        if (composer) {
            try { composer.dispose(); if (bloomPass && bloomPass.dispose) bloomPass.dispose(); } catch (e) {}
            composer = null; bloomPass = null;
        }
    }

    return { getResizedBloomComposer, disposeBloomComposer };
}
