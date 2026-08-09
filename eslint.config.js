// Flat ESLint config — maintainer / CI tooling only, never on the serve path.
// Baseline is the Airbnb JavaScript style guide (`eslint-config-airbnb-base`,
// loaded through @eslint/eslintrc's FlatCompat since Airbnb still ships an
// eslintrc-shaped config). Every override below is a *documented* deviation
// from Airbnb, not a blanket relaxation — each one exists because the rule
// as written would flag this repo's actual, deliberate architecture (see
// CLAUDE.md), not because the rule is wrong in general. Grouped by why:
//
// Frozen/documented architecture Airbnb doesn't know about:
//   * `import/extensions: always` for `.js`/`.mjs` — these are real ES
//     modules loaded by both the browser and Node with no bundler between;
//     relative imports MUST carry their extension (CLAUDE.md's "Module
//     rules"), the opposite of Airbnb's bundler-oriented default.
//   * `import/prefer-default-export: off` — zero default exports in this
//     repo by design (CLAUDE.md's frozen-naming-surface architecture runs
//     on named exports throughout); the rule would fight every single-export
//     file.
//   * `import/no-mutable-exports: off` — `export let T` (core/three.js) and
//     its siblings are a documented, load-bearing live-binding pattern
//     ("Only the declaring module may write an export let", CLAUDE.md).
//   * `no-underscore-dangle: off` — the `_foo` prefix is this repo's
//     load-bearing "private, not part of the file's public surface"
//     convention, used hundreds of times.
//   * `no-param-reassign: off` — two documented patterns rely on it: the
//     per-instance `ctx` object written through as `ctx.cam.x = …` from
//     functions that receive it as a parameter, and the Stage-7 prepass
//     functions that reassign their own tracking-state parameter and
//     return the new value (`instance/model/arp-and-slide-prepasses.js`,
//     `chord-diagram-tracking.js`).
//   * `default-param-last: off` — `drawNote()`'s parameter list
//     (`instance/render/note.js`) is a long-established positional
//     signature called from many sites across note.js/chords.js/
//     single-notes.js; reordering it to satisfy this rule would mean
//     touching every call site of the single hottest function in the
//     renderer for a purely stylistic gain.
//
// Dense, per-frame-hot-path code Airbnb's defaults actively fight:
//   * `no-plusplus: off` — dense per-frame render/pool code uses `i++`/`n++`
//     both as for-loop afterthoughts and as compact pool-index bumps
//     (`a[n++]`, `core/pool.js`); this is the hot path this plugin exists
//     to keep fast, and `+= 1` buys nothing here.
//   * `no-empty` allows empty `catch` blocks — the idempotent-dispose idiom
//     (`try { m.dispose(); } catch (_) {}`) used throughout teardown()
//     paths deliberately swallows a redundant-dispose error.
//   * `no-bitwise: off` — hex-color math (`>>> 0`, `| 0` int coercion) and
//     packed numeric-key encodings (e.g. `_encodeChordVerdictKey`) use real
//     bitwise operators on purpose across ~27 files.
//   * `no-continue` / `no-restricted-syntax` (for-of, for-in) — this repo
//     iterates `Map`/`Set`/typed-array scratch buffers in per-frame code
//     (CLAUDE.md's "Object pools" / per-string arrays); `.forEach` there
//     would add a closure allocation per frame in exactly the loops most
//     sensitive to it.
//   * `no-labels: off` — labeled `break`/`continue` for early-exit from
//     nested loops (`instance/model/chord-inference.js`,
//     `instance/render/chords.js`, `fret-column-markers.js`) avoids an
//     extra flag variable or function-extraction in hot per-frame loops.
//   * `no-mixed-operators: off` — dense geometry/trig formulas mix `*`/`/`
//     (same precedence tier, unambiguous, left-to-right) throughout
//     `core/*.js`; Airbnb's caution here isn't buying real clarity on
//     operators that aren't actually ambiguous.
//   * `no-nested-ternary: off` — compact per-frame state/color-selection
//     ternary chains are this codebase's idiom (chord repeat/barre logic,
//     verdict color selection); low individual complexity, spread thin
//     across many files.
//   * `no-multi-assign: off` — teardown()/reset code deliberately nulls
//     many refs in one chained statement (`scene = cam = noteG = … =
//     null;`); splitting these into N statements adds noise, not safety.
//   * `no-loop-func: off` — closures created inside a loop (e.g.
//     `butterchurn/panel.js`'s per-row click handlers) deliberately read
//     live outer state (`primaryController`) at call time, not a stale
//     per-iteration snapshot; that's the intended behavior, not the
//     classic `var i` capture bug this rule exists to catch.
//   * `no-use-before-define: off` — functions constructed once and called
//     only after the whole module (or `createFactory()` closure) has
//     finished initializing routinely reference bindings assigned later in
//     the same scope; safe by construction here, not a real hazard.
//   * `no-console: off` — every console call in this repo is a bracketed,
//     purposeful diagnostic (`[3D-Hwy]`, `[viz3d]`, `[h3dbench]`, …), not
//     debug leftovers.
//   * `max-len` code-line ceiling turned off — CLAUDE.md's own navigation
//     philosophy favors dense, single-line `createX({ … })` construction
//     calls (greppable by function name); manually rewrapping ~60 of them
//     across render-critical files trades a stylistic nicety for real risk
//     of a transcription slip in performance-sensitive code. Comments keep
//     a 120-column soft wrap.
//
// Narrow, single-option tweaks matching an existing idiom:
//   * `no-return-assign: except-parens` — `smoothNow()` and friends use the
//     parenthesized `return (x = y);` idiom on purpose (assign the shared
//     clock/cache value and return it in one step); already parenthesized
//     everywhere it's used, so this is a no-op everywhere except it stops
//     flagging the idiom.
//   * `no-unused-expressions` allows short-circuit (`allowShortCircuit`) —
//     the `cond && doThing();` statement idiom (background styles'
//     teardown paths) is used purely for its short-circuit side effect.
//   * `no-unused-vars` ignores caught-but-unused errors (`caughtErrors:
//     'none'`) and `_`-prefixed args/vars (`argsIgnorePattern`/
//     `varsIgnorePattern: '^_'`) — the `catch (e) {}` / `catch (_) {}`
//     idempotent-dispose idiom is pervasive and deliberate (see
//     `no-underscore-dangle` above for the same `_` convention).
//
// Bookkeeping, unrelated to code style:
//   * `max-lines` — carried over unchanged from the pre-Airbnb config: a
//     WARNING ratchet at the 1,500-line size norm from the screen.js ->
//     src/ ES-module split (docs/size-exemptions.md is canonical).
//   * `import/no-extraneous-dependencies` widened to allow devDependencies
//     in tooling/test files (this config itself, tailwind.config.js,
//     tests/**) — Airbnb's default glob list doesn't know this repo's
//     layout.
//
// Everything else in Airbnb's rule set (spacing, quotes, semicolons,
// prefer-const, eqeqeq, arrow-body-style, import ordering, …) applies as
// written. Run `npx eslint . --fix` after any large mechanical change —
// most of the style rules below are auto-fixable.

const { FlatCompat } = require('@eslint/eslintrc');
const importPlugin = require('eslint-plugin-import');
const globals = require('globals');

const compat = new FlatCompat({ baseDirectory: __dirname });
const airbnbBase = compat.extends('airbnb-base');

// Per-file size ceilings — a mirror of docs/size-exemptions.md (canonical).
// Keep in sync; each entry corresponds to a signed row in the register.
const SIZE_EXEMPTIONS = [
  // The whole de-IIFE'd renderer body, dumped into src/main.js as-is by
  // Stage 0e. Stages 1-6 pulled the bulk of module scope out of it; the
  // residual closure is what's left of `createFactory()`. This row (or
  // its renamed successor) is deleted at the end of that effort, not
  // raised (see docs/size-exemptions.md).
  { files: ['src/main.js'], max: 100000 },
];

const sizeRule = (max) => ['warn', { max, skipBlankLines: false, skipComments: false }];

// AudioWorkletGlobalScope's own globals — not `window`/`document` (this
// runs off the main thread, in a dedicated worklet global scope), and not
// a set the `globals` package ships.
const AUDIO_WORKLET_GLOBALS = {
  AudioWorkletProcessor: 'readonly',
  registerProcessor: 'readonly',
  sampleRate: 'readonly',
  currentTime: 'readonly',
  currentFrame: 'readonly',
};

// Shared Airbnb-deviation overrides for every real first-party JS block
// (ESM plugin source, ESM tests, CJS legacy tests, CJS tooling). See the
// file-header comment above for why each of these exists.
const AIRBNB_OVERRIDES = {
  'import/extensions': ['error', 'ignorePackages', {
    js: 'always', mjs: 'always', cjs: 'always', json: 'always',
  }],
  'import/prefer-default-export': 'off',
  'import/no-default-export': 'error',
  'import/no-mutable-exports': 'off',
  'no-underscore-dangle': 'off',
  'no-param-reassign': 'off',
  'default-param-last': 'off',
  'no-plusplus': 'off',
  'no-empty': ['error', { allowEmptyCatch: true }],
  'no-bitwise': 'off',
  'no-continue': 'off',
  'no-labels': 'off',
  'no-mixed-operators': 'off',
  'no-nested-ternary': 'off',
  'no-multi-assign': 'off',
  'no-loop-func': 'off',
  'no-use-before-define': 'off',
  'no-console': 'off',
  'no-restricted-syntax': [
    'error',
    // `with` is unused anywhere in this repo and genuinely unsafe; kept.
    // Airbnb's for-in/for-of/LabeledStatement entries are dropped — see
    // the file-header comment (dense per-frame Map/Set/typed-array
    // iteration, and no-labels: off, above).
    { selector: 'WithStatement', message: '`with` is disallowed in strict mode because it makes code impossible to predict and optimize.' },
  ],
  'no-return-assign': ['error', 'except-parens'],
  'no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: false }],
  'no-unused-vars': ['error', {
    caughtErrors: 'none',
    args: 'after-used',
    argsIgnorePattern: '^_',
    varsIgnorePattern: '^_',
  }],
  'max-len': ['off'],
};

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'assets/vendor/**',
      '**/*.min.js',
    ],
  },
  // Airbnb's own rule set, applied globally first so every later,
  // more-specific block in this file can override a subset of it
  // (sourceType, globals, the documented deviations above) per file
  // group. Flat config resolves overlapping blocks for the same file
  // in array order, later wins.
  ...airbnbBase,
  {
    plugins: { import: importPlugin },
  },
  // Size norm across all first-party JS. CJS tooling/config files are
  // parsed as CommonJS; ESM plugin/test files get their own block below.
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { 'max-lines': sizeRule(1500) },
  },
  // CJS tooling/config at the repo root and the legacy CJS test suite
  // (tests/legacy/*.test.js) — these predate the ES-module split and
  // still use require()/module.exports on purpose (node:test's CJS
  // form for the legacy tests; plain Node tooling scripts otherwise).
  {
    files: ['eslint.config.js', 'tailwind.config.js', 'tests/legacy/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs', globals: { ...globals.node } },
    rules: {
      ...AIRBNB_OVERRIDES,
      // Tooling/test files legitimately only need devDependencies.
      'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
      // These files are the CJS half of the repo on purpose — no ESM
      // export here at all, so both default-export rules are moot.
      'import/no-default-export': 'off',
      'global-require': 'off',
    },
  },
  // The ES-module graph: screen.js itself (`import './src/main.js';`),
  // everything under src/, and the plugin's Node.js-side tooling scripts.
  // Listed explicitly like core's own `static/app.js` entry, for the same
  // reason: not everything real is under src/. This block is later in the
  // array than the sourceType:'commonjs' block above, so its
  // sourceType:'module' wins for these files specifically.
  {
    files: ['screen.js', 'src/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      'max-lines': sizeRule(1500),
      ...AIRBNB_OVERRIDES,
      // Module hygiene for the real ES-module graph under src/: catches
      // a forgotten import the moment a split moves code between files
      // (no-undef), a broken relative path (import/no-unresolved), and
      // an accidental upward edge in the documented downward-only
      // layering (core -> settings -> bg/bc/audio/ui -> globals ->
      // main) via import/no-cycle.
      'no-undef': 'error',
      'import/no-unresolved': 'error',
      'import/no-cycle': 'error',
    },
  },
  // AudioWorkletGlobalScope code: runs off the main thread with its own
  // global scope (no `window`/`document`), so it needs its own globals
  // set rather than `globals.browser`.
  {
    files: ['assets/viz-worklet.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...AUDIO_WORKLET_GLOBALS },
    },
    rules: {
      'max-lines': sizeRule(1500),
      ...AIRBNB_OVERRIDES,
      'no-undef': 'error',
    },
  },
  // Node.js-side tooling scripts (perf capture, etc.) — real ES-module
  // imports of src/**, run standalone under Node, not the browser.
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'max-lines': sizeRule(1500),
      ...AIRBNB_OVERRIDES,
      'no-undef': 'error',
      'import/no-unresolved': 'error',
      'import/no-cycle': 'error',
      'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
    },
  },
  // scripts/h3dbench.mjs specifically: a Node script that drives a headless
  // browser via Playwright (deliberately resolved from a sibling core
  // checkout at runtime, not this repo's own node_modules — see the file's
  // own header comment) and passes callbacks to `page.evaluate()` that are
  // serialized and executed IN the browser page, so `document`/`window`
  // inside those callbacks are real, valid browser globals despite the
  // surrounding file being a plain Node script. The perf runs are also
  // deliberately sequential (one full run must finish before the next
  // starts for clean measurement isolation), so the awaited loop is correct.
  {
    files: ['scripts/h3dbench.mjs'],
    languageOptions: {
      globals: { document: 'readonly', window: 'readonly' },
    },
    rules: {
      'import/no-unresolved': 'off',
      'no-await-in-loop': 'off',
    },
  },
  // The .mjs test suite: real ES-module imports of src/**, run under
  // node:test (Node globals, not browser globals).
  {
    files: ['tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'max-lines': sizeRule(1500),
      ...AIRBNB_OVERRIDES,
      'no-undef': 'error',
      'import/no-unresolved': 'error',
      'import/no-cycle': 'error',
      'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
    },
  },
  // Signed size exemptions (docs/size-exemptions.md) — raise the ceiling so
  // registered files don't warn below it.
  ...SIZE_EXEMPTIONS.map(({ files, max }) => ({ files, rules: { 'max-lines': sizeRule(max) } })),
];
