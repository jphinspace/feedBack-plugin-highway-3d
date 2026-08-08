/**
 * Per-frame notedetect state housekeeping: two prune passes that trim/reset
 * bookkeeping unconditionally every frame (not chart-static memoization
 * like `arp-and-slide-prepasses.js`'s caches, which only rerun when an
 * input ref changed).
 */
export function createVerdictPrune({
    scoreFx, _chordVerdicts, _susVerdictLatch, _CV_KEY_TIME_MUL, _CV_KEY_TIME_SLOT,
    noteDetectHitMarks, noteDetectMissMarks,
}) {
    let _chordVerdictsLastNow = null;

    /**
     * Prunes `_chordVerdicts` latches whose chord has fully scrolled past
     * the verdict-window cull — without this the map grows unbounded for
     * the rest of the song (one entry per chord onset). `verdictKey`
     * encodes time in its upper bits, so `k < pruneBeforeKey` prunes
     * correctly with no parsing per entry.
     *
     * Backward seek (`now < lastNow`): every latched entry's chord time is
     * now ahead of `now`, so the forward-only check would skip them all —
     * clear wholesale instead; the chord loop's `chDt > 0` eviction
     * re-creates entries as chords re-enter the pre-hit window.
     *
     * Forward playback: full scan, not early-break — entries are inserted
     * when a verdict *observation* lands, not in chord-time order, so a
     * later chord's verdict can arrive before an earlier chord's. O(n) but
     * n is bounded (song's chord count), so per-frame cost is microseconds.
     */
    function pruneChordVerdicts(now, ndVerdictT0, noteDetectHasProvider) {
        if (noteDetectHasProvider && _chordVerdictsLastNow !== null && now < _chordVerdictsLastNow - 0.25) {
            // Backward seek — wipe all verdict latches so notes re-judge from scratch.
            _chordVerdicts.clear();
            _susVerdictLatch.clear();
            // Score-pop dedup too: a rewind re-judges the same popKeys, and the wall-time
            // TTL alone would suppress their fresh "+N" pops for up to 4s.
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

    /**
     * Prunes expired notedetect hit/miss marks once per frame instead of
     * once per `drawNote()` call, so `drawNote()` only does the bounded
     * `(s, f, t)` match. No `arr[0]` gate: the dedupe path can refresh any
     * entry's `expiresAt`, so gating on `arr[0]` would skip expired
     * entries behind it. In-place backwards splice avoids reallocating
     * the array objects other modules hold the same reference to.
     */
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
