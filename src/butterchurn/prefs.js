/* ── Controls + readability (localStorage-backed, global config) ───── */
const BC_LS = 'viz3d_settings';
const BC_DEFAULTS = { enabled: true, opacity: 1.0, laneDim: true, laneDimStrength: 0.45, chartAccents: true, colorTint: true, chartStrength: 1.0, tintStrength: 0.65, guitarGain: 6, songGain: 1.8, cyclePool: 'all', hold: false };
let _bcSettings = null;
export function _bcLoadSettings() {
    if (_bcSettings) return _bcSettings;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(BC_LS) || '{}'); } catch (e) {}
    _bcSettings = Object.assign({}, BC_DEFAULTS, saved);
    return _bcSettings;
}
export function _bcSaveSettings() { try { localStorage.setItem(BC_LS, JSON.stringify(_bcSettings)); } catch (e) {} }
export const _bcControllers = new Set();
export function _bcApplyAll() { _bcControllers.forEach((c) => { try { c.applySettings(); } catch (e) {} }); }

// Preset curation: favorites / bans (persisted globally) + the "primary"
// controller the panel's preset buttons drive.
// Seeded once on first run (reputation-based starter set; user can edit freely).
export const BC_DEFAULT_FAVORITES = [
    'Flexi, martin + geiss - dedicated to the sherwin maxawow',
    'Geiss - Reaction Diffusion 2',
    'Geiss - Spiral Artifact',
    'Flexi + Martin - cascading decay swing',
    'Flexi - mindblob [shiny mix]',
    'Geiss - Cauldron - painterly 2 (saturation remix)',
    'Zylot - Paint Spill (Music Reactive Paint Mix)',
    'Flexi - predator-prey-spirals',
    'Rovastar + Loadus + Geiss - FractalDrop (Triple Mix)',
    'Flexi, fishbrain, Geiss + Martin - tokamak witchery',
];
export const BC_DEFAULT_BANS = [
    'martin - mucus cervix',
    'Goody - The Wild Vort',
    'martin - extreme heat',
    'Unchained - Rewop',
    'high-altitude basket unraveling - singh grooves nitrogen argon nz+',
    '$$$ Royal - Mashup (197)',
    '$$$ Royal - Mashup (431)',
    'suksma - uninitialized variabowl (hydroponic chronic)',
    'shifter - dark tides bdrv mix 2',
    '_Mig_049',
];
export const _bcFavorites = new Set();
export const _bcBanned = new Set();
let _bcListsLoaded = false;
export function _bcLoadLists() {
    if (_bcListsLoaded) return; _bcListsLoaded = true;
    try { (JSON.parse(localStorage.getItem('viz3d_favorites') || '[]') || []).forEach((n) => _bcFavorites.add(n)); } catch (e) {}
    try { (JSON.parse(localStorage.getItem('viz3d_banned') || '[]') || []).forEach((n) => _bcBanned.add(n)); } catch (e) {}
    let seeded = false;
    try { seeded = !!localStorage.getItem('viz3d_seeded'); } catch (e) {}
    if (!seeded) {
        BC_DEFAULT_FAVORITES.forEach((n) => _bcFavorites.add(n));
        BC_DEFAULT_BANS.forEach((n) => _bcBanned.add(n));
        try { localStorage.setItem('viz3d_seeded', '1'); } catch (e) {}
        _bcSaveLists();
    }
}
export function _bcSaveLists() {
    try { localStorage.setItem('viz3d_favorites', JSON.stringify([..._bcFavorites])); } catch (e) {}
    try { localStorage.setItem('viz3d_banned', JSON.stringify([..._bcBanned])); } catch (e) {}
}

// src/main.js's window.h3dBcApplySettings (the settings.html live-apply
// hook) used to reach in and reassign _bcSettings = null directly to drop
// the cache; that state is module-private here, so it needs a real setter.
export function _bcResetSettingsCache() { _bcSettings = null; }
