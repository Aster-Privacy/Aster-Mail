//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
const RESUMABLE_PATH_REGEX = /^\/join\/family$/;
const RESUMABLE_SEARCH_REGEX = /^\?token=[A-Za-z0-9_-]{16,128}$/;

export function build_restore_sign_in_path(
  local: string,
  pathname: string,
  search: string,
): string {
  const base = `/sign-in?u=${encodeURIComponent(local)}`;

  if (!RESUMABLE_PATH_REGEX.test(pathname)) return base;
  if (!RESUMABLE_SEARCH_REGEX.test(search)) return base;

  return `${base}&next=${encodeURIComponent(`${pathname}${search}`)}`;
}
