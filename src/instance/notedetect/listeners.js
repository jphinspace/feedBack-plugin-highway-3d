// Notedetect feedback (#9) + Score FX (notedetect >=1.13) listener setup.
// Moved verbatim out of createFactory()'s initScene() (Stage 7 Phase 3c) --
// the first slice of the initScene()/teardown() split. This is the
// "notedetect" subsystem from the plan's dom/renderer/materials/geometry/
// pools/instanced/notedetect breakdown; it turned out to be the cleanest of
// the seven because, unlike materials/geometry/pools, it isn't interleaved
// with other feature clusters in the source -- it's the last thing initScene()
// does, already self-contained (its own two local helpers, no reads of
// anything built earlier in initScene()).
//
// Two dependency shapes, not one, because the listeners this creates are
// long-lived (persist across many events/frames, not rebuilt each frame like
// note.js's `frame` bag):
//
// - Plain `deps` fields for state that's genuinely stable for the listener's
//   whole lifetime: the mark arrays (mutated via .length=0/.push(), never
//   reassigned to a NEW array while a listener built from a given
//   initScene() call is still attached -- teardown() nulls the listener
//   before ever reassigning noteDetectHitMarks/MissMarks to a fresh array,
//   and this factory reruns fresh on every re-init), _fxElemSeen (a WeakSet,
//   same story), the two constants, and _fxHandle/_fxResolvePalette
//   (functions, declared once, never reassigned).
// - `getFxGen`/`getHighwayCanvas` getters for the two values the _fxOnFx
//   handler's deferred setTimeout callback reads: _fxGen is incremented by
//   teardown() specifically to invalidate any callback still in flight when
//   a NEWER init/teardown cycle happens meanwhile, and highwayCanvas can be
//   swapped out from under a live instance (canvas-replaced handler) while
//   this listener is still attached. Both must be read live, at event-fire
//   time, not snapshotted at listener-creation time -- a plain deps field
//   would silently break the "torn down meanwhile" cancellation check.
export function createNotedetectListeners(deps) {
    // noteDetectHitMarks/MissMarks are `let`, not `const`, purely to preserve
    // the original code's `noteDetectHitMarks = noteDetectPushMark(...)`
    // reassignment verbatim (byte-identical move) -- noteDetectPushMark always
    // mutates and returns the SAME array it's given, so the reassignment is a
    // no-op in practice, but this isn't the place to make that judgment call.
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
        // Prune expired entries unconditionally. The dedupe path
        // below can extend expiresAt of any entry (including arr[0]),
        // so an arr[0] gate is not reliable — it would prevent
        // pruning entries that expired behind a refreshed front
        // entry, allowing the array to grow unbounded. These arrays
        // are tiny (a handful of marks at most), so an unconditional
        // filter() is negligible and always correct.
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

    // Score FX (notedetect ≥1.13). notedetect dispatches each fx
    // detail object twice in the same task: first explicitly on
    // window (unscoped), then as a bubbling CustomEvent from its
    // per-panel instanceRoot (scoped). Element-targeted copies are
    // authoritative — accept only the ones whose root lives in this
    // panel's container. The window copy is DEFERRED a task: by the
    // time it runs, the element copy (same detail reference) has
    // either arrived — making the window copy a duplicate to drop —
    // or it never will (detector root not attached to the DOM), in
    // which case the window copy is the compat fallback. This keeps
    // splitscreen panels from rendering each other's FX even for
    // the first event of a session.
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
            if (gen !== getFxGen()) return;   // torn down (or re-inited) meanwhile
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
