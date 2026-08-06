import { K, VENUE_HAZE_STEADY } from '../core/constants.js';
import { _bgEmitChange } from '../settings/store.js';

// Venue viz mode: a small-club stage backdrop (static plate + optional
// crowd video layers + haze) that replaces the normal off/particles/
// silhouettes/etc background when active. Reached only through the
// viz-picker Venue flow (window.h3dVenueSceneSetActive), never a
// user-selectable h3d_bg_style value -- see settings/defaults.js's note on
// why 'venue' is deliberately absent from BG_STYLE_IDS.
//
// The setters below (h3dVenueSceneSetActive etc.) are named exports bound
// onto window by src/globals.js, same contract as settings/setters.js.
//
// _venueSetSceneAssetsLoaded/_venueSetSceneLoadFailed/_venueSetSceneOverride
// exist ONLY because src/main.js's BG_STYLES.venue entry (not extracted
// until Stage 6 -- it's the renderer half of this feature, this file is the
// state/setter half) needs to write this module's state from outside it,
// which only the declaring module can do directly. Prefer a real setter
// here over exporting the raw `let` as a live binding for state an outside
// caller needs to WRITE, not just read.

export const VENUE_SCENE_ASSET_BASE = '/static/assets/venue/themes/small-club/';
export const VENUE_BG_PLATE_PNG = 'bg-plate.png';
export const VENUE_BG_PLATE_WEBP = 'bg-plate.webp';
export const VENUE_INSTRUMENT_PLATES = {
    guitar: { webp: 'guitar-pov-bg.webp', png: 'guitar-pov-bg.png' },
    bass: { webp: 'bass-pov-bg.webp', png: 'bass-pov-bg.png' },
    drums: { webp: 'drums-pov-bg.webp', png: 'drums-pov-bg.png' },
    piano: { webp: 'piano-pov-bg.webp', png: 'piano-pov-bg.png' },
    vocals: { webp: 'vocals-pov-bg.webp', png: 'vocals-pov-bg.png' },
};
export let _venueSceneOverride = false;
export let _venueMoodState = 'idle';
export let _venueInstrumentPov = 'guitar';
export let _venueMotionMode = 'subtle';
export let _venuePlateUrl = '';
export let _venueSceneAssetsLoaded = false;
export let _venueSceneLoadFailed = false;
export const _venueTextureCache = new Map();
// Crowd video layers (career mode). venue-crowd.js owns the <video>
// elements and the crossfade timing; the renderer only maps them onto
// two planes in front of the static plate. _venueCrowdRev bumps on any
// element (re)assignment so update() knows to rebind textures.
export const _venueCrowdVideos = [null, null];
export let _venueCrowdMix = 0;
export let _venueCrowdRev = 0;

export function _bgVenueMoodCoeffs(state) {
    const s = String(state || 'idle').toLowerCase();
    if (s === 'fire' || s === 'strong') {
        return { light: 1.0, crowd: 0, haze: 0.012, warmth: 1.02 };
    }
    if (s === 'recovery' || s === 'smoke') {
        return { light: 0.55, crowd: 0, haze: 0.032, warmth: 0.94 };
    }
    return { light: 0.72, crowd: 0, haze: VENUE_HAZE_STEADY, warmth: 0.96 };
}

export function _venueResolvePovFromInput(input) {
    if (typeof window !== 'undefined' && window.v3VenueInstrumentPov &&
        typeof window.v3VenueInstrumentPov.resolveVenueInstrumentPov === 'function') {
        return window.v3VenueInstrumentPov.resolveVenueInstrumentPov(input);
    }
    const s = String(input == null ? '' : input).trim().toLowerCase();
    if (!s) return 'guitar';
    if (/\b(drums?)\b/.test(s)) return 'drums';
    if (/\b(bass)\b/.test(s)) return 'bass';
    if (/\b(piano|keys|keyboard)\b/.test(s)) return 'piano';
    if (/\b(karaoke|vocal|vocals|lyric|lyrics|sing|singing)\b/.test(s)) return 'vocals';
    if (/\b(lead|rhythm|guitar|combo)\b/.test(s)) return 'guitar';
    return 'guitar';
}

export function _venueMotionProfile(mode) {
    if (typeof window !== 'undefined' && window.v3VenueMoodFx &&
        typeof window.v3VenueMoodFx.venueMotionProfile === 'function') {
        return window.v3VenueMoodFx.venueMotionProfile(mode);
    }
    const m = String(mode || 'subtle').toLowerCase();
    if (m === 'off') {
        return { breathe: 0, parallax: 0, hazeDrift: 0, warmthPulse: 0, shimmer: 0 };
    }
    if (m === 'full') {
        return { breathe: 0.014, parallax: 0.010, hazeDrift: 0.020, warmthPulse: 0.028, shimmer: 0.10 };
    }
    return { breathe: 0.005, parallax: 0.004, hazeDrift: 0.007, warmthPulse: 0.010, shimmer: 0.04 };
}

export function _venuePrefersReducedMotion() {
    if (typeof window !== 'undefined' && window.v3VenueMoodFx &&
        typeof window.v3VenueMoodFx.prefersReducedMotion === 'function') {
        return window.v3VenueMoodFx.prefersReducedMotion();
    }
    return false;
}

export function _venueEffectiveMotionMode() {
    if (!_venueSceneOverride) return 'off';
    if (_venuePrefersReducedMotion()) return 'off';
    return _venueMotionMode;
}

export function _venueApplyFakeDepthMotion(s, coeffs, t) {
    const motion = _venueMotionProfile(_venueEffectiveMotionMode());
    if (!motion.breathe && !motion.parallax && !motion.hazeDrift && !motion.warmthPulse) {
        if (s.haze && s.haze.mesh) {
            s.haze.mesh.position.set(s.haze.baseX, s.haze.baseY, s.haze.baseZ);
        }
        return motion;
    }
    const breath = Math.sin(t * 0.38);
    const parallax = Math.sin(t * 0.21);
    const shimmer = Math.sin(t * 0.55);
    if (s.backdrop && s.backdrop.loaded && s.backdrop.mesh) {
        const mesh = s.backdrop.mesh;
        const vh = s.backdrop.lastVisibleHeight || 1;
        const vw = s.backdrop.lastVisibleWidth || vh;
        const offX = parallax * motion.parallax * vh;
        const offY = breath * motion.breathe * vh * 0.35;
        mesh.position.x += offX;
        mesh.position.y += offY;
        const scaleMul = 1 + breath * motion.breathe * 2.5;
        mesh.scale.set(vw * scaleMul, vh * scaleMul, 1);
        if (s.backdrop.mat) {
            const warm = coeffs.warmth;
            const warmPulse = 1 + shimmer * motion.warmthPulse;
            s.backdrop.mat.color.setRGB(
                warm * warmPulse,
                warm * 0.98 * warmPulse,
                warm * 0.95 * (1 + shimmer * motion.warmthPulse * 0.6),
            );
        }
    } else if (s.backdrop && s.backdrop.mat) {
        const warm = coeffs.warmth;
        s.backdrop.mat.color.setRGB(warm, warm * 0.98, warm * 0.95);
    }
    if (s.haze && s.haze.mesh) {
        const driftX = Math.sin(t * 0.18) * motion.hazeDrift * 8 * K;
        const driftY = Math.cos(t * 0.14) * motion.hazeDrift * 4 * K;
        s.haze.mesh.position.set(
            s.haze.baseX + driftX,
            s.haze.baseY + driftY,
            s.haze.baseZ,
        );
        if (s.haze.mat) {
            const baseOp = (s.haze.baseOp || VENUE_HAZE_STEADY) * (coeffs.haze / VENUE_HAZE_STEADY);
            s.haze.mat.opacity = baseOp * (1 + shimmer * motion.shimmer * 0.12);
        }
    }
    return motion;
}

export function _venuePlateUrlChain(pov) {
    const plate = VENUE_INSTRUMENT_PLATES[pov] || VENUE_INSTRUMENT_PLATES.guitar;
    const base = VENUE_SCENE_ASSET_BASE;
    return [
        base + plate.webp,
        base + plate.png,
        base + VENUE_BG_PLATE_WEBP,
        base + VENUE_BG_PLATE_PNG,
    ];
}

export function _venueLoadCachedTexture(loader, url, onSuccess, onFail) {
    const cached = _venueTextureCache.get(url);
    if (cached) {
        onSuccess(cached, url);
        return;
    }
    loader.load(
        url,
        (tex) => {
            _venueTextureCache.set(url, tex);
            onSuccess(tex, url);
        },
        undefined,
        onFail,
    );
}

export function _venueApplyPlateTexture(backdrop, tex, url) {
    backdrop.tex = tex;
    backdrop.plateUrl = url;
    _venuePlateUrl = url;
    backdrop.mat.map = tex;
    backdrop.mat.needsUpdate = true;
    if (backdrop.applyCoverCrop) backdrop.applyCoverCrop();
    backdrop.loaded = true;
    backdrop.mesh.visible = true;
}

export function _venueLoadPlateForPov(loader, pov, backdrop, onSuccess, onFail) {
    const chain = _venuePlateUrlChain(pov);
    let idx = 0;
    function tryNext() {
        if (idx >= chain.length) {
            onFail();
            return;
        }
        const url = chain[idx++];
        _venueLoadCachedTexture(loader, url, (tex, loadedUrl) => {
            _venueApplyPlateTexture(backdrop, tex, loadedUrl);
            onSuccess(tex, loadedUrl);
        }, tryNext);
    }
    tryNext();
}

export function _venueSwapPlateIfNeeded(s) {
    if (!s || s.failed || s.plateLoading || !s.loader || !s.backdrop) return;
    const pov = _venueInstrumentPov;
    if (s.instrumentPov === pov && s.backdrop.loaded) return;
    s.plateLoading = true;
    _venueLoadPlateForPov(
        s.loader,
        pov,
        s.backdrop,
        () => {
            s.instrumentPov = pov;
            s.plateLoading = false;
            s.loaded = true;
            _venueSceneAssetsLoaded = true;
            _venueSceneLoadFailed = false;
            // The POV may have changed while this load was in flight (the
            // plateLoading latch made concurrent swaps no-op). Re-sync to the
            // current target so the backdrop isn't stranded on a stale plate.
            if (_venueInstrumentPov !== pov) _venueSwapPlateIfNeeded(s);
        },
        () => {
            s.plateLoading = false;
            if (s.backdrop.loaded) return;
            s.failed = true;
            _venueSceneLoadFailed = true;
            _venueSceneAssetsLoaded = false;
            console.warn('[venue-scene] failed to load venue bg plate for pov ' + pov);
            _venueSceneOverride = false;
            _bgEmitChange('venueScene');
            try {
                if (typeof window !== 'undefined' && window.v3VenueScene3d &&
                    typeof window.v3VenueScene3d.onAssetsFailed === 'function') {
                    window.v3VenueScene3d.onAssetsFailed('failed to load venue bg plate');
                }
            } catch (_) { /* visual-only */ }
        },
    );
}

export const h3dVenueSceneSetActive = (on) => {
    const next = !!on;
    if (_venueSceneOverride === next) return;
    _venueSceneOverride = next;
    if (!next) {
        _venueSceneAssetsLoaded = false;
        _venueSceneLoadFailed = false;
    }
    _bgEmitChange('venueScene');
};
export const h3dVenueSceneSetMood = (state) => {
    _venueMoodState = String(state || 'idle').toLowerCase();
};
// Crowd video layers (career mode) — see venue-crowd.js. Layer 0/1 are
// two coplanar backdrop planes; mix selects between them (0 → layer 0,
// 1 → layer 1) so the caller can crossfade loop videos.
export const h3dVenueBackdropSetVideo = (layer, videoEl) => {
    const i = layer ? 1 : 0;
    const el = videoEl || null;
    if (_venueCrowdVideos[i] === el) return;
    _venueCrowdVideos[i] = el;
    _venueCrowdRev++;
};
export const h3dVenueBackdropSetMix = (mix) => {
    const v = Number(mix);
    _venueCrowdMix = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
};
export const h3dVenueSceneSetInstrumentPov = (input) => {
    const next = _venueResolvePovFromInput(input);
    if (_venueInstrumentPov === next) return;
    _venueInstrumentPov = next;
    _bgEmitChange('venueInstrumentPov');
};
export const h3dVenueSceneSetMotionMode = (mode) => {
    const next = String(mode || 'subtle').toLowerCase();
    const allowed = { off: 1, subtle: 1, full: 1 };
    _venueMotionMode = allowed[next] ? next : 'subtle';
};
export const h3dVenueSceneGetState = () => {
    const motionMode = _venueEffectiveMotionMode();
    const motionProfile = _venueMotionProfile(motionMode);
    return {
        active: _venueSceneOverride,
        mood: _venueMoodState,
        instrumentPov: _venueInstrumentPov,
        motionMode: _venueMotionMode,
        motionEffective: motionMode,
        motionEnabled: motionMode !== 'off',
        motionIntensity: motionProfile.breathe + motionProfile.parallax + motionProfile.hazeDrift,
        motionProfile,
        plateUrl: _venuePlateUrl || null,
        assetsLoaded: _venueSceneAssetsLoaded,
        loadFailed: _venueSceneLoadFailed,
    };
};

// See the module doc comment: BG_STYLES.venue (src/main.js) calls these
// instead of assigning _venueSceneAssetsLoaded/_venueSceneLoadFailed/
// _venueSceneOverride directly.
export function _venueSetSceneAssetsLoaded(v) { _venueSceneAssetsLoaded = v; }
export function _venueSetSceneLoadFailed(v) { _venueSceneLoadFailed = v; }
export function _venueSetSceneOverride(v) { _venueSceneOverride = v; }
