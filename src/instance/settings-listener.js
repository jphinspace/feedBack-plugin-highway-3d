import { _venueSwapPlateIfNeeded } from '../background/venue.js';

// The live settings-bus subscriber -- moved verbatim out of initScene()
// (Stage 7 Track B / 3-ctx-3). Like dom-and-scene.js's visibility/canvas-
// replaced handlers, this listener outlives the initScene() call that
// creates it (subscribeToSettings() keeps it alive until teardown()
// unsubscribes). Most of what it reads (fretG, bgState, _tuningLabelSprites)
// is a settings-driven main.js closure `let` that gets REASSIGNED by
// `loadSettings()` -- and several branches below call `loadSettings()` and
// then read the just-updated value in the same breath. A plain deps
// snapshot would see the value as it stood at initScene() time, not after
// that reload, so those are threaded through as live getters (same shape
// as dom-and-scene.js's getHighwayCanvas). `_lastOpenStringLblSig` is also
// WRITTEN here, so it gets a setter.
//
// bgStyleId / bgIntensity / inlayLabelsVisible / nutHeadstockVisible used
// to need the same getter treatment (Stage 7 Track 3e's ctx.settings
// conversion, batch 6) -- now that they live on ctx.settings, and `ctx`
// itself is already a stable per-instance object reference this file holds
// (only its `.board`/`.cam`/`.settings` PROPERTIES change, via ordinary
// mutation, never the object itself), the getter indirection is gone:
// every read below is `ctx.settings.x`, same as the existing `ctx.board.*`
// reads.
//
// tests/settings-live-refresh.test.mjs brace-matches this function's body
// directly from source (`block('settingsListener = (changedKey) =>')` in
// its own copy) to assert every loadSettings()-mirrored key is handled
// here -- when repointing that test at this file, keep the exact
// `changedKey === '...'` literal comparisons intact; the test's regex
// extractor depends on that literal shape, not on how the values feeding
// each branch are threaded in.
export function createSettingsListener({
    getFretG, buildBoard, loadSettings, ctx,
    setLastOpenStringLblSig, getTuningLabelSprites, _disposeOpenStringPitchSprites,
    _applyVibrancy, _applyGlow,
    rebuildBackground, _applyBgTheme,
    getBgState, effectiveBackgroundStyleId,
}) {
    return (changedKey) => {
        if (changedKey === 'fretSpacing') {
            // _h3dFretUniform + the fretX-derived scalars were already
            // updated globally in h3dSetFretSpacing. Rebuild this
            // panel's static board geometry (fret wires, lanes, inlays)
            // so it re-lays-out for the new spacing; per-frame note
            // geometry reads fretX live and needs no rebuild.
            if (getFretG()) buildBoard();
            return;
        }
        if (changedKey === 'inlayLabelsVisible') {
            loadSettings();
            // Flip visibility on the already-built sprites; no
            // need to rebuild the board (cheaper, preserves the
            // shared materials and avoids palette re-apply churn).
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
            // Overlay/FX flags. These were all mirrored by loadSettings()
            // but missing from this list, so toggling any of them did
            // nothing until the panel was torn down and rebuilt (song
            // change or viz swap). Every one is read per-frame, so a
            // plain reload is enough:
            //   fpsVisible / chordDiagramVisible — read in draw()
            //   fretDividersVisible — read in update()'s lane block
            //   hitFx / sparks / streakFx / timingFx / verdictMarks —
            //     read in drawNote()'s notedetect branch
            //   bloom — read per-frame; _bloomEnsure() is lazy
            //   cinematic — loadSettings() itself calls _applyCinematic()
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
            // Flag flips don't need a mesh rebuild — just refresh
            // the per-instance state for the next frame to consult.
            // Same shape for showFretOnNote (#12), cameraSmoothing
            // (#34), the zoom/tilt smoothing follow-ups, and
            // cameraLockLow — all read per-frame in update() /
            // camUpdate().
            //
            // NOTE: `customColors` deliberately has no entry here.
            // h3dBgSetStringColors writes it and THEN writes `palette`,
            // so the 'palette' branch below already reloads it.
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
            // Palette change has three effects:
            //  1. loadSettings -> _applyPaletteToMaterials
            //     retints the per-instance shared materials
            //     (notes, glows, sustain trails, projection).
            //  2. buildBoard rebuilds the fretboard meshes
            //     (LineBasicMaterial lane lines + per-string
            //     BoxGeometry materials). These are created at
            //     build time with palette-baked colors and
            //     aren't reachable from _applyPaletteToMaterials.
            //  3. lights bg style bakes palette colors into
            //     sprite quads at build time, so it needs a
            //     full mesh rebuild — fire rebuildBackground when
            //     that style is active.
            loadSettings();
            if (getFretG()) buildBoard();
            if (ctx.settings.bgStyleId === 'lights') rebuildBackground();
            return;
        }
        if (changedKey === 'bgTheme' || changedKey === 'hwTheme') {
            // A scene-color axis changed (background = bgTheme:
            // clear+fog; highway = hwTheme: board plane + lane). Recolor
            // in place — no mesh rebuild needed (the board plane material
            // is mutated via ctx.board._boardPlaneMat, the lane via mLaneOdd/Even).
            // _applyBgTheme reapplies both axes from their own keys, so
            // changing one dropdown retints only its half.
            loadSettings();
            _applyBgTheme();
            return;
        }
        if (changedKey === 'customImageDataUrl') {
            // Asset bytes changed. Rebuild only when the image
            // style is active — otherwise the new bytes will
            // pick up next time the user picks `image`.
            loadSettings();
            if (ctx.settings.bgStyleId === 'image') rebuildBackground();
            return;
        }
        if (changedKey === 'customImageName') {
            // Display-only metadata; no mesh rebuild.
            loadSettings();
            return;
        }
        if (changedKey === 'customVideoName') {
            // Filename change → new <video> source. Rebuild
            // only when the video style is currently active;
            // otherwise the new bytes pick up next time the
            // user picks `video`.
            loadSettings();
            if (ctx.settings.bgStyleId === 'video') rebuildBackground();
            return;
        }
        if (changedKey === 'intensity') {
            loadSettings();
            // Image style reads s.intensity per frame inside
            // update() to scale the drift speed, so a live
            // mutation is enough — no need to tear down and
            // re-decode the texture for every slider change.
            // The procedural styles bake intensity into mesh
            // count, opacity, and size at build time, so they
            // still need a full rebuild.
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
