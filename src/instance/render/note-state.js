import { VENUE_GEM_EMISSIVE_MUL } from '../../core/constants.js';
import { lowerBoundT } from '../../core/chart-util.js';
import { _venueSceneOverride } from '../../background/venue.js';

/**
 * Per-string sustain/anticipation/fretHeat/glow state. `buildFrameState()`
 * wraps persistent scratch arrays (deps, same objects every call) — the
 * returned `noteState` is a stable-shaped view over them, not new per-call
 * state. It is not fully populated by this call alone: other still-resident
 * `update()` sections (next-note-by-string lookahead, recent-past event per
 * string, ghost preview gap prepass) continue writing into
 * `noteState.strGlow`/`.accentFillBoost` after this returns, before
 * {@link updateStringHighlights} finally consumes it — safe since they all
 * hold the same object/array references. `updateStringHighlights()` is
 * always the last consumer each frame, called separately once those other
 * sections have finished writing.
 */
export function createFrameState({
    validString, filterValidNotes, ctx, mGlow, mAccentCore,
    _scrStringSustain, _scrStringAnticipation, _scrFretHeat, _scrStrGlow, _scrAccentFillBoost,
}) {
    function buildFrameState(notes, chords, now, nStr) {
        // Reuse hoisted scratch arrays — reset only the live range instead of allocating fresh.
        _scrStringSustain.fill(false, 0, nStr);
        _scrStringAnticipation.fill(0, 0, nStr);
        _scrFretHeat.fill(0);           // always NFRETS+1, cheap flat fill
        _scrStrGlow.fill(0.5, 0, nStr);
        _scrAccentFillBoost.fill(0, 0, nStr);
        const noteState = {
            stringSustain:    _scrStringSustain,
            stringAnticipation: _scrStringAnticipation,
            fretHeat:         _scrFretHeat,
            strGlow:          _scrStrGlow,
            /** Per-string extra drive for `.ac` gem fill only (`mAccentCore`). */
            accentFillBoost:  _scrAccentFillBoost,
        };

        // lowerBoundT skips notes far in the past (>30s sustain is unrealistic); breaks once
        // notes are >2s ahead (nothing beyond contributes to fretHeat/anticipation/strGlow).
        if (notes) {
            const _fsLo = lowerBoundT(notes, now - 30);
            for (let _ni = _fsLo; _ni < notes.length; _ni++) {
                const n = notes[_ni];
                if (!validString(n.s)) continue;
                const dt = n.t - now;
                if (dt > 2.0) break;
                const susEnd = n.t + (n.sus || 0);
                if (dt > 0 && dt < 0.6)
                    noteState.stringAnticipation[n.s] = Math.max(noteState.stringAnticipation[n.s], 1 - dt / 0.6);
                if (n.f > 0) {
                    if (now >= n.t && now <= susEnd) noteState.fretHeat[n.f] = 1;
                    else if (n.t > now) noteState.fretHeat[n.f] = Math.max(noteState.fretHeat[n.f], Math.max(0, 1 - dt / 2));
                }
                if (now >= n.t && now <= susEnd) noteState.stringSustain[n.s] = true;
                const sustained = dt < 0 && (n.sus || 0) > 0 && now <= susEnd;
                const hitDist = Math.abs(dt);
                if (hitDist < 0.15 || sustained) {
                    const hitFade = sustained ? 0.7 : (1 - hitDist / 0.15);
                    noteState.strGlow[n.s] = Math.max(noteState.strGlow[n.s], 1.0 + hitFade * 1.5);
                }
            }
        }
        if (chords) {
            const _cfsLo = lowerBoundT(chords, now - 30);
            for (let _cni = _cfsLo; _cni < chords.length; _cni++) {
                const ch = chords[_cni];
                if (!ch.notes) continue;
                const dt = ch.t - now;
                if (dt > 2.0) break;
                const chordNotes = filterValidNotes(ch.notes);
                if (chordNotes.length === 0) continue;
                let maxSus = 0;
                for (const n of chordNotes) if ((n.sus || 0) > maxSus) maxSus = n.sus;
                const susEnd = ch.t + maxSus;
                for (const cn of chordNotes) {
                    if (dt > 0 && dt < 0.6)
                        noteState.stringAnticipation[cn.s] = Math.max(noteState.stringAnticipation[cn.s], 1 - dt / 0.6);
                    if (cn.f > 0) {
                        if (now >= ch.t && now <= susEnd) { noteState.fretHeat[cn.f] = 1; continue; }
                        if (ch.t > now) noteState.fretHeat[cn.f] = Math.max(noteState.fretHeat[cn.f], Math.max(0, 1 - dt / 2));
                    }
                }
                if (now >= ch.t && now <= susEnd)
                    for (const cn of chordNotes) noteState.stringSustain[cn.s] = true;
                const sustained = dt < 0 && maxSus > 0 && now <= susEnd;
                const hitDist = Math.abs(dt);
                if (hitDist < 0.15 || sustained) {
                    const hitFade = sustained ? 0.7 : (1 - hitDist / 0.15);
                    for (const cn of chordNotes) {
                        noteState.strGlow[cn.s] = Math.max(noteState.strGlow[cn.s], 1.0 + hitFade * 1.5);
                    }
                }
            }
        }
        return noteState;
    }

    /**
     * The glow slider scales both the idle floor and anticipation peak, so
     * `glowMul=0` fully silences the per-string emissive pulse. Vibrancy
     * controls the idle opacity floor; anticipation still rides on top
     * regardless, so play-feedback through the opacity channel survives
     * even at `glowMul=0`. `glowMul`/`_vibrancyIdleOp` are explicit
     * per-call parameters (not construction-time deps) since they're
     * settings-driven and can change mid-song.
     */
    function updateStringHighlights(noteState, nStr, glowMul, _vibrancyIdleOp) {
        const BASE_GLOW = 0.02 * glowMul;
        const MAX_GLOW  = 3.5  * glowMul;
        const IDLE_OP   = _vibrancyIdleOp;
        const g = glowMul;
        const venueGemMul = _venueSceneOverride ? VENUE_GEM_EMISSIVE_MUL : 1;

        for (let s = 0; s < nStr; s++) {
            const mesh = ctx.board.stringLines[s];
            if (mesh) {
                const intensity = Math.max(
                    noteState.stringSustain[s] ? 1 : 0,
                    noteState.stringAnticipation[s] || 0,
                );
                mesh.material.emissiveIntensity = BASE_GLOW + intensity * MAX_GLOW;
                mesh.material.opacity = IDLE_OP + intensity * (1 - IDLE_OP);
                mesh.scale.set(1, 1 + intensity * 0.3, 1 + intensity * 0.3);
            }
            // Glow slider scales this too, since this assignment stomps anything _applyGlow() set statically.
            const bg = noteState.strGlow[s] * g;
            if (mGlow[s]) mGlow[s].emissiveIntensity = bg * venueGemMul;
            if (mAccentCore[s]) {
                mAccentCore[s].emissiveIntensity =
                    (bg + noteState.accentFillBoost[s] * g) * venueGemMul;
            }
        }
    }

    return { buildFrameState, updateStringHighlights };
}
