#!/usr/bin/env bash
# Builds the testnet app and publishes it to Cloudflare Pages (https://herald-near.pages.dev).
# Needs a Cloudflare login (`wrangler login`). Refuses to publish if a key ends up in the build.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="${PAGES_PROJECT:-herald-near}"
# WRANGLER can point at an installed wrangler binary; otherwise npx fetches the pinned version.
if [ -n "${WRANGLER:-}" ]; then wrangler=("$WRANGLER"); else wrangler=(npx --yes wrangler@3.99.0); fi

cd "$ROOT/web"
npm run build:testnet
# The local demo's settings and keys stay on this machine.
rm -f dist/local-demo.json dist/.gitignore
if grep -rqE "ed25519:[1-9A-HJ-NP-Za-km-z]{40,}" dist; then
  echo "Found a key in the build. Not publishing."
  exit 1
fi
"${wrangler[@]}" pages deploy dist --project-name "$PROJECT" --branch main --commit-dirty=true
