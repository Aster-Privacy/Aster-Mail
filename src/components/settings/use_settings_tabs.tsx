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
import type { ReactNode } from "react";

import { useCallback, useEffect, useState } from "react";

import {
  SETTINGS_TAB_EVENT,
  consume_settings_tab,
} from "@/components/settings/settings_content_helpers";

export function use_settings_tabs<T extends string>(
  tab_keys: readonly T[],
  default_tab: T,
) {
  const resolve_requested = useCallback(
    (candidate: string | null): T | null =>
      candidate && (tab_keys as readonly string[]).includes(candidate)
        ? (candidate as T)
        : null,
    [tab_keys],
  );

  const [active_tab, set_active_tab] = useState<T>(
    () => resolve_requested(consume_settings_tab()) ?? default_tab,
  );
  const [visited_tabs, set_visited_tabs] = useState<Set<T>>(
    () => new Set<T>([active_tab]),
  );

  const handle_tab_change = useCallback((tab: T) => {
    set_active_tab(tab);
    set_visited_tabs((previous) => {
      if (previous.has(tab)) return previous;
      const next = new Set(previous);

      next.add(tab);

      return next;
    });
  }, []);

  useEffect(() => {
    const handle_request = (event: Event) => {
      const requested = resolve_requested(
        (event as CustomEvent<string>).detail ?? null,
      );

      if (requested) handle_tab_change(requested);
    };

    window.addEventListener(SETTINGS_TAB_EVENT, handle_request);

    return () => window.removeEventListener(SETTINGS_TAB_EVENT, handle_request);
  }, [handle_tab_change, resolve_requested]);

  const render_tab = useCallback(
    (tab: T, content: ReactNode) => {
      if (!visited_tabs.has(tab)) return null;

      return (
        <div style={{ display: active_tab === tab ? "block" : "none" }}>
          {content}
        </div>
      );
    },
    [active_tab, visited_tabs],
  );

  return { active_tab, handle_tab_change, render_tab };
}
