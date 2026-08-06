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

// Brace-match a block starting at `signature`.
function block(signature) {
    const start = src.indexOf(signature);
    assert.notEqual(start, -1, `signature '${signature}' not found in src/main.js`);
    const open = src.indexOf('{', start);
    assert.notEqual(open, -1, `no opening brace after '${signature}'`);
    let depth = 1, i = open + 1;
    while (i < src.length && depth > 0) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') depth--;
        i++;
    }
    assert.equal(depth, 0, `unbalanced braces after '${signature}'`);
    return src.slice(start, i);
}

// Keys that loadSettings() copies into per-instance state.
function mirroredKeys() {
    const body = block('function loadSettings');
    return new Set([...body.matchAll(/readSetting\(panelKey, '(\w+)'\)/g)].map((m) => m[1]));
}

// Keys the live settings-bus listener dispatches on.
function handledKeys() {
    const body = block('settingsListener = (changedKey) =>');
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
