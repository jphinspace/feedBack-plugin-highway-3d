// Per-frame chord-verdict Map pruning -- moved verbatim out of update()
// (Stage 7, post-3e). Not a chart-static memoization pass like
// arp-and-slide-prepasses.js's caches (this runs every frame
// unconditionally when a verdict provider is attached, not "only when an
// input ref changed") -- a distinct concern, so it gets its own file
// under notedetect/ alongside listeners.js rather than folding into that
// file.
//
// _chordVerdicts/_susVerdictLatch are passed in as plain deps, not live
// getters: both are only ever reassigned/reset from main.js's teardown()
// (a full reset that always precedes the next initScene() call, which is
// where this factory itself gets (re)constructed), never mid-lifetime
// while this module is live -- same reasoning as arp-and-slide-
// prepasses.js's `_scrArpPersistKeys` plain-value dep.
//
// _chordVerdictsLastNow (the previous-frame `now`, used to detect a
// backward seek) is read nowhere outside this block -- moved to be
// private state of this factory (own-it-outright) rather than threaded
// back out for main.js to hold.
export function createVerdictPrune({ scoreFx, _chordVerdicts, _susVerdictLatch, _CV_KEY_TIME_MUL, _CV_KEY_TIME_SLOT }) {
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

    return { pruneChordVerdicts };
}
