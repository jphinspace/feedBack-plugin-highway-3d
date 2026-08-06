# Perf baseline — 3D highway closure split (Stage 7)

Gate for the `createFactory()` teardown. The refactor moves ~6,200 lines of
hot-path code behind a `ctx` object; the plan budgets 0–3% overhead if reads are
destructured at the top of each function and 5–15% if they are not. This is the
number to hold it to.

## Why not core's harness

`feedBack/scripts/perf-baseline.mjs` measures the **2D** highway — it hooks
`highway.addDrawHook` and explicitly defers 3D ("a separate R4 concern"). The
renderer under change here is the 3D one, so the signal comes from the plugin's
own opt-in bench (`?h3dbench=1`), captured by `scripts/h3dbench.mjs`.

## Running it

```bash
# core, pointed at a directory of real charts (symlinks are fine)
cd ../feedBack && DLC_DIR=/path/to/songs PYTHONPATH=lib python main.py

# capture (playwright lives in the core checkout, not this repo)
node scripts/h3dbench.mjs --base http://127.0.0.1:8000 \
    --song "Metallica_Enter-Sandman_v1.sloppak" --runs 3 --seconds 25 \
    --playwright ../feedBack
```

## Baseline — commit 61d2253 (pre-Phase-1), 2026-08-06

`Metallica_Enter-Sandman_v1.sloppak`, 3 runs x 25 s, 15 report windows,
median 14.6 fps. Values are ms; p50/p95 are the median across windows.

| segment | p50 | p95 | max |
|---|---|---|---|
| frame | 0.300 | 0.500 | 3.100 |
| state | 0.000 | 0.100 | 0.400 |
| next | 0.000 | 0.100 | 0.200 |
| mat | 0.000 | 0.000 | 0.200 |
| noteDraw | 0.100 | 0.200 | 2.900 |
| chordDraw | 0.100 | 0.200 | 0.800 |
| render | 0.800 | 1.100 | 41.700 |

## How to read this — and what it cannot tell you

Two limitations, both real:

1. **Headless chromium has no GPU here** (SwiftShader software GL). That is why
   fps is ~15 and why `render` shows a 41.7 ms max. `render` is Three.js's draw
   submit — the ctx refactor does not touch it, so treat that row as noise, not
   as a number to defend.
2. **The CPU segments sit at the timer floor.** `performance.now()` is clamped to
   ~0.1 ms in Chrome, and `state`/`next`/`mat` are already 0.0–0.1. A 10%
   regression on a 0.1 ms segment is *not* observable here.

So the usable gate is the **`frame` aggregate** (p50 0.300 / p95 0.500) plus
`noteDraw` and `chordDraw`, which aggregate the per-note and per-chord work the
refactor actually touches. A gross regression (the 5–15% "didn't destructure"
case, which would land as a multiple on `noteDraw`) will show. A subtle one may
not — so this is a backstop, not a proof. Treat a `frame` p50 above ~0.400 or a
`noteDraw` p50 above ~0.200 as a stop-and-investigate.

Re-run after Phase 2 and after each Phase 3 step, same machine, same song.
