// Pins the wide-pane horizontal-FOV-hold ("Hor+") framing in the 3D
// highway renderer.
//
// What it guards: ultra-wide panes (top/bottom 2-player split → full-width /
// half-height → ~32:9) used to render the neck as a thin central sliver because
// THREE's PerspectiveCamera fov is VERTICAL and was locked at 70°, ballooning
// the horizontal cone past 130°. The fix lets camUpdate lower the effective
// vertical fov as the pane widens (holding the horizontal cone ~constant) so the
// neck fills the pane. It is gated behind window.__h3dAspectTune (default off →
// byte-for-byte the prior behaviour) for live A/B comparison.
//
// A refactor that re-hardcodes the camera fov, drops the change-guarded cam.fov
// write, stops caching the pane aspect, or removes the no-op-at-startAspect
// guarantee would silently regress the feature (or worse, change normal-pane
// framing). These are source-level pins — same strategy as the other
// tests/js/ files (no DOM / WebGL in CI).
//
// The floating tuner panel (window.__h3dAspectTune bridge, _aspect* helpers)
// moved to src/ui/aspect-panel.js and the Shift+A shortcut to
// src/ui/shortcuts.js in the screen.js -> src/ module split (Stage 3a);
// `_ASPECT_DEFAULTS` checks were upgraded to real imports (cheap, and
// strictly stronger than regexing an object literal), everything else that
// used to regex a moved declaration now regexes the same pattern against
// panelSrc/shortcutsSrc instead of src. camUpdate/applySize moved OUT of
// main.js into src/instance/render/camera-lifecycle.js (Stage 7, post-3e) --
// their assertions below now regex cameraLifecycleSrc. destroy() itself
// (the _paneAspect/cam.fov reset) stayed in main.js, so that one assertion
// still regexes src.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCREEN_JS = path.join(__dirname, '..', '..', 'src', 'main.js');
const DOM_AND_SCENE_JS = path.join(__dirname, '..', '..', 'src', 'instance', 'geometry', 'dom-and-scene.js');
const ASPECT_PANEL_JS = path.join(__dirname, '..', '..', 'src', 'ui', 'aspect-panel.js');
const SHORTCUTS_JS = path.join(__dirname, '..', '..', 'src', 'ui', 'shortcuts.js');
const CAMERA_LIFECYCLE_JS = path.join(__dirname, '..', '..', 'src', 'instance', 'render', 'camera-lifecycle.js');
const src = fs.readFileSync(SCREEN_JS, 'utf8');
// The camera is constructed in dom-and-scene.js (Stage 7 Track B / 3-ctx-3);
// only the ctor check below needs this source.
const domAndSceneSrc = fs.readFileSync(DOM_AND_SCENE_JS, 'utf8');
const panelSrc = fs.readFileSync(ASPECT_PANEL_JS, 'utf8');
const shortcutsSrc = fs.readFileSync(SHORTCUTS_JS, 'utf8');
const cameraLifecycleSrc = fs.readFileSync(CAMERA_LIFECYCLE_JS, 'utf8');

// ── Constants ────────────────────────────────────────────────────────────────

test('BASE_VFOV is a named constant (not a literal in the camera ctor)', async () => {
    // BASE_VFOV moved to src/core/constants.js in the screen.js -> src/ module
    // split (Stage 1); real-import it rather than regexing its declaration.
    const { BASE_VFOV } = await import('../../src/core/constants.js');
    assert.strictEqual(BASE_VFOV, 70, 'BASE_VFOV must be declared as a constant');
});

test('the camera is constructed with BASE_VFOV, not a bare 70', () => {
    assert.match(
        domAndSceneSrc,
        /new\s+T\.PerspectiveCamera\(\s*BASE_VFOV\s*,/,
        'PerspectiveCamera must take BASE_VFOV as its vertical fov',
    );
});

test('the Hor+ start-aspect and min-vfov defaults exist', async () => {
    const { HORPLUS_START_ASPECT, HORPLUS_MIN_VFOV } = await import('../../src/core/constants.js');
    assert.strictEqual(HORPLUS_START_ASPECT, 16 / 9,
        'HORPLUS_START_ASPECT must default to 16/9 (no-op at/under the reference aspect)');
    assert.strictEqual(typeof HORPLUS_MIN_VFOV, 'number', 'HORPLUS_MIN_VFOV floor must be declared');
});

// ── effectiveVfov: no-op guarantees ──────────────────────────────────────────
// effectiveVfov moved to src/instance/model/math.js in the screen.js -> src/
// module split (Stage 7 Phase 1d); real-import and call it rather than
// regexing its body — strictly stronger, same as the BASE_VFOV/HORPLUS_*
// conversions above.

test('effectiveVfov returns the base fov when the bridge is off/absent', async () => {
    // The disabled / malformed-input guard returns `base` before any Hor+ math,
    // so normal panes are unaffected when __h3dAspectTune is missing or off.
    const { effectiveVfov } = await import('../../src/instance/model/math.js');
    const { BASE_VFOV } = await import('../../src/core/constants.js');
    assert.equal(effectiveVfov(32 / 9, null), BASE_VFOV, 'no tune bridge -> base fov');
    assert.equal(effectiveVfov(32 / 9, { enabled: false }), BASE_VFOV, 'disabled bridge -> base fov');
    assert.equal(effectiveVfov(32 / 9, { enabled: false, baseVfov: 65 }), 65,
        'a custom baseVfov is still honoured on the disabled short-circuit path');
});

test('effectiveVfov is a no-op at/under the start aspect', async () => {
    const { effectiveVfov } = await import('../../src/instance/model/math.js');
    const { BASE_VFOV, HORPLUS_START_ASPECT } = await import('../../src/core/constants.js');
    const tune = { enabled: true };
    assert.equal(effectiveVfov(HORPLUS_START_ASPECT, tune), BASE_VFOV,
        'aspect exactly at the default start aspect must not engage Hor+');
    assert.equal(effectiveVfov(HORPLUS_START_ASPECT - 0.01, tune), BASE_VFOV,
        'aspect under the default start aspect (normal/2x2 panes) must not engage Hor+');
    assert.equal(effectiveVfov(HORPLUS_START_ASPECT + 1, tune) < BASE_VFOV, true,
        'sanity: aspect past start DOES engage Hor+, so the no-op above is a real guard, not dead code');
});

// ── shipped defaults: off + coherent ─────────────────────────────────────────
// The "default off → byte-for-byte prior behaviour" contract only holds if the
// shipped _ASPECT_DEFAULTS actually ship disabled with a base that matches the
// camera's constructed fov. A previous revision shipped enabled:true with
// baseVfov:30 (and blend:0), which forced every pane's fov to 30/36 and
// silently re-framed normal single-player panes. These pin against that.
//
// Real-imported (not regexed) -- _ASPECT_DEFAULTS moved to
// src/ui/aspect-panel.js and is a plain object, so checking its actual
// resolved values is both simpler and strictly stronger than pattern-
// matching the object literal's source text.

test('_ASPECT_DEFAULTS ships disabled (no-op out of the box)', async () => {
    const { _ASPECT_DEFAULTS } = await import('../../src/ui/aspect-panel.js');
    assert.strictEqual(_ASPECT_DEFAULTS.enabled, false,
        '_ASPECT_DEFAULTS.enabled must default to false so the feature is opt-in');
});

test('the default base fov matches BASE_VFOV (enabling is still a no-op on normal panes)', async () => {
    // baseVfov === BASE_VFOV means even with the feature ON, a <=startAspect pane
    // returns the unchanged 70° — the effect is confined to genuinely wide panes.
    const { _ASPECT_DEFAULTS } = await import('../../src/ui/aspect-panel.js');
    const { BASE_VFOV } = await import('../../src/core/constants.js');
    assert.strictEqual(_ASPECT_DEFAULTS.baseVfov, BASE_VFOV,
        '_ASPECT_DEFAULTS.baseVfov must default to BASE_VFOV, not a divergent literal');
});

test('the default blend engages the hold and the floor sits below the base', async () => {
    // blend:1 means turning the feature on actually holds the horizontal cone
    // (blend:0 would collapse effectiveVfov back to base = feature inert), and
    // minVfovDeg:HORPLUS_MIN_VFOV keeps the floor below baseVfov (a real floor,
    // not one that clamps the base upward).
    const { _ASPECT_DEFAULTS } = await import('../../src/ui/aspect-panel.js');
    const { HORPLUS_MIN_VFOV } = await import('../../src/core/constants.js');
    assert.strictEqual(_ASPECT_DEFAULTS.blend, 1,
        '_ASPECT_DEFAULTS.blend must default to 1 so the Hor+ hold actually applies when enabled');
    assert.strictEqual(_ASPECT_DEFAULTS.minVfovDeg, HORPLUS_MIN_VFOV,
        '_ASPECT_DEFAULTS.minVfovDeg must default to HORPLUS_MIN_VFOV (a floor below baseVfov)');
});

// ── camUpdate: change-guarded fov write + cached aspect ───────────────────────

test('applySize caches the pane aspect for camUpdate', () => {
    assert.match(
        cameraLifecycleSrc,
        /_paneAspect\s*=\s*cam\.aspect\s*;/,
        'applySize must cache cam.aspect into _paneAspect',
    );
});

test('camUpdate resolves a per-pane tune and respects splitOnly', () => {
    assert.match(
        cameraLifecycleSrc,
        /const\s+_aspTune\s*=\s*_resolveTuneFor\(\s*_paneKey\s*\)\s*;[\s\S]*?_aspTune\.splitOnly\s*&&\s*!splitscreenActive\(\)/,
        'camUpdate must resolve the tune per pane via _resolveTuneFor(_paneKey) and gate splitOnly',
    );
});

test('the tune bridge seeds from localStorage (persisted sessions apply on load)', () => {
    assert.match(
        panelSrc,
        /function\s+_aspectTune\s*\(\)[\s\S]*?localStorage\.getItem\(\s*_ASPECT_LS\s*\)/,
        '_aspectTune() must seed the bridge from localStorage',
    );
});

test('a floating tuner panel is built and can be shown/hidden', () => {
    assert.match(panelSrc, /function\s+_ensureAspectPanel\s*\(\)/,
        '_ensureAspectPanel() must exist to build the live panel');
    assert.match(panelSrc, /function\s+_setAspectPanelVisible\s*\(/,
        '_setAspectPanelVisible() must show/hide the panel');
});

// ── Per-pane targeting ────────────────────────────────────────────────────────

test('the tune resolves per pane with a sparse override map', () => {
    // _resolveTuneFor overlays a pane's __panels[key] overrides onto the base so
    // one split pane can be framed independently of the others.
    assert.match(
        panelSrc,
        /function\s+_resolveTuneFor\s*\(\s*paneKey\s*\)[\s\S]*?base\.__panels\s*&&\s*base\.__panels\[\s*paneKey\s*\]/,
        '_resolveTuneFor must overlay per-pane overrides from base.__panels',
    );
});

test('panel writes route to the selected target (base or a pane override)', () => {
    // _aspectWriteVal writes to the base when target is empty, else into the
    // pane override sub-object; camUpdate consumes it via _resolveTuneFor.
    assert.match(
        panelSrc,
        /function\s+_aspectWriteVal\s*\([\s\S]*?if\s*\(\s*!_aspectEditTarget\s*\)[\s\S]*?base\.__panels\b[\s\S]*?\[\s*_aspectEditTarget\s*\]/,
        '_aspectWriteVal must target base for "all" and __panels[target] for a pane',
    );
});

test('a Target select and pane registry drive the per-pane picker', () => {
    assert.match(panelSrc, /_aspectTargetSel\s*=\s*document\.createElement\(\s*'select'\s*\)/,
        'the panel must build a Target <select>');
    assert.match(panelSrc, /function\s+_aspectRegisterPane\s*\(/,
        '_aspectRegisterPane must record live panes for the picker');
    assert.match(
        cameraLifecycleSrc,
        /if\s*\(\s*window\.__h3dAspectPanelOpen\s*\)\s*_aspectRegisterPane\(\s*_paneKey\s*\)/,
        'camUpdate must register its pane only while the tuner panel is open',
    );
});

test('panes are keyed by arrangement (stable across songs, no split-API dep)', () => {
    // 'arr:<name>' keys are distinct between split panes AND stable across
    // songs, without depending on the external splitscreen panel index (which
    // isn't always available). A per-instance id is the no-arrangement fallback.
    assert.match(
        panelSrc,
        /function\s+_aspectPaneKey\s*\(\s*arrangement\s*,\s*uid\s*\)[\s\S]*?'arr:'\s*\+\s*a[\s\S]*?'pane:'\s*\+\s*uid/,
        '_aspectPaneKey must prefer arr:<name> and fall back to pane:<uid>',
    );
    assert.match(
        cameraLifecycleSrc,
        /const\s+_paneKey\s*=\s*_aspectPaneKey\(\s*[\s\S]*?songInfo[\s\S]*?arrangement\s*,\s*_paneUid\s*\)\s*;/,
        'camUpdate must key the pane by arrangement (with the uid fallback)',
    );
});

test('arrangement-keyed overrides persist; instance-id keys stay session-only', () => {
    assert.match(
        panelSrc,
        /function\s+_aspectPersist\s*\(\)[\s\S]*?k\.slice\(0,\s*4\)\s*===\s*'arr:'[\s\S]*?out\.__panels\s*=\s*p/,
        '_aspectPersist must persist only arr:* overrides so they carry across songs',
    );
});

test('the target dropdown prunes dead panes and does not rebuild while focused', () => {
    assert.match(panelSrc, /function\s+_aspectPrunePanes\s*\(\)[\s\S]*?delete\s+reg\[k\]/,
        '_aspectPrunePanes must drop panes not seen recently');
    assert.match(panelSrc, /_aspectPrunePanes\(\)\s*;[\s\S]*?if\s*\(\s*_aspectPanesDirty\s*\)\s*_aspectBuildTargets\(\)/,
        'the readout tick must prune then rebuild only when dirty');
    assert.match(panelSrc, /function\s+_aspectBuildTargets\s*\(\)[\s\S]*?document\.activeElement\s*===\s*_aspectTargetSel[\s\S]*?return/,
        '_aspectBuildTargets must skip rebuilding while the select is focused');
});

test('programmatic sync does not write back into the tune', () => {
    // _syncAspectPanel dispatches synthetic input events to refresh labels; the
    // slider handler must skip the write while syncing, else opening/switching a
    // target would populate a full override for every field.
    assert.match(panelSrc, /_aspectSyncing\s*=\s*true[\s\S]*?finally[\s\S]*?_aspectSyncing\s*=\s*false/,
        '_syncAspectPanel must set/reset the _aspectSyncing guard');
    assert.match(panelSrc, /if\s*\(\s*!_aspectSyncing\s*\)\s*_aspectWriteVal\(\s*f\.k\s*,/,
        'the slider input handler must skip the write while syncing');
});

test('unchecking hfov override clears a pane override key (re-inherits base)', () => {
    assert.match(
        panelSrc,
        /function\s+_aspectClearVal\s*\(\s*k\s*\)[\s\S]*?delete\s+ov\[k\][\s\S]*?delete\s+m\[\s*_aspectEditTarget\s*\]/,
        '_aspectClearVal must delete the pane override key (and empty object)',
    );
    assert.match(panelSrc, /else\s+_aspectClearVal\(\s*'hfovDeg'\s*\)/,
        'unchecking the hfov override must call _aspectClearVal');
});

test('pruning drops the matching readout slot and a dangling __last', () => {
    assert.match(
        panelSrc,
        /delete\s+reg\[k\]\s*;[\s\S]*?delete\s+ro\[k\]\s*;\s*if\s*\(\s*ro\.__last\s*===\s*k\s*\)\s*delete\s+ro\.__last/,
        '_aspectPrunePanes must prune the readout cache alongside the registry',
    );
});

test('single-pane forces the edit target back to All (no hidden pane edits)', () => {
    assert.match(
        panelSrc,
        /if\s*\(\s*keys\.length\s*<=\s*1\s*\|\|\s*\(\s*_aspectEditTarget\s*&&\s*!reg\[_aspectEditTarget\]\s*\)\s*\)\s*\{\s*_aspectEditTarget\s*=\s*''/,
        '_aspectBuildTargets must reset the edit target to "" when the Target row is hidden',
    );
});

test('resolved per-pane tune is memoized and invalidated by a revision', () => {
    assert.match(panelSrc, /_aspectRev\s*\+\+/, 'a mutation revision must be bumped on persist');
    assert.match(
        panelSrc,
        /_aspectResolveCache\.get\(\s*paneKey\s*\)[\s\S]*?c\.rev\s*===\s*_aspectRev[\s\S]*?return\s+c\.obj/,
        '_resolveTuneFor must return a cached object when the revision is unchanged',
    );
});

test('the pane clock falls back to Date.now so pruning keeps working', () => {
    assert.match(
        panelSrc,
        /function\s+_aspectNowMs\s*\(\)[\s\S]*?performance\.now\(\)[\s\S]*?return\s+Date\.now\(\)/,
        '_aspectNowMs must fall back to Date.now() when the Performance API is absent',
    );
});

test('opening the panel prunes before the first dropdown build', () => {
    assert.match(
        panelSrc,
        /if\s*\(\s*on\s*\)\s*\{\s*_aspectPrunePanes\(\)\s*;\s*_aspectBuildTargets\(\)/,
        '_setAspectPanelVisible must prune stale panes before building the dropdown',
    );
});

test('Reset on All restores defaults exactly (no forced enabled)', () => {
    // Panel visibility is independent of the enabled flag now, so Reset must not
    // force enabled true — it should restore _ASPECT_DEFAULTS verbatim.
    assert.doesNotMatch(panelSrc, /Object\.keys\(_ASPECT_DEFAULTS\)[\s\S]*?base\.enabled\s*=\s*true/,
        'Reset must not override the default enabled state');
});

test('the panel has a dismiss (close) control', () => {
    assert.match(
        panelSrc,
        /close\.textContent\s*=\s*'×'[\s\S]*?_setAspectPanelVisible\(\s*false\s*\)/,
        'the panel header must have a × button that hides the panel',
    );
});

test('camUpdate only writes cam.fov when it actually changes', () => {
    // Guarding the write avoids a per-frame updateProjectionMatrix on a steady
    // pane and keeps the disabled path free.
    assert.match(
        cameraLifecycleSrc,
        /Math\.abs\(\s*_vfov\s*-\s*cam\.fov\s*\)\s*>\s*1e-4[\s\S]*?cam\.fov\s*=\s*_vfov\s*;[\s\S]*?cam\.updateProjectionMatrix\(\)/,
        'camUpdate must guard the cam.fov write behind a change check',
    );
});

// ── Shortcut (open/close) + lifecycle reset ───────────────────────────────────

test('the shortcut opens/closes the tuner panel', () => {
    assert.match(
        shortcutsSrc,
        /registerShortcut\(\{[\s\S]*?_toggleAspectPanel\(\)/,
        'a registerShortcut handler must toggle the tuner panel',
    );
    assert.match(panelSrc, /function\s+_toggleAspectPanel\s*\(\)/,
        '_toggleAspectPanel() must exist to reveal/dismiss the panel');
});

test('destroy() resets the pane aspect and restores the base fov', () => {
    assert.match(src, /_paneAspect\s*=\s*0\s*;/,
        'destroy() must reset _paneAspect to 0');
    assert.match(
        src,
        /cam\.fov\s*!==\s*BASE_VFOV[\s\S]*?cam\.fov\s*=\s*BASE_VFOV\s*;\s*cam\.updateProjectionMatrix\(\)/,
        'destroy() must restore cam.fov to BASE_VFOV for instance reuse',
    );
});
