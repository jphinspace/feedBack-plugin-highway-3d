import { _bcMeters } from './engine.js';
import {
    BC_DEFAULT_BANS, BC_DEFAULT_FAVORITES, _bcBanned, _bcFavorites, _bcLoadLists, _bcLoadSettings,
    _bcSaveLists, _bcSaveSettings,
} from './prefs.js';

// Visual language: these controls sit in the player's Plugin Controls
// popover alongside pills from other plugins, so the pill/button chrome
// (BC_BTN) is shared across every ── button in the in-canvas panel below.
const BC_BTN = 'background:rgba(255,255,255,.09);color:#cfe3ff;border:1px solid rgba(255,255,255,.16);border-radius:5px;padding:3px 8px;cursor:pointer;font:12px system-ui';

export let _bcPrimary = null;
let _bcPane = null, _bcListEl = null, _bcFilterEl = null, _bcPaneOpen = false, _bcCollapsed = false;

function _bcStatusMark(name) {
    return _bcFavorites.has(name) ? '★ ' : (_bcBanned.has(name) ? '🚫 ' : '');
}
function _bcSetHold(v) {
    const s = _bcLoadSettings();
    s.hold = !!v; _bcSaveSettings();
    const b = _bcPanel && _bcPanel.querySelector('#vz-hold');
    if (b) b.textContent = s.hold ? '▶ Resume' : '⏸ Hold';
}
// Drives both panels off the right edge. Order when both open (L→R):
//   visualizer panel → preset pane → window edge. Pane lives off-screen by
//   default; opening it shoves the panel LEFT to make room.
function _bcLayout() {
    if (_bcPanel) {
        let tx = 0;
        if (_bcCollapsed) tx = 210;        // tuck the whole panel off the right edge
        else if (_bcPaneOpen) tx = -248;   // slide panel LEFT to make room for the pane
        _bcPanel.style.transform = 'translateX(' + tx + 'px) translateY(-50%)';
    }
    if (_bcPane) {
        _bcPane.style.transform = (_bcPaneOpen && !_bcCollapsed) ? 'translateX(0) translateY(-50%)' : 'translateX(calc(100% + 16px)) translateY(-50%)';
    }
}
function _bcSetPane(open) {
    _bcPaneOpen = !!open && !_bcCollapsed;
    const b = _bcPanel && _bcPanel.querySelector('#vz-listbtn');
    if (b) b.textContent = _bcPaneOpen ? '>>' : '<<';
    if (_bcPaneOpen) _bcRenderList();
    _bcLayout();
}
function _bcRenderList() {
    if (!_bcListEl) return;
    const ctrl = _bcPrimary;
    const keys = (ctrl && ctrl.keys) ? ctrl.keys : [];
    const filt = ((_bcFilterEl && _bcFilterEl.value) || '').toLowerCase();
    const cur = ctrl && ctrl.curName;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < keys.length; i++) {
        const name = keys[i];
        if (filt && name.toLowerCase().indexOf(filt) === -1) continue;
        const row = document.createElement('div');
        row.textContent = _bcStatusMark(name) + name;
        row.title = name;
        row.style.cssText = 'padding:3px 7px;border-radius:4px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px;' +
            (name === cur ? 'background:rgba(110,160,255,.28);' : '') + (_bcBanned.has(name) ? 'opacity:.55;' : '');
        row.addEventListener('click', () => {
            if (!_bcPrimary) return;
            _bcPrimary.loadByName(name, 1.0);
            _bcSetHold(true); // picked from the list → sit on it
        });
        frag.appendChild(row);
    }
    _bcListEl.innerHTML = '';
    _bcListEl.appendChild(frag);
}
export function _bcUpdatePanelPreset() {
    if (!_bcPanel) return;
    const name = _bcPrimary ? (_bcPrimary.curName || null) : null;
    const nameEl = _bcPanel.querySelector('#vz-pname');
    const favBtn = _bcPanel.querySelector('#vz-fav');
    const banBtn = _bcPanel.querySelector('#vz-ban');
    const cntEl = _bcPanel.querySelector('#vz-pcount');
    if (nameEl) { nameEl.textContent = (name ? _bcStatusMark(name) : '') + (name || '—'); nameEl.title = name ? (name + ' — click for full list') : ''; }
    if (favBtn) favBtn.textContent = (name && _bcFavorites.has(name)) ? '★ Favorited' : '☆ Favorite';
    if (banBtn) banBtn.textContent = (name && _bcBanned.has(name)) ? '🚫 Banned' : '🚫 Ban';
    if (cntEl) cntEl.textContent = '★ ' + _bcFavorites.size + '   🚫 ' + _bcBanned.size;
    if (_bcPaneOpen) _bcRenderList();
}

let _bcPanel = null, _bcPanelKeyBound = false;
export function _bcEnsurePanel(host) {
    if (_bcPanel && _bcPanel.isConnected) {
        // Singleton panel: follow the active highway. If it's still parented
        // to a different wrap (e.g. another mounted highway instance such as
        // Virtuoso's embedded one), move it — and the pane — to this wrap so
        // it appears on whichever highway is currently on-screen.
        if (host && _bcPanel.parentNode !== host) {
            host.appendChild(_bcPanel);
            if (_bcPane) host.appendChild(_bcPane);
        }
        return _bcPanel;
    }
    const s = _bcLoadSettings();
    const p = document.createElement('div');
    p.id = 'viz3d-panel';
    p.style.cssText = 'position:absolute;top:50%;right:10px;z-index:100000;pointer-events:auto;font:12px/1.45 system-ui,sans-serif;' +
        'color:#cfe3ff;background:rgba(8,10,20,0.82);padding:9px 11px;border-radius:8px;width:186px;' +
        'box-shadow:0 2px 12px rgba(0,0,0,0.5);user-select:none;transition:transform 0.28s ease;';
    p.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px"><span style="font-weight:600">🌀 Visualizer</span><button id="vz-listbtn" title="Show / hide full preset list" style="' + BC_BTN + ';padding:1px 7px">&lt;&lt;</button></div>' +
        // On/off + opacity/dim/chart/tint/gain controls now live in the
        // plugin's Settings panel (settings.html). This in-canvas panel is
        // only the LIVE preset browser (pick / favorite / ban / cycle).
        '<div style="opacity:.55;font-size:11px;margin:2px 0 6px">Background &amp; reactivity options are in Settings ▸ 3D Highway.</div>' +
        '<div style="display:flex;align-items:center;gap:6px;margin:4px 0">' +
          '<button id="vz-prev" style="' + BC_BTN + '">◀</button>' +
          '<div id="vz-pname" style="flex:1;text-align:center;font-size:11px;opacity:.9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer" title="">—</div>' +
          '<button id="vz-next" style="' + BC_BTN + '">▶</button>' +
        '</div>' +
        '<div style="display:flex;gap:6px;margin:4px 0">' +
          '<button id="vz-fav" style="' + BC_BTN + ';flex:1">♡ Favorite</button>' +
          '<button id="vz-ban" style="' + BC_BTN + ';flex:1">🚫 Ban</button>' +
        '</div>' +
        '<div style="display:flex;gap:6px;align-items:flex-end;margin:6px 0">' +
          '<label style="flex:1">Cycle <select id="vz-cyc" style="width:100%;background:#11141f;color:#cfe3ff;border:1px solid rgba(255,255,255,.15);border-radius:5px;padding:3px"><option value="all">All</option><option value="favorites">Favorites</option><option value="bans">Bans</option></select></label>' +
          '<button id="vz-hold" style="' + BC_BTN + '">⏸ Hold</button>' +
        '</div>' +
        '<div style="margin:5px 0 4px;font-size:11px;opacity:.75"><span id="vz-pcount">★ 0   🚫 0</span></div>' +
        '<div id="vz-meter" style="opacity:.65;margin-top:6px;font:11px/1.3 monospace">gtr —  ·  song —</div>' +
        '<div style="opacity:.45;margin-top:4px;font-size:11px">` or ‹‹ to hide</div>';
    (host || document.body).appendChild(p);

    // Slide handle (<< / >>) so the panel can tuck off the right edge and stop
    // covering the Now / Up-Next labels.
    const tab = document.createElement('button');
    tab.textContent = '>>';
    tab.title = 'Hide / show controls';
    tab.style.cssText = 'position:absolute;top:6px;left:-23px;width:23px;height:28px;border:none;cursor:pointer;' +
        'background:rgba(8,10,20,0.82);color:#cfe3ff;border-radius:7px 0 0 7px;font:12px/1 monospace;padding:0;';
    p.appendChild(tab);
    tab.addEventListener('click', () => {
        _bcCollapsed = !_bcCollapsed;
        if (_bcCollapsed) _bcPaneOpen = false; // collapsing the panel hides the pane too
        tab.textContent = _bcCollapsed ? '<<' : '>>';
        const lb = p.querySelector('#vz-listbtn'); if (lb) lb.textContent = _bcPaneOpen ? '>>' : '<<';
        _bcLayout();
    });

    // Sliding preset-list pane (sits to the LEFT of the control panel)
    const pane = document.createElement('div');
    pane.id = 'viz3d-listpane';
    pane.style.cssText = 'position:absolute;top:50%;right:10px;z-index:99999;pointer-events:auto;width:236px;max-height:74vh;display:flex;flex-direction:column;' +
        'background:rgba(8,10,20,0.93);border-radius:8px;box-shadow:0 2px 14px rgba(0,0,0,0.55);color:#cfe3ff;' +
        'font:12px system-ui,sans-serif;overflow:hidden;transform:translateX(calc(100% + 16px)) translateY(-50%);transition:transform 0.28s ease;';
    pane.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 9px 7px 10px;font-weight:600;border-bottom:1px solid rgba(255,255,255,.1)"><span>Presets</span><button id="vz-defaults" title="Restore the bundled default favorites + bans" style="' + BC_BTN + ';font-weight:400">↺ defaults</button></div>' +
        '<input id="vz-filter" placeholder="filter…" spellcheck="false" style="margin:8px 9px 6px;padding:4px 7px;background:#11141f;color:#cfe3ff;border:1px solid rgba(255,255,255,.15);border-radius:5px;outline:none">' +
        '<div id="vz-list" style="overflow-y:auto;padding:0 4px 8px"></div>';
    (host || document.body).appendChild(pane);
    _bcPane = pane;
    _bcListEl = pane.querySelector('#vz-list');
    _bcFilterEl = pane.querySelector('#vz-filter');
    _bcFilterEl.addEventListener('input', _bcRenderList);
    pane.querySelector('#vz-defaults').addEventListener('click', _bcRestoreDefaults);

    const q = (id) => p.querySelector(id);
    _bcPanel = p;

    // Preset curation wiring (favorites / bans / cycle / reset)
    _bcLoadLists();
    const cyc = q('#vz-cyc');
    cyc.value = s.cyclePool || 'all';
    // Read fresh: settings.html writes can replace _bcSettings, so the `s`
    // captured at panel creation may be stale by the time this fires.
    cyc.addEventListener('change', () => { _bcLoadSettings().cyclePool = cyc.value; _bcSaveSettings(); });
    _bcSetHold(!!s.hold); // sync the Hold button label to the saved state
    q('#vz-hold').addEventListener('click', () => _bcSetHold(!_bcLoadSettings().hold));
    q('#vz-listbtn').addEventListener('click', () => _bcSetPane(!_bcPaneOpen));
    q('#vz-pname').addEventListener('click', () => _bcSetPane(!_bcPaneOpen));
    q('#vz-prev').addEventListener('click', () => { if (_bcPrimary) _bcPrimary.step(-1); });
    q('#vz-next').addEventListener('click', () => { if (_bcPrimary) _bcPrimary.step(1); });
    q('#vz-fav').addEventListener('click', () => { if (_bcPrimary) _bcPrimary.toggleFav(); });
    q('#vz-ban').addEventListener('click', () => { if (_bcPrimary) _bcPrimary.banCur(); });
    _bcSetPane(false); // start collapsed; sets the list-button label
    _bcUpdatePanelPreset();

    // Live level readout — proves the song (not just guitar) is driving things.
    // Self-stops when the panel is removed (_bcPanel !== p).
    (function meterLoop() {
        if (_bcPanel !== p) return;
        const m = p.querySelector('#vz-meter');
        if (m) m.textContent = 'gtr ' + _bcMeters.gtr.toFixed(2) + '  ·  song ' + _bcMeters.song.toFixed(2);
        setTimeout(meterLoop, 150);
    })();

    if (!_bcPanelKeyBound) {
        _bcPanelKeyBound = true;
        window.addEventListener('keydown', (e) => {
            if (e.key !== '`' || e.metaKey || e.ctrlKey || !_bcPanel) return;
            const tag = (e.target && e.target.tagName) || '';
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            const reveal = _bcPanel.style.display === 'none';
            _bcPanel.style.display = reveal ? '' : 'none';
            if (_bcPane) _bcPane.style.display = reveal ? '' : 'none';
        });
    }
    return _bcPanel;
}

// Re-add the bundled defaults anytime (merges; a default-fav un-bans, a default-ban un-favs).
function _bcRestoreDefaults() {
    BC_DEFAULT_FAVORITES.forEach((n) => { _bcBanned.delete(n); _bcFavorites.add(n); });
    BC_DEFAULT_BANS.forEach((n) => { _bcFavorites.delete(n); _bcBanned.add(n); });
    try { localStorage.setItem('viz3d_seeded', '1'); } catch (e) {}
    _bcSaveLists(); _bcUpdatePanelPreset(); _bcRenderList();
}

// _bcCreateController (bc/controller.js) writes both of these from outside
// this module — _bcPrimary is a live binding read there directly, but the
// WRITE needs a real setter, and the full-teardown branch (last controller
// destroyed) used to reach in and null four DOM refs directly.
export function _bcSetPrimary(ctrl) { _bcPrimary = ctrl; }
export function _bcTeardownPanel() {
    if (_bcPanel && _bcPanel.parentNode) _bcPanel.parentNode.removeChild(_bcPanel);
    if (_bcPane && _bcPane.parentNode) _bcPane.parentNode.removeChild(_bcPane);
    _bcPanel = null; _bcPane = null; _bcListEl = null; _bcFilterEl = null; _bcPaneOpen = false;
}
