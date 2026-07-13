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
import type { EmailListState, InboxEmail } from "@/types/email";
import type { MailItemUpdatedEventDetail } from "./mail_events";

import {
  compute_should_remove_from_view,
  destination_views_for_update,
} from "./view_membership";
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

export function stale_all_view_caches(): void {
  for (const [key, cached] of view_cache.entries()) {
    if (!cached.is_stale) {
      view_cache.set(key, { ...cached, is_stale: true });
    }
  }
  request_cache.invalidate("GET:/mail/v1/messages");
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

function build_row_patch(
  detail: MailItemUpdatedEventDetail,
): Partial<InboxEmail> {
  const patch: Partial<InboxEmail> = {};

  if (detail.is_read !== undefined) patch.is_read = detail.is_read;
  if (detail.is_starred !== undefined) patch.is_starred = detail.is_starred;
  if (detail.is_pinned !== undefined) patch.is_pinned = detail.is_pinned;
  if (detail.is_archived !== undefined) patch.is_archived = detail.is_archived;
  if (detail.is_trashed !== undefined) patch.is_trashed = detail.is_trashed;
  if (detail.is_spam !== undefined) patch.is_spam = detail.is_spam;
  if (detail.folders !== undefined) patch.folders = detail.folders;
  if (detail.tags !== undefined) patch.tags = detail.tags;
  if (detail.encrypted_metadata !== undefined) {
    patch.encrypted_metadata = detail.encrypted_metadata;
  }
  if (detail.metadata_nonce !== undefined) {
    patch.metadata_nonce = detail.metadata_nonce;
  }

  return patch;
}

export function patch_all_view_caches(
  detail: MailItemUpdatedEventDetail,
): void {
  const patch = build_row_patch(detail);

  for (const [view, cached] of view_cache.entries()) {
    const index = cached.state.emails.findIndex(
      (e) => e.id === detail.id || e.grouped_email_ids?.includes(detail.id),
    );

    if (index === -1) continue;

    if (compute_should_remove_from_view(detail, view)) {
      const emails = cached.state.emails.filter((_, i) => i !== index);

      view_cache.set(view, {
        ...cached,
        state: {
          ...cached.state,
          emails,
          total_messages: Math.max(0, cached.state.total_messages - 1),
        },
      });
    } else {
      const emails = cached.state.emails.map((e, i) =>
        i === index ? { ...e, ...patch } : e,
      );

      view_cache.set(view, {
        ...cached,
        state: { ...cached.state, emails },
      });
    }
  }

  for (const view of destination_views_for_update(detail)) {
    const cached = view_cache.get(view);

    if (cached && !cached.is_stale) {
      view_cache.set(view, { ...cached, is_stale: true });
    }
  }

  request_cache.invalidate("GET:/mail/v1/messages");
}

export function remove_ids_from_all_view_caches(ids: string[]): void {
  const id_set = new Set(ids);

  for (const [view, cached] of view_cache.entries()) {
    const emails = cached.state.emails.filter((e) => !id_set.has(e.id));
    const removed = cached.state.emails.length - emails.length;

    if (removed > 0) {
      view_cache.set(view, {
        ...cached,
        state: {
          ...cached.state,
          emails,
          total_messages: Math.max(0, cached.state.total_messages - removed),
        },
      });
    }
  }

  request_cache.invalidate("GET:/mail/v1/messages");
}

export function remove_email_from_view_cache(email_id: string): void {
  for (const [view, cached] of view_cache.entries()) {
    const filtered = cached.state.emails.filter((e) => e.id !== email_id);

    if (filtered.length !== cached.state.emails.length) {
      if (filtered.length === 0) {
        view_cache.delete(view);
      } else {
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
}
