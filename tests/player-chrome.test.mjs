// Player-chrome background control.
//
// The control mounts a Background picker (style / Reactive / Intensity) into
// the player's Plugin Controls popover so the background can be changed
// mid-song. Two things about it are easy to get wrong and invisible when they
// are:
//
//   * It is REFCOUNTED. Several renderer instances can be live at once (a
//     splitscreen host creates one per panel), but the settings it writes are
//     global — N controls would be N ways to set one value, and a leaked
//     refcount pins a dead control in the UI. The multi-instance behaviour is
//     exercised here with stubbed instances; it is NOT verified against a real
//     splitscreen session, whose visualizer does not currently work.
//   * It GREYS OUT controls the active style ignores. Not every background
//     style reads `intensity`, and none of them read audio bands under
//     Butterchurn, so a live-looking knob that does nothing is a real bug.
//
// The control now lives in src/ui/player-chrome.js (moved out of the
// screen.js -> src/ module split, Stage 3b) and is real-imported here rather
// than sliced out of source text and evaluated in a vm sandbox. Its
// collaborators (BACKGROUND_STYLE_IDS, readGlobalSetting/subscribeToSettings/unsubscribeFromSettings,
// _venueSceneOverride) are real imports too — src/settings/store.js and
// src/background/venue.js are genuinely side-effect-free at import time, so there is
// no reason to fake them.
//
// Two different isolation strategies are in play, matched to how each
// dependency is scoped:
//   - player-chrome.js itself is re-imported PER TEST with a cache-busting
//     query string, so its module-level state (controlRefCount, controlEl, ...) starts
//     fresh every time — same guarantee the old vm-per-test sandbox gave.
//   - store.js/venue.js are genuine app-wide singletons (by design — see
//     their own file comments) shared across every import of player-chrome.js,
//     including across tests. `load()` resets their mutable state
//     (settingsMemFallback, settingsListeners, _venueSceneOverride) at the top of every
//     test instead.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BACKGROUND_STYLE_IDS } from '../src/settings/defaults.js';
import { settingsMemFallback, settingsListeners, emitSettingChange, readGlobalSetting } from '../src/settings/store.js';
import { _venueSetSceneOverride } from '../src/background/venue.js';

// What each style is expected to consume, derived by reading the BACKGROUND_STYLES
// bodies in src/main.js — deliberately NOT read from the plugin's own
// STYLE_SETTING_USES table, which would only assert that the table equals itself.
//   intensity: true  => the style's build() reads settings.intensity
//   reactive:  true  => the style's update() dereferences its `bands` argument
// 'butterchurn' is a mode, not a BACKGROUND_STYLES fog-scenery entry: syncButterchurnMode
// owns its controller and drives its own audio tap + canvas opacity (only
// the fog-scenery half falls through to BACKGROUND_STYLES.off), so both are false.
const EXPECTED_USES = {
    off: { intensity: false, reactive: false },
    particles: { intensity: true, reactive: true },
    silhouettes: { intensity: true, reactive: true },
    lights: { intensity: true, reactive: true },
    geometric: { intensity: true, reactive: true },
    image: { intensity: true, reactive: false },
    video: { intensity: false, reactive: false },
    butterchurn: { intensity: false, reactive: false },
};

// Minimal DOM: only what the control touches.
function makeDom() {
    class El {
        constructor(tag) {
            this.tagName = String(tag).toUpperCase();
            this.children = [];
            this.parentNode = null;
            this.listeners = {};
            this.style = { cssText: '' };
            this.disabled = false;
            this._on = false;
        }
        appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
        removeChild(c) {
            const i = this.children.indexOf(c);
            if (i >= 0) this.children.splice(i, 1);
            c.parentNode = null;
            return c;
        }
        addEventListener(t, fn) { (this.listeners[t] || (this.listeners[t] = [])).push(fn); }
        setAttribute(k, v) { this[k] = v; }
        removeAttribute(k) { delete this[k]; }
        get isConnected() {
            let n = this;
            while (n.parentNode) n = n.parentNode;
            return n === root;
        }
        querySelector(sel) {
            const m = /^option\[value="(.+)"\]$/.exec(sel);
            const want = m ? m[1] : null;
            const walk = (n) => {
                for (const c of n.children) {
                    if (want != null && c.tagName === 'OPTION' && c.value === want) return c;
                    const r = walk(c);
                    if (r) return r;
                }
                return null;
            };
            return walk(this);
        }
        fire(type) { (this.listeners[type] || []).forEach((fn) => fn()); }
    }
    const root = new El('root');
    const slot = new El('div');
    root.appendChild(slot);
    return { El, root, slot };
}

// Fake localStorage: shared across the file, cleared at the top of every
// load(). store.js talks to the bare `localStorage` global.
const fakeStorage = new Map();
globalThis.localStorage = {
    getItem: (k) => (fakeStorage.has(k) ? fakeStorage.get(k) : null),
    setItem: (k, v) => { fakeStorage.set(k, String(v)); },
    removeItem: (k) => { fakeStorage.delete(k); },
};

let _pcInstanceCounter = 0;

async function load({ store: initialStore } = {}) {
    // Reset the shared singletons (store.js / venue.js) before every test —
    // player-chrome.js gets a fresh module instance below, but these two do
    // not (by design: see their own file comments on why they must stay
    // process-wide singletons in production).
    fakeStorage.clear();
    for (const k of Object.keys(settingsMemFallback)) delete settingsMemFallback[k];
    settingsListeners.clear();
    _venueSetSceneOverride(false);

    const dom = makeDom();
    const initial = Object.assign({
        style: 'particles',
        reactive: true,
        intensity: 0.5,
        customImageDataUrl: '',
        customVideoName: '',
    }, initialStore);
    // Mirrors writeGlobalSetting: stage the STRING form, same as a real setter
    // would, so real coerceSetting (bool/float parsing) reads it back correctly.
    for (const [k, v] of Object.entries(initial)) settingsMemFallback[k] = String(v);

    const bus = {};
    const writes = [];
    const timers = [];

    const win = {
        feedBack: {
            uiVersion: 'v3',   // resolvePlayerControlSlot gates on this (docs/plugin-v3-ui.md)
            ui: { playerControlSlot: () => dom.slot },
            // The real bus is an EventTarget wrapper exposing on/off. Modelled
            // here so the screen:changed subscription — and its removal — are
            // observable.
            on: (ev, fn) => { (bus[ev] || (bus[ev] = [])).push(fn); },
            off: (ev, fn) => {
                const l = bus[ev];
                if (!l) return;
                const i = l.indexOf(fn);
                if (i >= 0) l.splice(i, 1);
            },
        },
        h3dBgSetStyle: (v) => { writes.push(['style', v]); settingsMemFallback.style = String(v); emitSettingChange('style'); },
        h3dBgSetReactive: (v) => { writes.push(['reactive', v]); settingsMemFallback.reactive = String(v); emitSettingChange('reactive'); },
        h3dBgSetIntensity: (v) => { writes.push(['intensity', v]); settingsMemFallback.intensity = String(v); emitSettingChange('intensity'); },
    };
    globalThis.window = win;
    globalThis.document = {
        createElement: (t) => new dom.El(t),
        // The Settings-panel mirror looks these up; absent here so it no-ops.
        getElementById: () => null,
    };
    globalThis.setTimeout = (fn) => { timers.push(fn); return timers.length; };
    globalThis.clearTimeout = () => {};

    const pc = await import(`../src/ui/player-chrome.js?instance=${_pcInstanceCounter++}`);

    const api = {
        acquireBackgroundControl: pc.acquireBackgroundControl,
        releaseBackgroundControl: pc.releaseBackgroundControl,
        get el() { return pc.controlEl; },
        get sel() { return pc.styleSelectEl; },
        get react() { return pc.reactiveBtn; },
        get intens() { return pc.intensitySlider; },
        get reason() { return pc.reasonEl; },
        get refs() { return pc.controlRefCount; },
    };

    const sandbox = {
        window: win,
        set _venueSceneOverride(v) { _venueSetSceneOverride(!!v); },
    };
    const fireScreenChanged = () => (bus['screen:changed'] || []).slice().forEach((fn) => fn());
    const screenHooks = () => (bus['screen:changed'] || []).length;
    // Round-trips through real coercion on both sides, same as a real
    // setter (writeGlobalSetting stringifies) + a real reader (readGlobalSetting
    // parses back to a bool/float/enum) would — so a plain
    // `store.reactive = false` here behaves exactly like flipping the
    // control in the browser, not like poking a raw identity-stubbed object.
    const store = new Proxy({}, {
        get: (_t, key) => readGlobalSetting(key),
        set: (_t, key, value) => { settingsMemFallback[key] = String(value); return true; },
    });
    return {
        api, pc, dom, store, emit: emitSettingChange, writes, timers, sandbox,
        listenerCount: () => settingsListeners.size, fireScreenChanged, screenHooks,
    };
}

test('mounts one control into the player-control slot', async () => {
    const { api, dom } = await load();
    api.acquireBackgroundControl();
    assert.equal(dom.slot.children.length, 1);
    assert.ok(api.sel, 'style dropdown was not created');
    assert.equal(api.sel.children.length, BACKGROUND_STYLE_IDS.length, 'one option per style');
});

test('multiple renderer instances share a single control', async () => {
    const { api, dom } = await load();
    api.acquireBackgroundControl();
    api.acquireBackgroundControl();
    api.acquireBackgroundControl();
    api.acquireBackgroundControl();
    assert.equal(dom.slot.children.length, 1, 'four instances must not mount four controls');
    assert.equal(api.refs, 4);

    api.releaseBackgroundControl();
    api.releaseBackgroundControl();
    api.releaseBackgroundControl();
    assert.equal(dom.slot.children.length, 1, 'still held by the last instance');
    api.releaseBackgroundControl();
    assert.equal(dom.slot.children.length, 0, 'last release must unmount');
    assert.equal(api.el, null);
});

test('binds the screen hook on a retry when the bus was not ready at acquire', async () => {
    const ctl = await load();
    // Cold load: on a fresh page the renderer can init before the event bus is
    // wired AND before the rail popover exists. Simulate both being absent.
    const savedOn = ctl.sandbox.window.feedBack.on;
    const savedUi = ctl.sandbox.window.feedBack.ui;
    delete ctl.sandbox.window.feedBack.on;
    ctl.sandbox.window.feedBack.ui = {};   // no playerControlSlot -> mount fails

    ctl.api.acquireBackgroundControl();
    assert.equal(ctl.screenHooks(), 0, 'nothing to bind to yet');
    assert.equal(ctl.api.el, null, 'no slot yet, so nothing mounted');

    // Bus + slot come online; the retry tick must bind the hook, not only mount.
    ctl.sandbox.window.feedBack.on = savedOn;
    ctl.sandbox.window.feedBack.ui = savedUi;
    ctl.timers.shift()();   // run one retry tick

    assert.equal(ctl.screenHooks(), 1, 'the retry tick failed to bind the screen hook');
    assert.ok(ctl.api.el, 'and it should have mounted too');
    ctl.api.releaseBackgroundControl();
});

test('the last release unbinds the screen:changed hook', async () => {
    const ctl = await load();
    ctl.api.acquireBackgroundControl();
    assert.equal(ctl.screenHooks(), 1, 'acquire should subscribe once');

    ctl.api.acquireBackgroundControl();
    ctl.api.releaseBackgroundControl();
    assert.equal(ctl.screenHooks(), 1, 'a partial release must keep the hook');

    ctl.api.releaseBackgroundControl();
    assert.equal(ctl.screenHooks(), 0, 'the hook outlived the control');

    // And re-acquiring must re-subscribe exactly once, not zero times (the
    // bind is guarded on screenChangedHook, so failing to null it would leave the
    // control permanently deaf to chrome rebuilds).
    ctl.api.acquireBackgroundControl();
    assert.equal(ctl.screenHooks(), 1, 're-acquire did not re-subscribe');
    ctl.api.releaseBackgroundControl();
});

test('teardown unsubscribes from the settings bus', async () => {
    const ctl = await load();
    ctl.api.acquireBackgroundControl();
    assert.equal(ctl.listenerCount(), 1);
    ctl.api.releaseBackgroundControl();
    assert.equal(ctl.listenerCount(), 0, 'listener leaked after unmount');
});

test('tracks changes made from the Settings page', async () => {
    const { api, store, emit } = await load();
    api.acquireBackgroundControl();
    store.style = 'lights';
    emit('style');
    assert.equal(api.sel.value, 'lights');
});

test('custom media options stay disabled until something is uploaded', async () => {
    const { api, store, emit } = await load();
    api.acquireBackgroundControl();
    assert.equal(api.sel.querySelector('option[value="image"]').disabled, true);
    store.customImageDataUrl = 'data:image/png;base64,AAAA';
    emit('customImageDataUrl');
    assert.equal(api.sel.querySelector('option[value="image"]').disabled, false);
    assert.equal(api.sel.querySelector('option[value="video"]').disabled, true, 'video is independent');
});

test('re-mounts into a fresh slot when the player chrome is rebuilt', async () => {
    const { api, dom, sandbox, listenerCount } = await load();
    api.acquireBackgroundControl();
    const first = api.el;

    dom.root.removeChild(dom.slot);
    const fresh = new dom.El('div');
    dom.root.appendChild(fresh);
    sandbox.window.feedBack.ui.playerControlSlot = () => fresh;

    api.acquireBackgroundControl();
    assert.equal(fresh.children.length, 1, 'did not remount into the new slot');
    assert.notEqual(api.el, first, 'stale node was reused');
    assert.equal(listenerCount(), 1, 'remount must not double-subscribe');
});

test('a non-v3 host mounts nothing (uiVersion gate)', async () => {
    const ctl = await load();
    ctl.sandbox.window.feedBack.uiVersion = 'v2';   // pre-v3 shell
    ctl.api.acquireBackgroundControl();
    assert.equal(ctl.api.el, null, 'must not mount when uiVersion is not v3');
    assert.equal(ctl.dom.slot.children.length, 0);
    // A non-v3 shell has no slot and never will, so no retry should be scheduled
    // at all — the loop is for a not-yet-built v3 slot, not for polling v2.
    assert.equal(ctl.timers.length, 0, 'a non-v3 host must not schedule the retry loop');
    ctl.api.releaseBackgroundControl();
});

test('a host with no player-control slot mounts nothing and does not throw', async () => {
    const { api, dom, sandbox, timers } = await load();
    sandbox.window.feedBack.ui = {};
    api.acquireBackgroundControl();
    assert.equal(api.el, null);
    assert.equal(dom.slot.children.length, 0);

    let guard = 0;
    while (timers.length && guard++ < 100) timers.shift()();
    assert.ok(guard < 100, 'retry loop did not terminate');
});

test('intensity writes once on release, not on every drag step', async () => {
    const { api, writes } = await load();
    api.acquireBackgroundControl();
    for (const v of ['0.10', '0.20', '0.30', '0.40', '0.50']) {
        api.intens.value = v;
        api.intens.fire('input');
    }
    assert.equal(writes.filter((w) => w[0] === 'intensity').length, 0,
        'dragging must not write — every write rebuilds the background scene');
    api.intens.fire('change');
    assert.equal(writes.filter((w) => w[0] === 'intensity').length, 1,
        'releasing must write exactly once');
});

test('the dropdown and Reactive pill drive the real setters', async () => {
    const { api, store, writes } = await load();
    api.acquireBackgroundControl();
    api.sel.value = 'geometric';
    api.sel.fire('change');
    assert.equal(store.style, 'geometric');

    const before = store.reactive;
    api.react.fire('click');
    assert.equal(store.reactive, !before, 'Reactive pill must toggle');
    assert.ok(writes.some((w) => w[0] === 'reactive'));
});

test('exposes state and reasons to assistive tech', async () => {
    const ctl = await load({ store: { style: 'image', reactive: true } });   // image: reactive inert
    ctl.api.acquireBackgroundControl();

    // The reason live-region must be a REAL mounted element with the id the
    // controls reference - not a dangling pointer. Assert resolution, not a
    // literal (a wrong id in code would still equal the literal).
    const reason = ctl.api.reason;
    assert.ok(reason, 'the reason span was not created');
    assert.equal(reason.id, 'h3d-pc-reason');
    assert.equal(reason.parentNode, ctl.api.el, 'the reason span must be mounted in the control');

    // aria-pressed: a toggle button must expose its state. image greys
    // Reactive, so not-pressed AND disabled, and it points at the reason.
    assert.equal(ctl.api.react['aria-pressed'], 'false', 'greyed toggle is not pressed');
    assert.equal(ctl.api.react['aria-disabled'], 'true');
    // Pointer must resolve to the actual span's id (kills a wrong-id mutation),
    // and the span must carry the current reason text (kills a never-set-text
    // mutation).
    assert.equal(ctl.api.react['aria-describedby'], reason.id, 'inert control must reference the reason span');
    assert.equal(reason.textContent, 'This background does not react to audio', 'reason text must match the style');
    assert.equal(ctl.api.intens['aria-describedby'], undefined, 'an ENABLED control carries no reason');

    // The intensity describe path: a style where INTENSITY is inert.
    ctl.store.style = 'video'; ctl.emit('style');
    assert.equal(ctl.api.intens.disabled, true, 'precondition: video greys intensity');
    assert.equal(ctl.api.intens['aria-describedby'], reason.id, 'inert intensity must reference the reason');
    assert.equal(reason.textContent, 'The video plays as-is - nothing to adjust here');

    // Both enabled: describedby drops, aria-pressed follows the value.
    ctl.store.style = 'particles'; ctl.store.reactive = true; ctl.emit('style');
    assert.equal(ctl.api.react['aria-describedby'], undefined, 'enabled control drops the reason');
    assert.equal(ctl.api.intens['aria-describedby'], undefined);
    assert.equal(ctl.api.react['aria-pressed'], 'true', 'reactive on for particles');
    ctl.store.reactive = false; ctl.emit('reactive');
    assert.equal(ctl.api.react['aria-pressed'], 'false', 'aria-pressed follows the value');

    // Accessible names on the non-label controls.
    assert.equal(ctl.api.sel['aria-label'], 'Background style');
    assert.equal(ctl.api.intens['aria-label'], 'Background intensity');
    ctl.api.releaseBackgroundControl();
});

test('greys out exactly the controls each style ignores', async () => {
    const { api, store, emit } = await load();
    api.acquireBackgroundControl();
    for (const [style, want] of Object.entries(EXPECTED_USES)) {
        store.style = style;
        emit('style');
        assert.equal(!api.intens.disabled, want.intensity, `${style}: intensity enabled-ness`);
        assert.equal(!api.react.disabled, want.reactive, `${style}: reactive enabled-ness`);
    }
});

test('the Venue override greys the whole Background group', async () => {
    const ctl = await load({ store: { style: 'particles' } });   // a style that uses both
    ctl.api.acquireBackgroundControl();
    assert.equal(ctl.api.intens.disabled, false, 'precondition: both enabled off-venue');
    assert.equal(ctl.api.react.disabled, false);

    // Venue turns on: the effective style is now 'venue', which uses neither.
    // The transition arrives on the settings bus as the 'venueScene' key.
    ctl.sandbox._venueSceneOverride = true;
    ctl.emit('venueScene');
    assert.equal(ctl.api.intens.disabled, true, 'intensity should grey under Venue');
    assert.equal(ctl.api.react.disabled, true, 'reactive should grey under Venue');
    assert.equal(ctl.api.sel.disabled, true, 'the dropdown should be inert under Venue too');
    assert.match(ctl.api.intens.title, /venue/i, 'reason should mention Venue');
    // All three inert controls point at the reason under Venue (kills a
    // 'describe reactive only' regression on the select/intensity paths).
    const vReason = ctl.api.reason.id;
    assert.equal(ctl.api.sel['aria-describedby'], vReason, 'select must reference the reason under Venue');
    assert.equal(ctl.api.intens['aria-describedby'], vReason, 'intensity must reference the reason under Venue');
    assert.equal(ctl.api.react['aria-describedby'], vReason, 'reactive must reference the reason under Venue');
    assert.match(ctl.api.reason.textContent, /venue/i, 'the reason span carries the Venue text');

    // The dropdown still shows the stored style (venue has no option), but
    // selecting must not write while it's inert.
    assert.equal(ctl.api.sel.value, 'particles');
    const before = ctl.writes.length;
    ctl.api.sel.value = 'lights';
    ctl.api.sel.fire('change');
    assert.equal(ctl.writes.length, before, 'a disabled dropdown must not write');

    // Venue off: controls come back per the stored style.
    ctl.sandbox._venueSceneOverride = false;
    ctl.emit('venueScene');
    assert.equal(ctl.api.intens.disabled, false, 'intensity re-enables when Venue exits');
    assert.equal(ctl.api.react.disabled, false);
    assert.equal(ctl.api.sel.disabled, false, 'the dropdown re-enables when Venue exits');
    assert.equal(ctl.api.sel.title, 'Background style', 'the base tooltip must come back, not blank');
    assert.equal(ctl.api.sel['aria-describedby'], undefined, 'select drops the reason off-Venue');
    assert.equal(ctl.api.intens['aria-describedby'], undefined, 'intensity drops the reason off-Venue');
    ctl.api.releaseBackgroundControl();
});

// A real (coerced) settings value can never actually reach syncControls outside
// BACKGROUND_STYLE_IDS -- readGlobalSetting/coerceSetting reject anything not in that list
// and fall back to the default. The scenario this guards is narrower and
// more realistic: a style gets added to BACKGROUND_STYLE_IDS (so it can genuinely be
// the effective style) before its STYLE_SETTING_USES row is written. Exercise that by
// deleting a real, valid style's row rather than injecting a bogus id.
test('an unknown style enables both controls (fails open)', async () => {
    const { api, pc, store, emit } = await load();
    api.acquireBackgroundControl();
    const saved = pc.STYLE_SETTING_USES.particles;
    delete pc.STYLE_SETTING_USES.particles;
    try {
        store.style = 'particles';
        emit('style');
        assert.equal(api.intens.disabled, false);
        assert.equal(api.react.disabled, false);
    } finally {
        pc.STYLE_SETTING_USES.particles = saved;
    }
});

test('greyed-out controls cannot reach the setters', async () => {
    const { api, store, emit, writes } = await load();
    api.acquireBackgroundControl();
    store.style = 'video';           // uses neither setting
    emit('style');
    const before = writes.length;
    api.intens.fire('change');
    api.react.fire('click');
    assert.equal(writes.length, before, 'an inert control must not write');
});

test('greyed-out controls explain themselves on hover', async () => {
    const { api, store, emit } = await load();
    api.acquireBackgroundControl();
    store.style = 'butterchurn';
    emit('style');
    assert.match(api.react.title, /butterchurn/i);
    assert.match(api.intens.title, /butterchurn/i);
});

// A native-disabled <button>/<input> fires no pointer events, so its own
// `title` never shows on hover. The reason must therefore also sit on the
// non-disabled wrapper, and the disabled control must let the hover fall
// through (pointer-events:none) — otherwise the "says why on hover" feature is
// dead in the browser while these tests pass on the swallowed control title.
test('the greyed-out reason reaches a hoverable wrapper', async () => {
    const { api, store, emit } = await load();
    api.acquireBackgroundControl();
    store.style = 'video';           // uses neither setting
    emit('style');

    assert.match(api.react.parentNode.title, /nothing to adjust/i,
        'reactive reason must be on the wrapper, not only the disabled pill');
    assert.equal(api.react.style.pointerEvents, 'none',
        'disabled pill must pass hover through to its wrapper');

    assert.match(api.intens.parentNode.title, /nothing to adjust/i,
        'intensity reason must be on the wrapper, not only the disabled slider');
    assert.equal(api.intens.style.pointerEvents, 'none',
        'disabled slider must pass hover through to its wrapper');

    // ...and an enabled style clears the wrapper so the control's own title wins.
    store.style = 'particles';
    emit('style');
    assert.equal(api.react.parentNode.title, '');
    assert.equal(api.intens.parentNode.title, '');
    assert.equal(api.intens.style.pointerEvents, '');
});
