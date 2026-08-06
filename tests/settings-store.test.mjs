// src/settings/store.js — per-panel/global localStorage precedence.
//
// Moved out of tests/background_control.test.js (now tests/player-chrome.test.mjs)
// in the Stage 3b split: this test exercises store.js directly and has
// nothing to do with the player-chrome control that file now focuses on.

import { test } from 'node:test';
import assert from 'node:assert/strict';

test('_bgReadGlobal reads the global slot, ignoring per-panel overrides', async () => {
    const { _bgReadSetting: bgReadSetting, _bgReadGlobal: bgReadGlobal, _bgMemFallback: bgMemFallback } =
        await import('../src/settings/store.js');

    const storage = new Map();
    const realLocalStorage = globalThis.localStorage;
    globalThis.localStorage = { getItem: (k) => (storage.has(k) ? storage.get(k) : null) };
    try {
        storage.set('h3d_bg_style', 'lights');            // global
        storage.set('h3d_bg_panel3_style', 'geometric');  // a per-panel override

        // The renderer, reading with a panel key, honours the per-panel override...
        assert.equal(bgReadSetting('panel3', 'style'), 'geometric');
        // ...but the shared control's global read must NOT see it - this is the
        // whole point of #2 (previously _bgReadSetting(null, ...) relied on
        // 'h3d_bg_null_style' never existing).
        assert.equal(bgReadGlobal('style'), 'lights');

        // In-memory staged value wins over the persisted global (matches
        // _bgReadSetting's precedence). Must be a real BG_STYLE_IDS member
        // ('butterchurn') since real _bgCoerce is in the loop now.
        bgMemFallback.style = 'butterchurn';
        assert.equal(bgReadGlobal('style'), 'butterchurn');
        delete bgMemFallback.style;

        // Nothing stored -> BG_DEFAULTS.
        assert.equal(bgReadGlobal('style'), 'lights');
        storage.delete('h3d_bg_style');
        assert.equal(bgReadGlobal('style'), 'particles');
    } finally {
        globalThis.localStorage = realLocalStorage;
        delete bgMemFallback.style;   // in case an assertion above threw mid-test
    }
});
