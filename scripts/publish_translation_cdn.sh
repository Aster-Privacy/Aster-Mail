#!/usr/bin/env bash
set -euo pipefail

BUCKET="aster-translation-models"
RELAY_DIR="${RELAY_DIR:-../Aster-CDN-Relay/cloudflare-worker}"
BASE_URL="https://relay.astermail.org/models/bergamot/v1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIL_DIR="$(dirname "$SCRIPT_DIR")"

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "publish cdn: set CLOUDFLARE_API_TOKEN first" >&2
  exit 1
fi

cd "$MAIL_DIR"

if [ ! -f public/bergamot/models/v1/registry.json ]; then
  echo "publish cdn: models are missing, run scripts/fetch_translation_models.mjs first" >&2
  exit 1
fi

echo "publish cdn: verifying the local corpus"
node scripts/verify_translation_models.mjs

echo "publish cdn: creating $BUCKET if it does not exist"
npx wrangler r2 bucket create "$BUCKET" 2>&1 | tail -2 || true

echo "publish cdn: uploading models"
node scripts/upload_translation_models.mjs

echo "publish cdn: deploying the relay worker"
(cd "$MAIL_DIR/$RELAY_DIR" && npx wrangler deploy)

echo "publish cdn: verifying"
registry_status="$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/registry.json")"
echo "  registry.json $registry_status"

first_model="$(node -e "const r=require('./public/bergamot/models/v1/registry.json');const p=Object.keys(r).sort()[0];const f=Object.values(r[p])[0];console.log(f.name)")"
model_status="$(curl -sL -r 0-0 -o /dev/null -w '%{http_code}' "$BASE_URL/$first_model")"
echo "  $first_model $model_status"

if [ "$registry_status" != "200" ] || [ "$model_status" != "206" ]; then
  echo "publish cdn: verification failed" >&2
  exit 1
fi

echo "publish cdn: done"
