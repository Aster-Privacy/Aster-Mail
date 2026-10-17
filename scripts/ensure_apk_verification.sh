#!/bin/bash
set -euo pipefail

tag="${1:?usage: ensure_apk_verification.sh <tag> <owner/repo>}"
repo="${2:?usage: ensure_apk_verification.sh <tag> <owner/repo>}"
cert_sha="88b0a8a6fb94ee73a454a0f92732bd408e92e51ec1e9556744e5f00556100977"
play_cert_sha="c20da21dda9d35452675341911b001e53280b5c891ab909b13bf27637740a6af"
section="$(cd "$(dirname "$0")" && pwd)/apk_verification.md"

die() { echo "::error::$*"; exit 1; }
colon_fp() { echo "$1" | tr 'a-f' 'A-F' | sed 's/../&:/g; s/:$//'; }
has_fp() { grep -qF "$1" < <(tr 'a-f' 'A-F' < "$2"); }
unknown_fps() {
  grep -oiE '([0-9a-f]{2}:){31}[0-9a-f]{2}' "$1" | tr 'a-f' 'A-F' | sort -u | grep -vxF -e "$cert_colon" -e "$play_colon" || true
}
cert_colon="$(colon_fp "$cert_sha")"
play_colon="$(colon_fp "$play_cert_sha")"

[ -f "$section" ] || die "$section is missing"
has_fp "$cert_colon" "$section" || die "$section does not carry the release fingerprint"
has_fp "$play_colon" "$section" || die "$section does not carry the Play fingerprint"
[ -z "$(unknown_fps "$section")" ] || die "$section carries an unknown fingerprint"

apksigner=""
if [ -n "${ANDROID_HOME:-}" ] && [ -d "$ANDROID_HOME/build-tools" ]; then
  bt="$(ls "$ANDROID_HOME/build-tools" | sort -V | tail -1)"
  [ -x "$ANDROID_HOME/build-tools/$bt/apksigner" ] && apksigner="$ANDROID_HOME/build-tools/$bt/apksigner"
fi
if [ -z "$apksigner" ] && command -v apksigner >/dev/null 2>&1; then
  apksigner="apksigner"
fi
[ -n "$apksigner" ] || die "apksigner not found, set ANDROID_HOME"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

gh release download "$tag" --repo "$repo" --pattern Aster-Mail.apk --dir "$tmp" --clobber \
  || die "Aster-Mail.apk is not on $tag"
verify_out="$("$apksigner" verify --print-certs "$tmp/Aster-Mail.apk" 2>&1 | tr -d '\r' || true)"
digests="$(printf '%s\n' "$verify_out" | grep -E '^(Signer #[0-9]+|V[0-9.]+ Signer):? certificate SHA-256 digest:' \
  | awk '{print $NF}' | sort -u || true)"
if [ "$digests" != "$cert_sha" ]; then
  echo "$apksigner verify --print-certs:"
  printf '%s\n' "$verify_out" | head -20
  die "Aster-Mail.apk on $tag is signed by ${digests:-nothing}, expected $cert_sha"
fi
echo "Aster-Mail.apk on $tag is signed with the release certificate."

gh release view "$tag" --repo "$repo" --json body --jq .body > "$tmp/body.md"
if ! has_fp "$cert_colon" "$tmp/body.md"; then
  { cat "$tmp/body.md"; printf '\n\n'; cat "$section"; } > "$tmp/new_body.md"
  gh release edit "$tag" --repo "$repo" --notes-file "$tmp/new_body.md"
  gh release view "$tag" --repo "$repo" --json body --jq .body > "$tmp/body.md"
  has_fp "$cert_colon" "$tmp/body.md" || die "the release body on $tag still lacks the signing fingerprint"
  echo "Added the APK signing fingerprint to the release notes on $tag."
else
  echo "Release notes on $tag already carry the APK signing fingerprint."
fi
bad="$(unknown_fps "$tmp/body.md")"
[ -z "$bad" ] || die "release notes on $tag carry an unknown fingerprint: $bad"
