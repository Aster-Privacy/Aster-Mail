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

import { sender_id_matches } from "@/lib/preferred_sender";

export interface AutoSenderResolution {
  option: SenderOption;
  is_auto: boolean;
}

export function resolve_auto_sender(
  sender_options: SenderOption[],
  selected_sender: SenderOption | null,
  preferred_sender_id: string | null | undefined,
  was_auto_selected: boolean,
): AutoSenderResolution | null {
  if (sender_options.length === 0) return null;

  const preferred = preferred_sender_id
    ? (sender_options.find((o) =>
        sender_id_matches(o.id, preferred_sender_id),
      ) ?? null)
    : null;

  if (!selected_sender) {
    return { option: preferred ?? sender_options[0], is_auto: true };
  }

  if (!was_auto_selected) return null;

  const better =
    preferred ??
    sender_options.find((o) => o.type === "primary" && o.is_enabled) ??
    null;

  if (!better || better.id === selected_sender.id) return null;

  return { option: better, is_auto: true };
}
