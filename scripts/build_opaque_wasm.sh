#!/bin/bash
#
# Build the sign-in WebAssembly module from aster-opaque/ and place it where the
# web client loads it. The module that ships contains the client half only. A
# second build with the server half is written to the test fixtures so the unit
# tests can run a full sign-in without a backend.
#
# Usage: bash scripts/build_opaque_wasm.sh
#
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
crate="$root/aster-opaque"
target_dir="${CARGO_TARGET_DIR:-$crate/target}"
built="$target_dir/wasm32-unknown-unknown/release/aster_opaque.wasm"

build() {
  (cd "$crate" && CARGO_TARGET_DIR="$target_dir" cargo build --locked --release \
    --target wasm32-unknown-unknown "$@")
}

build --features server
cp "$built" "$root/src/tests/fixtures/aster_opaque_server.wasm"

build
cp "$built" "$root/src/services/crypto/aster_opaque.wasm"

sha256sum "$root/src/services/crypto/aster_opaque.wasm"
