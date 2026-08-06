// Detects whether the host's splitscreen plugin is active and, if so,
// whether a given canvas is the currently-focused pane. Both are pure
// window.feedBackSplitscreen probes — no local state.

export function splitscreenActive() {
    const ss = window.feedBackSplitscreen;
    if (!ss || typeof ss.isActive !== 'function' || !ss.isActive()) return false;
    return typeof ss.isCanvasFocused === 'function'
        && typeof ss.onFocusChange === 'function'
        && typeof ss.offFocusChange === 'function';
}

export function splitscreenCanvasFocused(highwayCanvas) {
    const ss = window.feedBackSplitscreen;
    if (!splitscreenActive()) return true;
    return !!(ss && typeof ss.isCanvasFocused === 'function' &&
        ss.isCanvasFocused(highwayCanvas));
}
