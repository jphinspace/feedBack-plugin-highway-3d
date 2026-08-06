// Pins the sustain bloom glow in plugins/highway_3d/screen.js (PR #329).
// Sustained chord rails get a soft gaussian glow: a DataTexture gaussian
// (_makeGaussTex) drives a wider, additive-blended plane mesh (pSusRailBloom)
// rendered behind the core rail. A refactor that drops the gaussian texture,
// stops using additive blending, or bumps the bloom renderOrder above the
// core rail (16) would silently regress or invert the effect.
//
// Source-level only — same strategy as the other tests/js/ files.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCREEN_JS = path.join(__dirname, '..', '..', 'src', 'main.js');

test('a gaussian DataTexture helper (_makeGaussTex) drives the bloom falloff', async () => {
    // _makeGaussTex itself moved to src/core/tex.js in the screen.js -> src/
    // module split (Stage 1); real-import it rather than regexing its
    // declaration. The call site (_bloomGaussTex = _makeGaussTex(...), inside
    // initScene()) hasn't moved yet, so that half stays a source check.
    const { _makeGaussTex } = await import('../../src/core/tex.js');
    assert.strictEqual(typeof _makeGaussTex, 'function', '_makeGaussTex must exist to build the bloom gaussian texture');

    const src = fs.readFileSync(SCREEN_JS, 'utf8');
    assert.match(
        src,
        /_bloomGaussTex\s*=\s*_makeGaussTex\(/,
        'the bloom texture must be produced by _makeGaussTex',
    );
});

test('the bloom rail material uses additive blending', () => {
    const src = fs.readFileSync(SCREEN_JS, 'utf8');
    assert.match(
        src,
        /mSusRailBloomBase\s*=\s*new\s+T\.MeshBasicMaterial\(\{[\s\S]*?blending:\s*T\.AdditiveBlending[\s\S]*?\}\)/,
        'mSusRailBloomBase must blend additively so it brightens what is behind it',
    );
});

test('the bloom pool seeds meshes at renderOrder 4, behind the core rail (5)', () => {
    // renderOrder 4 keeps the bloom behind the core sustain rail (5) so the
    // glow reads as a trail rather than occluding the rail.
    const src = fs.readFileSync(SCREEN_JS, 'utf8');
    assert.match(
        src,
        /pSusRailBloom\s*=\s*pool\([^)]*,\s*\(\)\s*=>\s*\{[\s\S]*?m\.renderOrder\s*=\s*4\s*;[\s\S]*?\}\s*\)/,
        'pSusRailBloom pool must seed meshes with renderOrder = 4',
    );
});
