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
  TrashIcon,
  StarIcon,
  EnvelopeOpenIcon,
  FolderIcon,
  TagIcon,
  BellSnoozeIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import {
  addHours,
  addDays,
  setHours,
  setMinutes,
  nextSaturday,
  nextMonday,
  format,
} from "date-fns";

import { use_email_list } from "@/hooks/use_email_list";
import { use_drafts_list, type DraftListItem } from "@/hooks/use_drafts_list";
import { use_email_actions } from "@/hooks/use_email_actions";
import { use_snooze } from "@/hooks/use_snooze";
import { use_tags } from "@/hooks/use_tags";
import { use_folders } from "@/hooks/use_folders";
import { use_i18n } from "@/lib/i18n/context";
import { use_platform } from "@/hooks/use_platform";
import { use_preferences } from "@/contexts/preferences_context";
import { MobileHeader } from "@/components/mobile/mobile_header";
import { MobileEmailList } from "@/components/mobile/mobile_email_list";
import { MobileBottomSheet } from "@/components/mobile/mobile_bottom_sheet";
import { EmptyTrashModal } from "@/components/email/inbox/inbox_confirmation_dialog";
import { empty_trash } from "@/services/api/mail";
import { show_action_toast } from "@/components/toast/action_toast";
import { show_toast } from "@/components/toast/simple_toast";
import { invalidate_mail_cache } from "@/hooks/email_list_cache";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import { emit_mail_items_removed } from "@/hooks/mail_events";
import { adjust_trash_count } from "@/hooks/use_mail_counts";
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

  const {
    state: mail_state,
    new_email_count,
    load_new_emails,
    load_more,
    update_email,
    remove_email,
    refresh,
  } = use_email_list(current_view);

  const { state: drafts_state, refresh: refresh_drafts } =
    use_drafts_list(is_drafts_view);

  const actions = use_email_actions();
  const snooze_actions = use_snooze();
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
  const [is_emptying_trash, set_is_emptying_trash] = useState(false);

  const is_trash_view = current_view === "trash";

  useEffect(() => {
    on_selection_mode_change?.(selection_mode);
  }, [selection_mode, on_selection_mode_change]);

  const active_emails = is_drafts_view
    ? (drafts_state.drafts as InboxEmail[])
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

  const folder_not_found =
    folder_token &&
    !folders_state.is_loading &&
    !get_folder_by_token(folder_token);
  const tag_not_found =
    tag_token && !tags_state.is_loading && !get_tag_by_token(tag_token);

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

  const handle_bulk_archive = useCallback(async () => {
    const emails = get_selected_emails();

    if (emails.length === 0) return;
    haptic_impact("medium");
    await actions.bulk_archive(emails);
    for (const email of emails) {
      remove_email(email.id);
    }
    exit_selection_mode();
  }, [get_selected_emails, actions, remove_email, exit_selection_mode]);

  const handle_bulk_delete = useCallback(async () => {
    const emails = get_selected_emails();

    if (emails.length === 0) return;
    haptic_impact("medium");
    await actions.bulk_delete(emails);
    for (const email of emails) {
      remove_email(email.id);
    }
    exit_selection_mode();
  }, [get_selected_emails, actions, remove_email, exit_selection_mode]);

  const handle_bulk_toggle_star = useCallback(async () => {
    const emails = get_selected_emails();

    if (emails.length === 0) return;
    const any_unstarred = emails.some((e) => !e.is_starred);

    await actions.bulk_star(emails, any_unstarred);
    for (const email of emails) {
      update_email(email.id, { is_starred: any_unstarred });
    }
    exit_selection_mode();
  }, [get_selected_emails, actions, update_email, exit_selection_mode]);

  const handle_bulk_toggle_read = useCallback(async () => {
    const emails = get_selected_emails();

    if (emails.length === 0) return;
    const any_unread = emails.some((e) => !e.is_read);

    await actions.bulk_mark_read(emails, any_unread);
    for (const email of emails) {
      update_email(email.id, { is_read: any_unread });
    }
    exit_selection_mode();
  }, [get_selected_emails, actions, update_email, exit_selection_mode]);

  const handle_archive = useCallback(
    async (email: InboxEmail) => {
      await actions.archive_email(email);
      remove_email(email.id);
    },
    [actions, remove_email],
  );

  const handle_delete = useCallback(
    async (email: InboxEmail) => {
      if (is_trash_view) {
        remove_email(email.id);
        await actions.permanently_delete(email);
      } else {
        await actions.delete_email(email);
        remove_email(email.id);
      }
    },
    [actions, remove_email, is_trash_view],
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
      await actions.toggle_read(email);
      update_email(email.id, { is_read: !email.is_read });
    },
    [actions, update_email],
  );

  const handle_snooze = useCallback(async (email: InboxEmail) => {
    set_snooze_email_target(email);
  }, []);

  const handle_mark_spam = useCallback(
    async (email: InboxEmail) => {
      await actions.mark_as_spam(email);
      remove_email(email.id);
    },
    [actions, remove_email],
  );

  const handle_snooze_select = useCallback(
    async (snoozed_until: Date) => {
      if (!snooze_email_target) return;
      try {
        await snooze_actions.snooze(snooze_email_target.id, snoozed_until);
        remove_email(snooze_email_target.id);
        set_snooze_email_target(null);
      } catch (err) {
        if (import.meta.env.DEV) console.error("failed to snooze email", err);
      }
    },
    [snooze_actions, snooze_email_target, remove_email],
  );

  const handle_load_more = useCallback(() => {
    if (is_drafts_view) {
      if (drafts_state.has_more) refresh_drafts();

      return;
    }
    if (mail_state.has_more && !mail_state.is_loading_more) {
      load_more();
    }
  }, [
    is_drafts_view,
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
    if (new_email_count > 0) {
      load_new_emails();
    } else {
      refresh();
    }
  }, [
    is_drafts_view,
    new_email_count,
    load_new_emails,
    refresh,
    refresh_drafts,
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
        adjust_trash_count(-trash_count);
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
              {new_email_count > 0 && (
                <button
                  className="rounded-full px-2.5 py-1 text-[13px] font-medium text-[var(--accent-color,#3b82f6)]"
                  type="button"
                  onClick={load_new_emails}
                >
                  {t("common.n_new", { count: new_email_count })}
                </button>
              )}
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
              className="mt-3 rounded-full bg-[var(--accent-color,#3b82f6)] px-5 py-2 text-[13px] font-medium text-white"
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
            is_drafts_view ? drafts_state.has_more : mail_state.has_more
          }
          is_loading={
            is_drafts_view ? drafts_state.is_loading : mail_state.is_loading
          }
          is_loading_more={is_drafts_view ? false : mail_state.is_loading_more}
          is_refreshing={is_refreshing}
          on_archive={is_drafts_view ? undefined : handle_archive}
          on_delete={handle_delete}
          on_drag_select={selection_mode ? handle_drag_select : undefined}
          on_email_press={handle_email_press}
          on_load_more={handle_load_more}
          on_long_press={handle_long_press}
          on_mark_spam={is_drafts_view ? undefined : handle_mark_spam}
          on_refresh={handle_refresh}
          on_snooze={handle_snooze}
          on_toggle_read={is_drafts_view ? undefined : handle_toggle_read}
          on_toggle_star={is_drafts_view ? undefined : handle_toggle_star}
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
          <button
            className="flex flex-1 flex-col items-center gap-1 py-3 text-[var(--text-secondary)] active:text-[var(--text-primary)]"
            type="button"
            onClick={handle_bulk_archive}
          >
            <ArchiveBoxIcon className="h-5 w-5" />
            <span className="text-[11px]">{t("mail.archive")}</span>
          </button>
          <button
            className="flex flex-1 flex-col items-center gap-1 py-3 text-[var(--text-secondary)] active:text-[var(--text-primary)]"
            type="button"
            onClick={handle_bulk_delete}
          >
            <TrashIcon className="h-5 w-5" />
            <span className="text-[11px]">{t("common.delete")}</span>
          </button>
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
        </div>
      )}

      <EmptyTrashModal
        is_emptying={is_emptying_trash}
        on_cancel={() => set_show_empty_trash_dialog(false)}
        on_confirm={confirm_empty_trash}
        show={show_empty_trash_dialog}
        trash_count={active_emails.length}
      />

      <MobileBottomSheet
        is_open={!!snooze_email_target}
        on_close={() => set_snooze_email_target(null)}
      >
        <div className="px-4 pb-4">
          <h3 className="mb-3 text-[16px] font-semibold text-[var(--text-primary)]">
            {t("mail.snooze")}
          </h3>
          <div className="space-y-1">
            {[
              {
                label: t("common.later_today"),
                date: addHours(new Date(), 4),
              },
              {
                label: t("common.tomorrow"),
                date: setMinutes(setHours(addDays(new Date(), 1), 9), 0),
              },
              {
                label: t("common.this_weekend"),
                date: setMinutes(setHours(nextSaturday(new Date()), 9), 0),
              },
              {
                label: t("common.next_week"),
                date: setMinutes(setHours(nextMonday(new Date()), 9), 0),
              },
            ].map((opt) => (
              <button
                key={opt.label}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left active:bg-[var(--bg-tertiary)]"
                type="button"
                onClick={() => handle_snooze_select(opt.date)}
              >
                <BellSnoozeIcon className="h-5 w-5 text-[var(--text-muted)]" />
                <div className="flex-1">
                  <p className="text-[14px] font-medium text-[var(--text-primary)]">
                    {opt.label}
                  </p>
                  <p className="text-[12px] text-[var(--text-muted)]">
                    {format(opt.date, "EEE, MMM d 'at' h:mm a")}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </MobileBottomSheet>
    </div>
  );
}

export default MobileInbox;
