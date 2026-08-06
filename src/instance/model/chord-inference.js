import {
    ARP_FRAME_ONSET_CLUSTER_S, ARP_FRAME_ONSET_PAD_S, ARP_INFER_MIN_HAND_SHAPE_SPAN_S,
    ARP_INFER_MIN_HITS_VS_SHAPE_CAP, ARP_INFER_MULTI_STRUM_HIT_SLACK,
    ARP_INFER_MULTI_STRUM_WIN_MIN_S, ARP_INFER_STRUM_VS_ARP_SPREAD_MIN_S, NEXT_ON_STRING_T_EPS,
} from '../../core/constants.js';
import { lowerBoundT } from '../../core/chart-util.js';

// Chord/arpeggio/hand-shape inference: turning chart-format chordTemplates +
// handShapes + the raw note stream into what the renderer actually draws
// (repeat-run detection, synthesized chords for fingerpicking passages with
// no <chord> events, arpeggio-vs-strum classification, CAGED/guide-tone
// labels). Every function here is a pure chart-data -> derived-data
// transform; none of them touch Three.js, the DOM, or per-frame render
// state.
//
// Two real external dependencies, both nStr-dependent (per-string validity
// depends on the CURRENT arrangement's string count, which changes at
// runtime -- see validString()'s doc comment in main.js) and so can't move
// here without dragging nStr along: validString() and filterValidNotes().
// createChordInference() takes them as injected dependencies rather than
// importing them, since there's nothing to import them FROM -- they still
// live in the createFactory() closure.
//
// The WeakMap caches here (_chordSigCache, _chordShapeCache, _hintCache,
// _arpInferCache, _arpCoverCache) are chart-static: chart data never changes
// after load, so each is computed once per unique chord/hand-shape object and
// reused every frame. Per-instance for the usual reason (CLAUDE.md pitfall
// #14) -- a module singleton would leak cache entries across splitscreen
// panels showing different songs.
export function createChordInference({ validString, filterValidNotes }) {
    /**
     * Normalized fingering signature for chord repeat-run detection, or null.
     * Cached via WeakMap so the sort+join only runs once per unique chord object
     * across all frames — chart data never changes after load.
     */
    let _chordSigCache = new WeakMap();
    function chordShapeSignature(ch) {
        if (!ch?.notes) return null;
        if (_chordSigCache.has(ch)) return _chordSigCache.get(ch);
        const chordNotes = filterValidNotes(ch.notes);
        let sig = null;
        if (chordNotes.length > 0) {
            sig = chordNotes.slice().sort((a, b) => a.s - b.s).map(n => `${n.s}:${n.f}`).join('|');
        }
        _chordSigCache.set(ch, sig);
        return sig;
    }

    /** Tolerate RS/sloppak boolean-ish ``true`` / ``1`` forms. */
    function truthyChartFlag(v) {
        if (v === true || v === 1) return true;
        if (v === '1') return true;
        return typeof v === 'string' && v.toLowerCase() === 'true';
    }

    /** RS / sloppak `hd` (highDensity); tolerate occasional string forms. */
    function chordWireHighDensity(ch) {
        return truthyChartFlag(ch && ch.hd);
    }

    /**
     * Per spec, `displayName` is the UI label for a chord template
     * (defaulting to `name` when the chart didn't set it). Always go
     * through this helper so name vs. displayName drift can't surface
     * the wrong label or break displayName-based dedupe heuristics.
     */
    function chordTemplateLabel(tmpl) {
        if (!tmpl) return '';
        const d = tmpl.displayName;
        if (typeof d === 'string' && d.length > 0) return d;
        const n = tmpl.name;
        return typeof n === 'string' ? n : '';
    }

    /**
     * Arpeggio styling is driven by authored metadata, not by post-hoc
     * note-stream inference. Prefer explicit hand-shape flags and fall back
     * to template markers when present.
     */
    function chordTemplateMarkedArpeggio(cid, chordTemplates) {
        if (cid == null || !chordTemplates) return false;
        const tmpl = chordTemplates[cid] ?? chordTemplates[Number(cid)];
        if (!tmpl) return false;
        if (truthyChartFlag(tmpl.arp) || truthyChartFlag(tmpl.arpeggio)) return true;
        const displayName = typeof tmpl.displayName === 'string' ? tmpl.displayName.toLowerCase() : '';
        if (displayName.includes('-arp')) return true;
        const name = typeof tmpl.name === 'string' ? tmpl.name.toLowerCase() : '';
        return name.endsWith('(arp)') || name.includes(' arpeggio');
    }

    function handShapeMarkedArpeggio(hs, chordTemplates) {
        if (!hs) return false;
        if (truthyChartFlag(hs.arp) || truthyChartFlag(hs.arpeggio)) return true;
        return chordTemplateMarkedArpeggio(hsChordIdNorm(hs), chordTemplates);
    }

    /**
     * Matching hand-shape metadata for a chord onset. ``explicit`` follows
     * authored arpeggio markers only; note inference is handled separately
     * by the callers that still need it for non-visual behavior.
     *
     * Cached per chord: result depends only on (ch, hss, chordTemplates),
     * all chart-static for the lifetime of an arrangement. The cache is
     * swapped on (hss, templates) ref change so an arrangement switch
     * cannot resurrect stale entries. Empty-input case bypasses the cache
     * — it returns a fresh sentinel anyway and isn't hot enough to share.
     */
    const _HINT_NONE = Object.freeze({ explicit: false, covered: false, hs: null });
    let _hintCache = new WeakMap();
    let _hintCacheHsRef = null;
    let _hintCacheTplRef = null;
    function chordHandShapeArpeggioHint(ch, hss, chordTemplates) {
        if (!hss || hss.length === 0) return _HINT_NONE;
        if (_hintCacheHsRef !== hss || _hintCacheTplRef !== chordTemplates) {
            _hintCache = new WeakMap();
            _hintCacheHsRef = hss;
            _hintCacheTplRef = chordTemplates;
        }
        const cached = _hintCache.get(ch);
        if (cached !== undefined) return cached;
        const t = ch.t;
        const cid = ch.id;
        let result = _HINT_NONE;
        for (let i = 0; i < hss.length; i++) {
            const hs = hss[i];
            const tLo = hsStart(hs);
            const tHi = hsEnd(hs);
            if (Number.isNaN(tLo) || Number.isNaN(tHi)) continue;
            if (t + 1e-4 < tLo || t > tHi + 1e-4) continue;
            const hsCid = hsChordIdNorm(hs);
            if (hsCid !== cid && Number(hsCid) !== Number(cid)) continue;
            const explicit = handShapeMarkedArpeggio(hs, chordTemplates);
            result = { explicit, covered: true, hs };
            break;
        }
        _hintCache.set(ch, result);
        return result;
    }

    /** Build ``ch.notes`` from ``chordTemplates[cid].frets`` (-1 omitted). */
    function chordNotesFromTemplate(cid, templates) {
        if (templates == null || cid == null) return [];
        const tmpl = templates[cid] ?? templates[Number(cid)];
        if (!tmpl || !Array.isArray(tmpl.frets)) return [];
        const out = [];
        for (let si = 0; si < tmpl.frets.length; si++) {
            const f = tmpl.frets[si];
            if (f >= 0 && validString(si)) out.push({ s: si, f, sus: 0 });
        }
        return out;
    }

    /**
     * Chart-format fingerpicking passages often have ``<handShape>`` + per-string
     * ``<note>`` rows but **no** ``<chord>`` events. The 3D chord frame / arp
     * styling only runs over ``bundle.chords``, so synthesize minimal chord
     * rows at each hand-shape onset when the chart omits them.
     */
    function mergeHandShapeSynthChords(realChords, handShapes, chordTemplates) {
        if (!handShapes || handShapes.length === 0) return realChords;
        const reals = realChords && realChords.length ? realChords : [];
        const synth = [];
        const seenSynth = new Set();
        const tol = 0.028;
        /**
         * Suppress a synth chord box when a real chord with the **same trimmed
         * display name** played within this window — Custom songs commonly authors
         * several ``<chordTemplate>`` rows that share a display name (with
         * trailing-whitespace IDs) for fingering variants. The follow-up
         * hand-shape with no chord row is a fingering hint, not a new strum
         * (e.g. Jackson 5 "I Want You Back" ~0:27 — Fm7 cid=18 strum followed
         * by Fm7 cid=19 hand-shape, which earlier produced a stacked second
         * "Fm7" label and an extra chord frame).
         */
        const SAME_NAME_RUN_S = 0.5;
        const trimmedTemplateName = (cid) => {
            if (cid == null || !chordTemplates) return '';
            const tmpl = chordTemplates[cid] ?? chordTemplates[Number(cid)];
            // custom songs commonly authors several <chordTemplate> rows that share
            // a displayName for fingering variants; the suppression
            // heuristic in the surrounding code dedupes on the *label*,
            // not the underlying name, so go through chordTemplateLabel.
            return chordTemplateLabel(tmpl).trim();
        };
        outer: for (let i = 0; i < handShapes.length; i++) {
            const hs = handShapes[i];
            const cid = hs.chord_id != null ? hs.chord_id : hs.chordId;
            const st = hs.start_time != null ? hs.start_time : hs.startTime;
            if (cid == null || st == null || Number.isNaN(Number(st))) continue;
            const key = `${cid}|${Number(st).toFixed(3)}`;
            if (seenSynth.has(key)) continue;
            seenSynth.add(key);
            const myName = trimmedTemplateName(cid);
            for (let j = 0; j < reals.length; j++) {
                const ch = reals[j];
                const rid = ch.id;
                const sameId = rid === cid || Number(rid) === Number(cid);
                if (sameId && Math.abs(ch.t - st) <= tol) continue outer;
                // A real strum at the same onset already represents this
                // chord — never synthesize a phantom on top of it. The
                // id/name checks alone miss hand-shapes whose template
                // differs from (or shares no name with) the coincident real
                // chord — e.g. an edited chart that left a stale hand-shape
                // template pointing at the pre-edit shape, which then drew a
                // spurious second power chord beside the real one.
                if (Math.abs(ch.t - st) <= tol) continue outer;
                if (!sameId && myName !== '') {
                    const otherName = trimmedTemplateName(rid);
                    if (otherName === myName
                        && st > ch.t
                        && st - ch.t <= SAME_NAME_RUN_S) {
                        continue outer;
                    }
                }
            }
            const notes = chordNotesFromTemplate(cid, chordTemplates);
            if (notes.length === 0) continue;
            const et = hs.end_time != null ? hs.end_time : hs.endTime;
            synth.push({
                t: st,
                id: cid,
                // `hd` is the chart-format `highDensity` wire field (gallops /
                // repeated strums), not an arpeggio carrier — arpeggio
                // intent is read directly from the hand-shape via
                // chordHandShapeArpeggioHint() downstream. Keep `hd` false
                // so chordWireHighDensity() / label-suppression behave the
                // same as for any other non-gallop chord row.
                hd: false,
                notes,
                /** Hand-shape fill-in (no authored chord row) — skip note-stream arp frame. */
                h3dSynth: true,
                /** Hand-shape end time — used to draw the shape-sustain border for non-arp cases. */
                h3dSynthEnd: et != null ? Number(et) : null,
            });
        }
        if (synth.length === 0) return reals;
        const merged = reals.concat(synth);
        merged.sort((a, b) => {
            const dt = a.t - b.t;
            if (Math.abs(dt) > 1e-6) return dt;
            const ia = Number(a.id);
            const ib = Number(b.id);
            return (ia - ib) || 0;
        });
        return merged;
    }

    /**
     * Merge chart-format ``chordTemplates[id].frets`` with live ``chordNote`` rows.
     * Cached via WeakMap on the chord object — chord data never changes after
     * chart load, so the Map is computed once and reused every frame.
     * The init-time callers (fillArpeggioGhostInferFlags) pass ephemeral `fakeCh`
     * objects that are never seen again, so they bypass the cache naturally.
     */
    let _chordShapeCache = new WeakMap();

    // Reset the validString()/nStr-dependent chord caches owned by this
    // module. The caller (main.js's own _resetStringDependentCaches, which
    // also owns _filterValidNotesCache and _mergeCacheResult) calls this as
    // its half of the same reset -- see that function's comment for why nStr
    // changing (e.g. a 7-string chart whose stringCount arrives after the
    // first frame) needs every one of these caches dropped together.
    function resetStringDependentCaches() {
        _chordSigCache = new WeakMap();
        _chordShapeCache = new WeakMap();
    }

    function mergeChordShape(ch, chordNotes, templates) {
        if (_chordShapeCache.has(ch)) return _chordShapeCache.get(ch);
        const shape = new Map();
        const tid = ch && ch.id != null ? ch.id : null;
        const tmpl = (tid != null && templates)
            ? (templates[tid] ?? templates[Number(tid)])
            : null;
        if (tmpl && Array.isArray(tmpl.frets)) {
            for (let si = 0; si < tmpl.frets.length; si++) {
                if (!validString(si)) continue;
                const f = tmpl.frets[si];
                if (f >= 0) shape.set(si, f);
            }
        }
        for (let i = 0; i < chordNotes.length; i++) {
            const cn = chordNotes[i];
            if (!validString(cn.s)) continue;
            if (cn.f < 0) shape.delete(cn.s);
            else shape.set(cn.s, cn.f);
        }
        _chordShapeCache.set(ch, shape);
        return shape;
    }

    function hitTimesQualifyArpeggioSpread(hitTimes) {
        if (hitTimes.length < 2) return false;
        hitTimes.sort((a, b) => a - b);
        const spread = hitTimes[hitTimes.length - 1] - hitTimes[0];
        if (spread >= 0.03) return true;
        return hitTimes.length >= 4 && spread >= 0.016;
    }

    /** RS XML / IPC payloads use snake_case or camelCase field names. */
    function hsStart(hs) {
        if (!hs) return NaN;
        const v = hs.start_time != null ? hs.start_time : hs.startTime;
        if (v == null) return NaN;
        const n = Number(v);
        return Number.isNaN(n) ? NaN : n;
    }
    function hsEnd(hs) {
        if (!hs) return NaN;
        const v = hs.end_time != null ? hs.end_time : hs.endTime;
        if (v == null) return NaN;
        const n = Number(v);
        return Number.isNaN(n) ? NaN : n;
    }
    function hsChordIdNorm(hs) {
        if (!hs) return null;
        const v = hs.chord_id != null ? hs.chord_id : hs.chordId;
        return v == null ? null : v;
    }

    /** ``<handShape>`` chart duration in seconds (snake_case or camelCase XML). */
    function handShapeChartSpanSec(hs) {
        const a = hsStart(hs), b = hsEnd(hs);
        if (Number.isNaN(a) || Number.isNaN(b)) return 0;
        return Math.max(0, b - a);
    }

    /**
     * When ``hd`` is missing/false, detect arpeggio from the **note** stream
     * using the **full voicing** (template ∪ chord notes). RS often stores the
     * plucks only in ``notes[]``, not as duplicate chord rows.
     *
     * @param {{ tLo: number, tHi: number } | null} [timeWin]
     *        When set (e.g. from ``<handShape>`` span), scan staggered picks
     *        across the whole held-shape window — RS often omits ``arp`` and ``hd``.
     */
    // Cached per chord: result depends on (ch, shape, notesArr) and an
    // optional timeWin which itself is a function of the chord's matching
    // <handShape>. Both inputs are chart-static, so the cache invalidates
    // on (notesArr, hss) ref change — `hss` is threaded in purely as the
    // invalidation key for the chord-loop caller, which passes a stable
    // `ch` (reused across frames) and a timeWin that is null until
    // bundle.handShapes arrives over the WS; without the hss check the
    // null-timeWin result would stick once handShapes loaded late. shape
    // comes from mergeChordShape(ch) which is also chart-static, so it
    // doesn't enter the invalidation key directly. The cache deliberately
    // stores boolean results; a sentinel distinguishes "not computed"
    // from "false".
    let _arpInferCache = new WeakMap();
    let _arpInferCacheNotesRef = null;
    let _arpInferCacheHssRef = null;
    function inferArpeggioFromNotePattern(ch, shape, notesArr, timeWin, hss = null) {
        if (!notesArr || notesArr.length === 0 || shape.size < 2) return false;
        if (_arpInferCacheNotesRef !== notesArr || _arpInferCacheHssRef !== hss) {
            _arpInferCache = new WeakMap();
            _arpInferCacheNotesRef = notesArr;
            _arpInferCacheHssRef = hss;
        }
        const cached = _arpInferCache.get(ch);
        if (cached !== undefined) return cached;
        const result = _inferArpeggioFromNotePatternUncached(ch, shape, notesArr, timeWin);
        _arpInferCache.set(ch, result);
        return result;
    }
    function _inferArpeggioFromNotePatternUncached(ch, shape, notesArr, timeWin) {
        const tHi = timeWin ? timeWin.tHi : ch.t + 2.35;
        const tLo = timeWin ? timeWin.tLo : ch.t - 0.28;
        let i2 = lowerBoundT(notesArr, tLo - 0.02);
        const hitTimes = [];
        const hitStrings = new Set();
        for (; i2 < notesArr.length; i2++) {
            const n = notesArr[i2];
            if (n.t > tHi) break;
            if (n.t < tLo) continue;
            if (!validString(n.s)) continue;
            const ef = shape.get(n.s);
            if (ef === undefined || ef !== n.f) continue;
            hitTimes.push(n.t);
            hitStrings.add(n.s);
        }
        if (!hitTimesQualifyArpeggioSpread(hitTimes)) return false;
        // A genuine arpeggio SWEEPS across the held shape, so its standalone
        // notes land on MULTIPLE strings of the shape. When every matching
        // hit is on a single string, this is a repeated single-string run
        // (e.g. a palm-muted gallop hammering the chord's root) that happens
        // to share one string/fret with the chord — NOT an arpeggio. Inferring
        // one here deferred the chord's gems and made the power chord render as
        // just that one repeated note (bar 25 of starlight). Require ≥2 strings.
        if (hitStrings.size < 2) return false;
        // Strumming/gallop rejection — far more hits than the shape has
        // strings means the chord's notes are being re-struck repeatedly
        // (a riff/gallop reusing both power-chord notes), not swept once as
        // an arpeggio. This guard used to live inside `if (timeWin)`, so it
        // was skipped for charts with no hand-shapes (timeWin null) — which
        // let dense two-string gallops over a power chord infer a bogus
        // arpeggio and defer the chord's gems (bar 88 of starlight: a
        // (s5:4,s6:2) chord whose root+fifth recur ~16x over 2 s). Apply it
        // with the actual window span whether or not a hand-shape is present.
        const winSpan = timeWin ? (timeWin.tHi - timeWin.tLo) : (tHi - tLo);
        if (winSpan > ARP_INFER_MULTI_STRUM_WIN_MIN_S
            && hitTimes.length > shape.size + ARP_INFER_MULTI_STRUM_HIT_SLACK) {
            return false;
        }
        if (timeWin) {
            if (winSpan < 0.70 && hitTimes.length < 4) {
                const spread = hitTimes[hitTimes.length - 1] - hitTimes[0];
                if (spread < ARP_INFER_STRUM_VS_ARP_SPREAD_MIN_S) return false;
            }
            // Reject when too few staggered hits for a genuine sweep across
            // the held shape — see ARP_INFER_MIN_HITS_VS_SHAPE_CAP.
            const minHits = Math.min(shape.size, ARP_INFER_MIN_HITS_VS_SHAPE_CAP);
            if (hitTimes.length < minHits) return false;
        }
        return true;
    }

    /**
     * True when standalone note rows already cover every string/fret in the
     * arpeggio shape, so drawing the chord gems too would duplicate the same
     * authored passage.
     */
    // Cached per chord: result depends on (ch, shape, notesArr) — chart-
    // static; the cache invalidates on notesArr ref change. The same
    // ``ch`` may be queried multiple times per frame from the chord
    // render loop (deferChordGems / _deferFallback / suppressSynthChord),
    // so survival across frames is also useful.
    let _arpCoverCache = new WeakMap();
    let _arpCoverCacheNotesRef = null;
    function chordShapeCoveredByStandaloneNotes(ch, shape, notesArr, timeWin) {
        if (!notesArr || notesArr.length === 0 || !shape || shape.size === 0) return false;
        if (_arpCoverCacheNotesRef !== notesArr) {
            _arpCoverCache = new WeakMap();
            _arpCoverCacheNotesRef = notesArr;
        }
        const cached = _arpCoverCache.get(ch);
        if (cached !== undefined) return cached;
        const tLo = (timeWin ? timeWin.tLo : ch.t - ARP_FRAME_ONSET_PAD_S) - NEXT_ON_STRING_T_EPS;
        const tHi = (timeWin ? timeWin.tHi : ch.t + ARP_FRAME_ONSET_CLUSTER_S) + NEXT_ON_STRING_T_EPS;
        let i2 = lowerBoundT(notesArr, tLo);
        const matchedStrings = new Set();
        let result = false;
        for (; i2 < notesArr.length; i2++) {
            const n = notesArr[i2];
            if (n.t > tHi) break;
            if (!validString(n.s) || matchedStrings.has(n.s)) continue;
            const ef = shape.get(n.s);
            if (ef === undefined || ef !== n.f) continue;
            matchedStrings.add(n.s);
            if (matchedStrings.size >= shape.size) { result = true; break; }
        }
        _arpCoverCache.set(ch, result);
        return result;
    }

    /**
     * Notes in an inferred arpeggio passage are charted in ``notes[]`` with
     * staggered times; treat them like chord-cluster notes for chart-format-style
     * board-ghost fret digits (``fromChord`` + template column).
     */
    function arpeggioChordIdForNote(n, handShapes, chordTemplates, notesArr) {
        if (!handShapes || handShapes.length === 0 || !notesArr || notesArr.length === 0) return null;
        if (!validString(n.s)) return null;
        for (let i = 0; i < handShapes.length; i++) {
            const hs = handShapes[i];
            const hsLo = hsStart(hs);
            const hsHi = hsEnd(hs);
            if (Number.isNaN(hsLo) || Number.isNaN(hsHi)) continue;
            if (n.t + 1e-4 < hsLo || n.t > hsHi + 1e-4) continue;
            const cid = hsChordIdNorm(hs);
            if (cid == null) continue;
            const tmpl = chordTemplates?.[cid] ?? chordTemplates?.[Number(cid)];
            if (!tmpl || !Array.isArray(tmpl.frets)) continue;
            const tf = tmpl.frets[n.s];
            if (typeof tf !== 'number' || tf < 0 || n.f !== tf) continue;
            const synthNotes = chordNotesFromTemplate(cid, chordTemplates);
            if (synthNotes.length === 0) continue;
            const fakeCh = { t: hsLo, id: cid, notes: synthNotes };
            const shape = mergeChordShape(fakeCh, synthNotes, chordTemplates);
            const tw = { tLo: hsLo - 0.06, tHi: hsHi + 0.06 };
            if (handShapeChartSpanSec(hs) < ARP_INFER_MIN_HAND_SHAPE_SPAN_S) continue;
            if (inferArpeggioFromNotePattern(fakeCh, shape, notesArr, tw, handShapes)) return cid;
        }
        return null;
    }

    /**
     * Per-frame warmup: ``inferArpeggioFromNotePattern`` depends only on
     * ``handShape × chart``, not on the candidate note — the old path
     * recomputed it for every visible note (O(notecount × hs × notescan)).
     * Fill ``outFlags[i]`` with the boolean once per ``handShapes[i]``.
     */
    function fillArpeggioGhostInferFlags(handShapes, chordTemplates, notesArr, outFlags, outSynthOnsetSet = null) {
        for (let i = 0; i < handShapes.length; i++) {
            let infer = false;
            const hs = handShapes[i];
            if (handShapeChartSpanSec(hs) < ARP_INFER_MIN_HAND_SHAPE_SPAN_S) {
                outFlags[i] = false;
                continue;
            }
            const cid = hsChordIdNorm(hs);
            if (cid != null && notesArr.length > 0) {
                const tmpl = chordTemplates?.[cid] ?? chordTemplates?.[Number(cid)];
                if (tmpl && Array.isArray(tmpl.frets)) {
                    const synthNotes = chordNotesFromTemplate(cid, chordTemplates);
                    if (synthNotes.length > 0) {
                        const hsLo = hsStart(hs);
                        const hsHi = hsEnd(hs);
                        const fakeCh = { t: hsLo, id: cid, notes: synthNotes };
                        const shape = mergeChordShape(fakeCh, synthNotes, chordTemplates);
                        const tw = { tLo: hsLo - 0.06, tHi: hsHi + 0.06 };
                        infer = inferArpeggioFromNotePattern(fakeCh, shape, notesArr, tw, handShapes);
                        // Chord-hold gate: inferArpeggioFromNotePattern can fire true
                        // when open-string notes coincidentally match the template's
                        // open positions but only a SINGLE fretted (f>0) string is
                        // actually played at the handshape onset. Treat that as a
                        // chord hold (not an arpeggio) — clear the arp flag, no
                        // brackets. The original implementation also intended to
                        // record a synthetic sustain extending to hsEnd for the
                        // onset note, but that read-side was never wired up; the
                        // visual decay-before-handshape-end is benign.
                        if (infer) {
                            let _frettedCount = 0;
                            let _onsetNote = null;
                            const _fSeen = new Set();
                            let _ci = lowerBoundT(notesArr, tw.tLo - 0.02);
                            for (; _ci < notesArr.length; _ci++) {
                                const _cn = notesArr[_ci];
                                if (_cn.t > tw.tHi + 0.02) break;
                                if (_cn.t < tw.tLo) continue;
                                if (!validString(_cn.s)) continue;
                                if (shape.get(_cn.s) !== _cn.f) continue;
                                if (_cn.f > 0 && !_fSeen.has(_cn.s)) {
                                    _frettedCount++;
                                    _fSeen.add(_cn.s);
                                    if (_onsetNote === null) _onsetNote = _cn;
                                }
                            }
                            if (_frettedCount <= 1 && _onsetNote !== null) {
                                outFlags[i] = false;
                                continue; // chord hold handled — skip onset-match and outFlags assignment
                            }
                        }
                        // Non-arp template inferred as arpeggio: suppress brackets.
                        // Only explicit arp-marked templates (arp:true / displayName "-arp")
                        // should show [ ] / < > bracket markers.
                        if (infer && outSynthOnsetSet != null
                            && !handShapeMarkedArpeggio(hs, chordTemplates)) {
                            outSynthOnsetSet.add(hsLo);
                        }
                        // Also treat as arp ghost when the hs generated a suppressed
                        // synth chord: any standalone note in the onset window matches
                        // any shape string. Handles patterns where inferArpeggioFromNotePattern
                        // returns false (e.g. repeated arpeggio across a long hs span
                        // triggers the multi-strum rejection), but the player still
                        // needs the "hold this shape" ghost fret numbers on the board.
                        if (!infer) {
                            const _oLo = hsLo - ARP_FRAME_ONSET_PAD_S;
                            const _oHi = hsLo + ARP_FRAME_ONSET_CLUSTER_S;
                            let _oi = lowerBoundT(notesArr, _oLo - 0.02);
                            for (; _oi < notesArr.length; _oi++) {
                                const _on = notesArr[_oi];
                                if (_on.t > _oHi) break;
                                if (_on.t < _oLo) continue;
                                if (shape.get(_on.s) === _on.f) {
                                    infer = true;
                                    // Only suppress brackets when the handshape is NOT an
                                    // explicit arpeggio (arp:true template / displayName "-arp").
                                    // Genuine arp handshapes reached via onset-match still need
                                    // the [ ] bracket markers — only non-arp synth chords are
                                    // "false positives" that should hide the brackets.
                                    if (outSynthOnsetSet != null
                                        && !handShapeMarkedArpeggio(hs, chordTemplates)) {
                                        outSynthOnsetSet.add(hsLo);
                                    }
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            outFlags[i] = infer;
        }
    }

    // Every function drawNote()/update() call directly, not just the four this
    // module was originally scoped around -- ground truth (no-undef, run after
    // the move) showed the hand-shape/arpeggio cluster is called into from
    // many more places in the closure than the original 4-function estimate.
    return {
        chordShapeSignature, chordWireHighDensity, chordTemplateLabel,
        chordTemplateMarkedArpeggio, handShapeMarkedArpeggio, chordHandShapeArpeggioHint,
        mergeHandShapeSynthChords, resetStringDependentCaches, mergeChordShape,
        hsStart, hsEnd, hsChordIdNorm, handShapeChartSpanSec, inferArpeggioFromNotePattern,
        chordShapeCoveredByStandaloneNotes, arpeggioChordIdForNote, fillArpeggioGhostInferFlags,
    };
}

/** Harmony annotations (§6.3.1 / §6.6): display labels for a chord's
 * function (instance `fn.rn` Roman numeral) and template `voicing`,
 * `caged` shape, and `guideTones`. '' for each when absent/malformed;
 * `caged`/`guideTones` come back pre-formatted ("CAGED: E" / "gt 4,10").
 * Pure; shared with the 2D highway and node-tested. Display only — never
 * grading. */
export function chordHarmonyLabels(fn, voicing, caged, guideTones) {
    const rn = (fn && typeof fn.rn === 'string') ? fn.rn.trim() : '';
    const vc = (typeof voicing === 'string') ? voicing.trim() : '';
    const cg = (typeof caged === 'string' && /^[CAGED]$/.test(caged.trim()))
        ? 'CAGED: ' + caged.trim() : '';
    const gt = Array.isArray(guideTones)
        ? guideTones.filter(n => Number.isInteger(n) && n >= 0 && n <= 11) : [];
    return { rn, voicing: vc, caged: cg, guideTones: gt.length ? 'gt ' + gt.join(',') : '' };
}
