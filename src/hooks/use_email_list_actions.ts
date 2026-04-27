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
import type {
  InboxEmail,
  EmailListState,
  MailItemMetadata,
} from "@/types/email";

import { useCallback } from "react";

import {
  emit_mail_changed,
  emit_mail_item_updated,
  type MailItemUpdatedEventDetail,
} from "./mail_events";
import { mark_view_stale, invalidate_mail_cache, remove_email_from_view_cache } from "./email_list_cache";

import {
  update_mail_item,
  patch_mail_item_metadata,
  report_spam_sender,
} from "@/services/api/mail";
import {
  batch_archive as api_batch_archive,
  batch_unarchive as api_batch_unarchive,
} from "@/services/api/archive";
import {
  adjust_unread_count,
  adjust_inbox_count,
  adjust_trash_count,
  adjust_sent_count,
} from "@/hooks/use_mail_counts";
import { adjust_stats_archived } from "@/hooks/use_mail_stats";
import {
  decrypt_mail_metadata,
  encrypt_mail_metadata,
  bulk_update_metadata_by_ids,
} from "@/services/crypto/mail_metadata";

interface UseEmailListActionsParams {
  state: EmailListState;
  set_state: React.Dispatch<React.SetStateAction<EmailListState>>;
  update_email: (id: string, updates: Partial<InboxEmail>) => void;
  remove_email: (id: string) => void;
  refresh: () => void;
}

export function use_email_list_actions({
  state,
  set_state,
  update_email,
  remove_email,
  refresh,
}: UseEmailListActionsParams) {
  const api_update = useCallback(
    async (
      id: string,
      updates: Partial<{
        is_read: boolean;
        is_starred: boolean;
        is_pinned: boolean;
        is_trashed: boolean;
        is_archived: boolean;
        is_spam: boolean;
      }>,
      emit_full_refresh = false,
    ) => {
      const email = state.emails.find((e) => e.id === id);
      let current_metadata: MailItemMetadata | null = null;

      if (email?.encrypted_metadata && email?.metadata_nonce) {
        current_metadata = await decrypt_mail_metadata(
          email.encrypted_metadata,
          email.metadata_nonce,
          email.metadata_version,
        );
      }

      if (!current_metadata) {
        current_metadata = {
          is_read: email?.is_read ?? false,
          is_starred: email?.is_starred ?? false,
          is_pinned: email?.is_pinned ?? false,
          is_trashed: email?.is_trashed ?? false,
          is_archived: email?.is_archived ?? false,
          is_spam: email?.is_spam ?? false,
          size_bytes: 0,
          has_attachments: email?.has_attachment ?? false,
          attachment_count: 0,
          message_ts: new Date().toISOString(),
          item_type: email?.item_type ?? "received",
        };
      }

      const now = new Date().toISOString();
      const updated_metadata: MailItemMetadata = {
        ...current_metadata,
        is_read: updates.is_read ?? current_metadata.is_read,
        is_starred: updates.is_starred ?? current_metadata.is_starred,
        is_pinned: updates.is_pinned ?? current_metadata.is_pinned,
        is_trashed: updates.is_trashed ?? current_metadata.is_trashed,
        is_archived: updates.is_archived ?? current_metadata.is_archived,
        is_spam: updates.is_spam ?? current_metadata.is_spam,
        updated_at: now,
      };

      if (updates.is_trashed === true && !updated_metadata.trashed_at) {
        updated_metadata.trashed_at = now;
      } else if (updates.is_trashed === false) {
        updated_metadata.trashed_at = undefined;
      }

      const encrypted = await encrypt_mail_metadata(updated_metadata);

      if (encrypted) {
        const result = await patch_mail_item_metadata(id, {
          encrypted_metadata: encrypted.encrypted_metadata,
          metadata_nonce: encrypted.metadata_nonce,
          ...updates,
        });

        if (result.data) {
          update_email(id, {
            ...updates,
            encrypted_metadata: encrypted.encrypted_metadata,
            metadata_nonce: encrypted.metadata_nonce,
          } as Partial<InboxEmail>);
          if (emit_full_refresh) {
            emit_mail_changed();
          } else {
            emit_mail_item_updated({
              id,
              ...updates,
            } as MailItemUpdatedEventDetail);
          }
        }
      } else {
        const result = await update_mail_item(id, {});

        if (result.data) {
          update_email(id, updates as Partial<InboxEmail>);
          if (emit_full_refresh) {
            emit_mail_changed();
          } else {
            emit_mail_item_updated({
              id,
              ...updates,
            } as MailItemUpdatedEventDetail);
          }
        }
      }
    },
    [update_email, state.emails],
  );

  const toggle_star = useCallback(
    async (id: string) => {
      const email = state.emails.find((e) => e.id === id);

      if (email) await api_update(id, { is_starred: !email.is_starred });
    },
    [state.emails, api_update],
  );

  const toggle_pin = useCallback(
    async (id: string) => {
      const email = state.emails.find((e) => e.id === id);

      if (email) await api_update(id, { is_pinned: !email.is_pinned });
    },
    [state.emails, api_update],
  );

  const mark_read = useCallback(
    async (id: string) => {
      const email = state.emails.find((e) => e.id === id);

      if (email) {
        const new_read_state = !email.is_read;

        if (email.item_type === "received") {
          adjust_unread_count(new_read_state ? -1 : 1);
        }
        await api_update(id, { is_read: new_read_state });
      }
    },
    [state.emails, api_update],
  );

  const delete_email = useCallback(
    async (id: string) => {
      const email_to_restore = state.emails.find((e) => e.id === id);
      const is_received = email_to_restore?.item_type === "received";
      const is_sent = email_to_restore?.item_type === "sent";
      const should_adjust_unread = is_received && !email_to_restore?.is_read;
      const all_ids =
        email_to_restore?.grouped_email_ids &&
        email_to_restore.grouped_email_ids.length > 1
          ? email_to_restore.grouped_email_ids
          : [id];

      remove_email(id);
      if (should_adjust_unread) {
        adjust_unread_count(-1);
      }
      if (is_received) {
        adjust_inbox_count(-1);
      } else if (is_sent) {
        adjust_sent_count(-1);
      }
      adjust_trash_count(all_ids.length);

      const result = await bulk_update_metadata_by_ids(all_ids, {
        is_trashed: true,
      });

      if (result.success) {
        mark_view_stale("trash");
        emit_mail_item_updated({
          id,
          is_trashed: true,
        } as MailItemUpdatedEventDetail);
      } else {
        if (should_adjust_unread) {
          adjust_unread_count(1);
        }
        if (is_received) {
          adjust_inbox_count(1);
        } else if (is_sent) {
          adjust_sent_count(1);
        }
        adjust_trash_count(-all_ids.length);
        if (email_to_restore) {
          set_state((prev) => ({
            ...prev,
            emails: [...prev.emails, email_to_restore].sort(
              (a, b) =>
                new Date(b.timestamp).getTime() -
                new Date(a.timestamp).getTime(),
            ),
            total_messages: prev.total_messages + 1,
          }));
        }
      }
    },
    [state.emails, remove_email, set_state],
  );

  const archive_email = useCallback(
    async (id: string) => {
      const email_to_restore = state.emails.find((e) => e.id === id);
      const is_received = email_to_restore?.item_type === "received";
      const should_adjust_unread = is_received && !email_to_restore?.is_read;
      const all_ids =
        email_to_restore?.grouped_email_ids &&
        email_to_restore.grouped_email_ids.length > 1
          ? email_to_restore.grouped_email_ids
          : [id];

      remove_email(id);
      for (const aid of all_ids) {
        remove_email_from_view_cache(aid);
      }
      if (should_adjust_unread) {
        adjust_unread_count(-1);
      }
      if (is_received) {
        adjust_inbox_count(-1);
      }
      adjust_stats_archived(all_ids.length);
      invalidate_mail_cache();
      emit_mail_item_updated({
        id,
        is_archived: true,
      } as MailItemUpdatedEventDetail);
      const result = await api_batch_archive({ ids: all_ids, tier: "hot" });

      if (!result.data?.success) {
        if (should_adjust_unread) {
          adjust_unread_count(1);
        }
        if (is_received) {
          adjust_inbox_count(1);
        }
        adjust_stats_archived(-all_ids.length);
        if (email_to_restore) {
          set_state((prev) => ({
            ...prev,
            emails: [...prev.emails, email_to_restore].sort(
              (a, b) =>
                new Date(b.timestamp).getTime() -
                new Date(a.timestamp).getTime(),
            ),
            total_messages: prev.total_messages + 1,
          }));
        }
      }
    },
    [state.emails, remove_email, set_state],
  );

  const unarchive_email = useCallback(
    async (id: string) => {
      const email = state.emails.find((e) => e.id === id);
      const is_received = email?.item_type === "received";
      const should_adjust_unread = is_received && !email?.is_read;

      remove_email(id);
      if (should_adjust_unread) {
        adjust_unread_count(1);
      }
      if (is_received) {
        adjust_inbox_count(1);
      }
      adjust_stats_archived(-1);
      invalidate_mail_cache();
      emit_mail_item_updated({
        id,
        is_archived: false,
      } as MailItemUpdatedEventDetail);
      const result = await api_batch_unarchive({ ids: [id] });

      if (!result.data?.success) {
        if (should_adjust_unread) {
          adjust_unread_count(-1);
        }
        if (is_received) {
          adjust_inbox_count(-1);
        }
        adjust_stats_archived(1);
        refresh();
      }
    },
    [state.emails, remove_email, refresh],
  );

  const mark_spam = useCallback(
    async (id: string) => {
      const email = state.emails.find((e) => e.id === id);
      const should_adjust_unread =
        email?.item_type === "received" && !email?.is_read;
      const all_ids =
        email?.grouped_email_ids && email.grouped_email_ids.length > 1
          ? email.grouped_email_ids
          : [id];

      remove_email(id);
      if (should_adjust_unread) {
        adjust_unread_count(-1);
      }

      const result = await bulk_update_metadata_by_ids(all_ids, {
        is_spam: true,
      });

      if (result.success) {
        if (email?.sender_email) {
          report_spam_sender(email.sender_email).catch(() => {});
        }
      } else {
        if (should_adjust_unread) {
          adjust_unread_count(1);
        }
        refresh();
      }
    },
    [state.emails, remove_email, refresh],
  );

  return {
    toggle_star,
    toggle_pin,
    mark_read,
    delete_email,
    archive_email,
    unarchive_email,
    mark_spam,
  };
}
