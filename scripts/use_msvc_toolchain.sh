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
# Puts the MSVC linker and Strawberry Perl ahead of the Git Bash copies on a
# Windows runner. Source it from a bash step after ilammy/msvc-dev-cmd: Git's
# /usr/bin/link.exe would otherwise link Rust build scripts, and MSYS perl would
# run the vendored OpenSSL configure.

if [ -z "${VCToolsInstallDir:-}" ]; then
  echo "::error::the MSVC environment is not set up, so rustc would link with the wrong link.exe"
  return 1
fi
VC_BIN="$(cygpath -u "$VCToolsInstallDir")"
VC_BIN="${VC_BIN%/}/bin/Hostx64/x64"
if [ ! -x "$VC_BIN/link.exe" ]; then
  echo "::error::no MSVC linker at $VC_BIN"
  return 1
fi
export PATH="$VC_BIN:$PATH"
if [ ! -x "/c/Strawberry/perl/bin/perl.exe" ]; then
  echo "::error::Strawberry Perl is missing, so the vendored OpenSSL build would run the wrong perl"
  return 1
fi
export OPENSSL_SRC_PERL="C:/Strawberry/perl/bin/perl.exe"
export PATH="/c/Strawberry/perl/bin:$PATH"
LINKER="$(command -v link)"
case "$LINKER" in
  *MSVC*) ;;
  *) echo "::error::link resolves to $LINKER instead of the MSVC linker"; return 1 ;;
esac
