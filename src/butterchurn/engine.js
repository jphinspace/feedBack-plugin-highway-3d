import { _bcLoadSettings } from './prefs.js';

/* ── Butterchurn audio-reactive background ──────────────────────────
 * Mounts a Butterchurn (WebGL MilkDrop) canvas BEHIND the transparent
 * 3D highway. On desktop it's driven by the guitar/mic input (the song
 * audio lives in JUCE, not the webview <audio>); in a browser it taps
 * the song <audio> directly.
 * ──────────────────────────────────────────────────────────────────── */
const BC_VENDOR = '/api/plugins/highway_3d/assets/vendor/';
const BC_FRAME = 1024;
const BC_WORKLET = '/api/plugins/highway_3d/assets/viz-worklet.js';
export const _bcMeters = { gtr: 0, song: 0 }; // live levels shown in the panel readout
let _bcLoading = null;
export function _bcLoadLib() {
    if (_bcLoading) return _bcLoading;
    _bcLoading = new Promise((resolve, reject) => {
        const add = (url, next) => {
            const s = document.createElement('script');
            s.src = url; s.async = true;
            s.onload = next; s.onerror = () => reject(new Error('load ' + url));
            document.head.appendChild(s);
        };
        add(BC_VENDOR + 'butterchurn.min.js', () =>
            add(BC_VENDOR + 'butterchurnPresets.min.js', resolve));
    });
    // Don't cache a rejected promise: a transient load failure (network
    // hiccup, blocked request) must not permanently disable the feature for
    // the session. Clearing _bcLoading lets the next mount retry the load.
    _bcLoading.catch(() => { _bcLoading = null; });
    return _bcLoading;
}
export function _bcResolve() { let b = window.butterchurn; if (b && b.default) b = b.default; return b; }
export function _bcPresets() { let p = window.butterchurnPresets; if (p && p.default) p = p.default; return p; }
export function _bcIsDesktop() {
    const d = window.feedBackDesktop || window.slopsmithDesktop;
    return !!(d && d.isDesktop && d.audio && typeof d.audio.getRawAudioFrame === 'function');
}
// Fast-forward an index to the first entry after time `ct` (used on seek/loop).
// Position at the first entry whose time is >= ct (strict <), so an event
// landing exactly on the seek/loop target time is still fired by the update
// walkers (which consume `<= ct`) instead of being skipped past here.
export function _bcFfIdx(arr, ct, key) { if (!arr) return 0; let i = 0; while (i < arr.length && (arr[i][key] || 0) < ct) i++; return i; }
// Force-free a canvas's WebGL context so the GPU resources are released
// immediately instead of lingering until GC — repeated Butterchurn
// mount/unmount cycles otherwise pile up live contexts toward the browser cap.
export function _bcReleaseCanvasGL(canvas) {
    if (!canvas || typeof canvas.getContext !== 'function') return;
    let gl = null;
    try { gl = canvas.getContext('webgl2') || canvas.getContext('webgl'); } catch (e) { gl = null; }
    if (!gl || typeof gl.getExtension !== 'function') return;
    try { const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); } catch (e) {}
}

// Desktop: bridge GUITAR input PCM + SONG output level into a Web Audio node
// Butterchurn can tap. Guitar gives spectral texture from your playing; the
// song's output meter (getLevels) injects an energy pulse so the visuals also
// react to the backing track (JUCE plays it — there's no song PCM to FFT).
export function _bcGuitarFeed(actx, onReady) {
    const latest = new Float32Array(BC_FRAME);
    let polling = true, songLevel = 0, chartLevel = 0;
    let node = null, sp = null, silent = null;
    const api = (window.feedBackDesktop || window.slopsmithDesktop).audio;
    const gainNow = () => (_bcLoadSettings().guitarGain) || 6;

    // Keep the source node processing (silently — JUCE already monitors the
    // guitar), and hand it to Butterchurn via the onReady callback.
    function attach(srcNode) {
        silent = actx.createGain(); silent.gain.value = 0;
        srcNode.connect(silent); silent.connect(actx.destination);
        try { if (onReady) onReady(srcNode); } catch (e) {}
    }
    // Fallback for contexts without AudioWorklet support.
    function useScriptProcessor() {
        let phase = 0, phase2 = 0;
        const TWO_PI = Math.PI * 2;
        const oscStep = TWO_PI * (90 / actx.sampleRate);
        const oscStep2 = TWO_PI * (520 / actx.sampleRate);
        sp = actx.createScriptProcessor(BC_FRAME, 1, 1);
        sp.onaudioprocess = (e) => {
            const out = e.outputBuffer.getChannelData(0);
            const n = Math.min(out.length, latest.length);
            const lvl = songLevel, clvl = chartLevel, gg = gainNow();
            for (let i = 0; i < out.length; i++) {
                const g = (i < n ? latest[i] : 0) * gg;
                const song = lvl * (0.7 * Math.sin(phase) + 0.3 * (Math.random() * 2 - 1)) * 1.4;
                const chart = clvl * (0.5 * Math.sin(phase2) + 0.5 * (Math.random() * 2 - 1)) * 1.5;
                phase += oscStep; if (phase > TWO_PI) phase -= TWO_PI;
                phase2 += oscStep2; if (phase2 > TWO_PI) phase2 -= TWO_PI;
                const v = g + song + chart;
                out[i] = v > 1 ? 1 : (v < -1 ? -1 : v);
            }
        };
        attach(sp);
        console.log('[viz3d] audio feed: ScriptProcessor (fallback)');
    }

    // Preferred path: AudioWorklet (runs off the main thread).
    if (actx.audioWorklet && typeof actx.audioWorklet.addModule === 'function' && typeof AudioWorkletNode === 'function') {
        actx.audioWorklet.addModule(BC_WORKLET).then(() => {
            if (!polling || sp) return;
            node = new AudioWorkletNode(actx, 'viz-feed', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
            attach(node);
            console.log('[viz3d] audio feed: AudioWorklet');
        }).catch((e) => {
            console.warn('[viz3d] AudioWorklet unavailable, using ScriptProcessor:', e && e.message);
            if (polling && !sp && !node) useScriptProcessor();
        });
    } else {
        useScriptProcessor();
    }

    // Guitar PCM poll → waveform + level meter (+ pushed to the worklet).
    (function pcmLoop() {
        if (!polling) return;
        Promise.resolve(api.getRawAudioFrame(BC_FRAME)).then((f) => {
            if (f && f.length) {
                if (f.length >= BC_FRAME) latest.set(f.subarray(0, BC_FRAME));
                else { latest.fill(0); latest.set(f); }
                let s = 0; for (let i = 0; i < BC_FRAME; i++) s += latest[i] * latest[i];
                _bcMeters.gtr = Math.sqrt(s / BC_FRAME) * gainNow();
                if (node) node.port.postMessage({ frame: latest.slice(0), song: songLevel, chart: chartLevel, gain: gainNow() });
            }
        }).catch(() => {}).then(() => { if (polling) setTimeout(pcmLoop, 16); });
    })();
    // Song output meter poll → music energy pulse.
    (function levelLoop() {
        if (!polling) return;
        Promise.resolve(api.getLevels && api.getLevels()).then((L) => {
            if (L && typeof L.outputLevel === 'number') {
                songLevel = Math.min(1, L.outputLevel * ((_bcLoadSettings().songGain) || 1.8));
                _bcMeters.song = songLevel;
                if (node) node.port.postMessage({ song: songLevel, chart: chartLevel, gain: gainNow() });
            }
        }).catch(() => {}).then(() => { if (polling) setTimeout(levelLoop, 40); });
    })();

    return {
        setChart(v) { chartLevel = v; },
        stop() {
            polling = false;
            try { if (sp) { sp.disconnect(); sp.onaudioprocess = null; } } catch (e) {}
            try { if (node) node.disconnect(); } catch (e) {}
            try { if (silent) silent.disconnect(); } catch (e) {}
        }
    };
}
