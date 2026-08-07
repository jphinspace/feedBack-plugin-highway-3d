// Behavioural tests for the generic Three.js object-pool factory.
//
// Was tests/legacy/highway_3d_pool_warm.test.js, a source-extraction
// tripwire that brace-matched `function pool(parent, mk)` out of
// src/main.js text. Now a real import (Stage 7 Track A) -- pool() moved to
// src/core/pool.js as a zero-dependency pure function, so it can be tested
// directly instead of pattern-matched.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/core/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAIN_JS = path.join(__dirname, '..', 'src', 'main.js');

// A minimal stand-in for a Three.js Object3D/Group -- pool() only ever
// calls parent.add(obj).
function fakeParent() {
    const children = [];
    return { children, add: (o) => children.push(o) };
}

test('get() lazily grows, reusing freed slots before allocating', () => {
    const parent = fakeParent();
    let made = 0;
    // visible:true on fresh construction, matching every real mk() in the
    // codebase (new T.Mesh(...) etc. defaults to visible:true) -- get()
    // only forces .visible = true on the REUSE branch, trusting a freshly
    // allocated object to already be visible.
    const p = pool(parent, () => { made++; return { visible: true, id: made }; });

    const a = p.get();
    const b = p.get();
    assert.equal(made, 2);
    assert.equal(parent.children.length, 2);
    assert.equal(a.visible, true);
    assert.equal(b.visible, true);

    p.reset();
    assert.equal(a.visible, false);
    assert.equal(b.visible, false);

    // Next get() after reset() must reuse slot 0, not allocate a third object.
    const c = p.get();
    assert.equal(made, 2);
    assert.equal(c, a);
    assert.equal(c.visible, true);
});

test('get() resets a Vector2 .center back to (0.5, 0.5) on reuse', () => {
    const parent = fakeParent();
    const p = pool(parent, () => ({
        visible: false,
        center: { isVector2: true, x: 0, y: 0, set(x, y) { this.x = x; this.y = y; } },
    }));
    const o = p.get();
    o.center.set(0.1, 0.9);
    p.reset();
    const reused = p.get();
    assert.equal(reused, o);
    assert.equal(reused.center.x, 0.5);
    assert.equal(reused.center.y, 0.5);
});

test('warm(cap) pre-allocates invisible slots up to cap, idempotently', () => {
    const parent = fakeParent();
    let made = 0;
    const p = pool(parent, () => { made++; return { visible: true }; });
    p.warm(5);
    assert.equal(made, 5);
    assert.equal(parent.children.length, 5);
    for (const c of parent.children) assert.equal(c.visible, false);

    // Warming again to a smaller or equal cap must not allocate more.
    p.warm(3);
    assert.equal(made, 5);
});

test('warm(cap) coerces non-finite / negative input to a safe non-negative integer', () => {
    const parent = fakeParent();
    let made = 0;
    const p = pool(parent, () => { made++; return { visible: true }; });
    p.warm(-5);
    assert.equal(made, 0);
    p.warm(NaN);
    assert.equal(made, 0);
    p.warm(2.9);
    assert.equal(made, 2); // cap | 0 truncates
});

test('warm(cap) returns the pool object for chaining', () => {
    const parent = fakeParent();
    const p = pool(parent, () => ({ visible: true }));
    assert.equal(p.warm(1), p);
});

test('warm() is called at boardInit with renderer-scoped cap constants', () => {
    const src = fs.readFileSync(MAIN_JS, 'utf8');
    // The note / chord / lane / beat cap constants live inside the
    // boardInit/initScene path (renderer-instance scope, not module
    // scope); each must exist as a const and drive at least one .warm()
    // call site.
    for (const cap of ['_WARM_NOTE', '_WARM_CHORD', '_WARM_LANE', '_WARM_BEAT']) {
        assert.match(src, new RegExp(`const ${cap}\\s*=`), `${cap} const must exist`);
        assert.match(src, new RegExp(`\\.warm\\(\\s*${cap}\\b`), `${cap} must drive at least one .warm() call`);
    }
});
