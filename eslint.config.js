// Flat ESLint config — maintainer / CI tooling only, never on the serve path
// (mirrors feedBack core's eslint.config.js, scoped down to this standalone
// plugin repo). Enforces the guardrails for the screen.js -> src/ ES-module
// split (see docs/plugin-modules split plan in the parent feedBack repo):
//
//   * max-lines — the 1,500-line size norm, as a WARNING ratchet. `screen.js`
//     is a one-line module entry as of Stage 0e, well under the norm; the
//     residual closure body it now `import`s (currently `src/main.js`, later
//     renamed as Stages 1-6 carve it up) gets a temporary exemption, removed
//     at the end of the closure-dismantling stage. See docs/size-exemptions.md
//     (canonical).
//   * import-x/no-unresolved + no-cycle — module hygiene for the real
//     ES-module graph under src/ and the .mjs test suite. no-unresolved (a
//     HARD error) catches broken import paths; no-cycle enforces the
//     downward-only layering rule (state -> util -> model -> render/io ->
//     ui -> globals/main).

const importX = require('eslint-plugin-import-x');

// Per-file size ceilings — a mirror of docs/size-exemptions.md (canonical).
// Keep in sync; each entry corresponds to a signed row in the register.
// screen.js's own exemption was removed here in Stage 0e: it's now a
// one-line `import './src/main.js';` module entry, well under the norm.
const SIZE_EXEMPTIONS = [
    // The whole de-IIFE'd renderer body, dumped into src/main.js as-is by
    // Stage 0e. Stages 1-6 pull the ~4,400 lines of module scope out of it;
    // it's expected to get renamed to src/instance/factory.js partway
    // through as its shape stops looking like a boot file. Whichever file
    // holds the residual closure, this row (or its renamed successor) is
    // deleted at the end of Stage 6, not raised (see docs/size-exemptions.md).
    { files: ['src/main.js'], max: 100000 },
];

const sizeRule = (max) => ['warn', { max, skipBlankLines: false, skipComments: false }];

module.exports = [
    {
        ignores: [
            'node_modules/**',
            'assets/vendor/**',
            '**/*.min.js',
        ],
    },
    // Size norm across all first-party JS. Classic scripts are parsed as
    // scripts (no import/export); module files get their own block below.
    {
        files: ['**/*.js', '**/*.cjs'],
        languageOptions: { ecmaVersion: 'latest', sourceType: 'script' },
        rules: { 'max-lines': sizeRule(1500) },
    },
    // The ES-module graph: screen.js itself (now `import './src/main.js';`
    // — a migrated plugin's entry must parse as a module, unlike a classic
    // screen.js), everything under src/, and the .mjs test suite. Listed
    // explicitly like core's own `static/app.js` entry, for the same reason:
    // it isn't under src/, so the src/**/*.js glob alone wouldn't catch it.
    // This block is later in the array than the sourceType:'script' block
    // above, so its sourceType:'module' wins for screen.js specifically.
    {
        files: ['screen.js', 'src/**/*.js', 'tests/**/*.mjs'],
        languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        plugins: { 'import-x': importX },
        // v4 flat-config resolver (resolver-next + createNodeResolver). Without
        // it the import rules silently skip imports they can't resolve.
        settings: { 'import-x/resolver-next': [importX.createNodeResolver()] },
        rules: {
            'max-lines': sizeRule(1500),
            'import-x/no-unresolved': 'error',
            'import-x/no-cycle': 'error',
        },
    },
    // Signed size exemptions (docs/size-exemptions.md) — raise the ceiling so
    // registered files don't warn below it.
    ...SIZE_EXEMPTIONS.map(({ files, max }) => ({ files, rules: { 'max-lines': sizeRule(max) } })),
];
