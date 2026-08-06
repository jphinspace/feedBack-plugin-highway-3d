// Pins the fret-spacing setting in the 3D highway renderer.
// The board can render fret columns either Uniform (equal width, the chart
// Remastered style) or Logarithmic (real instrument geometry), switchable at
// runtime via window.h3dSetFretSpacing and persisted in localStorage. A
// refactor that renames the storage key, drops the uniform/log branch in
// fretX, or stops validating the mode would silently regress the setting.
//
// The fretX/localStorage-read half moved to src/core/fret-geometry.js in
// the screen.js -> src/ module split (Stage 2); real-import + exercise it
// rather than regexing its declaration. window.h3dSetFretSpacing itself
// stays in src/main.js for now (needs _bgEmitChange, arriving in Stage 4),
// so those checks stay source-level.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCREEN_JS = path.join(__dirname, '..', '..', 'src', 'main.js');

test('fret-spacing mode is read from the highway_3d.fretSpacing localStorage key via initFretSpacing()', async () => {
    const { initFretSpacing, fretX } = await import('../../src/core/fret-geometry.js');
    const calls = [];
    const realGetItem = globalThis.localStorage?.getItem;
    globalThis.localStorage = {
        getItem: (k) => { calls.push(k); return 'logarithmic'; },
        setItem: () => {},
    };
    try {
        const beforeUniform = fretX(12);
        initFretSpacing();
        const afterLogarithmic = fretX(12);
        assert.deepEqual(calls, ['highway_3d.fretSpacing'], 'initFretSpacing must read the highway_3d.fretSpacing key');
        assert.notEqual(afterLogarithmic, beforeUniform, 'a stored "logarithmic" value must actually change fretX');
    } finally {
        // Restore uniform (the default) so later tests/imports of this
        // already-cached module in the same process see the expected mode.
        globalThis.localStorage = { getItem: () => null, setItem: () => {} };
        initFretSpacing();
        if (realGetItem) globalThis.localStorage.getItem = realGetItem;
    }
});

test('fretX switches between the uniform and logarithmic implementations', async () => {
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };
    const { initFretSpacing, fretX } = await import('../../src/core/fret-geometry.js');
    initFretSpacing();
    const uniform12 = fretX(12);
    globalThis.localStorage = { getItem: () => 'logarithmic', setItem: () => {} };
    initFretSpacing();
    const log12 = fretX(12);
    assert.notEqual(uniform12, log12, 'fretX must pick a different implementation for uniform vs logarithmic');
    // Restore uniform for any later test in this process.
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };
    initFretSpacing();
});

test('h3dSetFretSpacing validates the mode against the two supported values', () => {
    // An unexpected input must not be persisted verbatim — it is coerced to
    // one of 'logarithmic' | 'uniform' before writing to localStorage.
    const src = fs.readFileSync(SCREEN_JS, 'utf8');
    assert.match(
        src,
        /window\.h3dSetFretSpacing\s*=\s*mode\s*=>\s*\{[\s\S]*?mode\s*===\s*'logarithmic'\s*\?\s*'logarithmic'\s*:\s*'uniform'[\s\S]*?localStorage\.setItem\(\s*'highway_3d\.fretSpacing'/,
        'h3dSetFretSpacing must coerce mode to a supported value before persisting',
    );
});

test('h3dSetFretSpacing applies the change live, not via a page reload', () => {
    // A reload reboots the SPA to the home screen, ejecting the user from
    // Settings. The setter must instead rebind the spacing flag and broadcast
    // a 'fretSpacing' change so mounted panels rebuild in place — same path as
    // every other 3D-highway setting. Reintroducing location.reload() here is
    // the regression this guards against.
    const src = fs.readFileSync(SCREEN_JS, 'utf8');
    const setter = src.match(/window\.h3dSetFretSpacing\s*=\s*mode\s*=>\s*\{[\s\S]*?\n\};/);
    assert.ok(setter, 'h3dSetFretSpacing assignment must be present');
    assert.doesNotMatch(
        setter[0],
        /location\.reload/,
        'h3dSetFretSpacing must not reload the page (it ejects the user from Settings)',
    );
    assert.match(
        setter[0],
        /_bgEmitChange\(\s*'fretSpacing'\s*\)/,
        'h3dSetFretSpacing must broadcast a live fretSpacing change',
    );
});

test('the fretSpacing change rebuilds a mounted board live', () => {
    const src = fs.readFileSync(SCREEN_JS, 'utf8');
    assert.match(
        src,
        /changedKey\s*===\s*'fretSpacing'[\s\S]*?if\s*\(fretG\)\s*buildBoard\(\)/,
        'the panel bg listener must rebuild the board when fretSpacing changes',
    );
});
