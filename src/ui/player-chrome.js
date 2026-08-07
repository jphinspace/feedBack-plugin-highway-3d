import { BACKGROUND_STYLE_IDS } from '../settings/defaults.js';
import { readGlobalSetting, subscribeToSettings, unsubscribeFromSettings } from '../settings/store.js';
import { _venueSceneOverride } from '../background/venue.js';

/**
 * Background picker mounted into the player's Plugins rail popover, so the
 * background can be switched mid-song without leaving for Settings. Writes
 * through the same global setters settings.html uses, so both UIs stay in
 * sync via the existing pub-sub. The option list is generated from
 * {@link BACKGROUND_STYLE_IDS}.
 *
 * Mounted once, refcounted: under splitscreen there are N renderer
 * instances but these settings are global, so `acquireBackgroundControl()`/
 * `releaseBackgroundControl()` keep exactly one control mounted, unmounting
 * when the last renderer releases it.
 */

/** Kept in sync with settings.html's `<option>` text so a style isn't named differently in two UIs. An id with no entry falls back to the raw id. */
export const STYLE_LABELS = {
    off: 'Off', particles: 'Particles (drifting)',
    silhouettes: 'Silhouettes (parallax)', lights: 'Lights (stage glows)',
    geometric: 'Geometric (rotating shapes)',
    butterchurn: 'Butterchurn (visualizer)',
    image: 'Custom image', video: 'Custom video',
};
/**
 * Which settings each background style actually consumes, so an
 * inapplicable control is greyed out instead of doing nothing silently.
 * Must stay in step with `BACKGROUND_STYLES` — an id missing here defaults
 * to both-enabled (the safe direction). `venue` isn't in
 * `BACKGROUND_STYLE_IDS` (reached only via the viz-picker), but while
 * active it's the effective style, so both knobs are false for it too.
 */
export const STYLE_SETTING_USES = {
    off:         { intensity: false, reactive: false, why: 'No background to adjust' },
    particles:   { intensity: true,  reactive: true },
    silhouettes: { intensity: true,  reactive: true },
    lights:      { intensity: true,  reactive: true },
    geometric:   { intensity: true,  reactive: true },
    image:       { intensity: true,  reactive: false, why: 'This background does not react to audio' },
    video:       { intensity: false, reactive: false, why: 'The video plays as-is - nothing to adjust here' },
    butterchurn: { intensity: false, reactive: false, why: 'Butterchurn reacts to audio itself - tune it in Settings > 3D Highway, or its Visualizer panel' },
    venue:       { intensity: false, reactive: false, why: 'Venue visualization is active - pick a background from the visualization picker' },
};
export let controlRefCount = 0, controlEl = null, styleSelectEl = null, reactiveBtn = null, intensitySlider = null;
/** Wrappers around the two greyable controls that carry the "why" tooltip: a native-disabled input receives no pointer events, so its own `title` never shows on hover. */
export let reactiveWrapEl = null, intensityWrapEl = null, reasonEl = null;
export let settingsBusListener = null, mountRetryCount = 0, mountRetryTimer = 0;

/** Resolves the player chrome's control slot; `null` on a host that doesn't provide one (Settings remains the way in). */
export function resolvePlayerControlSlot() {
    try {
        if (!window.feedBack || window.feedBack.uiVersion !== 'v3') return null;
        const fn = window.feedBack.ui && window.feedBack.ui.playerControlSlot;
        return typeof fn === 'function' ? fn() : null;
    } catch (_) { return null; }
}

/** Resolved Tailwind tokens (dark-600/dark-500/gray-300/etc.), since this plugin's own stylesheet doesn't include the other plugins' utility classes. */
export const CONTROL_COLORS = {
    idle: '#181830',
    hover: '#1e1e3a',
    text: '#d1d5db',
    textDim: '#6b7280',
    onBg: 'rgba(20,83,45,0.5)',
    onText: '#86efac',
};
export const PILL_CSS = 'padding:.375rem .75rem;border:0;border-radius:.5rem;'
    + 'font-size:.75rem;line-height:1rem;cursor:pointer;'
    + 'transition:background-color .15s,color .15s;';
export function makePill(label, title) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    if (title) b.title = title;
    b.style.cssText = PILL_CSS;
    b.addEventListener('mouseenter', () => { if (!b._on) b.style.backgroundColor = CONTROL_COLORS.hover; });
    b.addEventListener('mouseleave', () => { if (!b._on) b.style.backgroundColor = CONTROL_COLORS.idle; });
    return b;
}
/** Paints a pill's on/off state; `disabled` keeps it visible (no layout jump) but inert, with `reason` on hover. */
export function paintPill(btn, on, disabled, reason) {
    btn._on = !!on && !disabled;
    btn.disabled = !!disabled;
    btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    btn.setAttribute('aria-pressed', btn._on ? 'true' : 'false');
    // pointer-events:none lets the hover fall through to the wrapper, which carries the reason.
    btn.style.pointerEvents = disabled ? 'none' : '';
    btn.style.cursor = disabled ? 'not-allowed' : 'pointer';
    btn.style.opacity = disabled ? '.45' : '1';
    btn.title = reason || 'React to the audio';
    if (disabled) {
        btn.style.backgroundColor = CONTROL_COLORS.idle;
        btn.style.color = CONTROL_COLORS.textDim;
        return;
    }
    btn.style.backgroundColor = on ? CONTROL_COLORS.onBg : CONTROL_COLORS.idle;
    btn.style.color = on ? CONTROL_COLORS.onText : CONTROL_COLORS.text;
}
export function makeGroupLabel(text) {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = 'font-size:.625rem;letter-spacing:.05em;text-transform:uppercase;'
        + 'color:#6b7280;margin:.375rem 0 .1875rem;';
    return el;
}
/** Pulls every control back to the stored/effective values; runs on mount and whenever the settings bus reports a relevant key. */
export function syncControls() {
    // The active style is the EFFECTIVE one: while the Venue override is on, it's
    // mounted regardless of the stored `style`, so the whole group goes inert under it.
    const venue = !!_venueSceneOverride;
    const effectiveStyle = venue ? 'venue' : readGlobalSetting('style');
    const uses = STYLE_SETTING_USES[effectiveStyle] || { intensity: true, reactive: true };
    const why = uses.why || 'This background style ignores this setting';
    if (reasonEl) reasonEl.textContent = why;
    const describeIfInert = (el, inert) => {
        if (!el) return;
        if (inert) el.setAttribute('aria-describedby', 'h3d-pc-reason');
        else el.removeAttribute('aria-describedby');
    };
    describeIfInert(styleSelectEl, venue);
    describeIfInert(reactiveBtn, !uses.reactive);
    describeIfInert(intensitySlider, !uses.intensity);
    if (styleSelectEl) {
        const img = styleSelectEl.querySelector('option[value="image"]');
        const vid = styleSelectEl.querySelector('option[value="video"]');
        if (img) img.disabled = !readGlobalSetting('customImageDataUrl');
        if (vid) vid.disabled = !readGlobalSetting('customVideoName');
        styleSelectEl.value = readGlobalSetting('style');
        styleSelectEl.disabled = venue;
        styleSelectEl.setAttribute('aria-disabled', venue ? 'true' : 'false');
        styleSelectEl.style.opacity = venue ? '.45' : '1';
        styleSelectEl.style.cursor = venue ? 'not-allowed' : '';
        styleSelectEl.title = venue ? why : 'Background style';
    }
    if (reactiveBtn) {
        paintPill(reactiveBtn, !!readGlobalSetting('reactive'), !uses.reactive,
            uses.reactive ? 'React to the audio' : why);
    }
    if (reactiveWrapEl) {
        reactiveWrapEl.title = uses.reactive ? '' : why;
        reactiveWrapEl.style.cursor = uses.reactive ? '' : 'not-allowed';
    }
    if (intensitySlider) {
        intensitySlider.value = String(readGlobalSetting('intensity'));
        intensitySlider.disabled = !uses.intensity;
        intensitySlider.setAttribute('aria-disabled', uses.intensity ? 'false' : 'true');
        intensitySlider.style.pointerEvents = uses.intensity ? '' : 'none';
        intensitySlider.style.opacity = uses.intensity ? '1' : '.45';
        intensitySlider.style.cursor = uses.intensity ? '' : 'not-allowed';
        intensitySlider.title = uses.intensity ? 'Background intensity' : why;
    }
    if (intensityWrapEl) {
        intensityWrapEl.title = uses.intensity ? '' : why;
        intensityWrapEl.style.cursor = uses.intensity ? '' : 'not-allowed';
    }
}
/**
 * Mirrors the current values into settings.html's own controls when present.
 * settings.html hydrates once from localStorage and doesn't subscribe to
 * the bus, so this is what keeps it from going stale when this picker
 * changes a value mid-song. Assigning `.value`/`.checked` doesn't fire
 * `change`, so this can't loop back into the setters.
 */
export function syncSettingsPanelMirror() {
    try {
        const st = document.getElementById('h3d-bg-style');
        if (st) st.value = readGlobalSetting('style');
        const re = document.getElementById('h3d-bg-reactive');
        if (re) re.checked = !!readGlobalSetting('reactive');
        const inten = readGlobalSetting('intensity');
        const ie = document.getElementById('h3d-bg-intensity');
        if (ie) ie.value = String(inten);
        const il = document.getElementById('h3d-bg-intensity-label');
        if (il) il.textContent = Number(inten).toFixed(2);
    } catch (e) { console.error('[3D-Hwy] settings-panel mirror failed', e); }
}
export function mountControl() {
    if (controlEl && !controlEl.isConnected) teardownControlDom();
    if (controlEl) return true;
    const slot = resolvePlayerControlSlot();
    if (!slot) return false;

    const box = document.createElement('div');
    box.className = 'h3d-pc';
    box.style.cssText = 'display:flex;flex-direction:column;width:100%;';
    // Visually-hidden text carrying the "why greyed out" reason to screen readers;
    // one span suffices since every greyed control shares the same effective-style reason.
    reasonEl = document.createElement('span');
    reasonEl.id = 'h3d-pc-reason';
    reasonEl.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;'
        + 'margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;';
    box.appendChild(reasonEl);

    box.appendChild(makeGroupLabel('Background'));
    styleSelectEl = document.createElement('select');
    styleSelectEl.title = 'Background style';
    styleSelectEl.setAttribute('aria-label', 'Background style');
    styleSelectEl.style.cssText = 'width:100%;padding:.375rem .5rem;border:0;border-radius:.5rem;'
        + 'font-size:.75rem;line-height:1rem;cursor:pointer;'
        + 'background-color:' + CONTROL_COLORS.idle + ';color:' + CONTROL_COLORS.text + ';';
    for (const id of BACKGROUND_STYLE_IDS) {
        const o = document.createElement('option');
        o.value = id;
        o.textContent = STYLE_LABELS[id] || id;
        styleSelectEl.appendChild(o);
    }
    styleSelectEl.addEventListener('change', () => {
        if (styleSelectEl.disabled) return;
        try { window.h3dBgSetStyle(styleSelectEl.value); }
        catch (e) { console.error('[3D-Hwy] bg style set failed', e); }
    });
    box.appendChild(styleSelectEl);
    const optWrap = document.createElement('div');
    optWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:.25rem;margin-top:.375rem;';
    reactiveWrapEl = optWrap;
    reactiveBtn = makePill('Reactive', 'React to the audio');
    reactiveBtn.addEventListener('click', () => {
        if (reactiveBtn.disabled) return;
        try { window.h3dBgSetReactive(!reactiveBtn._on); }
        catch (e) { console.error('[3D-Hwy] bg reactive set failed', e); }
    });
    optWrap.appendChild(reactiveBtn);
    box.appendChild(optWrap);

    box.appendChild(makeGroupLabel('Intensity'));
    intensityWrapEl = document.createElement('div');
    intensityWrapEl.style.cssText = 'width:100%;';
    intensitySlider = document.createElement('input');
    intensitySlider.type = 'range';
    intensitySlider.min = '0'; intensitySlider.max = '1'; intensitySlider.step = '0.05';
    intensitySlider.title = 'Background intensity';
    intensitySlider.setAttribute('aria-label', 'Background intensity');
    intensitySlider.style.cssText = 'width:100%;accent-color:#4080e0;';
    // 'change' (on release), not 'input': every write tears down and rebuilds the
    // background style, so an 'input' listener would rebuild ~20x per drag.
    intensitySlider.addEventListener('change', () => {
        if (intensitySlider.disabled) return;
        try { window.h3dBgSetIntensity(parseFloat(intensitySlider.value)); }
        catch (e) { console.error('[3D-Hwy] bg intensity set failed', e); }
    });
    intensityWrapEl.appendChild(intensitySlider);
    box.appendChild(intensityWrapEl);
    slot.appendChild(box);
    controlEl = box;
    syncControls();
    settingsBusListener = (key) => {
        if (key === 'style' || key === 'reactive' || key === 'intensity'
            || key === 'customImageDataUrl' || key === 'customVideoName'
            || key === 'venueScene') {
            syncControls();
            syncSettingsPanelMirror();
        }
    };
    subscribeToSettings(settingsBusListener);
    return true;
}
export function teardownControlDom() {
    if (settingsBusListener) { unsubscribeFromSettings(settingsBusListener); settingsBusListener = null; }
    if (controlEl && controlEl.parentNode) controlEl.parentNode.removeChild(controlEl);
    controlEl = null; styleSelectEl = null; reactiveBtn = null; intensitySlider = null;
    reactiveWrapEl = null; intensityWrapEl = null; reasonEl = null;
}
export function acquireBackgroundControl() {
    controlRefCount++;
    bindScreenChangedHook();
    if (mountControl()) return;
    // A non-v3 shell never gets a slot; skip the retry loop rather than spinning it out.
    if (!window.feedBack || window.feedBack.uiVersion !== 'v3') return;
    // The rail popover may not be built yet on a cold load — retry a few times, then give up quietly.
    if (mountRetryTimer) return;
    mountRetryCount = 0;
    const tick = () => {
        mountRetryTimer = 0;
        if (controlRefCount <= 0) return;
        bindScreenChangedHook();
        if (mountControl()) return;
        if (++mountRetryCount > 12) return;
        mountRetryTimer = setTimeout(tick, 250);
    };
    mountRetryTimer = setTimeout(tick, 250);
}
export let screenChangedHook = null;
/** Re-mounts after the player chrome is rebuilt (a popover swap otherwise leaves the control gone until the next song change). */
export function bindScreenChangedHook() {
    if (screenChangedHook) return;
    const bus = window.feedBack;
    if (!bus || typeof bus.on !== 'function') return;
    screenChangedHook = () => { if (controlRefCount > 0) mountControl(); };
    try { bus.on('screen:changed', screenChangedHook); }
    catch (e) { screenChangedHook = null; }
}
export function releaseBackgroundControl() {
    controlRefCount = Math.max(0, controlRefCount - 1);
    if (controlRefCount > 0) return;
    if (mountRetryTimer) { clearTimeout(mountRetryTimer); mountRetryTimer = 0; }
    if (screenChangedHook) {
        try {
            const bus = window.feedBack;
            if (bus && typeof bus.off === 'function') bus.off('screen:changed', screenChangedHook);
        } catch (e) { /* best-effort: a host without off() just keeps the no-op hook */ }
        screenChangedHook = null;
    }
    teardownControlDom();
}
