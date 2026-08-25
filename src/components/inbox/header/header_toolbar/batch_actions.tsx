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
import type { MailItemMetadata } from "@/types/email";

import { useState, useCallback, useEffect, useRef } from "react";

import {
  QUICK_ACTION_CONFIRM_KEYS,
  mark_all_read_by_scope,
  notify_scan_truncated,
} from "./helpers";

import { REFRESH_STATE_MS } from "@/constants/timings";
import { batched_bulk_patch_metadata } from "@/services/api/mail";
import {
  encrypt_mail_metadata,
  metadata_flag_patch,
} from "@/services/crypto/mail_metadata";
import { batched_archive, batched_unarchive } from "@/services/api/archive";
import { stale_all_view_caches } from "@/hooks/email_list_cache";
import {
  show_action_toast,
  update_progress_toast,
  hide_action_toast,
} from "@/components/toast/action_toast";
import {
  adjust_stats_unread,
  invalidate_mail_stats,
} from "@/hooks/use_mail_stats";
import {
  emit_mail_item_updated,
  emit_mail_items_removed,
  emit_refresh_requested,
} from "@/hooks/mail_events";
import {
  has_protected_folder_label,
  get_protected_folder_tokens,
} from "@/hooks/use_folders";
import { show_toast } from "@/components/toast/simple_toast";
import { ignore_error } from "@/lib/ignore_error";
import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
import {
  decrypt_items_metadata_for_action,
  scan_received_items,
  FULL_MAILBOX_ITEM_CAP,
} from "@/services/bulk_mail_scan";
import { map_in_chunks } from "@/lib/scheduling";

export function use_batch_actions(t: ReturnType<typeof use_i18n>["t"]) {
  const [is_sender_modal_open, set_is_sender_modal_open] = useState(false);
  const [sender_modal_action, set_sender_modal_action] = useState<
    "archive" | "delete" | "move"
  >("archive");
  const [is_unsubscribe_modal_open, set_is_unsubscribe_modal_open] =
    useState(false);
  const [is_snooze_modal_open, set_is_snooze_modal_open] = useState(false);
  const [
    is_archive_newsletters_modal_open,
    set_is_archive_newsletters_modal_open,
  ] = useState(false);
  const [is_refreshing, set_is_refreshing] = useState(false);
  const [pending_quick_action, set_pending_quick_action] = useState<
    string | null
  >(null);
  const { preferences, update_preference } = use_preferences();

  const refresh_timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (refresh_timer.current) clearTimeout(refresh_timer.current);
    },
    [],
  );

  const handle_refresh = useCallback(() => {
    if (is_refreshing) return;
    set_is_refreshing(true);
    emit_refresh_requested();
    invalidate_mail_stats();
    show_action_toast({
      message: t("common.inbox_refreshed"),
      action_type: "refresh",
      email_ids: [],
      duration_ms: REFRESH_STATE_MS,
    });
    if (refresh_timer.current) clearTimeout(refresh_timer.current);

    refresh_timer.current = setTimeout(() => {
      set_is_refreshing(false);
      hide_action_toast();
    }, REFRESH_STATE_MS);
  }, [is_refreshing, t]);

  const run_batch_action = useCallback(
    async (action: string) => {
      if (action === "archive_from_sender") {
        set_sender_modal_action("archive");
        set_is_sender_modal_open(true);

        return;
      } else if (action === "delete_from_sender") {
        set_sender_modal_action("delete");
        set_is_sender_modal_open(true);

        return;
      } else if (action === "move_from_sender") {
        set_sender_modal_action("move");
        set_is_sender_modal_open(true);

        return;
      } else if (action === "unsubscribe_bulk") {
        set_is_unsubscribe_modal_open(true);

        return;
      } else if (action === "snooze_similar") {
        set_is_snooze_modal_open(true);

        return;
      } else if (action === "archive_all_read") {
        const { items: all_items, reached_cap } = await scan_received_items(
          undefined,
          undefined,
          FULL_MAILBOX_ITEM_CAP,
        );

        {
          await decrypt_items_metadata_for_action(all_items);

          const read_items = all_items.filter(
            (item) =>
              item.metadata?.is_read &&
              !item.metadata?.is_archived &&
              !item.metadata?.is_trashed &&
              !has_protected_folder_label(item.labels),
          );

          if (read_items.length > 0) {
            const metadata_updates = await map_in_chunks(
              read_items,
              async (item) => {
                const updated_metadata = {
                  ...item.metadata!,
                  is_archived: true,
                };
                const encrypted = await encrypt_mail_metadata(updated_metadata);

                return encrypted
                  ? {
                      id: item.id,
                      ...encrypted,
                      ...metadata_flag_patch(updated_metadata),
                    }
                  : null;
              },
            );

            const valid_updates = metadata_updates.filter(
              (u) => u !== null,
            ) as Array<{
              id: string;
              encrypted_metadata: string;
              metadata_nonce: string;
            }>;

            let metadata_ok_ids: string[] = [];

            if (valid_updates.length > 0) {
              show_action_toast({
                message: t("common.processing_count", {
                  completed: 0,
                  total: valid_updates.length,
                }),
                action_type: "progress",
                email_ids: [],
                progress: { completed: 0, total: valid_updates.length },
              });

              const patch_result = await batched_bulk_patch_metadata(
                valid_updates,
                {
                  on_progress: (completed, total) =>
                    update_progress_toast(completed, total, t),
                },
              );

              metadata_ok_ids = patch_result.succeeded_ids;
              hide_action_toast();
            }

            let archived_ids: string[] = [];

            if (metadata_ok_ids.length > 0) {
              stale_all_view_caches();

              const archive_result = await batched_archive(metadata_ok_ids);

              archived_ids = archive_result.succeeded_ids;
            }

            const archived_set = new Set(archived_ids);
            const archived_items = read_items.filter((item) =>
              archived_set.has(item.id),
            );

            if (archived_ids.length > 0) {
              emit_mail_items_removed({ ids: archived_ids });
              invalidate_mail_stats();
            }

            if (valid_updates.length > 0 && archived_ids.length === 0) {
              show_toast(t("common.something_went_wrong_try_again"), "error");

              return;
            }

            show_action_toast({
              message: t("common.emails_archived", {
                count: archived_ids.length,
              }),
              action_type: "archive",
              email_ids: archived_ids,
              on_undo: async () => {
                const undo_updates = await map_in_chunks(
                  archived_items,
                  async (item) => {
                    const updated_metadata = {
                      ...item.metadata!,
                      is_archived: false,
                    };
                    const encrypted =
                      await encrypt_mail_metadata(updated_metadata);

                    return encrypted
                      ? {
                          id: item.id,
                          ...encrypted,
                          ...metadata_flag_patch(updated_metadata),
                        }
                      : null;
                  },
                );

                const valid_undo = undo_updates.filter(
                  (u) => u !== null,
                ) as Array<{
                  id: string;
                  encrypted_metadata: string;
                  metadata_nonce: string;
                }>;

                if (valid_undo.length > 0) {
                  await batched_bulk_patch_metadata(valid_undo);
                }

                const undo_archive = await batched_unarchive(archived_ids);

                if (
                  archived_ids.length > 0 &&
                  undo_archive.succeeded_ids.length === 0
                ) {
                  throw new Error("undo archive failed");
                }
                invalidate_mail_stats();
                window.dispatchEvent(
                  new CustomEvent("astermail:mail-soft-refresh"),
                );
              },
            });
          }

          notify_scan_truncated(reached_cap, t);
        }
      } else if (action === "mark_all_read") {
        if (get_protected_folder_tokens().size === 0) {
          await mark_all_read_by_scope(t);

          return;
        }

        const { items: all_items, reached_cap } = await scan_received_items(
          undefined,
          undefined,
          FULL_MAILBOX_ITEM_CAP,
        );

        {
          await decrypt_items_metadata_for_action(all_items);

          const unread_items = all_items.filter(
            (item) =>
              !item.metadata?.is_read &&
              !item.metadata?.is_trashed &&
              !has_protected_folder_label(item.labels),
          );

          if (unread_items.length > 0) {
            const metadata_updates = await map_in_chunks(
              unread_items,
              async (item) => {
                const current_metadata: MailItemMetadata = item.metadata ?? {
                  is_read: false,
                  is_starred: false,
                  is_pinned: false,
                  is_trashed: false,
                  is_archived: false,
                  is_spam: false,
                  size_bytes: 0,
                  has_attachments: false,
                  attachment_count: 0,
                  message_ts: item.message_ts ?? item.created_at,
                  item_type: item.item_type,
                };
                const updated_metadata = { ...current_metadata, is_read: true };
                const encrypted = await encrypt_mail_metadata(updated_metadata);

                return encrypted
                  ? {
                      id: item.id,
                      ...encrypted,
                      ...metadata_flag_patch(updated_metadata),
                    }
                  : null;
              },
            );

            const valid_updates = metadata_updates.filter(
              (u) => u !== null,
            ) as Array<{
              id: string;
              encrypted_metadata: string;
              metadata_nonce: string;
            }>;

            let succeeded_ids: string[] = [];

            if (valid_updates.length > 0) {
              show_action_toast({
                message: t("common.processing_count", {
                  completed: 0,
                  total: valid_updates.length,
                }),
                action_type: "progress",
                email_ids: [],
                progress: { completed: 0, total: valid_updates.length },
              });

              const batch_result = await batched_bulk_patch_metadata(
                valid_updates,
                {
                  on_progress: (completed, total) =>
                    update_progress_toast(completed, total, t),
                },
              );

              succeeded_ids = batch_result.succeeded_ids;
              hide_action_toast();
            }

            const succeeded_set = new Set(succeeded_ids);
            const succeeded_items = unread_items.filter((item) =>
              succeeded_set.has(item.id),
            );

            if (succeeded_items.length > 0) {
              adjust_stats_unread(-succeeded_items.length);

              for (const item of succeeded_items) {
                emit_mail_item_updated({ id: item.id, is_read: true });
              }
              invalidate_mail_stats();
            }

            if (valid_updates.length > 0 && succeeded_items.length === 0) {
              show_toast(t("common.something_went_wrong_try_again"), "error");

              return;
            }

            show_action_toast({
              message: t("common.emails_marked_as_read", {
                count: succeeded_items.length,
              }),
              action_type: "read",
              email_ids: succeeded_items.map((item) => item.id),
              on_undo: async () => {
                const undo_updates = await map_in_chunks(
                  succeeded_items,
                  async (item) => {
                    const current_metadata: MailItemMetadata =
                      item.metadata ?? {
                        is_read: false,
                        is_starred: false,
                        is_pinned: false,
                        is_trashed: false,
                        is_archived: false,
                        is_spam: false,
                        size_bytes: 0,
                        has_attachments: false,
                        attachment_count: 0,
                        message_ts: item.message_ts ?? item.created_at,
                        item_type: item.item_type,
                      };
                    const updated_metadata = {
                      ...current_metadata,
                      is_read: false,
                    };
                    const encrypted =
                      await encrypt_mail_metadata(updated_metadata);

                    return encrypted
                      ? {
                          id: item.id,
                          ...encrypted,
                          ...metadata_flag_patch(updated_metadata),
                        }
                      : null;
                  },
                );

                const valid_undo_updates = undo_updates.filter(
                  (u) => u !== null,
                ) as Array<{
                  id: string;
                  encrypted_metadata: string;
                  metadata_nonce: string;
                }>;

                let restored_count = 0;

                if (valid_undo_updates.length > 0) {
                  const undo_result =
                    await batched_bulk_patch_metadata(valid_undo_updates);

                  restored_count = undo_result.succeeded_ids.length;
                  if (restored_count === 0) {
                    throw new Error("undo mark read failed");
                  }
                }
                adjust_stats_unread(restored_count);
                invalidate_mail_stats();
                window.dispatchEvent(
                  new CustomEvent("astermail:mail-soft-refresh"),
                );
              },
            });
          }

          notify_scan_truncated(reached_cap, t);
        }
      } else if (action === "delete_old") {
        const { items: all_items, reached_cap } = await scan_received_items(
          undefined,
          undefined,
          FULL_MAILBOX_ITEM_CAP,
        );

        {
          await decrypt_items_metadata_for_action(all_items);

          const thirty_days_ago = new Date();

          thirty_days_ago.setDate(thirty_days_ago.getDate() - 30);

          const old_items = all_items.filter((item) => {
            if (has_protected_folder_label(item.labels)) return false;
            const item_date = new Date(item.message_ts ?? item.created_at);

            return item_date < thirty_days_ago && !item.metadata?.is_trashed;
          });

          if (old_items.length > 0) {
            const metadata_updates = await map_in_chunks(
              old_items,
              async (item) => {
                const current_metadata: MailItemMetadata = item.metadata ?? {
                  is_read: false,
                  is_starred: false,
                  is_pinned: false,
                  is_trashed: false,
                  is_archived: false,
                  is_spam: false,
                  size_bytes: 0,
                  has_attachments: false,
                  attachment_count: 0,
                  message_ts: item.message_ts ?? item.created_at,
                  item_type: item.item_type,
                };
                const updated_metadata = {
                  ...current_metadata,
                  is_trashed: true,
                };
                const encrypted = await encrypt_mail_metadata(updated_metadata);

                return encrypted
                  ? {
                      id: item.id,
                      ...encrypted,
                      ...metadata_flag_patch(updated_metadata),
                    }
                  : null;
              },
            );

            const valid_updates = metadata_updates.filter(
              (u) => u !== null,
            ) as Array<{
              id: string;
              encrypted_metadata: string;
              metadata_nonce: string;
            }>;

            let succeeded_ids: string[] = [];

            if (valid_updates.length > 0) {
              show_action_toast({
                message: t("common.processing_count", {
                  completed: 0,
                  total: valid_updates.length,
                }),
                action_type: "progress",
                email_ids: [],
                progress: { completed: 0, total: valid_updates.length },
              });

              const patch_result = await batched_bulk_patch_metadata(
                valid_updates,
                {
                  on_progress: (completed, total) =>
                    update_progress_toast(completed, total, t),
                },
              );

              succeeded_ids = patch_result.succeeded_ids;
              hide_action_toast();
            }

            const succeeded_set = new Set(succeeded_ids);
            const succeeded_items = old_items.filter((item) =>
              succeeded_set.has(item.id),
            );

            if (succeeded_ids.length > 0) {
              emit_mail_items_removed({ ids: succeeded_ids });
              invalidate_mail_stats();
            }

            if (valid_updates.length > 0 && succeeded_ids.length === 0) {
              show_toast(t("common.something_went_wrong_try_again"), "error");

              return;
            }

            show_action_toast({
              message: t("common.emails_moved_to_trash", {
                count: succeeded_ids.length,
              }),
              action_type: "trash",
              email_ids: succeeded_ids,
              on_undo: async () => {
                const undo_updates = await map_in_chunks(
                  succeeded_items,
                  async (item) => {
                    const current_metadata: MailItemMetadata =
                      item.metadata ?? {
                        is_read: false,
                        is_starred: false,
                        is_pinned: false,
                        is_trashed: false,
                        is_archived: false,
                        is_spam: false,
                        size_bytes: 0,
                        has_attachments: false,
                        attachment_count: 0,
                        message_ts: item.message_ts ?? item.created_at,
                        item_type: item.item_type,
                      };
                    const updated_metadata = {
                      ...current_metadata,
                      is_trashed: false,
                    };
                    const encrypted =
                      await encrypt_mail_metadata(updated_metadata);

                    return encrypted
                      ? {
                          id: item.id,
                          ...encrypted,
                          ...metadata_flag_patch(updated_metadata),
                        }
                      : null;
                  },
                );

                const valid_undo_updates = undo_updates.filter(
                  (u) => u !== null,
                ) as Array<{
                  id: string;
                  encrypted_metadata: string;
                  metadata_nonce: string;
                }>;

                if (valid_undo_updates.length > 0) {
                  const undo_result =
                    await batched_bulk_patch_metadata(valid_undo_updates);

                  if (undo_result.succeeded_ids.length === 0) {
                    throw new Error("undo trash failed");
                  }
                }
                invalidate_mail_stats();
                window.dispatchEvent(
                  new CustomEvent("astermail:mail-soft-refresh"),
                );
              },
            });
          } else {
            show_action_toast({
              message: t("common.no_emails_older_than_30_days"),
              action_type: "archive",
              email_ids: [],
            });
          }

          notify_scan_truncated(reached_cap, t);
        }
      } else if (action === "archive_newsletters") {
        set_is_archive_newsletters_modal_open(true);

        return;
      }
    },
    [t],
  );

  const execute_batch_action = useCallback(
    async (action: string) => {
      try {
        await run_batch_action(action);
      } catch (caught) {
        hide_action_toast();
        show_toast(t("common.something_went_wrong_try_again"), "error");
        ignore_error(
          "components/inbox/header/header_toolbar/batch_actions:execute_batch_action",
          caught,
        );
      }
    },
    [run_batch_action, t],
  );

  const handle_batch_action = useCallback(
    async (action: string) => {
      if (
        action in QUICK_ACTION_CONFIRM_KEYS &&
        preferences.confirm_before_quick_actions
      ) {
        set_pending_quick_action(action);

        return;
      }

      await execute_batch_action(action);
    },
    [execute_batch_action, preferences.confirm_before_quick_actions],
  );

  const handle_quick_action_confirm = useCallback(() => {
    const action = pending_quick_action;

    set_pending_quick_action(null);
    if (action) void execute_batch_action(action);
  }, [pending_quick_action, execute_batch_action]);

  const handle_quick_action_cancel = useCallback(() => {
    set_pending_quick_action(null);
  }, []);

  const handle_quick_action_dont_ask_again = useCallback(() => {
    update_preference("confirm_before_quick_actions", false, true);
  }, [update_preference]);

  return {
    is_refreshing,
    handle_refresh,
    handle_batch_action,
    is_sender_modal_open,
    set_is_sender_modal_open,
    sender_modal_action,
    is_unsubscribe_modal_open,
    set_is_unsubscribe_modal_open,
    is_snooze_modal_open,
    set_is_snooze_modal_open,
    is_archive_newsletters_modal_open,
    set_is_archive_newsletters_modal_open,
    pending_quick_action,
    handle_quick_action_confirm,
    handle_quick_action_cancel,
    handle_quick_action_dont_ask_again,
  };
}
