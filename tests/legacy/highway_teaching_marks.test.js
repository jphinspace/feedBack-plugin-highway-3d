// Behavioural characterization test for the teaching-marks (§6.2.2) render
// helpers `teachingFingerLabel` / `teachingDegreeLabel` in screen.js. Both
// pure, so we extract the function source by brace-matching and eval it in
// isolation.
//
// Ported from feedBack core's tests/js/highway_teaching_marks.test.js,
// trimmed to the 3D half only — the original also covered the byte-identical
// 2D twins in static/js/highway-geometry.js and the 2D-only
// `strumGroupBuckets` (static/js/highway-draw.js), none of which exist in
// this standalone plugin fork. This file is a tripwire during the screen.js
// -> src/ module split: it should stay green until these functions move
// into real modules, at which point this test is replaced by `.mjs` tests
// that import them directly.

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

const teachingFingerLabel = loadFn('src/main.js', 'teachingFingerLabel');
const teachingDegreeLabel = loadFn('src/main.js', 'teachingDegreeLabel');

// ── teachingFingerLabel (fg) ─────────────────────────────────────────────────

test('teachingFingerLabel maps 0->T, 1..4->digit, else \'\'', () => {
    assert.equal(teachingFingerLabel(0), 'T');     // thumb
    assert.equal(teachingFingerLabel(1), '1');
    assert.equal(teachingFingerLabel(4), '4');     // pinky
    assert.equal(teachingFingerLabel(-1), '');     // unset
    assert.equal(teachingFingerLabel(5), '');      // out of range
    assert.equal(teachingFingerLabel(1.5), '');    // non-integer
    assert.equal(teachingFingerLabel(undefined), '');
    assert.equal(teachingFingerLabel(null), '');
});

// ── teachingDegreeLabel (sd) ─────────────────────────────────────────────────

test('teachingDegreeLabel shows 0..11, else \'\'', () => {
    assert.equal(teachingDegreeLabel(0), '0');     // tonic
    assert.equal(teachingDegreeLabel(7), '7');     // fifth
    assert.equal(teachingDegreeLabel(11), '11');
    assert.equal(teachingDegreeLabel(-1), '');     // unset
    assert.equal(teachingDegreeLabel(12), '');     // out of range
    assert.equal(teachingDegreeLabel(3.2), '');    // non-integer
    assert.equal(teachingDegreeLabel(undefined), '');
});
