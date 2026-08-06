# Size-exemption register

The working norm (mirroring feedBack core's constitution Principle II,
enforced by the `max-lines` lint gate in `eslint.config.js`) is **no source
file over 1,500 lines**. This register lists the deliberate exceptions during
the `screen.js` → `src/` ES-module split, each with a ceiling, a rationale,
and a review trigger — see `/Users/joe/.claude/plans/ok-this-is-currently-wiggly-hoare.md`
for the full split plan this register supports.

**Rules**
- One row per file: a ceiling, a rationale, a review trigger.
- The `max-lines` per-file ceilings in `eslint.config.js` mirror this table —
  keep them in sync (this register is canonical).
- Rows here are all **temporary** — every one is deleted, not raised, once
  its triggering stage completes. There is no "permanent exemption" category
  in this repo the way core has one for hot-path renderers; the whole point
  of the split is that nothing stays this large.

## Current exemptions

| File | Lines | Ceiling | Rationale | Review trigger |
|---|---|---|---|---|
| `screen.js` | 16,677 | unbounded | Pre-split monolith IIFE. | Deleted when Stage 0e turns it into a one-line `import './src/main.js';` entry — at that point it's tiny and needs no exemption at all. |

## Anticipated exemptions (not yet added — added when the triggering stage lands)

| File | Est. lines | Ceiling | Rationale | Review trigger |
|---|---|---|---|---|
| `src/instance/factory.js` | ~12,150 (Stage 1) shrinking to 0 by end of Stage 6 | unbounded | Holds the untouched `createFactory()` closure body while Stages 1–6 pull the ~4,400 lines of module scope out from around it. | Deleted when Stage 6 completes (the closure-dismantling stage, Stage 7 / D1–D9, replaces this file with `src/instance/ctx.js` + the `scene/`, `render/`, `update/` etc. subtrees, none of which should need an exemption). |

## Watched, not yet over the line

`src/instance/render/note.js` (est. ~1,130) and `src/instance/render/chord.js`
(est. ~1,250) are expected to land close to the 1,500 ceiling once Stage 7
extracts `drawNote()` and the chord-render loop. If either lands over, the
plan is to split `chord.js` further along its existing internal banner
comments (screen.js: search `// ── Chord fret numbers`, `// ── Palm-mute
strum indicator`, `// ── Frethand-mute strum indicator`, `// ── Chord sustain
length indicator`) rather than adding a row here.
