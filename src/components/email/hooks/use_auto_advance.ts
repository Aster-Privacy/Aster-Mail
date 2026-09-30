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
import { useCallback, useRef } from "react";

import { use_preferences } from "@/contexts/preferences_context";

interface UseAutoAdvanceOptions {
  email_ids: string[];
  current_index: number;
  navigate_to: (id: string) => void;
}

export function use_auto_advance({
  email_ids,
  current_index,
  navigate_to,
}: UseAutoAdvanceOptions): () => boolean {
  const { preferences } = use_preferences();
  const anchor_ref = useRef<{ ids: string[]; index: number }>({
    ids: [],
    index: -1,
  });

  if (current_index !== -1) {
    anchor_ref.current = { ids: email_ids, index: current_index };
  }

  return useCallback((): boolean => {
    const mode = preferences.auto_advance;
    const step =
      mode === "Go to next message"
        ? 1
        : mode === "Go to previous message"
          ? -1
          : 0;

    if (step === 0) return false;

    const { ids, index } = anchor_ref.current;

    if (index === -1) return false;

    const target_index = index + step;

    if (target_index < 0 || target_index >= ids.length) return false;

    const target_id = ids[target_index];

    if (!target_id) return false;

    navigate_to(target_id);

    return true;
  }, [preferences.auto_advance, navigate_to]);
}
