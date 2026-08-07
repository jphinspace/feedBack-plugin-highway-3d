import { off } from './off.js';
import { particles } from './particles.js';
import { silhouettes } from './silhouettes.js';
import { lights } from './lights.js';
import { geometric } from './geometric.js';
import { venue } from './venue.js';
import { image } from './image.js';
import { video } from './video.js';

/**
 * Background-style registry. Each entry's `build()` returns a per-panel
 * state object, read by `update()`/`teardown()`. `T` (THREE) is available
 * by the time these run — `initScene()` runs inside `loadThree().then()`.
 */
export const BACKGROUND_STYLES = { off, particles, silhouettes, lights, geometric, venue, image, video };
