#!/usr/bin/env bash
#
# Aster Communications Inc.
#
# Copyright (c) 2026 Aster Communications Inc.
#
# This file is part of this project.
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program. If not, see <https://www.gnu.org/licenses/>.
#
# Removes graphics and Wayland client libraries from a bundled AppImage and
# repacks it, so the app uses the host copies instead.
#
# linuxdeploy pulls libwayland-client.so.0 into the AppDir as a dependency of
# GTK and WebKitGTK. On a distribution whose Mesa is newer than the build host's
# wayland, the bundled copy shadows the host one, libEGL_mesa.so.0 then fails to
# resolve wl_fixes_interface, and WebKitGTK aborts with
# "Could not create default EGL display: EGL_BAD_PARAMETER". The window opens but
# never paints. The same applies to the other driver-adjacent libraries listed
# below, all of which are on the AppImage project's excludelist.
#
# The bundler also leaves out a few libraries that the bundled ones still need.
# WebKitGTK links the Flite speech engine, Flite links ALSA, and ALSA is on the same
# excludelist, so the app fails to start on a system that has no ALSA runtime. Any
# library named in BUNDLE_LIBS below is copied in from the build host when something
# in the AppDir needs it and the bundler left it out.
#
# Usage: fix_appimage_libs.sh <path-to-appimage> [more...]

set -euo pipefail

EXCLUDED_LIBS=(
  "libwayland-client.so.*"
  "libwayland-server.so.*"
  "libwayland-cursor.so.*"
  "libwayland-egl.so.*"
  "libEGL.so.*"
  "libGL.so.*"
  "libGLX.so.*"
  "libGLdispatch.so.*"
  "libglapi.so.*"
  "libgbm.so.*"
  "libdrm.so.*"
  "libdrm_*.so.*"
)

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "ERROR: $1 is required but not installed" >&2
    exit 1
  }
}

BUNDLE_LIBS=(
  "libasound.so.2"
)

need mksquashfs
need unsquashfs
need find
need readelf

# True when some binary or library inside the AppDir records $2 as a dependency.
needed_by_appdir() {
  local dir="$1" soname="$2" f
  while IFS= read -r f; do
    if readelf -d "$f" 2>/dev/null | grep -q "NEEDED.*\[$soname\]"; then
      return 0
    fi
  done < <(find "$dir" -type f \( -name "*.so" -o -name "*.so.*" -o -perm -u+x \))
  return 1
}

# Prints the path of $1 on the build host.
host_library() {
  local soname="$1" path
  path="$(ldconfig -p 2>/dev/null | awk -v s="$soname" '$1 == s {print $NF; exit}')"
  [[ -n "$path" && -e "$path" ]] || return 1
  printf '%s\n' "$path"
}

fix_one() {
  local img
  img="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"

  [[ -f "$img" ]] || {
    echo "ERROR: no such AppImage: $img" >&2
    exit 1
  }

  local work
  work="$(mktemp -d -t aster-appimage-XXXXXXXX)"
  # shellcheck disable=SC2064
  trap "rm -rf '$work'" RETURN

  chmod +x "$img"

  local offset
  offset="$("$img" --appimage-offset)"
  [[ "$offset" =~ ^[0-9]+$ ]] || {
    echo "ERROR: could not read the AppImage payload offset of $img" >&2
    exit 1
  }

  ( cd "$work" && "$img" --appimage-extract >/dev/null )
  local appdir="$work/squashfs-root"
  [[ -d "$appdir" ]] || {
    echo "ERROR: extracting $img produced no AppDir" >&2
    exit 1
  }

  local removed=0 pattern hit
  for pattern in "${EXCLUDED_LIBS[@]}"; do
    while IFS= read -r hit; do
      echo "  removing bundled $(basename "$hit")"
      rm -f "$hit"
      removed=$((removed + 1))
    done < <(find "$appdir" -type f -name "$pattern")
  done

  local libdir added=0 soname source
  libdir="$(dirname "$(find "$appdir" -type f -name "libwebkit2gtk-4.1.so.*" | head -n 1)")"
  if [[ -d "$libdir" ]]; then
    for soname in "${BUNDLE_LIBS[@]}"; do
      [[ -e "$libdir/$soname" ]] && continue
      needed_by_appdir "$appdir" "$soname" || continue
      source="$(host_library "$soname")" || {
        echo "ERROR: the AppDir needs $soname but the build host does not have it" >&2
        exit 1
      }
      cp -L "$source" "$libdir/$soname"
      echo "  bundling $soname from $source"
      added=$((added + 1))
    done
  fi

  if [[ "$removed" -eq 0 && "$added" -eq 0 ]]; then
    echo "$(basename "$img"): nothing to change, leaving it untouched"
    return 0
  fi

  head -c "$offset" "$img" > "$work/runtime.bin"

  # Repack with the same compressor the bundler used, so the AppImage does not
  # grow and the runtime can still read it.
  local comp=""
  tail -c "+$((offset + 1))" "$img" > "$work/original.squashfs"
  comp="$(unsquashfs -s "$work/original.squashfs" 2>/dev/null | awk '/^Compression/ {print $2}')" || true
  rm -f "$work/original.squashfs"
  case "$comp" in
    zstd | xz | lzo | lz4 | gzip) ;;
    *) comp="gzip" ;;
  esac

  mksquashfs "$appdir" "$work/payload.squashfs" \
    -root-owned -noappend -no-progress -quiet -mkfs-time 0 -comp "$comp" -b 128K
  cat "$work/runtime.bin" "$work/payload.squashfs" > "$work/repacked.AppImage"
  chmod +x "$work/repacked.AppImage"

  # The repacked file has to still be a working AppImage before it replaces the
  # original, so unpack it once more and check that nothing excluded came back.
  local verify="$work/verify"
  mkdir -p "$verify"
  ( cd "$verify" && "$work/repacked.AppImage" --appimage-extract >/dev/null )
  for pattern in "${EXCLUDED_LIBS[@]}"; do
    if find "$verify/squashfs-root" -type f -name "$pattern" | grep -q .; then
      echo "ERROR: $pattern is still bundled after repacking $img" >&2
      exit 1
    fi
  done
  [[ -x "$verify/squashfs-root/AppRun" ]] || {
    echo "ERROR: the repacked $img has no runnable AppRun" >&2
    exit 1
  }
  for soname in "${BUNDLE_LIBS[@]}"; do
    if needed_by_appdir "$verify/squashfs-root" "$soname" &&
      ! find "$verify/squashfs-root" -name "$soname" | grep -q .; then
      echo "ERROR: $soname is needed but missing after repacking $img" >&2
      exit 1
    fi
  done

  mv "$work/repacked.AppImage" "$img"
  echo "$(basename "$img"): removed $removed and added $added bundled libraries, then repacked"
}

[[ "$#" -ge 1 ]] || {
  echo "Usage: $0 <path-to-appimage> [more...]" >&2
  exit 1
}

for target in "$@"; do
  fix_one "$target"
done
