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
import { useCallback, useLayoutEffect, useRef } from "react";

export interface SidebarLocation {
  key?: string;
  pathname: string;
  search: string;
  hash: string;
  state?: unknown;
}

const PATH_BASE = "https://sidebar.invalid";

export function is_current_location(
  current: SidebarLocation,
  target: string,
): boolean {
  if (current.state !== null && current.state !== undefined) return false;
  const parsed = new URL(target, PATH_BASE);

  return (
    parsed.pathname === current.pathname &&
    parsed.search === current.search &&
    parsed.hash === current.hash
  );
}

export function should_skip_navigation(
  current: SidebarLocation,
  pending_path: string | null,
  target: string,
): boolean {
  if (pending_path !== null) return pending_path === target;

  return is_current_location(current, target);
}

export function use_sidebar_navigate(
  navigate: (path: string) => void,
  location: SidebarLocation,
): (path: string) => void {
  const location_ref = useRef(location);
  const pending_ref = useRef<string | null>(null);

  useLayoutEffect(() => {
    location_ref.current = location;
    pending_ref.current = null;
  }, [location]);

  return useCallback(
    (path: string) => {
      if (
        should_skip_navigation(location_ref.current, pending_ref.current, path)
      ) {
        return;
      }
      pending_ref.current = path;
      navigate(path);
    },
    [navigate],
  );
}
