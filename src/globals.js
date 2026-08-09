import {
  h3dBgSetStyle, h3dBgSetIntensity, h3dBgSetReactive, h3dBgSetPalette, h3dBgSetBgTheme,
  h3dBgSetHwTheme, h3dBgSetStringColors, h3dBgSetShowFretOnNote,
  h3dBgSetFretNumberGhostScope, h3dBgSetCameraSmoothing, h3dBgSetZoomSmoothing,
  h3dBgSetTiltSmoothing, h3dBgSetCameraLockLow, h3dBgSetCameraLockZoom, h3dBgSetCameraMode,
  h3dBgSetNutHeadstockVisible, h3dBgSetTuningLabelsVisible, h3dBgSetNutColor,
  h3dBgSetHeadstockColor, h3dBgSetTextSize, h3dBgSetVibrancy, h3dBgSetGlow, h3dBgSetHitFx,
  h3dBgSetSparks, h3dBgSetCinematic, h3dBgSetVerdictMarks, h3dBgSetTimingFx,
  h3dBgSetStreakFx, h3dBgSetBloom, h3dBgSetToneHudVisible, h3dBgSetToneHudPosition,
  h3dBgSetToneHudSize, h3dBgSetFpsVisible, h3dBgSetFretDividersVisible,
  h3dBgSetChordDiagramVisible, h3dBgSetChordDiagramSize, h3dBgSetChordDiagramPosition,
  h3dBgSetFretColumnMarkerCadence, h3dBgSetInlayLabelsVisible,
  h3dBgSetSectionLabelsOnHighway, h3dBgSetSectionHudVisible, h3dBgSetSectionHudPosition,
  h3dBgSetSectionHudSize, h3dBgSetProjectionVisible, h3dBgSetSlideArrowApproachVisible,
  h3dBgSetSlideArrowNeckVisible, h3dBgSetSlideArrowChainPreviewVisible, h3dBgSetCustomImage,
  h3dBgClearCustomImage, h3dBgSetCustomVideo, h3dBgClearCustomVideo, h3dSetPalette,
} from './settings/setters.js';
import {
  h3dVenueSceneSetActive, h3dVenueSceneSetMood, h3dVenueBackdropSetVideo,
  h3dVenueBackdropSetMix, h3dVenueSceneSetInstrumentPov, h3dVenueSceneSetMotionMode,
  h3dVenueSceneGetState,
} from './background/venue.js';

/**
 * The only file that writes the plugin's *public* `window.*` contract.
 * Every renderer module exports plain functions/values; this is the sole
 * place they bind onto the global object the host and settings.html call
 * against. Every name is spelled out longhand (not looped over
 * `Object.entries`) so this stays one auditable, greppable list of the
 * plugin's entire external `window.*` surface.
 *
 * Not called at this module's own top level — `main.js` calls
 * `installGlobals()` once, alongside `initFretSpacing()`.
 *
 * Deliberately NOT listed here: `window.__h3dDevAspectTune`/`__h3dDevAspectPanes`/
 * `__h3dDevAspectPanelOpen`/`__h3dDevAspectReadout` (`ui/aspect-panel.js`) and
 * `window.__feedBackAudioTap` (`audio/analyser.js`) — private, double-
 * underscore-prefixed cross-module-instance/cross-plugin coordination
 * slots, not part of this public contract. See CLAUDE.md's globals.js
 * rule for why they can't be one-time `installGlobals()` bindings.
 */
export function installGlobals() {
  // This fork is loaded beside the bundled highway_3d plugin. Never bind its mutable
  // API onto the bundled plugin's historical h3d* names: two independently-evaluated
  // module graphs have independent subscriber buses, so last-writer-wins globals would
  // send live setting changes to only one of them.
  window.h3dDevBgSetStyle = h3dBgSetStyle;
  window.h3dDevBgSetIntensity = h3dBgSetIntensity;
  window.h3dDevBgSetReactive = h3dBgSetReactive;
  window.h3dDevBgSetPalette = h3dBgSetPalette;
  window.h3dDevBgSetBgTheme = h3dBgSetBgTheme;
  window.h3dDevBgSetHwTheme = h3dBgSetHwTheme;
  window.h3dDevBgSetStringColors = h3dBgSetStringColors;
  window.h3dDevBgSetShowFretOnNote = h3dBgSetShowFretOnNote;
  window.h3dDevBgSetFretNumberGhostScope = h3dBgSetFretNumberGhostScope;
  window.h3dDevBgSetCameraSmoothing = h3dBgSetCameraSmoothing;
  window.h3dDevBgSetZoomSmoothing = h3dBgSetZoomSmoothing;
  window.h3dDevBgSetTiltSmoothing = h3dBgSetTiltSmoothing;
  window.h3dDevBgSetCameraLockLow = h3dBgSetCameraLockLow;
  window.h3dDevBgSetCameraLockZoom = h3dBgSetCameraLockZoom;
  window.h3dDevBgSetCameraMode = h3dBgSetCameraMode;
  window.h3dDevBgSetNutHeadstockVisible = h3dBgSetNutHeadstockVisible;
  window.h3dDevBgSetTuningLabelsVisible = h3dBgSetTuningLabelsVisible;
  window.h3dDevBgSetNutColor = h3dBgSetNutColor;
  window.h3dDevBgSetHeadstockColor = h3dBgSetHeadstockColor;
  window.h3dDevBgSetTextSize = h3dBgSetTextSize;
  window.h3dDevBgSetVibrancy = h3dBgSetVibrancy;
  window.h3dDevBgSetGlow = h3dBgSetGlow;
  window.h3dDevBgSetHitFx = h3dBgSetHitFx;
  window.h3dDevBgSetSparks = h3dBgSetSparks;
  window.h3dDevBgSetCinematic = h3dBgSetCinematic;
  window.h3dDevBgSetVerdictMarks = h3dBgSetVerdictMarks;
  window.h3dDevBgSetTimingFx = h3dBgSetTimingFx;
  window.h3dDevBgSetStreakFx = h3dBgSetStreakFx;
  window.h3dDevBgSetBloom = h3dBgSetBloom;
  window.h3dDevBgSetToneHudVisible = h3dBgSetToneHudVisible;
  window.h3dDevBgSetToneHudPosition = h3dBgSetToneHudPosition;
  window.h3dDevBgSetToneHudSize = h3dBgSetToneHudSize;
  window.h3dDevBgSetFpsVisible = h3dBgSetFpsVisible;
  window.h3dDevBgSetFretDividersVisible = h3dBgSetFretDividersVisible;
  window.h3dDevBgSetChordDiagramVisible = h3dBgSetChordDiagramVisible;
  window.h3dDevBgSetChordDiagramSize = h3dBgSetChordDiagramSize;
  window.h3dDevBgSetChordDiagramPosition = h3dBgSetChordDiagramPosition;
  window.h3dDevBgSetFretColumnMarkerCadence = h3dBgSetFretColumnMarkerCadence;
  window.h3dDevBgSetInlayLabelsVisible = h3dBgSetInlayLabelsVisible;
  window.h3dDevBgSetSectionLabelsOnHighway = h3dBgSetSectionLabelsOnHighway;
  window.h3dDevBgSetSectionHudVisible = h3dBgSetSectionHudVisible;
  window.h3dDevBgSetSectionHudPosition = h3dBgSetSectionHudPosition;
  window.h3dDevBgSetSectionHudSize = h3dBgSetSectionHudSize;
  window.h3dDevBgSetProjectionVisible = h3dBgSetProjectionVisible;
  window.h3dDevBgSetSlideArrowApproachVisible = h3dBgSetSlideArrowApproachVisible;
  window.h3dDevBgSetSlideArrowNeckVisible = h3dBgSetSlideArrowNeckVisible;
  window.h3dDevBgSetSlideArrowChainPreviewVisible = h3dBgSetSlideArrowChainPreviewVisible;
  window.h3dDevBgSetCustomImage = h3dBgSetCustomImage;
  window.h3dDevBgClearCustomImage = h3dBgClearCustomImage;
  window.h3dDevBgSetCustomVideo = h3dBgSetCustomVideo;
  window.h3dDevBgClearCustomVideo = h3dBgClearCustomVideo;
  window.h3dDevSetPalette = h3dSetPalette;
  window.h3dDevVenueSceneSetActive = h3dVenueSceneSetActive;
  window.h3dDevVenueSceneSetMood = h3dVenueSceneSetMood;
  window.h3dDevVenueBackdropSetVideo = h3dVenueBackdropSetVideo;
  window.h3dDevVenueBackdropSetMix = h3dVenueBackdropSetMix;
  window.h3dDevVenueSceneSetInstrumentPov = h3dVenueSceneSetInstrumentPov;
  window.h3dDevVenueSceneSetMotionMode = h3dVenueSceneSetMotionMode;
  window.h3dDevVenueSceneGetState = h3dVenueSceneGetState;
}
