// Pins the auto-reframe-on-layout-settle behaviour in
// plugins/highway_3d/screen.js.
//
// Bug it guards against: when a song opens, the player screen may not have
// its final dimensions yet (controls / sections bar still laying out). The
// highway canvas is `#highway { flex: 1; min-height: 0 }`, so its real
// rendered box (canvasSize() via getBoundingClientRect) is temporarily too
// tall — applySize() then frames cam.aspect for the wrong height and the
// camera crops the near strings / fret-number row. Once the layout settles
// the flex box shrinks to the correct size, but the backing store
// (canvas.width/height) does NOT change, so the splitscreen-oriented
// `_lastHwW/_lastHwH` check never fires and the framing stays wrong until the
// user un/re-maximizes the window (which fires a real `resize`).
//
// The fix makes draw() additionally compare the live canvas box against the
// last logical size handed to applySize() (_appliedW/_appliedH) and re-apply
// on >1px drift even when the backing store is unchanged. A refactor that
// drops the CSS-box comparison, stops recording _appliedW/_appliedH, or
// reverts to backing-store-only detection would silently bring the bug back.
//
// Source-level only — same strategy as the other tests/js/ files.
//
// applySize()/_appliedW/_appliedH/_wrapPinned moved to
// src/instance/render/camera-lifecycle.js (Stage 7, post-3e), as private
// factory state exposed to draw()'s resize-detection fallback (which stayed
// in main.js) via one combined cameraLifecycle.getAppliedSize() getter. The
// explicit `_appliedW = 0; _appliedH = 0; _wrapPinned = false;` reset that
// used to live in main.js's destroy() is GONE, not just moved: that whole
// factory is reconstructed fresh in initScene() on every init() (song
// load/reload), so a stale value from the previous song can't leak the
// same way private state in every other post-3e-extracted module can't
// leak. The old "destroy() resets the applied-size tracking" test checked
// the reset mechanism directly; it's replaced below by a test checking the
// mechanism that now provides the same guarantee (unconditional
// reconstruction, not an if-guarded lazy one).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCREEN_JS = path.join(__dirname, '..', '..', 'src', 'main.js');
const src = fs.readFileSync(SCREEN_JS, 'utf8');
const CAMERA_LIFECYCLE_JS = path.join(__dirname, '..', '..', 'src', 'instance', 'render', 'camera-lifecycle.js');
const cameraLifecycleSrc = fs.readFileSync(CAMERA_LIFECYCLE_JS, 'utf8');

// ── Applied-size tracking ───────────────────────────────────────────────────

test('the last applied logical size is tracked as instance state', () => {
    assert.match(
        cameraLifecycleSrc,
        /let\s+_appliedW\s*=\s*0\s*;/,
        '_appliedW must be declared as per-instance state',
    );
    assert.match(
        cameraLifecycleSrc,
        /let\s+_appliedH\s*=\s*0\s*;/,
        '_appliedH must be declared as per-instance state',
    );
});

test('applySize records the logical w/h it applied', () => {
    // Recorded right after the aspect/aspectScale update so the draw() drift
    // check can compare against the size actually framed for.
    assert.match(
        cameraLifecycleSrc,
        /aspectScale\s*=\s*Math\.max\(1,[\s\S]*?_appliedW\s*=\s*w\s*;\s*_appliedH\s*=\s*h\s*;/,
        'applySize must set _appliedW = w; _appliedH = h after computing aspectScale',
    );
});

// ── draw() re-frames on CSS-box drift ───────────────────────────────────────

test('draw() reads the live canvas box once per frame', () => {
    assert.match(
        src,
        /const\s+box\s*=\s*canvasSize\(\s*highwayCanvas\s*\)\s*;/,
        'draw() must sample canvasSize(highwayCanvas) for the live box',
    );
});

test('backing-store drift branch is preserved (splitscreen path)', () => {
    // The original check that catches the splitscreen hw.resize override
    // resizing the element without calling renderer.resize() must remain.
    // The comparison is hoisted into _bsChanged (checked with cheap property
    // reads every frame, and it forces the throttled box read to run on the
    // same frame); the branch body is unchanged.
    assert.match(
        src,
        /const\s+_bsChanged\s*=\s*highwayCanvas\.width\s*!==\s*_lastHwW\s*\|\|\s*highwayCanvas\.height\s*!==\s*_lastHwH\s*;/,
        'the backing-store (canvas.width/height) comparison must run every frame',
    );
    assert.match(
        src,
        /if\s*\(\s*_bsChanged\s*\)\s*\{\s*_lastHwW\s*=\s*highwayCanvas\.width\s*;\s*_lastHwH\s*=\s*highwayCanvas\.height\s*;\s*if\s*\(\s*box\.w\s*>\s*0\s*&&\s*box\.h\s*>\s*0\s*\)\s*cameraLifecycle\.applySize\(\s*box\.w\s*,\s*box\.h\s*\)\s*;/,
        'the backing-store drift branch must still re-apply',
    );
    // The throttle must never delay the backing-store path: _bsChanged is
    // part of the gate that forces the box read on the same frame.
    assert.match(
        src,
        /if\s*\(\s*_bsChanged\s*\|\|\s*!_applied\.pinned\s*\|\|\s*_boxCheckCountdown\s*===\s*0\s*\)/,
        'the box-read gate must include _bsChanged so backing-store changes re-apply immediately',
    );
});

test('draw() re-applies on CSS-box drift even without a backing-store change', () => {
    // The else-if branch: backing store unchanged, but the flex box drifted
    // from the last applied logical size by more than 1px → re-frame. This is
    // the branch that fixes the open-song crop without a manual window resize.
    assert.match(
        src,
        /else if\s*\(\s*box\.w\s*>\s*0\s*&&\s*box\.h\s*>\s*0\s*&&\s*\(\s*Math\.abs\(\s*box\.w\s*-\s*_applied\.w\s*\)\s*>\s*1\s*\|\|\s*Math\.abs\(\s*box\.h\s*-\s*_applied\.h\s*\)\s*>\s*1\s*\)\s*\)\s*\{\s*cameraLifecycle\.applySize\(\s*box\.w\s*,\s*box\.h\s*\)\s*;/,
        'draw() must re-apply when the live box drifts >1px from the applied size',
    );
});

// ── Lifecycle reset ─────────────────────────────────────────────────────────

test('cameraLifecycle (and its private applied-size tracking) is reconstructed unconditionally on every init()', () => {
    // Instances are reused across songs (destroy() → init() re-runs
    // initScene()); stale applied dims would suppress the first reframe of
    // the next song if this construction were skipped when a prior instance
    // already existed (e.g. an `if (!cameraLifecycle)` guard).
    assert.match(
        src,
        /cameraLifecycle\s*=\s*createCameraLifecycle\(\{/,
        'initScene() must unconditionally reconstruct cameraLifecycle (no if-guard)',
    );
    assert.doesNotMatch(
        src,
        /if\s*\(\s*!cameraLifecycle\s*\)[\s\S]{0,40}createCameraLifecycle/,
        'cameraLifecycle construction must not be skipped on a re-init',
    );
});
