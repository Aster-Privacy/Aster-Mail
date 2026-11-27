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
import type { Context } from "react";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import * as framer_motion from "framer-motion";

interface HostPresence {
  isPresent: boolean;
}

const detached_presence_context = createContext<HostPresence | null>(null);

function resolve_presence_context(): Context<HostPresence | null> {
  try {
    const context = (
      framer_motion as unknown as {
        PresenceContext?: Context<HostPresence | null>;
      }
    ).PresenceContext;

    return context ?? detached_presence_context;
  } catch {
    return detached_presence_context;
  }
}

const presence_context = resolve_presence_context();

export function use_host_present(): boolean {
  const presence = useContext(presence_context);

  return presence === null || presence.isPresent !== false;
}

export function use_dismiss_on_window_leave(
  is_open: boolean,
  on_dismiss: () => void,
): void {
  const dismiss_ref = useRef(on_dismiss);

  useEffect(() => {
    dismiss_ref.current = on_dismiss;
  });

  useEffect(() => {
    if (!is_open) return;

    const handle_blur = () => dismiss_ref.current();
    const handle_visibility_change = () => {
      if (document.visibilityState === "hidden") dismiss_ref.current();
    };

    window.addEventListener("blur", handle_blur);
    document.addEventListener("visibilitychange", handle_visibility_change);

    return () => {
      window.removeEventListener("blur", handle_blur);
      document.removeEventListener(
        "visibilitychange",
        handle_visibility_change,
      );
    };
  }, [is_open]);
}

export function use_dismiss_with_host(
  is_open: boolean,
  on_dismiss: () => void,
): boolean {
  const host_present = use_host_present();
  const dismiss_ref = useRef(on_dismiss);

  useLayoutEffect(() => {
    dismiss_ref.current = on_dismiss;
  });

  useLayoutEffect(() => {
    if (is_open && !host_present) dismiss_ref.current();
  }, [is_open, host_present]);

  return is_open && host_present;
}

export function use_nested_overlay_open(
  open: boolean | undefined,
  default_open: boolean | undefined,
  on_open_change: ((open: boolean) => void) | undefined,
): { open: boolean; on_open_change: (open: boolean) => void } {
  const [uncontrolled_open, set_uncontrolled_open] = useState(
    default_open ?? false,
  );
  const is_controlled = open !== undefined;
  const current_open = is_controlled ? open : uncontrolled_open;

  const handle_open_change = useCallback(
    (next: boolean) => {
      if (!is_controlled) set_uncontrolled_open(next);
      on_open_change?.(next);
    },
    [is_controlled, on_open_change],
  );

  const dismiss = useCallback(
    () => handle_open_change(false),
    [handle_open_change],
  );

  const visible = use_dismiss_with_host(current_open, dismiss);

  use_dismiss_on_window_leave(visible, dismiss);

  return { open: visible, on_open_change: handle_open_change };
}
