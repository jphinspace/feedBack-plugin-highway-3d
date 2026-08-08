/**
 * Score FX (notedetect game-scoring layer, notedetect >=1.13). Two
 * channels: (1) per-note "+N" score pops, sourced from the note-state
 * provider's `{ points, mult, popKey }` fields at the moment a gem's
 * verdict lands; (2) session-level bursts/pulses from the
 * `notedetect:fx` event (streak milestones, multiplier tier changes).
 * Everything renders on the 2D overlay canvas — no Three.js objects,
 * nothing to dispose. Pools are fixed-size slot arrays; when all slots
 * are busy a new effect is dropped. See CLAUDE.md's "Score FX" section
 * for the full consumer contract — this is the reference implementation
 * other renderer plugins copy.
 *
 * `getCam`/`getProbe`/`getNStr`/`getNoteDetectFrameNowMs` are live
 * getters: `cam`/`_probe` are (re)assigned by `createDomAndScene()`
 * inside `initScene()`, `nStr` is recomputed every `update()` call, and
 * `noteDetectFrameNowMs` is written at the top of every frame. `ctx` is
 * the per-instance state object (`ctx.cam.curX` etc.) — {@link drawScoreFx}'s
 * 2D-canvas-context parameter is deliberately named `ctx2d`, not `ctx`,
 * so it can't shadow this dep.
 */
export function createScoreFx({ ctx, getCam, getProbe, sY, getNStr, noteDetectLabels, getNoteDetectFrameNowMs }) {
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
    /** popKey -> expiry ms. Dedupes pops — chord members share the chord's popKey; sustains keep returning points for the whole glow window. */
    const _fxSeen = new Map();
    /** Bumped by teardownScoreFx() so the deferred window-copy fallback in notedetect/listeners.js (a zero-delay task the listener removal can't cancel) bails instead of re-arming state after teardown. */
    let _fxGen = 0;
    let _fxLastFxDetail = null;  // reference dedup: window + instanceRoot dispatches share one detail
    let _fxRingMs = -1e9;        // multiplier ring-pulse anchor
    let _fxRingMult = 1;
    /** Canvas-side palette per notedetect skin, mirroring notedetect's own CSS accents; fonts are document-loaded by that stylesheet. */
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
        // Reference dedup — notedetect dispatches the SAME detail object on window and on its
        // instanceRoot; whichever arrives first wins.
        if (d === _fxLastFxDetail) return;
        _fxLastFxDetail = d;
        const nowMs = performance.now();
        if (d.fxType === 'milestone') {
            fxSpawnBurst(nowMs);
        } else if (d.fxType === 'multiplier' && d.mult > (d.prevMult || 1)) {
            _fxRingMs = nowMs;
            _fxRingMult = d.mult;
        }
        // 'streakBreak' is deliberately unhandled — it used to arm a full-screen red flash
        // that washed the whole panel mid-song, including the notes being read. Don't
        // reintroduce a full-panel fill here; the hit-heat spark escalation in drawNote
        // (gated on _streakFx) is the surviving streak feedback and is unaffected.
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

    /**
     * Score FX overlay pass: "+N" pops rising off their gems, milestone
     * particle bursts / multiplier ring-pulses anchored on the strike
     * line. Same overlay layer + projection pattern as
     * {@link drawNotedetectLabels}. The 2D-canvas-context parameter is
     * named `ctx2d`, not `ctx` — naming it `ctx` previously shadowed this
     * module's own per-instance `ctx` dep and crashed the strike-line
     * probe (`ctx.cam.curX` resolving against the canvas context instead).
     */
    function drawScoreFx(ctx2d, W, H) {
        const cam = getCam(), _probe = getProbe(), nStr = getNStr();
        if (!cam || !_probe) return;
        const nowMs = getNoteDetectFrameNowMs() || performance.now();
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
        ctx2d.save();

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

        // Multiplier ring-pulse: one expanding ring on tier-up; the x4 tier pulses in the
        // secondary accent like the HUD badge.
        if (centerOk && ringAge < 600) {
            const t = ringAge / 600;
            const ease = 1 - Math.pow(1 - t, 2);
            ctx2d.beginPath();
            ctx2d.arc(cx, cy, 20 + ease * Math.min(W, H) * 0.28, 0, Math.PI * 2);
            ctx2d.strokeStyle = _fxRingMult >= 4 ? pal.accent2 : pal.accent;
            ctx2d.globalAlpha = 0.6 * (1 - t);
            ctx2d.lineWidth = 3;
            ctx2d.stroke();
            ctx2d.globalAlpha = 1;
        }

        if (anyBurst && centerOk) {
            for (let i = 0; i < _fxBursts.length; i++) {
                const b = _fxBursts[i];
                if (!b.active) continue;
                const age = nowMs - b.bornMs;
                if (age >= _FX_BURST_LIFE_MS) { b.active = false; continue; }
                const t = age / _FX_BURST_LIFE_MS;
                ctx2d.globalAlpha = 1 - t;
                for (let j = 0; j < _FX_BURST_N; j++) {
                    b.px[j] += b.vx[j];
                    b.py[j] += b.vy[j];
                    b.vy[j] += 0.08;
                    ctx2d.fillStyle = (j & 1) ? pal.accent : pal.accent2;
                    ctx2d.fillRect(cx + b.px[j] - 2, cy + b.py[j] - 2, 4, 4);
                }
                ctx2d.globalAlpha = 1;
            }
        }

        // "+N" pops: rise off the gem and fade over the back half.
        if (anyPop) {
            ctx2d.textAlign = 'center';
            ctx2d.textBaseline = 'middle';
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
                ctx2d.globalAlpha = t < 0.4 ? 1 : 1 - (t - 0.4) / 0.6;
                ctx2d.font = `bold ${13 + (p.mult - 1) * 2}px '${pal.font}', sans-serif`;
                ctx2d.lineWidth = 4;
                ctx2d.strokeStyle = 'rgba(0,0,0,0.8)';
                ctx2d.strokeText(p.text, sx, sy2);
                ctx2d.fillStyle = pal.accent;
                ctx2d.fillText(p.text, sx, sy2);
            }
            ctx2d.globalAlpha = 1;
        }

        ctx2d.restore();
    }

    /** Backward-seek reset: a practice loop/rewind re-judges the same popKeys, and the wall-time TTL alone would suppress their fresh "+N" pops for up to 4s. */
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
