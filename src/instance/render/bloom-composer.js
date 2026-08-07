import { T } from '../../core/three.js';

// #4 Bloom: lazy-load the vendored postprocessing addons and build an
// EffectComposer (RenderPass -> UnrealBloomPass -> OutputPass/ACES) --
// moved verbatim out of two standalone main.js pieces (a private
// `_bloomEnsure()` function, plus the inline resize-check that used to sit
// right after its call site in draw()) as one cohesive unit (Stage 7,
// post-3e). draw()'s own render-DISPATCH (the toneMapping toggle +
// comp.render() vs ren.render() choice) stays in main.js -- that's the
// per-frame orchestration decision, not a bloom-subsystem concern.
//
// ren/scene/cam/highwayCanvas are all bare main.js closure `let`s
// reassigned by initScene()/teardown() -- not stable object references --
// so they're threaded through as live getters (same shape as dom-and-
// scene.js's getHighwayCanvas), read at call time exactly like the
// original bare-closure reads were. No staleness change from the move:
// the async Promise.all().then() callback below reads getRenderer()/
// getScene()/getCamera() at RESOLUTION time, same timing as the original
// code's closure-variable reads.
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
                // Multisampled (WebGL2 MSAA) HalfFloat target so anti-aliasing
                // survives the bloom path — EffectComposer's default target has no
                // `samples`, which is why bloom-on looked jagged (worst on non-Retina
                // DPR1 displays that have no supersampling cushion).
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

    // Returns the composer, already resized to the current canvas backing
    // size (or null if bloom isn't ready/available yet).
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
