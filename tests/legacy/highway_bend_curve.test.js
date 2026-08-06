// Behavioural characterization test for the per-note bend-curve (bnv, §6.2.1)
// 3D render helper `bnvSampleAt` in screen.js. Pure, so we extract the
// function source by brace-matching and eval it in isolation.
//
// Ported from feedBack core's tests/js/highway_bend_curve.test.js, trimmed to
// the 3D half only — the original also covered the 2D twin
// `bnvNormalizedPoints` in static/js/highway-geometry.js, which does not
// exist in this standalone plugin fork. This file is a tripwire during the
// screen.js -> src/ module split (see docs/plugin-modules split plan): it
// should stay green until `bnvSampleAt` moves into a real module, at which
// point this test is replaced by a `.mjs` test that imports it directly.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function extractFn(src, name) {
    const start = src.indexOf('function ' + name);
    assert.ok(start >= 0, `function ${name} must exist`);
    const open = src.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
    }
    throw new Error(`unbalanced braces extracting ${name}`);
}

function loadFn(file, name) {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8');
    return new Function('"use strict";' + extractFn(src, name) + `\nreturn ${name};`)();
}

const bnvSampleAt = loadFn('screen.js', 'bnvSampleAt');

// ── bnvSampleAt (3D) ─────────────────────────────────────────────────────────

test('bnvSampleAt linearly interpolates between points', () => {
    const bnv = [{ t: 0, v: 0 }, { t: 1, v: 2 }];
    assert.equal(bnvSampleAt(bnv, 0.5), 1);   // midpoint
    assert.equal(bnvSampleAt(bnv, 0.25), 0.5);
});

test('bnvSampleAt clamps to the endpoints', () => {
    const bnv = [{ t: 0.2, v: 1 }, { t: 0.8, v: 3 }];
    assert.equal(bnvSampleAt(bnv, 0), 1);     // before first
    assert.equal(bnvSampleAt(bnv, 5), 3);     // after last
});

test('bnvSampleAt traces a round-trip curve up then back down', () => {
    const bnv = [{ t: 0, v: 0 }, { t: 0.5, v: 2 }, { t: 1, v: 0 }];
    assert.equal(bnvSampleAt(bnv, 0.25), 1);  // rising
    assert.equal(bnvSampleAt(bnv, 0.5), 2);   // peak
    assert.equal(bnvSampleAt(bnv, 0.75), 1);  // falling
});

test('bnvSampleAt returns 0 for an empty/invalid curve', () => {
    assert.equal(bnvSampleAt([], 0.5), 0);
    assert.equal(bnvSampleAt(null, 0.5), 0);
});

test('bnvSampleAt tolerates a zero-width segment (duplicate t)', () => {
    const bnv = [{ t: 0, v: 0 }, { t: 0.5, v: 1 }, { t: 0.5, v: 2 }, { t: 1, v: 2 }];
    assert.equal(bnvSampleAt(bnv, 0.5), 1);   // first matching segment wins
});
