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
import type { SenderOption } from "@/hooks/use_sender_aliases";
import type { UseGhostModeReturn } from "@/hooks/use_ghost_mode";

import { useCallback, useEffect, useRef } from "react";

export function use_ghost_sender_binding(
  ghost_mode: UseGhostModeReturn,
  selected_sender: SenderOption | null,
  set_selected_sender: (val: SenderOption | null) => void,
): (val: SenderOption | null) => void {
  const pre_ghost_sender_ref = useRef<SenderOption | null>(null);
  const applied_ghost_id_ref = useRef<string | null>(null);
  const selected_sender_ref = useRef<SenderOption | null>(selected_sender);

  selected_sender_ref.current = selected_sender;

  const { is_ghost_enabled, ghost_sender, disable_ghost_mode } = ghost_mode;

  useEffect(() => {
    const active_ghost = is_ghost_enabled ? ghost_sender : null;

    if (active_ghost) {
      if (applied_ghost_id_ref.current === active_ghost.id) return;

      if (!applied_ghost_id_ref.current) {
        pre_ghost_sender_ref.current = selected_sender_ref.current;
      }

      applied_ghost_id_ref.current = active_ghost.id;
      set_selected_sender(active_ghost);

      return;
    }

    if (!applied_ghost_id_ref.current) return;

    const restored = pre_ghost_sender_ref.current;

    applied_ghost_id_ref.current = null;
    pre_ghost_sender_ref.current = null;

    if (restored) set_selected_sender(restored);
  }, [is_ghost_enabled, ghost_sender, set_selected_sender]);

  return useCallback(
    (val: SenderOption | null) => {
      if (val && val.type !== "ghost" && is_ghost_enabled) {
        applied_ghost_id_ref.current = null;
        pre_ghost_sender_ref.current = null;
        disable_ghost_mode();
      }

      set_selected_sender(val);
    },
    [is_ghost_enabled, disable_ghost_mode, set_selected_sender],
  );
}
