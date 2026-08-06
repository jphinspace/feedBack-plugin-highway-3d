// The renderer's pure numeric/config constants: geometry scale, fret/string
// counts, camera framing, fog, lane/chord-diagram sizing, render timing.
//
// Nothing in this file depends on Three.js, the DOM, or any other module in
// this plugin except `S_COL` (string count sizing) from ./palette.js.

import { S_COL } from './palette.js';

export const SCALE = 2.25;
export const K = SCALE / 300;
// Horizontal stretch factor for fret X positions.  Increasing this widens
// the lane (frets, board plane, strings, notes, lane strip) without
// affecting K-based vertical dimensions (string gap, note height, camera).
export const FRET_SCALE = SCALE * 1.1;

export const NFRETS = 24;
export const NSTR = 6;
/**
 * Pure 12-semitone spacing compresses toward the bridge; multiply each
 * segment **above** this fret by the factor so high positions stay
 * slightly more playable/readable in 3D.
 */
export const FRET_SPACING_STRETCH_ABOVE12 = 1.1;
export const FRET_SPACING_ANCHOR_F = 12;
// Per-string materials and projection meshes are built via S_COL.map(),
// so the renderer can only address strings 0..S_COL.length-1. Using a
// higher count would index undefined into mGlow/mStr/mSus/projMeshArr.
// Extend S_COL above to support more strings.
export const MAX_RENDER_STRINGS = S_COL.length;
export const STR_THICK = 0.25 * K;

// Fret wires — bowed metal tubes (backported from highway_babylon's
// "hit-zone fret bars"). All frets share one bowed TubeGeometry whose
// middle (the middle strings) pushes away from the camera so the row of
// frets reads as wrapping a cylindrical neck — chart-format depth cue.
// Negative Z = away from camera (into the highway). All tunable.
export const FRET_BOW_DZ = -1.2 * K;        // middle-of-span Z offset
export const FRET_TUBE_RADIUS = STR_THICK * 0.75; // slightly thicker than a string
export const FRET_TUBE_SEG = 12;            // tubular segments along the curve
// Radial segments (cross-section). 8 rather than 6: at FRET_TUBE_RADIUS the
// hexagonal facets of a 6-segment tube are visible along the top highlight.
// One shared geometry for all frets, so the extra segments are ~free.
export const FRET_TUBE_RADIAL = 8;
// metalness kept moderate, NOT ~1.0: MeshStandardMaterial is PBR and the
// scene has no envMap, so a full-metal fret would reflect black and render
// dark (the nut/headstock use metalness 0.02 for the same reason). At ~0.4
// the lit albedo body survives while the directional light still throws a
// glossy specular streak across the rounded tube. The dim emissive floor
// keeps frets from going muddy far down the (fogged) neck.
export const FRET_METALNESS = 0.4;          // lit steel / brass when gold
export const FRET_ROUGHNESS = 0.3;
export const FRET_EMISSIVE = 0x12141a;      // cool dim floor, never fully black

// Fret-wire tiers. Wires inside the active anchor lane (the frets the player
// is actually reading) sit bright; everything outside recedes. Kept far
// apart on purpose — a narrow gap reads as noise rather than as a focus cue.
export const FRET_WIRE_ACTIVE_HEX = 0xD8A636; // gold; numeric twin of FRET_LABEL_GOLD_HEX
export const FRET_WIRE_ACTIVE_OP = 0.9;
export const FRET_WIRE_IDLE_HEX = 0x4A4A60;
export const FRET_WIRE_IDLE_OP = 0.28;

// Hit flash: when a scorer (feedBack#254) confirms a note, the two wires
// bracketing its fret (f-1 and f) flash bright. Emissive is boosted as well
// as albedo — a MeshStandard fret with no envMap barely brightens from
// albedo alone, so without the emissive lift the "flash" reads as a shrug.
export const FRET_WIRE_HIT_HEX = 0xFFFFFF;      // blown out to white at full flash
export const FRET_WIRE_HIT_EMISSIVE = 0xFFE9B0; // hot warm-white glow
export const FRET_WIRE_HIT_OP = 1.0;
// Emissive multiplier at full flash (baseline is 1). Pushing emissive past
// 1.0 is what actually makes the wire read as a light source rather than a
// brightly-lit object — the color alone saturates and stops there.
export const FRET_WIRE_HIT_INTENSITY = 4.2;
// Seconds for a flash to fall to ~1/e once the provider stops reporting.
// The provider already fades its own `alpha` on a struck note; this tail
// just keeps the hand-off from popping, and smooths the frame-to-frame
// jitter of a held sustain (whose alpha tracks live input level).
export const FRET_WIRE_HIT_DECAY = 0.32;
export const S_BASE = 3 * K;
export const S_GAP = 4 * K;

export const AHEAD = 3.0;
export const BEHIND = 0.5;
// How long a note/chord-frame stays renderable past the hit line while a
// note-state provider (feedBack#254) is attached. The provider's
// hit/miss verdict is asynchronous — the engine-side verifier reports it
// ~0.35-0.5 s after the line — so the default ~50 ms note linger /
// ~0.48 s chord linger lapses before the tint can apply. Drives both
// the outer-loop cull (ndVerdictT0) and the smart drawNote cull below.
export const NOTEDETECT_GEM_VERDICT_WINDOW = 0.75;
// chDt threshold past the hit line at which the chord-frame scan
// gives up on an arpeggio-style frame whose constituents never come
// in. Must be < NOTEDETECT_GEM_VERDICT_WINDOW (the rim's draw life
// in detect mode); placing it at 0.55 s leaves ~0.2 s of the visible
// window for the latch to fire and skip subsequent scans.
export const _ND_UNMATCHED_LATCH_AFTER = 0.55;
// Sample approach offsets dt in [0, AHEAD] into strips. Lane quads use
// z = dZ(dt) + TS*BEHIND = TS*(BEHIND - dt), while notes use z = dZ(n.t-now).
// So note hit line (z=0) aligns with dt=BEHIND, not dt=0. Chart time at
// lane parameter dt is now + dt - BEHIND (same z as a note at that time).
// Each strip’s <anchor> uses that chart time so the blue lane doesn’t
// switch ~BEHIND seconds before the XML <anchor time="…"/>.
export const HWY_LANE_TIME_SLICES = 96;
/** Odd columns (1st/3rd/…) darker teal; even columns brighter blue. */
export const HWY_LANE_STRIPE_ODD_HEX  = 0x103B5C;
export const HWY_LANE_STRIPE_EVEN_HEX = 0x08283C;
/** Lane quad alpha: base + highwayIntensity * scale (readable on dark floor). */
export const HWY_LANE_STRIPE_OP_BASE = 1.0;
export const HWY_LANE_STRIPE_OP_INT  = 0;
/** Venue mode: slight near-lane contrast boost (visual only). */
export const VENUE_LANE_OP_BOOST = 1.1;
/** Venue mode: gem emissive pop (~12%, visual only). */
export const VENUE_GEM_EMISSIVE_MUL = 1.12;
/** Venue steady-state haze coefficient — kept low for raster bg plate. */
export const VENUE_HAZE_STEADY = 0.008;
/** Venue backdrop pushed slightly farther for parallax depth. */
export const VENUE_BACKDROP_DISTANCE_MUL = 1.06;
/** Note travel speed. */
export const TS = 230 * K;
/** Match `nextNoteByString` onset to this note (float + chart rounding; avoids ghost / glow flicker). */
export const NEXT_ON_STRING_T_EPS = 0.06;
/** Fixed pre-impact ramp window for lead-note board ghosts (Primary + Upcoming slots). */
export const GHOST_UPCOMING_WIN = 0.6;
/** Ghost starts at this fraction of full size/brightness and grows to 1.0 as it approaches. */
export const PROJ_GROW_MIN = 0.45;
/**
 * 3D highway post-strum tail — chord frame + ghost fret digit share the same
 * hold and fade so timing stays consistent.
 */
export const CHORD_HWY_LINGER_S = 0.75;
/** Linear fade at end of `CHORD_HWY_LINGER_S` (applies to chord UI and board ghost numbers). */
export const CHORD_HWY_FADE_S = 0.32;
export const GHOST_HOLD_AFTER_ONSET = CHORD_HWY_LINGER_S;
export const GHOST_FRET_LBL_FADE_S = CHORD_HWY_FADE_S;
/** Purple lane rails: extend past last matched chord/note so Z reaches frame end. */
export const ARP_HWY_RAIL_END_TAIL_S = 0.38;
/** Keep 0 — chord/note-based ``shapeLo`` already aligns to the visible frame. */
export const ARP_HWY_RAIL_START_LEAD_S = 0;
/** Drives emissive (`mGlow` / accent fill) for notes with `.ac`; matches drawNote `linger` cutoff (0.05). */
export const ACCENT_NOTE_STR_GLOW = 3.55;
export const ACCENT_NOTE_LINGER_EPS = 0.05;
/** Extra emissive layered on accent-only body material (`mAccentCore`), after `strGlow * glowMul`. */
export const ACCENT_NOTE_FILL_BOOST = 2.55;
/** Accent rim draws brighter than normal string-coloured outlines (`mStrHitOutline`). */
export const ACCENT_RIM_BASE_EMISSIVE = 3.45;
/** Outline / core scale bump vs normal gems (accent reads slightly larger). */
export const ACCENT_RIM_XY_SCALE_MUL = 1.09;
export const ACCENT_RIM_Z_SCALE_MUL = 1.06;
// Soft neon-style outer bloom (AdditiveBlending) — layered shells behind outline/core.
export const ACCENT_HALO_OP_NEAR = 0.68;
export const ACCENT_HALO_OP_MID = 0.42;
export const ACCENT_HALO_OP_FAR = 0.24;
export const ACCENT_HALO_XY_INNER = 1.36;
export const ACCENT_HALO_XY_MID = 1.82;
export const ACCENT_HALO_XY_OUTER = 2.32;
export const ACCENT_HALO_Z_INNER = 1.05;
export const ACCENT_HALO_Z_MID = 1.12;
export const ACCENT_HALO_Z_OUTER = 1.22;
// Shorter, flatter notes (joel style)
export const NW = 5 * K, NH = 3 * K, ND = 0.25 * K;
// Sustain-trail X offset for fretted notes. Module-scoped + frozen
// so the hot path's `offsets.length` loop sees a stable singleton
// reference. The standalone-open-string path builds a fresh pair
// each call because its offset magnitude depends on the per-note
// `openWScale` (set in drawNote at line 7367 from the open-string
// body's lane width), so a module-scoped constant can't capture
// it; the allocation is the same one the prior code did via
// `const baseOff = NW * 3 * openWScale` plus the inline `[-, +]`
// literal in the chord-member branch — just consolidated.
export const SINGLE_SUS_OFFSETS = Object.freeze([0]);
export const BEND_HALFSTEP_WORLD_Y = S_GAP * 0.8;
export const VIBRATO_HALF_WAVE_S = 0.08;
// Bend ribbon envelope: fraction of the sustain spent ramping up to
// the bent pitch, and releasing back down (rest is the held plateau).
export const BEND_ENV_RISE_FRAC = 0.35;
export const BEND_ENV_RELEASE_FRAC = 0.30;
export const TREMOLO_BUMP_S = 0.06;
export const N_RAD = 1.5 * K;
export const SW = 2 * K, SH = 1.5 * K;

export const CAM_H_BASE = 190 * K;
export const CAM_DIST_BASE = 240 * K;
export const REF_ASPECT = 16 / 9;
export const FOCUS_D = 600 * K;
export const CAM_LERP_BASE = 0.02;

// Base vertical field of view (deg). THREE's PerspectiveCamera fov is the
// VERTICAL angle; horizontal follows from the aspect ratio. At a normal
// ~16:9 pane this gives a ~102° horizontal cone. On an ultra-wide pane
// (top/bottom 2-player split → full-width/half-height → ~32:9) that
// horizontal cone balloons past 130° and squeezes the fixed-width neck into
// a central sliver. The optional horizontal-FOV-hold path below counters
// that by lowering the effective vertical fov as the pane widens.
export const BASE_VFOV = 70;
// Horizontal-FOV-hold ("Hor+") defaults. At/under HORPLUS_START_ASPECT the
// effective vertical fov equals BASE_VFOV (exact no-op); past it the
// vertical fov drops to keep the horizontal cone ~constant so the neck
// fills a wide pane. HORPLUS_MIN_VFOV floors the result on pathological
// aspects. Engaged only via the window.__h3dAspectTune bridge (default off).
export const HORPLUS_START_ASPECT = 16 / 9;
export const HORPLUS_MIN_VFOV = 28;

// Zoom-dependent framing — height (h*) and depth (dist*) multipliers
// applied to cam.position. Interpolated by `dist`:
//   NEAR = tight view (nut position, span<=4 -> dist~=93*K): lower/closer.
//   FAR  = wide view (midpoint fret 1<->20 -> dist~=141*K): higher/pulled back
//          to fit the whole neck.
// Outside this range the values clamp at the endpoints.
export const CAM_FRAME_DIST_NEAR = 93 * K;
export const CAM_FRAME_DIST_FAR  = 141 * K;
export const CAM_FRAME_H_NEAR = 0.75;
export const CAM_FRAME_H_FAR  = 1.00;
export const CAM_FRAME_D_NEAR = 0.575;
export const CAM_FRAME_D_FAR  = 0.60;
// Fret-row fit guard. The heat-coloured fret-number row is a band drawn
// BELOW the board (at sY(lowest) - S_GAP*1.4). The lower-third framing
// anchors the board CENTRE, not that row, so a tight zoom on a centred span
// (worst mid-neck — fine pushed to either end of the neck) drops the row off
// the bottom edge. Tilt can't add vertical room there (it would only trade a
// bottom clip for a top clip), so camUpdate dollies the camera back just
// enough to bring the row back into frame — auto-sized, capped, hysteretic.
export const FRET_ROW_FIT_NDC_MIN   = -0.86;  // keep the row anchor at/above this NDC y (>-1 = on screen)
export const FRET_ROW_FIT_DEADBAND  = 0.06;   // headroom past the min before the dolly relaxes (anti-hunt)
export const FRET_ROW_FIT_BOOST_MAX = 1.6;    // cap the pull-back so the zoom can't pop (never dolly back > +60%)

// Camera-X targeting (issue #34). The visible AHEAD = 4.0 s window is
// far too coarse for picking where the camera should sit — a single
// 17th-fret bend 2.5 s away yanks tgtX several frets even though the
// immediate playing area hasn't moved. These constants are bounds for
// a smoothing dial (0 = twitchy, 1 = calm); the runtime lerps between
// the pair using the user's `cameraSmoothing` setting.
export const CAM_TGT_BEHIND   = 0.2;   // s behind hit line for X targeting
export const CAM_TGT_AHEAD_T  = 2.0;   // s — twitchy: longer lookahead (more reactive)
export const CAM_TGT_AHEAD_C  = 0.7;   // s — calm: shorter lookahead (ignore distant outliers)
export const CAM_TGT_TAU_T    = 0.35;  // s — twitchy: short recency time-constant
export const CAM_TGT_TAU_C    = 0.9;   // s — calm: longer time-constant (averages more)
export const CAM_TGT_HYST_T   = 0.25;  // frets — twitchy: tiny dead zone
export const CAM_TGT_HYST_C   = 5.0;   // frets — calm: ~5-fret dead zone, wide
                                // enough to swallow chord-to-chord
                                // alternations across a 6-fret span
                                // (e.g. Am ↔ D in first position).

// Zoom (tgtDist) damping. Controlled by its own `zoomSmoothing` setting
// so X-pan and zoom-pull-back can be tuned independently. New users
// (and existing users who never wrote zoomSmoothing) inherit
// cameraSmoothing's value on first read, so default behaviour is
// unchanged from when zoom + X shared a single slider.
export const CAM_DIST_HYST_T  = 0.5;   // fret-span — twitchy: minimal dead zone
export const CAM_DIST_HYST_C  = 5.0;   // fret-span — calm: 5-fret span change required

// Vertical-tilt damping. Drives the tgtLookY self-correction loop in
// camUpdate(): how far the fretboard's NDC Y can drift from
// DESIRED_NDC_Y before we nudge the camera, and how strongly each
// nudge corrects. Twitchy = narrow band + strong correction (re-frame
// aggressively); calm = wide band + weak correction (let small drift
// ride). Driven by `tiltSmoothing`, mirrors cameraSmoothing on first
// read like zoomSmoothing does.
// Bounds chosen so the midpoint (tiltSmoothing=0.5) reproduces the
// pre-PR hardcoded behaviour (band=0.15, str=0.5). Without that, a
// fresh install would silently change the vertical-tilt feel even
// though the PR description promises "default behaviour unchanged."
export const CAM_TILT_BAND_T  = 0.05;  // NDC — twitchy: narrow tolerance
export const CAM_TILT_BAND_C  = 0.25;  // NDC — calm: wide tolerance, fewer corrections
export const CAM_TILT_STR_T   = 0.8;   // multiplier — twitchy: strong nudge per correction
export const CAM_TILT_STR_C   = 0.2;   // multiplier — calm: weak nudge per correction

// Lock-low zoom range. The cameraLockZoom slider (0..1) blends between
// these two multipliers and scales the locked tgtDist. Defaults pick
// 1.0× at slider=0.5 so the previous locked view is the midpoint.
export const CAM_LOCK_ZOOM_MIN = 0.55;  // slider=0 — closest, biggest fretboard
export const CAM_LOCK_ZOOM_MAX = 1.45;  // slider=1 — furthest
export const CAM_LOCK_CENTER_FRET = 6;  // default camera X center (first-position midpoint)
export const CAM_LOOKAHEAD_SEC = 3.0;       // fallback when no beats/measures are available
export const CAM_LOOKAHEAD_MEASURES = 9;    // lookahead window = N measures ahead
export const CAM_FOCUS_BLEND_RATE = 0.7;
export const CAM_FRET_EDGE_BLEND = 0.1;
export const DEFAULT_LOOKAHEAD_FRET_SPAN = 4;
/** Schmitt: avoid lock↔dynamic flicker when lookahead maxF jitters at the 12th fret. */
export const LOOKAHEAD_LOCK_RELEASE_MAXF = 13;
export const LOOKAHEAD_LOCK_ENGAGE_MAXF = 10;
// Note: we deliberately do NOT scale the camUpdate lerp speed with
// cameraSmoothing. Smoothing widens the hysteresis dead zones so the
// camera stays put through small/repetitive shifts; but when a shift
// *does* clear the gate (a real jump to a far fret), we want the slide
// to be snappy, not lethargic. The dead zone gates "should we move?",
// the BPM-scaled lerp answers "how fast" — keeping those orthogonal
// gives the right feel.
export const FOG_START = 200 * K;
export const FOG_END = 670 * K;

export const DOTS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
export const DDOTS = new Set([12, 24]);
export const INLAY_LABEL_FRETS = [3, 5, 7, 9, 12, 15, 17, 19, 22, 24]; // 22 not 21: intentional display choice
export const FRET_COOLDOWN = 0.5; // seconds a lane fret stays active after last note
export const DIAG_LINGER_S    = 0.55;
export const DIAG_ENTRANCE_S  = 0.20;
export const DIAG_CROSSFADE_S = 0.15;
export const DIAG_SIZE_MIN    = 0.08;
export const DIAG_SIZE_MAX    = 0.16;
export const DIAG_CELL_MAX    = 34;
// 'bl' and 'br' removed — diagram is top-only. Legacy localStorage values
// that contain 'bl'/'br' will fall back to SETTING_DEFAULTS.chordDiagramPosition
// via coerceSetting (which rejects values not in this list).
export const CHORD_DIAG_POSITION_IDS = ['tl', 'tr'];

/** Default chord-box rim / fill gradient (teal family). */
export const CHORD_BOX_TEAL_HEX = 0x00d2d5;
export const CHORD_BOX_TEAL_DARK_HEX = 0x003c3d;
/** Frame edge quads: premultiplied-ish alpha match (~128/255). */
export const CHORD_BOX_EDGE_ALPHA = 128 / 255;
/** Interior gradient strip alpha on both stops (~32/255). */
export const CHORD_BOX_FILL_GRAD_ALPHA = 32 / 255;
/** Arpeggio interior wash; dedicated gradient tex so teal map doesn’t dominate. */
export const ARPEGGIO_BOX_BLUE_HEX = 0x454BB6;
export const ARPEGGIO_BOX_BLUE_DARK_HEX = 0x2D3190;
/** Arpeggio rim accent and lane tint. */
export const ARPEGGIO_RIM_BLUE_HEX = 0x454BB6;
/** Post-hit chord-frame rim tints driven by the note-state provider
 *  (feedBack#254). Applied only to the teal frame during the linger
 *  fade (chDt <= 0) when a scorer is attached.
 *  Matches the gem hit/miss colours so chord frame and note body
 *  give a consistent signal:
 *    hit  → neon spring-green 0x22ff88 (same as mHitBright).
 *    miss → hot magenta-red 0xff0066 (same as mMissOutline). */
export const CHORD_BOX_HIT_BRIGHT_HEX  = 0x22ff88;
export const CHORD_BOX_MISS_DARK_HEX   = 0xff0066;

/** Fret-number label tints — gold on approaching/active notes, muted blue when idle. */
export const FRET_LABEL_GOLD_HEX = '#D8A636';
export const FRET_LABEL_IDLE_HEX = '#9ab8cc';

/** 3D chord-box rim bars (thin on all chords, including repeats in a sequence). */
export const CHORD_FRAME_RIM_MIN = 0.055;       // × K — floor thickness
export const CHORD_FRAME_RIM_FRAC_H = 0.028;    // × fullChordBoxH
export const CHORD_FRAME_RIM_Z_MIN = 0.048;      // × K — depth squash
export const CHORD_FRAME_RIM_Z_SCAL = 0.68;     // thickZ scales with ft
/**
 * Highway arpeggio frame uses ``inferArpeggioFromNotePattern`` only inside this
 * window around ``ch.t``. Hand-shape spans can cover many seconds and several
 * separate strums of the same voicing; a full-span scan mis-detects arpeggio
 * from beats that belong to different chord rows.
 */
export const ARP_FRAME_ONSET_PAD_S = 0.06;
export const ARP_FRAME_ONSET_CLUSTER_S = 0.26;
/**
 * The chart format encodes fast alternating power chords (e.g. D5/D#5 gallops) as
 * very short ``<handShape>`` rows (~0.05–0.2 s). Note-stream arpeggio
 * inference must not treat strum spread across strings as arpeggio there —
 * it false-triggers lavender highway rails / frames (see Frantic ~2:36).
 */
export const ARP_INFER_MIN_HAND_SHAPE_SPAN_S = 0.21;
/**
 * In a **short** chart window, chord strums (same voicing, strings picked
 * within ~30–45 ms) barely exceed this total spread; real arpeggios in that
 * window are usually slower across strings OR have 4+ plucks.
 */
export const ARP_INFER_STRUM_VS_ARP_SPREAD_MIN_S = 0.047;
/**
 * If more than ``shape.size + ARP_INFER_MULTI_STRUM_HIT_SLACKS`` matching picks
 * sit inside a non-trivial hand-shape window, the chart is almost certainly
 * **repeated strums** of the same chord (or gallops), not one arpeggio sweep.
 */
export const ARP_INFER_MULTI_STRUM_HIT_SLACK = 2;
/** ``timeWin`` span above which we apply the multi-strum hit-count cap. */
export const ARP_INFER_MULTI_STRUM_WIN_MIN_S = 0.26;
/**
 * Minimum staggered hits inside a hand-shape window for note-stream arpeggio
 * inference. A genuine arpeggio sweeps several strings of the held shape;
 * a 2-note melodic motif inside a multi-string ``<handShape>`` (e.g. Jackson 5
 * "I Want You Back" ~0:27 — Fm7 transition fingering with two plucks on
 * strings 4–5) earlier registered as arpeggio and produced a stray lavender
 * chord frame + purple lane outer dividers. Cap at ``min(shape.size, 3)``
 * so 2-string voicings still infer normally and 3+ string templates need
 * a real sweep.
 */
export const ARP_INFER_MIN_HITS_VS_SHAPE_CAP = 3;
