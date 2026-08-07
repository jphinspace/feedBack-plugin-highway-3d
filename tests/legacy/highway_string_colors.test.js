// Source-level wiring guards for the 3D highway's custom string-palette path.
//
// Ported from feedBack core's tests/js/highway_string_colors.test.js,
// trimmed to the 3D-only assertions — the original also covered the 2D
// highway (static/highway.js), the shared color-derivation math and the
// share-code codec, and the app.js color manager (static/js/highway-colors.js),
// none of which exist in this standalone plugin fork.
//
// h3dBgSetStringColors moved to src/settings/setters.js and coerceSetting's
// palette-coercion branch to src/settings/store.js in the screen.js -> src/
// module split (Stage 4); those two assertions were upgraded to real
// imports. The rest of this test's assertions (`loadSettings`'s
// 'custom'-palette branch, `backgroundPaletteSig`) check code still inside the
// per-instance factory closure in src/main.js (not extracted until the
// deep closure-dismantling stage), so those stay source-level regexes
// against src/main.js.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const highway3dJs = path.join(__dirname, '..', '..', 'src', 'main.js');
const materialRetintJs = path.join(__dirname, '..', '..', 'src', 'instance', 'render', 'material-retint.js');

// Brace-balanced extraction (same helper shape as the other legacy tests).
function extractBlock(src, signature) {
    const start = src.indexOf(signature);
    assert.ok(start !== -1, `signature '${signature}' not found`);
    const openBrace = src.indexOf('{', start);
    assert.ok(openBrace !== -1, `opening brace after '${signature}' not found`);
    let depth = 1;
    let i = openBrace + 1;
    while (i < src.length && depth > 0) {
        const ch = src[i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        i++;
    }
    assert.ok(depth === 0, `unbalanced braces after '${signature}'`);
    return src.slice(start, i);
}

test('3D adds a custom palette path + h3dBgSetStringColors setter', async () => {
    const { h3dBgSetStringColors } = await import('../../src/settings/setters.js');
    assert.strictEqual(typeof h3dBgSetStringColors, 'function', 'h3dBgSetStringColors must be defined');

    const settersSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'settings', 'setters.js'), 'utf8');
    assert.match(settersSrc, /writeGlobalSetting\('customColors'/, 'setter must persist customColors');
    assert.match(settersSrc, /writeGlobalSetting\('palette',\s*'custom'\)/, "setter must flip palette to 'custom'");

    // 'custom' must survive palette coercion (else it gets reset to default).
    const storeSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'settings', 'store.js'), 'utf8');
    assert.match(storeSrc, /key === 'palette'\)\s*return\s*\(PALETTE_IDS\.includes\(val\)\s*\|\|\s*val === 'custom'\)/, "palette coercion must accept 'custom'");

    // loadSettings resolves 'custom' into the in-place _customPalette and
    // forces a retint on content change via the signature guard. Still in
    // src/main.js's factory closure -- not extracted yet.
    const src = fs.readFileSync(highway3dJs, 'utf8');
    assert.match(src, /newPaletteId === 'custom'/, 'loadSettings must branch on custom');
    assert.match(src, /backgroundPaletteSig/, 'a palette content signature must guard in-place custom edits');
});

test('3D gem-body gradients follow the active palette (not hardcoded)', () => {
    // Moved out of main.js into instance/render/material-retint.js (Stage 7,
    // post-3e) -- both functions dropped their leading underscore there.
    const src = fs.readFileSync(materialRetintJs, 'utf8');
    // The gem bodies (strings 0..5) are a baked per-vertex gradient; a custom
    // palette must recolor them, else gems/sustain/vibrato heads stay stock.
    assert.match(src, /function recolorGemGradients\(\)/, 'recolorGemGradients must exist');
    const fn = extractBlock(src, 'function recolorGemGradients()');
    assert.match(fn, /isCustom\s*&&\s*base !== PALETTES\.default\[s\]/, 'custom slots must derive stops from the base color');
    assert.match(fn, /_lightenInt\(base/, 'derived top highlight via _lightenInt');
    assert.match(fn, /_darkenInt\(base/, 'derived bottom shade via _darkenInt');
    assert.match(fn, /colAttr\.needsUpdate = true/, 'must flag the color attribute dirty');
    // Wired into both the build path and the live palette-change path.
    const apply = extractBlock(src, 'function applyPaletteToMaterials()');
    assert.match(apply, /recolorGemGradients\(\)/, 'applyPaletteToMaterials must recolor gems on palette change');
});
