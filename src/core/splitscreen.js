/** True if the host's splitscreen plugin is active and exposes the full focus API. */
export function splitscreenActive() {
    const ss = window.feedBackSplitscreen;
    if (!ss || typeof ss.isActive !== 'function' || !ss.isActive()) return false;
    return typeof ss.isCanvasFocused === 'function'
        && typeof ss.onFocusChange === 'function'
        && typeof ss.offFocusChange === 'function';
}

/** True if `highwayCanvas` is the focused pane, or splitscreen isn't active. */
export function splitscreenCanvasFocused(highwayCanvas) {
    const ss = window.feedBackSplitscreen;
    if (!splitscreenActive()) return true;
    return !!(ss && typeof ss.isCanvasFocused === 'function' &&
        ss.isCanvasFocused(highwayCanvas));
}
