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
import type { TranslationKey } from "@/lib/i18n/types";
import type { ActionToastConfig } from "@/components/toast/action_toast";
import type { CategoryBulkOutcome } from "@/components/email/inbox/category_bulk_actions";

import { useState, useCallback } from "react";

import {
  show_action_toast,
  update_progress_toast,
  hide_action_toast,
} from "@/components/toast/action_toast";
import { show_toast } from "@/components/toast/simple_toast";
import {
  is_index_capped,
  wait_for_index_ready,
} from "@/services/category_index";
import {
  run_category_scope_action,
  supports_category_scope,
} from "@/components/email/inbox/category_bulk_actions";
import { collect_scope_ids } from "@/components/email/inbox/collect_scope_ids";
import {
  batched_bulk_add_folder,
  batched_bulk_remove_folder,
} from "@/services/api/mail";
import {
  batched_bulk_add_tag,
  batched_bulk_remove_tag,
} from "@/services/api/tags";
import { PROGRESS_THRESHOLDS } from "@/constants/batch_config";
import { MAIL_EVENTS, mail_event_bus } from "@/hooks/mail_events";
import {
  bulk_action_by_scope,
  type BulkScopeAction,
  type BulkScopeFilter,
} from "@/services/api/mail";
import { use_i18n } from "@/lib/i18n/context";
import { use_inbox_categories } from "@/hooks/use_inbox_categories";
import { use_inbox_selection } from "@/components/email/inbox/use_inbox_selection";
import { use_inbox_toolbar_actions } from "@/components/email/inbox/use_inbox_toolbar_actions";

const BULK_SCOPE_TOAST: Record<
  BulkScopeAction,
  { message_key: TranslationKey; action_type: ActionToastConfig["action_type"] }
> = {
  trash: {
    message_key: "common.n_conversations_moved_to_trash",
    action_type: "trash",
  },
  archive: {
    message_key: "common.n_conversations_archived",
    action_type: "archive",
  },
  unarchive: {
    message_key: "common.conversations_moved_to_inbox_bulk",
    action_type: "restore",
  },
  mark_read: {
    message_key: "common.conversations_marked_as_read_bulk",
    action_type: "read",
  },
  mark_unread: {
    message_key: "common.conversations_marked_as_unread_bulk",
    action_type: "unread",
  },
  star: {
    message_key: "common.conversations_starred_bulk",
    action_type: "star",
  },
  unstar: {
    message_key: "common.conversations_unstarred_bulk",
    action_type: "unstar",
  },
  mark_spam: {
    message_key: "common.conversations_marked_as_spam_bulk",
    action_type: "spam",
  },
  unmark_spam: {
    message_key: "common.conversations_marked_as_not_spam_bulk",
    action_type: "not_spam",
  },
  restore_trash: {
    message_key: "common.conversations_restored_bulk",
    action_type: "restore",
  },
};

export type InboxBulkActionsParams = {
  categories: ReturnType<typeof use_inbox_categories>;
  selection: ReturnType<typeof use_inbox_selection>;
  toolbar: ReturnType<typeof use_inbox_toolbar_actions>;
  current_view: string;
  page_size: number;
  scope_for_view: BulkScopeFilter | null;
  folders_lookup: Map<string, { name: string; color?: string }>;
  tags_lookup: Map<string, { name: string; color?: string; icon?: string }>;
  fetch_page: (page: number, size: number) => unknown;
  set_current_page: (page: number) => void;
  t: ReturnType<typeof use_i18n>["t"];
};

export function use_inbox_bulk_actions({
  categories,
  selection,
  toolbar,
  current_view,
  page_size,
  scope_for_view,
  folders_lookup,
  tags_lookup,
  fetch_page,
  set_current_page,
  t,
}: InboxBulkActionsParams) {
  const [pending_select_all_action, set_pending_select_all_action] = useState<
    (() => void) | null
  >(null);

  const queue_select_all_action = useCallback((action: () => void) => {
    set_pending_select_all_action(() => action);
  }, []);

  const run_category_bulk_action = useCallback(
    async (
      action: BulkScopeAction,
      progress: { completed: number; total: number },
      exclude_ids: string[],
    ): Promise<CategoryBulkOutcome> => {
      let progress_toast_shown = false;

      try {
        const outcome = await run_category_scope_action(
          action,
          categories.active_category,
          {
            exclude_ids,
            on_progress: (completed, total) => {
              progress.completed = completed;
              progress.total = total;
              if (total < PROGRESS_THRESHOLDS.SHOW_TOAST_PROGRESS) return;
              if (!progress_toast_shown) {
                progress_toast_shown = true;
                show_action_toast({
                  message: t("common.processing_count", {
                    completed: String(completed),
                    total: String(total),
                  }),
                  action_type: "progress",
                  email_ids: [],
                  progress: { completed, total },
                });

                return;
              }
              update_progress_toast(completed, total, t);
            },
          },
        );

        return outcome;
      } finally {
        if (progress_toast_shown) hide_action_toast();
      }
    },
    [categories.active_category, t],
  );

  const run_scope_action = useCallback(
    async (action: BulkScopeAction) => {
      const progress = { completed: 0, total: 0 };
      const exclude_ids = selection.excluded_ids;
      const settle_view = (refetch: boolean) => {
        selection.exit_select_all_mode();
        selection.handle_clear_selection();
        set_current_page(0);
        if (!refetch) return;
        fetch_page(0, page_size);
        mail_event_bus.emit(MAIL_EVENTS.MAIL_CHANGED);
      };

      try {
        let affected_count = 0;
        let completed = true;
        let handled_by_category = false;

        if (categories.enabled && supports_category_scope(action)) {
          let outcome = await run_category_bulk_action(
            action,
            progress,
            exclude_ids,
          );

          if (outcome === "not_ready") {
            if (is_index_capped()) {
              show_toast(t("mail.bulk_action_index_capped"), "error");

              return;
            }

            show_toast(t("mail.bulk_action_index_building"), "info");

            const ready = await wait_for_index_ready({
              on_progress: (processed) => {
                progress.total = Math.max(progress.total, processed);
              },
            });

            if (ready !== "ready") {
              show_toast(
                ready === "capped"
                  ? t("mail.bulk_action_index_capped")
                  : t("mail.bulk_action_index_not_ready"),
                "error",
              );

              return;
            }

            outcome = await run_category_bulk_action(
              action,
              progress,
              exclude_ids,
            );

            if (outcome === "not_ready") {
              show_toast(t("mail.bulk_action_index_not_ready"), "error");

              return;
            }
          }
          if (outcome !== "unsupported") {
            handled_by_category = true;
            affected_count = progress.completed;
          }
        }
        if (!handled_by_category) {
          if (!scope_for_view) {
            show_toast(t("mail.bulk_action_index_not_ready"), "error");

            return;
          }

          const res = await bulk_action_by_scope({
            action,
            scope: scope_for_view,
            ...(exclude_ids.length > 0 ? { exclude_ids } : {}),
          });

          if (res.error) throw new Error(res.error);
          affected_count = res.data?.affected_count ?? 0;
          completed = res.data?.completed !== false;
        }
        settle_view(completed);

        if (!completed) {
          show_toast(t("common.bulk_action_continues_in_background"), "info");

          return;
        }

        const toast_info = BULK_SCOPE_TOAST[action];

        show_action_toast({
          message: t(toast_info.message_key, { count: affected_count }),
          action_type: toast_info.action_type,
          email_ids: [],
        });
      } catch (e) {
        if (import.meta.env.DEV) console.error(e);
        if (progress.completed > 0) {
          settle_view(true);
          show_toast(
            t("common.bulk_action_partially_applied", {
              count: progress.completed,
              total: progress.total,
            }),
            "error",
          );

          return;
        }
        show_toast(t("common.something_went_wrong"), "error");
      }
    },
    [
      categories.enabled,
      run_category_bulk_action,
      scope_for_view,
      selection,
      fetch_page,
      set_current_page,
      t,
    ],
  );

  const run_scope_label_action = useCallback(
    async (
      kind: "folder" | "tag",
      token: string,
      should_remove: boolean,
    ): Promise<void> => {
      const name =
        kind === "folder"
          ? folders_lookup.get(token)?.name || "folder"
          : tags_lookup.get(token)?.name || "label";

      let progress_toast_shown = false;
      let applied = 0;

      const report = (completed: number, total: number) => {
        if (total < PROGRESS_THRESHOLDS.SHOW_TOAST_PROGRESS) return;
        if (!progress_toast_shown) {
          progress_toast_shown = true;
          show_action_toast({
            message: t("common.processing_count", {
              completed: String(completed),
              total: String(total),
            }),
            action_type: "progress",
            email_ids: [],
            progress: { completed, total },
          });

          return;
        }
        update_progress_toast(completed, total, t);
      };

      try {
        const { ids, capped } = await collect_scope_ids({
          view: current_view,
          exclude_ids: selection.excluded_ids,
          on_progress: (collected) => report(0, collected),
        });

        if (ids.length === 0) return;

        const apply =
          kind === "folder"
            ? should_remove
              ? batched_bulk_remove_folder
              : batched_bulk_add_folder
            : should_remove
              ? batched_bulk_remove_tag
              : batched_bulk_add_tag;
        const result = await apply(ids, token, {
          on_progress: (completed) => {
            applied = completed;
            report(completed, ids.length);
          },
        });

        const failed = new Set(result.failed_ids);
        const succeeded = ids.length - failed.size;

        selection.exit_select_all_mode();
        selection.handle_clear_selection();
        set_current_page(0);
        fetch_page(0, page_size);
        mail_event_bus.emit(MAIL_EVENTS.MAIL_CHANGED);

        if (failed.size > 0) {
          show_toast(
            t("common.bulk_action_partially_applied", {
              count: succeeded,
              total: ids.length,
            }),
            "error",
          );

          return;
        }

        show_action_toast({
          message:
            kind === "folder"
              ? should_remove
                ? t("common.conversations_removed_from_folder", {
                    count: succeeded,
                    folder: name,
                  })
                : t("common.conversations_moved_to_folder", {
                    count: succeeded,
                    folder: name,
                  })
              : should_remove
                ? t("common.conversations_removed_label", {
                    count: succeeded,
                    label: name,
                  })
                : t("common.conversations_added_label", {
                    count: succeeded,
                    label: name,
                  }),
          action_type: "folder",
          email_ids: [],
        });

        if (capped) {
          show_toast(t("mail.bulk_action_index_capped"), "info");
        }
      } catch (e) {
        if (import.meta.env.DEV) console.error(e);
        if (applied > 0) {
          fetch_page(0, page_size);
          mail_event_bus.emit(MAIL_EVENTS.MAIL_CHANGED);
        }
        show_toast(t("common.something_went_wrong"), "error");
      } finally {
        if (progress_toast_shown) hide_action_toast();
      }
    },
    [
      current_view,
      folders_lookup,
      tags_lookup,
      selection,
      fetch_page,
      set_current_page,
      page_size,
      t,
    ],
  );

  const handle_folder_toggle_wrapped = useCallback(
    (folder_token: string, should_remove: boolean) => {
      if (selection.select_all_mode) {
        queue_select_all_action(() => {
          void run_scope_label_action("folder", folder_token, should_remove);
        });

        return;
      }
      void toolbar.handle_toolbar_toggle_folder(folder_token, should_remove);
    },
    [selection, toolbar, run_scope_label_action, queue_select_all_action],
  );

  const handle_tag_toggle_wrapped = useCallback(
    (tag_token: string, should_remove: boolean) => {
      if (selection.select_all_mode) {
        queue_select_all_action(() => {
          void run_scope_label_action("tag", tag_token, should_remove);
        });

        return;
      }
      void toolbar.handle_toolbar_toggle_tag(tag_token, should_remove);
    },
    [selection, toolbar, run_scope_label_action, queue_select_all_action],
  );

  const handle_delete_wrapped = useCallback(() => {
    if (selection.select_all_mode) {
      queue_select_all_action(() => {
        if (current_view === "trash") {
          toolbar.handle_empty_trash();
          selection.exit_select_all_mode();
          selection.handle_clear_selection();

          return;
        }
        void run_scope_action("trash");
      });

      return;
    }
    toolbar.handle_toolbar_delete();
  }, [
    selection,
    toolbar,
    current_view,
    run_scope_action,
    queue_select_all_action,
  ]);

  const handle_archive_wrapped = useCallback(() => {
    if (selection.select_all_mode) {
      queue_select_all_action(() => {
        void run_scope_action("archive");
      });

      return;
    }
    toolbar.handle_toolbar_archive();
  }, [selection, toolbar, run_scope_action, queue_select_all_action]);

  const handle_unarchive_wrapped = useCallback(() => {
    if (selection.select_all_mode) {
      queue_select_all_action(() => {
        void run_scope_action("unarchive");
      });

      return;
    }
    toolbar.handle_toolbar_unarchive();
  }, [selection, toolbar, run_scope_action, queue_select_all_action]);

  const handle_spam_wrapped = useCallback(() => {
    if (selection.select_all_mode) {
      queue_select_all_action(() => {
        if (current_view === "spam") {
          void run_scope_action("unmark_spam");
        } else {
          void run_scope_action("mark_spam");
        }
      });

      return;
    }
    toolbar.handle_toolbar_spam();
  }, [
    selection,
    toolbar,
    current_view,
    run_scope_action,
    queue_select_all_action,
  ]);

  const handle_mark_read_wrapped = useCallback(() => {
    if (selection.select_all_mode) {
      queue_select_all_action(() => {
        void run_scope_action("mark_read");
      });

      return;
    }
    toolbar.handle_toolbar_mark_read();
  }, [selection, toolbar, run_scope_action, queue_select_all_action]);

  const handle_mark_unread_wrapped = useCallback(() => {
    if (selection.select_all_mode) {
      queue_select_all_action(() => {
        void run_scope_action("mark_unread");
      });

      return;
    }
    toolbar.handle_toolbar_mark_unread();
  }, [selection, toolbar, run_scope_action, queue_select_all_action]);

  const handle_toggle_star_wrapped = useCallback(() => {
    if (selection.select_all_mode) {
      queue_select_all_action(() => {
        void run_scope_action(current_view === "starred" ? "unstar" : "star");
      });

      return;
    }
    toolbar.handle_toolbar_toggle_star();
  }, [
    selection,
    toolbar,
    current_view,
    run_scope_action,
    queue_select_all_action,
  ]);

  const handle_restore_wrapped = useCallback(() => {
    if (selection.select_all_mode) {
      queue_select_all_action(() => {
        void run_scope_action("restore_trash");
      });

      return;
    }
    toolbar.handle_toolbar_restore();
  }, [selection, toolbar, run_scope_action, queue_select_all_action]);

  const handle_not_spam_wrapped = useCallback(() => {
    if (selection.select_all_mode) {
      queue_select_all_action(() => {
        void run_scope_action("unmark_spam");
      });

      return;
    }
    toolbar.handle_toolbar_restore();
  }, [selection, toolbar, run_scope_action, queue_select_all_action]);

  return {
    pending_select_all_action,
    set_pending_select_all_action,
    handle_delete_wrapped,
    handle_archive_wrapped,
    handle_unarchive_wrapped,
    handle_spam_wrapped,
    handle_mark_read_wrapped,
    handle_mark_unread_wrapped,
    handle_toggle_star_wrapped,
    handle_restore_wrapped,
    handle_not_spam_wrapped,
    handle_folder_toggle_wrapped,
    handle_tag_toggle_wrapped,
  };
}
