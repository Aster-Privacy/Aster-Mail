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
import type { InboxEmail, InboxFilterType } from "@/types/email";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  FunnelIcon,
  CheckIcon,
  Cog6ToothIcon,
  XMarkIcon,
  ArchiveBoxIcon,
  InboxIcon,
  TrashIcon,
  StarIcon,
  EnvelopeOpenIcon,
  FolderIcon,
  TagIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { use_email_list } from "@/hooks/use_email_list";
import { use_drafts_list, type DraftListItem } from "@/hooks/use_drafts_list";
import { use_email_actions } from "@/hooks/use_email_actions";
import { use_snooze } from "@/hooks/use_snooze";
import { use_tags } from "@/hooks/use_tags";
import { use_folders } from "@/hooks/use_folders";
import {
  use_scheduled_emails,
  type ScheduledListItem,
} from "@/hooks/use_scheduled_emails";
import { use_snoozed_emails } from "@/hooks/use_snoozed_emails";
import { MobileSnoozeSheet } from "@/pages/mobile/mobile_detail_sheets";
import { SplitScheduledViewer } from "@/components/scheduled/split_scheduled_viewer";
import { use_i18n } from "@/lib/i18n/context";
import { use_platform } from "@/hooks/use_platform";
import { use_preferences } from "@/contexts/preferences_context";
import { MobileHeader } from "@/components/mobile/mobile_header";
import { MobileEmailList } from "@/components/mobile/mobile_email_list";
import { EmptyTrashModal } from "@/components/email/inbox/inbox_confirmation_dialog";
import { use_settled_not_found } from "@/components/email/inbox/use_settled_not_found";
import { use_spam_confirm } from "@/components/email/use_spam_confirm";
import {
  use_archive_confirm,
  use_delete_confirm,
} from "@/components/email/use_action_confirm";
import { empty_trash } from "@/services/api/mail";
import { show_action_toast } from "@/components/toast/action_toast";
import { show_toast } from "@/components/toast/simple_toast";
import { invalidate_mail_cache } from "@/hooks/email_list_cache";
import {
  invalidate_mail_stats,
  adjust_stats_trash,
} from "@/hooks/use_mail_stats";
import { emit_mail_items_removed } from "@/hooks/mail_events";
import { request_cache } from "@/services/api/request_cache";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown_menu";
import { haptic_impact } from "@/native/haptic_feedback";
import { set_recipient_hint } from "@/stores/recipient_hint_store";

type Mailbox =
  | "inbox"
  | "all"
  | "starred"
  | "sent"
  | "drafts"
  | "scheduled"
  | "snoozed"
  | "archive"
  | "spam"
  | "trash";

interface MobileInboxProps {
  on_compose?: () => void;
  on_open_drawer: () => void;
  on_draft_click?: (draft: DraftListItem) => void;
  mailbox?: Mailbox;
  on_selection_mode_change?: (active: boolean) => void;
}

const VIEW_TITLES: Record<string, string> = {
  inbox: "mail.inbox",
  all: "mail.all_mail",
  starred: "mail.starred",
  sent: "mail.sent",
  drafts: "mail.drafts",
  scheduled: "mail.scheduled",
  snoozed: "mail.snoozed",
  archive: "mail.archive",
  spam: "mail.spam",
  trash: "mail.trash",
};

function MobileInbox({
  on_open_drawer,
  on_draft_click,
  mailbox,
  on_selection_mode_change,
}: MobileInboxProps) {
  const navigate = useNavigate();
  const { folder_token, tag_token, alias_address } = useParams<{
    folder_token?: string;
    tag_token?: string;
    alias_address?: string;
  }>();
  const { t } = use_i18n();
  const { safe_area_insets } = use_platform();
  const { preferences } = use_preferences();

  const current_view = folder_token
    ? `folder-${folder_token}`
    : tag_token
      ? `tag-${tag_token}`
      : alias_address
        ? `alias-${decodeURIComponent(alias_address)}`
        : (mailbox ?? "inbox");

  const is_drafts_view = current_view === "drafts";
  const is_scheduled_view = current_view === "scheduled";
  const is_snoozed_view = current_view === "snoozed";

  const {
    state: mail_state,
    load_more,
    update_email,
    remove_email,
    refresh,
  } = use_email_list(current_view);

  const {
    state: drafts_state,
    refresh: refresh_drafts,
    schedule_delete_drafts,
  } = use_drafts_list(is_drafts_view);

  const {
    state: scheduled_state,
    refresh: refresh_scheduled,
    cancel_email: cancel_scheduled,
    bulk_cancel: bulk_cancel_scheduled,
  } = use_scheduled_emails(is_scheduled_view);

  const {
    state: snoozed_state,
    fetch_snoozed,
    unsnooze: unsnooze_snoozed,
  } = use_snoozed_emails();

  useEffect(() => {
    if (is_snoozed_view) fetch_snoozed();
  }, [is_snoozed_view, fetch_snoozed]);

  const actions = use_email_actions();
  const snooze_actions = use_snooze();
  const { request_spam, spam_confirm_dialog } = use_spam_confirm();
  const { request_delete, delete_confirm_dialog } = use_delete_confirm();
  const { request_archive, archive_confirm_dialog } = use_archive_confirm();
  const { get_tag_by_token, state: tags_state } = use_tags();
  const { get_folder_by_token, state: folders_state } = use_folders();
  const [active_filter, set_active_filter] = useState<InboxFilterType>("all");
  const [selection_mode, set_selection_mode] = useState(false);
  const [selected_ids, set_selected_ids] = useState<Set<string>>(new Set());
  const [is_refreshing, set_is_refreshing] = useState(false);
  const [snooze_email_target, set_snooze_email_target] =
    useState<InboxEmail | null>(null);
  const [show_empty_trash_dialog, set_show_empty_trash_dialog] =
    useState(false);
  const [scheduled_target, set_scheduled_target] =
    useState<ScheduledListItem | null>(null);
  const [is_emptying_trash, set_is_emptying_trash] = useState(false);

  const is_trash_view = current_view === "trash";

  useEffect(() => {
    on_selection_mode_change?.(selection_mode);
  }, [selection_mode, on_selection_mode_change]);

  const active_emails = is_drafts_view
    ? (drafts_state.drafts as InboxEmail[])
    : is_scheduled_view
      ? (scheduled_state.emails as InboxEmail[])
      : is_snoozed_view
        ? snoozed_state.emails
        : mail_state.emails;

  const pinned_emails = useMemo(
    () => active_emails.filter((e) => e.is_pinned),
    [active_emails],
  );
  const unpinned_emails = useMemo(
    () => active_emails.filter((e) => !e.is_pinned),
    [active_emails],
  );

  const filtered_pinned = useMemo(() => {
    if (active_filter === "all") return pinned_emails;
    if (active_filter === "unread")
      return pinned_emails.filter((e) => !e.is_read);
    if (active_filter === "read") return pinned_emails.filter((e) => e.is_read);
    if (active_filter === "attachments")
      return pinned_emails.filter((e) => e.has_attachment);

    return pinned_emails;
  }, [pinned_emails, active_filter]);

  const filtered_unpinned = useMemo(() => {
    if (active_filter === "all") return unpinned_emails;
    if (active_filter === "unread")
      return unpinned_emails.filter((e) => !e.is_read);
    if (active_filter === "read")
      return unpinned_emails.filter((e) => e.is_read);
    if (active_filter === "attachments")
      return unpinned_emails.filter((e) => e.has_attachment);

    return unpinned_emails;
  }, [unpinned_emails, active_filter]);

  const enrich_tags = useCallback(
    (emails: InboxEmail[]) => {
      return emails.map((email) => {
        if (!email.tags || email.tags.length === 0) return email;
        const enriched_tags = email.tags
          .map((tag) => {
            const full_tag = get_tag_by_token(tag.id);

            if (full_tag) {
              return {
                ...tag,
                name: full_tag.name,
                color: full_tag.color,
                icon: full_tag.icon,
              };
            }

            return tag;
          })
          .filter((tag) => tag.name);

        return { ...email, tags: enriched_tags };
      });
    },
    [get_tag_by_token],
  );

  const enriched_pinned = useMemo(
    () => enrich_tags(filtered_pinned),
    [enrich_tags, filtered_pinned],
  );
  const enriched_unpinned = useMemo(
    () => enrich_tags(filtered_unpinned),
    [enrich_tags, filtered_unpinned],
  );

  const all_visible_emails = useMemo(() => {
    const pinned = enriched_pinned.length > 0 ? enriched_pinned : [];

    return [...pinned, ...enriched_unpinned];
  }, [enriched_pinned, enriched_unpinned]);

  const folder_not_found = use_settled_not_found({
    kind: "folder",
    token: folder_token ?? null,
    is_found: Boolean(folder_token && get_folder_by_token(folder_token)),
    is_loading: folders_state.is_loading,
  });
  const tag_not_found = use_settled_not_found({
    kind: "tag",
    token: tag_token ?? null,
    is_found: Boolean(tag_token && get_tag_by_token(tag_token)),
    is_loading: tags_state.is_loading,
  });

  const view_title = folder_token
    ? (get_folder_by_token(folder_token)?.name ?? t("common.folders"))
    : tag_token
      ? (get_tag_by_token(tag_token)?.name ?? t("common.labels"))
      : alias_address
        ? decodeURIComponent(alias_address)
        : t((VIEW_TITLES[current_view] ?? "mail.inbox") as "mail.inbox");

  const exit_selection_mode = useCallback(() => {
    set_selection_mode(false);
    set_selected_ids(new Set());
  }, []);

  const handle_toggle_select = useCallback((id: string) => {
    set_selected_ids((prev) => {
      const next = new Set(prev);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      if (next.size === 0) {
        set_selection_mode(false);
      }

      return next;
    });
  }, []);

  const handle_drag_select = useCallback((id: string) => {
    set_selected_ids((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);

      next.add(id);

      return next;
    });
  }, []);

  const handle_select_all = useCallback(() => {
    const capped = all_visible_emails.slice(0, 100);

    set_selected_ids(new Set(capped.map((e) => e.id)));
  }, [all_visible_emails]);

  const handle_email_press = useCallback(
    (id: string) => {
      if (selection_mode) {
        handle_toggle_select(id);

        return;
      }
      if (is_scheduled_view) {
        const scheduled = scheduled_state.emails.find((e) => e.id === id);

        if (scheduled) set_scheduled_target(scheduled);

        return;
      }
      if (is_drafts_view && on_draft_click) {
        const draft = drafts_state.drafts.find((d) => d.id === id);

        if (draft) {
          on_draft_click(draft);

          return;
        }
      }
      const clicked = active_emails.find((e) => e.id === id);
      const visible_ids = active_emails.map((e) => e.id);

      set_recipient_hint(id, clicked?.recipient_addresses || []);
      sessionStorage.setItem(
        "astermail_email_nav",
        JSON.stringify({
          view: current_view,
          email_ids: visible_ids,
          grouped_email_ids: clicked?.grouped_email_ids,
        }),
      );
      navigate(`/email/${id}`, { state: { from_view: current_view } });
    },
    [
      navigate,
      current_view,
      is_drafts_view,
      is_scheduled_view,
      scheduled_state.emails,
      on_draft_click,
      drafts_state.drafts,
      active_emails,
      selection_mode,
      handle_toggle_select,
    ],
  );

  const handle_long_press = useCallback((id: string) => {
    set_selection_mode(true);
    set_selected_ids(new Set([id]));
  }, []);

  const get_selected_emails = useCallback((): InboxEmail[] => {
    return active_emails.filter((e) => selected_ids.has(e.id));
  }, [active_emails, selected_ids]);

  const is_archive_view = current_view === "archive";

  const handle_bulk_archive = useCallback(async () => {
    const emails = get_selected_emails();

    if (emails.length === 0) return;
    haptic_impact("medium");
    const ok = is_archive_view
      ? await actions.bulk_unarchive(emails)
      : await actions.bulk_archive(emails);

    if (ok) {
      for (const email of emails) {
        remove_email(email.id);
      }
    } else {
      show_toast(
        t(
          is_archive_view
            ? "common.failed_to_move_email"
            : "common.failed_to_archive_emails",
        ),
        "error",
      );
    }
    exit_selection_mode();
  }, [
    get_selected_emails,
    actions,
    remove_email,
    exit_selection_mode,
    is_archive_view,
    t,
  ]);

  const handle_bulk_delete = useCallback(async () => {
    const emails = get_selected_emails();

    if (emails.length === 0) return;
    haptic_impact("medium");

    if (is_scheduled_view) {
      const ids = emails.map((e) => e.id);
      const ok = await bulk_cancel_scheduled(ids);

      if (ok) {
        show_toast(
          t("common.scheduled_emails_cancelled", { count: ids.length }),
          "success",
        );
      } else {
        show_toast(t("common.failed_to_delete_emails"), "error");
      }
      exit_selection_mode();

      return;
    }

    if (is_drafts_view) {
      const ids = emails.map((e) => e.id);

      schedule_delete_drafts(ids);
      show_action_toast({
        message: t("common.drafts_deleted", { count: ids.length }),
        action_type: "trash",
        email_ids: ids,
      });
      exit_selection_mode();

      return;
    }

    if (is_trash_view) {
      const results = await Promise.all(
        emails.map((email) => actions.permanently_delete(email)),
      );

      emails.forEach((email, index) => {
        if (results[index]) remove_email(email.id);
      });

      if (results.some((ok) => !ok)) {
        show_toast(t("common.failed_to_permanently_delete"), "error");
      }
      exit_selection_mode();

      return;
    }

    const ok = await actions.bulk_delete(emails);

    if (ok) {
      for (const email of emails) {
        remove_email(email.id);
      }
    } else {
      show_toast(t("common.failed_to_delete_emails"), "error");
    }
    exit_selection_mode();
  }, [
    get_selected_emails,
    actions,
    remove_email,
    exit_selection_mode,
    is_scheduled_view,
    is_drafts_view,
    is_trash_view,
    bulk_cancel_scheduled,
    schedule_delete_drafts,
    t,
  ]);

  const handle_bulk_toggle_star = useCallback(async () => {
    const emails = get_selected_emails();

    if (emails.length === 0) return;
    const any_unstarred = emails.some((e) => !e.is_starred);

    await actions.bulk_star(emails, any_unstarred);
    exit_selection_mode();
  }, [get_selected_emails, actions, exit_selection_mode]);

  const handle_bulk_toggle_read = useCallback(async () => {
    const emails = get_selected_emails();

    if (emails.length === 0) return;
    const any_unread = emails.some((e) => !e.is_read);

    await actions.bulk_mark_read(emails, any_unread);
    exit_selection_mode();
  }, [get_selected_emails, actions, exit_selection_mode]);

  const run_archive = useCallback(
    async (email: InboxEmail) => {
      const success = email.is_archived
        ? await actions.unarchive_email(email)
        : await actions.archive_email(email);

      if (success) {
        remove_email(email.id);
      } else {
        show_toast(
          email.is_archived
            ? t("common.something_went_wrong")
            : t("common.failed_to_archive_emails"),
          "error",
        );
      }
    },
    [actions, remove_email, t],
  );

  const handle_archive = useCallback(
    (email: InboxEmail) => {
      if (email.is_archived) {
        void run_archive(email);

        return;
      }
      request_archive(() => run_archive(email));
    },
    [request_archive, run_archive],
  );

  const run_delete = useCallback(
    async (email: InboxEmail) => {
      if (is_scheduled_view) {
        const ok = await cancel_scheduled(email.id);

        if (!ok) show_toast(t("common.something_went_wrong"), "error");

        return;
      }
      if (is_trash_view) {
        const ok = await actions.permanently_delete(email);

        if (ok) {
          remove_email(email.id);
        } else {
          show_toast(t("common.failed_to_permanently_delete"), "error");
        }
      } else {
        const ok = await actions.delete_email(email);

        if (ok) {
          remove_email(email.id);
        } else {
          show_toast(t("common.failed_to_delete_emails"), "error");
        }
      }
    },
    [
      actions,
      remove_email,
      is_trash_view,
      is_scheduled_view,
      cancel_scheduled,
      t,
    ],
  );

  const handle_delete = useCallback(
    (email: InboxEmail) => {
      request_delete(() => run_delete(email));
    },
    [request_delete, run_delete],
  );

  const handle_toggle_star = useCallback(
    async (email: InboxEmail) => {
      update_email(email.id, { is_starred: !email.is_starred });
      try {
        await actions.toggle_star(email);
      } catch {
        update_email(email.id, { is_starred: email.is_starred });
      }
    },
    [actions, update_email],
  );

  const handle_toggle_read = useCallback(
    async (email: InboxEmail) => {
      update_email(email.id, { is_read: !email.is_read });
      const success = await actions.toggle_read(email);

      if (!success) {
        update_email(email.id, { is_read: email.is_read });
      }
    },
    [actions, update_email],
  );

  const handle_snooze = useCallback(async (email: InboxEmail) => {
    set_snooze_email_target(email);
  }, []);

  const handle_mark_spam = useCallback(
    (email: InboxEmail) => {
      request_spam(async () => {
        const success = await actions.mark_as_spam(email);

        if (success) remove_email(email.id);
      });
    },
    [actions, remove_email, request_spam],
  );

  const handle_snooze_select = useCallback(
    async (snoozed_until: Date) => {
      if (!snooze_email_target) return;
      try {
        await snooze_actions.snooze(snooze_email_target.id, snoozed_until);
        if (is_snoozed_view) {
          fetch_snoozed();
        } else {
          remove_email(snooze_email_target.id);
        }
        set_snooze_email_target(null);
      } catch (err) {
        if (import.meta.env.DEV) console.error("failed to snooze email", err);
      }
    },
    [
      snooze_actions,
      snooze_email_target,
      remove_email,
      is_snoozed_view,
      fetch_snoozed,
    ],
  );

  const handle_unsnooze_select = useCallback(async () => {
    if (!snooze_email_target) return;
    const target_id = snooze_email_target.id;

    set_snooze_email_target(null);
    try {
      if (is_snoozed_view) {
        await unsnooze_snoozed(target_id);
      } else {
        await snooze_actions.unsnooze_mail(target_id);
        update_email(target_id, { snoozed_until: undefined });
      }
      show_toast(t("common.email_unsnoozed"), "success");
    } catch (err) {
      if (import.meta.env.DEV) console.error("failed to unsnooze email", err);
      show_toast(t("common.failed_to_unsnooze"), "error");
    }
  }, [
    snooze_email_target,
    is_snoozed_view,
    unsnooze_snoozed,
    snooze_actions,
    update_email,
    t,
  ]);

  const handle_load_more = useCallback(() => {
    if (is_drafts_view) {
      if (drafts_state.has_more) refresh_drafts();

      return;
    }
    if (is_scheduled_view || is_snoozed_view) return;
    if (mail_state.has_more && !mail_state.is_loading_more) {
      load_more();
    }
  }, [
    is_drafts_view,
    is_scheduled_view,
    is_snoozed_view,
    drafts_state.has_more,
    mail_state,
    load_more,
    refresh_drafts,
  ]);

  const handle_refresh = useCallback(() => {
    set_is_refreshing(true);
    setTimeout(() => set_is_refreshing(false), 1000);
    if (is_drafts_view) {
      refresh_drafts();

      return;
    }
    if (is_scheduled_view) {
      refresh_scheduled();

      return;
    }
    if (is_snoozed_view) {
      fetch_snoozed();

      return;
    }
    refresh();
  }, [
    is_drafts_view,
    is_scheduled_view,
    is_snoozed_view,
    refresh,
    refresh_drafts,
    refresh_scheduled,
    fetch_snoozed,
  ]);

  const confirm_empty_trash = useCallback(async () => {
    set_is_emptying_trash(true);
    try {
      const result = await empty_trash();

      if (result.data?.success) {
        const removed_ids = mail_state.emails.map((e) => e.id);
        const trash_count = mail_state.emails.length;

        for (const email of mail_state.emails) {
          remove_email(email.id);
        }
        request_cache.invalidate("/mail/v1/messages");
        invalidate_mail_cache("trash");
        invalidate_mail_cache("all");
        invalidate_mail_cache("starred");
        adjust_stats_trash(-trash_count);
        emit_mail_items_removed({ ids: removed_ids });
        invalidate_mail_stats();
        show_action_toast({
          message: t("common.trash_emptied"),
          action_type: "trash",
          email_ids: [],
        });
      } else {
        request_cache.invalidate("/mail/v1/messages");
        invalidate_mail_cache("trash");
        invalidate_mail_stats();
        show_toast(t("common.trash_empty_failed"), "error");
      }
    } catch {
      request_cache.invalidate("/mail/v1/messages");
      invalidate_mail_cache("trash");
      invalidate_mail_stats();
      show_toast(t("common.trash_empty_failed"), "error");
    } finally {
      set_is_emptying_trash(false);
      set_show_empty_trash_dialog(false);
    }
  }, [mail_state.emails, remove_email, t]);

  return (
    <div
      className={`flex h-full flex-col${selection_mode ? " select-none" : ""}`}
    >
      {selection_mode ? (
        <header
          className="sticky top-0 z-40 flex shrink-0 items-center gap-3 bg-[var(--bg-primary)] px-3"
          style={{
            paddingTop: safe_area_insets.top,
            height: 56 + safe_area_insets.top,
          }}
        >
          <button
            className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-secondary)] active:bg-[var(--bg-tertiary)]"
            type="button"
            onClick={exit_selection_mode}
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
          <span className="min-w-0 flex-1 text-lg font-semibold text-[var(--text-primary)]">
            {selected_ids.size} {t("common.selected")}
          </span>
          <button
            className="rounded-full px-3 py-1.5 text-[13px] font-medium text-[var(--accent-color,#3b82f6)]"
            type="button"
            onClick={handle_select_all}
          >
            {t("common.select_all")}
          </button>
        </header>
      ) : (
        <MobileHeader
          on_menu={on_open_drawer}
          on_search={() => navigate("/search")}
          right_actions={
            <>
              {is_trash_view && active_emails.length > 0 && (
                <button
                  className="flex h-11 w-11 items-center justify-center rounded-full text-red-500 active:bg-[var(--bg-tertiary)]"
                  type="button"
                  onClick={() => set_show_empty_trash_dialog(true)}
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={`flex h-11 w-11 items-center justify-center rounded-full ${
                      active_filter !== "all"
                        ? "text-blue-500"
                        : "text-[var(--text-secondary)]"
                    } active:bg-[var(--bg-tertiary)]`}
                    type="button"
                  >
                    <FunnelIcon className="h-5 w-5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>{t("mail.filter")}</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => set_active_filter("all")}>
                    <span className="w-4 mr-2">
                      {active_filter === "all" && (
                        <CheckIcon className="w-4 h-4" />
                      )}
                    </span>
                    {t("mail.all_emails")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => set_active_filter("unread")}>
                    <span className="w-4 mr-2">
                      {active_filter === "unread" && (
                        <CheckIcon className="w-4 h-4" />
                      )}
                    </span>
                    {t("mail.unread_only")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => set_active_filter("read")}>
                    <span className="w-4 mr-2">
                      {active_filter === "read" && (
                        <CheckIcon className="w-4 h-4" />
                      )}
                    </span>
                    {t("mail.read_only")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => set_active_filter("attachments")}
                  >
                    <span className="w-4 mr-2">
                      {active_filter === "attachments" && (
                        <CheckIcon className="w-4 h-4" />
                      )}
                    </span>
                    {t("mail.with_attachments")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <button
                className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-secondary)] active:bg-[var(--bg-tertiary)]"
                type="button"
                onClick={() => navigate("/settings")}
              >
                <Cog6ToothIcon className="h-5 w-5" />
              </button>
            </>
          }
          title={view_title}
        />
      )}

      {folder_not_found ? (
        <div className="flex flex-col items-center justify-center flex-1 px-4 py-20">
          <FolderIcon
            className="w-12 h-12 mb-4 text-txt-muted"
            strokeWidth={1}
          />
          <p className="text-sm font-medium text-txt-primary mb-1">
            {t("mail.folder_not_found_title")}
          </p>
          <p className="text-xs text-txt-muted">
            {t("mail.folder_not_found_subtitle")}
          </p>
        </div>
      ) : tag_not_found ? (
        <div className="flex flex-col items-center justify-center flex-1 px-4 py-20">
          <TagIcon className="w-12 h-12 mb-4 text-txt-muted" strokeWidth={1} />
          <p className="text-sm font-medium text-txt-primary mb-1">
            {t("mail.tag_not_found_title")}
          </p>
          <p className="text-xs text-txt-muted">
            {t("mail.tag_not_found_subtitle")}
          </p>
        </div>
      ) : null}

      {!folder_not_found &&
        !tag_not_found &&
        is_drafts_view &&
        drafts_state.error &&
        !drafts_state.is_loading && (
          <div className="flex flex-col items-center justify-center flex-1 px-4 py-20">
            <ExclamationTriangleIcon
              className="w-12 h-12 mb-4 text-txt-muted"
              strokeWidth={1}
            />
            <p className="text-sm font-medium text-txt-primary mb-1">
              {drafts_state.error}
            </p>
            <button
              className="mt-3 rounded-full bg-[var(--accent-color,#3b82f6)] px-5 py-2 text-[13px] font-medium text-[var(--accent-fg,#ffffff)]"
              type="button"
              onClick={refresh_drafts}
            >
              {t("common.retry")}
            </button>
          </div>
        )}

      {!folder_not_found && !tag_not_found && (
        <MobileEmailList
          current_view={current_view}
          emails={enriched_unpinned}
          has_more={
            is_drafts_view
              ? drafts_state.has_more
              : is_scheduled_view || is_snoozed_view
                ? false
                : mail_state.has_more
          }
          is_loading={
            is_drafts_view
              ? drafts_state.is_loading
              : is_scheduled_view
                ? scheduled_state.is_loading
                : is_snoozed_view
                  ? snoozed_state.is_loading
                  : mail_state.is_loading
          }
          is_loading_more={
            is_drafts_view || is_scheduled_view || is_snoozed_view
              ? false
              : mail_state.is_loading_more
          }
          has_initial_load={
            is_drafts_view
              ? !drafts_state.is_loading
              : is_scheduled_view
                ? !scheduled_state.is_loading
                : is_snoozed_view
                  ? snoozed_state.has_loaded
                  : mail_state.has_initial_load
          }
          has_load_error={
            is_drafts_view || is_scheduled_view || is_snoozed_view
              ? false
              : mail_state.has_load_error
          }
          is_refreshing={is_refreshing}
          on_archive={
            is_drafts_view || is_scheduled_view ? undefined : handle_archive
          }
          on_delete={handle_delete}
          on_drag_select={selection_mode ? handle_drag_select : undefined}
          on_email_press={handle_email_press}
          on_load_more={handle_load_more}
          on_long_press={handle_long_press}
          on_mark_spam={
            is_drafts_view || is_scheduled_view ? undefined : handle_mark_spam
          }
          on_refresh={handle_refresh}
          on_snooze={is_scheduled_view ? undefined : handle_snooze}
          on_toggle_read={
            is_drafts_view || is_scheduled_view ? undefined : handle_toggle_read
          }
          on_toggle_star={
            is_drafts_view || is_scheduled_view ? undefined : handle_toggle_star
          }
          pinned_emails={
            enriched_pinned.length > 0 ? enriched_pinned : undefined
          }
          selected_ids={selected_ids}
          selection_mode={selection_mode}
          swipe_left_action={preferences.swipe_left_action}
          swipe_right_action={preferences.swipe_right_action}
        />
      )}

      {selection_mode && (
        <div
          className="sticky bottom-0 z-40 flex items-center justify-around bg-[var(--bg-primary)]"
          style={{
            paddingBottom: Math.max(safe_area_insets.bottom, 8),
            borderTop: "1px solid var(--border-primary)",
          }}
        >
          {!is_drafts_view && !is_scheduled_view && (
            <button
              className="flex flex-1 flex-col items-center gap-1 py-3 text-[var(--text-secondary)] active:text-[var(--text-primary)]"
              type="button"
              onClick={handle_bulk_archive}
            >
              {is_archive_view ? (
                <InboxIcon className="h-5 w-5" />
              ) : (
                <ArchiveBoxIcon className="h-5 w-5" />
              )}
              <span className="text-[11px]">
                {is_archive_view ? t("mail.move_to_inbox") : t("mail.archive")}
              </span>
            </button>
          )}
          <button
            className="flex flex-1 flex-col items-center gap-1 py-3 text-[var(--text-secondary)] active:text-[var(--text-primary)]"
            type="button"
            onClick={handle_bulk_delete}
          >
            <TrashIcon className="h-5 w-5" />
            <span className="text-[11px]">{t("common.delete")}</span>
          </button>
          {!is_drafts_view && !is_scheduled_view && (
            <>
              <button
                className="flex flex-1 flex-col items-center gap-1 py-3 text-[var(--text-secondary)] active:text-[var(--text-primary)]"
                type="button"
                onClick={handle_bulk_toggle_star}
              >
                <StarIcon className="h-5 w-5" />
                <span className="text-[11px]">{t("mail.star")}</span>
              </button>
              <button
                className="flex flex-1 flex-col items-center gap-1 py-3 text-[var(--text-secondary)] active:text-[var(--text-primary)]"
                type="button"
                onClick={handle_bulk_toggle_read}
              >
                <EnvelopeOpenIcon className="h-5 w-5" />
                <span className="text-[11px]">{t("mail.mark_as_read")}</span>
              </button>
            </>
          )}
        </div>
      )}

      <EmptyTrashModal
        is_emptying={is_emptying_trash}
        on_cancel={() => set_show_empty_trash_dialog(false)}
        on_confirm={confirm_empty_trash}
        show={show_empty_trash_dialog}
        trash_count={active_emails.length}
      />

      <MobileSnoozeSheet
        is_open={!!snooze_email_target}
        on_close={() => set_snooze_email_target(null)}
        on_snooze={handle_snooze_select}
        on_unsnooze={
          snooze_email_target?.snoozed_until
            ? handle_unsnooze_select
            : undefined
        }
      />

      {scheduled_target && (
        <div className="fixed inset-0 z-50 flex flex-col bg-surf-primary">
          <MobileHeader
            title={t("mail.scheduled")}
            on_back={() => set_scheduled_target(null)}
          />
          <div className="flex-1 min-h-0">
            <SplitScheduledViewer
              on_close={() => set_scheduled_target(null)}
              scheduled_data={{
                id: scheduled_target.id,
                to_recipients: scheduled_target.to_recipients,
                cc_recipients: scheduled_target.cc_recipients,
                bcc_recipients: scheduled_target.bcc_recipients,
                subject: scheduled_target.subject,
                body: scheduled_target.full_body,
                scheduled_at: scheduled_target.scheduled_at,
                status: scheduled_target.status,
              }}
            />
          </div>
        </div>
      )}

      {spam_confirm_dialog}
      {delete_confirm_dialog}
      {archive_confirm_dialog}
    </div>
  );
}

export default MobileInbox;
