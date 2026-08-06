// Source-level wiring guards for the 3D highway's custom string-palette path
// in screen.js.
//
// Ported from feedBack core's tests/js/highway_string_colors.test.js,
// trimmed to the 3D-only assertions — the original also covered the 2D
// highway (static/highway.js), the shared color-derivation math and the
// share-code codec, and the app.js color manager (static/js/highway-colors.js),
// none of which exist in this standalone plugin fork. This file is a
// tripwire during the screen.js -> src/ module split: it should stay green
// until this wiring moves into a real module, at which point this test is
// replaced by `.mjs` tests against the extracted module.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const highway3dJs = path.join(__dirname, '..', '..', 'screen.js');

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

test('3D adds a custom palette path + h3dBgSetStringColors setter', () => {
    const src = fs.readFileSync(highway3dJs, 'utf8');
    assert.match(src, /window\.h3dBgSetStringColors\s*=/, 'window.h3dBgSetStringColors must be defined');
    assert.match(src, /_bgWriteGlobal\('customColors'/, 'setter must persist customColors');
    assert.match(src, /_bgWriteGlobal\('palette',\s*'custom'\)/, "setter must flip palette to 'custom'");
    // 'custom' must survive palette coercion (else it gets reset to default).
    assert.match(src, /key === 'palette'\)\s*return\s*\(PALETTE_IDS\.includes\(val\)\s*\|\|\s*val === 'custom'\)/, "palette coercion must accept 'custom'");
    // _bgLoadSettings resolves 'custom' into the in-place _customPalette and
    // forces a retint on content change via the signature guard.
    assert.match(src, /newPaletteId === 'custom'/, '_bgLoadSettings must branch on custom');
    assert.match(src, /_bgPaletteSig/, 'a palette content signature must guard in-place custom edits');
});

test('3D gem-body gradients follow the active palette (not hardcoded)', () => {
    const src = fs.readFileSync(highway3dJs, 'utf8');
    // The gem bodies (strings 0..5) are a baked per-vertex gradient; a custom
    // palette must recolor them, else gems/sustain/vibrato heads stay stock.
    assert.match(src, /function _recolorGemGradients\(\)/, '_recolorGemGradients must exist');
    const fn = extractBlock(src, 'function _recolorGemGradients()');
    assert.match(fn, /isCustom\s*&&\s*base !== PALETTES\.default\[s\]/, 'custom slots must derive stops from the base color');
    assert.match(fn, /_lightenInt\(base/, 'derived top highlight via _lightenInt');
    assert.match(fn, /_darkenInt\(base/, 'derived bottom shade via _darkenInt');
    assert.match(fn, /colAttr\.needsUpdate = true/, 'must flag the color attribute dirty');
    // Wired into both the build path and the live palette-change path.
    const apply = extractBlock(src, 'function _applyPaletteToMaterials()');
    assert.match(apply, /_recolorGemGradients\(\)/, '_applyPaletteToMaterials must recolor gems on palette change');
});
