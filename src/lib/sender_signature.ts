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

import { is_signature_bindable_sender_type } from "@/hooks/use_sender_aliases";

interface bound_signature {
  alias_id: string | null;
}

export function signature_for_sender<T extends bound_signature>(
  sender: Pick<SenderOption, "id" | "type"> | null | undefined,
  resolve: (alias_id: string | null) => T | null,
  fallback: T | null,
): T | null {
  const alias_id =
    sender && is_signature_bindable_sender_type(sender.type) ? sender.id : null;
  const resolved = resolve(alias_id);

  if (sender?.type === "ghost") {
    return resolved && resolved.alias_id === sender.id ? resolved : null;
  }

  return resolved ?? fallback;
}
