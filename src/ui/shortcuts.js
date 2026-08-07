import { _toggleAspectPanel } from './aspect-panel.js';

/**
 * Shift+A shortcut for the wide-pane framing tuner debug panel. Registered
 * once per session via a module-level guard — it drives shared module
 * state, so per-instance registration would stack duplicate handlers.
 * No-ops where the core shortcut API isn't present.
 */
let _tunerShortcutRegistered = false;
export function _registerTunerShortcut() {
    if (_tunerShortcutRegistered) return;
    if (typeof window.registerShortcut !== 'function') return;
    _tunerShortcutRegistered = true;
    try {
        window.registerShortcut({
            key: 'A',
            description: '3D Highway: open/close wide-pane framing tuner (Shift+A)',
            scope: 'player',
            handler: () => {
                _toggleAspectPanel();
            },
        });
    } catch (e) {
        _tunerShortcutRegistered = false;
    }
}
