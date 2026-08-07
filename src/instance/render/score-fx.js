// Score FX (notedetect game-scoring layer, notedetect >=1.13) -- moved
// verbatim out of main.js (Stage 7, post-3e). Two channels: (1) per-note
// "+N" score pops, sourced from the note-state provider's { points, mult,
// popKey } fields at the moment a gem's verdict lands; (2) session-level
// bursts/pulses from the `notedetect:fx` event (streak milestones,
// multiplier tier changes). Everything renders on the 2D overlay canvas --
// no Three.js objects, nothing to dispose. Pools are fixed-size slot arrays
// created once per factory instance; when all slots are busy a new effect
// is simply dropped. See CLAUDE.md's "Score FX" section for the full
// consumer contract (this is the reference implementation other renderer
// plugins copy).
//
// fxSpawnPop / fxHandle / fxResolvePalette are injected as deps into
// note.js and instance/notedetect/listeners.js respectively (unchanged --
// those two files already treated them as deps before this move, so only
// the construction/injection sites in main.js needed updating).
//
// getCam/getProbe/getNStr/getNoteDetectFrameNowMs are live getters, not
// deps snapshots: cam/_probe are (re)assigned by createDomAndScene() inside
// initScene() (same reassignment shape bloom-composer.js already treats
// this way), nStr is recomputed every update() call, and
// noteDetectFrameNowMs is written by update() at the top of every frame.
// sY and noteDetectLabels are stable per-init references (sY is a `const`
// arrow function; noteDetectLabels is the same array reference note.js
// already receives as a plain dep, mutated in place via `.length = 0` and
// `.push()`, only ever REPLACED at teardown()/next-init() -- same lifetime
// as this whole factory).
export function createScoreFx({ getCam, getProbe, sY, getNStr, noteDetectLabels, getNoteDetectFrameNowMs }) {
    const _FX_POP_LIFE_MS = 700;
    const _FX_BURST_LIFE_MS = 900;
    const _FX_BURST_N = 36;
    const _fxPops = Array.from({ length: 24 }, () => (
        { active: false, x: 0, y: 0, z: 0, bornMs: 0, text: '', mult: 1 }
    ));
    const _fxBursts = Array.from({ length: 4 }, () => ({
        active: false, bornMs: 0,
        px: new Float32Array(_FX_BURST_N), py: new Float32Array(_FX_BURST_N),
        vx: new Float32Array(_FX_BURST_N), vy: new Float32Array(_FX_BURST_N),
    }));
    // popKey -> expiry ms. Dedupes pops (chord members share the chord's
    // popKey; sustains keep returning points for the whole glow window).
    const _fxSeen = new Map();
    // Generation counter: bumped by teardownScoreFx() so the deferred
    // window-copy fallback in notedetect/listeners.js (a zero-delay task
    // the listener removal can't cancel) bails instead of re-arming ring/
    // burst state after teardown.
    let _fxGen = 0;
    let _fxLastFxDetail = null;  // reference dedup: window + instanceRoot dispatches share one detail
    let _fxRingMs = -1e9;        // multiplier ring-pulse anchor
    let _fxRingMult = 1;
    // Canvas-side palette per notedetect skin (mirrors the accents in
    // notedetect's assets/plugin.css; fonts are document-loaded by that
    // stylesheet so the overlay canvas can use the family names).
    const _FX_PALETTES = {
        neon:    { accent: '#00f0ff', accent2: '#ff2ec4', font: 'Orbitron' },
        esports: { accent: '#e8b43a', accent2: '#f5f5f4', font: 'Rajdhani' },
        metal:   { accent: '#ffb347', accent2: '#ff6b35', font: 'Russo One' },
    };
    let _fxPalette = _FX_PALETTES.neon;

    function fxResolvePalette() {
        let skin = null;
        try { skin = localStorage.getItem('feedBack_notedetect_skin'); } catch (e) {}
        _fxPalette = _FX_PALETTES[skin] || _FX_PALETTES.neon;
    }

    function fxSpawnPop(popKey, points, mult, x, y, z) {
        if (_fxSeen.has(popKey)) return;
        const nowMs = getNoteDetectFrameNowMs() || performance.now();
        _fxSeen.set(popKey, nowMs + 4000);
        for (let i = 0; i < _fxPops.length; i++) {
            const p = _fxPops[i];
            if (p.active) continue;
            p.active = true;
            p.x = x; p.y = y; p.z = z;
            p.bornMs = nowMs;
            p.text = '+' + points;
            p.mult = mult || 1;
            return;
        }
    }

    function fxSpawnBurst(nowMs) {
        for (let i = 0; i < _fxBursts.length; i++) {
            const b = _fxBursts[i];
            if (b.active) continue;
            b.active = true;
            b.bornMs = nowMs;
            for (let j = 0; j < _FX_BURST_N; j++) {
                const a = (j / _FX_BURST_N) * Math.PI * 2;
                const sp = 2 + (j % 5) * 0.8;
                b.px[j] = 0; b.py[j] = 0;
                b.vx[j] = Math.cos(a) * sp;
                b.vy[j] = Math.sin(a) * sp - 1.2;
            }
            return;
        }
    }

    function fxHandle(d) {
        // Reference dedup — notedetect dispatches the SAME detail object
        // on window and on its instanceRoot; whichever arrives first wins.
        if (d === _fxLastFxDetail) return;
        _fxLastFxDetail = d;
        const nowMs = performance.now();
        if (d.fxType === 'milestone') {
            fxSpawnBurst(nowMs);
        } else if (d.fxType === 'multiplier' && d.mult > (d.prevMult || 1)) {
            _fxRingMs = nowMs;
            _fxRingMult = d.mult;
        }
        // NOTE: 'streakBreak' is deliberately unhandled. It used to arm a
        // full-screen red flash; that effect was removed outright (it washed
        // the whole panel mid-song, including the notes you were trying to
        // read). The event is simply ignored now. The other streak feedback —
        // the hit-heat spark escalation gated on _streakFx in drawNote — is
        // unaffected. Don't reintroduce a full-panel fill here.
    }

    function drawNotedetectLabels(ctx2d, W, H) {
        const cam = getCam(), _probe = getProbe();
        if (!noteDetectLabels.length || !cam || !_probe) return;
        ctx2d.save();
        ctx2d.font = 'bold 12px sans-serif';
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'middle';
        for (const item of noteDetectLabels) {
            _probe.set(item.x, item.y, item.z);
            _probe.project(cam);
            if (_probe.z < -1 || _probe.z > 1) continue;
            const sx = (_probe.x * 0.5 + 0.5) * W;
            const sy = (-_probe.y * 0.5 + 0.5) * H;
            for (let i = 0; i < item.labels.length; i++) {
                const label = item.labels[i];
                const y = sy + (i - (item.labels.length - 1) / 2) * 15;
                ctx2d.lineWidth = 4;
                ctx2d.strokeStyle = 'rgba(0,0,0,0.8)';
                ctx2d.strokeText(label.text, sx, y);
                ctx2d.fillStyle = label.color;
                ctx2d.fillText(label.text, sx, y);
            }
        }
        ctx2d.restore();
    }

    // Score FX overlay pass — "+N" pops rising off their gems, milestone
    // particle bursts / multiplier ring-pulses anchored on the strike line.
    // Same overlay layer + projection pattern as drawNotedetectLabels;
    // costs one early-out when nothing is active.
    //
    // NOTE (pre-existing, verified via extraction, NOT introduced by this
    // move): the parameter is named `ctx` (shadowing the module's own
    // per-instance `ctx` concept, which this function never received as a
    // dep in the first place) because the ORIGINAL main.js code already
    // named its 2D-canvas-context parameter `ctx` and read `ctx.cam.curX`
    // off it -- CanvasRenderingContext2D has no `.cam` property, so that
    // read is `undefined.curX`, which throws. This function is only called
    // when a "+N" pop, milestone burst, or ring-pulse is actually active
    // (the `if (!anyPop && !anyBurst && ringAge >= 600) return;` guard
    // above it), which requires a live note_detect score provider actively
    // reporting points/mult/popKey -- not exercised by any of this repo's
    // Playwright checks (no scorer is mounted), which is why this has never
    // surfaced. Preserved byte-for-byte per the "no behaviour changes in a
    // move commit" rule; flagged for a follow-up fix, not fixed here.
    function drawScoreFx(ctx, W, H) {
        const cam = getCam(), _probe = getProbe(), nStr = getNStr();
        if (!cam || !_probe) return;
        const nowMs = getNoteDetectFrameNowMs() || performance.now();
        // TTL-prune the pop dedup keys (bounded: only notes hit in the
        // last few seconds).
        if (_fxSeen.size) {
            for (const [k, exp] of _fxSeen) {
                if (exp <= nowMs) _fxSeen.delete(k);
            }
        }
        let anyPop = false;
        for (let i = 0; i < _fxPops.length; i++) {
            if (_fxPops[i].active) { anyPop = true; break; }
        }
        let anyBurst = false;
        for (let i = 0; i < _fxBursts.length; i++) {
            if (_fxBursts[i].active) { anyBurst = true; break; }
        }
        const ringAge = nowMs - _fxRingMs;
        if (!anyPop && !anyBurst && ringAge >= 600) return;

        const pal = _fxPalette;
        ctx.save();

        // Strike-line center in screen px — anchor for bursts + pulses.
        let cx = W / 2, cy = H * 0.72, centerOk = false;
        {
            const fretMidY = (sY(0) + sY(nStr - 1)) / 2;
            _probe.set(ctx.cam.curX, fretMidY, 0);
            _probe.project(cam);
            if (_probe.z >= -1 && _probe.z <= 1) {
                cx = (_probe.x * 0.5 + 0.5) * W;
                cy = (-_probe.y * 0.5 + 0.5) * H;
                centerOk = true;
            }
        }

        // Multiplier ring-pulse: one expanding ring on tier-up; the ×4
        // tier pulses in the secondary accent like the HUD badge.
        if (centerOk && ringAge < 600) {
            const t = ringAge / 600;
            const ease = 1 - Math.pow(1 - t, 2);
            ctx.beginPath();
            ctx.arc(cx, cy, 20 + ease * Math.min(W, H) * 0.28, 0, Math.PI * 2);
            ctx.strokeStyle = _fxRingMult >= 4 ? pal.accent2 : pal.accent;
            ctx.globalAlpha = 0.6 * (1 - t);
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        // Milestone bursts.
        if (anyBurst && centerOk) {
            for (let i = 0; i < _fxBursts.length; i++) {
                const b = _fxBursts[i];
                if (!b.active) continue;
                const age = nowMs - b.bornMs;
                if (age >= _FX_BURST_LIFE_MS) { b.active = false; continue; }
                const t = age / _FX_BURST_LIFE_MS;
                ctx.globalAlpha = 1 - t;
                for (let j = 0; j < _FX_BURST_N; j++) {
                    b.px[j] += b.vx[j];
                    b.py[j] += b.vy[j];
                    b.vy[j] += 0.08;
                    ctx.fillStyle = (j & 1) ? pal.accent : pal.accent2;
                    ctx.fillRect(cx + b.px[j] - 2, cy + b.py[j] - 2, 4, 4);
                }
                ctx.globalAlpha = 1;
            }
        }

        // "+N" pops: rise off the gem and fade over the back half.
        if (anyPop) {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            for (let i = 0; i < _fxPops.length; i++) {
                const p = _fxPops[i];
                if (!p.active) continue;
                const age = nowMs - p.bornMs;
                if (age >= _FX_POP_LIFE_MS) { p.active = false; continue; }
                _probe.set(p.x, p.y, p.z);
                _probe.project(cam);
                if (_probe.z < -1 || _probe.z > 1) continue;
                const t = age / _FX_POP_LIFE_MS;
                const sx = (_probe.x * 0.5 + 0.5) * W;
                const sy2 = (-_probe.y * 0.5 + 0.5) * H - t * 30;
                ctx.globalAlpha = t < 0.4 ? 1 : 1 - (t - 0.4) / 0.6;
                ctx.font = `bold ${13 + (p.mult - 1) * 2}px '${pal.font}', sans-serif`;
                ctx.lineWidth = 4;
                ctx.strokeStyle = 'rgba(0,0,0,0.8)';
                ctx.strokeText(p.text, sx, sy2);
                ctx.fillStyle = pal.accent;
                ctx.fillText(p.text, sx, sy2);
            }
            ctx.globalAlpha = 1;
        }

        ctx.restore();
    }

    // Backward-seek reset: a practice loop / rewind re-judges the same
    // popKeys, and the wall-time TTL alone would suppress their fresh "+N"
    // pops for up to 4 s.
    function clearFxSeen() {
        _fxSeen.clear();
    }

    function getFxGen() {
        return _fxGen;
    }

    function teardownScoreFx() {
        for (const p of _fxPops) p.active = false;
        for (const b of _fxBursts) b.active = false;
        _fxSeen.clear();
        _fxGen++;   // invalidate any pending deferred window-copy fallbacks
        _fxLastFxDetail = null;
        _fxRingMs = -1e9;
    }

    return {
        fxResolvePalette, fxSpawnPop, fxSpawnBurst, fxHandle,
        drawNotedetectLabels, drawScoreFx, clearFxSeen, getFxGen, teardownScoreFx,
    };
}
