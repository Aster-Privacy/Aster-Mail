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

export function use_email_dark_mode(force_all_dark_mode: boolean) {
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
