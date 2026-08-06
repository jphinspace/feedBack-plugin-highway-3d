// Behavioural characterization test for the teaching-marks (§6.2.2) render
// helpers `teachingFingerLabel` / `teachingDegreeLabel`.
//
// Ported from feedBack core's tests/js/highway_teaching_marks.test.js,
// trimmed to the 3D half only — the original also covered the byte-identical
// 2D twins in static/js/highway-geometry.js and the 2D-only
// `strumGroupBuckets` (static/js/highway-draw.js), neither of which exist in
// this standalone plugin fork.
//
// Was tests/legacy/highway_teaching_marks.test.js, a source-extraction
// tripwire that brace-matched these functions out of src/main.js text and
// eval'd them in isolation. Now real imports (Stage 7 Phase 1d,
// src/instance/model/math.js) — same assertions, verbatim.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teachingDegreeLabel, teachingFingerLabel } from '../src/instance/model/math.js';

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
