import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const settingsUrl = new URL('../settings.html', import.meta.url);
const domSceneUrl = new URL('../src/instance/geometry/dom-and-scene.js', import.meta.url);
const aspectPanelUrl = new URL('../src/ui/aspect-panel.js', import.meta.url);
const butterchurnPanelUrl = new URL('../src/butterchurn/panel.js', import.meta.url);
const notedetectListenersUrl = new URL('../src/instance/notedetect/listeners.js', import.meta.url);
const shortcutsUrl = new URL('../src/ui/shortcuts.js', import.meta.url);
const pluginCssUrl = new URL('../assets/plugin.css', import.meta.url);
const readmeUrl = new URL('../README.md', import.meta.url);
const noticeUrl = new URL('../NOTICE', import.meta.url);

test('every settings DOM id is namespaced to highway_3d_dev', async () => {
  const html = await readFile(settingsUrl, 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(ids.length > 90, 'expected the complete settings surface');
  assert.equal(new Set(ids).size, ids.length, 'settings ids must be unique within the panel');
  for (const id of ids) {
    assert.match(id, /^highway_3d_dev-/, `${id} is not namespaced to the plugin id`);
  }

  const references = [...html.matchAll(/\b(?:for|aria-labelledby|aria-describedby)="([^"]+)"/g)]
    .flatMap((match) => match[1].split(/\s+/));
  for (const reference of references) {
    assert.ok(ids.includes(reference), `settings reference ${reference} has no matching id`);
  }
  const highwayHeadings = [...html.matchAll(/<h3[^>]*>([^<]*3D Highway[^<]*)<\/h3>/g)]
    .map((match) => match[1]);
  assert.ok(highwayHeadings.length >= 8);
  for (const heading of highwayHeadings) assert.match(heading, /\(dev\)/);
});

test('settings persistence does not use bundled highway keys', async () => {
  const html = await readFile(settingsUrl, 'utf8');
  assert.doesNotMatch(html, /['"]h3d_bg_/);
  assert.doesNotMatch(html, /['"]highway_3d\.fretSpacing/);
  assert.doesNotMatch(html, /['"]viz3d_settings/);
  assert.match(html, /highway_3d_dev\.background\.style/);
  assert.match(html, /highway_3d_dev\.butterchurn\.settings/);
});

test('dev venue is plugin-owned and ships its own scene assets', async () => {
  const { BACKGROUND_STYLE_IDS } = await import('../src/settings/defaults.js');
  const {
    HIGHWAY_3D_DEV_VENUE_API,
    VENUE_SCENE_ASSET_BASE,
  } = await import('../src/background/venue.js');
  const { createBackgroundMount } = await import('../src/instance/background-mount.js');
  const { subscribeToSettings, unsubscribeFromSettings } = await import('../src/settings/store.js');
  const html = await readFile(settingsUrl, 'utf8');
  const realWindow = globalThis.window;
  const events = [];
  const listener = (key) => events.push(key);
  globalThis.window = {
    // If the dev implementation delegates to any bundled Venue helper, this
    // behavioral test fails at the call site rather than relying on source text.
    v3VenueInstrumentPov: { resolveVenueInstrumentPov() { throw new Error('bundled POV helper called'); } },
    v3VenueMoodFx: {
      venueMotionProfile() { throw new Error('bundled motion helper called'); },
      prefersReducedMotion() { throw new Error('bundled reduced-motion helper called'); },
    },
    matchMedia: () => ({ matches: false }),
  };

  assert.equal(BACKGROUND_STYLE_IDS.includes('venue'), false);
  assert.doesNotMatch(html, /<option value="venue">/);
  assert.equal(
    VENUE_SCENE_ASSET_BASE,
    '/api/plugins/highway_3d_dev/assets/venue/themes/small-club/',
  );
  for (const method of [
    'setActive', 'setMood', 'setBackdropVideo', 'setBackdropMix',
    'setInstrumentPov', 'setMotionMode', 'getState',
  ]) {
    assert.equal(typeof HIGHWAY_3D_DEV_VENUE_API[method], 'function');
  }

  HIGHWAY_3D_DEV_VENUE_API.setActive(false);
  subscribeToSettings(listener);
  try {
    const mount = createBackgroundMount({
      ctx: { settings: { bgStyleId: 'geometric' } },
    });
    assert.equal(mount.effectiveBackgroundStyleId(), 'geometric');

    HIGHWAY_3D_DEV_VENUE_API.setActive(true);
    HIGHWAY_3D_DEV_VENUE_API.setInstrumentPov('Bass');
    HIGHWAY_3D_DEV_VENUE_API.setMood('fire');
    HIGHWAY_3D_DEV_VENUE_API.setMotionMode('full');
    assert.equal(mount.effectiveBackgroundStyleId(), 'venue');
    assert.deepEqual(
      {
        active: HIGHWAY_3D_DEV_VENUE_API.getState().active,
        instrumentPov: HIGHWAY_3D_DEV_VENUE_API.getState().instrumentPov,
        mood: HIGHWAY_3D_DEV_VENUE_API.getState().mood,
        motionEffective: HIGHWAY_3D_DEV_VENUE_API.getState().motionEffective,
      },
      {
        active: true,
        instrumentPov: 'bass',
        mood: 'fire',
        motionEffective: 'full',
      },
    );

    HIGHWAY_3D_DEV_VENUE_API.setActive(false);
    assert.equal(mount.effectiveBackgroundStyleId(), 'geometric');
    assert.equal(HIGHWAY_3D_DEV_VENUE_API.getState().motionEffective, 'off');
    assert.deepEqual(events, ['venueScene', 'venueInstrumentPov', 'venueScene']);
  } finally {
    unsubscribeFromSettings(listener);
    HIGHWAY_3D_DEV_VENUE_API.setActive(false);
    HIGHWAY_3D_DEV_VENUE_API.setInstrumentPov('guitar');
    HIGHWAY_3D_DEV_VENUE_API.setMood('idle');
    HIGHWAY_3D_DEV_VENUE_API.setMotionMode('subtle');
    HIGHWAY_3D_DEV_VENUE_API.setBackdropVideo(0, null);
    HIGHWAY_3D_DEV_VENUE_API.setBackdropVideo(1, null);
    HIGHWAY_3D_DEV_VENUE_API.setBackdropMix(0);
    globalThis.window = realWindow;
  }

  await access(new URL('../assets/venue/themes/small-club/bg-plate.webp', import.meta.url));
  await access(new URL('../assets/venue/themes/small-club/guitar-pov-bg.webp', import.meta.url));
});

test('runtime DOM identity and aspect state are dev-namespaced', async () => {
  const [domSceneSource, aspectPanelSource, butterchurnPanelSource] = await Promise.all([
    readFile(domSceneUrl, 'utf8'),
    readFile(aspectPanelUrl, 'utf8'),
    readFile(butterchurnPanelUrl, 'utf8'),
  ]);
  assert.match(domSceneSource, /highway_3d_dev-wrap-/);
  assert.match(domSceneSource, /data-highway-3d-dev-primary/);
  assert.doesNotMatch(domSceneSource, /data-h3d-primary/);
  assert.match(aspectPanelSource, /__h3dDevAspectTune/);
  assert.doesNotMatch(aspectPanelSource, /__h3dAspectTune/);
  assert.match(butterchurnPanelSource, /DOM_ID_PREFIX/);
  assert.doesNotMatch(butterchurnPanelSource, /(?:id=["']|querySelector\(["']#)vz-/);
});

test('generated plugin CSS includes utilities used by the string-color editor', async () => {
  const pluginCss = await readFile(pluginCssUrl, 'utf8');
  assert.match(pluginCss, /\.text-amber-400\{/);
  assert.match(pluginCss, /\.text-gray-600\{/);
});

test('notedetect host-bus failures roll back without aborting renderer setup', async () => {
  const realWindow = globalThis.window;
  const realWarn = console.warn;
  const attempted = [];
  const removed = [];
  const windowEvents = [];
  globalThis.window = {
    addEventListener(name) { windowEvents.push(name); },
    feedBack: {
      on(name) {
        attempted.push(name);
        if (name === 'note:miss' || name === 'notedetect:skin') throw new Error('bus starting');
      },
      off(name) { removed.push(name); },
    },
  };
  console.warn = () => {};
  try {
    const { createNotedetectListeners } = await import(notedetectListenersUrl);
    let listeners;
    assert.doesNotThrow(() => {
      listeners = createNotedetectListeners({
        noteDetectHitMarks: [],
        noteDetectMissMarks: [],
        _fxElemSeen: new WeakSet(),
        NOTEDETECT_TIME_EPS: 0.01,
        NOTEDETECT_TTL_MS: 1000,
        _fxHandle() {},
        _fxResolvePalette() {},
        getFxGen: () => 0,
        getHighwayCanvas: () => null,
      });
    });
    assert.deepEqual(windowEvents, ['notedetect:hit', 'notedetect:miss', 'notedetect:fx']);
    assert.deepEqual(attempted, ['note:hit', 'note:miss', 'notedetect:skin']);
    assert.deepEqual(removed, ['note:miss', 'note:hit', 'notedetect:skin']);
    assert.equal(listeners.noteDetectOnBusHit, null);
    assert.equal(listeners.noteDetectOnBusMiss, null);
    assert.equal(listeners._fxOnSkin, null);
  } finally {
    console.warn = realWarn;
    globalThis.window = realWindow;
  }
});

test('a WebGL constructor failure mounts no wrapper and subscribes to no host events', async () => {
  const realWindow = globalThis.window;
  const realDocument = globalThis.document;
  const { __setThreeForTest } = await import('../src/core/three.js');
  const { createDomAndScene } = await import(domSceneUrl);
  let insertions = 0;
  let removals = 0;
  let subscriptions = 0;
  const wrap = {
    dataset: {},
    style: {},
    remove() { removals++; },
  };
  globalThis.document = {
    createElement() { return wrap; },
    querySelectorAll() { throw new Error('must not inspect mounted DOM'); },
  };
  globalThis.window = {
    feedBack: {
      on() { subscriptions++; },
      off() {},
    },
  };
  __setThreeForTest({
    WebGLRenderer: class WebGLRenderer {
      constructor() { throw new Error('WebGL unavailable'); }
    },
  });
  const canvas = {
    parentNode: { insertBefore() { insertions++; } },
    nextSibling: null,
  };
  try {
    assert.throws(() => createDomAndScene({
      _instanceId: 1,
      getHighwayCanvas: () => canvas,
      setHighwayCanvas() {},
      setCtxLost() {},
      butterchurnModeActive: () => false,
      applySize() {},
    }), /WebGL unavailable/);
    assert.equal(insertions, 0);
    assert.equal(subscriptions, 0);
    assert.equal(removals, 1);
  } finally {
    __setThreeForTest(null);
    globalThis.window = realWindow;
    globalThis.document = realDocument;
  }
});

test('dev-only controls do not reuse bundled highway keyboard bindings', async () => {
  const [shortcutsSource, butterchurnPanelSource, aspectPanelSource] = await Promise.all([
    readFile(shortcutsUrl, 'utf8'),
    readFile(butterchurnPanelUrl, 'utf8'),
    readFile(aspectPanelUrl, 'utf8'),
  ]);
  assert.match(shortcutsSource, /key: 'D'/);
  assert.match(shortcutsSource, /Shift\+D/);
  assert.doesNotMatch(shortcutsSource, /key: 'A'/);
  assert.doesNotMatch(butterchurnPanelSource, /addEventListener\('keydown'/);
  assert.doesNotMatch(butterchurnPanelSource, /e\.key !== '`'/);
  assert.match(aspectPanelSource, /Close \(Shift\+D\)/);
});

test('documentation describes this repository as the standalone dev plugin', async () => {
  const [readme, notice] = await Promise.all([
    readFile(readmeUrl, 'utf8'),
    readFile(noticeUrl, 'utf8'),
  ]);
  assert.match(readme, /standalone development fork/i);
  assert.match(readme, /plugins\/highway_3d_dev/);
  assert.doesNotMatch(readme, /ships \*\*bundled\*\*/i);
  assert.doesNotMatch(readme, /where it lives in `screen\.js`/);
  assert.match(notice, /plugins\/highway_3d_dev\/assets\/vendor/);
  assert.match(notice, /distinct[\s\S]*bundled `highway_3d`/);
});
