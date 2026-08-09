// src/settings/store.js — per-panel/global localStorage precedence.
//
// Moved out of tests/background_control.test.js (now tests/player-chrome.test.mjs)
// in the Stage 3b split: this test exercises store.js directly and has
// nothing to do with the player-chrome control that file now focuses on.

import { test } from 'node:test';
import assert from 'node:assert/strict';

test('readGlobalSetting reads the global slot, ignoring per-panel overrides', async () => {
  const { readSetting: bgReadSetting, readGlobalSetting: bgReadGlobal, settingsMemFallback: bgMemFallback } = await import('../src/settings/store.js');

  const storage = new Map();
  const realLocalStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => (storage.has(k) ? storage.get(k) : null) };
  try {
    storage.set('highway_3d_dev.background.style', 'lights'); // global
    storage.set('highway_3d_dev.background.panel3.style', 'geometric'); // a per-panel override

    // The renderer, reading with a panel key, honours the per-panel override...
    assert.equal(bgReadSetting('panel3', 'style'), 'geometric');
    // ...but the shared control's global read must NOT see it - this is the
    // whole point of #2 (previously readSetting(null, ...) relied on
    // a made-up null panel key never existing).
    assert.equal(bgReadGlobal('style'), 'lights');

    // In-memory staged value wins over the persisted global (matches
    // readSetting's precedence). Must be a real BACKGROUND_STYLE_IDS member
    // ('butterchurn') since real coerceSetting is in the loop now.
    bgMemFallback.style = 'butterchurn';
    assert.equal(bgReadGlobal('style'), 'butterchurn');
    delete bgMemFallback.style;

    // Nothing stored -> SETTING_DEFAULTS.
    assert.equal(bgReadGlobal('style'), 'lights');
    storage.delete('highway_3d_dev.background.style');
    assert.equal(bgReadGlobal('style'), 'particles');
  } finally {
    globalThis.localStorage = realLocalStorage;
    delete bgMemFallback.style; // in case an assertion above threw mid-test
  }
});

test('every global setting uses the dev plugin storage namespace', async () => {
  const { globalSettingStorageKey, writeGlobalSetting, settingsMemFallback: bgMemFallback } = await import('../src/settings/store.js');
  const writes = [];
  const realLocalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: () => null,
    setItem: (key, value) => writes.push([key, value]),
  };
  try {
    assert.equal(globalSettingStorageKey('customVideoName'), 'highway_3d_dev.background.customVideoName');
    assert.equal(globalSettingStorageKey('style'), 'highway_3d_dev.background.style');
    writeGlobalSetting('customVideoName', 'current.mp4');
    assert.deepEqual(writes, [['highway_3d_dev.background.customVideoName', 'current.mp4']]);
  } finally {
    globalThis.localStorage = realLocalStorage;
    delete bgMemFallback.customVideoName;
  }
});
