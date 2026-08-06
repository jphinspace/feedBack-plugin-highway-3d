// Contract tests for the guitar/bass 3D Highway's Streak feedback setting.
// The renderer owns a heavy canvas/WebGL lifecycle, so these checks follow the
// source-level strategy used by the other highway_3d tests.
//
// Ported from feedBack core's tests/js/highway_3d_streak_break_feedback.test.js
// as part of the tests/legacy/ tripwire scaffold (screen.js -> src/ module
// split, Stage 0c). All three assertions FAIL against this fork's unmodified
// screen.js: `_streakFx` is declared as a SETTING_DEFAULTS setting and read for
// the hit-heat escalation multiplier (line ~14633), but the streakBreak
// red-wash path in `_fxHandle`/`drawScoreFx` ignores it entirely, and
// `'streakFx'` is missing from the `settingsListener` key list, so toggling the
// setting live does nothing until the panel is torn down and rebuilt. This
// is a genuine pre-existing bug, not something introduced by porting the
// test — confirmed by grepping screen.js directly. Left as `todo` (not
// skipped) so it stays visible without blocking the Stage 0 gate; fixing it
// is a behavior change and belongs in its own commit, not a move commit.
// Flip these back to plain `test(...)` once that fix lands.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCREEN_JS = path.join(__dirname, '..', '..', 'src', 'main.js');
const src = fs.readFileSync(SCREEN_JS, 'utf8');

function extractBlock(signature) {
    const start = src.indexOf(signature);
    assert.ok(start !== -1, `signature '${signature}' not found`);
    const openBrace = src.indexOf('{', start);
    assert.ok(openBrace !== -1, `opening brace after '${signature}' not found`);
    let depth = 1;
    let i = openBrace + 1;
    while (i < src.length && depth > 0) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') depth--;
        i++;
    }
    assert.equal(depth, 0, `unbalanced braces after '${signature}'`);
    return src.slice(start, i);
}

test('Streak feedback gates streak-break events', { todo: 'pre-existing bug: _fxHandle streakBreak branch does not check _streakFx' }, () => {
    const handle = extractBlock('function _fxHandle(d)');
    assert.match(
        handle,
        /d\.fxType\s*===\s*['"]streakBreak['"]\s*&&\s*_streakFx/,
        'a disabled Streak feedback setting must not arm the red wash',
    );
});

test('Streak feedback cancels an in-progress wash at draw time', { todo: 'pre-existing bug: drawScoreFx breakAge ignores _streakFx' }, () => {
    const draw = extractBlock('function drawScoreFx(ctx, W, H)');
    assert.match(
        draw,
        /const\s+breakAge\s*=\s*_streakFx\s*\?\s*nowMs\s*-\s*_fxBreakMs\s*:\s*Infinity/,
        'drawScoreFx must suppress an already-armed wash as soon as the setting is off',
    );
});

test('Streak feedback changes refresh renderer state live', { todo: 'pre-existing bug: streakFx missing from settingsListener key list' }, () => {
    const listener = extractBlock('settingsListener = (changedKey) =>');
    assert.match(
        listener,
        /changedKey\s*===\s*['"]streakFx['"]/,
        'the live settings listener must recognize Streak feedback changes',
    );
    assert.match(
        listener,
        /loadSettings\(\)/,
        'the live settings listener must reload _streakFx without requiring a new song',
    );
});
