import { loadButterchurnSettings } from './prefs.js';

/**
 * Butterchurn (WebGL MilkDrop) audio-reactive background, mounted behind
 * the transparent 3D highway. On desktop it's driven by guitar/mic input
 * (song audio lives in JUCE, not the webview `<audio>`); in a browser it
 * taps the song `<audio>` directly.
 */
const VENDOR_BASE_URL = '/api/plugins/highway_3d/assets/vendor/';
const PCM_FRAME_SIZE = 1024;
const PCM_WORKLET_URL = '/api/plugins/highway_3d/assets/viz-worklet.js';
/** Live levels shown in the panel readout. */
export const audioMeters = { gtr: 0, song: 0 };
let libLoadPromise = null;

/** Loads the vendored Butterchurn scripts, caching the in-flight promise but not a rejection (so a transient failure can retry on the next mount). */
export function loadButterchurnLib() {
    if (libLoadPromise) return libLoadPromise;
    libLoadPromise = new Promise((resolve, reject) => {
        const add = (url, next) => {
            const s = document.createElement('script');
            s.src = url; s.async = true;
            s.onload = next; s.onerror = () => reject(new Error('load ' + url));
            document.head.appendChild(s);
        };
        add(VENDOR_BASE_URL + 'butterchurn.min.js', () =>
            add(VENDOR_BASE_URL + 'butterchurnPresets.min.js', resolve));
    });
    libLoadPromise.catch(() => { libLoadPromise = null; });
    return libLoadPromise;
}
export function resolveButterchurnGlobal() { let b = window.butterchurn; if (b && b.default) b = b.default; return b; }
export function resolvePresetsGlobal() { let p = window.butterchurnPresets; if (p && p.default) p = p.default; return p; }
export function isDesktopAudioHost() {
    const d = window.feedBackDesktop || window.slopsmithDesktop;
    return !!(d && d.isDesktop && d.audio && typeof d.audio.getRawAudioFrame === 'function');
}

/** Index of the first entry in `arr` at or after time `ct` (used on seek/loop). */
export function fastForwardIndex(arr, ct, key) { if (!arr) return 0; let i = 0; while (i < arr.length && (arr[i][key] || 0) < ct) i++; return i; }

/** Force-frees a canvas's WebGL context immediately, so repeated mount/unmount doesn't pile up live contexts toward the browser cap. */
export function releaseCanvasGL(canvas) {
    if (!canvas || typeof canvas.getContext !== 'function') return;
    let gl = null;
    try { gl = canvas.getContext('webgl2') || canvas.getContext('webgl'); } catch (e) { gl = null; }
    if (!gl || typeof gl.getExtension !== 'function') return;
    try { const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); } catch (e) {}
}

/**
 * Desktop only: bridges guitar input PCM + song output level into a Web
 * Audio node Butterchurn can tap. Guitar gives spectral texture; the song's
 * output meter injects an energy pulse since JUCE plays it with no PCM to FFT.
 */
export function createGuitarPcmFeed(actx, onReady) {
    const latest = new Float32Array(PCM_FRAME_SIZE);
    let polling = true, songLevel = 0, chartLevel = 0;
    let node = null, sp = null, silent = null;
    const api = (window.feedBackDesktop || window.slopsmithDesktop).audio;
    const gainNow = () => (loadButterchurnSettings().guitarGain) || 6;

    function attach(srcNode) {
        silent = actx.createGain(); silent.gain.value = 0;
        srcNode.connect(silent); silent.connect(actx.destination);
        try { if (onReady) onReady(srcNode); } catch (e) {}
    }
    /** Fallback for contexts without AudioWorklet support. */
    function useScriptProcessor() {
        let phase = 0, phase2 = 0;
        const TWO_PI = Math.PI * 2;
        const oscStep = TWO_PI * (90 / actx.sampleRate);
        const oscStep2 = TWO_PI * (520 / actx.sampleRate);
        sp = actx.createScriptProcessor(PCM_FRAME_SIZE, 1, 1);
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

    if (actx.audioWorklet && typeof actx.audioWorklet.addModule === 'function' && typeof AudioWorkletNode === 'function') {
        actx.audioWorklet.addModule(PCM_WORKLET_URL).then(() => {
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
        Promise.resolve(api.getRawAudioFrame(PCM_FRAME_SIZE)).then((f) => {
            if (f && f.length) {
                if (f.length >= PCM_FRAME_SIZE) latest.set(f.subarray(0, PCM_FRAME_SIZE));
                else { latest.fill(0); latest.set(f); }
                let s = 0; for (let i = 0; i < PCM_FRAME_SIZE; i++) s += latest[i] * latest[i];
                audioMeters.gtr = Math.sqrt(s / PCM_FRAME_SIZE) * gainNow();
                if (node) node.port.postMessage({ frame: latest.slice(0), song: songLevel, chart: chartLevel, gain: gainNow() });
            }
        }).catch(() => {}).then(() => { if (polling) setTimeout(pcmLoop, 16); });
    })();
    // Song output meter poll → music energy pulse.
    (function levelLoop() {
        if (!polling) return;
        Promise.resolve(api.getLevels && api.getLevels()).then((L) => {
            if (L && typeof L.outputLevel === 'number') {
                songLevel = Math.min(1, L.outputLevel * ((loadButterchurnSettings().songGain) || 1.8));
                audioMeters.song = songLevel;
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
