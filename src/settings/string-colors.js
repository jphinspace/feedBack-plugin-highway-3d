import {
  globalSettingStorageKey, settingsMemFallback, writeGlobalSetting,
} from './store.js';
import { storageKey } from '../plugin-identity.js';

export const STRING_COLOR_STORAGE_KEYS = Object.freeze({
  active: storageKey('stringColors.active'),
  themes: storageKey('stringColors.themes'),
  activeName: storageKey('stringColors.activeName'),
});

export const STRING_COLOR_SLOTS = Object.freeze([
  { key: 'highE', label: 'High E', sub: '1st' },
  { key: 'B', label: 'B', sub: '2nd' },
  { key: 'G', label: 'G', sub: '3rd' },
  { key: 'D', label: 'D', sub: '4th' },
  { key: 'A', label: 'A', sub: '5th' },
  { key: 'lowE', label: 'Low E', sub: '6th / lowest' },
  { key: 'low7', label: 'Low B', sub: '7-string' },
  { key: 'low8', label: 'Low F#', sub: '8-string' },
]);

const SLOT_KEYS = STRING_COLOR_SLOTS.map(({ key }) => key);
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const SHARE_PREFIX = 'H3DDEV1.';
const DOM_PREFIX = 'highway_3d_dev-hwc-';
export const NAMED_STRING_COLOR_FORMAT = 'highway_3d_dev.named-string-colors.v1';

export const DEFAULT_STRING_COLORS = Object.freeze({
  lowE: '#e61f26',
  A: '#ecd234',
  D: '#1096e6',
  G: '#f18313',
  B: '#3fc413',
  highE: '#b518d9',
  low7: '#ff6bd5',
  low8: '#6bffe6',
});

export const STRING_COLOR_PRESETS = Object.freeze([
  {
    id: 'warmcool',
    label: 'Warm → Cool',
    colors: {
      lowE: '#ff3b30', A: '#ff7a18', D: '#ffc400', G: '#36c46a', B: '#2196f3', highE: '#9b5cff', low7: '#ff2d78', low8: '#00c2c7',
    },
  },
  {
    id: 'vivid',
    label: 'Vivid',
    colors: {
      lowE: '#ff2222', A: '#ffd000', D: '#1e8bff', G: '#ff7a00', B: '#16d65a', highE: '#b24bff', low7: '#ff3cc0', low8: '#15d8d8',
    },
  },
  {
    id: 'colorblind',
    label: 'Colorblind-friendly',
    colors: {
      lowE: '#d55e00', A: '#e69f00', D: '#f0e442', G: '#009e73', B: '#56b4e9', highE: '#cc79a7', low7: '#0072b2', low8: '#999999',
    },
  },
  {
    id: 'colorblind_deuteranope',
    label: 'Colorblind (deuteranope)',
    colors: {
      lowE: '#aa1414', A: '#88de00', D: '#1889e3', G: '#c6601c', B: '#00f5b2', highE: '#4d2173', low7: '#0072b2', low8: '#999999',
    },
  },
  {
    id: 'neon',
    label: 'Neon',
    colors: {
      lowE: '#ff1f4e', A: '#ff9d00', D: '#e9ff00', G: '#1844ff', B: '#00ff84', highE: '#d000ff', low7: '#ff00aa', low8: '#00f0ff',
    },
  },
  {
    id: 'accessible',
    label: 'Accessible (ordered)',
    colors: {
      lowE: '#2453c0', A: '#c44a00', D: '#3f93cf', G: '#ec9a1e', B: '#f2d43c', highE: '#f5eecb', low7: '#173f96', low8: '#0f2c6b',
    },
  },
  {
    id: 'ember',
    label: 'Warm Ember',
    colors: {
      lowE: '#c0392b', A: '#e0552a', D: '#ef7d2e', G: '#f6a13a', B: '#f4c95d', highE: '#f7e3a8', low7: '#9e2f23', low8: '#7d2418',
    },
  },
  {
    id: 'tapedeck',
    label: 'Tape Deck',
    colors: {
      lowE: '#b04632', A: '#d8ad42', D: '#5f7a34', G: '#54b3a6', B: '#5e83ad', highE: '#b98abb', low7: '#8f3526', low8: '#6f2a1e',
    },
  },
  {
    id: 'crtgreen',
    label: 'CRT Green',
    colors: {
      lowE: '#0a5a23', A: '#108a30', D: '#1fb53f', G: '#3ad94f', B: '#74f06a', highE: '#c7ffb0', low7: '#08491c', low8: '#063514',
    },
  },
  {
    id: 'crtamber',
    label: 'CRT Amber',
    colors: {
      lowE: '#7a3a02', A: '#a85f06', D: '#cf8410', G: '#e8a82a', B: '#f4cf5e', highE: '#ffeeb8', low7: '#5f2d01', low8: '#471f00',
    },
  },
  {
    id: 'pitchramp',
    label: 'Pitch Ramp',
    colors: {
      lowE: '#7a2390', A: '#2f5ad8', D: '#1f9bc4', G: '#2fb84a', B: '#cfd22a', highE: '#f3e0c0', low7: '#5e1a78', low8: '#440f5e',
    },
  },
  {
    id: 'sunrise',
    label: 'Sunrise',
    colors: {
      lowE: '#8a3a6e', A: '#bf4a5e', D: '#e0664f', G: '#f29a55', B: '#f7c873', highE: '#fce8b8', low7: '#6e2c5c', low8: '#54214a',
    },
  },
]);

export function normalizeStringColors(value) {
  const out = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const key of SLOT_KEYS) {
    const color = typeof value[key] === 'string' ? value[key].trim().toLowerCase() : '';
    if (HEX_RE.test(color)) out[key] = color;
  }
  return out;
}

export function stringKeysForChart(stringCount, isBass) {
  const count = Math.max(1, Math.min(8, Number(stringCount) || 6));
  if (isBass) {
    if (count <= 4) return ['lowE', 'A', 'D', 'G'].slice(0, count);
    if (count === 5) return ['low7', 'lowE', 'A', 'D', 'G'];
    return ['low8', 'low7', 'lowE', 'A', 'D', 'G'].slice(0, count);
  }
  if (count <= 6) return ['lowE', 'A', 'D', 'G', 'B', 'highE'].slice(0, count);
  if (count === 7) return ['low7', 'lowE', 'A', 'D', 'G', 'B', 'highE'];
  return ['low8', 'low7', 'lowE', 'A', 'D', 'G', 'B', 'highE'];
}

// localStorage can become unavailable after this module has loaded (notably in
// sandboxed/private frames). Keep the last requested named palette authoritative
// for the lifetime of the page, matching settings/store.js's fallback behavior.
let stringColorOverridesFallback = null;

function compactStringColorOverrides(slotMap) {
  const colors = normalizeStringColors(slotMap);
  const overrides = {};
  for (const key of SLOT_KEYS) {
    if (colors[key] && colors[key] !== DEFAULT_STRING_COLORS[key]) overrides[key] = colors[key];
  }
  return overrides;
}

function persistStringColorOverrides(overrides) {
  stringColorOverridesFallback = { ...overrides };
  try {
    if (Object.keys(overrides).length) {
      localStorage.setItem(STRING_COLOR_STORAGE_KEYS.active, JSON.stringify(overrides));
    } else {
      localStorage.removeItem(STRING_COLOR_STORAGE_KEYS.active);
    }
  } catch (_) { /* in-memory fallback remains authoritative */ }
}

function rawGlobalSetting(key) {
  if (Object.prototype.hasOwnProperty.call(settingsMemFallback, key)) {
    return settingsMemFallback[key];
  }
  try { return localStorage.getItem(globalSettingStorageKey(key)); } catch (_) { return null; }
}

export function getStringColorOverrides() {
  if (stringColorOverridesFallback !== null) return { ...stringColorOverridesFallback };
  try {
    const raw = localStorage.getItem(STRING_COLOR_STORAGE_KEYS.active);
    return raw ? normalizeStringColors(JSON.parse(raw)) : {};
  } catch (_) { return {}; }
}

export function getResolvedStringColors() {
  return { ...DEFAULT_STRING_COLORS, ...getStringColorOverrides() };
}

export function effectiveStringColors(slotMap, stringCount, isBass) {
  const normalized = normalizeStringColors(slotMap);
  const resolved = { ...DEFAULT_STRING_COLORS, ...normalized };
  return stringKeysForChart(stringCount, isBass).map((key) => resolved[key]);
}

function emitChange() {
  try {
    window.feedBack?.emit?.('highway_3d_dev:stringColors', getResolvedStringColors());
  } catch (_) {}
}

export function reapplyDevStringColors() {
  const overrides = getStringColorOverrides();
  // Preserve named slots in the shared setting. Each renderer resolves this
  // descriptor against its own arrangement/string count, so mixed 6/7-string
  // split-screen panels do not have to share one incompatible index ordering.
  writeGlobalSetting('customColors', JSON.stringify({
    format: NAMED_STRING_COLOR_FORMAT,
    colors: overrides,
  }));
  writeGlobalSetting('palette', 'custom');
  emitChange();
}

export function applyDevStringColors(slotMap) {
  const overrides = compactStringColorOverrides(slotMap);
  persistStringColorOverrides(overrides);
  reapplyDevStringColors();
}

function readThemes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STRING_COLOR_STORAGE_KEYS.themes) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return Object.create(null);
    const out = Object.create(null);
    for (const [name, colors] of Object.entries(parsed)) out[name] = normalizeStringColors(colors);
    return out;
  } catch (_) { return Object.create(null); }
}

function writeThemes(themes) {
  try { localStorage.setItem(STRING_COLOR_STORAGE_KEYS.themes, JSON.stringify(themes)); } catch (_) {}
}

function activeThemeName() {
  try { return localStorage.getItem(STRING_COLOR_STORAGE_KEYS.activeName) || ''; } catch (_) { return ''; }
}

function setActiveThemeName(name) {
  try {
    if (name) localStorage.setItem(STRING_COLOR_STORAGE_KEYS.activeName, name);
    else localStorage.removeItem(STRING_COLOR_STORAGE_KEYS.activeName);
  } catch (_) {}
}

export function encodeDevStringColorShare(name, colors) {
  const payload = JSON.stringify({
    name: String(name || '').slice(0, 60),
    colors: normalizeStringColors(colors),
  });
  const base64 = btoa(unescape(encodeURIComponent(payload)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${SHARE_PREFIX}${base64}`;
}

export function decodeDevStringColorShare(code) {
  if (typeof code !== 'string' || !code.startsWith(SHARE_PREFIX)) return null;
  let base64 = code.slice(SHARE_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  try {
    const parsed = JSON.parse(decodeURIComponent(escape(atob(base64))));
    if (!parsed || typeof parsed.colors !== 'object' || Array.isArray(parsed.colors)) return null;
    return {
      name: String(parsed.name || '').slice(0, 60),
      colors: normalizeStringColors(parsed.colors),
    };
  } catch (_) { return null; }
}

let statusTimer = 0;
function setStatus(message) {
  const element = document.getElementById(`${DOM_PREFIX}status`);
  if (!element) return;
  element.textContent = message || '';
  if (!message) return;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    if (element.textContent === message) element.textContent = '';
  }, 2500);
}

function readPickers() {
  const out = {};
  for (const { key } of STRING_COLOR_SLOTS) {
    const input = document.getElementById(`${DOM_PREFIX}color-${key}`);
    if (input) out[key] = input.value;
  }
  return out;
}

function indexedCustomPaletteActive() {
  if (rawGlobalSetting('palette') !== 'custom') return false;
  try { return Array.isArray(JSON.parse(rawGlobalSetting('customColors'))); } catch (_) { return false; }
}

function syncNamedEditorMode(indexedPalette) {
  for (const id of ['save', 'copy']) {
    const button = document.getElementById(`${DOM_PREFIX}${id}`);
    if (!button) continue;
    button.disabled = indexedPalette;
    button.title = indexedPalette ? 'Switch to a named palette first.' : '';
  }
}

function renderPickers() {
  const host = document.getElementById(`${DOM_PREFIX}pickers`);
  if (!host) return;
  const colors = getResolvedStringColors();
  const indexedPalette = indexedCustomPaletteActive();
  host.replaceChildren();
  if (indexedPalette) {
    const notice = document.createElement('p');
    notice.className = 'text-xs text-amber-400';
    notice.style.gridColumn = '1 / -1';
    notice.textContent = 'An indexed custom palette is active. Choose a named preset, theme, import, or Reset before editing individual named strings.';
    host.appendChild(notice);
  }
  for (const slot of STRING_COLOR_SLOTS) {
    const label = document.createElement('label');
    label.className = 'flex items-center gap-2 text-xs text-gray-400';
    const input = document.createElement('input');
    input.type = 'color';
    input.id = `${DOM_PREFIX}color-${slot.key}`;
    input.dataset.slot = slot.key;
    input.value = colors[slot.key];
    input.disabled = indexedPalette;
    if (indexedPalette) input.title = 'Indexed palettes cannot be converted to named strings without changing extended-range ordering.';
    input.style.cssText = 'width:2.5rem;height:1.75rem;padding:2px;cursor:pointer;';
    input.className = 'rounded border border-gray-800 bg-dark-700';
    // Applying a palette rebuilds palette-baked fretboard/background geometry
    // in every mounted pane. Commit once when the native picker closes instead
    // of rebuilding continuously while its cursor is dragged.
    input.addEventListener('change', () => applyDevStringColors(readPickers()));
    label.appendChild(input);
    const name = document.createElement('span');
    name.textContent = slot.label;
    label.appendChild(name);
    const sub = document.createElement('span');
    sub.className = 'text-gray-600';
    sub.textContent = slot.sub;
    label.appendChild(sub);
    host.appendChild(label);
  }
  syncNamedEditorMode(indexedPalette);
}

function renderThemeSelect() {
  const select = document.getElementById(`${DOM_PREFIX}theme-select`);
  if (!select) return;
  const names = Object.keys(readThemes()).sort((a, b) => a.localeCompare(b));
  select.replaceChildren();
  const defaults = document.createElement('option');
  defaults.value = '';
  defaults.textContent = 'Default colors';
  select.appendChild(defaults);
  for (const name of names) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  }
  const active = activeThemeName();
  select.value = names.includes(active) ? active : '';
}

function renderPresets() {
  const host = document.getElementById(`${DOM_PREFIX}presets`);
  if (!host || host.dataset.wired === 'true') return;
  host.dataset.wired = 'true';
  for (const preset of STRING_COLOR_PRESETS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'flex items-center gap-2 bg-dark-700 border border-gray-800 rounded-lg px-2 py-1 text-xs text-gray-300';
    const swatch = document.createElement('span');
    const order = ['lowE', 'A', 'D', 'G', 'B', 'highE'];
    swatch.style.cssText = 'width:2.5rem;height:.85rem;border-radius:3px;border:1px solid #0006;'
      + `background:linear-gradient(90deg,${order.map((key) => preset.colors[key]).join(',')});`;
    button.appendChild(swatch);
    const text = document.createElement('span');
    text.textContent = preset.label;
    button.appendChild(text);
    button.addEventListener('click', () => {
      setActiveThemeName('');
      applyDevStringColors(preset.colors);
      renderThemeSelect();
      renderPickers();
    });
    host.appendChild(button);
  }
}

function selectTheme(name) {
  if (!name) {
    setActiveThemeName('');
    applyDevStringColors(null);
  } else {
    const themes = readThemes();
    if (!Object.prototype.hasOwnProperty.call(themes, name)) return;
    setActiveThemeName(name);
    applyDevStringColors(themes[name]);
  }
  renderPickers();
}

function saveTheme() {
  // Native prompt keeps this plugin self-contained; FeedBack's custom prompt is not public API.
  // eslint-disable-next-line no-alert
  const name = window.prompt('Save 3D Highway (dev) color theme as:', activeThemeName() || 'My Colors');
  if (!name || !name.trim()) return;
  const normalizedName = name.trim().slice(0, 60);
  const themes = readThemes();
  themes[normalizedName] = normalizeStringColors(readPickers());
  writeThemes(themes);
  setActiveThemeName(normalizedName);
  renderThemeSelect();
  setStatus(`Saved “${normalizedName}”`);
}

function deleteTheme() {
  const name = activeThemeName();
  if (!name) { setStatus('No saved theme selected'); return; }
  const themes = readThemes();
  delete themes[name];
  writeThemes(themes);
  setActiveThemeName('');
  applyDevStringColors(null);
  renderThemeSelect();
  renderPickers();
  setStatus(`Deleted “${name}”`);
}

async function copyShare() {
  const code = encodeDevStringColorShare(activeThemeName() || '3D Highway dev Colors', readPickers());
  let copied = false;
  try { await navigator.clipboard.writeText(code); copied = true; } catch (_) {}
  if (!copied) {
    const input = document.getElementById(`${DOM_PREFIX}import-code`);
    if (input) { input.value = code; input.select(); }
  }
  setStatus(copied ? 'Share code copied' : 'Copy failed — code shown below');
}

function importShare() {
  const input = document.getElementById(`${DOM_PREFIX}import-code`);
  const parsed = decodeDevStringColorShare(input?.value || '');
  if (!parsed) { setStatus('Invalid dev share code'); return; }
  const themes = readThemes();
  let name = parsed.name || 'Imported';
  if (Object.prototype.hasOwnProperty.call(themes, name)) {
    let suffix = 2;
    while (Object.prototype.hasOwnProperty.call(themes, `${name} ${suffix}`)) suffix += 1;
    name = `${name} ${suffix}`;
  }
  themes[name] = parsed.colors;
  writeThemes(themes);
  setActiveThemeName(name);
  applyDevStringColors(parsed.colors);
  if (input) input.value = '';
  renderThemeSelect();
  renderPickers();
  setStatus(`Imported “${name}”`);
}

function wireButton(id, handler) {
  const element = document.getElementById(`${DOM_PREFIX}${id}`);
  if (!element || element.dataset.wired === 'true') return;
  element.dataset.wired = 'true';
  element.addEventListener('click', handler);
}

export function initDevStringColorSettingsUI() {
  if (typeof document === 'undefined') return;
  const select = document.getElementById(`${DOM_PREFIX}theme-select`);
  if (!select) return;
  if (select.dataset.wired !== 'true') {
    select.dataset.wired = 'true';
    select.addEventListener('change', () => selectTheme(select.value));
  }
  wireButton('save', saveTheme);
  wireButton('delete', deleteTheme);
  wireButton('reset', () => {
    setActiveThemeName('');
    applyDevStringColors(null);
    renderThemeSelect();
    renderPickers();
    setStatus('Reset to defaults');
  });
  wireButton('copy', copyShare);
  wireButton('import', importShare);
  renderThemeSelect();
  renderPresets();
  renderPickers();
}

export function initDevStringColors() {
  const palette = rawGlobalSetting('palette');
  // A public plugin setter may have selected a regular palette before this
  // module is initialised. Named-color startup must not silently replace it.
  if (palette === null || palette === 'custom') {
    const customRaw = rawGlobalSetting('customColors');
    let customValue = null;
    try { customValue = customRaw == null ? null : JSON.parse(customRaw); } catch (_) {}

    if (palette === 'custom' && Array.isArray(customValue)) {
      // h3dDevBgSetStringColors arrays are chart-indexed. There is no single
      // lossless conversion to named slots for guitar, extended-range guitar,
      // and bass, so leave the active public-setter value byte-for-byte intact.
      initDevStringColorSettingsUI();
      return;
    }
    if (palette === 'custom'
               && customValue?.format === NAMED_STRING_COLOR_FORMAT
               && stringColorOverridesFallback === null) {
      let hasStoredNamedColors = false;
      try { hasStoredNamedColors = localStorage.getItem(STRING_COLOR_STORAGE_KEYS.active) != null; } catch (_) {}
      if (!hasStoredNamedColors) {
        persistStringColorOverrides(compactStringColorOverrides(customValue.colors));
      }
    }
    reapplyDevStringColors();
  }
  initDevStringColorSettingsUI();
}

export function installDevStringColorFacade() {
  if (!window.feedBack) window.feedBack = {};
  window.feedBack.highway3dDevColors = {
    version: 1,
    slots: STRING_COLOR_SLOTS.map((slot) => ({ ...slot })),
    presets: STRING_COLOR_PRESETS.map((preset) => ({
      ...preset,
      colors: { ...preset.colors },
    })),
    get: getStringColorOverrides,
    getResolved: getResolvedStringColors,
    apply: applyDevStringColors,
    reapply: reapplyDevStringColors,
    encodeShare: encodeDevStringColorShare,
    decodeShare: decodeDevStringColorShare,
  };
  window.h3dDevInitStringColorSettingsUI = initDevStringColorSettingsUI;
}
