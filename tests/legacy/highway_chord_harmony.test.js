// Behavioural characterization test for the chord harmony-annotation render
// helper `chordHarmonyLabels` (§6.3.1 / §6.6) in screen.js. Pure, so we
// extract the function source by brace-matching and eval it in isolation.
//
// Ported from feedBack core's tests/js/highway_chord_harmony.test.js,
// trimmed to the 3D half only — the original also covered the byte-identical
// 2D twin in static/js/highway-geometry.js, which does not exist in this
// standalone plugin fork. This file is a tripwire during the screen.js ->
// src/ module split: it should stay green until `chordHarmonyLabels` moves
// into a real module, at which point this test is replaced by a `.mjs` test
// that imports it directly.

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

const chordHarmonyLabels = loadFn('src/main.js', 'chordHarmonyLabels');

test('chordHarmonyLabels surfaces rn + voicing + caged + guideTones', () => {
    assert.deepEqual(chordHarmonyLabels({ rn: 'ii7', q: 'm7', deg: 2 }, 'open', 'E', [4, 10]),
        { rn: 'ii7', voicing: 'open', caged: 'CAGED: E', guideTones: 'gt 4,10' });
});

test('chordHarmonyLabels trims whitespace', () => {
    assert.deepEqual(chordHarmonyLabels({ rn: '  V7 ' }, '  drop2 ', '  G  ', []),
        { rn: 'V7', voicing: 'drop2', caged: 'CAGED: G', guideTones: '' });
});

test('chordHarmonyLabels empties absent / malformed inputs', () => {
    assert.deepEqual(chordHarmonyLabels(null, undefined),
        { rn: '', voicing: '', caged: '', guideTones: '' });
    assert.deepEqual(chordHarmonyLabels({}, ''),
        { rn: '', voicing: '', caged: '', guideTones: '' });
    assert.deepEqual(chordHarmonyLabels({ rn: 7 }, 7),   // non-string
        { rn: '', voicing: '', caged: '', guideTones: '' });
    assert.deepEqual(chordHarmonyLabels(undefined, 'shell'),
        { rn: '', voicing: 'shell', caged: '', guideTones: '' });
    assert.deepEqual(chordHarmonyLabels({ rn: 'vi' }, null),
        { rn: 'vi', voicing: '', caged: '', guideTones: '' });
});

test('chordHarmonyLabels rejects invalid caged enum', () => {
    assert.equal(chordHarmonyLabels(null, null, 'X').caged, '');    // not a CAGED letter
    assert.equal(chordHarmonyLabels(null, null, 'e').caged, '');    // lower-case rejected
    assert.equal(chordHarmonyLabels(null, null, 7).caged, '');      // non-string
    assert.equal(chordHarmonyLabels(null, null, ['E']).caged, ''); // non-string
    assert.equal(chordHarmonyLabels(null, null, 'C').caged, 'CAGED: C');
});

test('chordHarmonyLabels filters out-of-range / non-int guide tones', () => {
    assert.equal(chordHarmonyLabels(null, null, '', [12, -1, 3, 'x', 10]).guideTones, 'gt 3,10');
    assert.equal(chordHarmonyLabels(null, null, '', [0, 11]).guideTones, 'gt 0,11');  // boundaries kept
    assert.equal(chordHarmonyLabels(null, null, '', []).guideTones, '');
    assert.equal(chordHarmonyLabels(null, null, '', '4,10').guideTones, '');          // non-array
    assert.equal(chordHarmonyLabels(null, null, '', [12, -1]).guideTones, '');        // all dropped
});
