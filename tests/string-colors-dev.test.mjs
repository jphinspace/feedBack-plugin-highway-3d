import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.listeners = {};
    this.disabled = false;
    this.title = '';
    this.value = '';
    this.textContent = '';
  }

  addEventListener(type, handler) {
    (this.listeners[type] || (this.listeners[type] = [])).push(handler);
  }

  dispatch(type) {
    for (const handler of this.listeners[type] || []) handler({ type, target: this });
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = [];
    for (const child of children) this.appendChild(child);
  }

  select() { this.selected = true; }
}

function makeStringColorDocument() {
  const created = [];
  const fixed = new Map([
    ['highway_3d_dev-hwc-theme-select', new FakeElement('select')],
    ['highway_3d_dev-hwc-pickers', new FakeElement()],
    ['highway_3d_dev-hwc-save', new FakeElement('button')],
    ['highway_3d_dev-hwc-copy', new FakeElement('button')],
  ]);
  return {
    createElement(tagName) {
      const element = new FakeElement(tagName);
      created.push(element);
      return element;
    },
    getElementById(id) {
      if (fixed.has(id)) return fixed.get(id);
      for (let i = created.length - 1; i >= 0; i--) {
        if (created[i].id === id) return created[i];
      }
      return null;
    },
  };
}

test('named-color startup preserves explicit and indexed custom palettes byte-for-byte', async () => {
  const storage = new Map([
    ['highway_3d_dev.background.palette', 'neon'],
    ['highway_3d_dev.background.customColors', JSON.stringify(['#111111', null, null, null, null, null, '#222222'])],
  ]);
  const realWindow = globalThis.window;
  const realLocalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  globalThis.window = { feedBack: { emit() {} } };

  try {
    const colors = await import('../src/settings/string-colors.js');
    const { settingsMemFallback } = await import('../src/settings/store.js');
    const legacyColors = storage.get('highway_3d_dev.background.customColors');

    colors.initDevStringColors();
    assert.equal(storage.get('highway_3d_dev.background.palette'), 'neon');
    assert.equal(storage.get('highway_3d_dev.background.customColors'), legacyColors);

    storage.set('highway_3d_dev.background.palette', 'custom');
    colors.initDevStringColors();
    assert.equal(storage.get('highway_3d_dev.background.customColors'), legacyColors);
    assert.deepEqual(JSON.parse(legacyColors), [
      '#111111', null, null, null, null, null, '#222222',
    ]);

    delete settingsMemFallback.palette;
    delete settingsMemFallback.customColors;
  } finally {
    globalThis.window = realWindow;
    globalThis.localStorage = realLocalStorage;
  }
});

test('named picker UI locks indexed palettes without converting them', async () => {
  const storage = new Map([
    ['highway_3d_dev.background.palette', 'custom'],
    ['highway_3d_dev.background.customColors', JSON.stringify(['#111111', '#222222'])],
  ]);
  const realDocument = globalThis.document;
  const realLocalStorage = globalThis.localStorage;
  globalThis.document = makeStringColorDocument();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };

  try {
    const colors = await import('../src/settings/string-colors.js');
    const { settingsMemFallback } = await import('../src/settings/store.js');
    delete settingsMemFallback.palette;
    delete settingsMemFallback.customColors;
    colors.initDevStringColorSettingsUI();

    const picker = globalThis.document.getElementById('highway_3d_dev-hwc-color-lowE');
    const host = globalThis.document.getElementById('highway_3d_dev-hwc-pickers');
    assert.equal(picker.disabled, true);
    assert.match(picker.title, /Indexed palettes/);
    assert.equal(globalThis.document.getElementById('highway_3d_dev-hwc-save').disabled, true);
    assert.equal(globalThis.document.getElementById('highway_3d_dev-hwc-copy').disabled, true);
    assert.match(host.children[0].textContent, /indexed custom palette is active/i);
    assert.deepEqual(JSON.parse(storage.get('highway_3d_dev.background.customColors')), ['#111111', '#222222']);
  } finally {
    globalThis.document = realDocument;
    globalThis.localStorage = realLocalStorage;
  }
});

test('named color picker commits only when the native picker closes', async () => {
  const storage = new Map([
    ['highway_3d_dev.background.palette', 'neon'],
  ]);
  const emitted = [];
  const realDocument = globalThis.document;
  const realWindow = globalThis.window;
  const realLocalStorage = globalThis.localStorage;
  globalThis.document = makeStringColorDocument();
  globalThis.window = { feedBack: { emit: (...args) => emitted.push(args) } };
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };

  try {
    const colors = await import('../src/settings/string-colors.js');
    const { settingsMemFallback } = await import('../src/settings/store.js');
    delete settingsMemFallback.palette;
    delete settingsMemFallback.customColors;
    colors.initDevStringColorSettingsUI();
    const picker = globalThis.document.getElementById('highway_3d_dev-hwc-color-lowE');
    const before = emitted.length;

    picker.value = '#123456';
    picker.dispatch('input');
    assert.equal(emitted.length, before, 'drag input must not apply the palette');
    assert.equal(storage.has('highway_3d_dev.stringColors.active'), false);

    picker.dispatch('change');
    assert.equal(emitted.length, before + 1, 'change must apply exactly once');
    assert.deepEqual(JSON.parse(storage.get('highway_3d_dev.stringColors.active')), { lowE: '#123456' });
  } finally {
    const { settingsMemFallback } = await import('../src/settings/store.js');
    delete settingsMemFallback.palette;
    delete settingsMemFallback.customColors;
    globalThis.document = realDocument;
    globalThis.window = realWindow;
    globalThis.localStorage = realLocalStorage;
  }
});

test('dev string colors use independent storage and never call bundled setters', async () => {
  const storage = new Map();
  const bundledCalls = [];
  const realWindow = globalThis.window;
  const realLocalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  globalThis.window = {
    h3dBgSetStringColors: (...args) => bundledCalls.push(args),
    h3dBgSetPalette: (...args) => bundledCalls.push(args),
    highway: {
      getStringCount: () => 6,
      getSongInfo: () => ({ arrangement: 'Lead' }),
    },
    feedBack: { emit() {} },
  };

  try {
    const colors = await import('../src/settings/string-colors.js');
    const { settingsMemFallback } = await import('../src/settings/store.js');
    colors.applyDevStringColors({ lowE: '#123456', highE: '#abcdef' });

    assert.deepEqual(bundledCalls, []);
    assert.ok(storage.has('highway_3d_dev.stringColors.active'));
    assert.equal(storage.get('highway_3d_dev.background.palette'), 'custom');
    assert.ok(storage.has('highway_3d_dev.background.customColors'));
    assert.deepEqual(JSON.parse(storage.get('highway_3d_dev.background.customColors')), {
      format: colors.NAMED_STRING_COLOR_FORMAT,
      colors: { lowE: '#123456', highE: '#abcdef' },
    });
    for (const key of storage.keys()) assert.match(key, /^highway_3d_dev\./);

    delete settingsMemFallback.palette;
    delete settingsMemFallback.customColors;
  } finally {
    globalThis.window = realWindow;
    globalThis.localStorage = realLocalStorage;
  }
});

test('dev string colors preserve named strings across extended-range charts', async () => {
  const {
    DEFAULT_STRING_COLORS,
    effectiveStringColors,
    stringKeysForChart,
  } = await import('../src/settings/string-colors.js');
  const { PALETTES } = await import('../src/core/palette.js');

  assert.deepEqual(
    stringKeysForChart(7, false),
    ['low7', 'lowE', 'A', 'D', 'G', 'B', 'highE'],
  );
  assert.deepEqual(
    effectiveStringColors({ low7: '#112233', lowE: '#445566' }, 7, false).slice(0, 2),
    ['#112233', '#445566'],
  );
  const toHex = (value) => `#${value.toString(16).padStart(6, '0')}`;
  const defaultPaletteHex = PALETTES.default.map(toHex);
  assert.deepEqual(
    ['lowE', 'A', 'D', 'G', 'B', 'highE'].map((key) => DEFAULT_STRING_COLORS[key]),
    defaultPaletteHex.slice(0, 6),
  );
  assert.deepEqual(
    effectiveStringColors({}, 7, false).slice(1),
    defaultPaletteHex.slice(0, 6),
  );
  assert.deepEqual(
    effectiveStringColors({}, 8, false).slice(0, 2),
    defaultPaletteHex.slice(6, 8).reverse(),
  );
  // Two simultaneous panes resolve the same named setting independently.
  assert.deepEqual(
    effectiveStringColors({ low7: '#112233' }, 6, false),
    defaultPaletteHex.slice(0, 6),
  );
  assert.deepEqual(
    effectiveStringColors({ low7: '#112233' }, 7, false)[0],
    '#112233',
  );
});

test('dev string colors retain the latest apply when localStorage is blocked', async () => {
  const realWindow = globalThis.window;
  const realLocalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  };
  globalThis.window = { feedBack: { emit() {} } };

  try {
    const colors = await import('../src/settings/string-colors.js');
    const { settingsMemFallback } = await import('../src/settings/store.js');
    colors.applyDevStringColors({ lowE: '#345678' });

    assert.deepEqual(colors.getStringColorOverrides(), { lowE: '#345678' });
    assert.deepEqual(JSON.parse(settingsMemFallback.customColors), {
      format: colors.NAMED_STRING_COLOR_FORMAT,
      colors: { lowE: '#345678' },
    });
    assert.equal(settingsMemFallback.palette, 'custom');

    delete settingsMemFallback.palette;
    delete settingsMemFallback.customColors;
  } finally {
    globalThis.window = realWindow;
    globalThis.localStorage = realLocalStorage;
  }
});

test('dev share codes have their own format and round-trip', async () => {
  const {
    decodeDevStringColorShare,
    encodeDevStringColorShare,
  } = await import('../src/settings/string-colors.js');
  const code = encodeDevStringColorShare('Dev colors', { lowE: '#123456' });
  assert.match(code, /^H3DDEV1\./);
  assert.deepEqual(decodeDevStringColorShare(code), {
    name: 'Dev colors',
    colors: { lowE: '#123456' },
  });
  assert.equal(decodeDevStringColorShare('SLOPHWY2.not-the-dev-format'), null);
});
