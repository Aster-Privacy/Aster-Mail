#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "usage: release_asset_sha256.sh <tag> <canonical_name> <versioned_name>" >&2
  exit 2
fi

tag="$1"
canonical_name="$2"
versioned_name="$3"
repository="${GITHUB_REPOSITORY:-Aster-Privacy/Aster-Mail}"

assets_json="$(gh api "repos/${repository}/releases/tags/${tag}" --jq '[.assets[] | {name, digest}]')"

digest_of() {
  jq -r --arg name "$1" '.[] | select(.name == $name) | .digest // empty' <<<"$assets_json"
}

canonical_digest="$(digest_of "$canonical_name")"
versioned_digest="$(digest_of "$versioned_name")"

if [ -z "$canonical_digest" ] || [ -z "$versioned_digest" ]; then
  echo "${tag} is missing ${canonical_name} or ${versioned_name}, or GitHub has no digest for it" >&2
  exit 1
fi

if [ "$canonical_digest" != "$versioned_digest" ]; then
  echo "${canonical_name} on ${tag} differs from ${versioned_name}, so it was carried forward from an older release" >&2
  exit 1
fi

sha256_hex="${canonical_digest#sha256:}"
if [[ ! "$sha256_hex" =~ ^[0-9a-f]{64}$ ]]; then
  echo "unexpected digest format for ${canonical_name}: ${canonical_digest}" >&2
  exit 1
fi

printf '%s\n' "$sha256_hex"
