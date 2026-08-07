const SETTINGS_LS_KEY = 'viz3d_settings';
const BUTTERCHURN_DEFAULTS = { enabled: true, opacity: 1.0, laneDim: true, laneDimStrength: 0.45, chartAccents: true, colorTint: true, chartStrength: 1.0, tintStrength: 0.65, guitarGain: 6, songGain: 1.8, cyclePool: 'all', hold: false };
let butterchurnSettings = null;

/** Loads (and caches) the Butterchurn settings blob, merged over defaults. */
export function loadButterchurnSettings() {
    if (butterchurnSettings) return butterchurnSettings;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_LS_KEY) || '{}'); } catch (e) {}
    butterchurnSettings = Object.assign({}, BUTTERCHURN_DEFAULTS, saved);
    return butterchurnSettings;
}
export function saveButterchurnSettings() { try { localStorage.setItem(SETTINGS_LS_KEY, JSON.stringify(butterchurnSettings)); } catch (e) {} }
export const butterchurnControllers = new Set();
export function applyButterchurnSettingsToAll() { butterchurnControllers.forEach((c) => { try { c.applySettings(); } catch (e) {} }); }

/** Reputation-based starter favorites, applied once on first run; the user can edit freely after. */
export const DEFAULT_FAVORITE_PRESETS = [
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
export const DEFAULT_BANNED_PRESETS = [
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
export const favoritePresets = new Set();
export const bannedPresets = new Set();
let presetListsLoaded = false;

/** Loads favorite/banned preset lists from localStorage, seeding the defaults on first run. */
export function loadPresetLists() {
    if (presetListsLoaded) return; presetListsLoaded = true;
    try { (JSON.parse(localStorage.getItem('viz3d_favorites') || '[]') || []).forEach((n) => favoritePresets.add(n)); } catch (e) {}
    try { (JSON.parse(localStorage.getItem('viz3d_banned') || '[]') || []).forEach((n) => bannedPresets.add(n)); } catch (e) {}
    let seeded = false;
    try { seeded = !!localStorage.getItem('viz3d_seeded'); } catch (e) {}
    if (!seeded) {
        DEFAULT_FAVORITE_PRESETS.forEach((n) => favoritePresets.add(n));
        DEFAULT_BANNED_PRESETS.forEach((n) => bannedPresets.add(n));
        try { localStorage.setItem('viz3d_seeded', '1'); } catch (e) {}
        savePresetLists();
    }
}
export function savePresetLists() {
    try { localStorage.setItem('viz3d_favorites', JSON.stringify([...favoritePresets])); } catch (e) {}
    try { localStorage.setItem('viz3d_banned', JSON.stringify([...bannedPresets])); } catch (e) {}
}

/** Drops the cached settings blob so the next {@link loadButterchurnSettings} re-reads localStorage. */
export function resetButterchurnSettingsCache() { butterchurnSettings = null; }
