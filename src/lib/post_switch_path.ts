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
import { ignore_error } from "@/lib/ignore_error";

const POST_SWITCH_PATH_KEY = "aster_post_switch_path";

function is_safe_path(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//");
}

export function set_post_switch_path(path: string): void {
  if (!is_safe_path(path)) return;

  try {
    sessionStorage.setItem(POST_SWITCH_PATH_KEY, path);
  } catch (caught) {
    ignore_error("lib/post_switch_path:set_post_switch_path", caught);
  }
}

export function take_post_switch_path(): string | null {
  try {
    const path = sessionStorage.getItem(POST_SWITCH_PATH_KEY);

    sessionStorage.removeItem(POST_SWITCH_PATH_KEY);

    if (!path || !is_safe_path(path)) return null;

    return path;
  } catch (caught) {
    ignore_error("lib/post_switch_path:take_post_switch_path", caught);

    return null;
  }
}
