// Contract test for 3D Highway per-panel control metadata (feedBack#247).
// The factory statics are read without constructing a renderer instance or
// calling init().
//
// Ported from feedBack core's tests/js/highway_3d_panel_controls.test.js.
// The original evaluated the whole plugin script in a `vm` sandbox via
// `vm.runInContext` — that stopped working the moment screen.js -> src/
// module split (Stage 0e) gave src/main.js top-level `import` statements:
// `vm.runInContext` only executes classic (non-module) scripts and throws
// "Cannot use import statement outside a module". This is exactly the
// blocker the split plan called out in advance for whole-file-eval tests.
//
// The fix is a REAL dynamic `import()` of src/main.js as an ES module,
// with `window`/`localStorage`/`performance` stubbed on `globalThis` first
// (module top-level code runs in the ambient global scope, not a sandbox --
// verified safe: main.js has exactly one top-level side effect, a
// `localStorage.getItem` call, and never calls `init()`/`createFactory()`
// eagerly). `node --test` runs each test file in its own process, so
// stubbing globalThis here doesn't leak into other test files.
//
// main.js doesn't `export` BG_DEFAULTS (it's an entry script, not a
// library), so this test needs it for the default-value cross-check below.
// Same technique as the original vm version: inject one `export` line into
// a COPY of the source (never the real file) right after the factory
// registration anchor, write that copy to a sibling temp file inside src/
// so its `./core/...` relative imports still resolve, import the temp file,
// then delete it. The anchor-must-appear-exactly-once assertion is kept, so
// a moved/renamed anchor still fails loudly rather than silently testing
// nothing.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const MAIN_JS = path.join(__dirname, '..', '..', 'src', 'main.js');
const TMP_MAIN_JS = path.join(__dirname, '..', '..', 'src', '.tmp-test-panel-controls-main.mjs');

// 'palette' was removed — per-string colors are now set via the core
// "Highway String Colors" UI, which drives both highways by named string.
const REQUIRED_KEYS = ['cameraSmoothing', 'cameraLockLow', 'cameraLockZoom'];
const FORBIDDEN_KEYS = ['customImageDataUrl', 'customImageName', 'customVideoName'];
const VALID_TYPES = new Set(['select', 'range', 'toggle']);

async function loadHighway3dStatics() {
    const src = fs.readFileSync(MAIN_JS, 'utf8');
    const ANCHOR = 'window.feedBackViz_highway_3d = createFactory;';
    assert.equal(
        src.split(ANCHOR).length - 1,
        1,
        'expected exactly one factory-registration anchor in src/main.js',
    );
    const instrumented = src.replace(ANCHOR, `${ANCHOR}\nexport { BG_DEFAULTS };`);
    assert.notEqual(instrumented, src, 'test export injection anchor not found in src/main.js');

    fs.writeFileSync(TMP_MAIN_JS, instrumented);
    globalThis.window = {};
    globalThis.localStorage = {
        getItem() { return null; },
        setItem() {},
    };
    globalThis.performance = { now: () => 0 };
    try {
        // Cache-bust: a bare re-import of the same URL would hit Node's
        // module cache and return the previous test run's instance.
        const { BG_DEFAULTS } = await import(pathToFileURL(TMP_MAIN_JS).href + `?t=${Date.now()}`);
        globalThis.window.__h3dTestExports = { BG_DEFAULTS };
        return globalThis.window;
    } finally {
        fs.unlinkSync(TMP_MAIN_JS);
    }
}

function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}

function optionValue(option) {
    if (option && typeof option === 'object') return option.id;
    return undefined;
}

function assertOptionObject(option, controlKey) {
    assert.equal(
        Object.prototype.toString.call(option),
        '[object Object]',
        `${controlKey}.options entries must be { id, label } objects`,
    );
    assert.equal(typeof option.id, 'string', `${controlKey}.options id must be a string`);
    assert.ok(option.id.length > 0, `${controlKey}.options id must not be blank`);
    assert.equal(typeof option.label, 'string', `${controlKey}.options label must be a string`);
    assert.ok(option.label.trim().length > 0, `${controlKey}.options label must not be blank`);
}

test('3D Highway exposes static panelControls descriptors for per-panel hosts', async () => {
    const window = await loadHighway3dStatics();
    const factory = window.feedBackViz_highway_3d;
    assert.equal(typeof factory, 'function', 'screen.js must register the 3D Highway factory');

    assert.ok(
        Object.prototype.hasOwnProperty.call(factory, 'panelControls'),
        'panelControls must be an own static property on the factory',
    );
    assert.ok(Array.isArray(factory.panelControls), 'panelControls must be an array');

    const controls = cloneJson(factory.panelControls);
    const defaults = cloneJson(window.__h3dTestExports.BG_DEFAULTS);
    const keys = controls.map((control) => control && control.key);
    assert.deepEqual(keys, REQUIRED_KEYS, 'panelControls must expose exactly the issue #247 control set');
    const duplicateKeys = keys.filter((key, index) => keys.indexOf(key) !== index);
    assert.deepEqual(duplicateKeys, [], 'panelControls keys must be unique');

    const controlsByKey = new Map();

    for (const control of controls) {
        assert.equal(
            Object.prototype.toString.call(control),
            '[object Object]',
            'each panel control must be a plain descriptor object',
        );
        assert.equal(typeof control.key, 'string', 'descriptor.key must be a string');
        assert.match(control.key, /^[A-Za-z][A-Za-z0-9]*$/, 'descriptor.key must be a BG_DEFAULTS-style key');
        assert.equal(typeof control.label, 'string', `${control.key}.label must be a string`);
        assert.ok(control.label.trim().length > 0, `${control.key}.label must not be blank`);
        assert.equal(typeof control.type, 'string', `${control.key}.type must be a string`);
        assert.ok(VALID_TYPES.has(control.type), `${control.key}.type must be select, range, or toggle`);
        assert.ok(Object.prototype.hasOwnProperty.call(control, 'default'), `${control.key} must declare a default`);
        assert.ok(
            Object.prototype.hasOwnProperty.call(defaults, control.key),
            `${control.key} must map to a BG_DEFAULTS entry`,
        );
        assert.deepEqual(control.default, defaults[control.key], `${control.key}.default must match BG_DEFAULTS`);
        assert.ok(!controlsByKey.has(control.key), `${control.key} appears more than once in panelControls`);
        controlsByKey.set(control.key, control);

        if (control.type === 'select') {
            assert.ok(Array.isArray(control.options), `${control.key}.options must be an array`);
            assert.ok(control.options.length > 0, `${control.key}.options must not be empty`);
            const values = control.options.map(optionValue);
            assert.equal(values.length, new Set(values).size, `${control.key}.options values must be unique`);
            for (const option of control.options) {
                assertOptionObject(option, control.key);
            }
            for (const value of values) {
                assert.equal(typeof value, 'string', `${control.key}.options values must be strings`);
            }
            assert.ok(values.includes(control.default), `${control.key}.options must include the default`);
        }

        if (control.type === 'range') {
            assert.equal(typeof control.min, 'number', `${control.key}.min must be a number`);
            assert.equal(typeof control.max, 'number', `${control.key}.max must be a number`);
            assert.ok(Number.isFinite(control.min), `${control.key}.min must be finite`);
            assert.ok(Number.isFinite(control.max), `${control.key}.max must be finite`);
            assert.ok(control.min < control.max, `${control.key}.min must be less than max`);
            assert.equal(typeof control.default, 'number', `${control.key}.default must be numeric`);
            assert.ok(control.default >= control.min, `${control.key}.default must be >= min`);
            assert.ok(control.default <= control.max, `${control.key}.default must be <= max`);
            if (Object.prototype.hasOwnProperty.call(control, 'step')) {
                assert.equal(typeof control.step, 'number', `${control.key}.step must be a number`);
                assert.ok(control.step > 0, `${control.key}.step must be positive`);
            }
        }

        if (control.type === 'toggle') {
            assert.equal(typeof control.default, 'boolean', `${control.key}.default must be boolean`);
        }
    }

    for (const key of REQUIRED_KEYS) {
        assert.ok(controlsByKey.has(key), `panelControls must include ${key}`);
    }
    for (const key of FORBIDDEN_KEYS) {
        assert.ok(!controlsByKey.has(key), `panelControls must not expose global-only asset key ${key}`);
    }

    const cameraSmoothing = controlsByKey.get('cameraSmoothing');
    assert.equal(cameraSmoothing.type, 'range', 'cameraSmoothing must be a range control');
    assert.equal(cameraSmoothing.min, 0);
    assert.equal(cameraSmoothing.max, 1);
    assert.equal(cameraSmoothing.default, defaults.cameraSmoothing);

    const cameraLockLow = controlsByKey.get('cameraLockLow');
    assert.equal(cameraLockLow.type, 'toggle', 'cameraLockLow must be a toggle control');
    assert.equal(typeof cameraLockLow.default, 'boolean', 'cameraLockLow default must be boolean');
    assert.equal(cameraLockLow.default, defaults.cameraLockLow);

    const cameraLockZoom = controlsByKey.get('cameraLockZoom');
    assert.equal(cameraLockZoom.type, 'range', 'cameraLockZoom must be a range control');
    assert.equal(cameraLockZoom.min, 0);
    assert.equal(cameraLockZoom.max, 1);
    assert.equal(cameraLockZoom.default, defaults.cameraLockZoom);
});
