import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

test('dev globals do not overwrite the bundled highway settings surface', async () => {
  const bundledStyleSetter = () => {};
  const bundledVenueSetter = () => {};
  const realWindow = globalThis.window;
  globalThis.window = {
    h3dBgSetStyle: bundledStyleSetter,
    h3dVenueSceneSetActive: bundledVenueSetter,
  };
  try {
    const { installGlobals } = await import('../src/globals.js');
    installGlobals();
    assert.equal(globalThis.window.h3dBgSetStyle, bundledStyleSetter);
    assert.equal(globalThis.window.h3dVenueSceneSetActive, bundledVenueSetter);
    assert.equal(typeof globalThis.window.h3dDevBgSetStyle, 'function');
    assert.equal(typeof globalThis.window.h3dDevVenueSceneSetActive, 'function');
  } finally {
    globalThis.window = realWindow;
  }
});

test('settings page calls only the dev setter namespace', async () => {
  const html = await readFile(new URL('../settings.html', import.meta.url), 'utf8');
  assert.match(html, /window\.h3dDevBgSetStyle/);
  assert.match(html, /window\.h3dDevSetFretSpacing/);
  assert.match(html, /window\.h3dDevBcApplySettings/);
  assert.doesNotMatch(html, /window\.h3dBgSet/);
  assert.doesNotMatch(html, /window\.h3dSetFretSpacing/);
  assert.doesNotMatch(html, /window\.h3dBcApplySettings/);
});

test('Tailwind scans the ES-module source tree', () => {
  const require = createRequire(import.meta.url);
  const config = require('../tailwind.config.js');
  assert.ok(config.content.includes('./src/**/*.js'));
});
