// Every setting mirrored into per-instance state must also be refreshable live.
//
// THE BUG THIS EXISTS TO PREVENT
// ------------------------------
// `loadSettings()` copies persisted settings into per-instance variables once,
// at panel build time. The `settingsListener` settings-bus subscriber is the
// ONLY thing that re-runs it afterwards, and it dispatches on an explicit list
// of `changedKey === '...'` branches with NO catch-all fallback — the chain
// ends at `if (!changedKey || changedKey === 'style') rebuildBackground()`.
//
// So a key that `loadSettings()` mirrors but the listener does not name is
// silently frozen: the user toggles it in Settings, the value is persisted,
// the bus fires, every branch misses, and the renderer keeps the stale value
// until the panel is torn down and rebuilt (song change / viz swap). The
// control looks completely dead.
//
// That was true of ELEVEN keys at once (streakFx, plus fpsVisible,
// fretDividersVisible, chordDiagramVisible, hitFx, sparks, timingFx,
// verdictMarks, cinematic, bloom, and an apparent customColors). Only
// streakFx was ever noticed, via a since-removed port of core's streak-break test.
//
// Rather than pin the ten names — which would pass again the moment someone
// adds an eleventh — this asserts the INVARIANT: mirrored ⊆ handled, modulo a
// short, justified exclusion list. Add a setting to loadSettings() and forget
// the listener, and this fails with the offending key named.
//
// Source-level, because loadSettings/settingsListener live inside the
// createFactory() closure and cannot be imported. Same strategy as
// tests/legacy/*. When Stage 7 breaks that closure up, repoint the extractor
// rather than deleting the invariant.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(HERE, '..', 'src', 'main.js'), 'utf8');
// The live settings-bus listener moved to instance/settings-listener.js in
// Stage 7 Track B (3-ctx-3) -- loadSettings() stayed in main.js.
const settingsListenerSrc = fs.readFileSync(
    path.join(HERE, '..', 'src', 'instance', 'settings-listener.js'), 'utf8');
// loadSettings()'s ~40 direct-copy settings moved out of the function body
// into a key->field table it loops over (Stage 7, post-3e polish) -- the
// keys still readSetting()'d live in that table's source now, not as
// literal `readSetting(panelKey, '...')` calls in loadSettings() itself.
const settingsDefaultsSrc = fs.readFileSync(
    path.join(HERE, '..', 'src', 'settings', 'defaults.js'), 'utf8');

// Brace-match a block starting at `signature` within `text`.
function block(text, signature, label) {
    const start = text.indexOf(signature);
    assert.notEqual(start, -1, `signature '${signature}' not found in ${label}`);
    const open = text.indexOf('{', start);
    assert.notEqual(open, -1, `no opening brace after '${signature}'`);
    let depth = 1, i = open + 1;
    while (i < text.length && depth > 0) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') depth--;
        i++;
    }
    assert.equal(depth, 0, `unbalanced braces after '${signature}'`);
    return text.slice(start, i);
}

// Keys that loadSettings() copies into per-instance state: the literal
// readSetting(panelKey, '...') calls still in the function body (the
// special-cased settings) UNION the keys of the
// LOAD_SETTINGS_SIMPLE_KEY_TO_FIELD table it loops over for everything else.
function mirroredKeys() {
    const body = block(src, 'function loadSettings', 'src/main.js');
    const literal = [...body.matchAll(/readSetting\(panelKey, '(\w+)'\)/g)].map((m) => m[1]);
    const tableBody = block(
        settingsDefaultsSrc, 'export const LOAD_SETTINGS_SIMPLE_KEY_TO_FIELD',
        'src/settings/defaults.js');
    const looped = [...tableBody.matchAll(/(\w+):\s*'/g)].map((m) => m[1]);
    return new Set([...literal, ...looped]);
}

// Keys the live settings-bus listener dispatches on.
function handledKeys() {
    const body = block(settingsListenerSrc, 'return (changedKey) =>', 'src/instance/settings-listener.js');
    return new Set([...body.matchAll(/changedKey === '(\w+)'/g)].map((m) => m[1]));
}

// Keys that are mirrored but intentionally absent from the listener. Each needs
// a reason, and the reason has to be a real mechanism — not "nobody noticed".
const JUSTIFIED_EXCLUSIONS = {
    // h3dBgSetStringColors writes customColors and THEN writes palette, so the
    // 'palette' branch (which reloads + retints + rebuilds the board) always
    // runs immediately after. A customColors branch would be redundant.
    customColors: "written together with 'palette'; the palette branch reloads",
};

test('loadSettings() and the live settings listener cover the same keys', () => {
    const mirrored = mirroredKeys();
    const handled = handledKeys();

    // Sanity-check the extractors before trusting the comparison — a regex that
    // silently matched nothing would make this test vacuously pass.
    assert.ok(mirrored.size > 30, `expected loadSettings to mirror many keys, got ${mirrored.size}`);
    assert.ok(handled.size > 30, `expected the listener to handle many keys, got ${handled.size}`);

    const stranded = [...mirrored]
        .filter((k) => !handled.has(k) && !(k in JUSTIFIED_EXCLUSIONS))
        .sort();

    assert.deepEqual(stranded, [],
        'these settings are mirrored by loadSettings() but never refreshed by the '
        + 'live listener, so toggling them does nothing until the panel is rebuilt: '
        + stranded.join(', '));
});

test('every justified exclusion is still actually mirrored', () => {
    // Keeps the exclusion list from rotting into a place where dead names hide
    // real regressions.
    const mirrored = mirroredKeys();
    for (const key of Object.keys(JUSTIFIED_EXCLUSIONS)) {
        assert.ok(mirrored.has(key),
            `'${key}' is listed as a justified exclusion but loadSettings() no longer `
            + 'mirrors it — drop it from JUSTIFIED_EXCLUSIONS');
    }
});

// The specific regression that surfaced the whole class, kept as its own case so
// a failure names the user-visible symptom rather than just a set difference.
test('the notedetect FX settings refresh live', () => {
    const handled = handledKeys();
    for (const key of ['hitFx', 'sparks', 'streakFx', 'timingFx', 'verdictMarks']) {
        assert.ok(handled.has(key),
            `'${key}' must be in the live listener — without it the Settings control `
            + 'appears dead for the rest of the song');
    }
});
