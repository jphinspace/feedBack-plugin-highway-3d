# 3D Highway (dev)

A standalone development fork of the 3D note highway visualization for [FeedBack](https://github.com/got-feedback/feedBack). It installs as `highway_3d_dev` and can run alongside FeedBack's bundled `highway_3d` without sharing the plugin's settings, DOM IDs, globals, or visualization registration.

## What you get

- A camera-perspective highway with notes flying down toward a virtual fretboard at the bottom of the screen
- Glowing strings that pulse and brighten on each hit
- Note Detection feedback, including hit/miss outlines and diagnostic
  early/late/sharp/flat labels when the note detection plugin emits enriched
  judgments
- Chord frame-boxes, named-chord labels, and a chord diagram overlay (configurable corner position) so you can read shapes at a glance
- Two complementary barre indicators fire together when a barre chord shape is detected (2+ consecutive strings fretted at the lowest fret, e.g. F `[1,1,2,3,3,1]`, or an outer-edge full-span barre with every intermediate string fretted, e.g. B major `x24442`): a translucent vertical line across the strings on the 3D highway, and a straight bracket drawn inside the first fret space of the chord diagram overlay
- A heat-colored fret number row that lights up around your active playing region
- Selectable color palettes for the strings — pick the look you want
- Audio-reactive ambient background animations (particles, silhouettes, stage lights, geometric — pick one or turn it off)
- Lyrics overlay synced to the song
- Works as the main player view *or* per-panel inside the splitscreen plugin

## Install

This repository is a separate FeedBack plugin; it does not replace or modify FeedBack core. Place or symlink the checkout into the host's plugin directory using the plugin ID as the directory name:

```bash
cd /path/to/feedBack
ln -s /path/to/feedBack-plugin-highway-3d plugins/highway_3d_dev
```

Restart FeedBack, then pick **3D Highway (dev)** from the visualization picker. Both `highway_3d` and `highway_3d_dev` should appear independently. See [docs/dev-loop.md](docs/dev-loop.md) for the full local-development workflow.

## Settings

Visual controls (background style, intensity, audio reactivity, and named string colors) live on FeedBack's **Settings** screen under the separate *3D Highway (dev)* section. Their persisted keys use the `highway_3d_dev` namespace and do not change the bundled highway's configuration.

## Contributing / development

For maintainers and AI assistants working on the codebase, see [`CLAUDE.md`](CLAUDE.md) — it maps visual elements to the modules under `src/` and records the important implementation constraints.

### Perf bench (`?h3dbench=1`)

Append `?h3dbench=1` to the player URL to enable opt-in `console.log` reporting of `update()` self-time, broken into six segments — `frame` (everything between `pbBeg(0)` at the top of `update()` and `pbEnd(0)` at the bottom; excludes the trailing `pbReportTick()` logging that fires after `pbEnd(0)`), `state` (per-frame state-derivation loop), `next` (next-note-by-string lookahead), `mat` (per-string material writes), `noteDraw` (single-note draw loop), `chordDraw` (chord draw loop). Reported every 5 seconds with p50 / p95 / max per segment and frame count, so before/after numbers on a target chart are reproducible (feedBack#226). Off-by-default; the bench helpers (`pbBeg` / `pbEnd` / `pbReportTick`) are bound to a shared empty-function literal when the renderer instance is created (each `createFactory()` panel re-checks the flag), so the hot-path call sites are no-ops with negligible overhead (typically JIT-inlined).
