/**
 * Shared corner-anchor box-position math for 2D overlay cards (chord
 * diagram, section HUD, tone HUD): given a box size and one of the four
 * corners, returns `{ bx, by }` clamped to stay on-canvas, skipping past
 * the lyrics banner. `E` (the per-card edge margin) is an explicit
 * parameter rather than a shared constant since callers derive it
 * differently — a fixed `PAD` for the chord diagram, a `baseH`-scaled
 * value for the HUD cards.
 */
export function cornerBoxPosition({
  canvasW, canvasH, boxW, boxH, position, lyricsBottom, stackOffset, E,
}) {
  const topY = Math.round(Math.max(E + canvasH * 0.06, lyricsBottom + E));
  let bx;
  let by;
  if (position === 'tr') { bx = canvasW - boxW - E; by = topY + stackOffset; } else if (position === 'bl') { bx = E; by = canvasH - boxH - E - stackOffset; } else if (position === 'br') { bx = canvasW - boxW - E; by = canvasH - boxH - E - stackOffset; } else { bx = E; by = topY + stackOffset; } // 'tl' default
  bx = Math.max(0, Math.min(canvasW - boxW, bx));
  by = Math.max(0, Math.min(canvasH - boxH, by));
  return { bx, by };
}
