// Contract test: 3D Highway WebGL context-loss recovery.
//
// Switching the active window / alt-tabbing (especially on Windows) can trigger
// a GPU context reset. Without a handler the lost WebGL context escalates into a
// render-process crash. The renderer owns its own WebGL canvas + heavy Three.js
// lifecycle (too much to construct in a vm sandbox), so — like the other
// highway_* source-contract tests here — this pins the wiring at the source
// level: the loss must be preventDefault()'d (so the browser restores it), draw
// must bail while lost, and the listeners must be torn down.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCREEN_JS = path.join(__dirname, '..', '..', 'src', 'main.js');
const DOM_AND_SCENE_JS = path.join(__dirname, '..', '..', 'src', 'instance', 'geometry', 'dom-and-scene.js');
const src = fs.readFileSync(SCREEN_JS, 'utf8');
// The renderer + context-loss handlers are built in dom-and-scene.js
// (Stage 7 Track B / 3-ctx-3); draw()/teardown() stayed in main.js.
const domAndSceneSrc = fs.readFileSync(DOM_AND_SCENE_JS, 'utf8');

test('binds webglcontextlost + webglcontextrestored on the renderer canvas', () => {
    assert.match(domAndSceneSrc, /ren\.domElement\.addEventListener\(\s*['"]webglcontextlost['"]/,
        'must listen for webglcontextlost on ren.domElement (the WebGL canvas)');
    assert.match(domAndSceneSrc, /ren\.domElement\.addEventListener\(\s*['"]webglcontextrestored['"]/,
        'must listen for webglcontextrestored on ren.domElement');
});

test('the context-lost handler preventDefaults and pauses drawing', () => {
    // Without preventDefault() the browser will not attempt to restore the
    // context and the loss can escalate to a renderer crash. _ctxLost itself
    // is set via the setCtxLost() setter (main.js's real _ctxLost variable
    // is threaded through as a live setter, not a plain deps value -- see
    // dom-and-scene.js's doc comment).
    const m = domAndSceneSrc.match(/const _onCtxLost\s*=\s*\(e\)\s*=>\s*\{[\s\S]*?\};/);
    assert.ok(m, '_onCtxLost handler must exist');
    assert.match(m[0], /preventDefault\(\)/, 'context-lost handler must call preventDefault()');
    assert.match(m[0], /setCtxLost\(\s*true\s*\)/, 'context-lost handler must call setCtxLost(true)');
});

test('draw() early-returns while the context is lost', () => {
    assert.match(src, /draw\(bundle\)\s*\{[\s\S]*?if\s*\(_ctxLost\)\s*return;/,
        'draw() must bail while _ctxLost is set so no GL work runs on a dead context');
});

test('teardown removes the context-loss listeners', () => {
    assert.match(src, /removeEventListener\(\s*['"]webglcontextlost['"]/,
        'teardown must remove the webglcontextlost listener');
    assert.match(src, /removeEventListener\(\s*['"]webglcontextrestored['"]/,
        'teardown must remove the webglcontextrestored listener');
});
