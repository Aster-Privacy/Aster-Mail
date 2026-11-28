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
import { useEffect, useState } from "react";

import {
  read_safety_number_state,
  subscribe_safety_number,
  type SafetyNumberState,
} from "@/services/crypto/safety_number_status";

export function use_safety_number_state(
  email: string | null | undefined,
): SafetyNumberState | null {
  const [state, set_state] = useState<SafetyNumberState | null>(null);

  useEffect(() => {
    const target = email?.trim().toLowerCase();

    if (!target) {
      set_state(null);

      return;
    }

    let live = true;
    const refresh = () => {
      void read_safety_number_state(target).then((next) => {
        if (live) set_state(next);
      });
    };

    refresh();

    const unsubscribe = subscribe_safety_number((changed) => {
      if (changed === target) refresh();
    });

    return () => {
      live = false;
      unsubscribe();
    };
  }, [email]);

  return state;
}
