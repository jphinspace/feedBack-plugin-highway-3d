// Flat ESLint config — maintainer / CI tooling only, never on the serve path
// (mirrors feedBack core's eslint.config.js, scoped down to this standalone
// plugin repo). Enforces the guardrails for the screen.js -> src/ ES-module
// split (see docs/plugin-modules split plan in the parent feedBack repo):
//
//   * max-lines — the 1,500-line size norm, as a WARNING ratchet. `screen.js`
//     itself is exempted below until it becomes the one-line module entry
//     (Stage 0e of the split); the residual `src/instance/factory.js` gets a
//     temporary exemption through Stages 1-6, removed at the end of the
//     closure-dismantling stage. See docs/size-exemptions.md (canonical).
//   * import-x/no-unresolved + no-cycle — module hygiene for the real
//     ES-module graph under src/ and the .mjs test suite. no-unresolved (a
//     HARD error) catches broken import paths; no-cycle enforces the
//     downward-only layering rule (state -> util -> model -> render/io ->
//     ui -> globals/main).

const importX = require('eslint-plugin-import-x');

// Per-file size ceilings — a mirror of docs/size-exemptions.md (canonical).
// Keep in sync; each entry corresponds to a signed row in the register.
const SIZE_EXEMPTIONS = [
    // The pre-split monolith. Exempted outright until Stage 0e turns it into
    // a one-line `import './src/main.js';` entry (at which point this row
    // is deleted, not raised).
    { files: ['screen.js'], max: 100000 },
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
    // The ES-module graph under src/, plus .mjs tests. Once Stage 0e lands,
    // screen.js itself becomes `import './src/main.js';` and is added here
    // (a migrated plugin's entry must parse as a module — classic screen.js
    // does not).
    {
        files: ['src/**/*.js', 'tests/**/*.mjs'],
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
