# 3D Highway Plugin — AI Maintainer Guide

This guide tells future AI assistants where each visual element lives, what controls it, and the gotchas to watch for. The goal is for small polishes (color tweaks, sizing, animation timing, add/remove a label) to land in the right place on the first try without grep spelunking.

The renderer is an **ES module graph** under `src/`, registered as `window.feedBackViz_highway_3d` (a feedBack#36 setRenderer factory). `screen.js` is now a single line — `import './src/main.js';` — and `plugin.json` declares `"scriptType": "module"` (needs `minHost` 0.3.0, which serves any `.js` under `<plugin>/src` via `GET /api/plugins/{id}/src/{path}`). No dependencies beyond Three.js, loaded from the vendored `/static/vendor/three/three.module.min.js` (pinned r170).

**Module rules** (from core's `docs/plugin-modules.md`):
- **Layering points downward**: `core → settings → bg/bc/audio/ui → globals → main`. `import-x/no-cycle` is an ESLint error.
- **`src/globals.js` is the ONLY writer of `window.*`** — every binding spelled out longhand, one line each, so `settings.html` and external callers stay greppable. Don't loop over an object to assign them.
- **No import-time side effects** — no `document` / `window` / `localStorage` reads at module top level, so `node --test` can real-import any module. The one lift is `initFretSpacing()`, called once from `main.js`.
- **Relative specifiers only** between `src/` files (`./`, `../`). The reload cache-buster is a *path* token (`/api/plugins/<id>/g/<n>/…`) that relative imports inherit and query strings do not.
- **Two naming worlds, and the boundary is load-bearing.** Module internals are named plainly (`readSetting`, `mountBackgroundStyle`, `createButterchurnController`). Three surfaces are *frozen* and keep their historical `Bg`/`Bc` spelling — renaming them breaks things silently, outside this repo:
  - **`window.h3dBgSet*` / `h3dVenue*` / `h3dBcApplySettings`.** `settings.html` calls them ~90 times, and **core itself** calls `h3dBgSetPalette` + `h3dBgSetStringColors` from `static/js/highway-colors.js`. Cross-repo contract.
  - **Every `localStorage` key** (`h3d_bg_*`, `viz3d_*`, `highway_3d.fretSpacing`, `h3d_aspect_tune2`). Renaming a key doesn't migrate it — it silently discards the user's saved preferences.
  - **DOM ids / CSS class names** (`viz3d-panel`, `vz-*`, `h3d-pc-reason`, and the `h3d-bg-*` ids the Settings-panel mirror looks up).

  So `settings/setters.js` exporting `h3dBgSetStyle` while `settings/store.js` exports `readSetting` is *deliberate*, not drift: the first is contract, the second is internal. When renaming, never rewrite an identifier that appears inside a string literal in `src/` — that's the tell that it's one of the frozen surfaces.
- **Only the declaring module may write an `export let`.** Importers get a live binding they can *read* reactively but not reassign. Where an outside caller needs to write, export a setter function instead — that's why `setFretUniform`, `nextInstanceId`, `nextPaneCounter`, `_venueSetScene*`, `setPrimaryController`, `teardownPresetPanel`, `resetButterchurnSettingsCache`, and `_resetAnalyserBridgeForTest` exist. ESLint's `no-undef` reliably catches the missing-import half of this; it does *not* catch a live-binding write, so watch for it by hand when moving code.

**Styling (feedBack `styles` capability).** This plugin owns its Tailwind CSS: it ships `assets/plugin.css` and declares `"styles": "assets/plugin.css"` in `plugin.json`, so core's prebuilt `static/tailwind.min.css` no longer scans it (it's excluded from core's content globs). The frontend injects `assets/plugin.css` as a `<link>` when the renderer activates. This is the one maintainer-time build step: after you add/change a Tailwind class under `src/` or in `settings.html`, run `bash build-tailwind.sh` (pinned `tailwindcss@3.4.19`, `corePlugins.preflight=false` — utilities only) and **bump the `version` in `plugin.json`** so the injected `<link>`'s `?v=` cache-buster fetches the fresh file. The generated `assets/plugin.css` is committed; end users never build. See [docs/plugin-styles.md](../../docs/plugin-styles.md).

> **Navigation note:** This guide references functions by name and uses the existing banner comments (`/* ── Scene initialisation ─ */`, etc.) as section anchors. Line numbers are deliberately avoided so this stays correct as the file evolves. Use `Grep` for the function name or banner text to jump to a section. Below, "in `main.js`" means `src/main.js`.

## File structure at a glance

```
screen.js                    1 line: import './src/main.js';
src/
  main.js                    boot + the still-monolithic createFactory() closure
  globals.js                 THE ONLY writer of window.* (59 names, longhand)
  core/
    three.js                 export let T (live binding); loadThree(); __setThreeForTest()
    constants.js             SCALE/K/NFRETS/geometry/camera/fog/notedetect/lane constants
    palette.js               PALETTES, S_COL, _customPalette, hex helpers, gem gradients
    render-order.js          RENDER_ORDER_LAYER_STACK, renderOrderForLayerAtZ
    fret-geometry.js         fretX/fretMid/dZ + spacing state + initFretSpacing()
    chart-util.js            resolveStringCount, tuning/pitch, anchors, computeBPM
    slide-ribbon.js          SLIDE_RIBBON_SAMPLES / _INDICES_ARR
    texture.js               _makeGaussTex
    splitscreen.js           splitscreenActive, splitscreenCanvasFocused
    instance-id.js           nextInstanceId()
  settings/
    defaults.js              CAMERA_MODE_IDS, SETTING_DEFAULTS, BACKGROUND_STYLE_IDS,
                             SCENE_THEMES + per-axis accessors
    store.js                 settingsPanelKey, freeCamFor, read/coerce/write, pub-sub bus
    setters.js               the 49 h3dBgSet* setters (named exports)
  audio/analyser.js          shared AudioContext/AnalyserNode tap, readAudioBands
  background/
    venue.js                 venue STATE + the 7 h3dVenue* setters
    backdrop.js              silhouette canvas + full-bleed backdrop-plane helpers
    styles/                  index.js + one file per BACKGROUND_STYLES entry (off/particles/
                             silhouettes/lights/geometric/venue/image/video)
  butterchurn/
    engine.js                lib load, desktop guitar PCM feed, WebGL ctx release
    prefs.js                 viz3d_settings blob + favorites/bans curation lists
    panel.js                 in-canvas preset browser panel + list pane
    controller.js            createButterchurnController (per-wrap controller)
  ui/
    aspect-panel.js          the __h3dAspect* debug panel
    shortcuts.js             _registerTunerShortcut
    player-chrome.js         the Background picker in the player's Plugin Controls popover
  instance/                  Stage 7 Track B/C/3e: per-instance createFactory() clusters, moved
                             out one feature at a time behind createX(deps)/{deps,frame,accum}
                             (see "Splitting `createFactory()`" below for the pattern)
    ctx.js                   createCtx(id) -- the shared per-instance object; grows group-by-
                             group, never speculatively. Groups: `cam` (camera pose, many
                             co-equal writers), `board` (fretboard/nut/headstock geometry +
                             materials, one writer/several readers), `settings` (all 52
                             loadSettings()-assigned values -- single writer per field, readers
                             independent per field, so this group landed as many small
                             batches rather than one ctx.cam-shaped commit; see CLAUDE's
                             "Settings" section below)
    settings-listener.js      createSettingsListener -- the live settings-bus subscriber;
                             outlives initScene(), reads ctx.settings.x / ctx.board.* directly
                             (a stable ctx reference), a few remaining live getters for genuine
                             main.js closure `let`s (fretG, _tuningLabelSprites) plus
                             background-mount.js's getBgState()
    background-mount.js       createBackgroundMount -- background-style mount/unmount/rebuild +
                             the two-axis scene-color theme applier (_applyBgTheme). bgState/
                             bgStage/bgMountedStyleId are private (own-it-outright); everything
                             else genuinely written elsewhere (scene/cam/ren/wrap/ambLight/
                             bgGroup/mLaneOdd/mLaneEven/bcCtrl/backgroundLastT) is live
                             getters/setters
    model/
      chord-inference.js     hand-shape/arpeggio inference, chord shape signatures
      math.js                pure helpers (effectiveVfov, vibratoSemisAtTime, darkenHex, ...)
      chord-diagram-tracking.js  chord-diagram entrance/crossfade state machine (7 fields
                             returned each call, main.js still owns the bare `let`s)
      arp-and-slide-prepasses.js  arpeggio-persist-key + slide-target-set pre-passes, the
                             arpeggio lane-rail authored-marker/bounds memoization cache, and
                             update()'s chord-merge (mergeHandShapeSynthChords) + arp-ghost-
                             infer (fillArpeggioGhostInferFlags) memoization caches -- all five
                             are the same chart-static-input-identity-memoization shape, bundled
                             into one file since none is big enough to warrant its own
      lookahead-math.js        5-fn lookahead-camera-mode pure math (lookaheadEndTime/
                             BootstrapTime/ComputeFretBounds/TargetWorldX/SmoothCamStep)
    render/
      text-sprites.js        txtMat() + TXT_STYLES + per-instance createTxtCache()
      tech-materials.js      technique-marker sprite materials (PM-X/FH-X icon textures)
      note.js                createNoteRenderer -- drawNote(), the single-note renderer
      chords.js               createChordRenderer -- the whole chord-body render loop
      single-notes.js          standalone-note render loop (chords.js's twin)
      arpeggio-lane-rail.js   arpeggio note-bracket lane rail rendering
      beat-and-section-labels.js  drawBeatLines / drawSectionLabels
      finalize-instanced-meshes.js  the "commit IM batches" step, must run last
      highway-lane.js          anchor/active-frets highway lane + fret-boundary ext lines
      fret-column-markers.js   periodic fret-number-wave reference markers
      camera-target.js         classic/lookahead camera-target resolution (writes ctx.cam)
      fret-number-row.js       heat-coloured fret-number row under the board
      fret-wire-hit-flash.js   fret-wire anchor highlight (baseline) + hit-flash (lerp on top)
      camera-bootstrap.js      song-change detection + first-chart-data camera bootstrap
      note-state.js            per-frame noteState (sustain/anticipation/fretHeat/strGlow)
                             build + updateStringHighlights()
      lookahead-prepasses.js   next-note/recent-event-by-string lookahead, sorted event-time
                             union, ghost-preview gap prepass, strGlow ramp + accent glow
      hit-sparks.js            hit-spark (#3) particle system: construction + sparkBurst()/
                             sparkUpdate()
      bloom-composer.js        #4 bloom EffectComposer -- lazy async postprocessing import +
                             per-frame resize check
      note-camera-targets.js   steady-mode camera-distance/X-target resolver
                             (applyNoteCamTargets, writes ctx.cam)
      score-fx.js              Score FX (notedetect game-scoring layer) -- "+N" pops, milestone
                             bursts, multiplier ring-pulses; drawNotedetectLabels too
      material-retint.js       live palette/vibrancy/glow material-retint passes
                             (applyPaletteToMaterials/recolorGemGradients/applyVibrancy/
                             applyGlow) -- every material-array dep is a live getter, since
                             this factory is constructed before createNoteGemVisuals() (which
                             takes recolorGemGradients as its own construction-time dep) runs
    geometry/                 initScene() feature clusters -- construction-time only,
                              verified via whole-file bare-reassignment grep, no `ctx` needed
      note-gem-visuals.js      note/gem geometry + every gem/outline/sustain material
      note-gem-pools.js        note/sustain/slide-ribbon object pools (pairs with the above)
      technique-instanced-meshes.js  IM scratch objects + PM-X/FH-X technique-marker IMs
      sustain-rail.js           sustain rail (core+bloom) + technique-marker plane pool
      lane-and-labels.js        lane dividers, fret-column marker pool, highway lane plane
      tap-chevron-and-label-pools.js  tap-chevron material + label/beat/section pools
      chord-accent-visuals.js   chord-frame gradient textures + PM/FH strum X-mark visuals
      dom-and-scene.js          highwayCanvas/_ctxLost live getter-setter pair (long-lived
                             visibility/canvas-replaced listeners, outlive initScene())
      nut-headstock.js          guitar nut + headstock geometry, called from buildBoard() on
                             every rebuild (palette/theme/lefty/nStr changes), not just init
      fret-markers.js           fret wires (shared TubeGeometry) + fret dots + fret inlay
                             number labels, also called from buildBoard() on every rebuild
    overlay/                  2D-canvas overlay renderers, each `(ctx, opts)`
      chord-diagram.js         drawChordDiagram() -- top-left chord fingering diagram, plus
                             createChordDiagramCache() -- the OffscreenCanvas render-cache
                             wrapper around it (module-instance singleton, no per-init deps)
      lyrics.js                 drawLyrics() -- top-centre syllable-highlighted lyrics
      huds.js                   drawSectionHud() / drawToneHud()
    notedetect/
      listeners.js              createNotedetectListeners -- hit/miss + Score FX event binding
```

`src/main.js` is down to ~3,809 lines (from an original 12,388 -- 69% reduction): a boot preamble (imports, `initFretSpacing()`, `installGlobals()`, the `h3dBcApplySettings` / `h3dSetFretSpacing` window hooks) followed by `createFactory()` — the per-instance renderer, still mid-decomposition and carrying a documented `max-lines` exemption until it drops under 1,500 lines. Its internals are laid out as:

- Per-instance state (Three.js refs, pools, camera state, lifecycle flags)
- `initScene()` — one-time WebGL setup: scene, camera, lights, materials, pools, the ~20
  `createX(deps)` construction calls for the modules above
- `loadSettings()` — reads all 52 settings into `ctx.settings.x` (see "Settings" below)
- `buildBoard()` — static fretboard geometry: fretboard plane + string meshes inline, delegates
  nut/headstock to `nutHeadstockBuilder` and fret wires/dots/inlay labels to `fretMarkersBuilder`
- `_applyCinematic()` — live cinematic-mode toggle fired by the settings listener; the four
  palette/vibrancy/glow retint passes it used to sit alongside now live in `materialRetint`
  (`instance/render/material-retint.js`, called as `materialRetint.applyX()` — `_applyBgTheme()`
  is the same "live retint, not full rebuild" idea but lives in `backgroundMount`)
- `update(bundle)` — the big per-frame function: ~515 lines of chart-static memoization
  (delegated to `arpAndSlidePrepasses`), camera-target wiring, `_noteFrame` snapshot assembly,
  and the ~15 `moduleX.drawY(...)` call sites that replaced what used to be inline code (each
  call site names the module it delegates to)
- `drawArpBrackets()` — arpeggio bracket drawing helper, called from both chords.js and
  single-notes.js
- `camUpdate()` — smooth camera lerp + self-correcting NDC look-at (writes `ctx.cam`)
- `applySize()` — DPR + canvas size + aspect clamping (writes `ctx.cam`)
- `teardown()` — dispose all GPU resources + reset state
- `canvasSize()` — resilient canvas-dimension lookup
- **Returned API** — `init / draw / resize / destroy` (setRenderer contract)

### Settings (`ctx.settings`)

Every setting `loadSettings()` reads (via `readSetting(panelKey, 'key')`) is assigned to a
property on `ctx.settings` — e.g. `ctx.settings.glowMul`, `ctx.settings.cameraMode`,
`ctx.settings.activePalette` — not a bare closure `let`. This is Stage 7 Track 3e, landed as 7
independently-verified batches (see the plan file's "3e" section for the full batch table and
commit SHAs) rather than one big commit, because each setting's consumer function(s) are
independent of every other setting's — unlike `ctx.cam`, there was no mutual-coupling forcing a
single atomic migration. When adding a NEW setting: add it to `SETTING_DEFAULTS`
([settings/defaults.js](src/settings/defaults.js)) as always, then add a matching field to
`ctx.js`'s `settings` group (default value from `SETTING_DEFAULTS`), write it in `loadSettings()`
as `ctx.settings.x = readSetting(panelKey, 'x')`, and read it as `ctx.settings.x` everywhere —
never reintroduce a bare closure `let` for a settings-driven value.

## Coordinate system

- **+X** runs along the fretboard (low frets → high frets, `fretX(f)` and `fretMid(f)`).
- **+Y** is up (string Y is `sY(s)`, low strings have lower Y when not inverted).
- **+Z** is toward the camera. Notes spawn at negative Z and approach Z=0 (the hit line). Past notes would be at positive Z, but `noteZ` is clamped via `Math.min(0, dZ(dt))` in `drawNote()` so they stop at the string plane.
- **Camera** sits at roughly `(curX + 20*K, h*0.95, dist*0.75)` — positive Z, slightly above and behind the play line, looking toward `(curX, curLookY, -FOCUS_D * 0.35)`.

`dZ(dt) = -dt * TS` — the closer to "now," the closer to Z=0. `TS = 200*K` is the world-units-per-second scroll rate.

## The K scale and why everything is multiplied by it

`SCALE = 2.25`, `K = SCALE / 300 ≈ 0.0075`. **Almost every world-space dimension is expressed as `N * K`** so the whole scene scales as one unit. Tweaking `SCALE` alone resizes the entire highway. If you change a literal world dimension, write it as `N * K` to keep it consistent — naked numeric literals in Three.js geometry creation calls (e.g. inside `BoxGeometry`) are an obvious smell.

Concrete sizes (all live in [core/constants.js](src/core/constants.js)):

| Const | Value (world units) | Meaning |
|---|---|---|
| `STR_THICK` | `0.25 * K` | String thickness |
| `S_BASE` / `S_GAP` | `3 * K` / `4 * K` | Lowest-string Y / inter-string gap |
| `NW`, `NH`, `ND` | `5 * K`, `3 * K`, `0.5 * K` | Note width / height / depth |
| `TS` | `200 * K` | Scroll speed (world units per second) |
| `AHEAD` / `BEHIND` | `3.0` / `0.5` | Seconds visible ahead / behind hit line |
| `CAM_DIST_BASE` / `CAM_H_BASE` | `240 * K` / `150 * K` | Reference camera distance / height |
| `FOG_START` / `FOG_END` | `200 * K` / `670 * K` | Fog kicks in past hit line, swallows by the horizon |

## "I want to change X" — quick lookup

Each entry names the function or banner you should grep for, plus key sub-blocks (also marked with banner comments inside the function).

### Strings
- **String colors** → `S_COL` array in [core/palette.js](src/core/palette.js). Eight-element vibrant palette; index `s` is the string (0 = high E for guitar). `MAX_RENDER_STRINGS` keys off `S_COL.length`.
- **String count for the active arrangement** → `resolveStringCount(bundle)` in [core/chart-util.js](src/core/chart-util.js). Reads `bundle.stringCount` (feedBack#93) with a `bass`-name fallback. Don't reintroduce `tuning.length` — see Pitfall #4.
- **String thickness / gap / base Y** → `STR_THICK`, `S_BASE`, `S_GAP` in [core/constants.js](src/core/constants.js).
- **String-to-Y mapping (respects invert)** → the `sY(s)` arrow function inside `createFactory()`. Single source of truth for "where on Y is string s."
- **Static string mesh creation** → `buildBoard()`, the `// Thin Line strings (glow layer)` and `// BoxGeometry strings — emissive glow ...` comment blocks. Two layers: low-opacity `Line` for soft glow, `BoxGeometry` mesh per string with its own material clone (kept in `stringLines[]` for live emissive updates).
- **Live string glow / pulse** → `updateStringHighlights(noteState)`. Tunables: `BASE_GLOW`, `MAX_GLOW`, `IDLE_OP`. Driven by `noteState.stringSustain` and `noteState.stringAnticipation`.

### Fretboard
- **Fret count** → `NFRETS` in [core/constants.js](src/core/constants.js). Increasing requires nothing else.
- **Fret X positioning** → `fretX(f)` and `fretMid(f)` in [core/fret-geometry.js](src/core/fret-geometry.js). Logarithmic guitar-fret spacing within `SCALE`.
- **Fretboard plane / fret wires / fret dots** → `buildBoard()`, separate banner-style comment blocks (`// Fret wires`, `// Fret dots`). The dark background plane is the first thing built; main fret wires use `0xbbbbff` / opacity 0.8, minor wires `0x666688` / opacity 0.4. Single/double dots: `DOTS` array + `DDOTS` set in [core/constants.js](src/core/constants.js).
- **Fret-row label colors / sizing** (the heat-coloured row of fret numbers below the board) → `update()`, `// ── Dynamic fret number row ──` block. Active = `#ffe84d`, inactive = `#9ab8cc`, opacity / scale driven by `noteState.fretHeat[f]`. Text rendering (font, outline, shadow) is governed by the `'fretRow'` preset in `TXT_STYLES` — see "Tweaking text-sprite styling".
- **Active-fret cooldown** → `FRET_COOLDOWN` in [core/constants.js](src/core/constants.js). How long after the last note in a fret it stays in the active set.

### Notes
- **Single-note rendering** → `drawNote()`. Handles outline, core body, open-string variant, sustain trail, lane drop line, all technique labels, fret connector label, and the board projection. Each visual block has its own banner comment (`// ── Outline ──`, `// ── Core (filled note body) ──`, `// ── Sustain trail ──`, `// ── Lane drop line ──`, `// ── Technique labels ──`, `// ── Per-note fret connector label ──`, `// ── Board projection ──`).
- **Note geometry / size** → `gNote = new T.BoxGeometry(NW, NH, ND)` in `initScene()`. Per-note scale tweaks happen inside `drawNote()`.
- **Note approach rotation (vertical → horizontal)** → search `approachRot` inside `drawNote()`. Maps `dt / AHEAD` to `[0, π/2]`. Open strings skip the rotation.
- **Note color** → `mStr[s]` (idle) / `mGlow[s]` (hit), built in `initScene()`. Hit material is white-with-emissive, idle is dim emissive of the string color.
- **Sustain trail** → `// ── Sustain trail ──` block in `drawNote()`. Geometry: scaled `gSus` (`BoxGeometry(1,1,1)`). Width `NW * 0.85`, height `NH * 0.12`. Outline mesh + colored core mesh.
- **Lane drop line** → `// ── Lane drop line ──` block in `drawNote()`. Vertical line from each upcoming note down to the fretboard plane in the string's color.
- **Per-note fret connector label** → `// ── Per-note fret connector label ──` block in `drawNote()`. Number below the board with a thin line up to the note. Be careful with `replace_all` on the `0.5` and `0.4` floats in the alpha formula — they're separate constants. Uses the `'noteFret'` preset in `TXT_STYLES` (also applied to the on-body fret number when `showFretOnNote` is enabled).
- **Technique markers** (bend, slide, hammer/pull/tap, accent, tremolo, palm-mute, pinch harmonic) → `// ── Technique labels ──` block in `drawNote()`. Most are small if-blocks using `txtMat(text, color, wide, style)` (cached sprite material; `'technique'` preset in `TXT_STYLES`). Exceptions: a **bend** draws a string-coloured chevron strength stack (`bendChevronMat`, one chevron per half-step), and **hammer-on / pull-off** draw a white ▲/▼ triangle with a string-coloured border (`triMat`) — both pinned to the gem; the bend ribbon's up→hold→down contour is driven by `bendSemisAtTime`.
- **Open-string note** → special-cased throughout `drawNote()`: `n.f === 0`. Wider/flatter geometry, "0" label sprite, uses `openX` (the chord's open-string centroid) when supplied.
- **Board projection ("ghost" preview)** → `// ── Board projection ──` block in `drawNote()`. Two meshes per string (`projMeshArr`, `projGlowArr`), one visible per frame for the next note. Linger window `PROJ_WIN`. Gated on the `projectionVisible` setting (SETTING_DEFAULTS / `h3dBgSetProjectionVisible` / the "Show note preview on the fretboard" checkbox in `settings.html`) — when off, the block is skipped and `update()`'s per-frame `m.visible = false` reset leaves the ghost hidden. **The glow has `renderOrder = -1`** which fights the strings — see Pitfall #6.
- **Note-hit "sizzle" (feedBack#254)** → `drawNotedetectSizzle()` (called from the `lyricsCtx` block in `draw()`, just before `drawNotedetectLabels()`). For each confirmed hit/active note (`noteDetectGood` in `drawNote()` pushes `{x, y, z, s, alpha, color}` onto the per-frame `noteDetectSizzle` array — `alpha` is the provider's clamped fade, `color` an optional palette override), it projects the note's world point through the up-to-date `cam`, sizes the burst from a fretboard-X-axis offset projection (reliable even when the note's rotated flat at the line), and twinkles a few short crackling ellipse-arc segments + tiny dots hugging the note's rectangle — re-randomised every frame, contained to ≲1.4× the note, half white / half the string colour (or the provider's `color` when given). Every dot/arc's `globalAlpha` and `shadowBlur` are scaled by the entry's `alpha`, and the per-element "off-this-frame" probability rises as `alpha` decays, so a struck-note glow visibly thins and fades. Also: `noteDetectGood` swaps the note's outline to `mGlow[s]` (bright string-tinted, not green). Knobs are inline: arc/dot count, base on-probability, line widths, `shadowBlur`, spread radii. Lives entirely on the 2D overlay layer — no Three.js geometry/disposal.

### Chords
- **Chord rendering loop** → `update()`, `// ── Chords ──` block. Iterates `bundle.chords`, calls `drawNote()` per chord-note, then draws the frame box, name label, and barre indicator.
- **Chord linger after hit** → the `0.55`-second value passed as the `linger` arg to `drawNote()` from inside the chord loop, and used in the chord-frame Z clamp + opacity formulas.
- **Chord frame-box** (rectangle around frets in the chord) → inside the chord loop, search for the `drawEdge` helper. Four edges + a low-opacity fill. `isRepeat` halves the height + dims it.
- **Chord name label (gold)** → in the same chord loop, search `chordName`. Cached via `txtMat(chordName, '#e8d080', true)`. Anchored above the chord box.
- **Barre indicator** (white vertical line at the barre fret during linger) → in the chord loop, gated on `/barre/i.test(chordName) && chDt <= 0`. Position is `fretMid(bFret)` where `bFret` is the lowest fretted string.
- **Repeat-chord detection** → `prevChordSig` / `prevChordTime` inside the chord loop. Same shape within 0.5 s → `isRepeat = true` (suppresses note bodies, dims frame).
- **Chord diagram (top-left 2D overlay)** → `drawChordDiagram()`, called from the `lyricsCtx` block at the bottom of the returned `draw()`. The chord-to-display is selected in `update()` under `// ── Chord diagram: track most recently hit chord ──` and stashed in `_diagChord` (most recently hit named chord within the 0.55 s linger window).

### Camera
- **Reference values** → `CAM_H_BASE`, `CAM_DIST_BASE`, `REF_ASPECT`, `FOCUS_D`, `CAM_LERP_BASE` in [core/constants.js](src/core/constants.js).
- **Smooth lerp + look-at** → `camUpdate()`. BPM-scaled lerp speed (`CAM_LERP_BASE * bpm/120`).
- **Self-correcting framing** → bottom half of `camUpdate()`. Projects the fretboard mid-Y to NDC, nudges `tgtLookY` until that point sits at NDC Y ≈ `DESIRED_NDC_Y` (lower third of frame). This is what lets the camera adapt automatically to ultra-wide split-screen panels.
- **Aspect compensation** → `aspectScale = Math.max(1, REF_ASPECT / Math.max(cam.aspect, 0.5))` in `applySize()`. Clamped to ≥ 1 so wide panels keep baseline depth (don't dolly in flat). Removing the `Math.max(1, …)` is the bug we already fixed; don't reintroduce it.

### Beats and sections
- **Beat lines** (downbeats highlighted) → `update()`, `// ── Beat lines ──` block. `mBeatM` (full opacity 0.25) for measure starts, `mBeatQ` (0.07) for other beats.
- **Section labels** → `update()`, `// ── Section labels ──` block. Cyan (`#00cccc`) sprite at fret 12, above the highest string.

### Scene colors (two independent axes: Background + Highway)
- **Scene-color themes** → `SCENE_THEMES` table in [settings/defaults.js](src/settings/defaults.js). One combined table is the single source of truth, but it drives **two independent axes that share the same id-set**:
  - **Background axis** — setting key `bgTheme`, setter `window.h3dBgSetBgTheme`, state `bgThemeId`. Owns `clear` (WebGL clear color) + `fog`.
  - **Highway axis** — setting key `hwTheme`, setter `window.h3dBgSetHwTheme`, state `hwThemeId`. Owns `board` (fretboard/highway-surface plane) + optional `lane`/`laneDim` (the lit lane strip).
  Any background id can mix with any highway id; picking the same id in both gives the original "matched" look. Per-axis accessors are `backgroundAxisColors(id)` / `highwayAxisColors(id)` (both alias `sceneThemeColors`). Both axes default to `'default'` (byte-identical to the original look).
- **Applying a theme** → `_applyBgTheme()`. Background half sets clear+fog from `bgThemeId` (skipped under the venue scene); highway half sets the board plane + lane materials (`mLaneOdd`/`mLaneEven`) from `hwThemeId`. Re-run on init, `buildBoard()`, and the settings listener (which fires for **both** `bgTheme` and `hwTheme`), so changing either dropdown retints only its half live.
- **Backward-compat migration** → `loadSettings()`: the first time it loads with no stored `hwTheme` (`hasStoredSetting` false), it seeds `hwThemeId` from `bgThemeId` **and persists `hwTheme` once** (a one-time backfill, written without `emitSettingChange`). So a pre-split single-`bgTheme` pick is byte-identical right after the upgrade, and from then on the two axes are fully independent — changing the Background dropdown never drags the Highway surface, and the settings UI's Highway value can't disagree with what's rendered. settings.html shows the same first-load value via `storedHwTheme == null ? bgTheme : coerceHwTheme(...)`.
- **Adding/removing a theme** → edit `SCENE_THEMES` (the colors) AND `settings.html`'s `SCENE_THEMES` array (the `{id,label}` list — the single source the two dropdowns' `<option>`s and the `VALID_SCENE_THEMES` validator are both generated from). Keep the two id-sets aligned.

### Highway lane (the highlighted strip under active frets)
- **Lane drawing** → `update()`, `// ── Dynamic highway lane ──` block. `pLane` is a single quad on the fretboard plane; `pLaneDivider` is thin vertical lines at each fret inside the lane. Width keys off the active-fret range; min width ≈ 4 frets.
- **Lane intensity** → `highwayIntensity` accumulated from upcoming notes (further notes dim it, near notes light it).
- **Lane color** → the lit quad color is `mLaneOdd.color` (stock `HIGHWAY_LANE_STRIPE_ODD_HEX = 0x103B5C`), the dimmer alternating row `mLaneEven.color` (`HIGHWAY_LANE_STRIPE_EVEN_HEX = 0x08283C`). These are now **theme-aware**: `_applyBgTheme()` recolors them from the active HIGHWAY theme's optional `lane`/`laneDim` fields, falling back to the stock hexes when a highway theme omits them. (`_laneTargetColor`, set in `initScene()`, is kept in sync with the lit color but has no live consumer today.)

### Background scenery (the fog-band ambience behind the highway)
- **A background style's build/update/teardown** → one file per entry under [background/styles/](src/background/styles/), assembled in [styles/index.js](src/background/styles/index.js). Each is a self-contained `{build(scene, settings), update(s, bands, dt, t), teardown(s)}` triple with no cross-entry references, so a style change touches exactly one file.
- **Adding a style** → new file in `background/styles/`, register it in `styles/index.js`, add the id to `BACKGROUND_STYLE_IDS` in [settings/defaults.js](src/settings/defaults.js), add a `STYLE_SETTING_USES` row in [ui/player-chrome.js](src/ui/player-chrome.js) (says which of intensity/reactive the style actually consumes — a missing row defaults to both-enabled), and add the `<option>` in `settings.html`. **Don't derive `BACKGROUND_STYLE_IDS` from `Object.keys(BACKGROUND_STYLES)`** — the asymmetry is load-bearing (see Pitfall #12).
- **Audio bands (`bass`/`mid`/`treble`) that drive reactive styles** → `readAudioBands()` in [audio/analyser.js](src/audio/analyser.js). Prefers the stems plugin's side-chain analyser, else the shared `#audio` tap; returns the frozen `ZERO_AUDIO_BANDS` when reactivity is off or no analyser is available. The 5 ms bands cache is what keeps 4-up splitscreen at one FFT read per frame rather than four.
- **Backdrop-plane helpers** (the full-bleed camera-tracking plane the image/video/venue styles all mount) → `fitBackdropPlane` / `coverCropTexture` / `BACKDROP_DISTANCE` in [bg/backdrop.js](src/background/backdrop.js), along with the shared procedural silhouette bitmap.
- **Venue mode** is split in two on purpose: [bg/venue.js](src/background/venue.js) owns the STATE + the `h3dVenue*` setters (and the `_venueSetScene*` writers that let the renderer half write it); [background/styles/venue.js](src/background/styles/venue.js) is the renderer half. `venue` is deliberately absent from `BACKGROUND_STYLE_IDS` — it's an internal effective style reached only via the viz-picker flow.

### Butterchurn visualizer (`bc/`)
- **The per-wrap controller** (`createButterchurnController`) → [bc/controller.js](src/butterchurn/controller.js). Builds the layered DOM behind the transparent highway (backdrop → bc canvas → tint → scrim), owns preset cycling, and reuses the highway's shared analyser rather than opening a second `createMediaElementSource` on `#audio`.
- **Preset browser panel / list pane** → [bc/panel.js](src/butterchurn/panel.js). A module singleton that follows whichever highway is on-screen — per-instance copies would spawn one pane per splitscreen panel. `setPrimaryController` / `teardownPresetPanel` exist so the controller can drive it across the module boundary.
- **Settings + favorites/bans** → [bc/prefs.js](src/butterchurn/prefs.js) (`viz3d_settings`, `viz3d_favorites`, `viz3d_banned`, `viz3d_seeded`). `window.h3dBcApplySettings` (in main.js) drops the cache via `resetButterchurnSettingsCache()` and re-applies to every live controller.
- **Library loading + the desktop guitar PCM feed** → [bc/engine.js](src/butterchurn/engine.js). Note `butterchurn` is a *mode*, not a `BACKGROUND_STYLES` entry — only its fog-scenery half falls through to `BACKGROUND_STYLES.off`.

### Lyrics & overlays
- **Lyrics overlay** → `drawLyrics()`. 2D canvas, top centre, semi-transparent rounded background, syllable-level highlighting (current syllable in white, played in muted, upcoming in dim).
- **Chord diagram overlay** → `drawChordDiagram()` (see "Chords" above). 2D canvas, top-left, fades over the 0.55 s linger window. Respects `inverted` (column 0 is high-e when inverted, low-E otherwise).
- **The `lyricsCanvas`** is created in `initScene()` with `z-index:1`, appended to `wrap` **after** `ren.domElement` — this is the empirically-correct stacking order for all browsers/contexts (including splitscreen panels with `position:relative; overflow:hidden`). Don't reorder; see Pitfall #5.

### Splitscreen
- **Focus dim** → `_isFocused` flag, manipulated by `_updateFocusState()`. Fades ambient + directional light intensity in non-focused panels.
- **Per-panel resize fallback** → search `_lastHwW` in the returned `draw()`. The renderer self-detects when the highway canvas backing-store dimensions change and re-runs `applySize()`. Needed because the splitscreen plugin overrides `hw.resize` and never calls `renderer.resize()`.
- **Reduced DPR in split** → `applySize()` clamps DPR to 1.25 when splitscreen is active vs 2 otherwise (search `baseDPR`). Keeps four-panel quad layout from melting GPUs.

### Splitscreen panel controls/settings
- Per-panel background overrides use `localStorage` keys shaped as `h3d_bg_panel<N>_<key>`. When present, they override the global `h3d_bg_<key>` value for panel `N`; when absent, the global value still applies.
- Keep per-panel keys to `SETTING_DEFAULTS` entries that `loadSettings()` reads. Do not add panel-only keys outside that load path.
- `panelControls` is a static, host-readable, curated descriptor list for controls a host can expose per panel. It documents the supported per-panel surface; the renderer still loads values through `loadSettings()`.
- Asset/background image keys remain global-only. Do not make uploaded or selected asset references panel-scoped unless that contract is explicitly widened.
- Host refresh nudges that call toggle setters must pass real booleans, not strings such as `'false'`, so setters can distinguish `true` from `false`.

## The `bundle` object

Every per-frame renderer call receives a `bundle` from feedBack core. Fields used by this plugin:

- `currentTime` — playback time in seconds (drives `dt` for everything)
- `notes`, `chords`, `beats`, `sections` — chart arrays (already difficulty-filtered by core)
- `chordTemplates` — array indexed by `ch.id`; each `{ name, frets: [N] }`
- `lyrics` — syllable array `[{ w, t, d }, …]`
- `inverted` — display flag honored via `sY(s)` (low-string-on-top vs the default low-string-on-bottom)
- `lyricsVisible` — gate for lyrics overlay
- `renderScale` — pixel-ratio multiplier from the user's quality setting
- `songInfo.arrangement` — only field of `songInfo` this plugin reads, used as the bass-name fallback in `resolveStringCount()`
- `stringCount` — feedBack#93; always prefer this over deriving from tuning/arrangement
- `lefty` — display flag consumed by this renderer from `bundle.lefty`. Captured into `_leftyCached` before each frame so `xFret()`, `xFretMid()`, `boardSpanX()`, board geometry, note placement, and the camera shoulder offset mirror the fret axis for left-handed mode. A runtime lefty flip rebuilds board state and mirrors `curX`/`tgtX` plus the lookahead camera X cache so the camera does not drift across the neck.
- `getNoteState(note, chartTime)` — feedBack#254; per-note judgment from a scorer (note_detect). Captured each frame into `noteDetectGetState` at the top of `update()` and consulted in `drawNote()` AFTER the event-driven `noteDetectHitMarks`/`noteDetectMissMarks` lookup AND over the proximity-based `hit` heuristic, both of which it overrides when it has a verdict: `'hit'`/`'active'` → `mGlow[s]` outline (bright string-tinted, *not* green) + `mGlow[s]` body + `mGlow[s]` sustain trail + a queue entry for `drawNotedetectSizzle` (so a held sustain keeps glowing/sparkling as long as the provider keeps returning `'active'`); `'miss'` → `mMissOutline` and `_showHit = false` (suppresses the bright body even if the note is near the line). Called with the note's chart time (`n.t`), which is how note_detect keys its `noteResults` map — *not* `now`. Returns null on cores without the API or songs with no scorer — then the event path / `hit` heuristic drive feedback for older note_detect builds. **notedetect ≥1.13 object verdicts additionally carry `{ points, mult, popKey }`** (game-scoring layer): `points` is the note's awarded score, `mult` the multiplier tier it landed at, and `popKey` a dedup key — chord members all return the chord-level judgment's key so a chord pops once, not once per gem. Consumed by the score-pop spawn in `drawNote()` (see Score FX below); all three are absent on older notedetect builds, so guard with `!== undefined`.

`tuning` and `capo` feed only the nut's open-string pitch labels. They prefer the bundle's effective values; `songInfo` remains the original metadata fallback. Note placement never reads them.

Core reuses the bundle OBJECT across frames (mutated in place); never cache it or compare its identity between frames — field values are only valid for the current draw call. Field-identity caches on ARRAY fields (this plugin's `_mergeCacheChordsRef === bundle.chords` etc.) remain valid: arrays still swap reference when chart data changes. Core also exposes `bundle.lowerBoundT(arr, time)` (lower-bound on `.t`, notes/chords) and `bundle.lowerBoundTime(arr, time)` (on `.time`, beats/anchors/sections) — prefer these over the local `lowerBoundT` helper when a downlevel-host fallback isn't needed.

### Score FX (notedetect game-scoring layer)

- **"+N" score pops** → `_fxSpawnPop()` from `drawNote()` (just after the provider verdict-override block), drawn by `drawScoreFx()` (called from the `lyricsCtx` block in `draw()`, right after `drawNotedetectLabels()`). Fixed 24-slot pool (`_fxPops`), deduped per `popKey` via the TTL'd `_fxSeen` map (pruned in `drawScoreFx`). Pops rise/fade over 700 ms; font size scales with the multiplier tier.
- **Session FX** → `notedetect:fx` events (`{ fxType: 'multiplier'|'milestone'|'streakBreak', ... }`). notedetect dispatches each detail object twice in the same task: on `window` (unscoped, first) and as a bubbling CustomEvent from its per-panel instanceRoot (scoped, second). The listener (`_fxOnFx`, bound with the other notedetect listeners) treats element-targeted copies as authoritative — accepted only when their root lives in this panel's container — and **defers the window copy by a task** (`setTimeout 0`): if the element copy (same detail reference) arrived meanwhile it's dropped as a duplicate, otherwise it's the compat fallback for a detector whose root isn't in the DOM. This keeps splitscreen panels from rendering each other's FX even for the first event of a session. Effects: milestone → particle burst from a 4-slot Float32Array pool (`_fxBursts`), multiplier tier-up → expanding ring pulse at the strike-line centre. **`streakBreak` is deliberately unhandled** — it used to paint a translucent red wash over the whole panel for 350 ms, on top of the notes the player was reading; that effect was deleted outright and the event is now ignored. Don't reintroduce a full-panel fill in `drawScoreFx`. The other streak feedback (hit-heat spark escalation, gated on `_streakFx` in `drawNote()`) is unaffected, which is what the `streakFx` setting still controls.
- **Skin palette** → `_fxResolvePalette()` reads `localStorage['feedBack_notedetect_skin']` (`neon`/`esports`/`metal` → `_FX_PALETTES`) at listener-bind time and on the `notedetect:skin` bus event. The display fonts are document-loaded by notedetect's stylesheet, so the overlay canvas can reference the family names directly.
- Everything lives on the 2D overlay layer — no Three.js geometry, no `txtMat()` cache traffic, nothing to dispose; `teardown()` deactivates the pools and removes both listeners.
- **This block is the reference implementation for other renderer plugins** (drum highway, piano, custom highways) that want score pops / session FX: copy the `_fxOnFx` dedup+scoping listener, the `popKey`-keyed seen-map (cleared on backward seek), and the `_FX_PALETTES` skin mapping. The full consumer contract (events, payloads, provider verdict fields, theming variables) is documented in feedBack-plugin-notedetect's `CLAUDE.md`.

If you need a bundle field that isn't here yet, check `_makeBundle()` in `static/highway.js` in the **feedBack core repo** — this is the plugin repo, `static/highway.js` is not here. The full path in the parent feedBack checkout is `feedBack/static/highway.js`.

## Per-string state arrays

Several frame-local arrays are sized to `nStr`:

```js
const noteState = {
    stringSustain:    new Array(nStr).fill(false),
    stringAnticipation: new Array(nStr).fill(0),
    fretHeat:         new Array(NFRETS + 1).fill(0),
    strGlow:          new Array(nStr).fill(0.5),
};
```

Anything that indexes a per-string array MUST be guarded by `validString(s)`. The function checks that `s` is an integer in `[0, nStr)` (returning `false` otherwise so the caller can skip), warns once when an out-of-range index is seen, and keeps the `mStr / mGlow / mSus / projMeshArr` lookups safe. It does NOT clamp — out-of-range strings are dropped, not silently mapped to a valid one. `filterValidNotes(notes)` is the chord-note equivalent (allocates only when something would actually be dropped).

## Object pools

Pools live as closure refs (`pNote`, `pSus`, `pLbl`, `pBeat`, `pSec`, `pFretLbl`, `pLane`, `pLaneDivider`, `pChordBox`, `pChordLbl`, `pBarreLine`, `pNoteFretLabel`, `pConnectorLine`, `pDropLine`, `pSusOutline`).

The pool factory `pool(parent, mk)` returns `{ get(), reset() }`. **Every pool MUST be `.reset()`-ed at the top of `update()`** — otherwise objects from the previous frame stay visible. When you add a new pool, add the reset call too. Search for the existing block of `.reset()` calls at the top of `update()` to find where to add yours.

If a pool's mesh has per-instance state (its own material clone, its own texture map), set those fields each `get()` call so a recycled instance picks up the right values. The "first context wins" trap is real — recycled sprites that retain a stale `material.map` from a previous frame won't repaint. The chord-name label loops on this (search `lbl.material.map !== mat.map`) by checking before swapping.

## Key gotchas / pitfalls

1. **Adding a new pool? Reset it.** The reset block at the top of `update()` is easy to miss when adding a new pool elsewhere.
2. **`txtMat()` is cache-keyed by `(style, text, color, wide)`.** Calling it with a numeric `text` works (it's coerced via `String(...)`), but new label content creates a new texture forever. Don't generate dynamic per-frame text (e.g. interpolated values) through `txtMat()` or you'll leak GPU memory. For static labels that change occasionally (chord names, fret numbers), the cache is fine. The `style` arg picks a preset from the `TXT_STYLES` table — see "Tweaking text-sprite styling" below.
3. **Disposal in `teardown()` matters.** Three.js doesn't garbage-collect GPU resources. Every `material.dispose()`, `geometry.dispose()`, `map.dispose()`, and `ren.dispose()` call there is load-bearing. `teardown()` is called from `init()` (when re-initing), `destroy()` (setRenderer swap or `highway.stop()`), and on init failure.
4. **Don't use `tuning.length` for string count.** `bundle.tuning` (and `arr.tuning` server-side) is always 6 elements even for bass — feedBack pre-fills the array with zeros for unused strings. Use `bundle.stringCount` (feedBack#93), with `/bass/i.test(arrangement)` as the only acceptable fallback. There's a comment in `resolveStringCount()` documenting this.
5. **lyricsCanvas DOM order.** The 2D overlay canvas is appended to `wrap` AFTER `ren.domElement` and given `z-index:1`. This is the empirically-correct order — earlier versions had it before the WebGL canvas, which broke in splitscreen panels with `position:relative; overflow:hidden`. Don't reorder without testing both modes.
6. **Projection glow `renderOrder = -1`** in `initScene()`. This is a known-suboptimal setting — it forces the glow to draw before the strings in the transparent queue, so the string visibly cuts through the preview. Removing the line lets natural Z-sort layer it correctly. Plus the projection's world-Y matches the string Y, which after perspective projection puts the preview slightly screen-lower than the string; bumping `projY = y + NH * 0.4` recenters it. (Both fixes live on the `fix/preview-stacking` branch.)
7. **`renderOrder` on transparent objects is sticky.** Three.js sorts the transparent queue by `renderOrder` first, then back-to-front. A stray `m.renderOrder = -1` on something will pull it under everything regardless of Z. When in doubt, leave `renderOrder` at the default 0 and rely on Z position.
   - **Corollary: `depthTest: false` alone does NOT make a sprite "always on top."** It removes the sprite from depth-buffer comparison, but draw order in the transparent queue is still determined by `renderOrder` then Z. Anything rendered after a `depthTest: false` sprite will still overdraw it. For HUD-style overlays that must always be visible (fret-row labels — issue #35, technique callouts), set `renderOrder = 1000` AND keep `depthTest: false`. Both knobs together is the contract; either alone leaves the door open to occlusion.
8. **`ch.id` may be missing.** Some chord events lack an `id` (or it doesn't index into `chordTemplates`). Always optional-chain: `bundle.chordTemplates?.[ch.id]?.name`. The chord diagram + name label both gate on a non-empty result.
9. **The `aspectScale` clamp (`Math.max(1, …)`).** Without it, ultra-wide split-screen panels (top/bottom layout, ~5:1 aspect) yield aspectScale ≈ 0.33, which dollies the camera way in and kills highway depth. The clamp keeps wide panels at baseline depth and only allows narrow panels to dolly the camera back.
10. **The `_oobStringWarned` flag is reset on `nStr` change** in the returned `draw()` — switching from guitar (6) to bass (4) re-arms the warning so a malformed bass chart still gets logged.
11. **`renderOrder` values for the lane and dividers are explicit** in `update()` (`lane.renderOrder = 1`, `div.renderOrder = 2`). The lane plane needs to draw above the static fretboard plane (which has no renderOrder), and dividers need to draw above the lane.
12. **`BACKGROUND_STYLE_IDS` and `BACKGROUND_STYLES` are deliberately NOT the same id-set.** `venue` is in `BACKGROUND_STYLES` (it has a renderer) but not `BACKGROUND_STYLE_IDS` (so `coerceSetting` rejects a stored `h3d_bg_style='venue'` — otherwise venue could mount outside the viz-picker flow and settings.html, which can't represent it, couldn't switch back). `butterchurn` is the mirror image: in `BACKGROUND_STYLE_IDS` but not `BACKGROUND_STYLES`, because it's a mode whose controller owns its own canvas and audio tap. Never derive one list from the other.
13. **Never snapshot a live binding at module scope.** `import { T } from './core/three.js'; const X = T;` captures `null` forever — `T` is assigned inside `loadThree().then()`, long after every module has evaluated. Read it inside a function body (every existing `T.Foo` call site already does). Same hazard applies to `FRET_WIDTH_MID` and `_venueSceneOverride`.
14. **Don't make `settingsMemFallback`, `settingsListeners`, `butterchurnControllers`, `favoritePresets`/`bannedPresets`, the bc panel state, the aspect panel, `player-chrome`, the analyser bridge, or `PALETTES`/`_customPalette` per-instance.** They're module singletons on purpose — one shared settings shadow, one subscriber set, one visualizer pane. Per-instance copies mean N panes and N conflicting writers under splitscreen. Conversely, don't promote genuinely per-instance state (`txtCache`, pools, camera state) to module scope: all splitscreen panels would then share it.

## Tweaking colors safely

The eight-color palette `S_COL` is the single source of truth for per-string color. **Don't hardcode hex values inside `drawNote()` or `update()`** — every per-string color reference is either an entry in `S_COL` or one of the per-string material arrays (`mStr`, `mGlow`, `mSus`, `mProj`, `mProjGlow`) built from it.

If a planned color-palette feature lands (issue #10), expect it to swap the palette source array but keep this single-array indirection. Anything that hardcodes color today will break that swap; flag it during review.

Non-string colors (the stock lane hexes `HIGHWAY_LANE_STRIPE_ODD_HEX`/`_EVEN_HEX` — now overridable per Highway theme, see "Scene colors" above; fret-row label colors `#ffe84d` / `#9ab8cc`, fret-dot color `0x556677`, lyrics box rgba, chord-name gold `#e8d080`, etc.) are scattered as literals — that's intentional for now, since they're scene-wide accents rather than per-string. Pulling them into named constants is fine if you're already in that area.

## Tweaking text-sprite styling

Every text label in the 3D scene is rasterised by `txtMat(text, color, wide, style)` and the look (font, outline, drop-shadow, source-canvas resolution) is driven by a preset in the `TXT_STYLES` table near the top of `createFactory()` in [main.js](src/main.js). **Do not edit the body of `txtMat()` to change a single label class** — change the relevant preset entry instead, so the rest stay unaffected.

Current presets and their callers:

| Preset | Used by | Default look |
|---|---|---|
| `fretRow` | Fret-number row under the board (`update()`, fret-row block) | Arial Black 900, 256px source canvas, 18px dark outline + soft drop-shadow — designed to pop against any background |
| `noteFret` | Per-note connector numbers + on-body fret label (`drawNote()`) | Same heavy treatment as `fretRow` |
| `chord` | 3D chord-name labels above chord boxes | bold sans, 128px source, 6px outline (lighter so the gold reads) |
| `section` | Section banners ("Verse", "Chorus") at fret 12 | bold sans, 128px source, 6px outline |
| `technique` | Bend / slide / H / P / T / PH / PM / accent / tremolo / open-string overlay | bold sans, 128px source, 6px outline |
| `open` | The "0" label on open-string note bodies | bold sans, 128px source, 6px outline |

Style fields:

- `font` / `wideFont` — full CSS font shorthand (weight + size + family); `wideFont` is used when `wide=true` (long-aspect labels: chord names, section names, "↑1/2", "~~~"). Keep both in sync if you change weight or family.
- `srcH` — source-canvas height in px. Wide labels use `srcH * 4` for width. Larger `srcH` keeps glyph strokes crisp after bilinear downsampling onto small sprites — bumping it from 128 → 256 was the difference between thin-and-blurry and crisp on the fret-number presets. **Keep `srcH` power-of-two** (128, 256, 512, …): WebGL1 and Three.js silently disable mipmap generation on NPOT textures and fall back to a non-mipmap min-filter, which causes shimmer/aliasing on labels far down the highway. The 4× width derivation preserves POT-ness too (e.g. 256 → 1024 wide).
- `stroke` / `strokeW` — outline color and line-width in source-canvas px. Set `stroke: null` or `strokeW: 0` to skip the outline (faster cache rasterisation, no contrast halo).
- `shadow` — `{ color, blur, dx, dy }` or `null`. Drawn via canvas 2D `shadowColor` / `shadowBlur` / `shadowOffsetX/Y` *before* the stroke and fill, so it haloes the whole glyph.

**Cache key includes the preset name** (`style|wide|text|color`), so two presets with otherwise-identical text produce two distinct cached materials. Adding a new preset is safe — just add the entry to `TXT_STYLES` and pass its name as the 4th arg at the call site. Forgetting to pass `style` falls back to `'technique'` (the broadest, most generic preset) and is the right default for a brand-new label class.

**Don't generate per-frame distinct text through `txtMat()`** (e.g. interpolated values, tick counters). The cache is unbounded and will leak GPU memory across the session — see Pitfall #2.

## Lifecycle (setRenderer contract)

Per feedBack#36, the factory returns `{ init, draw, resize, destroy }`:

- **`init(canvas, bundle)`** tears down any prior state, sets `highwayCanvas`, lazily loads Three.js, runs `initScene()`, calls `applySize()` (with a `retrySize` rAF loop fallback if the canvas isn't laid out yet).
- **`draw(bundle)`** is gated on `_isReady`. Re-resolves `nStr` / inverted / renderScale, then `update(bundle) → camUpdate(bundle) → ren.render → 2D overlays`. The `_lastHwW/_lastHwH` check at the top auto-resizes when the splitscreen plugin bypasses `resize()`.
- **`resize(w, h)`** is gated on `_isReady`. Just calls `applySize()`.
- **`destroy()`** is idempotent. Sets flags, runs `teardown()`, drops `highwayCanvas`. Tolerates being called on an instance that's been destroyed and re-init'd already (resets `_lastHwW/H`, `_diagChord`, etc.).

The factory **returns a fresh instance per call**, so splitscreen's per-panel `setRenderer(feedBackViz_highway_3d())` gets independent state per panel — important because the chord diagram, projection meshes, etc. are all per-instance.

## Verifying a change

Four gates, in increasing cost. Run all four before committing anything non-trivial:

1. **`npx eslint .`** — `no-undef` is on for `src/**` and is the single most valuable check when moving code between modules: it catches a missing import at lint time instead of at runtime, several times over. `import-x/no-cycle` and `import-x/no-unresolved` are errors too.
2. **`npm run test:js`** — `node --test` over `tests/*.test.mjs` + `tests/legacy/*`. Current baseline: **179 tests, 176 pass, 0 fail, 3 todo** (the 3 todos are pre-existing known bugs, documented in their own test files). Tests real-import the modules under test; that's why import-time purity matters.
3. **Local core stack** — symlink this fork into a local `feedBack` checkout and boot native uvicorn (Docker's bind-mount of `./plugins` makes a host symlink dangle inside the container, so Docker won't work):
   ```bash
   ln -s /path/to/feedBack-plugin-highway-3d /path/to/feedBack/plugins/highway_3d
   cd /path/to/feedBack && PYTHONPATH=lib python main.py       # :8000
   ```
   Then confirm each new/changed module serves: `curl -o /dev/null -w '%{http_code}' localhost:8000/api/plugins/highway_3d/src/<path>.js` → 200.
4. **Playwright** (from the core checkout): `npx playwright test tests/browser/highway-3d-lefty.spec.ts tests/browser/check-errors.spec.ts tests/browser/plugin-globals-contract.spec.ts`. Expected baseline is **4 passed / 1 failed** — `highway-3d-lefty`'s final zero-console-errors assertion fails locally with `audio.play() rejected: NotSupportedError` because this environment has no codec for the mocked stream. That failure is pre-existing and unrelated (verified against the pristine plugin); anything *else* failing is yours. Re-run before concluding a new failure is real — `check-errors` flakes occasionally under cross-spec ordering and passes standalone.

## Branching / PR conventions

- Feature branches off `main`, descriptive name (e.g. `fix/preview-stacking`, `feat/palette-picker`).
- PR target: target the contributor's own fork by default unless they ask otherwise; confirm before opening a PR upstream. Run `git remote -v` in this directory to see the remotes that are configured locally.
- Commit messages: short imperative subject, optional body explaining *why*. Don't summarize the diff — the diff already does that.
- This repo is an **independent fork** of the `highway_3d` plugin bundled in-tree at `plugins/highway_3d/` in `got-feedback/feedBack`. It has deliberately diverged (the ES-module split above does not exist upstream), so it is not kept byte-compatible with core's copy and its changes are not headed upstream by default.
- **No behaviour changes in a move commit.** When relocating code between modules, verify the moved text is byte-identical (`diff` against the exact original line range) and land any fix as its own follow-up commit. A large move with a "while I'm here" fix buried in it is unreviewable and unbisectable.

## When in doubt

- Check the file-structure tree above first; if it's renderer internals it's in [main.js](src/main.js), where `Grep` for the function name or banner text still beats guessing.
- [core/constants.js](src/core/constants.js) is intentionally exhaustive; scan it before introducing a new magic number.
- If a "polish" feels like it should be one or two lines but stretches into restructuring, double-check whether a per-frame state field, pool reset, or `validString()` guard already covers your case.
