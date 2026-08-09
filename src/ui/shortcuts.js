import { _toggleAspectPanel } from './aspect-panel.js';

/**
 * Shift+D shortcut for the dev plugin's wide-pane framing tuner. Registered
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
      key: 'D',
      description: '3D Highway (dev): open/close wide-pane framing tuner (Shift+D)',
      scope: 'player',
      handler: () => {
        _toggleAspectPanel();
      },
    });
  } catch (e) {
    _tunerShortcutRegistered = false;
  }
}
