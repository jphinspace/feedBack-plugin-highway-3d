import { audioMeters } from './engine.js';
import {
    DEFAULT_BANNED_PRESETS, DEFAULT_FAVORITE_PRESETS, bannedPresets, favoritePresets, loadPresetLists, loadButterchurnSettings,
    savePresetLists, saveButterchurnSettings,
} from './prefs.js';

/** Shared pill/button chrome for every control in the in-canvas panel below. */
const PANEL_BUTTON_CSS = 'background:rgba(255,255,255,.09);color:#cfe3ff;border:1px solid rgba(255,255,255,.16);border-radius:5px;padding:3px 8px;cursor:pointer;font:12px system-ui';

export let primaryController = null;
let presetPaneEl = null, presetListEl = null, presetFilterEl = null, presetPaneOpen = false, panelCollapsed = false;

function presetStatusMark(name) {
    return favoritePresets.has(name) ? '★ ' : (bannedPresets.has(name) ? '🚫 ' : '');
}
function setPresetHold(v) {
    const s = loadButterchurnSettings();
    s.hold = !!v; saveButterchurnSettings();
    const b = presetPanelEl && presetPanelEl.querySelector('#vz-hold');
    if (b) b.textContent = s.hold ? '▶ Resume' : '⏸ Hold';
}
/** Slides the panel and preset pane off the right edge. Order when both open (L→R): panel → pane → window edge. */
function layoutPanels() {
    if (presetPanelEl) {
        let tx = 0;
        if (panelCollapsed) tx = 210;
        else if (presetPaneOpen) tx = -248;
        presetPanelEl.style.transform = 'translateX(' + tx + 'px) translateY(-50%)';
    }
    if (presetPaneEl) {
        presetPaneEl.style.transform = (presetPaneOpen && !panelCollapsed) ? 'translateX(0) translateY(-50%)' : 'translateX(calc(100% + 16px)) translateY(-50%)';
    }
}
function setPresetPaneOpen(open) {
    presetPaneOpen = !!open && !panelCollapsed;
    const b = presetPanelEl && presetPanelEl.querySelector('#vz-listbtn');
    if (b) b.textContent = presetPaneOpen ? '>>' : '<<';
    if (presetPaneOpen) renderPresetList();
    layoutPanels();
}
function renderPresetList() {
    if (!presetListEl) return;
    const ctrl = primaryController;
    const keys = (ctrl && ctrl.keys) ? ctrl.keys : [];
    const filt = ((presetFilterEl && presetFilterEl.value) || '').toLowerCase();
    const cur = ctrl && ctrl.curName;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < keys.length; i++) {
        const name = keys[i];
        if (filt && name.toLowerCase().indexOf(filt) === -1) continue;
        const row = document.createElement('div');
        row.textContent = presetStatusMark(name) + name;
        row.title = name;
        row.style.cssText = 'padding:3px 7px;border-radius:4px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px;' +
            (name === cur ? 'background:rgba(110,160,255,.28);' : '') + (bannedPresets.has(name) ? 'opacity:.55;' : '');
        row.addEventListener('click', () => {
            if (!primaryController) return;
            primaryController.loadByName(name, 1.0);
            setPresetHold(true);
        });
        frag.appendChild(row);
    }
    presetListEl.innerHTML = '';
    presetListEl.appendChild(frag);
}
export function updatePanelPreset() {
    if (!presetPanelEl) return;
    const name = primaryController ? (primaryController.curName || null) : null;
    const nameEl = presetPanelEl.querySelector('#vz-pname');
    const favBtn = presetPanelEl.querySelector('#vz-fav');
    const banBtn = presetPanelEl.querySelector('#vz-ban');
    const cntEl = presetPanelEl.querySelector('#vz-pcount');
    if (nameEl) { nameEl.textContent = (name ? presetStatusMark(name) : '') + (name || '—'); nameEl.title = name ? (name + ' — click for full list') : ''; }
    if (favBtn) favBtn.textContent = (name && favoritePresets.has(name)) ? '★ Favorited' : '☆ Favorite';
    if (banBtn) banBtn.textContent = (name && bannedPresets.has(name)) ? '🚫 Banned' : '🚫 Ban';
    if (cntEl) cntEl.textContent = '★ ' + favoritePresets.size + '   🚫 ' + bannedPresets.size;
    if (presetPaneOpen) renderPresetList();
}

let presetPanelEl = null, panelHotkeyBound = false;

/** Mounts (or re-parents) the singleton preset-browser panel onto `host`, the wrap of the currently on-screen highway. */
export function ensurePresetPanel(host) {
    if (presetPanelEl && presetPanelEl.isConnected) {
        if (host && presetPanelEl.parentNode !== host) {
            host.appendChild(presetPanelEl);
            if (presetPaneEl) host.appendChild(presetPaneEl);
        }
        return presetPanelEl;
    }
    const s = loadButterchurnSettings();
    const p = document.createElement('div');
    p.id = 'viz3d-panel';
    p.style.cssText = 'position:absolute;top:50%;right:10px;z-index:100000;pointer-events:auto;font:12px/1.45 system-ui,sans-serif;' +
        'color:#cfe3ff;background:rgba(8,10,20,0.82);padding:9px 11px;border-radius:8px;width:186px;' +
        'box-shadow:0 2px 12px rgba(0,0,0,0.5);user-select:none;transition:transform 0.28s ease;';
    p.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px"><span style="font-weight:600">🌀 Visualizer</span><button id="vz-listbtn" title="Show / hide full preset list" style="' + PANEL_BUTTON_CSS + ';padding:1px 7px">&lt;&lt;</button></div>' +
        // On/off/opacity/dim/chart/tint/gain controls live in settings.html; this panel is only the live preset browser.
        '<div style="opacity:.55;font-size:11px;margin:2px 0 6px">Background &amp; reactivity options are in Settings ▸ 3D Highway.</div>' +
        '<div style="display:flex;align-items:center;gap:6px;margin:4px 0">' +
          '<button id="vz-prev" style="' + PANEL_BUTTON_CSS + '">◀</button>' +
          '<div id="vz-pname" style="flex:1;text-align:center;font-size:11px;opacity:.9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer" title="">—</div>' +
          '<button id="vz-next" style="' + PANEL_BUTTON_CSS + '">▶</button>' +
        '</div>' +
        '<div style="display:flex;gap:6px;margin:4px 0">' +
          '<button id="vz-fav" style="' + PANEL_BUTTON_CSS + ';flex:1">♡ Favorite</button>' +
          '<button id="vz-ban" style="' + PANEL_BUTTON_CSS + ';flex:1">🚫 Ban</button>' +
        '</div>' +
        '<div style="display:flex;gap:6px;align-items:flex-end;margin:6px 0">' +
          '<label style="flex:1">Cycle <select id="vz-cyc" style="width:100%;background:#11141f;color:#cfe3ff;border:1px solid rgba(255,255,255,.15);border-radius:5px;padding:3px"><option value="all">All</option><option value="favorites">Favorites</option><option value="bans">Bans</option></select></label>' +
          '<button id="vz-hold" style="' + PANEL_BUTTON_CSS + '">⏸ Hold</button>' +
        '</div>' +
        '<div style="margin:5px 0 4px;font-size:11px;opacity:.75"><span id="vz-pcount">★ 0   🚫 0</span></div>' +
        '<div id="vz-meter" style="opacity:.65;margin-top:6px;font:11px/1.3 monospace">gtr —  ·  song —</div>' +
        '<div style="opacity:.45;margin-top:4px;font-size:11px">` or ‹‹ to hide</div>';
    (host || document.body).appendChild(p);

    const tab = document.createElement('button');
    tab.textContent = '>>';
    tab.title = 'Hide / show controls';
    tab.style.cssText = 'position:absolute;top:6px;left:-23px;width:23px;height:28px;border:none;cursor:pointer;' +
        'background:rgba(8,10,20,0.82);color:#cfe3ff;border-radius:7px 0 0 7px;font:12px/1 monospace;padding:0;';
    p.appendChild(tab);
    tab.addEventListener('click', () => {
        panelCollapsed = !panelCollapsed;
        if (panelCollapsed) presetPaneOpen = false;
        tab.textContent = panelCollapsed ? '<<' : '>>';
        const lb = p.querySelector('#vz-listbtn'); if (lb) lb.textContent = presetPaneOpen ? '>>' : '<<';
        layoutPanels();
    });

    const pane = document.createElement('div');
    pane.id = 'viz3d-listpane';
    pane.style.cssText = 'position:absolute;top:50%;right:10px;z-index:99999;pointer-events:auto;width:236px;max-height:74vh;display:flex;flex-direction:column;' +
        'background:rgba(8,10,20,0.93);border-radius:8px;box-shadow:0 2px 14px rgba(0,0,0,0.55);color:#cfe3ff;' +
        'font:12px system-ui,sans-serif;overflow:hidden;transform:translateX(calc(100% + 16px)) translateY(-50%);transition:transform 0.28s ease;';
    pane.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 9px 7px 10px;font-weight:600;border-bottom:1px solid rgba(255,255,255,.1)"><span>Presets</span><button id="vz-defaults" title="Restore the bundled default favorites + bans" style="' + PANEL_BUTTON_CSS + ';font-weight:400">↺ defaults</button></div>' +
        '<input id="vz-filter" placeholder="filter…" spellcheck="false" style="margin:8px 9px 6px;padding:4px 7px;background:#11141f;color:#cfe3ff;border:1px solid rgba(255,255,255,.15);border-radius:5px;outline:none">' +
        '<div id="vz-list" style="overflow-y:auto;padding:0 4px 8px"></div>';
    (host || document.body).appendChild(pane);
    presetPaneEl = pane;
    presetListEl = pane.querySelector('#vz-list');
    presetFilterEl = pane.querySelector('#vz-filter');
    presetFilterEl.addEventListener('input', renderPresetList);
    pane.querySelector('#vz-defaults').addEventListener('click', restoreDefaultPresetLists);

    const q = (id) => p.querySelector(id);
    presetPanelEl = p;

    loadPresetLists();
    const cyc = q('#vz-cyc');
    cyc.value = s.cyclePool || 'all';
    // Read fresh: settings.html writes can replace butterchurnSettings after `s` was captured.
    cyc.addEventListener('change', () => { loadButterchurnSettings().cyclePool = cyc.value; saveButterchurnSettings(); });
    setPresetHold(!!s.hold);
    q('#vz-hold').addEventListener('click', () => setPresetHold(!loadButterchurnSettings().hold));
    q('#vz-listbtn').addEventListener('click', () => setPresetPaneOpen(!presetPaneOpen));
    q('#vz-pname').addEventListener('click', () => setPresetPaneOpen(!presetPaneOpen));
    q('#vz-prev').addEventListener('click', () => { if (primaryController) primaryController.step(-1); });
    q('#vz-next').addEventListener('click', () => { if (primaryController) primaryController.step(1); });
    q('#vz-fav').addEventListener('click', () => { if (primaryController) primaryController.toggleFav(); });
    q('#vz-ban').addEventListener('click', () => { if (primaryController) primaryController.banCur(); });
    setPresetPaneOpen(false);
    updatePanelPreset();

    // Self-stops when the panel is removed (presetPanelEl !== p).
    (function meterLoop() {
        if (presetPanelEl !== p) return;
        const m = p.querySelector('#vz-meter');
        if (m) m.textContent = 'gtr ' + audioMeters.gtr.toFixed(2) + '  ·  song ' + audioMeters.song.toFixed(2);
        setTimeout(meterLoop, 150);
    })();

    if (!panelHotkeyBound) {
        panelHotkeyBound = true;
        window.addEventListener('keydown', (e) => {
            if (e.key !== '`' || e.metaKey || e.ctrlKey || !presetPanelEl) return;
            const tag = (e.target && e.target.tagName) || '';
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            const reveal = presetPanelEl.style.display === 'none';
            presetPanelEl.style.display = reveal ? '' : 'none';
            if (presetPaneEl) presetPaneEl.style.display = reveal ? '' : 'none';
        });
    }
    return presetPanelEl;
}

/** Merges the bundled defaults back in: a default-favorite un-bans, a default-ban un-favorites. */
function restoreDefaultPresetLists() {
    DEFAULT_FAVORITE_PRESETS.forEach((n) => { bannedPresets.delete(n); favoritePresets.add(n); });
    DEFAULT_BANNED_PRESETS.forEach((n) => { favoritePresets.delete(n); bannedPresets.add(n); });
    try { localStorage.setItem('viz3d_seeded', '1'); } catch (e) {}
    savePresetLists(); updatePanelPreset(); renderPresetList();
}

/** Setter for `primaryController` — `createButterchurnController` (controller.js) is an outside module and can only write via this. */
export function setPrimaryController(ctrl) { primaryController = ctrl; }
export function teardownPresetPanel() {
    if (presetPanelEl && presetPanelEl.parentNode) presetPanelEl.parentNode.removeChild(presetPanelEl);
    if (presetPaneEl && presetPaneEl.parentNode) presetPaneEl.parentNode.removeChild(presetPaneEl);
    presetPanelEl = null; presetPaneEl = null; presetListEl = null; presetFilterEl = null; presetPaneOpen = false;
}
