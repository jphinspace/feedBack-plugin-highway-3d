/**
 * Notedetect feedback (issue #9) + Score FX (notedetect >=1.13) listener
 * setup — long-lived listeners, not rebuilt per frame. Two dependency
 * shapes reflect that:
 * - Plain `deps` fields for state stable for the listener's whole
 *   lifetime: the mark arrays (mutated via `.length=0`/`.push()`, never
 *   reassigned to a new array while attached), `_fxElemSeen` (a WeakSet),
 *   the two constants, and `_fxHandle`/`_fxResolvePalette`.
 * - `getFxGen`/`getHighwayCanvas` live getters for values the `_fxOnFx`
 *   deferred callback reads at event-fire time, not creation time:
 *   `_fxGen` is bumped by `teardown()` to invalidate any in-flight
 *   callback from a torn-down instance, and `highwayCanvas` can be
 *   swapped out from under a live instance by the canvas-replaced handler.
 */
export function createNotedetectListeners(deps) {
    let {
        noteDetectHitMarks, noteDetectMissMarks,
    } = deps;
    const {
        _fxElemSeen,
        NOTEDETECT_TIME_EPS, NOTEDETECT_TTL_MS,
        _fxHandle, _fxResolvePalette,
        getFxGen, getHighwayCanvas,
    } = deps;

    const noteDetectNormalizeMark = (d) => {
        if (!d) return null;
        const note = d.note || d.chartNote;
        if (!note) return null;
        if (!Number.isFinite(note.s) || !Number.isFinite(note.f) || !Number.isFinite(d.noteTime)) return null;
        const labels = [];
        if (d.timingState && d.timingState !== 'OK' && Number.isFinite(d.timingError)) {
            labels.push({
                text: `${d.timingState === 'EARLY' ? '↑' : '↓'} ${d.timingError > 0 ? '+' : ''}${d.timingError}ms`,
                color: '#ffb347',
            });
        }
        if (d.pitchState && d.pitchState !== 'OK' && Number.isFinite(d.pitchError)) {
            labels.push({
                text: `${d.pitchState === 'SHARP' ? '♯' : '♭'} ${d.pitchError > 0 ? '+' : ''}${d.pitchError}¢`,
                color: '#66c7ff',
            });
        }
        return { s: note.s, f: note.f, noteTime: d.noteTime, labels, timingState: d.timingState || null };
    };
    const noteDetectPushMark = (arr, d) => {
        const mark = noteDetectNormalizeMark(d);
        if (!mark) return arr;
        const now = performance.now();
        // Prune unconditionally: the dedupe path below can extend expiresAt of any entry
        // including arr[0], so an arr[0] gate would miss entries expired behind it. Arrays
        // are tiny (a handful of marks), so an unconditional filter() is negligible.
        if (arr.length !== 0) {
            const live = arr.filter(m => m.expiresAt > now);
            arr.length = 0;
            if (live.length) arr.push(...live);
        }
        const existing = arr.find(m =>
            m.s === mark.s && m.f === mark.f && Math.abs(m.noteTime - mark.noteTime) < NOTEDETECT_TIME_EPS
        );
        if (existing) {
            existing.labels = mark.labels.length ? mark.labels : existing.labels;
            existing.expiresAt = Math.max(existing.expiresAt, now + NOTEDETECT_TTL_MS);
            return arr;
        }
        arr.push({ ...mark, expiresAt: now + NOTEDETECT_TTL_MS });
        return arr;
    };
    const noteDetectOnHit = (e) => { noteDetectHitMarks = noteDetectPushMark(noteDetectHitMarks, e.detail); };
    const noteDetectOnMiss = (e) => { noteDetectMissMarks = noteDetectPushMark(noteDetectMissMarks, e.detail); };
    window.addEventListener('notedetect:hit', noteDetectOnHit);
    window.addEventListener('notedetect:miss', noteDetectOnMiss);
    let noteDetectOnBusHit = null;
    let noteDetectOnBusMiss = null;
    if (window.feedBack &&
            typeof window.feedBack.on  === 'function' &&
            typeof window.feedBack.off === 'function') {
        noteDetectOnBusHit  = (e) => { noteDetectHitMarks  = noteDetectPushMark(noteDetectHitMarks,  e.detail); };
        noteDetectOnBusMiss = (e) => { noteDetectMissMarks = noteDetectPushMark(noteDetectMissMarks, e.detail); };
        window.feedBack.on('note:hit', noteDetectOnBusHit);
        window.feedBack.on('note:miss', noteDetectOnBusMiss);
    }

    // Score FX (notedetect >=1.13). notedetect dispatches each fx detail object twice in the
    // same task: first unscoped on window, then as a bubbling CustomEvent from its per-panel
    // instanceRoot (scoped). Element-targeted copies are authoritative — accepted only when
    // their root lives in this panel's container. The window copy is deferred a task: by the
    // time it runs, the element copy either already arrived (making the window copy a
    // duplicate to drop) or never will (detector root not in the DOM), in which case the
    // window copy is the compat fallback. Keeps splitscreen panels from rendering each
    // other's FX even for the first event of a session.
    _fxResolvePalette();
    const _fxOnFx = (e) => {
        const d = e && e.detail;
        if (!d) return;
        const t = e.target;
        if (t && t.parentElement) {
            _fxElemSeen.add(d);
            const highwayCanvas = getHighwayCanvas();
            if (!highwayCanvas || !t.parentElement.contains(highwayCanvas)) return;
            _fxHandle(d);
            return;
        }
        const gen = getFxGen();
        setTimeout(() => {
            if (gen !== getFxGen()) return; // torn down (or re-inited) meanwhile
            if (_fxElemSeen.has(d)) return;
            _fxHandle(d);
        }, 0);
    };
    window.addEventListener('notedetect:fx', _fxOnFx);
    let _fxOnSkin = null;
    if (window.feedBack && typeof window.feedBack.on === 'function'
            && typeof window.feedBack.off === 'function') {
        _fxOnSkin = () => _fxResolvePalette();
        window.feedBack.on('notedetect:skin', _fxOnSkin);
    }

    return { noteDetectOnHit, noteDetectOnMiss, noteDetectOnBusHit, noteDetectOnBusMiss, _fxOnFx, _fxOnSkin };
}
