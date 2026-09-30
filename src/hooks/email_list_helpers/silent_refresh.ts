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

import type { InboxEmail } from "@/types/email";

import { drop_removed_after } from "@/services/removed_items";

export function merge_silent_refresh_emails(
  previous: InboxEmail[],
  incoming: InboxEmail[],
  started_at: number,
): InboxEmail[] {
  const surviving = drop_removed_after(incoming, started_at);
  const selected_ids = new Set(
    previous.filter((e) => e.is_selected).map((e) => e.id),
  );

  if (selected_ids.size === 0) return surviving;

  return surviving.map((e) =>
    selected_ids.has(e.id) ? { ...e, is_selected: true } : e,
  );
}
