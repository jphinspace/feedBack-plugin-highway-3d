import {
    ACCENT_NOTE_FILL_BOOST, ACCENT_NOTE_LINGER_EPS, ACCENT_NOTE_STR_GLOW, AHEAD,
    CHORD_HWY_LINGER_S, MAX_RENDER_STRINGS, NEXT_ON_STRING_T_EPS,
} from '../../core/constants.js';
import { lowerBoundT } from '../../core/chart-util.js';

// Per-frame lookahead/gap prepasses -- moved verbatim out of update()
// (Stage 7 Track C). All five feed the standalone-note loop / chord loop
// (via _noteFrame / noteState) as explicit params or return values; bundled
// into one file since they're a tight chain (each reads a scratch buffer
// the previous one just filled).
//
// _scrNextNoteByString / _scrNextNoteByStringData / _scrRecentByString /
// _scrGhostLastT are used nowhere else in main.js (verified via whole-file
// grep) -- moved to be genuinely private state of this factory, same
// "own it outright" upgrade chords.js's _scrChordNote got.
//
// _scrGhostPrevBuf stays an injected dep (not private) because it's ALSO
// handed to note.js/chords.js at construction time as the same Map
// reference those modules read from later in the same frame.
export function createLookaheadPrepasses({ validString, filterValidNotes, _scrGhostPrevBuf }) {
    const _scrNextNoteByString = new Array(MAX_RENDER_STRINGS).fill(null);
    const _scrNextNoteByStringData = Array.from({ length: MAX_RENDER_STRINGS }, () => ({}));
    const _scrRecentByString = new Array(MAX_RENDER_STRINGS).fill(-Infinity);
    const _scrGhostLastT = new Array(MAX_RENDER_STRINGS).fill(-Infinity);

    // Ghost projection window is 0.6s; fretLastActiveTime needs +2s.
    // Use lowerBoundT to skip past notes and break at +2s.
    function computeNextNoteByString(notes, chords, now, nStr, fretLastActiveTime) {
        _scrNextNoteByString.fill(null, 0, nStr);
        const nextNoteByString = _scrNextNoteByString;
        if (notes) {
            const _nnLo = lowerBoundT(notes, now);
            for (let _ni = _nnLo; _ni < notes.length; _ni++) {
                const n = notes[_ni];
                if (n.t > now + 2) break;
                if (!validString(n.s)) continue;
                if (!nextNoteByString[n.s] || n.t < nextNoteByString[n.s].t) nextNoteByString[n.s] = n;
                if (n.f > 0) fretLastActiveTime[n.f] = now;
            }
        }
        if (chords) {
            // Time-sorted: lowerBoundT skips past historical chords in O(log N)
            // instead of walking the entire prefix every frame.
            const _ncLo = lowerBoundT(chords, now);
            for (let _ci = _ncLo; _ci < chords.length; _ci++) {
                const ch = chords[_ci];
                if (ch.t > now + 2) break;
                if (!ch.notes || ch.t <= now) continue;
                for (const cn of ch.notes) {
                    if (!validString(cn.s)) continue;
                    if (!nextNoteByString[cn.s] || ch.t < nextNoteByString[cn.s].t) {
                        // Reuse per-string scratch object — avoids `{ ...cn, t }` spread allocation.
                        const _sd = _scrNextNoteByStringData[cn.s];
                        Object.assign(_sd, cn);
                        _sd.t = ch.t;
                        nextNoteByString[cn.s] = _sd;
                    }
                    if (cn.f > 0) fretLastActiveTime[cn.f] = now;
                }
            }
        }
        return nextNoteByString;
    }

    // Once a note/chord passes `now` it leaves _drawNextByString, resetting
    // _nextAnyT and letting old gems linger too long. Scan back at least
    // CHORD_HWY_LINGER_S so the deadline logic can see every event that
    // lands inside any active linger window (chord frame linger and gem
    // linger both cap at CHORD_HWY_LINGER_S — a tighter scan would miss
    // events in (now - CHORD_HWY_LINGER_S, now - 0.6) and let the frame
    // linger past the next event).
    function computeRecentByString(notes, chords, now, nStr) {
        const _recArr = _scrRecentByString;
        for (let i = 0; i < nStr; i++) _recArr[i] = -Infinity;
        if (notes) {
            let _ri = lowerBoundT(notes, now);
            for (let i = _ri - 1; i >= 0; i--) {
                const n = notes[i];
                if (n.t < now - CHORD_HWY_LINGER_S) break;
                if (validString(n.s) && n.t > _recArr[n.s]) _recArr[n.s] = n.t;
            }
        }
        if (chords) {
            // Time-sorted: start at the last chord ≤ now instead of
            // chords.length-1 (which walks past every future chord when
            // `now` is early in the song).
            //
            // lowerBoundT returns the first index with t >= now. If chords
            // share the same timestamp, walk forward through the t===now
            // run to the LAST one (so all duplicates at `now` are included
            // — the original `if (ch.t > now) continue` scan-from-end
            // included them all). When no chord is exactly at `now`, start
            // one slot back.
            const _ncHi = lowerBoundT(chords, now);
            let _ci = _ncHi;
            if (_ci < chords.length && chords[_ci].t === now) {
                while (_ci + 1 < chords.length && chords[_ci + 1].t === now) _ci++;
            } else {
                _ci -= 1;
            }
            for (; _ci >= 0; _ci--) {
                const ch = chords[_ci];
                if (ch.t < now - CHORD_HWY_LINGER_S) break;
                if (!ch.notes) continue;
                for (const cn of ch.notes) {
                    if (validString(cn.s) && ch.t > _recArr[cn.s]) _recArr[cn.s] = ch.t;
                }
            }
        }
        return _recArr;
    }

    // Populate the scalar scratch used by _firstEventTimeGreaterThan — at
    // most 2 * nStr finite values, then sorted ascending. Float64Array.
    // subarray returns a view, so .sort() runs in place over the live
    // prefix without copying or allocating. `scrEventTimes` is main.js's
    // own Float64Array (injected per-call, not a dep, since the caller
    // -- _firstEventTimeGreaterThan -- stays main.js-resident and reads
    // it via closure); the returned length is what main.js reassigns
    // onto its own bare `_scrEventTimesLen` closure let.
    function computeEventTimesUnion(nextNoteByString, recentByString, nStr, scrEventTimes) {
        let len = 0;
        for (let s = 0; s < nStr; s++) {
            const nf = nextNoteByString[s];
            if (nf) {
                const tn = nf.t;
                if (Number.isFinite(tn)) scrEventTimes[len++] = tn;
            }
            const rt = recentByString[s];
            if (Number.isFinite(rt)) scrEventTimes[len++] = rt;
        }
        if (len > 1) {
            scrEventTimes.subarray(0, len).sort();
        }
        return len;
    }

    // For each note/chord in the upcoming 0.65s window, record the onset
    // time of its immediate predecessor on the same string. drawNote() uses
    // this to shrink the ghost preview window from the fixed 0.6s down to
    // min(0.6, gap) so in dense passages the fret label doesn't float 0.6s
    // ahead with no gem in sight.
    //
    // Two-pointer merge over time-sorted notes + chords so the predecessor
    // is correct even when notes and chords interleave. Map with numeric
    // key avoids per-frame string allocation; key = Math.round(t*1e4)*10 + s
    // (unique for notes > 0.1 ms apart).
    function computeGhostPrevGap(notes, chords, now, nStr) {
        _scrGhostPrevBuf.clear();
        for (let _i = 0; _i < nStr; _i++) _scrGhostLastT[_i] = -Infinity;
        const _gLastT = _scrGhostLastT;
        let _gni = notes ? lowerBoundT(notes, now - 1) : 0;
        let _gci = 0;
        if (chords) while (_gci < chords.length && chords[_gci].t < now - 1) _gci++;
        while (true) {
            const nt = (notes && _gni < notes.length) ? notes[_gni].t : Infinity;
            const ct = (chords && _gci < chords.length) ? chords[_gci].t : Infinity;
            const minT = nt <= ct ? nt : ct;
            if (minT > now + 0.65 || minT === Infinity) break;
            if (nt <= ct) {
                const n = notes[_gni++];
                if (validString(n.s)) {
                    _scrGhostPrevBuf.set(Math.round(n.t * 1e4) * 10 + n.s, _gLastT[n.s]);
                    _gLastT[n.s] = n.t;
                }
            } else {
                const ch = chords[_gci++];
                if (ch.notes) for (const cn of ch.notes) {
                    if (validString(cn.s)) {
                        _scrGhostPrevBuf.set(Math.round(ch.t * 1e4) * 10 + cn.s, _gLastT[cn.s]);
                        _gLastT[cn.s] = ch.t;
                    }
                }
            }
        }
    }

    // Ramp strGlow while the board ghost is visible so the flying note core
    // + rim read as one solid string-coloured shape with proj. Window is
    // (0, PROJ_WIN_MERGE=0.6s) — use lowerBoundT + break.
    function rampStrGlowForUpcomingMerge(notes, chords, now, nextNoteByString, noteState) {
        const PROJ_WIN_MERGE = 0.6;
        if (notes) {
            const _sgLo = lowerBoundT(notes, now);
            for (let _ni = _sgLo; _ni < notes.length; _ni++) {
                const n = notes[_ni];
                if (!validString(n.s) || n.f <= 0) continue;
                const dt = n.t - now;
                if (dt >= PROJ_WIN_MERGE) break;
                const nn = nextNoteByString[n.s];
                if (!nn || Math.abs(nn.t - n.t) > NEXT_ON_STRING_T_EPS) continue;
                const blend = 1 - dt / PROJ_WIN_MERGE;
                noteState.strGlow[n.s] = Math.max(noteState.strGlow[n.s], 1.0 + blend * 1.2);
            }
        }
        if (chords) {
            const _projLo = lowerBoundT(chords, now);
            for (let projChordIdx = _projLo; projChordIdx < chords.length; projChordIdx++) {
                const ch = chords[projChordIdx];
                if (!ch.notes || ch.t <= now) continue;
                const dt = ch.t - now;
                if (dt >= PROJ_WIN_MERGE) break;
                const chordNotes = filterValidNotes(ch.notes);
                for (const cn of chordNotes) {
                    if (cn.f <= 0) continue;
                    const nn = nextNoteByString[cn.s];
                    if (!nn || Math.abs(nn.t - ch.t) > NEXT_ON_STRING_T_EPS) continue;
                    const blend = 1 - dt / PROJ_WIN_MERGE;
                    noteState.strGlow[cn.s] = Math.max(noteState.strGlow[cn.s], 1.0 + blend * 1.2);
                }
            }
        }
    }

    // Accent: brighter note body (`mGlow` in drawNote) instead of the old
    // '>' sprite. Notes are sorted — break once past the AHEAD window.
    function applyAccentGlow(notes, chords, now, noteState) {
        if (notes) {
            const _acLo = lowerBoundT(notes, now - AHEAD);
            for (let _ni = _acLo; _ni < notes.length; _ni++) {
                const n = notes[_ni];
                if (!validString(n.s) || !n.ac) continue;
                const dt = n.t - now;
                if (dt > AHEAD) break;
                const susEnd = n.t + (n.sus || 0);
                const hasSus = (n.sus || 0) > 0;
                if (dt < -ACCENT_NOTE_LINGER_EPS && (!hasSus || now > susEnd)) continue;
                noteState.strGlow[n.s] = Math.max(noteState.strGlow[n.s], ACCENT_NOTE_STR_GLOW);
                noteState.accentFillBoost[n.s] = Math.max(
                    noteState.accentFillBoost[n.s],
                    ACCENT_NOTE_FILL_BOOST,
                );
            }
        }
        if (chords) {
            const _acChordLo = lowerBoundT(chords, now - 30);
            for (let _aci = _acChordLo; _aci < chords.length; _aci++) {
                const ch = chords[_aci];
                if (!ch.notes) continue;
                const dt = ch.t - now;
                if (dt > AHEAD) break;
                const chordNotes = filterValidNotes(ch.notes);
                if (!chordNotes.length) continue;
                let maxSus = 0;
                for (const x of chordNotes) if ((x.sus || 0) > maxSus) maxSus = x.sus;
                const susEnd = ch.t + maxSus;
                const hasChordSus = maxSus > 0;
                if (dt < -ACCENT_NOTE_LINGER_EPS && (!hasChordSus || now > susEnd)) continue;
                for (const cn of chordNotes) {
                    if (!validString(cn.s) || !cn.ac) continue;
                    noteState.strGlow[cn.s] = Math.max(noteState.strGlow[cn.s], ACCENT_NOTE_STR_GLOW);
                    noteState.accentFillBoost[cn.s] = Math.max(
                        noteState.accentFillBoost[cn.s],
                        ACCENT_NOTE_FILL_BOOST,
                    );
                }
            }
        }
    }

    return {
        computeNextNoteByString, computeRecentByString, computeEventTimesUnion,
        computeGhostPrevGap, rampStrGlowForUpcomingMerge, applyAccentGlow,
    };
}
