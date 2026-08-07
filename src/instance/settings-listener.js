import { _venueSwapPlateIfNeeded } from '../background/venue.js';

/**
 * The live settings-bus subscriber. Outlives the `initScene()` call that
 * creates it — `subscribeToSettings()` keeps it alive until `teardown()`
 * unsubscribes.
 *
 * `tests/settings-live-refresh.test.mjs` brace-matches this function's body
 * directly from source to assert every `loadSettings()`-mirrored key is
 * handled here — keep every `changedKey === '...'` comparison as an exact
 * string literal; the test's extractor depends on that literal shape.
 */
export function createSettingsListener({
    getFretG, buildBoard, loadSettings, ctx,
    setLastOpenStringLblSig, getTuningLabelSprites, _disposeOpenStringPitchSprites,
    _applyVibrancy, _applyGlow,
    rebuildBackground, _applyBgTheme,
    getBgState, effectiveBackgroundStyleId,
}) {
    return (changedKey) => {
        if (changedKey === 'fretSpacing') {
            // _h3dFretUniform + the fretX-derived scalars are already updated globally;
            // rebuild only this panel's static board geometry for the new spacing.
            if (getFretG()) buildBoard();
            return;
        }
        if (changedKey === 'inlayLabelsVisible') {
            loadSettings();
            for (const lbl of ctx.board._inlayLabels) lbl.visible = ctx.settings.inlayLabelsVisible;
            return;
        }
        if (changedKey === 'nutHeadstockVisible') {
            loadSettings();
            if (ctx.board.nutHeadstockGroup) ctx.board.nutHeadstockGroup.visible = ctx.settings.nutHeadstockVisible;
            return;
        }
        if (changedKey === 'tuningLabelsVisible') {
            loadSettings();
            setLastOpenStringLblSig('');
            if (getTuningLabelSprites().length) _disposeOpenStringPitchSprites();
            return;
        }
        if (changedKey === 'nutColor' || changedKey === 'headstockColor') {
            loadSettings();
            if (getFretG()) buildBoard();
            for (const lbl of ctx.board._inlayLabels) lbl.visible = ctx.settings.inlayLabelsVisible;
            return;
        }
        if (changedKey === 'reactive' || changedKey === 'showFretOnNote' ||
            changedKey === 'fretNumberGhostScope' ||
            changedKey === 'cameraSmoothing' || changedKey === 'zoomSmoothing' ||
            changedKey === 'tiltSmoothing' || changedKey === 'cameraLockLow' ||
            changedKey === 'cameraLockZoom' || changedKey === 'cameraMode' ||
            changedKey === 'textSize' ||
            changedKey === 'chordDiagramSize' || changedKey === 'chordDiagramPosition' ||
            changedKey === 'fretColumnMarkerCadence' ||
            changedKey === 'sectionLabelsOnHighway' ||
            changedKey === 'sectionHudVisible' ||
            changedKey === 'sectionHudPosition' ||
            changedKey === 'sectionHudSize' ||
            changedKey === 'toneHudVisible' ||
            changedKey === 'toneHudPosition' ||
            changedKey === 'toneHudSize' ||
            changedKey === 'projectionVisible' ||
            changedKey === 'slideArrowApproachVisible' ||
            changedKey === 'slideArrowNeckVisible' ||
            changedKey === 'slideArrowChainPreviewVisible' ||
            changedKey === 'fpsVisible' ||
            changedKey === 'fretDividersVisible' ||
            changedKey === 'chordDiagramVisible' ||
            changedKey === 'hitFx' ||
            changedKey === 'sparks' ||
            changedKey === 'streakFx' ||
            changedKey === 'timingFx' ||
            changedKey === 'verdictMarks' ||
            changedKey === 'cinematic' ||
            changedKey === 'bloom') {
            // Every key in this group is read fresh per-frame, so a plain reload
            // is enough — no mesh rebuild. `customColors` has no entry here:
            // h3dBgSetStringColors writes it and then writes `palette`, which
            // already reloads it via the 'palette' branch below.
            loadSettings();
            return;
        }
        if (changedKey === 'vibrancy') {
            loadSettings();
            _applyVibrancy();
            return;
        }
        if (changedKey === 'glow') {
            loadSettings();
            _applyGlow();
            return;
        }
        if (changedKey === 'palette') {
            // Three effects: retint shared materials, rebuild the fretboard meshes
            // (palette-baked at build time), and rebuild the lights bg style if active
            // (it also bakes palette colors into its sprites at build time).
            loadSettings();
            if (getFretG()) buildBoard();
            if (ctx.settings.bgStyleId === 'lights') rebuildBackground();
            return;
        }
        if (changedKey === 'bgTheme' || changedKey === 'hwTheme') {
            // Recolor in place — no mesh rebuild needed. _applyBgTheme reapplies both
            // axes from their own keys, so changing one dropdown retints only its half.
            loadSettings();
            _applyBgTheme();
            return;
        }
        if (changedKey === 'customImageDataUrl') {
            loadSettings();
            if (ctx.settings.bgStyleId === 'image') rebuildBackground();
            return;
        }
        if (changedKey === 'customImageName') {
            loadSettings();
            return;
        }
        if (changedKey === 'customVideoName') {
            loadSettings();
            if (ctx.settings.bgStyleId === 'video') rebuildBackground();
            return;
        }
        if (changedKey === 'intensity') {
            loadSettings();
            // Image style reads intensity per-frame, so a live mutation suffices; the
            // procedural styles bake intensity into mesh count/opacity/size at build time.
            const bgState = getBgState();
            if (ctx.settings.bgStyleId === 'image' && bgState) {
                bgState.intensity = ctx.settings.bgIntensity;
                return;
            }
            rebuildBackground();
            return;
        }
        if (changedKey === 'venueScene') {
            rebuildBackground();
            return;
        }
        if (changedKey === 'venueInstrumentPov') {
            if (effectiveBackgroundStyleId() === 'venue' && getBgState()) {
                _venueSwapPlateIfNeeded(getBgState());
            }
            return;
        }
        if (!changedKey || changedKey === 'style') {
            rebuildBackground();
        }
    };
}
