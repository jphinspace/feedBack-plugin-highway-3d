import { off } from './off.js';
import { particles } from './particles.js';
import { silhouettes } from './silhouettes.js';
import { lights } from './lights.js';
import { geometric } from './geometric.js';
import { venue } from './venue.js';
import { image } from './image.js';
import { video } from './video.js';

// Background-style registry. Each entry returns a per-panel state
// object from build() and reads from it in update() / teardown().
// T (THREE) is set by the time these are invoked (initScene runs
// inside loadThree().then).
export const BG_STYLES = { off, particles, silhouettes, lights, geometric, venue, image, video };
