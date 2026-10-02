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

import { use_resolved_accent } from "@/lib/resolved_accent";

// Message overrides belong to the current app appearance. Changing appearance
// returns the viewer to its default, including when a system theme changes.
function useEmailDarkMode(force_all_dark_mode: boolean) {
  const { is_dark } = use_resolved_accent();
  const default_dark_mode = is_dark && force_all_dark_mode;
  const [state, set_state] = useState(() => ({
    is_dark,
    overrides: new Map<string, boolean>(),
  }));

  if (state.is_dark !== is_dark) {
    set_state({ is_dark, overrides: new Map() });
  }

  const { overrides } = state;
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
      set_state((prev) => {
        const next = new Map(prev.is_dark === is_dark ? prev.overrides : []);

        next.set(id, !(next.get(id) ?? default_dark_mode));

        return { is_dark, overrides: next };
      });
    },
    [is_dark, default_dark_mode],
  );
  const set_all_dark_mode = useCallback(
    (ids: string[], value: boolean) => {
      set_state({ is_dark, overrides: new Map(ids.map((id) => [id, value])) });
    },
    [is_dark],
  );

  return {
    is_dark_mode_message,
    is_dark_mode_opted_out,
    toggle_dark_mode,
    set_all_dark_mode,
  };
}

export { useEmailDarkMode as use_email_dark_mode };
