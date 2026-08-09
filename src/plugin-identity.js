/** Stable identity boundaries for the independently installable development plugin. */
export const PLUGIN_ID = 'highway_3d_dev';
export const DOM_ID_PREFIX = `${PLUGIN_ID}-`;
export const STORAGE_PREFIX = `${PLUGIN_ID}.`;

export const storageKey = (suffix) => `${STORAGE_PREFIX}${suffix}`;
export const backgroundStorageKey = (key) => storageKey(`background.${key}`);
export const panelBackgroundStorageKey = (panelKey, key) => (
  storageKey(`background.${panelKey}.${key}`)
);
