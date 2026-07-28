#!/bin/bash
#
# Merge a previously shipped build's hashed assets into the current dist/assets.
#
# Rolling mail deploys briefly run two pods with different hashed asset sets.
# A page served by one pod can request chunks that only exist on the other and
# get a 404, which blank-boots the user (incident 2026-07-23). Carrying the
# prior builds' assets forward keeps those URLs resolvable during the overlap
# and for already-open tabs.
#
# Usage:
#   bash scripts/carry_forward_assets.sh astermail/mail:<previous-tag> dist
#
# Existing files in dist/assets are never overwritten: the current build wins.

set -euo pipefail

image="${1:-}"
dist_dir="${2:-dist}"

if [ -z "$image" ]; then
    echo "ERROR: usage: $0 <image[:tag]> [dist_dir]" >&2
    exit 1
fi

if [ ! -d "$dist_dir/assets" ]; then
    echo "ERROR: $dist_dir/assets not found - run the build first" >&2
    exit 1
fi

if ! docker image inspect "$image" >/dev/null 2>&1; then
    echo "ERROR: image not present locally: $image" >&2
    exit 1
fi

tmp_dir="$(mktemp -d)"
container_id=""

cleanup() {
    [ -n "$container_id" ] && docker rm -v "$container_id" >/dev/null 2>&1 || true
    rm -rf "$tmp_dir"
}
trap cleanup EXIT

copy_dest="$tmp_dir"
if command -v cygpath >/dev/null 2>&1; then
    copy_dest="$(cygpath -w "$tmp_dir")"
fi

container_id="$(docker create "$image")"
MSYS_NO_PATHCONV=1 docker cp "$container_id:/usr/share/nginx/html/assets/." "$copy_dest"

extracted="$(find "$tmp_dir" -maxdepth 1 -type f | wc -l | tr -d ' ')"
if [ "$extracted" -eq 0 ]; then
    echo "ERROR: extracted 0 assets from $image - carry-forward did nothing" >&2
    exit 1
fi

carried=0
skipped=0

for source_file in "$tmp_dir"/*; do
    [ -f "$source_file" ] || continue
    asset_name="$(basename "$source_file")"

    if [ -e "$dist_dir/assets/$asset_name" ]; then
        skipped=$((skipped + 1))
    else
        cp "$source_file" "$dist_dir/assets/$asset_name"
        carried=$((carried + 1))
    fi
done

echo "carry-forward from $image: $carried added, $skipped already current"
