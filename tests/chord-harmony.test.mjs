// Behavioural characterization test for the chord harmony-annotation render
// helper `chordHarmonyLabels` (§6.3.1 / §6.6).
//
// Ported from feedBack core's tests/js/highway_chord_harmony.test.js, trimmed
// to the 3D half only — the original also covered the byte-identical 2D twin
// in static/js/highway-geometry.js, which does not exist in this standalone
// plugin fork.
//
// Was tests/legacy/highway_chord_harmony.test.js, a source-extraction tripwire
// that brace-matched `chordHarmonyLabels` out of src/main.js text and eval'd
// it in isolation. Now that the function lives in
// src/instance/model/chord-inference.js as a real export (Stage 7 Phase 1c),
// it's a real import — same assertions, verbatim.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chordHarmonyLabels } from '../src/instance/model/chord-inference.js';

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
