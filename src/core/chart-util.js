import { MAX_RENDER_STRINGS, NSTR, NFRETS, DOTS } from './constants.js';

/** Resolves the active string count from `bundle.stringCount`, falling back to arrangement name. */
export function resolveStringCount(bundle) {
    const sc = bundle && bundle.stringCount;
    if (Number.isFinite(sc) && sc >= 1) {
        return Math.min(Math.trunc(sc), MAX_RENDER_STRINGS);
    }
    return /bass/i.test(bundle?.songInfo?.arrangement || '') ? 4 : NSTR;
}

/** Semitone-indexed note names, sharp spelling. */
export const _NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Open-string MIDI numbers (thick to thin) for each supported tuning. */
export const _BASE_OPEN_MIDI_BASS4 = Object.freeze([28, 33, 38, 43]);
export const _BASE_OPEN_MIDI_BASS5 = Object.freeze([23, 28, 33, 38, 43]);
export const _BASE_OPEN_MIDI_GUITAR6 = Object.freeze([40, 45, 50, 55, 59, 64]);
export const _BASE_OPEN_MIDI_GUITAR7 = Object.freeze([35, 40, 45, 50, 55, 59, 64]);
export const _BASE_OPEN_MIDI_GUITAR8 = Object.freeze([28, 35, 40, 45, 50, 55, 59, 64]);

/**
 * Base open-string MIDI numbers for a string count and arrangement, before
 * any chart tuning offset or capo is applied.
 * @param {number} sc - string count
 * @param {string} [arrangement] - arrangement name, checked for "bass"
 * @returns {number[]}
 */
export function _baseOpenStringMidis(sc, arrangement) {
    const isBass = /bass/i.test(arrangement || '');
    if (sc === 4 && isBass) return _BASE_OPEN_MIDI_BASS4.slice();
    if (sc === 4) return _BASE_OPEN_MIDI_GUITAR6.slice(0, 4);
    if (sc === 5 && isBass) return _BASE_OPEN_MIDI_BASS5.slice();
    if (sc === 5) return _BASE_OPEN_MIDI_GUITAR6.slice(0, 5);
    if (sc === 7) return _BASE_OPEN_MIDI_GUITAR7.slice();
    if (sc === 8) return _BASE_OPEN_MIDI_GUITAR8.slice();
    if (Number.isFinite(sc) && sc > 8) {
        const out = Array.from(_BASE_OPEN_MIDI_GUITAR8);
        let last = out[out.length - 1];
        while (out.length < sc) {
            last += 5;
            out.push(last);
        }
        return out.slice(0, sc);
    }
    const g6 = _BASE_OPEN_MIDI_GUITAR6.slice();
    if (Number.isFinite(sc) && sc < 6 && sc >= 1) return g6.slice(0, sc);
    return g6;
}

/** Formats a MIDI note number as a pitch label, e.g. `E2`. */
export function _midiToPitchLabel(midi) {
    const m = Math.round(midi);
    const octave = Math.floor(m / 12) - 1;
    const n = _NOTE_NAMES_SHARP[(m % 12 + 12) % 12];
    return n + octave;
}

/**
 * Open-string pitch labels for the active tuning and capo.
 * @param {object} bundle - render bundle; preferred source for tuning/capo
 * @param {Record<string, unknown>} songInfo - fallback source for tuning/capo
 * @param {number} nEffective - string count clamped like `resolveStringCount`
 * @returns {string[]}
 */
export function _openStringPitchLabelsForTuning(bundle, songInfo, nEffective) {
    const n = Number.isFinite(nEffective) ? Math.min(Math.max(1, Math.trunc(nEffective)), MAX_RENDER_STRINGS) : resolveStringCount(bundle);
    let tuning = Array.isArray(bundle.tuning) ? bundle.tuning : (songInfo && songInfo.tuning);
    let cap = bundle.capo;
    cap = Number.isFinite(cap) ? cap : (songInfo && Number.isFinite(songInfo.capo) ? songInfo.capo : 0);
    if (!Array.isArray(tuning)) tuning = [];

    const base = _baseOpenStringMidis(n, songInfo?.arrangement);
    const labels = [];
    for (let s = 0; s < n; s++) {
        const offRaw = tuning[s];
        const off = Number.isFinite(offRaw) ? offRaw : 0;
        const midi = (base[s] !== undefined ? base[s] : 40) + off + cap;
        labels.push(_midiToPitchLabel(midi));
    }
    return labels;
}

/** Fret-column marker spacing around a chart anchor: markers before/after the nearest cadence cell. */
export const FRET_COL_MARKER_ANCHOR_BACK = 2;
export const FRET_COL_MARKER_ANCHOR_FWD = 3;

/**
 * Fret-column reference-marker positions around a chart anchor.
 * @param {number} anchorFret - chart anchor `.fret`
 * @param {number[]} [cadence] - ascending frets to choose markers from
 * @returns {number[]}
 */
export function fretColumnMarkersForAnchor(anchorFret, cadence = DOTS) {
    const f0 = Math.round(Number(anchorFret));
    if (!Number.isFinite(f0) || cadence.length === 0) return cadence.slice();
    let iBest = 0;
    let dBest = Infinity;
    for (let i = 0; i < cadence.length; i++) {
        const d = Math.abs(cadence[i] - f0);
        if (d < dBest || (d === dBest && cadence[i] < cadence[iBest])) {
            dBest = d;
            iBest = i;
        }
    }
    const i0 = Math.max(0, iBest - FRET_COL_MARKER_ANCHOR_BACK);
    const i1 = Math.min(cadence.length, iBest + FRET_COL_MARKER_ANCHOR_FWD + 1);
    return cadence.slice(i0, i1);
}

/** Encodes a `(chartTime, string)` pair as a single safe integer key, for Set/Map lookups. */
export function _noteKey(t, s) { return ((t * 10000 + 0.5) | 0) * 10 + s; }

/**
 * Binary-search lower bound: the first index `i` where `arr[i].t >= t`.
 * Prefer `bundle.lowerBoundT`/`bundle.lowerBoundTime` when a bundle is
 * available; this exists for call sites that don't hold one.
 * @param {{t: number}[]} arr - ascending-sorted by `.t`
 * @param {number} t
 * @returns {number}
 */
export function lowerBoundT(arr, t) {
    let lo = 0, hi = arr.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (arr[mid].t < t) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

/**
 * Chart time of the first fretted event that can still affect the camera at
 * `now`, or the next fretted onset after it — used once per song to frame
 * the opening phrase during a silent intro. Open strings and out-of-range
 * strings are ignored.
 * @param {object[]} notes
 * @param {object[]} chords
 * @param {number} now
 * @param {number} behind - seconds before `now` still considered live
 * @param {number} stringCount
 * @returns {number | null}
 */
export function hwyFirstRelevantFrettedTime(notes, chords, now, behind, stringCount) {
    const nStrings = Number.isFinite(stringCount) ? Math.max(0, Math.floor(stringCount)) : 0;
    const cameraFloor = now - Math.max(0, Number(behind) || 0);
    let first = Infinity;

    const validFretted = n => n
        && n.f > 0
        && Number.isInteger(n.s)
        && n.s >= 0
        && n.s < nStrings;
    const consider = (eventTime, sustain) => {
        const t = Number(eventTime);
        if (!Number.isFinite(t)) return;
        const sus = Number(sustain);
        const end = t + (Number.isFinite(sus) && sus > 0 ? sus : 0);
        if (t < cameraFloor && end < now) return;
        const relevantTime = t <= now ? now : t;
        if (relevantTime < first) first = relevantTime;
    };

    if (notes) {
        for (const n of notes) {
            if (validFretted(n)) consider(n.t, n.sus);
        }
    }
    if (chords) {
        for (const ch of chords) {
            if (!ch || !ch.notes) continue;
            for (const cn of ch.notes) {
                if (validFretted(cn)) consider(ch.t, cn.sus);
            }
        }
    }
    return Number.isFinite(first) ? first : null;
}

/**
 * The last arrangement `<anchor>` at or before chart time `t`.
 * @param {{time: number}[]} anchorArr - ascending-sorted by `.time`
 * @param {number} t
 * @returns {object | null}
 */
export function getChartAnchorAt(anchorArr, t) {
    if (!anchorArr || !anchorArr.length) return null;
    let lo = 0, hi = anchorArr.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (anchorArr[mid].time <= t) lo = mid + 1;
        else hi = mid;
    }
    return lo === 0 ? anchorArr[0] : anchorArr[lo - 1];
}

/**
 * Highway-lane diagram span (0-indexed) for a chart anchor.
 * @returns {{ dMin: number, dMax: number } | null}
 */
export function laneBoundsFromAnchor(anc) {
    if (!anc) return null;
    let fStart = Math.round(Number(anc.fret));
    if (!Number.isFinite(fStart) || fStart < 1) fStart = 1;
    let w = Number(anc.width);
    if (!Number.isFinite(w)) w = 4;
    w = Math.max(1, Math.round(w));
    const fLast = Math.min(NFRETS, fStart + w - 1);
    const dMin = Math.max(0, fStart - 1);
    const dMax = Math.min(NFRETS, fLast);
    return { dMin, dMax };
}

/** Same span as {@link laneBoundsFromAnchor}, for the anchor active at chart time `t`. */
export function anchorLaneBoundsAt(anchorArr, t) {
    if (!anchorArr || !anchorArr.length) return null;
    return laneBoundsFromAnchor(getChartAnchorAt(anchorArr, t));
}

/**
 * Inclusive chart-fret indices for the playing window (anchor `fret` +
 * `width`), e.g. fret=5 width=4 -> 5..8. Unlike {@link laneBoundsFromAnchor}'s
 * `dMin`/`dMax` (diagram wire span), these are the labels shown on gems and
 * row numbers.
 * @returns {{ f0: number, f1: number } | null}
 */
export function anchorPlayedFretInclusiveSpan(anc) {
    if (!anc) return null;
    let f0 = Math.round(Number(anc.fret));
    if (!Number.isFinite(f0) || f0 < 1) f0 = 1;
    let w = Number(anc.width);
    if (!Number.isFinite(w)) w = 4;
    w = Math.max(1, Math.round(w));
    const f1 = Math.min(NFRETS, f0 + w - 1);
    return { f0, f1 };
}

/** Same span as {@link anchorPlayedFretInclusiveSpan}, for the anchor active at chart time `t`. */
export function anchorPlayedFretSpanAt(anchorArr, t) {
    if (!anchorArr || !anchorArr.length) return null;
    return anchorPlayedFretInclusiveSpan(getChartAnchorAt(anchorArr, t));
}

/** Estimates BPM from the beats nearest chart time `t`, defaulting to 120 when unavailable. */
export function computeBPM(beats, t) {
    if (!beats || beats.length < 2) return 120;
    let lo = 0, hi = beats.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (beats[mid].time < t) lo = mid + 1; else hi = mid;
    }
    let closest = lo;
    if (lo === beats.length) closest = beats.length - 1;
    else if (lo > 0 && Math.abs(beats[lo - 1].time - t) < Math.abs(beats[lo].time - t)) closest = lo - 1;
    const start = Math.max(0, closest - 2);
    const end = Math.min(beats.length - 1, closest + 2);
    let sum = 0, count = 0;
    for (let i = start; i < end; i++) {
        const dt = beats[i + 1].time - beats[i].time;
        if (dt > 0) { sum += dt; count++; }
    }
    return count > 0 && sum > 0 ? 60 / (sum / count) : 120;
}
