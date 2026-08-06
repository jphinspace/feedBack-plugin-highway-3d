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
    h3dBgClearCustomImage, h3dBgSetCustomVideo, h3dBgClearCustomVideo, h3dSetPalette
} from './settings/setters.js';
import {
    h3dVenueSceneSetActive, h3dVenueSceneSetMood, h3dVenueBackdropSetVideo,
    h3dVenueBackdropSetMix, h3dVenueSceneSetInstrumentPov, h3dVenueSceneSetMotionMode,
    h3dVenueSceneGetState,
} from './background/venue.js';

// THE ONLY FILE THAT WRITES window.* -- every renderer module exports
// plain functions/values; this file is the sole place they get bound onto
// the global object the host and settings.html actually call against.
// Every name is spelled out longhand below (not looped over
// Object.entries) so this stays the one auditable, greppable list of the
// plugin's entire external window.* surface.
//
// Not called at this module's own top level (import-time purity -- see
// docs/plugin-modules split plan): src/main.js calls installGlobals()
// once, alongside its other startup call (initFretSpacing()).
export function installGlobals() {
    window.h3dBgSetStyle = h3dBgSetStyle;
    window.h3dBgSetIntensity = h3dBgSetIntensity;
    window.h3dBgSetReactive = h3dBgSetReactive;
    window.h3dBgSetPalette = h3dBgSetPalette;
    window.h3dBgSetBgTheme = h3dBgSetBgTheme;
    window.h3dBgSetHwTheme = h3dBgSetHwTheme;
    window.h3dBgSetStringColors = h3dBgSetStringColors;
    window.h3dBgSetShowFretOnNote = h3dBgSetShowFretOnNote;
    window.h3dBgSetFretNumberGhostScope = h3dBgSetFretNumberGhostScope;
    window.h3dBgSetCameraSmoothing = h3dBgSetCameraSmoothing;
    window.h3dBgSetZoomSmoothing = h3dBgSetZoomSmoothing;
    window.h3dBgSetTiltSmoothing = h3dBgSetTiltSmoothing;
    window.h3dBgSetCameraLockLow = h3dBgSetCameraLockLow;
    window.h3dBgSetCameraLockZoom = h3dBgSetCameraLockZoom;
    window.h3dBgSetCameraMode = h3dBgSetCameraMode;
    window.h3dBgSetNutHeadstockVisible = h3dBgSetNutHeadstockVisible;
    window.h3dBgSetTuningLabelsVisible = h3dBgSetTuningLabelsVisible;
    window.h3dBgSetNutColor = h3dBgSetNutColor;
    window.h3dBgSetHeadstockColor = h3dBgSetHeadstockColor;
    window.h3dBgSetTextSize = h3dBgSetTextSize;
    window.h3dBgSetVibrancy = h3dBgSetVibrancy;
    window.h3dBgSetGlow = h3dBgSetGlow;
    window.h3dBgSetHitFx = h3dBgSetHitFx;
    window.h3dBgSetSparks = h3dBgSetSparks;
    window.h3dBgSetCinematic = h3dBgSetCinematic;
    window.h3dBgSetVerdictMarks = h3dBgSetVerdictMarks;
    window.h3dBgSetTimingFx = h3dBgSetTimingFx;
    window.h3dBgSetStreakFx = h3dBgSetStreakFx;
    window.h3dBgSetBloom = h3dBgSetBloom;
    window.h3dBgSetToneHudVisible = h3dBgSetToneHudVisible;
    window.h3dBgSetToneHudPosition = h3dBgSetToneHudPosition;
    window.h3dBgSetToneHudSize = h3dBgSetToneHudSize;
    window.h3dBgSetFpsVisible = h3dBgSetFpsVisible;
    window.h3dBgSetFretDividersVisible = h3dBgSetFretDividersVisible;
    window.h3dBgSetChordDiagramVisible = h3dBgSetChordDiagramVisible;
    window.h3dBgSetChordDiagramSize = h3dBgSetChordDiagramSize;
    window.h3dBgSetChordDiagramPosition = h3dBgSetChordDiagramPosition;
    window.h3dBgSetFretColumnMarkerCadence = h3dBgSetFretColumnMarkerCadence;
    window.h3dBgSetInlayLabelsVisible = h3dBgSetInlayLabelsVisible;
    window.h3dBgSetSectionLabelsOnHighway = h3dBgSetSectionLabelsOnHighway;
    window.h3dBgSetSectionHudVisible = h3dBgSetSectionHudVisible;
    window.h3dBgSetSectionHudPosition = h3dBgSetSectionHudPosition;
    window.h3dBgSetSectionHudSize = h3dBgSetSectionHudSize;
    window.h3dBgSetProjectionVisible = h3dBgSetProjectionVisible;
    window.h3dBgSetSlideArrowApproachVisible = h3dBgSetSlideArrowApproachVisible;
    window.h3dBgSetSlideArrowNeckVisible = h3dBgSetSlideArrowNeckVisible;
    window.h3dBgSetSlideArrowChainPreviewVisible = h3dBgSetSlideArrowChainPreviewVisible;
    window.h3dBgSetCustomImage = h3dBgSetCustomImage;
    window.h3dBgClearCustomImage = h3dBgClearCustomImage;
    window.h3dBgSetCustomVideo = h3dBgSetCustomVideo;
    window.h3dBgClearCustomVideo = h3dBgClearCustomVideo;
    window.h3dSetPalette = h3dSetPalette;
    window.h3dVenueSceneSetActive = h3dVenueSceneSetActive;
    window.h3dVenueSceneSetMood = h3dVenueSceneSetMood;
    window.h3dVenueBackdropSetVideo = h3dVenueBackdropSetVideo;
    window.h3dVenueBackdropSetMix = h3dVenueBackdropSetMix;
    window.h3dVenueSceneSetInstrumentPov = h3dVenueSceneSetInstrumentPov;
    window.h3dVenueSceneSetMotionMode = h3dVenueSceneSetMotionMode;
    window.h3dVenueSceneGetState = h3dVenueSceneGetState;
}
