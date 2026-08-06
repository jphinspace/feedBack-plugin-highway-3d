import {
    _bcFfIdx, _bcGuitarFeed, _bcIsDesktop, _bcLoadLib, _bcPresets, _bcReleaseCanvasGL, _bcResolve,
} from './engine.js';
import {
    _bcBanned, _bcControllers, _bcFavorites, _bcLoadLists, _bcLoadSettings, _bcSaveLists,
} from './prefs.js';
import { _bcEnsurePanel, _bcPrimary, _bcSetPrimary, _bcTeardownPanel, _bcUpdatePanelPreset } from './panel.js';

// Browser audio is sourced by REUSING the highway's own shared analyser
// (the same #audio / stems side-chain tap the fog scenery uses), passed in
// as `audioProvider` to _bcCreateController. We deliberately do NOT open a
// second createMediaElementSource on #audio here: it can only be called
// once per element (a second tap throws InvalidStateError and permanently
// disables the other consumer), it would route the song through a fresh,
// possibly-suspended context and mute playback, and it would miss the stems
// side-chain that sloppaks expose at window.feedBack.stems.getAnalyser().
// Create a Butterchurn background controller bound to a wrap element.
export function _bcCreateController(wrap, sizeProvider, audioProvider) {
    const ctrl = { viz: null, actx: null, guitar: null, map: null, keys: [], cycle: 0, dead: false, lastW: -1, lastH: -1, canvas: null, backdrop: null, scrim: null, tint: null, wrap: wrap };
    // Layered DOM in the wrap, all BEHIND the transparent 3D highway:
    //   backdrop(z-4 dark) → bc canvas(z-3) → tint(z-2 instrument color) → scrim(z-1 lane dim)
    const mkLayer = (cls, css) => { const d = document.createElement('div'); d.className = cls; d.style.cssText = css; wrap.appendChild(d); return d; };
    const backdrop = mkLayer('viz3d-backdrop', 'position:absolute;top:0;left:0;right:0;bottom:0;z-index:-4;background:#070710;pointer-events:none;');
    const canvas = document.createElement('canvas');
    canvas.className = 'viz3d-bc';
    canvas.style.cssText = 'position:absolute;top:0;left:0;z-index:-3;pointer-events:none;';
    wrap.appendChild(canvas);
    const tint = mkLayer('viz3d-tint', 'position:absolute;top:0;left:0;right:0;bottom:0;z-index:-2;pointer-events:none;mix-blend-mode:overlay;background:transparent;');
    const scrim = mkLayer('viz3d-scrim', 'position:absolute;top:0;left:0;right:0;bottom:0;z-index:-1;pointer-events:none;');
    ctrl.canvas = canvas; ctrl.backdrop = backdrop; ctrl.scrim = scrim; ctrl.tint = tint;

    ctrl.applySettings = function () {
        const s = _bcLoadSettings();
        canvas.style.display = s.enabled ? '' : 'none';
        canvas.style.opacity = String(s.enabled ? s.opacity : 0);
        if (s.laneDim) {
            const a = Math.max(0, Math.min(1, s.laneDimStrength)).toFixed(3);
            scrim.style.display = '';
            scrim.style.background = 'linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,' + a +
                ') 30%, rgba(0,0,0,' + a + ') 70%, rgba(0,0,0,0) 100%)';
        } else {
            scrim.style.display = 'none';
        }
    };

    // ── Preset curation (favorites / bans / cycle mode) ──
    ctrl.curName = null; ctrl.lastManual = 0;
    ctrl.allList = () => (ctrl.keys || []).filter((k) => !_bcBanned.has(k));
    ctrl.pool = () => {
        const mode = _bcLoadSettings().cyclePool || 'all';
        if (mode === 'bans') return (ctrl.keys || []).filter((k) => _bcBanned.has(k));
        if (mode === 'favorites') {
            const f = (ctrl.keys || []).filter((k) => _bcFavorites.has(k) && !_bcBanned.has(k));
            if (f.length) return f;
        }
        return ctrl.allList();
    };
    ctrl.browseArr = () => ctrl.keys || []; // ◀▶ and the list pane walk the full preset list
    ctrl.loadByName = (name, blend) => {
        if (!ctrl.viz || !name || !ctrl.map || !ctrl.map[name]) return;
        try { ctrl.viz.loadPreset(ctrl.map[name], blend || 0); ctrl.curName = name; } catch (e) {}
        _bcUpdatePanelPreset();
    };
    ctrl.autoTick = () => {
        if (ctrl.dead || _bcLoadSettings().hold) return;
        if (performance.now() - ctrl.lastManual < 8000) return;
        const pool = ctrl.pool();
        if (!pool.length) return;
        let name = pool[(Math.random() * pool.length) | 0];
        if (pool.length > 1 && name === ctrl.curName) name = pool[(pool.indexOf(name) + 1) % pool.length];
        ctrl.loadByName(name, 2.7);
    };
    ctrl.step = (dir) => {
        const list = ctrl.browseArr();
        if (!list.length) return;
        let i = list.indexOf(ctrl.curName); if (i < 0) i = (dir > 0 ? -1 : 0);
        i = (i + dir + list.length) % list.length;
        ctrl.lastManual = performance.now();
        ctrl.loadByName(list[i], 1.5);
    };
    ctrl.toggleFav = () => {
        if (!ctrl.curName) return;
        if (_bcFavorites.has(ctrl.curName)) _bcFavorites.delete(ctrl.curName);
        else { _bcFavorites.add(ctrl.curName); _bcBanned.delete(ctrl.curName); }
        _bcSaveLists(); _bcUpdatePanelPreset();
    };
    ctrl.banCur = () => {
        if (!ctrl.curName) return;
        if (_bcBanned.has(ctrl.curName)) {           // un-ban (two-way) — stay on it
            _bcBanned.delete(ctrl.curName);
            _bcSaveLists(); _bcUpdatePanelPreset();
        } else {                                     // ban + advance off it
            _bcBanned.add(ctrl.curName); _bcFavorites.delete(ctrl.curName);
            _bcSaveLists(); ctrl.step(1);
        }
    };
    _bcSetPrimary(ctrl);

    _bcControllers.add(ctrl);
    _bcEnsurePanel(wrap);
    ctrl.applySettings();

    _bcLoadLib().then(() => {
        if (ctrl.dead) return;
        const bc = _bcResolve();
        if (!bc || typeof bc.createVisualizer !== 'function') { console.warn('[viz3d] Butterchurn global missing'); return; }
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const sz = (sizeProvider && sizeProvider()) || { w: 1280, h: 720 };
        // Browser (Docker/web app): REUSE the highway's existing shared
        // analyser (the fog scenery's #audio / stems tap) via audioProvider,
        // and build Butterchurn on that SAME AudioContext so connectAudio()
        // doesn't fail cross-context. Desktop uses its own context fed by the
        // guitar/mic input. `ownsActx` tracks whether WE created the context
        // (so destroy() closes only contexts we own, never the shared one).
        const fogAudio = _bcIsDesktop() ? null : (audioProvider ? audioProvider() : null);
        ctrl.ownsActx = !(fogAudio && fogAudio.ctx);
        ctrl.actx = (fogAudio && fogAudio.ctx) || new Ctx();
        if (ctrl.actx.state === 'suspended' && ctrl.actx.resume) ctrl.actx.resume().catch(() => {});
        // Seed the DRAWING BUFFER (canvas.width/height) to the device-pixel
        // render size and report that SAME size to Butterchurn. Its on-screen
        // pass viewports to the reported size but never sizes the output canvas
        // itself — leaving the buffer at the 300x150 default blits the whole
        // visualizer into a corner that CSS then stretches across the highway.
        // pixelRatio:1 because DPR is now folded into the reported size, so
        // buffer == viewport == internal texsize (no double-counting).
        const _bcRatio0 = Math.min(window.devicePixelRatio || 1, 1.5);
        const _bcW0 = Math.max(1, Math.round((sz.w || 1280) * _bcRatio0));
        const _bcH0 = Math.max(1, Math.round((sz.h || 720) * _bcRatio0));
        canvas.width = _bcW0; canvas.height = _bcH0;
        ctrl.viz = bc.createVisualizer(ctrl.actx, canvas, {
            width: _bcW0, height: _bcH0,
            pixelRatio: 1, textureRatio: 1,
        });
        if (_bcIsDesktop()) {
            try {
                ctrl.guitar = _bcGuitarFeed(ctrl.actx, (srcNode) => { try { if (ctrl.viz) ctrl.viz.connectAudio(srcNode); } catch (e) {} });
                console.log('[viz3d] bg: feeding GUITAR input into Butterchurn');
            } catch (e) { console.warn('[viz3d] guitar feed failed', e); }
        } else if (fogAudio && fogAudio.analyser) {
            // The shared AnalyserNode is a passthrough — connecting it onward
            // to Butterchurn's internal analyser doesn't disturb the fog's reads.
            try { ctrl.viz.connectAudio(fogAudio.analyser); console.log('[viz3d] browser: Butterchurn tapping shared analyser (' + (fogAudio.source || 'core') + ')'); }
            catch (e) { console.warn('[viz3d] shared-analyser connect failed', e); }
        }
        _bcLoadLists();
        const presets = _bcPresets();
        if (presets && typeof presets.getPresets === 'function') { ctrl.map = presets.getPresets(); ctrl.keys = Object.keys(ctrl.map); }
        const pool0 = ctrl.pool();
        ctrl.loadByName(pool0.length ? pool0[(Math.random() * pool0.length) | 0] : (ctrl.keys[0] || null), 0.0);
        ctrl.cycle = setInterval(() => ctrl.autoTick(), 30000);
        ctrl.connectedAnalyser = (fogAudio && fogAudio.analyser) || null;
        console.log('[viz3d] Butterchurn ready, presets:', ctrl.keys.length);
    }).catch((e) => {
        // Async init failed (lib load, WebGL/context creation, etc.). Clean up
        // the half-mounted controller so we don't leak an owned AudioContext /
        // DOM layers, and mark it dead so _bcSyncMode can retry on a later
        // mount instead of seeing a live-looking but non-functional bcCtrl.
        console.error('[viz3d] Butterchurn load/init failed', e);
        try { _bcReleaseCanvasGL(ctrl.canvas); } catch (_) {}
        try { if (ctrl.guitar) { ctrl.guitar.stop(); ctrl.guitar = null; } } catch (_) {}
        try { [ctrl.canvas, ctrl.backdrop, ctrl.scrim, ctrl.tint].forEach((el) => { if (el && el.parentNode) el.parentNode.removeChild(el); }); } catch (_) {}
        if (ctrl.ownsActx && ctrl.actx && typeof ctrl.actx.close === 'function') { try { ctrl.actx.close(); } catch (_) {} }
        ctrl.actx = null; ctrl.viz = null; ctrl.dead = true;
        _bcControllers.delete(ctrl);
    });
    // Size the Butterchurn output: set the canvas DRAWING BUFFER to the
    // device-pixel render size AND report that same size, so buffer ==
    // on-screen viewport == full fill. Butterchurn never sizes the output
    // canvas itself; the previous code set only CSS size, leaving the buffer
    // at the 300x150 default -> the viz showed a stretched lower-left corner
    // (worse the larger the panel). Ratio reuses the highway's DPR budget.
    function _bcApplySize(cssW, cssH) {
        if (!(cssW > 0 && cssH > 0)) return;
        ctrl.lastW = cssW; ctrl.lastH = cssH;
        const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
        const bw = Math.max(1, Math.round(cssW * ratio)), bh = Math.max(1, Math.round(cssH * ratio));
        if (canvas.width !== bw) canvas.width = bw;
        if (canvas.height !== bh) canvas.height = bh;
        const wpx = cssW + 'px', hpx = cssH + 'px';
        // Confine ALL layers to exactly the highway-canvas rect so the opaque
        // backdrop can't bleed over the transport bar above the highway.
        [ctrl.canvas, ctrl.backdrop, ctrl.scrim, ctrl.tint].forEach((el) => {
            if (el) { el.style.width = wpx; el.style.height = hpx; el.style.right = 'auto'; el.style.bottom = 'auto'; }
        });
        if (ctrl.viz && ctrl.viz.setRendererSize) { try { ctrl.viz.setRendererSize(bw, bh); } catch (e) {} }
    }
    return {
        applySettings() { ctrl.applySettings(); },
        dead() { return ctrl.dead; },
        ready() { return !!ctrl.viz; },
        boundAnalyser() { return ctrl.connectedAnalyser || null; },
        audioCtx() { return ctrl.actx; },
        // Re-bind audio when the shared analyser changes (e.g. a stems song
        // swap replaces the analyser). Same context → cheap reconnect; the
        // caller handles a context change with a full rebuild (cross-context
        // connectAudio is impossible — the visualizer is bound to one ctx).
        reconnectAudio(a) {
            if (!a || !a.analyser || !ctrl.viz) return false;
            if (a.analyser === ctrl.connectedAnalyser) return true;
            if (a.ctx && a.ctx !== ctrl.actx) return false; // needs rebuild
            try { ctrl.viz.connectAudio(a.analyser); ctrl.connectedAnalyser = a.analyser; return true; } catch (e) { return false; }
        },
        chart(v) { if (ctrl.guitar && ctrl.guitar.setChart) ctrl.guitar.setChart(v); },
        tint(hex, alpha) {
            if (!ctrl.tint) return;
            if (hex == null) { ctrl.tint.style.background = 'transparent'; return; }
            const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
            ctrl.tint.style.background = 'rgba(' + r + ',' + g + ',' + b + ',' + (alpha || 0).toFixed(3) + ')';
        },
        render() {
            const s = _bcLoadSettings();
            if (!ctrl.viz || !s.enabled) return; // skip GPU work when the bg is off
            const sz = sizeProvider && sizeProvider();
            if (sz && sz.w > 0 && sz.h > 0 && (sz.w !== ctrl.lastW || sz.h !== ctrl.lastH)) {
                _bcApplySize(sz.w, sz.h);
            }
            try { ctrl.viz.render(); } catch (e) {}
        },
        resize(w, h) { _bcApplySize(w, h); },
        destroy() {
            ctrl.dead = true;
            _bcControllers.delete(ctrl);
            if (_bcPrimary === ctrl) { _bcSetPrimary(_bcControllers.values().next().value || null); _bcUpdatePanelPreset(); }
            if (ctrl.cycle) { clearInterval(ctrl.cycle); ctrl.cycle = 0; }
            if (ctrl.guitar) { ctrl.guitar.stop(); ctrl.guitar = null; }
            // Release the Butterchurn WebGL context deterministically (don't
            // wait for GC) so repeated mounts/toggles can't exhaust the
            // browser's WebGL context cap (~16). Do it before removing the
            // canvas from the DOM.
            _bcReleaseCanvasGL(ctrl.canvas);
            [ctrl.canvas, ctrl.backdrop, ctrl.scrim, ctrl.tint].forEach((el) => { if (el && el.parentNode) el.parentNode.removeChild(el); });
            ctrl.viz = null; ctrl.connectedAnalyser = null;
            // Close the AudioContext only if we own it (desktop, or the
            // browser fallback). The browser path normally reuses the
            // highway's shared context, which the fog system owns — never
            // close that. Without this, desktop leaks a new AudioContext per
            // mount and hits the browser's ~6-context cap after a few toggles.
            if (ctrl.ownsActx && ctrl.actx && typeof ctrl.actx.close === 'function') {
                try { ctrl.actx.close(); } catch (e) {}
            }
            ctrl.actx = null;
            if (_bcControllers.size === 0) {
                _bcTeardownPanel();
            } else if (_bcPrimary && _bcPrimary.wrap) {
                // Splitscreen: a controller other than this one is still
                // alive. The singleton panel was parented to THIS (now
                // destroyed) wrap, so re-home it onto the surviving primary's
                // wrap — otherwise the panel is orphaned on the dead wrap and
                // the surviving highway is left with no visualizer controls
                // (_bcEnsurePanel only runs at controller creation). It moves
                // the existing panel+pane when connected, or rebuilds them on
                // the survivor if this wrap was already detached.
                try { _bcEnsurePanel(_bcPrimary.wrap); _bcUpdatePanelPreset(); } catch (e) {}
            }
        },
    };
}
