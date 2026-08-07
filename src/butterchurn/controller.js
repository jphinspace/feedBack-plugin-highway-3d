import {
    fastForwardIndex, createGuitarPcmFeed, isDesktopAudioHost, loadButterchurnLib, resolvePresetsGlobal, releaseCanvasGL, resolveButterchurnGlobal,
} from './engine.js';
import {
    bannedPresets, butterchurnControllers, favoritePresets, loadPresetLists, loadButterchurnSettings, savePresetLists,
} from './prefs.js';
import { ensurePresetPanel, primaryController, setPrimaryController, teardownPresetPanel, updatePanelPreset } from './panel.js';

/**
 * Creates a Butterchurn background controller bound to `wrap`. Browser audio
 * reuses the highway's own shared analyser (`audioProvider`) rather than
 * opening a second `createMediaElementSource` on `#audio` — that call is
 * one-shot per element and a second one throws `InvalidStateError`,
 * permanently disabling the other consumer.
 */
export function createButterchurnController(wrap, sizeProvider, audioProvider) {
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
        const s = loadButterchurnSettings();
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

    ctrl.curName = null; ctrl.lastManual = 0;
    ctrl.allList = () => (ctrl.keys || []).filter((k) => !bannedPresets.has(k));
    ctrl.pool = () => {
        const mode = loadButterchurnSettings().cyclePool || 'all';
        if (mode === 'bans') return (ctrl.keys || []).filter((k) => bannedPresets.has(k));
        if (mode === 'favorites') {
            const f = (ctrl.keys || []).filter((k) => favoritePresets.has(k) && !bannedPresets.has(k));
            if (f.length) return f;
        }
        return ctrl.allList();
    };
    ctrl.browseArr = () => ctrl.keys || [];
    ctrl.loadByName = (name, blend) => {
        if (!ctrl.viz || !name || !ctrl.map || !ctrl.map[name]) return;
        try { ctrl.viz.loadPreset(ctrl.map[name], blend || 0); ctrl.curName = name; } catch (e) {}
        updatePanelPreset();
    };
    ctrl.autoTick = () => {
        if (ctrl.dead || loadButterchurnSettings().hold) return;
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
        if (favoritePresets.has(ctrl.curName)) favoritePresets.delete(ctrl.curName);
        else { favoritePresets.add(ctrl.curName); bannedPresets.delete(ctrl.curName); }
        savePresetLists(); updatePanelPreset();
    };
    ctrl.banCur = () => {
        if (!ctrl.curName) return;
        if (bannedPresets.has(ctrl.curName)) {
            bannedPresets.delete(ctrl.curName);
            savePresetLists(); updatePanelPreset();
        } else {
            bannedPresets.add(ctrl.curName); favoritePresets.delete(ctrl.curName);
            savePresetLists(); ctrl.step(1);
        }
    };
    setPrimaryController(ctrl);

    butterchurnControllers.add(ctrl);
    ensurePresetPanel(wrap);
    ctrl.applySettings();

    loadButterchurnLib().then(() => {
        if (ctrl.dead) return;
        const bc = resolveButterchurnGlobal();
        if (!bc || typeof bc.createVisualizer !== 'function') { console.warn('[viz3d] Butterchurn global missing'); return; }
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const sz = (sizeProvider && sizeProvider()) || { w: 1280, h: 720 };
        // Browser: reuse the highway's shared analyser and build on that SAME AudioContext
        // (connectAudio() fails cross-context). Desktop uses its own context fed by guitar/mic.
        // ownsActx tracks whether WE created it, so destroy() only closes contexts we own.
        const fogAudio = isDesktopAudioHost() ? null : (audioProvider ? audioProvider() : null);
        ctrl.ownsActx = !(fogAudio && fogAudio.ctx);
        ctrl.actx = (fogAudio && fogAudio.ctx) || new Ctx();
        if (ctrl.actx.state === 'suspended' && ctrl.actx.resume) ctrl.actx.resume().catch(() => {});
        // Butterchurn never sizes its own output canvas — seed the drawing buffer to the
        // device-pixel render size and report that same size, or the output blits into a
        // corner CSS then stretches. pixelRatio:1 since DPR is already folded into the size.
        const ratio0 = Math.min(window.devicePixelRatio || 1, 1.5);
        const bufferW0 = Math.max(1, Math.round((sz.w || 1280) * ratio0));
        const bufferH0 = Math.max(1, Math.round((sz.h || 720) * ratio0));
        canvas.width = bufferW0; canvas.height = bufferH0;
        ctrl.viz = bc.createVisualizer(ctrl.actx, canvas, {
            width: bufferW0, height: bufferH0,
            pixelRatio: 1, textureRatio: 1,
        });
        if (isDesktopAudioHost()) {
            try {
                ctrl.guitar = createGuitarPcmFeed(ctrl.actx, (srcNode) => { try { if (ctrl.viz) ctrl.viz.connectAudio(srcNode); } catch (e) {} });
                console.log('[viz3d] bg: feeding GUITAR input into Butterchurn');
            } catch (e) { console.warn('[viz3d] guitar feed failed', e); }
        } else if (fogAudio && fogAudio.analyser) {
            // The shared AnalyserNode is a passthrough — connecting it onward doesn't disturb the fog's reads.
            try { ctrl.viz.connectAudio(fogAudio.analyser); console.log('[viz3d] browser: Butterchurn tapping shared analyser (' + (fogAudio.source || 'core') + ')'); }
            catch (e) { console.warn('[viz3d] shared-analyser connect failed', e); }
        }
        loadPresetLists();
        const presets = resolvePresetsGlobal();
        if (presets && typeof presets.getPresets === 'function') { ctrl.map = presets.getPresets(); ctrl.keys = Object.keys(ctrl.map); }
        const pool0 = ctrl.pool();
        ctrl.loadByName(pool0.length ? pool0[(Math.random() * pool0.length) | 0] : (ctrl.keys[0] || null), 0.0);
        ctrl.cycle = setInterval(() => ctrl.autoTick(), 30000);
        ctrl.connectedAnalyser = (fogAudio && fogAudio.analyser) || null;
        console.log('[viz3d] Butterchurn ready, presets:', ctrl.keys.length);
    }).catch((e) => {
        // Async init failed (lib load, WebGL/context creation, etc.) — clean up the
        // half-mounted controller and mark it dead so a retry can mount fresh later.
        console.error('[viz3d] Butterchurn load/init failed', e);
        try { releaseCanvasGL(ctrl.canvas); } catch (_) {}
        try { if (ctrl.guitar) { ctrl.guitar.stop(); ctrl.guitar = null; } } catch (_) {}
        try { [ctrl.canvas, ctrl.backdrop, ctrl.scrim, ctrl.tint].forEach((el) => { if (el && el.parentNode) el.parentNode.removeChild(el); }); } catch (_) {}
        if (ctrl.ownsActx && ctrl.actx && typeof ctrl.actx.close === 'function') { try { ctrl.actx.close(); } catch (_) {} }
        ctrl.actx = null; ctrl.viz = null; ctrl.dead = true;
        butterchurnControllers.delete(ctrl);
    });
    /** Sets the canvas drawing buffer to the device-pixel render size and reports the same size, so buffer == on-screen viewport. */
    function applyButterchurnSize(cssW, cssH) {
        if (!(cssW > 0 && cssH > 0)) return;
        ctrl.lastW = cssW; ctrl.lastH = cssH;
        const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
        const bw = Math.max(1, Math.round(cssW * ratio)), bh = Math.max(1, Math.round(cssH * ratio));
        if (canvas.width !== bw) canvas.width = bw;
        if (canvas.height !== bh) canvas.height = bh;
        const wpx = cssW + 'px', hpx = cssH + 'px';
        // Confine every layer to exactly the highway-canvas rect, or the opaque backdrop bleeds over the transport bar.
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
        /** Re-binds audio when the shared analyser changes (e.g. a stems song swap). A context change instead needs a full rebuild — cross-context connectAudio is impossible. */
        reconnectAudio(a) {
            if (!a || !a.analyser || !ctrl.viz) return false;
            if (a.analyser === ctrl.connectedAnalyser) return true;
            if (a.ctx && a.ctx !== ctrl.actx) return false;
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
            const s = loadButterchurnSettings();
            if (!ctrl.viz || !s.enabled) return;
            const sz = sizeProvider && sizeProvider();
            if (sz && sz.w > 0 && sz.h > 0 && (sz.w !== ctrl.lastW || sz.h !== ctrl.lastH)) {
                applyButterchurnSize(sz.w, sz.h);
            }
            try { ctrl.viz.render(); } catch (e) {}
        },
        resize(w, h) { applyButterchurnSize(w, h); },
        destroy() {
            ctrl.dead = true;
            butterchurnControllers.delete(ctrl);
            if (primaryController === ctrl) { setPrimaryController(butterchurnControllers.values().next().value || null); updatePanelPreset(); }
            if (ctrl.cycle) { clearInterval(ctrl.cycle); ctrl.cycle = 0; }
            if (ctrl.guitar) { ctrl.guitar.stop(); ctrl.guitar = null; }
            // Release the WebGL context deterministically (don't wait for GC) so repeated
            // mounts can't exhaust the browser's WebGL context cap, before removing the canvas.
            releaseCanvasGL(ctrl.canvas);
            [ctrl.canvas, ctrl.backdrop, ctrl.scrim, ctrl.tint].forEach((el) => { if (el && el.parentNode) el.parentNode.removeChild(el); });
            ctrl.viz = null; ctrl.connectedAnalyser = null;
            // Close the AudioContext only if we own it — the browser path normally reuses
            // the highway's shared context, which the fog system owns and must not be closed.
            if (ctrl.ownsActx && ctrl.actx && typeof ctrl.actx.close === 'function') {
                try { ctrl.actx.close(); } catch (e) {}
            }
            ctrl.actx = null;
            if (butterchurnControllers.size === 0) {
                teardownPresetPanel();
            } else if (primaryController && primaryController.wrap) {
                // Splitscreen: the panel was parented to this now-destroyed wrap; re-home it
                // onto the surviving primary's wrap so it isn't orphaned.
                try { ensurePresetPanel(primaryController.wrap); updatePanelPreset(); } catch (e) {}
            }
        },
    };
}
