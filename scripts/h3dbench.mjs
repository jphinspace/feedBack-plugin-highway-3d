// Capture the 3D highway's per-frame segment timings.
//
// WHY THIS EXISTS: core's scripts/perf-baseline.mjs measures the *2D* highway
// (it hooks highway.addDrawHook and explicitly defers 3D as "a separate R4
// concern"). The renderer being refactored here is the 3D one, so its own
// opt-in bench — `?h3dbench=1`, which logs a `[h3dbench] …` line every 5s with
// p50/p95/max for frame/state/next/mat/noteDraw/chordDraw/render — is the only
// signal that actually covers the code under change.
//
// Usage (needs core running with DLC_DIR pointed at a real library):
//   node scripts/h3dbench.mjs --base http://127.0.0.1:8000 \
//        --song "Metallica_Enter-Sandman_v1.sloppak" --runs 3 --seconds 20
//
// Prints a markdown table to paste into docs/perf-baseline.md.

// Playwright lives in the core checkout, not here (this repo has no node_modules
// beyond eslint). Resolve it from --playwright / $PLAYWRIGHT_DIR, falling back to
// a plain import for the case where it *is* installed locally.
import { createRequire } from 'node:module';

async function loadChromium(dir) {
    if (dir) {
        const req = createRequire(`${dir.replace(/\/$/, '')}/package.json`);
        return req('playwright').chromium;
    }
    return (await import('playwright')).chromium;
}

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
    args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);
}
const BASE = args.get('base') || 'http://127.0.0.1:8000';
const SONG = args.get('song');
const RUNS = Number(args.get('runs') || 3);
const SECONDS = Number(args.get('seconds') || 20);
if (!SONG) { console.error('--song is required'); process.exit(1); }

const LINE = /\[h3dbench\]\s+([\d.]+)fps\s+\((\d+) frames\)\s+over\s+([\d.]+)s\s+—\s+(.*)/;

function parse(text) {
    const m = LINE.exec(text);
    if (!m) return null;
    const segs = {};
    for (const part of m[4].split('|')) {
        const s = /(\w+)\s+p50=([\d.]+)\s+p95=([\d.]+)\s+max=([\d.]+)/.exec(part.trim());
        if (s) segs[s[1]] = { p50: +s[2], p95: +s[3], max: +s[4] };
    }
    return { fps: +m[1], frames: +m[2], secs: +m[3], segs };
}

async function once(browser, run) {
    const page = await browser.newPage();
    const samples = [];
    page.on('console', (msg) => {
        const p = parse(msg.text());
        if (p) samples.push(p);
    });
    try {
        // Force the 3D renderer before any page script runs (same hook the
        // highway-3d-lefty spec uses), and mute so autoplay policy allows play().
        await page.addInitScript(() => {
            localStorage.setItem('vizSelection', 'highway_3d');
        });
        await page.goto(`${BASE}/?h3dbench=1`, { waitUntil: 'networkidle', timeout: 60000 });
        await page.evaluate(() => document.getElementById('v3-onboarding')?.remove());
        await page.evaluate((s) => window.playSong(s), SONG);
        await page.waitForFunction(() => (window.highway?.getNotes?.() || []).length > 0,
            null, { timeout: 60000 });
        await page.evaluate(async () => {
            const a = window.highway.getAudioElement?.();
            if (a) { a.muted = true; await a.play?.().catch(() => {}); }
        });
        // Let the clock actually advance, then confirm it did — otherwise we'd
        // be timing the paused-throttle path and reporting meaningless numbers.
        await page.waitForTimeout(2000);
        const t1 = await page.evaluate(() => window.highway.getTime());
        samples.length = 0;                     // discard warm-up windows
        await page.waitForTimeout(SECONDS * 1000);
        const t2 = await page.evaluate(() => window.highway.getTime());
        if (!(t2 > t1 + 1)) throw new Error(`clock did not advance (${t1}→${t2}) — measured the paused path`);
        if (!samples.length) throw new Error('no [h3dbench] lines — is ?h3dbench=1 reaching the renderer?');
        console.error(`  run ${run}: ${samples.length} windows, ${samples[0].fps}fps`);
        return samples;
    } finally {
        await page.close();
    }
}

const chromium = await loadChromium(args.get('playwright') || process.env.PLAYWRIGHT_DIR);
const browser = await chromium.launch();
const all = [];
try {
    for (let r = 1; r <= RUNS; r++) all.push(...await once(browser, r));
} finally {
    await browser.close();
}

const NAMES = ['frame', 'state', 'next', 'mat', 'noteDraw', 'chordDraw', 'render'];
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
console.log(`\n**${SONG}** — ${RUNS} runs x ${SECONDS}s, ${all.length} report windows`);
console.log(`median fps ${med(all.map((s) => s.fps)).toFixed(1)}\n`);
console.log('| segment | p50 (median of windows) | p95 | max |');
console.log('|---|---|---|---|');
for (const n of NAMES) {
    const w = all.filter((s) => s.segs[n]);
    if (!w.length) { console.log(`| ${n} | – | – | – |`); continue; }
    console.log(`| ${n} | ${med(w.map((s) => s.segs[n].p50)).toFixed(3)} `
        + `| ${med(w.map((s) => s.segs[n].p95)).toFixed(3)} `
        + `| ${Math.max(...w.map((s) => s.segs[n].max)).toFixed(3)} |`);
}
