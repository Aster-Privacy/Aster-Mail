#!/usr/bin/env bash
#
# Aster Communications Inc.
#
# Copyright (c) 2026 Aster Communications Inc.
#
# This file is part of this project.
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the AGPLv3 as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
# AGPLv3 for more details.
#
# You should have received a copy of the AGPLv3
# along with this program. If not, see <https://www.gnu.org/licenses/>.
#
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
cd "$repo_root"

readonly bundle_id="org.astermail.ios"
readonly base_config="src-tauri/tauri.conf.json"
readonly mas_config="src-tauri/tauri.mas.conf.json"
readonly profile_dest="src-tauri/mas/embedded.provisionprofile"
readonly bundle_dir="src-tauri/target/universal-apple-darwin/release/bundle/macos"
readonly output_dir="src-tauri/target/mas"
readonly aside_suffix=".mas_aside"
readonly build_number_pattern='^[0-9]+(\.[0-9]+){0,2}$'

dry_run="${MAS_DRY_RUN:-0}"
skip_pkg="${MAS_SKIP_PKG:-0}"
signing_identity="${MAS_SIGNING_IDENTITY:-}"
installer_identity="${MAS_INSTALLER_IDENTITY:-}"
build_number="${MAS_BUILD_NUMBER:-$(date -u +%Y%m%d%H%M)}"
adhoc=0
version=""
product_name=""
entitlements_path=""
override_config=""
app_path=""
main_executable=""
pkg_path=""
work_dir="$(mktemp -d)"

log() {
  printf '==> %s\n' "$*"
}

warn() {
  printf 'warning: %s\n' "$*" >&2
}

fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

is_dry_run() {
  [[ "$dry_run" == "1" ]]
}

run() {
  printf '+'
  printf ' %q' "$@"
  printf '\n'
  if ! is_dry_run; then
    "$@"
  fi
}

restore_env_files() {
  local name
  for name in .env .env.local; do
    if [[ -f "$repo_root/$name$aside_suffix" && ! -e "$repo_root/$name" ]]; then
      mv "$repo_root/$name$aside_suffix" "$repo_root/$name"
      log "restored $name"
    fi
  done
}

cleanup() {
  restore_env_files
  rm -rf "$work_dir"
}

move_env_files_aside() {
  local name
  restore_env_files
  for name in .env .env.local; do
    if [[ -e "$repo_root/$name$aside_suffix" ]]; then
      fail "$name$aside_suffix exists alongside $name from an interrupted build; resolve it before building"
    fi
    if [[ -f "$repo_root/$name" ]]; then
      if is_dry_run; then
        log "would move $name aside for the build"
      else
        mv "$repo_root/$name" "$repo_root/$name$aside_suffix"
        log "moved $name aside for the build"
      fi
    fi
  done
  if [[ ! -f "$repo_root/.env.production" ]]; then
    warn ".env.production not found; the frontend builds with its compiled defaults"
  fi
}

config_value() {
  node -e '
const fs = require("fs");
const [base_file, overlay_file, key_path] = process.argv.slice(1);
const read_json = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {});
const dig = (object, keys) => keys.reduce((node, key) => (node == null ? undefined : node[key]), object);
const keys = key_path.split("/");
const value = dig(read_json(overlay_file), keys) ?? dig(read_json(base_file), keys);
process.stdout.write(value == null ? "" : String(value));
' "$base_config" "$mas_config" "$1"
}

plist_value() {
  /usr/libexec/PlistBuddy -c "Print :$2" "$1" 2>/dev/null || true
}

require_path() {
  if [[ -e "$1" ]]; then
    return
  fi
  if is_dry_run; then
    warn "missing $1 ($2)"
  else
    fail "missing $1 ($2)"
  fi
}

preflight() {
  local entitlements_rel
  if [[ "$(uname -s)" != "Darwin" ]]; then
    fail "Mac App Store builds require macOS"
  fi
  if [[ ! "$build_number" =~ $build_number_pattern ]]; then
    fail "MAS_BUILD_NUMBER must be up to three period-separated integers, got '$build_number'"
  fi
  require_path "$mas_config" "Mac App Store Tauri config"
  version="$(config_value version)"
  product_name="$(config_value productName)"
  entitlements_rel="$(config_value bundle/macOS/entitlements)"
  entitlements_rel="${entitlements_rel#./}"
  entitlements_path="src-tauri/${entitlements_rel:-mas/entitlements.plist}"
  require_path "$entitlements_path" "Mac App Store entitlements"
  if [[ -z "$version" || -z "$product_name" ]]; then
    fail "could not read version and productName from $base_config"
  fi
  log "Aster Mail $version build $build_number for the Mac App Store"
}

resolve_signing_identity() {
  if [[ "$signing_identity" == "-" ]]; then
    adhoc=1
    skip_pkg=1
    log "ad-hoc signing: the provisioning profile and installer package are skipped"
    return
  fi
  if [[ -z "$signing_identity" ]]; then
    signing_identity="$({ security find-identity -v -p codesigning || true; } | sed -nE 's/.*"((Apple Distribution|3rd Party Mac Developer Application): [^"]+)".*/\1/p' | awk 'NR == 1')"
  fi
  if [[ -z "$signing_identity" ]]; then
    if ! is_dry_run; then
      fail "no Apple Distribution signing identity found; import one or set MAS_SIGNING_IDENTITY"
    fi
    warn "no Apple Distribution signing identity found"
    signing_identity="Apple Distribution: <identity>"
  fi
  log "signing identity: $signing_identity"
}

resolve_installer_identity() {
  if [[ "$skip_pkg" == "1" ]]; then
    return
  fi
  if [[ -z "$installer_identity" ]]; then
    installer_identity="$({ security find-identity -v || true; } | sed -nE 's/.*"((3rd Party Mac Developer Installer|Mac Installer Distribution): [^"]+)".*/\1/p' | awk 'NR == 1')"
  fi
  if [[ -z "$installer_identity" ]]; then
    if ! is_dry_run; then
      fail "no installer identity found (3rd Party Mac Developer Installer or Mac Installer Distribution); set MAS_INSTALLER_IDENTITY or MAS_SKIP_PKG=1"
    fi
    warn "no installer identity found"
    installer_identity="3rd Party Mac Developer Installer: <identity>"
  fi
  log "installer identity: $installer_identity"
}

inspect_profile() {
  local profile="$1" decoded="$work_dir/profile.plist" app_identifier expiration now
  if ! security cms -D -i "$profile" > "$decoded" 2>/dev/null; then
    fail "could not decode the provisioning profile at $profile"
  fi
  if /usr/libexec/PlistBuddy -c "Print :ProvisionedDevices" "$decoded" > /dev/null 2>&1; then
    fail "the provisioning profile lists devices; use a Mac App Store distribution profile"
  fi
  app_identifier="$(plist_value "$decoded" "Entitlements:com.apple.application-identifier")"
  if [[ "$app_identifier" != *".$bundle_id" ]]; then
    fail "the provisioning profile is for '$app_identifier', not $bundle_id"
  fi
  expiration="$(plutil -extract ExpirationDate raw -o - "$decoded")"
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  if [[ ! "$expiration" > "$now" ]]; then
    fail "the provisioning profile expired on $expiration"
  fi
  log "provisioning profile: $(plutil -extract Name raw -o - "$decoded") ($app_identifier), expires $expiration"
}

prepare_provisioning_profile() {
  local source_profile="$profile_dest"
  if [[ -n "${MAS_PROVISIONING_PROFILE_PATH:-}" ]]; then
    if [[ ! -f "$MAS_PROVISIONING_PROFILE_PATH" ]]; then
      fail "MAS_PROVISIONING_PROFILE_PATH does not point to a file"
    fi
    source_profile="$MAS_PROVISIONING_PROFILE_PATH"
    if [[ ! "$MAS_PROVISIONING_PROFILE_PATH" -ef "$profile_dest" ]]; then
      run mkdir -p "$(dirname "$profile_dest")"
      run cp "$MAS_PROVISIONING_PROFILE_PATH" "$profile_dest"
    fi
  fi
  if (( adhoc == 1 )); then
    return
  fi
  if [[ ! -f "$source_profile" ]]; then
    if is_dry_run; then
      warn "missing $profile_dest; a real build requires MAS_PROVISIONING_PROFILE_PATH"
      return
    fi
    fail "missing $profile_dest; set MAS_PROVISIONING_PROFILE_PATH to a Mac App Store provisioning profile"
  fi
  inspect_profile "$source_profile"
}

build_override_config() {
  local drop_profile=0
  if (( adhoc == 1 )) && [[ ! -f "$profile_dest" ]]; then
    drop_profile=1
  fi
  node -e '
const [build_number, signing_identity, drop_profile] = process.argv.slice(1);
const mac_os = { bundleVersion: build_number, signingIdentity: signing_identity };
if (drop_profile === "1") mac_os.files = { "embedded.provisionprofile": null };
process.stdout.write(JSON.stringify({ bundle: { createUpdaterArtifacts: false, macOS: mac_os } }));
' "$build_number" "$signing_identity" "$drop_profile"
}

build_app() {
  run rm -rf dist "$bundle_dir"
  run env \
    -u APPLE_ID -u APPLE_PASSWORD -u APPLE_TEAM_ID \
    -u APPLE_API_KEY -u APPLE_API_ISSUER -u APPLE_API_KEY_PATH -u APPLE_API_KEY_CONTENT \
    -u APPLE_CERTIFICATE -u APPLE_CERTIFICATE_PASSWORD \
    -u TAURI_SIGNING_PRIVATE_KEY -u TAURI_SIGNING_PRIVATE_KEY_PASSWORD \
    APPLE_SIGNING_IDENTITY="$signing_identity" \
    npx tauri build \
    --bundles app \
    --target universal-apple-darwin \
    --config "$mas_config" \
    --config "$override_config" \
    --features mas,custom-protocol \
    -- --no-default-features
}

run_dist_checks() {
  local scan_files=() candidate leak_count
  if is_dry_run; then
    log "dry run: skipping dist checks"
    return
  fi
  for candidate in dist/assets/index-*.js; do
    if [[ -f "$candidate" ]]; then
      scan_files+=("$candidate")
    fi
  done
  if (( ${#scan_files[@]} == 0 )); then
    for candidate in dist/assets/*.js; do
      if [[ -f "$candidate" ]]; then
        scan_files+=("$candidate")
      fi
    done
  fi
  if (( ${#scan_files[@]} == 0 )); then
    fail "no JavaScript bundles found in dist/assets"
  fi
  leak_count="$({ grep -hc "localhost:[0-9]" "${scan_files[@]}" || true; } | awk '{ total += $1 } END { print total + 0 }')"
  if (( leak_count > 0 )); then
    fail "dist contains $leak_count localhost URL(s) with a port; check the env files and rebuild"
  fi
  if grep -rq "pk_test_" dist/; then
    fail "dist contains a Stripe test key; fix .env.production and rebuild"
  fi
  log "dist checks passed"
}

locate_app() {
  local candidates=() candidate
  if is_dry_run; then
    app_path="$bundle_dir/$product_name.app"
    main_executable="$app_path/Contents/MacOS/<executable>"
    return
  fi
  for candidate in "$bundle_dir"/*.app; do
    if [[ -d "$candidate" ]]; then
      candidates+=("$candidate")
    fi
  done
  if (( ${#candidates[@]} != 1 )); then
    fail "expected one .app in $bundle_dir, found ${#candidates[@]}"
  fi
  app_path="${candidates[0]}"
  log "app bundle: $app_path"
}

check_bundle_info() {
  local info actual
  if is_dry_run; then
    return
  fi
  info="$app_path/Contents/Info.plist"
  actual="$(plist_value "$info" CFBundleIdentifier)"
  if [[ "$actual" != "$bundle_id" ]]; then
    fail "CFBundleIdentifier is '$actual', expected $bundle_id"
  fi
  actual="$(plist_value "$info" CFBundleVersion)"
  if [[ "$actual" != "$build_number" ]]; then
    fail "CFBundleVersion is '$actual', expected $build_number"
  fi
  actual="$(plist_value "$info" CFBundleShortVersionString)"
  if [[ "$actual" != "$version" ]]; then
    fail "CFBundleShortVersionString is '$actual', expected $version"
  fi
  if [[ -z "$(plist_value "$info" LSApplicationCategoryType)" ]] && (( adhoc == 0 )); then
    fail "LSApplicationCategoryType is missing; set bundle.category in $mas_config"
  fi
  if [[ -n "$(plist_value "$info" ITSAppUsesNonExemptEncryption)" ]]; then
    fail "remove ITSAppUsesNonExemptEncryption from Info.plist; export compliance is declared per build in App Store Connect"
  fi
  main_executable="$app_path/Contents/MacOS/$(plist_value "$info" CFBundleExecutable)"
  if [[ ! -f "$main_executable" ]]; then
    fail "main executable not found at $main_executable"
  fi
}

dump_entitlements() {
  codesign -d --entitlements - --xml "$1" > "$2" 2>/dev/null && [[ -s "$2" ]]
}

has_sandbox_entitlement() {
  local dump="$work_dir/sandbox_check.plist"
  if ! dump_entitlements "$1" "$dump"; then
    return 1
  fi
  [[ "$(plist_value "$dump" com.apple.security.app-sandbox)" == "true" ]]
}

assert_app_entitlements() {
  local dump="$work_dir/app_entitlements.plist" app_identifier
  run codesign -d --entitlements - --xml "$app_path"
  if is_dry_run; then
    return
  fi
  if ! dump_entitlements "$app_path" "$dump"; then
    fail "$app_path has no signed entitlements"
  fi
  plutil -p "$dump"
  if [[ "$(plist_value "$dump" com.apple.security.app-sandbox)" != "true" ]]; then
    fail "com.apple.security.app-sandbox is not true in the signed entitlements"
  fi
  app_identifier="$(plist_value "$dump" com.apple.application-identifier)"
  if [[ -z "$app_identifier" ]]; then
    fail "com.apple.application-identifier is missing from the signed entitlements"
  fi
  log "entitlements: app sandbox enabled, application identifier $app_identifier"
}

resign_app() {
  run codesign --force \
    --options runtime \
    --sign "$signing_identity" \
    --requirements "=designated => anchor apple generic and identifier \"$bundle_id\"" \
    --entitlements "$entitlements_path" \
    "$app_path"
}

verify_signature() {
  run codesign --verify --strict --deep --verbose=2 "$app_path"
  if is_dry_run; then
    return
  fi
  codesign -d -r- "$app_path" 2>&1 || true
  if codesign --verify --strict --deep --verbose=2 "$app_path"; then
    return
  fi
  if (( adhoc == 1 )); then
    fail "codesign verification failed for the ad-hoc signed app"
  fi
  log "codesign verification failed; re-signing with an explicit designated requirement (tauri-apps/tauri#15230)"
  resign_app
  if ! codesign --verify --strict --deep --verbose=2 "$app_path"; then
    fail "codesign verification still fails after the designated requirement re-sign"
  fi
}

apply_permissions_fix() {
  local candidate unreadable
  log "normalizing bundle permissions and checking executables for the sandbox entitlement (tauri-apps/tauri#13118)"
  run chmod -R u+rwX,go+rX "$app_path"
  if is_dry_run; then
    return
  fi
  if ! has_sandbox_entitlement "$main_executable"; then
    if (( adhoc == 1 )); then
      fail "the main executable lacks the app sandbox entitlement"
    fi
    log "the main executable lacks the app sandbox entitlement; re-signing with $entitlements_path"
    resign_app
    if ! has_sandbox_entitlement "$main_executable"; then
      fail "the main executable still lacks the app sandbox entitlement after re-signing"
    fi
    if ! codesign --verify --strict --deep --verbose=2 "$app_path"; then
      fail "codesign verification fails after re-signing with entitlements"
    fi
  fi
  while IFS= read -r -d '' candidate; do
    if [[ "$candidate" == "$main_executable" ]]; then
      continue
    fi
    if [[ "$(file -b "$candidate")" == *Mach-O* ]] && ! has_sandbox_entitlement "$candidate"; then
      fail "$candidate lacks the app sandbox entitlement"
    fi
  done < <(find "$app_path/Contents/MacOS" -type f -print0)
  unreadable="$(find "$app_path" ! -perm -o=r -print | awk 'NR <= 5')"
  if [[ -n "$unreadable" ]]; then
    fail "the app bundle still contains files other users cannot read: $unreadable"
  fi
}

build_pkg() {
  local expanded="$work_dir/pkg_expanded" unreadable
  if [[ "$skip_pkg" == "1" ]]; then
    log "skipping the installer package"
    return
  fi
  pkg_path="$output_dir/Aster-Mail-$version-$build_number.pkg"
  run mkdir -p "$output_dir"
  run rm -f "$pkg_path"
  run productbuild --component "$app_path" /Applications --sign "$installer_identity" "$pkg_path"
  run pkgutil --check-signature "$pkg_path"
  if is_dry_run; then
    return
  fi
  pkgutil --expand-full "$pkg_path" "$expanded"
  if ! find "$expanded" -maxdepth 2 \( -name Distribution -o -name PackageInfo \) -type f -exec grep -q "CFBundleVersion=\"$build_number\"" {} + ; then
    warn "could not confirm CFBundleVersion $build_number in the package metadata"
  fi
  unreadable="$(find "$expanded" -path "*/Payload/*" ! -perm -o=r -print | awk 'NR <= 5')"
  if [[ -n "$unreadable" ]]; then
    fail "the package payload contains files other users cannot read (tauri-apps/tauri#13118): $unreadable"
  fi
}

write_outputs() {
  log "version $version, build $build_number"
  log "app: $repo_root/$app_path"
  if [[ -n "$pkg_path" ]]; then
    log "package: $repo_root/$pkg_path"
  fi
  if [[ -n "${GITHUB_OUTPUT:-}" ]] && ! is_dry_run; then
    {
      printf 'version=%s\n' "$version"
      printf 'build_number=%s\n' "$build_number"
      printf 'app_path=%s\n' "$repo_root/$app_path"
      if [[ -n "$pkg_path" ]]; then
        printf 'pkg_path=%s\n' "$repo_root/$pkg_path"
      fi
    } >> "$GITHUB_OUTPUT"
  fi
}

main() {
  trap cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  preflight
  resolve_signing_identity
  resolve_installer_identity
  prepare_provisioning_profile
  move_env_files_aside
  override_config="$(build_override_config)"
  build_app
  run_dist_checks
  locate_app
  run xattr -cr "$app_path"
  check_bundle_info
  assert_app_entitlements
  verify_signature
  apply_permissions_fix
  build_pkg
  write_outputs
}

main "$@"
