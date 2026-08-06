import { _toggleAspectPanel } from './aspect-panel.js';

// Shortcut for the wide-pane framing tuner. Opens/closes the floating panel
// (the A/B on/off and the per-pane target live inside it now). Registered
// once per session via a module-level guard (it drives shared module state,
// so per-instance registration would stack duplicate handlers and cancel
// itself out); it's a harmless debug control, so it is never unregistered.
// No-ops where the core shortcut API isn't present (older core / borrowed
// contexts).
let _tunerShortcutRegistered = false;
export function _registerTunerShortcut() {
    if (_tunerShortcutRegistered) return;
    if (typeof window.registerShortcut !== 'function') return;
    _tunerShortcutRegistered = true;
    try {
        window.registerShortcut({
            key: 'A',   // uppercase e.key → produced with Shift held (Shift+A)
            description: '3D Highway: open/close wide-pane framing tuner (Shift+A)',
            scope: 'player',
            handler: () => {
                // Open/close the live tuner panel. The A/B on/off and the
                // per-pane target now live in the panel itself, so the
                // shortcut is just a dismiss/reveal.
                _toggleAspectPanel();
            },
        });
    } catch (e) {
        _tunerShortcutRegistered = false;   // allow a later retry if it threw
    }
}
