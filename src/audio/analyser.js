/**
 * Shared AudioContext/AnalyserNode tap on feedBack core's `<audio id="audio">`
 * element, used by every audio-reactive background style across all panel
 * instances. `createMediaElementSource()` is one-shot per element and
 * irrevocable, so the tap is a module-level singleton, never torn down.
 */

/** Returned by {@link readAudioBands} when reactive=false or no analyser is available. */
export const ZERO_AUDIO_BANDS = Object.freeze({ bass: 0, mid: 0, treble: 0 });

let audioTap = null;
/** The core `#audio` tap, held separately so switching back from stems doesn't re-tap `#audio` (one-shot, throws `InvalidStateError` on a second call). */
let coreAudioTap = null;
let audioTapFailedAt = 0;
const AUDIO_TAP_RETRY_MS = 1000;
/** {@link readAudioBands} sums bins 0..127; the buffer must hold at least that many regardless of the source analyser's `fftSize`. */
const FREQ_BIN_COUNT = 128;
const audioBridgeKeys = new Map();

function recordAudioBridge(bridgeId, legacySurface, outcome = 'handled', reason = '', status = 'used') {
    const key = `${outcome}:${status}:${reason}`;
    if (audioBridgeKeys.get(bridgeId) === key) return;
    audioBridgeKeys.set(bridgeId, key);
    const session = window.feedBack && window.feedBack.audioSession;
    if (!session || typeof session.recordBridgeHit !== 'function') return;
    try {
        session.recordBridgeHit({
            domain: 'audio-mix',
            bridgeId,
            legacySurface,
            participantId: 'highway_3d',
            outcome,
            status,
            reason,
        });
    } catch (_) { /* diagnostics are best-effort */ }
}

/**
 * Resolves the active analyser tap: the stems plugin's side-chain analyser
 * when a sloppak is loaded (its `#audio` element is a silent virtual
 * transport), else a shared tap on `#audio` published at
 * `window.__feedBackAudioTap` so multiple visualizers can adopt the same
 * one-shot source. Permanent failures (`InvalidStateError`) return `null`
 * forever; transient failures retry every {@link AUDIO_TAP_RETRY_MS}.
 * @returns {{ctx: AudioContext, analyser: AnalyserNode, freq: Uint8Array, source: string} | null}
 */
export function getAudioAnalyser() {
    const stemsApi = window.feedBack && window.feedBack.stems;
    const stemsAnalyser = (stemsApi && typeof stemsApi.getAnalyser === 'function')
        ? stemsApi.getAnalyser() : null;
    if (stemsAnalyser) {
        if (!audioTap || audioTap.source !== 'stems' || audioTap.analyser !== stemsAnalyser) {
            // The stems plugin owns this context's lifecycle: don't close it, don't hook resume.
            audioTap = {
                ctx: stemsAnalyser.context,
                analyser: stemsAnalyser,
                freq: new Uint8Array(Math.max(FREQ_BIN_COUNT, stemsAnalyser.frequencyBinCount)),
                source: 'stems',
            };
            recordAudioBridge('audio-mix.analyser', 'window.feedBack.stems.getAnalyser', 'handled', '', 'stems');
        }
        return audioTap;
    }
    if (audioTap && audioTap.source === 'stems') audioTap = coreAudioTap;

    if (audioTap && !audioTap.failed) return audioTap;
    if (audioTap && audioTap.failed) {
        if (audioTap.permanent) return null;
        if (performance.now() - audioTapFailedAt < AUDIO_TAP_RETRY_MS) return null;
    }
    const audio = document.getElementById('audio');
    if (!audio) return null;
    const sharedTap = window.__feedBackAudioTap;
    if (sharedTap && sharedTap.analyser && sharedTap.mediaEl === audio) {
        audioTap = {
            ctx: sharedTap.ctx,
            analyser: sharedTap.analyser,
            freq: new Uint8Array(Math.max(FREQ_BIN_COUNT, sharedTap.analyser.frequencyBinCount)),
            source: 'core',
        };
        coreAudioTap = audioTap;
        recordAudioBridge('audio-mix.analyser', 'shared #audio analyser tap', 'handled', '', 'core');
        return audioTap;
    }
    let ctx = null;
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) throw new Error('Web Audio API not available');
        ctx = new Ctx();
        const source = ctx.createMediaElementSource(audio);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyser.connect(ctx.destination);
        audioTap = { ctx, analyser, freq: new Uint8Array(Math.max(FREQ_BIN_COUNT, analyser.frequencyBinCount)), source: 'core' };
        try { window.__feedBackAudioTap = { ctx, analyser, mediaEl: audio }; } catch (_) {}
        recordAudioBridge('audio-mix.analyser', 'HTMLAudioElement analyser tap', 'handled', '', 'core');
        coreAudioTap = audioTap;
        // Autoplay restrictions can hand back a suspended context; retry resume on every play
        // event so the first user-initiated play unblocks the graph.
        const resume = () => {
            if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
                ctx.resume().catch(() => { /* no gesture yet, retry on next play */ });
            }
        };
        resume();
        audio.addEventListener('play', resume);
        return audioTap;
    } catch (e) {
        if (ctx && typeof ctx.close === 'function') {
            try { ctx.close(); } catch (_) { /* close errors during failure path are noise */ }
        }
        console.warn('[3D-Hwy] failed to set up audio analyser:', e);
        const permanent = !!(e && e.name === 'InvalidStateError');
        recordAudioBridge('audio-mix.analyser', 'HTMLAudioElement analyser tap', 'failed', e && e.message ? e.message : String(e), permanent ? 'permanent-failure' : 'transient-failure');
        audioTap = { failed: true, permanent };
        audioTapFailedAt = performance.now();
        return null;
    }
}

const BANDS_CACHE_MS = 5;
let bandsLastReadT = -Infinity;
/** Mutated in place each read (never reallocated) so per-frame reads cost zero allocations. */
const bandsCache = { bass: 0, mid: 0, treble: 0 };

/** Reads normalized bass/mid/treble energy (0..1), cached for {@link BANDS_CACHE_MS} so splitscreen panels share one read per frame. */
export function readAudioBands() {
    const a = getAudioAnalyser();
    if (!a) return ZERO_AUDIO_BANDS;
    const t = performance.now();
    if (t - bandsLastReadT < BANDS_CACHE_MS) return bandsCache;
    bandsLastReadT = t;
    a.analyser.getByteFrequencyData(a.freq);
    let bass = 0, mid = 0, treble = 0;
    for (let i = 0; i < 8; i++) bass += a.freq[i];
    for (let i = 8; i < 40; i++) mid += a.freq[i];
    for (let i = 40; i < 128; i++) treble += a.freq[i];
    bandsCache.bass = bass / (8 * 255);
    bandsCache.mid = mid / (32 * 255);
    bandsCache.treble = treble / (88 * 255);
    return bandsCache;
}

/** Resets module state for tests; the state is private, so a real reset function is required. */
export function _resetAnalyserBridgeForTest() {
    audioBridgeKeys.clear();
    audioTap = null;
    coreAudioTap = null;
    audioTapFailedAt = 0;
}
