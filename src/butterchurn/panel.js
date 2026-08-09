import { audioMeters } from './engine.js';
import {
  DEFAULT_BANNED_PRESETS, DEFAULT_FAVORITE_PRESETS, bannedPresets, favoritePresets, loadPresetLists, loadButterchurnSettings,
  savePresetLists, saveButterchurnSettings,
} from './prefs.js';
import { DOM_ID_PREFIX } from '../plugin-identity.js';

/** Shared pill/button chrome for every control in the in-canvas panel below. */
const PANEL_BUTTON_CSS = 'background:rgba(255,255,255,.09);color:#cfe3ff;border:1px solid rgba(255,255,255,.16);border-radius:5px;padding:3px 8px;cursor:pointer;font:12px system-ui';
const PANEL_IDS = Object.freeze({
  listButton: `${DOM_ID_PREFIX}vz-listbtn`,
  previous: `${DOM_ID_PREFIX}vz-prev`,
  presetName: `${DOM_ID_PREFIX}vz-pname`,
  next: `${DOM_ID_PREFIX}vz-next`,
  favorite: `${DOM_ID_PREFIX}vz-fav`,
  ban: `${DOM_ID_PREFIX}vz-ban`,
  cycle: `${DOM_ID_PREFIX}vz-cyc`,
  hold: `${DOM_ID_PREFIX}vz-hold`,
  presetCount: `${DOM_ID_PREFIX}vz-pcount`,
  meter: `${DOM_ID_PREFIX}vz-meter`,
  defaults: `${DOM_ID_PREFIX}vz-defaults`,
  filter: `${DOM_ID_PREFIX}vz-filter`,
  list: `${DOM_ID_PREFIX}vz-list`,
});
const panelSelector = (key) => `#${PANEL_IDS[key]}`;

export let primaryController = null;
let presetPaneEl = null; let presetListEl = null; let presetFilterEl = null; let presetPaneOpen = false; let
  panelCollapsed = false;

function presetStatusMark(name) {
  return favoritePresets.has(name) ? '★ ' : (bannedPresets.has(name) ? '🚫 ' : '');
}
function setPresetHold(v) {
  const s = loadButterchurnSettings();
  s.hold = !!v; saveButterchurnSettings();
  const b = presetPanelEl && presetPanelEl.querySelector(panelSelector('hold'));
  if (b) b.textContent = s.hold ? '▶ Resume' : '⏸ Hold';
}
/** Slides the panel and preset pane off the right edge. Order when both open (L→R): panel → pane → window edge. */
function layoutPanels() {
  if (presetPanelEl) {
    let tx = 0;
    if (panelCollapsed) tx = 210;
    else if (presetPaneOpen) tx = -248;
    presetPanelEl.style.transform = `translateX(${tx}px) translateY(-50%)`;
  }
  if (presetPaneEl) {
    presetPaneEl.style.transform = (presetPaneOpen && !panelCollapsed) ? 'translateX(0) translateY(-50%)' : 'translateX(calc(100% + 16px)) translateY(-50%)';
  }
}
function setPresetPaneOpen(open) {
  presetPaneOpen = !!open && !panelCollapsed;
  const b = presetPanelEl && presetPanelEl.querySelector(panelSelector('listButton'));
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
    row.style.cssText = `padding:3px 7px;border-radius:4px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px;${
      name === cur ? 'background:rgba(110,160,255,.28);' : ''}${bannedPresets.has(name) ? 'opacity:.55;' : ''}`;
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
  const nameEl = presetPanelEl.querySelector(panelSelector('presetName'));
  const favBtn = presetPanelEl.querySelector(panelSelector('favorite'));
  const banBtn = presetPanelEl.querySelector(panelSelector('ban'));
  const cntEl = presetPanelEl.querySelector(panelSelector('presetCount'));
  if (nameEl) { nameEl.textContent = (name ? presetStatusMark(name) : '') + (name || '—'); nameEl.title = name ? (`${name} — click for full list`) : ''; }
  if (favBtn) favBtn.textContent = (name && favoritePresets.has(name)) ? '★ Favorited' : '☆ Favorite';
  if (banBtn) banBtn.textContent = (name && bannedPresets.has(name)) ? '🚫 Banned' : '🚫 Ban';
  if (cntEl) cntEl.textContent = `★ ${favoritePresets.size}   🚫 ${bannedPresets.size}`;
  if (presetPaneOpen) renderPresetList();
}

let presetPanelEl = null;

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
  p.id = `${DOM_ID_PREFIX}butterchurn-panel`;
  p.style.cssText = 'position:absolute;top:50%;right:10px;z-index:100000;pointer-events:auto;font:12px/1.45 system-ui,sans-serif;'
        + 'color:#cfe3ff;background:rgba(8,10,20,0.82);padding:9px 11px;border-radius:8px;width:186px;'
        + 'box-shadow:0 2px 12px rgba(0,0,0,0.5);user-select:none;transition:transform 0.28s ease;';
  p.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px"><span style="font-weight:600">🌀 Visualizer</span><button id="${PANEL_IDS.listButton}" title="Show / hide full preset list" style="${PANEL_BUTTON_CSS};padding:1px 7px">&lt;&lt;</button></div>`
        // On/off/opacity/dim/chart/tint/gain controls live in settings.html; this panel is only the live preset browser.
        + '<div style="opacity:.55;font-size:11px;margin:2px 0 6px">Background &amp; reactivity options are in Settings ▸ 3D Highway (dev).</div>'
        + '<div style="display:flex;align-items:center;gap:6px;margin:4px 0">'
          + `<button id="${PANEL_IDS.previous}" style="${PANEL_BUTTON_CSS}">◀</button>`
          + `<div id="${PANEL_IDS.presetName}" style="flex:1;text-align:center;font-size:11px;opacity:.9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer" title="">—</div>`
          + `<button id="${PANEL_IDS.next}" style="${PANEL_BUTTON_CSS}">▶</button>`
        + '</div>'
        + '<div style="display:flex;gap:6px;margin:4px 0">'
          + `<button id="${PANEL_IDS.favorite}" style="${PANEL_BUTTON_CSS};flex:1">♡ Favorite</button>`
          + `<button id="${PANEL_IDS.ban}" style="${PANEL_BUTTON_CSS};flex:1">🚫 Ban</button>`
        + '</div>'
        + '<div style="display:flex;gap:6px;align-items:flex-end;margin:6px 0">'
          + `<label style="flex:1">Cycle <select id="${PANEL_IDS.cycle}" style="width:100%;background:#11141f;color:#cfe3ff;border:1px solid rgba(255,255,255,.15);border-radius:5px;padding:3px"><option value="all">All</option><option value="favorites">Favorites</option><option value="bans">Bans</option></select></label>`
          + `<button id="${PANEL_IDS.hold}" style="${PANEL_BUTTON_CSS}">⏸ Hold</button>`
        + '</div>'
        + `<div style="margin:5px 0 4px;font-size:11px;opacity:.75"><span id="${PANEL_IDS.presetCount}">★ 0   🚫 0</span></div>`
        + `<div id="${PANEL_IDS.meter}" style="opacity:.65;margin-top:6px;font:11px/1.3 monospace">gtr —  ·  song —</div>`
        + '<div style="opacity:.45;margin-top:4px;font-size:11px">Use ‹‹ to hide</div>';
  (host || document.body).appendChild(p);

  const tab = document.createElement('button');
  tab.textContent = '>>';
  tab.title = 'Hide / show controls';
  tab.style.cssText = 'position:absolute;top:6px;left:-23px;width:23px;height:28px;border:none;cursor:pointer;'
        + 'background:rgba(8,10,20,0.82);color:#cfe3ff;border-radius:7px 0 0 7px;font:12px/1 monospace;padding:0;';
  p.appendChild(tab);
  tab.addEventListener('click', () => {
    panelCollapsed = !panelCollapsed;
    if (panelCollapsed) presetPaneOpen = false;
    tab.textContent = panelCollapsed ? '<<' : '>>';
    const lb = p.querySelector(panelSelector('listButton')); if (lb) lb.textContent = presetPaneOpen ? '>>' : '<<';
    layoutPanels();
  });

  const pane = document.createElement('div');
  pane.id = `${DOM_ID_PREFIX}butterchurn-listpane`;
  pane.style.cssText = 'position:absolute;top:50%;right:10px;z-index:99999;pointer-events:auto;width:236px;max-height:74vh;display:flex;flex-direction:column;'
        + 'background:rgba(8,10,20,0.93);border-radius:8px;box-shadow:0 2px 14px rgba(0,0,0,0.55);color:#cfe3ff;'
        + 'font:12px system-ui,sans-serif;overflow:hidden;transform:translateX(calc(100% + 16px)) translateY(-50%);transition:transform 0.28s ease;';
  pane.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 9px 7px 10px;font-weight:600;border-bottom:1px solid rgba(255,255,255,.1)"><span>Presets</span><button id="${PANEL_IDS.defaults}" title="Restore the bundled default favorites + bans" style="${PANEL_BUTTON_CSS};font-weight:400">↺ defaults</button></div>`
        + `<input id="${PANEL_IDS.filter}" placeholder="filter…" spellcheck="false" style="margin:8px 9px 6px;padding:4px 7px;background:#11141f;color:#cfe3ff;border:1px solid rgba(255,255,255,.15);border-radius:5px;outline:none">`
        + `<div id="${PANEL_IDS.list}" style="overflow-y:auto;padding:0 4px 8px"></div>`;
  (host || document.body).appendChild(pane);
  presetPaneEl = pane;
  presetListEl = pane.querySelector(panelSelector('list'));
  presetFilterEl = pane.querySelector(panelSelector('filter'));
  presetFilterEl.addEventListener('input', renderPresetList);
  pane.querySelector(panelSelector('defaults')).addEventListener('click', restoreDefaultPresetLists);

  const q = (id) => p.querySelector(id);
  presetPanelEl = p;

  loadPresetLists();
  const cyc = q(panelSelector('cycle'));
  cyc.value = s.cyclePool || 'all';
  // Read fresh: settings.html writes can replace butterchurnSettings after `s` was captured.
  cyc.addEventListener('change', () => { loadButterchurnSettings().cyclePool = cyc.value; saveButterchurnSettings(); });
  setPresetHold(!!s.hold);
  q(panelSelector('hold')).addEventListener('click', () => setPresetHold(!loadButterchurnSettings().hold));
  q(panelSelector('listButton')).addEventListener('click', () => setPresetPaneOpen(!presetPaneOpen));
  q(panelSelector('presetName')).addEventListener('click', () => setPresetPaneOpen(!presetPaneOpen));
  q(panelSelector('previous')).addEventListener('click', () => { if (primaryController) primaryController.step(-1); });
  q(panelSelector('next')).addEventListener('click', () => { if (primaryController) primaryController.step(1); });
  q(panelSelector('favorite')).addEventListener('click', () => { if (primaryController) primaryController.toggleFav(); });
  q(panelSelector('ban')).addEventListener('click', () => { if (primaryController) primaryController.banCur(); });
  setPresetPaneOpen(false);
  updatePanelPreset();

  // Self-stops when the panel is removed (presetPanelEl !== p).
  (function meterLoop() {
    if (presetPanelEl !== p) return;
    const m = p.querySelector(panelSelector('meter'));
    if (m) m.textContent = `gtr ${audioMeters.gtr.toFixed(2)}  ·  song ${audioMeters.song.toFixed(2)}`;
    setTimeout(meterLoop, 150);
  }());

  return presetPanelEl;
}

/** Merges the bundled defaults back in: a default-favorite un-bans, a default-ban un-favorites. */
function restoreDefaultPresetLists() {
  DEFAULT_FAVORITE_PRESETS.forEach((n) => { bannedPresets.delete(n); favoritePresets.add(n); });
  DEFAULT_BANNED_PRESETS.forEach((n) => { favoritePresets.delete(n); bannedPresets.add(n); });
  try { localStorage.setItem('highway_3d_dev.butterchurn.seeded', '1'); } catch (e) {}
  savePresetLists(); updatePanelPreset(); renderPresetList();
}

/** Setter for `primaryController` — `createButterchurnController` (controller.js) is an outside module and can only write via this. */
export function setPrimaryController(ctrl) { primaryController = ctrl; }
export function teardownPresetPanel() {
  if (presetPanelEl && presetPanelEl.parentNode) presetPanelEl.parentNode.removeChild(presetPanelEl);
  if (presetPaneEl && presetPaneEl.parentNode) presetPaneEl.parentNode.removeChild(presetPaneEl);
  presetPanelEl = null; presetPaneEl = null; presetListEl = null; presetFilterEl = null; presetPaneOpen = false;
}
