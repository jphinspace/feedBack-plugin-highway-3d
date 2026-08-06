# Local dev loop against feedBack core

The plugin needs a running feedBack core host to actually boot (it's not a
standalone app) — `plugin.json`'s `"scriptType": "module"` and the
`/api/plugins/<id>/src/**` route are host features. This is how to point a
local core checkout at this fork instead of its own bundled copy, so edits
here are visible on refresh without any build step.

Core checkout used for this: `/Users/joe/Documents/git/feedBack` (adjust the
paths below for a different location).

## One-time setup

Core bind-mounts `./plugins` into its Docker container, so a host symlink
placed there is invisible inside the container — use the native (non-Docker)
server for this loop.

```bash
cd /Users/joe/Documents/git/feedBack

# 1. Move the real bundled copy aside and symlink the fork in its place.
#    safe_join() (lib/safepath.py) resolves the plugin root itself, so a
#    symlinked plugin directory is contained correctly by the asset/src
#    routes -- no server-side special-casing needed.
mv plugins/highway_3d plugins/.highway_3d.orig
ln -s /Users/joe/Documents/git/feedBack-plugin-highway-3d plugins/highway_3d

# 2. Never let core's git see this swap. Already added to
#    .git/info/exclude (local-only, not committed) -- if it's missing:
cat >> .git/info/exclude <<'EOF'
plugins/highway_3d
plugins/.highway_3d.orig
EOF

# 3. Python deps, isolated venv (core has no venv of its own committed).
python3 -m venv .venv-highway3d-devloop
.venv-highway3d-devloop/bin/pip install -r requirements.txt

# 4. Node deps, for Playwright specs (tests/browser/*.spec.ts).
npm install
npx playwright install chromium
```

To restore the original bundled copy (e.g. before switching to a real
Docker/CI run):

```bash
rm plugins/highway_3d
mv plugins/.highway_3d.orig plugins/highway_3d
```

## Running the server

```bash
cd /Users/joe/Documents/git/feedBack
PYTHONPATH="$(pwd)/lib:$(pwd)" PORT=8000 HOST=127.0.0.1 \
    .venv-highway3d-devloop/bin/python3 main.py
```

Startup log should show:
```
Loaded routes for plugin 'highway_3d'
Registered plugin 'highway_3d' (3D Highway)
```
possibly preceded by a `User-installed copy of bundled plugin 'highway_3d' at
.../plugins/.highway_3d.orig ignored; using bundled version at
.../plugins/highway_3d.` warning — that's the expected precedence message
(the symlink location + `bundled: true` in plugin.json wins over the
renamed-aside original, which is treated as a shadowing user copy).

`routes.py` gets imported as a Python module, so it drops a `__pycache__/`
into this repo -- gitignored, harmless.

## Verifying the module graph is actually being served

```bash
curl -s http://127.0.0.1:8000/api/plugins | python3 -m json.tool | grep -A3 '"id": "highway_3d"'
# -> "script_type": "module", "min_host": "0.3.0", version matches plugin.json

curl -s http://127.0.0.1:8000/api/plugins/highway_3d/screen.js
# -> import './src/main.js';

curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8000/api/plugins/highway_3d/src/main.js
# -> 200
```

Live-edit loop (no hot reload -- edit, then refresh the browser tab):
```bash
ETAG=$(curl -s -D - http://127.0.0.1:8000/api/plugins/highway_3d/src/main.js -o /dev/null \
    | grep -i etag | tr -d '\r' | awk '{print $2}')
echo '// touch' >> src/main.js
curl -s -o /dev/null -w '%{http_code}\n' -H "If-None-Match: $ETAG" \
    http://127.0.0.1:8000/api/plugins/highway_3d/src/main.js
# -> 200 (was 304 before the edit) -- confirms the ETag is mtime/size-derived
git checkout -- src/main.js   # undo the touch
```

## Playwright

Core's `tests/browser/highway-3d-lefty.spec.ts` boots the real renderer
end-to-end (mocked song stream, no real audio/library needed) and is the
best single automated check that a change here didn't break the boot path.
`check-errors.spec.ts` and `plugin-globals-contract.spec.ts` are fast and
catch console-error / global-surface regressions.

```bash
cd /Users/joe/Documents/git/feedBack
npx playwright test highway-3d-lefty check-errors plugin-globals-contract --reporter=list
```

`playwright.config.ts`'s `webServer` block runs `docker compose up -d` with
`reuseExistingServer: true` locally -- with the native server above already
listening on :8000, Playwright reuses it instead of touching Docker.

**Known flake, unrelated to this plugin:** `highway-3d-lefty.spec.ts` fails
its final "zero console errors" assertion in this local (non-Docker) setup
with `audio.play() rejected: NotSupportedError: The element has no supported
sources.` -- confirmed by running the identical spec against the pristine,
un-split original plugin (swap the symlink back per "restore" above): same
failure, same message. Headless Chromium here has no audio codec support for
the mock song stream's synthetic source; every assertion *before* that line
(module boots, becomes the active renderer, `bundle.lefty` reaches
`highway.getLefty()` and the Settings checkbox) passes. Not a regression to
chase during the split -- it fails identically before and after every stage.

## Manual smoke

No song library is configured in this dev loop (`Scan: no DLC folder
configured` at startup), so real-song playback isn't exercised here. The
`highway-3d-lefty.spec.ts` mocked-stream path above is the closest automated
substitute. For a full manual pass (per the split plan's smoke checklist),
point `LIBRARY_PATH` at a real library and use `docker compose up` instead.
