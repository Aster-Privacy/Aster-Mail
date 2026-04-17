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
import type { EmailListState } from "@/types/email";

import {
  clear_email_cache,
  clear_view_cache,
} from "@/services/offline_email_cache";
import { request_cache } from "@/services/api/request_cache";

export const view_cache = new Map<
  string,
  {
    state: EmailListState;
    time: number;
    is_stale: boolean;
    conversation_grouping: boolean;
  }
>();

export function invalidate_mail_cache(view?: string): void {
  if (view) {
    view_cache.delete(view);
    clear_view_cache(view).catch(() => {});
  } else {
    view_cache.clear();
    clear_email_cache().catch(() => {});
  }
  request_cache.invalidate("GET:/mail/v1/messages");
}

export function clear_mail_cache(): void {
  view_cache.clear();
  clear_email_cache().catch(() => {});
}

export function mark_view_stale(view?: string): void {
  if (view) {
    const cached = view_cache.get(view);

    if (cached) {
      view_cache.set(view, { ...cached, is_stale: true });
    }
  } else {
    for (const [key, cached] of view_cache.entries()) {
      view_cache.set(key, { ...cached, is_stale: true });
    }
  }
}

export function remove_email_from_view_cache(email_id: string): void {
  for (const [view, cached] of view_cache.entries()) {
    const filtered = cached.state.emails.filter((e) => e.id !== email_id);

    if (filtered.length !== cached.state.emails.length) {
      view_cache.set(view, {
        state: {
          ...cached.state,
          emails: filtered,
          total_messages: Math.max(0, cached.state.total_messages - 1),
        },
        time: cached.time,
        is_stale: true,
        conversation_grouping: cached.conversation_grouping,
      });
    }
  }
}
