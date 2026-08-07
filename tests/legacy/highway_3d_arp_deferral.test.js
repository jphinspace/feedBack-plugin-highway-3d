// Pins the arpeggio chord-gem deferral gating in plugins/highway_3d/screen.js
// (feedBack#262). Without these guards, an over-eager `deferChordGems` makes
// arpeggio frames empty when standalone notes don't actually cover the shape,
// and an under-eager one duplicates gems on top of the standalone passage.
//
// Source-level only — same strategy as the other tests/js/ files.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCREEN_JS = path.join(__dirname, '..', '..', 'src', 'main.js');
const CHORDS_JS = path.join(__dirname, '..', '..', 'src', 'instance', 'render', 'chords.js');

// chordShapeCoveredByStandaloneNotes moved to
// src/instance/model/chord-inference.js in Stage 7 Phase 1c (it's called from
// drawNote() via the chordInference.* facade below, not defined inline
// anymore), so this checks the real export's signature instead of scanning
// main.js text for it.
test('chordShapeCoveredByStandaloneNotes helper exists with the expected signature', async () => {
    const { createChordInference } = await import('../../src/instance/model/chord-inference.js');
    const chordInference = createChordInference({
        validString: () => true,
        filterValidNotes: (notes) => notes,
    });
    assert.equal(typeof chordInference.chordShapeCoveredByStandaloneNotes, 'function',
        'helper that scans the note stream for shape coverage must be exported from chord-inference.js');
    assert.equal(chordInference.chordShapeCoveredByStandaloneNotes.length, 4,
        'signature must stay (ch, shape, notesArr, timeWin)');
});

test('deferChordGems gates both synth and explicit+covered branches on note-stream coverage', () => {
    // Either branch firing without coverage produces the empty-lavender-frame
    // regression PR #262 fixed. Pin both predicates so a refactor that drops
    // one gate fails the test. The chord loop moved to
    // instance/render/chords.js in Stage 7 Track B (3-ctx-2).
    const src = fs.readFileSync(CHORDS_JS, 'utf8');
    assert.match(
        src,
        /const\s+deferChordGems\s*=\s*\(\s*ch\.h3dSynth\s*&&\s*noteStreamCoversArpShape\(\)\s*\)\s*\|\|\s*inferredArpPattern\s*\|\|\s*\(\s*hsHintFrame\.explicit\s*&&\s*hsHintFrame\.covered\s*&&\s*noteStreamCoversArpShape\(\)\s*\)/,
        'deferChordGems must guard the h3dSynth and explicit+covered branches with the coverage check',
    );
});

test('noteStreamCoversArpShape is computed lazily (called, not eagerly bound)', () => {
    // Eager allocation regressed perf on dense charts (Copilot review on PR
    // #262). The shape must be a callable so short-circuit evaluation skips
    // the note-stream scan when neither gating branch needs it.
    const src = fs.readFileSync(CHORDS_JS, 'utf8');
    assert.match(
        src,
        /const\s+noteStreamCoversArpShape\s*=\s*(?:\(\s*\)\s*=>|function(?:\s+\w+)?\s*\(\s*\))/,
        'noteStreamCoversArpShape must be an arrow/function so the scan is lazy',
    );
    assert.doesNotMatch(
        src,
        /const\s+noteStreamCoversArpShape\s*=\s*chordShapeCoveredByStandaloneNotes\(/,
        'noteStreamCoversArpShape must not eagerly invoke the coverage helper',
    );
});
