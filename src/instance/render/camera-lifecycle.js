import {
    CAM_DIST_BASE, CAM_FRAME_D_FAR, CAM_FRAME_D_NEAR, CAM_FRAME_DIST_FAR,
    CAM_FRAME_DIST_NEAR, CAM_FRAME_H_FAR, CAM_FRAME_H_NEAR, CAM_H_BASE, CAM_LERP_BASE,
    CAM_TILT_BAND_C, CAM_TILT_BAND_T, CAM_TILT_STR_C, CAM_TILT_STR_T, FOCUS_D,
    FRET_ROW_FIT_BOOST_MAX, FRET_ROW_FIT_DEADBAND, FRET_ROW_FIT_NDC_MIN, HORPLUS_START_ASPECT,
    K, REF_ASPECT, S_GAP,
} from '../../core/constants.js';
import { computeBPM } from '../../core/chart-util.js';
import { splitscreenActive } from '../../core/splitscreen.js';
import { freeCamFor } from '../../settings/store.js';
import { effectiveVfov } from '../model/math.js';
import { _aspectPaneKey, _aspectRegisterPane, _resolveTuneFor } from '../../ui/aspect-panel.js';

// camUpdate() (smooth camera lerp + self-correcting NDC look-at) and
// applySize() (DPR + canvas size + aspect clamping) -- moved verbatim out
// of main.js (Stage 7, post-3e). Bundled into one file because CLAUDE.md's
// own internal main.js structure list already described them as sibling
// concerns ("camUpdate() -- ... writes ctx.cam" / "applySize() -- ... writes
// ctx.cam"), and applySize() sets ctx.cam._paneAspect / cam.aspect that
// camUpdate() reads back the same frame.
//
// This pairing was ORIGINALLY deferred (the plan's "Phase 2 — abandoned"
// section) because camUpdate()/applySize() shared mutable state with
// update()/drawNote()/teardown() with no single owner -- at the time, that
// meant the extraction would need to invent its own shared-state solution.
// Track B's ctx.cam already solved exactly that problem since: every field
// these two functions touch (curX/tgtX/curDist/tgtDist/curLookY/tgtLookY/
// aspectScale/_paneAspect/_fretRowFitBoost) is already `ctx.cam.field`
// explicitly, read/written the same way by every other already-extracted
// consumer (camera-target.js, camera-bootstrap.js, lookahead-math.js, ...).
// Moving camUpdate()/applySize() into their own file changes nothing about
// how those other modules see the shared state -- it's still the same
// `ctx` object reference, just called through `cameraLifecycle.x()` instead
// of a bare name.
//
// `cam`/`_probe`/`wrap`/`ren`/`lyricsCanvas` are plain deps, not live
// getters: all five are only ever reassigned via the createDomAndScene()
// destructure inside initScene() (where this factory is itself
// constructed, AFTER that destructure runs) or nulled in teardown() --
// never mid-lifetime while this module is live. `highwayCanvas` is the one
// exception (reassigned mid-lifetime by dom-and-scene.js's
// _canvasReplacedHandler), so it stays a live getter. `nStr`/`_leftyCached`
// change between initScene() calls too (a runtime string-count/lefty flip
// only rebuilds the board, not the whole scene -- see main.js's draw()),
// so they're live getters as well. `_renderScale` changes via both init()
// and draw()'s renderScale-change branch.
//
// `_wrapPinned`/`_appliedW`/`_appliedH` are applySize()'s own state, used
// nowhere else EXCEPT draw()'s per-frame self-resize-detection fallback
// (splitscreen overrides hw.resize and never calls renderer.resize(), so
// draw() has to notice a backing-store/CSS-box drift itself) -- moved to
// private state here (own-it-outright) with one combined getAppliedSize()
// getter for that one external reader. Their explicit `= 0`/`= false`
// resets in main.js's destroy() are no longer needed: this whole factory
// is reconstructed fresh on the next initScene() call, same as every other
// post-3e slice's private state (hit-sparks.js's arrays, etc.).
export function createCameraLifecycle({
    ctx, cam, _probe, wrap, ren, lyricsCanvas, chordDiagramCache, sY, _paneUid,
    getHighwayCanvas, getNStr, getLeftyCached, getRenderScale,
}) {
    let _wrapPinned = false;
    let _appliedW = 0;
    let _appliedH = 0;

    function camUpdate(bundle) {
        const bpm = computeBPM(bundle.beats, bundle.currentTime);
        const lerp = CAM_LERP_BASE * Math.max(bpm, 60) / 120;

        // ── Horizontal-FOV-hold + optional wide-pane pose nudges ──
        // Driven by window.__h3dAspectTune (default off → exact no-op).
        // _resolveTuneFor(paneKey) returns the shared base with THIS pane's
        // overrides (if any) laid on top, so a single split pane can be framed
        // independently. The base is seeded from defaults + localStorage on
        // first read, so a persisted tuning session applies on load without
        // opening the panel. Every field is finite-coerced. When disabled (or
        // splitOnly and not in a split) the tune is treated as null, so
        // effectiveVfov returns the base vertical fov and cam.fov is restored
        // to it. The fov write is guarded on an actual change so a steady pane
        // costs nothing.
        const highwayCanvas = getHighwayCanvas();
        const nStr = getNStr();
        const _leftyCached = getLeftyCached();
        const _paneKey = _aspectPaneKey(
            bundle && bundle.songInfo && bundle.songInfo.arrangement, _paneUid);
        // Only feed the Target-picker registry while the tuner is open (same
        // gate as the readout). Closed → nothing is registered, so the registry
        // can't grow for users who never open the panel; the key is still
        // resolved below so any saved overrides keep applying.
        if (window.__h3dAspectPanelOpen) _aspectRegisterPane(_paneKey);
        const _aspTune = _resolveTuneFor(_paneKey);
        const _aspActive = !!(_aspTune && _aspTune.enabled
            && !(_aspTune.splitOnly && !splitscreenActive()));
        const _tune = _aspActive ? _aspTune : null;
        const _vfov = effectiveVfov(ctx.cam._paneAspect, _tune);
        if (Number.isFinite(_vfov) && Math.abs(_vfov - cam.fov) > 1e-4) {
            cam.fov = _vfov;
            cam.updateProjectionMatrix();
        }
        // Publish a per-pane live readout for the tuner panel (only while it's
        // open, so the steady path stays allocation-free). Keyed by pane so
        // the panel can show the reading for whichever target is selected.
        if (window.__h3dAspectPanelOpen) {
            const _ro = window.__h3dAspectReadout || (window.__h3dAspectReadout = {});
            const _slot = _ro[_paneKey] || (_ro[_paneKey] = {});
            _slot.aspect = ctx.cam._paneAspect; _slot.vfov = _vfov;
            _ro.__last = _paneKey;
        }
        // Optional pose nudges (height / dolly / pitch) to chase a low-flat
        // wide-pane look if fov alone isn't enough. Gated to wide panes and
        // suppressed while the Camera Director owns the view (it wins).
        const _startAspect = (_tune && Number.isFinite(_tune.startAspect) && _tune.startAspect > 0)
            ? _tune.startAspect : HORPLUS_START_ASPECT;
        // Resolve the Camera Director bridge once (per-panel under splitscreen,
        // else global). Used both for the wide-pane gate and the transforms below.
        const _freeCam = freeCamFor(highwayCanvas);
        const _dirActive = !!(_freeCam && _freeCam.enabled);
        const _wide = !!(_tune && ctx.cam._paneAspect > _startAspect) && !_dirActive;
        const _poseHMul = (_wide && Number.isFinite(_tune.heightMul)) ? _tune.heightMul : 1;
        const _poseDMul = (_wide && Number.isFinite(_tune.distMul)) ? _tune.distMul : 1;
        const _poseLookYAdd = (_wide && Number.isFinite(_tune.pitchAdd)) ? _tune.pitchAdd * K : 0;
        const _poseLookZMul = (_wide && Number.isFinite(_tune.lookDepthMul) && _tune.lookDepthMul > 0)
            ? _tune.lookDepthMul : 1;

        ctx.cam.curX += (ctx.cam.tgtX - ctx.cam.curX) * lerp;
        // The fret-row fit guard (end of camUpdate) may dolly the camera back
        // via ctx.cam._fretRowFitBoost; the span-driven ctx.cam.tgtDist still owns zooming IN.
        ctx.cam.curDist += (ctx.cam.tgtDist * ctx.cam._fretRowFitBoost - ctx.cam.curDist) * lerp;
        const dist = ctx.cam.curDist * ctx.cam.aspectScale;
        const h = CAM_H_BASE * (dist / CAM_DIST_BASE);

        // Zoom-interpolated framing multipliers: tight (NEAR) -> lower/closer;
        // wide (FAR, fret 1<->20) -> higher/pulled back.
        const _zt = Math.max(0, Math.min(1,
            (dist - CAM_FRAME_DIST_NEAR) / (CAM_FRAME_DIST_FAR - CAM_FRAME_DIST_NEAR)));
        const _hMul = CAM_FRAME_H_NEAR + (CAM_FRAME_H_FAR - CAM_FRAME_H_NEAR) * _zt;
        const _dMul = CAM_FRAME_D_NEAR + (CAM_FRAME_D_FAR - CAM_FRAME_D_NEAR) * _zt;
        const shoulderOffset = (_leftyCached ? -1 : 1) * 10 * K;
        let _camX = ctx.cam.curX + shoulderOffset, _camY = h * _hMul, _camZ = dist * _dMul;
        // Optional wide-pane pose nudges (default identity → no-op).
        if (_poseHMul !== 1) _camY *= _poseHMul;
        if (_poseDMul !== 1) _camZ *= _poseDMul;
        // ── Free-camera user tweaks (orbit / height / zoom / pan) ──
        // Driven by the Camera Director plugin via the camera bridge:
        // window.__h3dCamCtlPanels[panelIndexFor(canvas)] when split (this
        // panel's own camera), falling back to the global window.__h3dCamCtl.
        // Layered ON TOP of the auto-framing so note tracking still works.
        // The bridge is read once into _freeCam and reused for both the
        // position and the look-at transforms; every field is coerced to a
        // finite number before use so a malformed object can never feed NaN
        // into cam.position / cam.lookAt.
        // _freeCam resolved above via freeCamFor(highwayCanvas): the
        // per-panel __h3dCamCtlPanels entry, else global __h3dCamCtl, else null.
        const _lookAtZ = -FOCUS_D * 0.35 * _poseLookZMul;
        if (_freeCam && _freeCam.enabled) {
            const _distMul = Number.isFinite(_freeCam.distMul) ? _freeCam.distMul : 1;
            const _heightMul = Number.isFinite(_freeCam.heightMul) ? _freeCam.heightMul : 1;
            const _yaw = Number.isFinite(_freeCam.yaw) ? _freeCam.yaw : 0;
            const _tx = ctx.cam.curX, _ty = ctx.cam.curLookY, _tz = _lookAtZ; // look target
            let _vx = _camX - _tx, _vy = _camY - _ty, _vz = _camZ - _tz;
            _vx *= _distMul; _vy *= _distMul; _vz *= _distMul; // zoom (dolly)
            _vy *= _heightMul;                                 // height
            const _cy = Math.cos(_yaw), _sy = Math.sin(_yaw);  // orbit around Y
            const _rx = _vx * _cy - _vz * _sy, _rz = _vx * _sy + _vz * _cy;
            _camX = _tx + _rx; _camY = _ty + _vy; _camZ = _tz + _rz;
        }
        cam.position.set(_camX, _camY, _camZ);

        // Self-correcting look-at Y: project the fretboard's near-edge centre
        // to NDC space. If it drifts toward the frame edge, nudge ctx.cam.tgtLookY
        // toward the fretboard centre so the camera tilts to re-frame it.
        // This lets the camera adapt to any panel aspect ratio automatically.
        const fretMidY = (sY(0) + sY(nStr - 1)) / 2;
        _probe.set(ctx.cam.curX, fretMidY, 0);                  // play-line fretboard centre
        cam.lookAt(ctx.cam.curX, ctx.cam.curLookY + _poseLookYAdd, _lookAtZ);    // tentative look — needed for project()
        cam.updateMatrixWorld();
        _probe.project(cam);                             // _probe.y → NDC in [-1, 1]

        // Keep fretboard centre in the lower third of the screen (NDC ≈ -0.35).
        // The deadband width and correction strength are both blended
        // between Twitchy and Calm bounds by the user's tiltSmoothing
        // setting — twitchy = re-frame aggressively (narrow band, strong
        // nudge); calm = let small drift ride (wide band, weak nudge).
        const DESIRED_NDC_Y = -0.35;
        const tiltBand   = CAM_TILT_BAND_T + (CAM_TILT_BAND_C - CAM_TILT_BAND_T) * ctx.settings.tiltSmoothing;
        const tiltStr    = CAM_TILT_STR_T  + (CAM_TILT_STR_C  - CAM_TILT_STR_T)  * ctx.settings.tiltSmoothing;
        if (_probe.y < DESIRED_NDC_Y - tiltBand || _probe.y > DESIRED_NDC_Y + tiltBand) {
            // _probe.y too low → fretboard near bottom → ctx.cam.tgtLookY decreases → camera tilts down → fretboard rises
            // _probe.y too high → fretboard near top  → ctx.cam.tgtLookY increases → camera tilts up   → fretboard drops
            const correction = (DESIRED_NDC_Y - _probe.y) * fretMidY * tiltStr;
            ctx.cam.tgtLookY = Math.max(-fretMidY, Math.min(fretMidY, ctx.cam.tgtLookY - correction));
        }
        ctx.cam.curLookY += (ctx.cam.tgtLookY - ctx.cam.curLookY) * lerp;

        // Final look-at with the corrected Y (overrides the tentative one above).
        // User tilt (pitch) + pan offsets layer on top when the free-cam is
        // enabled; each is coerced to a finite number to avoid a NaN look-at.
        if (_freeCam && _freeCam.enabled) {
            const _panX = Number.isFinite(_freeCam.panX) ? _freeCam.panX : 0;
            const _panY = Number.isFinite(_freeCam.panY) ? _freeCam.panY : 0;
            const _pitch = Number.isFinite(_freeCam.pitch) ? _freeCam.pitch : 0;
            cam.lookAt(ctx.cam.curX + _panX * K, ctx.cam.curLookY + (_pitch + _panY) * K, _lookAtZ);
        } else {
            cam.lookAt(ctx.cam.curX, ctx.cam.curLookY + _poseLookYAdd, _lookAtZ);
        }

        // ── Fret-row fit guard ────────────────────────────────────────────
        // Project the fret-number-row band (just below the lowest string, at
        // the play line) with the final camera. If it sits below the safe
        // bottom line, dolly back (raise ctx.cam._fretRowFitBoost → applied to the
        // ctx.cam.curDist lerp target next frame) until it clears; relax lazily once
        // there's comfortable headroom. Asymmetric + deadbanded so it
        // converges without hunting, and capped so the zoom can't pop. It
        // cooperates with the tilt loop above rather than fighting it: pulling
        // back shrinks the scene, the tilt loop keeps the board centre anchored
        // at DESIRED_NDC_Y, so only the row's bottom headroom changes. Skipped
        // while the free-cam (Camera Director) owns the view.
        if (_freeCam && _freeCam.enabled) {
            if (ctx.cam._fretRowFitBoost !== 1) ctx.cam._fretRowFitBoost = 1;
        } else {
            cam.updateMatrixWorld();
            const _rowY = Math.min(sY(0), sY(nStr - 1)) - S_GAP * 1.4;
            _probe.set(ctx.cam.curX, _rowY, 0.5 * K);
            _probe.project(cam);                              // _probe.y → NDC; < -1 = off the bottom
            const _rowNdcY = _probe.y;
            if (_rowNdcY < FRET_ROW_FIT_NDC_MIN) {
                // Row below the safe line → pull back promptly, proportional to
                // the deficit so it converges in a few frames without overshoot.
                const _need = FRET_ROW_FIT_NDC_MIN - _rowNdcY;
                ctx.cam._fretRowFitBoost = Math.min(FRET_ROW_FIT_BOOST_MAX,
                    ctx.cam._fretRowFitBoost + Math.min(0.05, _need * 0.4));
            } else if (_rowNdcY > FRET_ROW_FIT_NDC_MIN + FRET_ROW_FIT_DEADBAND
                       && ctx.cam._fretRowFitBoost > 1) {
                // Comfortable headroom → relax the dolly back toward normal, lazily.
                ctx.cam._fretRowFitBoost = Math.max(1, ctx.cam._fretRowFitBoost - 0.01);
            }
        }
    }

    function applySize(w, h) {
        if (!ren || !cam || !wrap) return;
        if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
        const highwayCanvas = getHighwayCanvas();
        const baseDPR = splitscreenActive() ? Math.min(devicePixelRatio, 1.25) : Math.min(devicePixelRatio, 2);
        ren.setPixelRatio(getRenderScale() * baseDPR);
        ren.setSize(w, h);
        // Pin the overlay to #highway's exact box so it fully covers the
        // canvas. The wrap is anchored to top:0/left:0/right:0 of its
        // offset parent, which only lines up with #highway when the
        // canvas sits at the parent's origin. The v3 player can place
        // chrome above the canvas, shifting the wrap up so its lower edge
        // falls short of #highway — leaving a strip of the canvas exposed
        // (the reported gap, where the previous renderer's frame showed
        // through). The wrap is a sibling of highwayCanvas, so they share
        // an offset parent; tracking the canvas's box keeps the overlay
        // flush in single-player and splitscreen alike.
        //
        // Derive the box from the SAME getBoundingClientRect measurements
        // that drive ren.setSize(w, h) — NOT integer offsetTop/Width — so
        // the overlay matches the renderer exactly. Under browser zoom or
        // fractional flex layouts the canvas lands on sub-pixel bounds;
        // offsetWidth/Top round to whole pixels and would leave the wrap up
        // to 1px short of (or shifted from) the canvas, reopening the
        // exposed edge strip. Position is taken relative to the containing
        // block's padding edge (clientTop/Left strip the parent's border),
        // which is what `top`/`left` resolve against for the absolutely
        // positioned wrap. Guarded on a laid-out canvas (offsetWidth/Height
        // > 0); otherwise fall back to the static top:0/left:0/right:0.
        if (highwayCanvas && highwayCanvas.offsetWidth > 0 && highwayCanvas.offsetHeight > 0) {
            const _pinParent = wrap.offsetParent || highwayCanvas.parentNode;
            const _cr = highwayCanvas.getBoundingClientRect();
            const _pr = _pinParent ? _pinParent.getBoundingClientRect() : { top: 0, left: 0 };
            const _pbTop = _pinParent ? _pinParent.clientTop : 0;
            const _pbLeft = _pinParent ? _pinParent.clientLeft : 0;
            wrap.style.top = (_cr.top - _pr.top - _pbTop) + 'px';
            wrap.style.left = (_cr.left - _pr.left - _pbLeft) + 'px';
            wrap.style.right = 'auto';
            wrap.style.width = _cr.width + 'px';
            wrap.style.height = _cr.height + 'px';
            _wrapPinned = true;
        } else {
            // Canvas not laid out (e.g. init ran before #highway had a real
            // box, or a panel hide/show where canvasSize() falls back to the
            // parent panel). Reset to the static anchor — if we had pinned
            // before, the old top/left/right:auto/width would otherwise stay
            // and the wrap would reappear at a stale horizontal position on
            // the next show. Leave _wrapPinned false so the rAF loop re-pins
            // once the canvas materializes again.
            wrap.style.top = '0';
            wrap.style.left = '0';
            wrap.style.right = '0';
            wrap.style.width = 'auto';
            wrap.style.height = h + 'px';
            _wrapPinned = false;
        }
        if (lyricsCanvas) { lyricsCanvas.width = w; lyricsCanvas.height = h; }
        chordDiagramCache.clearDiagramCache();
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
        ctx.cam.aspectScale = Math.max(1, REF_ASPECT / Math.max(cam.aspect, 0.5));
        // Cache the pane aspect for the horizontal-FOV-hold in camUpdate.
        // cam.fov itself is owned by camUpdate (not set here) so live
        // __h3dAspectTune edits apply every frame without a resize.
        ctx.cam._paneAspect = cam.aspect;
        _appliedW = w; _appliedH = h;
    }

    // The one external reader of applySize()'s private state: draw()'s
    // per-frame self-resize-detection fallback (splitscreen overrides
    // hw.resize and never calls renderer.resize(), so draw() has to notice
    // a backing-store/CSS-box drift itself and re-run applySize()).
    function getAppliedSize() {
        return { w: _appliedW, h: _appliedH, pinned: _wrapPinned };
    }

    return { camUpdate, applySize, getAppliedSize };
}
