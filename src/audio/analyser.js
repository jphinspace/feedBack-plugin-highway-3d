/* ======================================================================
 *  Background animations (issue #13)
 *
 *  Audio-reactive ambient scenery in the fog band beyond the highway.
 *  Module-level singletons share an AudioContext + AnalyserNode tap on
 *  the feedBack core <audio id="audio"> element across all panel
 *  instances; per-panel settings live in localStorage with a global
 *  fallback so settings.html drives a single default while per-panel
 *  overrides (h3d_bg_panel<idx>_*) can be set for splitscreen layouts.
 *
 *  Caveat: createMediaElementSource() can only be called once per
 *  element. 3dhighway owns that source for now; future plugins
 *  needing an analyser will have to share through a core API.
 * ====================================================================== */

// Returned from _bgReadBands when reactive=false or analyser
// unavailable; shared so the per-frame non-reactive path doesn't
// allocate. Declared up-front because _bgBandsCache initializes to
// it during the same IIFE execution pass.
export const BG_ZERO_BANDS = Object.freeze({ bass: 0, mid: 0, treble: 0 });

// Module-level AudioContext singleton. Intentionally never torn
// down: createMediaElementSource(<audio>) is irrevocable — once
// called, the element's audio is permanently routed through this
// context for the page's lifetime. Closing the context would
// silence playback. The leak (one AudioContext + one AnalyserNode,
// a few KB) is the cost of having a plugin tap audio at all.
let _bgAudio = null;
// The core (#audio-tap) cache is held separately from the stems cache so
// we can switch back to it without re-calling createMediaElementSource on
// #audio — that call is one-shot per element, and a second one throws
// InvalidStateError (which would then be marked permanent and disable
// reactivity forever on legacy songs after any sloppak detour).
let _bgAudioCore = null;
let _bgAudioFailedAt = 0;  // performance.now() of last failure, 0 = never
const _BG_AUDIO_RETRY_MS = 1000;
// _bgReadBands sums bins 0..7 (bass), 8..39 (mid), 40..127 (treble),
// so the frequency buffer must hold at least 128 bins regardless of
// the source analyser's fftSize.
const BG_FREQ_BINS = 128;
const _bgBridgeKeys = new Map();
function _bgRecordAudioBridge(bridgeId, legacySurface, outcome = 'handled', reason = '', status = 'used') {
    const key = `${outcome}:${status}:${reason}`;
    if (_bgBridgeKeys.get(bridgeId) === key) return;
    _bgBridgeKeys.set(bridgeId, key);
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

export function _bgGetAnalyser() {
    // Prefer the stems plugin's side-chain analyser when a sloppak is
    // loaded. As of feedBack-plugin-stems 0.5.0 (sample-locked playback)
    // the #audio element is a silent virtual transport on sloppaks, so
    // tapping it sees only silence; the stems mix is exposed at
    // window.feedBack.stems.getAnalyser() instead. The stems plugin
    // creates and destroys that AnalyserNode per song, so we re-check
    // each call and key the cache on its identity — when the node
    // changes (song switch), the cache is replaced automatically.
    const stemsApi = window.feedBack && window.feedBack.stems;
    const stemsAnalyser = (stemsApi && typeof stemsApi.getAnalyser === 'function')
        ? stemsApi.getAnalyser() : null;
    if (stemsAnalyser) {
        if (!_bgAudio || _bgAudio.source !== 'stems' || _bgAudio.analyser !== stemsAnalyser) {
            // Adopt the live stems analyser. Do NOT close its context — it's
            // shared with stem playback and the stems plugin owns its
            // lifecycle. No play-event resume hooks either; the stems
            // plugin manages context resume itself.
            _bgAudio = {
                ctx: stemsAnalyser.context,
                analyser: stemsAnalyser,
                // _bgReadBands reads bins 0..127 unconditionally. Always
                // allocate at least 128 bytes so a smaller analyser (e.g.
                // fftSize < 256) can't leave undefined values in the loop.
                freq: new Uint8Array(Math.max(BG_FREQ_BINS, stemsAnalyser.frequencyBinCount)),
                source: 'stems',
            };
            _bgRecordAudioBridge('audio-mix.analyser', 'window.feedBack.stems.getAnalyser', 'handled', '', 'stems');
        }
        return _bgAudio;
    }
    // No sloppak active — drop a stale stems-sourced cache, restoring the
    // core-tap cache if we'd already built one. Without this, the next
    // step would try to createMediaElementSource(#audio) a second time
    // (one-shot per element) and throw InvalidStateError — disabling
    // reactivity for the rest of the page lifetime.
    if (_bgAudio && _bgAudio.source === 'stems') _bgAudio = _bgAudioCore;

    if (_bgAudio && !_bgAudio.failed) return _bgAudio;
    if (_bgAudio && _bgAudio.failed) {
        // Distinguish permanent failures from transient ones.
        // InvalidStateError on createMediaElementSource means the
        // <audio> element is already tapped by another consumer —
        // there's no recovering from that without a page reload, so
        // don't retry. Transient failures (NotAllowedError before
        // first user gesture, etc.) get a once-per-second retry so
        // reactivity recovers once the blocking condition clears.
        if (_bgAudio.permanent) return null;
        if (performance.now() - _bgAudioFailedAt < _BG_AUDIO_RETRY_MS) return null;
    }
    const audio = document.getElementById('audio');
    if (!audio) return null;
    // Shared tap: createMediaElementSource is one-shot per element, so
    // the FIRST visualizer to tap #audio publishes it at
    // window.__feedBackAudioTap and every later one (this plugin, the
    // drum/keys 3D highways) adopts it instead of throwing
    // InvalidStateError when visualizers are switched or mixed in
    // splitscreen.
    const sharedTap = window.__feedBackAudioTap;
    if (sharedTap && sharedTap.analyser && sharedTap.mediaEl === audio) {
        _bgAudio = {
            ctx: sharedTap.ctx,
            analyser: sharedTap.analyser,
            freq: new Uint8Array(Math.max(BG_FREQ_BINS, sharedTap.analyser.frequencyBinCount)),
            source: 'core',
        };
        _bgAudioCore = _bgAudio;
        _bgRecordAudioBridge('audio-mix.analyser', 'shared #audio analyser tap', 'handled', '', 'core');
        return _bgAudio;
    }
    // Hoist ctx out of the try so we can close() it if a later step
    // throws (e.g. createMediaElementSource on an element that
    // already has a source node). Otherwise the AudioContext leaks.
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
        _bgAudio = { ctx, analyser, freq: new Uint8Array(Math.max(BG_FREQ_BINS, analyser.frequencyBinCount)), source: 'core' };
        try { window.__feedBackAudioTap = { ctx, analyser, mediaEl: audio }; } catch (_) {}
        _bgRecordAudioBridge('audio-mix.analyser', 'HTMLAudioElement analyser tap', 'handled', '', 'core');
        // Remember the core analyser so a later stems-then-back-to-core
        // transition can re-use it instead of re-tapping #audio (which
        // would throw InvalidStateError on the one-shot per element).
        _bgAudioCore = _bgAudio;
        // Browsers with autoplay restrictions hand back a suspended
        // AudioContext; createMediaElementSource then routes the
        // <audio> through that suspended graph and playback goes
        // silent (and the analyser reads zeros) until we resume.
        // Try once now (fine if the page already had a user gesture)
        // and again on every play event so the first successful
        // user-initiated play unblocks the graph.
        const resume = () => {
            if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
                ctx.resume().catch(() => { /* no gesture yet, retry on next play */ });
            }
        };
        resume();
        audio.addEventListener('play', resume);
        return _bgAudio;
    } catch (e) {
        if (ctx && typeof ctx.close === 'function') {
            try { ctx.close(); } catch (_) { /* close errors during failure path are noise */ }
        }
        console.warn('[3D-Hwy] failed to set up audio analyser:', e);
        const permanent = !!(e && e.name === 'InvalidStateError');
        _bgRecordAudioBridge('audio-mix.analyser', 'HTMLAudioElement analyser tap', 'failed', e && e.message ? e.message : String(e), permanent ? 'permanent-failure' : 'transient-failure');
        _bgAudio = { failed: true, permanent };
        _bgAudioFailedAt = performance.now();
        return null;
    }
}

// Bands cache: in splitscreen, every panel asks for bands per frame.
// The analyser is shared, so the answer is identical — cache for a
// few ms so 4-up splitscreen pays one getByteFrequencyData + one sum
// pass per frame instead of four.
const _BG_BANDS_CACHE_MS = 5;
let _bgBandsLastT = -Infinity;
// Mutable cache reused across reads — refreshing in place keeps the
// per-frame allocation count at zero. Style.update() uses the bands
// synchronously within the same frame so the live-mutation contract
// is safe.
const _bgBandsCache = { bass: 0, mid: 0, treble: 0 };
export function _bgReadBands() {
    const a = _bgGetAnalyser();
    if (!a) return BG_ZERO_BANDS;
    const t = performance.now();
    if (t - _bgBandsLastT < _BG_BANDS_CACHE_MS) return _bgBandsCache;
    _bgBandsLastT = t;
    a.analyser.getByteFrequencyData(a.freq);
    let bass = 0, mid = 0, treble = 0;
    for (let i = 0; i < 8; i++) bass += a.freq[i];
    for (let i = 8; i < 40; i++) mid += a.freq[i];
    for (let i = 40; i < 128; i++) treble += a.freq[i];
    _bgBandsCache.bass = bass / (8 * 255);
    _bgBandsCache.mid = mid / (32 * 255);
    _bgBandsCache.treble = treble / (88 * 255);
    return _bgBandsCache;
}

// src/main.js's __test contract exposes a reset hook for the analyser
// bridge (used by tests/legacy audio-bridge coverage). The state it
// clears is module-private here, so the reset must be a real setter,
// not a direct write from outside this module.
export function _resetAnalyserBridgeForTest() {
    _bgBridgeKeys.clear();
    _bgAudio = null;
    _bgAudioCore = null;
    _bgAudioFailedAt = 0;
}
