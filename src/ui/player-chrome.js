import { BACKGROUND_STYLE_IDS } from '../settings/defaults.js';
import { readGlobalSetting, subscribeToSettings, unsubscribeFromSettings } from '../settings/store.js';
import { _venueSceneOverride } from '../background/venue.js';

/* ======================================================================
 *  Player-chrome background control
 * ======================================================================
 * A Background picker mounted into the player's Plugins rail popover, so
 * the background can be switched MID-SONG without leaving for Settings.
 *
 * It writes through the SAME global setters settings.html uses
 * (h3dBgSetStyle / SetReactive / SetIntensity), so the existing pub-sub
 * rebuilds the mounted style live and both UIs stay agreed. Nothing extra
 * is persisted here, and the option list is generated from BACKGROUND_STYLE_IDS —
 * add a style there and it shows up in both places automatically.
 *
 * MOUNTED ONCE, REFCOUNTED. Under splitscreen there are N renderer
 * instances but these settings are global — a panel may set a per-panel
 * override, but this single shared control only ever reads/writes the
 * global slot (via readGlobalSetting), so N copies would be N ways to set
 * one value. init() acquires, destroy() releases,
 * and the last release unmounts — so the control disappears when the user
 * switches to a non-3D renderer instead of lingering as a dead knob.
 *
 * Everything here is event-driven. No DOM work on a per-frame path.
 */
// Wording is kept verbatim in sync with settings.html's <option> text so
// the same style is not named two different things in two UIs that sit
// two clicks apart. An id with no entry here falls back to the raw id.
export const _PC_LABELS = {
    off: 'Off', particles: 'Particles (drifting)',
    silhouettes: 'Silhouettes (parallax)', lights: 'Lights (stage glows)',
    geometric: 'Geometric (rotating shapes)',
    butterchurn: 'Butterchurn (visualizer)',
    image: 'Custom image', video: 'Custom video',
};
// Which settings each background style actually consumes, so a control
// that would do nothing is greyed out instead of lying.
//
// Derived by reading the BACKGROUND_STYLES bodies: a style uses `intensity` if its
// build() reads settings.intensity, and uses `reactive` if its update()
// dereferences the `bands` argument. 'butterchurn' is a mode, not a
// BACKGROUND_STYLES fog-scenery entry: syncButterchurnMode owns its controller, which
// drives its own audio tap and canvas opacity (only the fog-scenery half
// falls through to BACKGROUND_STYLES.off). So neither knob here reaches it - both
// are false, and the tooltip points at Butterchurn's own controls.
//
// KEEP IN STEP WITH BACKGROUND_STYLES. If a style starts reading bands or intensity
// and its row is not updated, the control stays greyed out and lies the
// other way. An id missing from this table defaults to both-enabled, which
// is the safe direction: a new style is assumed to use its settings.
export const _PC_USES = {
    off:         { intensity: false, reactive: false, why: 'No background to adjust' },
    particles:   { intensity: true,  reactive: true },
    silhouettes: { intensity: true,  reactive: true },
    lights:      { intensity: true,  reactive: true },
    geometric:   { intensity: true,  reactive: true },
    image:       { intensity: true,  reactive: false, why: 'This background does not react to audio' },
    video:       { intensity: false, reactive: false, why: 'The video plays as-is - nothing to adjust here' },
    butterchurn: { intensity: false, reactive: false, why: 'Butterchurn reacts to audio itself - tune it in Settings > 3D Highway, or its Visualizer panel' },
    // Not in BACKGROUND_STYLE_IDS, so it never appears in the dropdown - reached
    // only via the viz-picker Venue flow (h3dVenueSceneSetActive). While
    // active it is the EFFECTIVE style, so both knobs drive nothing.
    venue:       { intensity: false, reactive: false, why: 'Venue visualization is active - pick a background from the visualization picker' },
};
export let _pcRefs = 0, _pcEl = null, _pcSel = null, _pcReactive = null, _pcIntensity = null;
// Non-disabled wrappers around the two greyable controls. A native-disabled
// <button>/<input> receives no pointer events, so its `title` tooltip never
// shows on hover — the whole "greyed out, says why on hover" affordance
// would be dead. The reason lives on these wrappers instead, and the
// disabled control gets pointer-events:none so the hover reaches them.
export let _pcReactiveWrap = null, _pcIntensityWrap = null, _pcReason = null;
export let _pcListener = null, _pcRetry = 0, _pcRetryTimer = 0;

// The player chrome exposes this slot once it has initialised. A host
// that does not provide it gets no control (and no error) - the Settings
// page remains the way in.
export function _pcSlot() {
    try {
        // Gate on the v3 shell per docs/plugin-v3-ui.md (matches the tuner
        // precedent). The playerControlSlot typeof check below already
        // covers the practical case - only v3 exposes it - but the
        // documented checklist asks plugins to detect v3 explicitly.
        if (!window.feedBack || window.feedBack.uiVersion !== 'v3') return null;
        const fn = window.feedBack.ui && window.feedBack.ui.playerControlSlot;
        return typeof fn === 'function' ? fn() : null;
    } catch (_) { return null; }
}
// Visual language: these controls sit in the player's Plugin Controls
// popover alongside pills from other plugins (Invert, Split, Tuner, the
// STEMS group...), so they follow the same look - small rounded pills,
// dark fill, brighter on hover, tinted when active.
//
// Styled INLINE rather than with the Tailwind classes those plugins use
// (px-3 py-1.5 bg-dark-600 hover:bg-dark-500 ...). This plugin owns its
// compiled stylesheet and several of those utilities are not in it, so
// using them would mean regenerating assets/plugin.css and bumping the
// manifest version. The values below are the resolved tokens from
// tailwind.config.js (dark-600 #181830, dark-500 #1e1e3a, gray-300
// #d1d5db), so the result matches without the build step.
export const _PC_C = {
    idle: '#181830',              // bg-dark-600
    hover: '#1e1e3a',             // bg-dark-500
    text: '#d1d5db',              // text-gray-300
    textDim: '#6b7280',           // text-gray-500 (inert controls)
    onBg: 'rgba(20,83,45,0.5)',   // bg-green-900/50
    onText: '#86efac',            // text-green-300
};
export const _PC_PILL = 'padding:.375rem .75rem;border:0;border-radius:.5rem;'
    + 'font-size:.75rem;line-height:1rem;cursor:pointer;'
    + 'transition:background-color .15s,color .15s;';
export function _pcPill(label, title) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    if (title) b.title = title;
    b.style.cssText = _PC_PILL;
    // Hover is a pseudo-class we cannot express inline; these two
    // listeners reproduce hover:bg-dark-500 for non-active pills only
    // (an active pill keeps its tint on hover, as the other plugins do).
    b.addEventListener('mouseenter', () => { if (!b._on) b.style.backgroundColor = _PC_C.hover; });
    b.addEventListener('mouseleave', () => { if (!b._on) b.style.backgroundColor = _PC_C.idle; });
    return b;
}
// Paint a pill's on/off state, optionally greyed out. `disabled` is used
// when the active background style ignores the setting entirely (see
// _pcSync and _PC_USES) - the pill stays visible so the layout
// does not jump, but it is inert and says why on hover.
export function _pcPaint(btn, on, disabled, reason) {
    btn._on = !!on && !disabled;
    btn.disabled = !!disabled;
    btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    // A toggle button must expose its state, not just its label.
    btn.setAttribute('aria-pressed', btn._on ? 'true' : 'false');
    // pointer-events:none lets the hover fall through to _pcReactiveWrap,
    // which carries the reason a disabled button's own title can't show.
    btn.style.pointerEvents = disabled ? 'none' : '';
    btn.style.cursor = disabled ? 'not-allowed' : 'pointer';
    btn.style.opacity = disabled ? '.45' : '1';
    btn.title = reason || 'React to the audio';
    if (disabled) {
        btn.style.backgroundColor = _PC_C.idle;
        btn.style.color = _PC_C.textDim;
        return;
    }
    btn.style.backgroundColor = on ? _PC_C.onBg : _PC_C.idle;
    btn.style.color = on ? _PC_C.onText : _PC_C.text;
}
export function _pcGroupLabel(text) {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = 'font-size:.625rem;letter-spacing:.05em;text-transform:uppercase;'
        + 'color:#6b7280;margin:.375rem 0 .1875rem;';
    return el;
}
// Pull every control back to what is actually stored. Runs on mount and
// whenever the settings bus reports one of our keys changed, so editing
// from the Settings page updates this control and vice-versa.
export function _pcSync() {
    // The active style is the EFFECTIVE one, not the stored one: while the
    // Venue scene override is on it is what's mounted, and it ignores the
    // whole Background group - picking a style writes `style` but
    // mountBackgroundStyle resolves back to venue, so the dropdown would look
    // broken. So under Venue the ENTIRE group goes inert (dropdown too),
    // and the user exits Venue from the visualization picker where they
    // entered it. An unknown id enables everything rather than disabling
    // it, so a style added without a _PC_USES row is merely unhelpful.
    const venue = !!_venueSceneOverride;
    const effectiveStyle = venue ? 'venue' : readGlobalSetting('style');
    const uses = _PC_USES[effectiveStyle] || { intensity: true, reactive: true };
    const why = uses.why || 'This background style ignores this setting';
    if (_pcReason) _pcReason.textContent = why;
    // Point a screen reader at the reason, but only while a control is
    // inert - cleared otherwise so an enabled control is not described by a
    // stale reason.
    const _pcDescribe = (el, inert) => {
        if (!el) return;
        if (inert) el.setAttribute('aria-describedby', 'h3d-pc-reason');
        else el.removeAttribute('aria-describedby');
    };
    _pcDescribe(_pcSel, venue);
    _pcDescribe(_pcReactive, !uses.reactive);
    _pcDescribe(_pcIntensity, !uses.intensity);
    if (_pcSel) {
        // The custom slots stay unselectable until something is uploaded -
        // same rule settings.html applies.
        const img = _pcSel.querySelector('option[value="image"]');
        const vid = _pcSel.querySelector('option[value="video"]');
        if (img) img.disabled = !readGlobalSetting('customImageDataUrl');
        if (vid) vid.disabled = !readGlobalSetting('customVideoName');
        _pcSel.value = readGlobalSetting('style');
        // The dropdown still SHOWS the stored style (venue has no option),
        // but it's inert while Venue owns the scene.
        _pcSel.disabled = venue;
        _pcSel.setAttribute('aria-disabled', venue ? 'true' : 'false');
        _pcSel.style.opacity = venue ? '.45' : '1';
        _pcSel.style.cursor = venue ? 'not-allowed' : '';
        // Restore the base tooltip when Venue exits — blanking it would
        // permanently drop the mount-time 'Background style' hint. Matches
        // how the intensity slider and Reactive pill restore theirs.
        _pcSel.title = venue ? why : 'Background style';
    }
    if (_pcReactive) {
        _pcPaint(_pcReactive, !!readGlobalSetting('reactive'), !uses.reactive,
            uses.reactive ? 'React to the audio' : why);
    }
    // The reason shows via the wrapper (see _pcReactiveWrap); empty when
    // enabled so the control's own title takes over.
    if (_pcReactiveWrap) {
        _pcReactiveWrap.title = uses.reactive ? '' : why;
        _pcReactiveWrap.style.cursor = uses.reactive ? '' : 'not-allowed';
    }
    if (_pcIntensity) {
        _pcIntensity.value = String(readGlobalSetting('intensity'));
        _pcIntensity.disabled = !uses.intensity;
        _pcIntensity.setAttribute('aria-disabled', uses.intensity ? 'false' : 'true');
        _pcIntensity.style.pointerEvents = uses.intensity ? '' : 'none';
        _pcIntensity.style.opacity = uses.intensity ? '1' : '.45';
        _pcIntensity.style.cursor = uses.intensity ? '' : 'not-allowed';
        _pcIntensity.title = uses.intensity ? 'Background intensity' : why;
    }
    if (_pcIntensityWrap) {
        _pcIntensityWrap.title = uses.intensity ? '' : why;
        _pcIntensityWrap.style.cursor = uses.intensity ? '' : 'not-allowed';
    }
}
// Mirror the current values into the Settings panel's controls when it's
// in the DOM.
//
// settings.html hydrates ONCE from localStorage when the panel is injected
// and never subscribes to the settings bus, so before this existed there
// was only one writer and it could not go stale. Adding the in-player
// picker made a second writer, and the panel had no way to hear about it —
// change the style mid-song and Settings would still show the old value.
//
// Assigning .value / .checked programmatically does NOT fire a 'change'
// event, so this cannot loop back into the setters.
export function _pcSyncSettingsPanel() {
    try {
        const st = document.getElementById('h3d-bg-style');
        if (st) st.value = readGlobalSetting('style');
        const re = document.getElementById('h3d-bg-reactive');
        if (re) re.checked = !!readGlobalSetting('reactive');
        const inten = readGlobalSetting('intensity');
        const ie = document.getElementById('h3d-bg-intensity');
        if (ie) ie.value = String(inten);
        // The panel prints the numeric value beside the slider; keep its
        // formatting identical to settings.html's own hydration.
        const il = document.getElementById('h3d-bg-intensity-label');
        if (il) il.textContent = Number(inten).toFixed(2);
    } catch (e) { console.error('[3D-Hwy] settings-panel mirror failed', e); }
}
export function _pcMount() {
    // A screen change can swap the popover out from under us, orphaning
    // the control. Re-resolve only when the cached node is actually gone.
    if (_pcEl && !_pcEl.isConnected) _pcTeardownDom();
    if (_pcEl) return true;
    const slot = _pcSlot();
    if (!slot) return false;

    const box = document.createElement('div');
    box.className = 'h3d-pc';
    box.style.cssText = 'display:flex;flex-direction:column;width:100%;';
    // Visually-hidden text carrying the "why greyed out" reason to screen
    // readers; disabled controls point aria-describedby here. A title alone
    // is announced unreliably and never on touch. One span suffices - every
    // greyed control shares the same reason (derived from the single
    // effective style).
    _pcReason = document.createElement('span');
    _pcReason.id = 'h3d-pc-reason';
    _pcReason.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;'
        + 'margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;';
    box.appendChild(_pcReason);

    box.appendChild(_pcGroupLabel('Background'));
    // A dropdown, not pills: the style list is 8 entries and growing, and
    // a pill per style dominated a popover whose other controls are single
    // toggles. Styled to match the surrounding pills rather than left as a
    // raw <select>.
    _pcSel = document.createElement('select');
    _pcSel.title = 'Background style';
    _pcSel.setAttribute('aria-label', 'Background style');
    _pcSel.style.cssText = 'width:100%;padding:.375rem .5rem;border:0;border-radius:.5rem;'
        + 'font-size:.75rem;line-height:1rem;cursor:pointer;'
        + 'background-color:' + _PC_C.idle + ';color:' + _PC_C.text + ';';
    for (const id of BACKGROUND_STYLE_IDS) {
        const o = document.createElement('option');
        o.value = id;
        o.textContent = _PC_LABELS[id] || id;
        _pcSel.appendChild(o);
    }
    _pcSel.addEventListener('change', () => {
        if (_pcSel.disabled) return;   // inert under the Venue override
        try { window.h3dBgSetStyle(_pcSel.value); }
        catch (e) { console.error('[3D-Hwy] bg style set failed', e); }
    });
    box.appendChild(_pcSel);
    const optWrap = document.createElement('div');
    optWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:.25rem;margin-top:.375rem;';
    _pcReactiveWrap = optWrap;   // carries the greyed-out reason on hover
    _pcReactive = _pcPill('Reactive', 'React to the audio');
    _pcReactive.addEventListener('click', () => {
        if (_pcReactive.disabled) return;
        try { window.h3dBgSetReactive(!_pcReactive._on); }
        catch (e) { console.error('[3D-Hwy] bg reactive set failed', e); }
    });
    optWrap.appendChild(_pcReactive);
    box.appendChild(optWrap);

    box.appendChild(_pcGroupLabel('Intensity'));
    // Wrapper carries the reason on hover when the slider is disabled — a
    // native-disabled <input> shows no title of its own.
    _pcIntensityWrap = document.createElement('div');
    _pcIntensityWrap.style.cssText = 'width:100%;';
    _pcIntensity = document.createElement('input');
    _pcIntensity.type = 'range';
    _pcIntensity.min = '0'; _pcIntensity.max = '1'; _pcIntensity.step = '0.05';
    _pcIntensity.title = 'Background intensity';
    _pcIntensity.setAttribute('aria-label', 'Background intensity');
    _pcIntensity.style.cssText = 'width:100%;accent-color:#4080e0;';
    // 'change' (fires on release), NOT 'input'. Every write goes through
    // writeGlobalSetting -> emitSettingChange -> rebuildBackground(), which tears the
    // background style down and re-runs build(). On 'input' a single drag
    // across the range would trigger ~20 full scene rebuilds on the main
    // thread mid-playback. settings.html's slider makes the same choice:
    // oninput only repaints its label, onchange calls the setter.
    _pcIntensity.addEventListener('change', () => {
        if (_pcIntensity.disabled) return;
        try { window.h3dBgSetIntensity(parseFloat(_pcIntensity.value)); }
        catch (e) { console.error('[3D-Hwy] bg intensity set failed', e); }
    });
    _pcIntensityWrap.appendChild(_pcIntensity);
    box.appendChild(_pcIntensityWrap);
    slot.appendChild(box);
    _pcEl = box;
    _pcSync();
    _pcListener = (key) => {
        if (key === 'style' || key === 'reactive' || key === 'intensity'
            || key === 'customImageDataUrl' || key === 'customVideoName'
            || key === 'venueScene') {
            // 'venueScene' has no dropdown/settings widget of its own, but
            // toggling Venue changes the EFFECTIVE style, so the greying
            // must re-evaluate (see _pcSync's effectiveStyle).
            _pcSync();
            _pcSyncSettingsPanel();
        }
    };
    subscribeToSettings(_pcListener);
    return true;
}
export function _pcTeardownDom() {
    if (_pcListener) { unsubscribeFromSettings(_pcListener); _pcListener = null; }
    if (_pcEl && _pcEl.parentNode) _pcEl.parentNode.removeChild(_pcEl);
    _pcEl = null; _pcSel = null; _pcReactive = null; _pcIntensity = null;
    _pcReactiveWrap = null; _pcIntensityWrap = null; _pcReason = null;
}
export function _pcAcquire() {
    _pcRefs++;
    _pcBindScreenHook();
    if (_pcMount()) return;
    // A non-v3 shell has no slot and never will — _pcAcquire only runs once
    // the renderer is viable inside the v3 player chrome, and player-chrome.js
    // sets uiVersion synchronously as it builds that chrome, so a missing 'v3'
    // here means v2, not a not-yet-ready v3. Skip the retry loop rather than
    // spinning it out to the ~3s budget for a slot that will never appear.
    if (!window.feedBack || window.feedBack.uiVersion !== 'v3') return;
    // The rail popover may not be built yet on a cold load. Retry a few
    // times, then give up quietly — Settings still works.
    if (_pcRetryTimer) return;
    _pcRetry = 0;
    const tick = () => {
        _pcRetryTimer = 0;
        if (_pcRefs <= 0) return;          // renderer went away mid-retry
        // Re-attempt the bus subscription too, not just the mount. On a cold
        // load the renderer can init before window.feedBack.on exists; the
        // first _pcBindScreenHook() then no-ops and, without this, the hook
        // never binds and the control goes permanently deaf to screen
        // changes. Idempotent via the _pcScreenHook guard.
        _pcBindScreenHook();
        if (_pcMount()) return;
        if (++_pcRetry > 12) return;       // ~3s at 250ms
        _pcRetryTimer = setTimeout(tick, 250);
    };
    _pcRetryTimer = setTimeout(tick, 250);
}
// Re-mount after the player chrome is rebuilt.
//
// _pcMount's isConnected check can only run when something calls it, and
// after the first successful mount nothing did - init() and the retry tick
// are the only callers, and the tick stops on success. So a popover that
// got swapped out left the control gone until the next song change. This
// listener gives that check a real trigger.
//
// Event-driven and cheap: one _pcMount() call per screen change, and it
// early-returns immediately when the cached node is still connected.
export let _pcScreenHook = null;
export function _pcBindScreenHook() {
    if (_pcScreenHook) return;
    const bus = window.feedBack;
    if (!bus || typeof bus.on !== 'function') return;
    _pcScreenHook = () => { if (_pcRefs > 0) _pcMount(); };
    try { bus.on('screen:changed', _pcScreenHook); }
    catch (e) { _pcScreenHook = null; }
}
export function _pcRelease() {
    _pcRefs = Math.max(0, _pcRefs - 1);
    if (_pcRefs > 0) return;
    if (_pcRetryTimer) { clearTimeout(_pcRetryTimer); _pcRetryTimer = 0; }
    // Drop the screen:changed subscription too, not just the DOM. The
    // refcount guard inside the hook makes a stale one harmless, but the
    // listener and its closure would otherwise outlive the control for the
    // page's lifetime — and a plugin re-load (new ?v=) evaluates this file
    // again, binding another hook to the same bus while the old one stays.
    // _pcBindScreenHook re-binds on the next acquire.
    if (_pcScreenHook) {
        try {
            const bus = window.feedBack;
            if (bus && typeof bus.off === 'function') bus.off('screen:changed', _pcScreenHook);
        } catch (e) { /* best-effort: a host without off() just keeps the no-op hook */ }
        _pcScreenHook = null;
    }
    _pcTeardownDom();
}
