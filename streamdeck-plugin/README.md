# Stream Toolkit — Stream Deck Plugin

Source for the `.streamDeckPlugin` ZIP that gets installed on user machines via the Toolkit onboarding flow.

## Build

From this directory:

- `npm install` — once, to pull deps
- `npm run build` — bundle TS → `com.thelab.toolkit.sdPlugin/bin/plugin.js`
- `npm run package` — build + ZIP into `../assets/com.thelab.toolkit.streamDeckPlugin`

From the repo root, `npm run build:plugin` runs `package` here.

## Action UUIDs

See `com.thelab.toolkit.sdPlugin/manifest.json`. UUIDs use the `com.thelab.toolkit.*` namespace — **do not rename**; existing user setups depend on them.

## Parity reference

`REBUILD-REFERENCE.md` documents each action's exact behavior decoded from the pre-rebuild shipped ZIP. Use it as source-of-truth when touching action code.
