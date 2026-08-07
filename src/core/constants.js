import { S_COL } from './palette.js';

export const SCALE = 2.25;
export const K = SCALE / 300;
/** Horizontal stretch for fret X positions; independent of K-based vertical dimensions. */
export const FRET_SCALE = SCALE * 1.1;

export const NFRETS = 24;
export const NSTR = 6;
/** Multiplier applied to fret spacing above {@link FRET_SPACING_ANCHOR_F} so high positions stay readable. */
export const FRET_SPACING_STRETCH_ABOVE12 = 1.1;
export const FRET_SPACING_ANCHOR_F = 12;
/** Highest string index the renderer can address; extend `S_COL` in palette.js to raise it. */
export const MAX_RENDER_STRINGS = S_COL.length;
export const STR_THICK = 0.25 * K;

// Fret wires: one shared bowed TubeGeometry per fret, curved away from the
// camera at mid-span for a cylindrical-neck depth cue.
export const FRET_BOW_DZ = -1.2 * K;
export const FRET_TUBE_RADIUS = STR_THICK * 0.75;
export const FRET_TUBE_SEG = 12;
export const FRET_TUBE_RADIAL = 8;
export const FRET_METALNESS = 0.4;
export const FRET_ROUGHNESS = 0.3;
export const FRET_EMISSIVE = 0x12141a;

// Fret-wire tiers: wires inside the active anchor lane read bright, others recede.
export const FRET_WIRE_ACTIVE_HEX = 0xD8A636;
export const FRET_WIRE_ACTIVE_OP = 0.9;
export const FRET_WIRE_IDLE_HEX = 0x4A4A60;
export const FRET_WIRE_IDLE_OP = 0.28;

// Hit flash: the two wires bracketing a confirmed note's fret flash bright.
export const FRET_WIRE_HIT_HEX = 0xFFFFFF;
export const FRET_WIRE_HIT_EMISSIVE = 0xFFE9B0;
export const FRET_WIRE_HIT_OP = 1.0;
export const FRET_WIRE_HIT_INTENSITY = 4.2;
/** Seconds for a hit flash to fall to ~1/e after the provider stops reporting. */
export const FRET_WIRE_HIT_DECAY = 0.32;
export const S_BASE = 3 * K;
export const S_GAP = 4 * K;

export const AHEAD = 3.0;
export const BEHIND = 0.5;
/** Seconds a note/chord frame stays renderable past the hit line while a note-state provider is attached. */
export const NOTEDETECT_GEM_VERDICT_WINDOW = 0.75;
/** Seconds past the hit line before an unmatched arpeggio chord frame gives up scanning. Must stay below {@link NOTEDETECT_GEM_VERDICT_WINDOW}. */
export const NOTEDETECT_UNMATCHED_LATCH_AFTER = 0.55;
/** Number of time slices sampled across the highway lane's approach window. */
export const HIGHWAY_LANE_TIME_SLICES = 96;
/** Odd lane columns; darker teal. */
export const HIGHWAY_LANE_STRIPE_ODD_HEX  = 0x103B5C;
/** Even lane columns; brighter blue. */
export const HIGHWAY_LANE_STRIPE_EVEN_HEX = 0x08283C;
/** Lane quad base opacity. */
export const HIGHWAY_LANE_STRIPE_OP_BASE = 1.0;
/** Lane quad opacity added per unit of highway intensity. */
export const HIGHWAY_LANE_STRIPE_OP_INT  = 0;
/** Venue mode near-lane contrast boost. */
export const VENUE_LANE_OP_BOOST = 1.1;
/** Venue mode gem emissive multiplier. */
export const VENUE_GEM_EMISSIVE_MUL = 1.12;
/** Venue steady-state haze coefficient. */
export const VENUE_HAZE_STEADY = 0.008;
/** Venue backdrop distance multiplier, for parallax depth. */
export const VENUE_BACKDROP_DISTANCE_MUL = 1.06;
/** Note travel speed, world units per second. */
export const TS = 230 * K;
/** Tolerance for matching a note onset to `nextNoteByString`. */
export const NEXT_ON_STRING_T_EPS = 0.06;
/** Pre-impact ramp window for lead-note board ghosts. */
export const GHOST_UPCOMING_WIN = 0.6;
/** Board-ghost starting size/brightness fraction; grows to 1.0 on approach. */
export const PROJ_GROW_MIN = 0.45;
/** Seconds a chord frame and its ghost fret digit hold after a strum, before fading. */
export const CHORD_HWY_LINGER_S = 0.75;
/** Fade duration at the end of {@link CHORD_HWY_LINGER_S}. */
export const CHORD_HWY_FADE_S = 0.32;
export const GHOST_HOLD_AFTER_ONSET = CHORD_HWY_LINGER_S;
export const GHOST_FRET_LBL_FADE_S = CHORD_HWY_FADE_S;
/** Seconds the purple arpeggio lane rail extends past the last matched note. */
export const ARP_HWY_RAIL_END_TAIL_S = 0.38;
/** Seconds the purple arpeggio lane rail leads before the first matched note. */
export const ARP_HWY_RAIL_START_LEAD_S = 0;
/** Emissive for accented (`.ac`) notes. */
export const ACCENT_NOTE_STR_GLOW = 3.55;
/** Cutoff matching drawNote's `linger` window, for accent glow. */
export const ACCENT_NOTE_LINGER_EPS = 0.05;
/** Extra emissive layered on the accent-only body material, on top of `strGlow * glowMul`. */
export const ACCENT_NOTE_FILL_BOOST = 2.55;
/** Accent rim emissive, brighter than a normal string-colored outline. */
export const ACCENT_RIM_BASE_EMISSIVE = 3.45;
/** Accent outline/core scale multiplier vs. a normal gem. */
export const ACCENT_RIM_XY_SCALE_MUL = 1.09;
export const ACCENT_RIM_Z_SCALE_MUL = 1.06;

// Accent gem halo: layered additive-blend shells behind the outline/core.
export const ACCENT_HALO_OP_NEAR = 0.68;
export const ACCENT_HALO_OP_MID = 0.42;
export const ACCENT_HALO_OP_FAR = 0.24;
export const ACCENT_HALO_XY_INNER = 1.36;
export const ACCENT_HALO_XY_MID = 1.82;
export const ACCENT_HALO_XY_OUTER = 2.32;
export const ACCENT_HALO_Z_INNER = 1.05;
export const ACCENT_HALO_Z_MID = 1.12;
export const ACCENT_HALO_Z_OUTER = 1.22;

export const NW = 5 * K, NH = 3 * K, ND = 0.25 * K;
/** Sustain-trail X offsets for a single fretted note (no chord-member spread). */
export const SINGLE_SUS_OFFSETS = Object.freeze([0]);
export const BEND_HALFSTEP_WORLD_Y = S_GAP * 0.8;
export const VIBRATO_HALF_WAVE_S = 0.08;
/** Fraction of a bend's sustain spent ramping up to pitch. */
export const BEND_ENV_RISE_FRAC = 0.35;
/** Fraction of a bend's sustain spent releasing back down. */
export const BEND_ENV_RELEASE_FRAC = 0.30;
export const TREMOLO_BUMP_S = 0.06;
export const N_RAD = 1.5 * K;
export const SW = 2 * K, SH = 1.5 * K;

export const CAM_H_BASE = 190 * K;
export const CAM_DIST_BASE = 240 * K;
export const REF_ASPECT = 16 / 9;
export const FOCUS_D = 600 * K;
export const CAM_LERP_BASE = 0.02;

/** Base vertical field of view in degrees (THREE's PerspectiveCamera fov is vertical). */
export const BASE_VFOV = 70;
/** Pane aspect ratio at/under which the horizontal-FOV-hold is a no-op. */
export const HORPLUS_START_ASPECT = 16 / 9;
/** Floor for the horizontal-FOV-hold's effective vertical fov. */
export const HORPLUS_MIN_VFOV = 28;

// Zoom-dependent camera framing: height/depth multipliers interpolated by
// distance between a NEAR (tight, nut position) and FAR (wide, whole-neck)
// view, clamped at the endpoints outside this range.
export const CAM_FRAME_DIST_NEAR = 93 * K;
export const CAM_FRAME_DIST_FAR  = 141 * K;
export const CAM_FRAME_H_NEAR = 0.75;
export const CAM_FRAME_H_FAR  = 1.00;
export const CAM_FRAME_D_NEAR = 0.575;
export const CAM_FRAME_D_FAR  = 0.60;

// Fret-row fit guard: keeps the heat-colored fret-number row (drawn below
// the board) from clipping the bottom edge by dollying the camera back.
/** Minimum NDC Y for the fret-row anchor before the guard dollies back. */
export const FRET_ROW_FIT_NDC_MIN   = -0.86;
/** Headroom past {@link FRET_ROW_FIT_NDC_MIN} before the dolly relaxes. */
export const FRET_ROW_FIT_DEADBAND  = 0.06;
/** Maximum dolly-back multiplier. */
export const FRET_ROW_FIT_BOOST_MAX = 1.6;

// Camera-X targeting: bounds for a smoothing dial (0 = twitchy, 1 = calm)
// the runtime lerps between using the user's `cameraSmoothing` setting.
export const CAM_TGT_BEHIND   = 0.2;
export const CAM_TGT_AHEAD_T  = 2.0;
export const CAM_TGT_AHEAD_C  = 0.7;
export const CAM_TGT_TAU_T    = 0.35;
export const CAM_TGT_TAU_C    = 0.9;
export const CAM_TGT_HYST_T   = 0.25;
export const CAM_TGT_HYST_C   = 5.0;

// Zoom (tgtDist) damping, driven by its own `zoomSmoothing` setting.
export const CAM_DIST_HYST_T  = 0.5;
export const CAM_DIST_HYST_C  = 5.0;

// Vertical-tilt damping, driven by `tiltSmoothing`.
export const CAM_TILT_BAND_T  = 0.05;
export const CAM_TILT_BAND_C  = 0.25;
export const CAM_TILT_STR_T   = 0.8;
export const CAM_TILT_STR_C   = 0.2;

// Lock-low zoom range: the cameraLockZoom slider (0..1) blends between these.
export const CAM_LOCK_ZOOM_MIN = 0.55;
export const CAM_LOCK_ZOOM_MAX = 1.45;
/** Default camera X center fret. */
export const CAM_LOCK_CENTER_FRET = 6;
/** Lookahead window fallback when no beats/measures are available, in seconds. */
export const CAM_LOOKAHEAD_SEC = 3.0;
/** Lookahead window, in measures ahead. */
export const CAM_LOOKAHEAD_MEASURES = 9;
export const CAM_FOCUS_BLEND_RATE = 0.7;
export const CAM_FRET_EDGE_BLEND = 0.1;
export const DEFAULT_LOOKAHEAD_FRET_SPAN = 4;
/** Fret span above which lookahead releases its lock (Schmitt trigger high side). */
export const LOOKAHEAD_LOCK_RELEASE_MAXF = 13;
/** Fret span below which lookahead engages its lock (Schmitt trigger low side). */
export const LOOKAHEAD_LOCK_ENGAGE_MAXF = 10;
export const FOG_START = 200 * K;
export const FOG_END = 670 * K;

export const DOTS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
export const DDOTS = new Set([12, 24]);
export const INLAY_LABEL_FRETS = [3, 5, 7, 9, 12, 15, 17, 19, 22, 24];
/** Seconds a lane fret stays active after its last note. */
export const FRET_COOLDOWN = 0.5;
export const DIAG_LINGER_S    = 0.55;
export const DIAG_ENTRANCE_S  = 0.20;
export const DIAG_CROSSFADE_S = 0.15;
export const DIAG_SIZE_MIN    = 0.08;
export const DIAG_SIZE_MAX    = 0.16;
export const DIAG_CELL_MAX    = 34;
/** Valid chord-diagram corner positions (top-only). */
export const CHORD_DIAG_POSITION_IDS = ['tl', 'tr'];

/** Default chord-box rim/fill gradient (teal). */
export const CHORD_BOX_TEAL_HEX = 0x00d2d5;
export const CHORD_BOX_TEAL_DARK_HEX = 0x003c3d;
export const CHORD_BOX_EDGE_ALPHA = 128 / 255;
export const CHORD_BOX_FILL_GRAD_ALPHA = 32 / 255;
/** Arpeggio interior wash. */
export const ARPEGGIO_BOX_BLUE_HEX = 0x454BB6;
export const ARPEGGIO_BOX_BLUE_DARK_HEX = 0x2D3190;
/** Arpeggio rim accent and lane tint. */
export const ARPEGGIO_RIM_BLUE_HEX = 0x454BB6;
/** Post-hit chord-frame rim tint for a confirmed hit, matching the gem hit color. */
export const CHORD_BOX_HIT_BRIGHT_HEX  = 0x22ff88;
/** Post-hit chord-frame rim tint for a confirmed miss, matching the gem miss color. */
export const CHORD_BOX_MISS_DARK_HEX   = 0xff0066;

/** Fret-number label color for an approaching/active note. */
export const FRET_LABEL_GOLD_HEX = '#D8A636';
/** Fret-number label color when idle. */
export const FRET_LABEL_IDLE_HEX = '#9ab8cc';

export const CHORD_FRAME_RIM_MIN = 0.055;
export const CHORD_FRAME_RIM_FRAC_H = 0.028;
export const CHORD_FRAME_RIM_Z_MIN = 0.048;
export const CHORD_FRAME_RIM_Z_SCAL = 0.68;
/** Window around a chord's onset that arpeggio inference scans for its hand-shape span. */
export const ARP_FRAME_ONSET_PAD_S = 0.06;
export const ARP_FRAME_ONSET_CLUSTER_S = 0.26;
/** Minimum hand-shape span for note-stream arpeggio inference to run. */
export const ARP_INFER_MIN_HAND_SHAPE_SPAN_S = 0.21;
/** Minimum pick spread, within a short chart window, to count as arpeggio rather than a chord strum. */
export const ARP_INFER_STRUM_VS_ARP_SPREAD_MIN_S = 0.047;
/** Extra matching picks (above shape size) that reclassify a window as repeated strums, not arpeggio. */
export const ARP_INFER_MULTI_STRUM_HIT_SLACK = 2;
/** Hand-shape window span above which the multi-strum hit-count cap applies. */
export const ARP_INFER_MULTI_STRUM_WIN_MIN_S = 0.26;
/** Minimum staggered hits inside a hand-shape window for arpeggio inference, capped at `min(shape.size, 3)`. */
export const ARP_INFER_MIN_HITS_VS_SHAPE_CAP = 3;
