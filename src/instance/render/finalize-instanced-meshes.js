/**
 * Flushes the 6 palm-mute/fret-hand-mute technique InstancedMeshes at the
 * end of a frame. Must be called after every drawNote()/chord-loop write
 * for the frame is done — an ordering requirement, not a data dependency.
 * Not a factory: every argument is read fresh from the caller on each call.
 */
export function finalizeInstancedMeshBatches({
    imPMTech, imFHTech, imPMXFill, imPMXLines, imFHXFill, imFHXLines,
    _imPMTechCount, _imFHTechCount,
}) {
    if (imPMTech) {
        imPMTech.count = _imPMTechCount;
        if (_imPMTechCount > 0) {
            imPMTech.instanceMatrix.needsUpdate = true;
            imPMTech.geometry.getAttribute('instanceAlpha').needsUpdate = true;
        }
    }
    if (imFHTech) {
        imFHTech.count = _imFHTechCount;
        if (_imFHTechCount > 0) {
            imFHTech.instanceMatrix.needsUpdate = true;
            imFHTech.geometry.getAttribute('instanceAlpha').needsUpdate = true;
        }
    }
    // Kept alive but always empty (count=0) — rendering is now handled by the
    // pPMXFill/pMuteXLines/pFHXFill/pFHXLines pools, which support per-chord
    // Z-proportional renderOrder.
    if (imPMXFill)  imPMXFill.count  = 0;
    if (imPMXLines) imPMXLines.count = 0;
    if (imFHXFill)  imFHXFill.count  = 0;
    if (imFHXLines) imFHXLines.count = 0;
}
