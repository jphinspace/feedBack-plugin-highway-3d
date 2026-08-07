// Per-frame notedetect state housekeeping -- moved verbatim out of
// update() (Stage 7, post-3e). Two prune passes, both "trim/reset
// per-frame notedetect bookkeeping," neither a chart-static memoization
// pass like arp-and-slide-prepasses.js's caches (both run every frame
// unconditionally, not "only when an input ref changed") -- a distinct
// concern, so they get their own file under notedetect/ alongside
// listeners.js rather than folding into that file.
//
// _chordVerdicts/_susVerdictLatch/noteDetectHitMarks/noteDetectMissMarks
// are passed in as plain deps, not live getters: all four are only ever
// reassigned/reset from main.js's teardown() (a full reset that always
// precedes the next initScene() call, which is where this factory itself
// gets (re)constructed), never mid-lifetime while this module is live --
// same reasoning as arp-and-slide-prepasses.js's `_scrArpPersistKeys`
// plain-value dep.
//
// _chordVerdictsLastNow (the previous-frame `now`, used to detect a
// backward seek) is read nowhere outside pruneChordVerdicts -- moved to
// be private state of this factory (own-it-outright) rather than
// threaded back out for main.js to hold. noteDetectFrameNowMs (the
// per-frame performance.now() snapshot) IS read elsewhere (main.js's
// `_noteFrame` population, scoreFx's own live getter) -- pruneNotedetectMarks
// returns it for main.js to reassign onto its own bare `let`, same
// pattern as fretWireHitFlash.applyFretWireHitFlash()'s return value.
export function createVerdictPrune({
    scoreFx, _chordVerdicts, _susVerdictLatch, _CV_KEY_TIME_MUL, _CV_KEY_TIME_SLOT,
    noteDetectHitMarks, noteDetectMissMarks,
}) {
    let _chordVerdictsLastNow = null;

    // Prune _chordVerdicts latches whose chord has fully scrolled past the
    // loop's verdict-window cull. Forward playback never re-encounters a
    // chord, so without this prune the map would grow unbounded for the
    // rest of the song (each chord onset contributes one entry, ~hundreds
    // for a typical song). verdictKey is an integer encoded by
    // _encodeChordVerdictKey (main.js) -- time component sits in the upper
    // bits, so a direct ``k < pruneBeforeKey`` test prunes correctly
    // without parseFloat / String.slice on every entry.
    //
    // Backward seek (now < lastNow): every latched entry's chord time is
    // now ahead of `now`, the forward-only check below would skip them
    // all and the map would grow on every loop. Clear wholesale -- the
    // chord-loop's `chDt > 0` eviction re-creates entries as chords
    // re-enter the pre-hit window.
    //
    // Forward playback: iterate every entry. An earlier `break`
    // optimization assumed Map insertion order tracked chord time, but
    // entries are inserted when a verdict OBSERVATION lands -- so a later
    // chord whose verdict arrived first could sit before an earlier chord
    // whose verdict was still pending, and breaking on the first
    // in-window entry would leave the now-older later-inserted entries
    // un-pruned. Full scan is O(n) but n is bounded (chord count in the
    // song, ~hundreds) so the per-frame cost is microseconds.
    function pruneChordVerdicts(now, ndVerdictT0, noteDetectHasProvider) {
        if (noteDetectHasProvider && _chordVerdictsLastNow !== null && now < _chordVerdictsLastNow - 0.25) {
            // Backward seek — wipe all verdict latches so notes re-judge
            // from scratch regardless of whether chords were present.
            _chordVerdicts.clear();
            _susVerdictLatch.clear();
            // Score-pop dedup too: a practice loop / rewind re-judges the
            // same popKeys, and the wall-time TTL alone would suppress
            // their fresh "+N" pops for up to 4 s.
            scoreFx.clearFxSeen();
        }
        if (noteDetectHasProvider && _chordVerdicts.size > 0) {
            if (_chordVerdictsLastNow !== null && now < _chordVerdictsLastNow - 0.25) {
                // already cleared above
            } else {
                const pruneBefore = ndVerdictT0 - 0.5; // safety margin
                const pruneBeforeKey = Math.round(pruneBefore * _CV_KEY_TIME_MUL) * _CV_KEY_TIME_SLOT;
                for (const k of _chordVerdicts.keys()) {
                    if (k < pruneBeforeKey) _chordVerdicts.delete(k);
                }
            }
        }
        _chordVerdictsLastNow = now;
    }

    // Prune expired notedetect hit/miss marks once per frame instead of
    // once per drawNote call (issue #9 perf nit) -- drawNote then only
    // does the bounded (s, f, t) match, no per-note performance.now() /
    // filter() needed. No arr[0] gate: the dedupe path can refresh any
    // entry's expiresAt, so gating on arr[0] would silently skip expired
    // entries behind it. In-place prune (backwards splice loop) avoids
    // reallocating the array objects noteRenderer/notedetect listeners
    // hold the same reference to.
    function pruneNotedetectMarks() {
        const nowMs = performance.now();
        if (noteDetectHitMarks.length) {
            for (let i = noteDetectHitMarks.length - 1; i >= 0; i--) {
                if (noteDetectHitMarks[i].expiresAt <= nowMs) noteDetectHitMarks.splice(i, 1);
            }
        }
        if (noteDetectMissMarks.length) {
            for (let i = noteDetectMissMarks.length - 1; i >= 0; i--) {
                if (noteDetectMissMarks[i].expiresAt <= nowMs) noteDetectMissMarks.splice(i, 1);
            }
        }
        return nowMs;
    }

    return { pruneChordVerdicts, pruneNotedetectMarks };
}
