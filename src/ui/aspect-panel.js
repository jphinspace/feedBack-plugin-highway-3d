import { BASE_VFOV, HORPLUS_MIN_VFOV } from '../core/constants.js';

/**
 * Wide-pane framing debug tuner (Shift+A). Talks to the renderer only
 * through `window.__h3dAspectTune`/`__h3dAspectPanes`/`__h3dAspectPanelOpen`/
 * `__h3dAspectReadout` — the per-frame camera code in `main.js` reads/writes
 * those same globals, not any binding exported from here (except
 * {@link _aspectPaneKey}/{@link _aspectRegisterPane}/{@link _resolveTuneFor},
 * called once per frame per pane, and {@link _toggleAspectPanel}, called
 * from `ui/shortcuts.js`'s Shift+A handler). Disabled by default — none of
 * this runs unless the user opts in.
 */

/** Versioned localStorage key — bumped once to invalidate a broken early default that may have persisted. */
export const _ASPECT_LS = 'h3d_aspect_tune2';

/**
 * Default OFF: every pane renders identically to before this feature
 * existed. When enabled, `baseVfov === BASE_VFOV` keeps normal ~16:9 panes
 * unaffected; only panes wider than `startAspect` engage the Hor+ hold.
 */
export const _ASPECT_DEFAULTS = {
    enabled: false, baseVfov: BASE_VFOV, startAspect: 2.25, hfovDeg: null,
    blend: 1, minVfovDeg: HORPLUS_MIN_VFOV, splitOnly: false,
    heightMul: 0.30, distMul: 0.95, pitchAdd: -1.5, lookDepthMul: 1,
};
/** Slider specs; checkboxes and the hfov override are built separately in the panel. */
export const _ASPECT_FIELDS = [
    { k: 'baseVfov',     label: 'Base vFOV°',   min: 18,  max: 90,  step: 1 },
    { k: 'startAspect',  label: 'Start aspect', min: 1.0, max: 4.0, step: 0.05 },
    { k: 'blend',        label: 'Blend',        min: 0,   max: 1,   step: 0.05 },
    { k: 'minVfovDeg',   label: 'Min vFOV°',    min: 10,  max: 60,  step: 1 },
    { k: 'heightMul',    label: 'Height ×',     min: 0.1, max: 2.5, step: 0.05 },
    { k: 'distMul',      label: 'Dolly ×',      min: 0.2, max: 3.0, step: 0.05 },
    { k: 'pitchAdd',     label: 'Pitch +',      min: -40, max: 40,  step: 0.5 },
    { k: 'lookDepthMul', label: 'Look depth',   min: 0.2, max: 3.0, step: 0.05 },
];
export let _aspectPanelEl = null;
export let _aspectPanelRO = null;
export let _aspectPanelRAF = 0;
export let _aspectTargetSel = null;
export let _aspectTgtRow = null;
export let _aspectHfovCb = null;
export let _aspectHfovSl = null;
/** Edit target: `''` writes the shared base; a pane key writes that pane's sparse override. */
export let _aspectEditTarget = '';
/** Bumped when the set of live panes changes, so the panel rebuilds the Target dropdown without flickering on every per-frame re-report. */
export let _aspectPanesDirty = true;

let _aspectPaneCounter = 0;
/** Monotonic per-instance fallback key counter; only this module may reassign it, hence the function form. */
export function nextPaneCounter() {
    return ++_aspectPaneCounter;
}
export function _aspectNowMs() {
    try { if (performance && performance.now) return performance.now(); } catch (e) {}
    try { return Date.now(); } catch (e) { return 0; }
}
/** Pane key: prefers the arrangement name so framing is stable across songs; falls back to a per-instance id. */
export function _aspectPaneKey(arrangement, uid) {
    const a = (typeof arrangement === 'string') ? arrangement.trim() : '';
    return a ? ('arr:' + a) : ('pane:' + uid);
}
export function _aspectPaneLabel(paneKey) {
    if (paneKey.slice(0, 4) === 'arr:') return paneKey.slice(4);
    if (paneKey.slice(0, 5) === 'pane:') return 'Pane ' + paneKey.slice(5);
    return paneKey;
}

/** Gets or creates the shared bridge object, seeded from defaults + localStorage; may carry a sparse `__panels` per-pane override map. */
export function _aspectTune() {
    let t = window.__h3dAspectTune;
    if (!t || typeof t !== 'object') {
        t = Object.assign({}, _ASPECT_DEFAULTS);
        try {
            const raw = localStorage.getItem(_ASPECT_LS);
            if (raw) Object.assign(t, JSON.parse(raw));
        } catch (e) {}
        window.__h3dAspectTune = t;
    }
    return t;
}
/** Bumped on every tune mutation so {@link _resolveTuneFor}'s cache can invalidate cheaply. */
export let _aspectRev = 0;
export function _aspectPersist() {
    _aspectRev++;
    try {
        const t = _aspectTune(), out = {};
        Object.keys(_ASPECT_DEFAULTS).forEach((k) => { out[k] = t[k]; });
        // Persist per-pane overrides keyed by arrangement only — instance-id fallback
        // keys are session-only and would leak a new key every reload if persisted.
        if (t.__panels) {
            const p = {}; let any = false;
            Object.keys(t.__panels).forEach((k) => {
                if (k.slice(0, 4) === 'arr:') { p[k] = t.__panels[k]; any = true; }
            });
            if (any) out.__panels = p;
        }
        localStorage.setItem(_ASPECT_LS, JSON.stringify(out));
    } catch (e) {}
}

/** Resolves the effective tune for a pane (base + that pane's overrides), memoized per pane against {@link _aspectRev}. */
export const _aspectResolveCache = new Map();
export function _resolveTuneFor(paneKey) {
    const base = _aspectTune();
    const ov = base.__panels && base.__panels[paneKey];
    if (!ov) return base;
    const c = _aspectResolveCache.get(paneKey);
    if (c && c.rev === _aspectRev) return c.obj;
    const out = {};
    Object.keys(_ASPECT_DEFAULTS).forEach((k) => { out[k] = (k in ov) ? ov[k] : base[k]; });
    _aspectResolveCache.set(paneKey, { rev: _aspectRev, obj: out });
    return out;
}
/** Records a live pane for the Target dropdown; called every frame per renderer. */
export function _aspectRegisterPane(paneKey) {
    const reg = window.__h3dAspectPanes || (window.__h3dAspectPanes = {});
    const label = _aspectPaneLabel(paneKey);
    let e = reg[paneKey];
    if (!e) { e = reg[paneKey] = { label, seen: 0 }; _aspectPanesDirty = true; }
    else if (e.label !== label) { e.label = label; _aspectPanesDirty = true; }
    e.seen = _aspectNowMs();
}
/** Drops panes not reported recently (song change, split teardown, pane close). */
export function _aspectPrunePanes() {
    const reg = window.__h3dAspectPanes;
    if (!reg) return;
    const now = _aspectNowMs();
    const ro = window.__h3dAspectReadout;
    Object.keys(reg).forEach((k) => {
        if (now - (reg[k].seen || 0) > 1500) {
            delete reg[k];
            if (ro) { delete ro[k]; if (ro.__last === k) delete ro.__last; }
            _aspectPanesDirty = true;
        }
    });
}

/** True while {@link _syncAspectPanel} is programmatically refreshing controls, so its synthetic 'input' events don't write back into the tune. */
export let _aspectSyncing = false;
export function _aspectReadVal(k) {
    const base = _aspectTune();
    if (!_aspectEditTarget) return base[k];
    const ov = base.__panels && base.__panels[_aspectEditTarget];
    return (ov && (k in ov)) ? ov[k] : base[k];
}
export function _aspectWriteVal(k, v) {
    const base = _aspectTune();
    if (!_aspectEditTarget) { base[k] = v; }
    else {
        const m = base.__panels || (base.__panels = {});
        (m[_aspectEditTarget] || (m[_aspectEditTarget] = {}))[k] = v;
    }
    _aspectPersist();
}
/** Clears a field: base target resets to auto (`null`); pane target deletes the override key (and the pane's override object once empty). */
export function _aspectClearVal(k) {
    const base = _aspectTune();
    if (!_aspectEditTarget) { base[k] = null; }
    else {
        const m = base.__panels, ov = m && m[_aspectEditTarget];
        if (ov) { delete ov[k]; if (!Object.keys(ov).length) delete m[_aspectEditTarget]; }
    }
    _aspectPersist();
}

/** Rebuilds the Target dropdown from the live pane registry, preserving the current selection when still valid. */
export function _aspectBuildTargets() {
    if (!_aspectTargetSel) return;
    if (document.activeElement === _aspectTargetSel) return;
    const reg = window.__h3dAspectPanes || {};
    const keys = Object.keys(reg).sort();
    _aspectTargetSel.innerHTML = '';
    const all = document.createElement('option');
    all.value = ''; all.textContent = keys.length > 1 ? 'All panes' : 'All';
    _aspectTargetSel.appendChild(all);
    keys.forEach((pk) => {
        const o = document.createElement('option');
        o.value = pk; o.textContent = reg[pk].label;
        _aspectTargetSel.appendChild(o);
    });
    // Force back to "All" when the Target row is hidden (single pane) or the selected
    // pane is gone — otherwise a stale target silently routes edits into a hidden override.
    if (keys.length <= 1 || (_aspectEditTarget && !reg[_aspectEditTarget])) {
        _aspectEditTarget = '';
    }
    _aspectTargetSel.value = _aspectEditTarget;
    if (_aspectTgtRow) _aspectTgtRow.style.display = keys.length > 1 ? '' : 'none';
    _aspectPanesDirty = false;
}

export function _ensureAspectPanel() {
    if (_aspectPanelEl || typeof document === 'undefined') return;
    const wrap = document.createElement('div');
    wrap.id = 'h3d-aspect-tuner';
    wrap.style.cssText = [
        'position:fixed', 'top:64px', 'right:12px', 'z-index:99999',
        'width:236px', 'padding:10px 12px', 'border-radius:8px',
        'background:rgba(12,18,28,0.92)', 'border:1px solid rgba(120,150,200,0.35)',
        'box-shadow:0 6px 24px rgba(0,0,0,0.5)', 'color:#cfe0f5',
        'font:11px/1.35 system-ui,sans-serif', 'user-select:none',
        'pointer-events:auto',
    ].join(';');

    const hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;';
    const title = document.createElement('div');
    title.textContent = 'Wide-pane framing';
    title.style.cssText = 'font-weight:700;color:#e8c040;';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.title = 'Close (Shift+A)';
    close.setAttribute('aria-label', 'Close');
    close.style.cssText = 'border:none;background:transparent;color:#cfe0f5;font-size:17px;line-height:1;cursor:pointer;padding:0 2px;';
    close.addEventListener('click', () => _setAspectPanelVisible(false));
    hdr.appendChild(title); hdr.appendChild(close); wrap.appendChild(hdr);

    const tgtRow = document.createElement('div'); tgtRow.style.cssText = 'margin:2px 0 7px;';
    _aspectTgtRow = tgtRow;
    const tgtLab = document.createElement('div');
    tgtLab.textContent = 'Target'; tgtLab.style.cssText = 'color:#9fb0c8;margin-bottom:2px;';
    _aspectTargetSel = document.createElement('select');
    _aspectTargetSel.setAttribute('aria-label', 'Target pane');
    _aspectTargetSel.style.cssText = 'width:100%;background:rgba(30,44,66,0.9);color:#cfe0f5;border:1px solid rgba(120,150,200,0.4);border-radius:4px;padding:3px;';
    _aspectTargetSel.addEventListener('change', () => {
        _aspectEditTarget = _aspectTargetSel.value; _syncAspectPanel();
    });
    tgtRow.appendChild(tgtLab); tgtRow.appendChild(_aspectTargetSel); wrap.appendChild(tgtRow);
    _aspectBuildTargets();

    [['enabled', 'Enabled'], ['splitOnly', 'Split panes only']].forEach(([k, lbl]) => {
        const row = document.createElement('label');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:2px 0;cursor:pointer;';
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = !!_aspectReadVal(k); cb.dataset.k = k;
        cb.addEventListener('change', () => { _aspectWriteVal(k, cb.checked); });
        const span = document.createElement('span'); span.textContent = lbl;
        row.appendChild(cb); row.appendChild(span); wrap.appendChild(row);
    });

    _ASPECT_FIELDS.forEach((f) => {
        const row = document.createElement('div');
        row.style.cssText = 'margin:5px 0;';
        const head = document.createElement('div');
        head.style.cssText = 'display:flex;justify-content:space-between;';
        const lab = document.createElement('span'); lab.textContent = f.label;
        const val = document.createElement('span');
        val.style.cssText = 'color:#8fb6ff;font-variant-numeric:tabular-nums;';
        head.appendChild(lab); head.appendChild(val); row.appendChild(head);
        const sl = document.createElement('input');
        sl.type = 'range'; sl.min = f.min; sl.max = f.max; sl.step = f.step;
        const rv = _aspectReadVal(f.k);
        sl.value = Number.isFinite(rv) ? rv : _ASPECT_DEFAULTS[f.k];
        sl.dataset.k = f.k;
        sl.style.cssText = 'width:100%;';
        const show = () => { val.textContent = (+sl.value).toFixed(f.step < 1 ? 2 : 0); };
        show();
        sl.addEventListener('input', () => {
            show();
            if (!_aspectSyncing) _aspectWriteVal(f.k, parseFloat(sl.value));
        });
        row.appendChild(sl); wrap.appendChild(row);
    });

    {
        const row = document.createElement('div'); row.style.cssText = 'margin:5px 0;';
        const head = document.createElement('label');
        head.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;';
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = Number.isFinite(_aspectReadVal('hfovDeg'));
        const lbl = document.createElement('span'); lbl.textContent = 'Override held hFOV°';
        head.appendChild(cb); head.appendChild(lbl); row.appendChild(head);
        const sl = document.createElement('input');
        sl.type = 'range'; sl.min = 40; sl.max = 160; sl.step = 1;
        const hv = _aspectReadVal('hfovDeg');
        sl.value = Number.isFinite(hv) ? hv : 102;
        sl.disabled = !cb.checked;
        sl.style.cssText = 'width:100%;';
        cb.addEventListener('change', () => {
            if (_aspectSyncing) return;
            sl.disabled = !cb.checked;
            if (cb.checked) _aspectWriteVal('hfovDeg', parseFloat(sl.value));
            else _aspectClearVal('hfovDeg');
        });
        sl.addEventListener('input', () => {
            if (!_aspectSyncing && cb.checked) _aspectWriteVal('hfovDeg', parseFloat(sl.value));
        });
        row.appendChild(sl); wrap.appendChild(row);
        _aspectHfovCb = cb; _aspectHfovSl = sl;
    }

    _aspectPanelRO = document.createElement('div');
    _aspectPanelRO.style.cssText = 'margin-top:6px;padding-top:6px;border-top:1px solid rgba(120,150,200,0.25);color:#9fb;font-variant-numeric:tabular-nums;';
    _aspectPanelRO.textContent = 'aspect — · vFOV —';
    wrap.appendChild(_aspectPanelRO);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:6px;margin-top:8px;';
    const mkBtn = (txt, fn) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = txt;
        b.style.cssText = 'flex:1;padding:4px 0;border-radius:5px;border:1px solid rgba(120,150,200,0.4);background:rgba(40,60,90,0.6);color:#cfe0f5;cursor:pointer;font:11px system-ui;';
        b.addEventListener('click', fn);
        return b;
    };
    btnRow.appendChild(mkBtn('Reset', () => {
        const base = _aspectTune();
        if (!_aspectEditTarget) {
            Object.keys(_ASPECT_DEFAULTS).forEach((k) => { base[k] = _ASPECT_DEFAULTS[k]; });
        } else if (base.__panels) {
            delete base.__panels[_aspectEditTarget];
        }
        _aspectPersist(); _syncAspectPanel();
    }));
    btnRow.appendChild(mkBtn('Copy', () => {
        const r = _aspectEditTarget ? _resolveTuneFor(_aspectEditTarget) : _aspectTune();
        const out = {};
        Object.keys(_ASPECT_DEFAULTS).forEach((k) => { out[k] = r[k]; });
        const json = JSON.stringify(out, null, 2);
        try { console.log('[h3d] wide-pane framing values (' + (_aspectEditTarget || 'all') + '):\n' + json); } catch (e) {}
        try { if (navigator.clipboard) navigator.clipboard.writeText(json); } catch (e) {}
    }));
    wrap.appendChild(btnRow);

    document.body.appendChild(wrap);
    _aspectPanelEl = wrap;
    _aspectPanelEl.style.display = 'none';
}

/** Pushes the current target's values back into the panel controls (after Reset, a target switch, or an external edit). */
export function _syncAspectPanel() {
    if (!_aspectPanelEl) return;
    _aspectBuildTargets();
    _aspectSyncing = true;
    try {
        _aspectPanelEl.querySelectorAll('input[type=checkbox][data-k]').forEach((cb) => {
            cb.checked = !!_aspectReadVal(cb.dataset.k);
        });
        _aspectPanelEl.querySelectorAll('input[type=range][data-k]').forEach((sl) => {
            const v = _aspectReadVal(sl.dataset.k);
            if (Number.isFinite(v)) sl.value = v;
            sl.dispatchEvent(new Event('input'));
        });
        if (_aspectHfovCb) {
            const hv = _aspectReadVal('hfovDeg');
            _aspectHfovCb.checked = Number.isFinite(hv);
            _aspectHfovSl.disabled = !_aspectHfovCb.checked;
            if (Number.isFinite(hv)) _aspectHfovSl.value = hv;
        }
    } finally {
        _aspectSyncing = false;
    }
}

export function _setAspectPanelVisible(on) {
    _ensureAspectPanel();
    if (!_aspectPanelEl) return;
    _aspectPanelEl.style.display = on ? 'block' : 'none';
    window.__h3dAspectPanelOpen = !!on;
    if (on) { _aspectPrunePanes(); _aspectBuildTargets(); }
    if (on && !_aspectPanelRAF) {
        const tick = () => {
            if (!window.__h3dAspectPanelOpen) { _aspectPanelRAF = 0; return; }
            _aspectPrunePanes();
            if (_aspectPanesDirty) _aspectBuildTargets();
            const ro = window.__h3dAspectReadout;
            if (_aspectPanelRO && ro) {
                const key = _aspectEditTarget || ro.__last;
                const e = key && ro[key];
                if (e && Number.isFinite(e.aspect)) {
                    _aspectPanelRO.textContent =
                        'aspect ' + e.aspect.toFixed(2) + ' · vFOV ' + e.vfov.toFixed(1) + '°';
                }
            }
            _aspectPanelRAF = requestAnimationFrame(tick);
        };
        _aspectPanelRAF = requestAnimationFrame(tick);
    }
}
export function _toggleAspectPanel() {
    _ensureAspectPanel();
    const open = !(_aspectPanelEl && _aspectPanelEl.style.display !== 'none');
    _setAspectPanelVisible(open);
    if (open) _syncAspectPanel();
}
