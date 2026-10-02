//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { useCallback, useState } from "react";

import {
  get_resolved_appearance,
  use_resolved_appearance,
  type ResolvedAppearance,
} from "@/lib/resolved_accent";

interface EmailDarkModeState {
  appearance: ResolvedAppearance;
  overrides: Map<string, boolean>;
}

const NO_OVERRIDES: ReadonlyMap<string, boolean> = new Map();

// Message overrides belong to the app appearance they were made in. A real
// light/dark change, including a system theme change, returns every message to
// the default; accent and surface changes keep them. The force preference only
// applies while the app itself is dark.
//
// Overrides are keyed on the appearance object rather than reset with a
// render-phase setState: that pattern beside useSyncExternalStore can leave
// React holding a stale snapshot and missing the next theme change.
function useEmailDarkMode(force_all_dark_mode: boolean) {
  const appearance = use_resolved_appearance();
  const [state, set_state] = useState<EmailDarkModeState>(() => ({
    appearance,
    overrides: new Map(),
  }));
  const overrides =
    state.appearance === appearance ? state.overrides : NO_OVERRIDES;
  const default_dark_mode = appearance.is_dark && force_all_dark_mode;

  const is_dark_mode_message = useCallback(
    (id: string) => overrides.get(id) ?? default_dark_mode,
    [overrides, default_dark_mode],
  );
  const is_dark_mode_opted_out = useCallback(
    (id: string) => overrides.get(id) === false,
    [overrides],
  );
  // Updates read the live appearance, so a callback captured before a theme
  // change still records a choice made after it.
  const toggle_dark_mode = useCallback(
    (id: string) => {
      const live = get_resolved_appearance();

      set_state((prev) => {
        const next = new Map(
          prev.appearance === live ? prev.overrides : NO_OVERRIDES,
        );

        next.set(id, !(next.get(id) ?? (live.is_dark && force_all_dark_mode)));

        return { appearance: live, overrides: next };
      });
    },
    [force_all_dark_mode],
  );
  const set_all_dark_mode = useCallback((ids: string[], value: boolean) => {
    set_state({
      appearance: get_resolved_appearance(),
      overrides: new Map(ids.map((id) => [id, value])),
    });
  }, []);

  return {
    is_dark_mode_message,
    is_dark_mode_opted_out,
    toggle_dark_mode,
    set_all_dark_mode,
  };
}

export { useEmailDarkMode as use_email_dark_mode };
