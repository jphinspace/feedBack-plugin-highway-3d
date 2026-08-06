// Behavioural characterization test for the per-note bend-curve (bnv, §6.2.1)
// 3D render helper `bnvSampleAt`.
//
// Ported from feedBack core's tests/js/highway_bend_curve.test.js, trimmed to
// the 3D half only — the original also covered the 2D twin
// `bnvNormalizedPoints` in static/js/highway-geometry.js, which does not
// exist in this standalone plugin fork.
//
// Was tests/legacy/highway_bend_curve.test.js, a source-extraction tripwire
// that brace-matched `bnvSampleAt` out of src/main.js text and eval'd it in
// isolation. Now a real import (Stage 7 Phase 1d, src/instance/model/math.js)
// — same assertions, verbatim.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bnvSampleAt } from '../src/instance/model/math.js';

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
