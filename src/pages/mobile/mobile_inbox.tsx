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

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
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
  BellSnoozeIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

import { use_email_list } from "@/hooks/use_email_list";
import { use_drafts_list, type DraftListItem } from "@/hooks/use_drafts_list";
import { use_scheduled_emails } from "@/hooks/use_scheduled_emails";
import { reschedule_email, send_scheduled_now } from "@/services/api/scheduled";
import { emit_scheduled_changed } from "@/hooks/mail_events";
import { SchedulePicker } from "@/components/compose/schedule_picker";
import { format_datetime_hint } from "@/utils/date_format";
import { compute_snooze_target } from "@/utils/snooze_targets";
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
import {
  ConfirmModal,
  EmptyTrashModal,
} from "@/components/email/inbox/inbox_confirmation_dialog";
import { use_settled_not_found } from "@/components/email/inbox/use_settled_not_found";
import { use_spam_confirm } from "@/components/email/use_spam_confirm";
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
    cancel_email: cancel_scheduled_email,
  } = use_scheduled_emails(is_scheduled_view);

  const actions = use_email_actions();
  const snooze_actions = use_snooze();
  const { request_spam, spam_confirm_dialog } = use_spam_confirm();
  const { get_tag_by_token, state: tags_state } = use_tags();
  const { get_folder_by_token, state: folders_state } = use_folders();
  const [active_filter, set_active_filter] = useState<InboxFilterType>("all");
  const [selection_mode, set_selection_mode] = useState(false);
  const [selected_ids, set_selected_ids] = useState<Set<string>>(new Set());
  const [is_refreshing, set_is_refreshing] = useState(false);
  const refresh_timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (refresh_timer_ref.current !== null) {
        clearTimeout(refresh_timer_ref.current);
      }
    },
    [],
  );
  const [snooze_email_target, set_snooze_email_target] =
    useState<InboxEmail | null>(null);
  const [scheduled_target_id, set_scheduled_target_id] = useState<
    string | null
  >(null);
  const [show_empty_trash_dialog, set_show_empty_trash_dialog] =
    useState(false);
  const [permanent_delete_target, set_permanent_delete_target] = useState<
    InboxEmail[] | null
  >(null);
  const [is_emptying_trash, set_is_emptying_trash] = useState(false);

  const is_trash_view = current_view === "trash";
  const is_spam_view = current_view === "spam";
  const is_snoozed_view = current_view === "snoozed";

  useEffect(() => {
    on_selection_mode_change?.(selection_mode);
  }, [selection_mode, on_selection_mode_change]);

  const active_emails = is_drafts_view
    ? (drafts_state.drafts as InboxEmail[])
    : is_scheduled_view
      ? (scheduled_state.emails as InboxEmail[])
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
    set_selected_ids(new Set(all_visible_emails.map((e) => e.id)));
  }, [all_visible_emails]);

  const handle_email_press = useCallback(
    (id: string) => {
      if (selection_mode) {
        handle_toggle_select(id);

        return;
      }
      if (is_scheduled_view) {
        set_scheduled_target_id(id);

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

  const bulk_action_ref = useRef(false);
  const [bulk_action_busy, set_bulk_action_busy] = useState(false);

  const run_bulk_action = useCallback(
    async (action: () => Promise<void>): Promise<void> => {
      if (bulk_action_ref.current) return;

      bulk_action_ref.current = true;
      set_bulk_action_busy(true);

      try {
        await action();
      } finally {
        bulk_action_ref.current = false;
        set_bulk_action_busy(false);
      }
    },
    [],
  );

  const is_archive_view = current_view === "archive";

  const handle_bulk_archive = useCallback(async () => {
    await run_bulk_action(async () => {
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
    });
  }, [
    get_selected_emails,
    actions,
    remove_email,
    exit_selection_mode,
    is_archive_view,
    t,
    run_bulk_action,
  ]);

  const run_permanent_delete = useCallback(
    async (emails: InboxEmail[]) => {
      let failed = 0;

      for (const email of emails) {
        const deleted = await actions.permanently_delete(email);

        if (deleted) {
          remove_email(email.id);
        } else {
          failed += 1;
        }
      }

      if (failed > 0) {
        show_toast(t("common.failed_to_permanently_delete"), "error");
      }
    },
    [actions, remove_email, t],
  );

  const handle_bulk_delete = useCallback(async () => {
    await run_bulk_action(async () => {
      const emails = get_selected_emails();

      if (emails.length === 0) return;
      haptic_impact("medium");

      if (is_drafts_view) {
        schedule_delete_drafts(emails.map((email) => email.id));
        exit_selection_mode();

        return;
      }

      if (is_scheduled_view) {
        let failed = 0;

        for (const email of emails) {
          const cancelled = await cancel_scheduled_email(email.id);

          if (!cancelled) failed += 1;
        }

        if (failed > 0) {
          show_toast(t("common.failed_to_delete_emails"), "error");
        }
        exit_selection_mode();

        return;
      }

      if (is_trash_view) {
        set_permanent_delete_target(emails);

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
    });
  }, [
    get_selected_emails,
    actions,
    remove_email,
    exit_selection_mode,
    is_trash_view,
    is_drafts_view,
    is_scheduled_view,
    schedule_delete_drafts,
    cancel_scheduled_email,
    t,
    run_bulk_action,
  ]);

  const handle_bulk_unmark_spam = useCallback(async () => {
    await run_bulk_action(async () => {
      const emails = get_selected_emails();

      if (emails.length === 0) return;
      haptic_impact("medium");
      const ok = await actions.bulk_unmark_spam(emails);

      if (ok) {
        for (const email of emails) {
          remove_email(email.id);
        }
      } else {
        show_toast(t("common.failed_to_move_email"), "error");
      }
      exit_selection_mode();
    });
  }, [
    get_selected_emails,
    actions,
    remove_email,
    exit_selection_mode,
    t,
    run_bulk_action,
  ]);

  const confirm_permanent_delete = useCallback(async () => {
    const targets = permanent_delete_target;

    if (!targets) return;
    set_permanent_delete_target(null);
    await run_permanent_delete(targets);
    exit_selection_mode();
  }, [permanent_delete_target, run_permanent_delete, exit_selection_mode]);

  const handle_bulk_toggle_star = useCallback(async () => {
    await run_bulk_action(async () => {
      const emails = get_selected_emails();

      if (emails.length === 0) return;
      const any_unstarred = emails.some((e) => !e.is_starred);

      await actions.bulk_star(emails, any_unstarred);
      exit_selection_mode();
    });
  }, [get_selected_emails, actions, exit_selection_mode, run_bulk_action]);

  const handle_bulk_toggle_read = useCallback(async () => {
    await run_bulk_action(async () => {
      const emails = get_selected_emails();

      if (emails.length === 0) return;
      const any_unread = emails.some((e) => !e.is_read);

      await actions.bulk_mark_read(emails, any_unread);
      exit_selection_mode();
    });
  }, [get_selected_emails, actions, exit_selection_mode, run_bulk_action]);

  const handle_archive = useCallback(
    async (email: InboxEmail) => {
      const success = email.is_archived
        ? await actions.unarchive_email(email)
        : await actions.archive_email(email);

      if (success) {
        remove_email(email.id);

        return;
      }

      show_toast(
        email.is_archived
          ? t("common.failed_to_unarchive_emails")
          : t("common.failed_to_archive_emails"),
        "error",
      );
    },
    [actions, remove_email, t],
  );

  const handle_delete = useCallback(
    async (email: InboxEmail) => {
      if (is_drafts_view) {
        schedule_delete_drafts([email.id]);

        return;
      }

      if (is_scheduled_view) {
        const cancelled = await cancel_scheduled_email(email.id);

        if (!cancelled) {
          show_toast(t("common.failed_to_delete_emails"), "error");
        }

        return;
      }

      if (is_trash_view) {
        set_permanent_delete_target([email]);
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
      is_drafts_view,
      is_scheduled_view,
      schedule_delete_drafts,
      cancel_scheduled_email,
      t,
    ],
  );

  const handle_toggle_star = useCallback(
    async (email: InboxEmail) => {
      update_email(email.id, { is_starred: !email.is_starred });

      const succeeded = await actions.toggle_star(email);

      if (!succeeded) {
        update_email(email.id, { is_starred: email.is_starred });
        show_toast(t("common.something_went_wrong"), "error");
      }
    },
    [actions, update_email, t],
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

  const handle_snooze = useCallback(
    async (email: InboxEmail) => {
      if (!is_snoozed_view) {
        set_snooze_email_target(email);

        return;
      }

      try {
        await snooze_actions.unsnooze_mail(email.id);
        remove_email(email.id);
        show_toast(t("common.email_unsnoozed"), "success");
      } catch (err) {
        if (import.meta.env.DEV) console.error("failed to unsnooze email", err);
        show_toast(t("errors.failed_to_unsnooze_email"), "error");
      }
    },
    [is_snoozed_view, snooze_actions, remove_email, t],
  );

  const handle_mark_spam = useCallback(
    (email: InboxEmail) => {
      if (is_spam_view) {
        void (async () => {
          const success = await actions.unmark_spam(email);

          if (success) {
            remove_email(email.id);

            return;
          }

          show_toast(t("common.failed_to_move_email"), "error");
        })();

        return;
      }

      request_spam(async () => {
        const success = await actions.mark_as_spam(email);

        if (success) {
          remove_email(email.id);

          return;
        }

        show_toast(t("common.failed_to_mark_as_spam"), "error");
      });
    },
    [actions, remove_email, request_spam, is_spam_view, t],
  );

  const handle_snooze_select = useCallback(
    async (snoozed_until: Date) => {
      if (!snooze_email_target) return;
      const target_id = snooze_email_target.id;

      set_snooze_email_target(null);
      try {
        await snooze_actions.snooze(target_id, snoozed_until);
        remove_email(target_id);
        show_toast(t("common.email_snoozed"), "success");
      } catch (err) {
        if (import.meta.env.DEV) console.error("failed to snooze email", err);
        show_toast(t("errors.failed_to_snooze"), "error");
      }
    },
    [snooze_actions, snooze_email_target, remove_email, t],
  );

  const scheduled_target = useMemo(
    () =>
      scheduled_target_id
        ? (scheduled_state.emails.find((e) => e.id === scheduled_target_id) ??
          null)
        : null,
    [scheduled_target_id, scheduled_state.emails],
  );

  const handle_scheduled_send_now = useCallback(async () => {
    if (!scheduled_target_id) return;
    const target_id = scheduled_target_id;

    set_scheduled_target_id(null);
    const response = await send_scheduled_now(target_id);

    if (response.error) {
      show_toast(response.error || t("common.something_went_wrong"), "error");

      return;
    }
    show_toast(t("common.email_sent_successfully"), "success");
    emit_scheduled_changed({ action: "sent", email_id: target_id });
    refresh_scheduled();
  }, [scheduled_target_id, refresh_scheduled, t]);

  const handle_scheduled_cancel = useCallback(async () => {
    if (!scheduled_target_id) return;
    const target_id = scheduled_target_id;

    set_scheduled_target_id(null);
    const ok = await cancel_scheduled_email(target_id);

    if (!ok) {
      show_toast(t("common.something_went_wrong"), "error");

      return;
    }
    show_toast(t("common.scheduled_email_cancelled"), "success");
  }, [scheduled_target_id, cancel_scheduled_email, t]);

  const handle_scheduled_reschedule = useCallback(
    async (date: Date | null) => {
      if (!date || !scheduled_target_id) return;
      const target_id = scheduled_target_id;

      set_scheduled_target_id(null);
      const response = await reschedule_email(target_id, date.toISOString());

      if (response.error) {
        show_toast(response.error || t("common.something_went_wrong"), "error");

        return;
      }
      show_toast(t("common.send_time_updated"), "success");
      emit_scheduled_changed({ action: "updated", email_id: target_id });
      refresh_scheduled();
    },
    [scheduled_target_id, refresh_scheduled, t],
  );

  const handle_load_more = useCallback(() => {
    if (is_scheduled_view) return;
    if (is_drafts_view) {
      if (drafts_state.has_more) refresh_drafts();

      return;
    }
    if (mail_state.has_more && !mail_state.is_loading_more) {
      load_more();
    }
  }, [
    is_drafts_view,
    is_scheduled_view,
    drafts_state.has_more,
    mail_state,
    load_more,
    refresh_drafts,
  ]);

  const handle_refresh = useCallback(() => {
    set_is_refreshing(true);

    if (refresh_timer_ref.current !== null) {
      clearTimeout(refresh_timer_ref.current);
    }

    refresh_timer_ref.current = setTimeout(() => {
      refresh_timer_ref.current = null;
      set_is_refreshing(false);
    }, 1000);
    if (is_drafts_view) {
      refresh_drafts();

      return;
    }
    if (is_scheduled_view) {
      refresh_scheduled();

      return;
    }
    refresh();
  }, [
    is_drafts_view,
    is_scheduled_view,
    refresh,
    refresh_drafts,
    refresh_scheduled,
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

  const selected_emails = useMemo(
    () =>
      selection_mode ? active_emails.filter((e) => selected_ids.has(e.id)) : [],
    [selection_mode, active_emails, selected_ids],
  );

  const bulk_star_adds = selected_emails.some((e) => !e.is_starred);
  const bulk_read_marks_read = selected_emails.some((e) => !e.is_read);

  const scheduled_error_visible =
    is_scheduled_view &&
    Boolean(scheduled_state.error) &&
    !scheduled_state.is_loading;

  const drafts_error_visible =
    is_drafts_view && Boolean(drafts_state.error) && !drafts_state.is_loading;

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
                    <span className="w-4 me-2">
                      {active_filter === "all" && (
                        <CheckIcon className="w-4 h-4" />
                      )}
                    </span>
                    {t("mail.all_emails")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => set_active_filter("unread")}>
                    <span className="w-4 me-2">
                      {active_filter === "unread" && (
                        <CheckIcon className="w-4 h-4" />
                      )}
                    </span>
                    {t("mail.unread_only")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => set_active_filter("read")}>
                    <span className="w-4 me-2">
                      {active_filter === "read" && (
                        <CheckIcon className="w-4 h-4" />
                      )}
                    </span>
                    {t("mail.read_only")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => set_active_filter("attachments")}
                  >
                    <span className="w-4 me-2">
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

      {!folder_not_found && !tag_not_found && scheduled_error_visible && (
        <div className="flex flex-col items-center justify-center flex-1 px-4 py-20">
          <ExclamationTriangleIcon
            className="w-12 h-12 mb-4 text-txt-muted"
            strokeWidth={1}
          />
          <p className="text-sm font-medium text-txt-primary mb-1">
            {scheduled_state.error}
          </p>
          <button
            className="mt-3 rounded-full bg-[var(--accent-color,#3b82f6)] px-5 py-2 text-[13px] font-medium text-[var(--accent-fg,#ffffff)]"
            type="button"
            onClick={refresh_scheduled}
          >
            {t("common.retry")}
          </button>
        </div>
      )}

      {!folder_not_found && !tag_not_found && drafts_error_visible && (
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

      {!folder_not_found &&
        !tag_not_found &&
        !scheduled_error_visible &&
        !drafts_error_visible && (
          <MobileEmailList
            current_view={current_view}
            emails={enriched_unpinned}
            has_initial_load={
              is_drafts_view
                ? !drafts_state.is_loading
                : is_scheduled_view
                  ? !scheduled_state.is_loading
                  : mail_state.has_initial_load
            }
            has_load_error={
              is_drafts_view
                ? Boolean(drafts_state.error)
                : is_scheduled_view
                  ? Boolean(scheduled_state.error)
                  : mail_state.has_load_error
            }
            has_more={
              is_drafts_view
                ? drafts_state.has_more
                : is_scheduled_view
                  ? false
                  : mail_state.has_more
            }
            is_loading={
              is_drafts_view
                ? drafts_state.is_loading
                : is_scheduled_view
                  ? scheduled_state.is_loading
                  : mail_state.is_loading
            }
            is_loading_more={
              is_drafts_view || is_scheduled_view
                ? false
                : mail_state.is_loading_more
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
            on_snooze={
              is_drafts_view ||
              is_scheduled_view ||
              is_trash_view ||
              is_spam_view
                ? undefined
                : handle_snooze
            }
            on_toggle_read={
              is_drafts_view || is_scheduled_view
                ? undefined
                : handle_toggle_read
            }
            on_toggle_star={
              is_drafts_view || is_scheduled_view
                ? undefined
                : handle_toggle_star
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
          {!is_drafts_view && !is_scheduled_view && is_spam_view && (
            <button
              className="flex flex-1 flex-col items-center gap-1 py-3 text-[var(--text-secondary)] active:text-[var(--text-primary)] disabled:opacity-50"
              disabled={bulk_action_busy}
              type="button"
              onClick={handle_bulk_unmark_spam}
            >
              <InboxIcon className="h-5 w-5" />
              <span className="text-[11px]">{t("mail.not_spam")}</span>
            </button>
          )}
          {!is_drafts_view && !is_scheduled_view && !is_spam_view && (
            <button
              className="flex flex-1 flex-col items-center gap-1 py-3 text-[var(--text-secondary)] active:text-[var(--text-primary)] disabled:opacity-50"
              disabled={bulk_action_busy}
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
            className="flex flex-1 flex-col items-center gap-1 py-3 text-[var(--text-secondary)] active:text-[var(--text-primary)] disabled:opacity-50"
            disabled={bulk_action_busy}
            type="button"
            onClick={handle_bulk_delete}
          >
            <TrashIcon className="h-5 w-5" />
            <span className="text-[11px]">{t("common.delete")}</span>
          </button>
          {!is_drafts_view && !is_scheduled_view && (
            <button
              className="flex flex-1 flex-col items-center gap-1 py-3 text-[var(--text-secondary)] active:text-[var(--text-primary)] disabled:opacity-50"
              disabled={bulk_action_busy}
              type="button"
              onClick={handle_bulk_toggle_star}
            >
              <StarIcon className="h-5 w-5" />
              <span className="text-[11px]">
                {bulk_star_adds ? t("mail.star") : t("mail.unstar")}
              </span>
            </button>
          )}
          {!is_drafts_view && !is_scheduled_view && (
            <button
              className="flex flex-1 flex-col items-center gap-1 py-3 text-[var(--text-secondary)] active:text-[var(--text-primary)] disabled:opacity-50"
              disabled={bulk_action_busy}
              type="button"
              onClick={handle_bulk_toggle_read}
            >
              <EnvelopeOpenIcon className="h-5 w-5" />
              <span className="text-[11px]">
                {bulk_read_marks_read
                  ? t("mail.mark_as_read")
                  : t("mail.mark_as_unread")}
              </span>
            </button>
          )}
        </div>
      )}

      <ConfirmModal
        hide_dont_ask
        confirm_text={t("mail.delete_permanently")}
        confirm_variant="destructive"
        description={t("common.action_cannot_be_undone")}
        dont_ask={false}
        on_cancel={() => set_permanent_delete_target(null)}
        on_confirm={() => void confirm_permanent_delete()}
        on_dont_ask_change={() => undefined}
        show={!!permanent_delete_target}
        title={t("mail.delete_permanently_question")}
      />

      <EmptyTrashModal
        is_emptying={is_emptying_trash}
        on_cancel={() => set_show_empty_trash_dialog(false)}
        on_confirm={confirm_empty_trash}
        show={show_empty_trash_dialog}
        trash_count={active_emails.length}
      />

      <MobileBottomSheet
        aria_label={t("mail.snooze")}
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
                date: compute_snooze_target("later_today"),
              },
              {
                label: t("common.tomorrow"),
                date: compute_snooze_target("tomorrow"),
              },
              {
                label: t("common.this_weekend"),
                date: compute_snooze_target("this_weekend"),
              },
              {
                label: t("common.next_week"),
                date: compute_snooze_target("next_week"),
              },
            ].map((opt) => (
              <button
                key={opt.label}
                className="flex w-full items-center gap-3 rounded-[16px] px-3 py-3 text-start active:bg-[var(--bg-tertiary)]"
                type="button"
                onClick={() => handle_snooze_select(opt.date)}
              >
                <BellSnoozeIcon className="h-5 w-5 text-[var(--text-muted)]" />
                <div className="flex-1">
                  <p className="text-[14px] font-medium text-[var(--text-primary)]">
                    {opt.label}
                  </p>
                  <p className="text-[12px] text-[var(--text-muted)]">
                    {format_datetime_hint(opt.date, true)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </MobileBottomSheet>

      <MobileBottomSheet
        aria_label={t("mail.scheduled_send_failed")}
        is_open={!!scheduled_target}
        on_close={() => set_scheduled_target_id(null)}
      >
        <div className="px-4 pb-4">
          <h3 className="mb-1 text-[16px] font-semibold text-[var(--text-primary)]">
            {scheduled_target?.subject || t("mail.no_subject")}
          </h3>
          <p className="mb-3 text-[12px] text-[var(--text-muted)]">
            {scheduled_target
              ? format_datetime_hint(
                  new Date(scheduled_target.scheduled_at),
                  true,
                )
              : ""}
          </p>
          {scheduled_target?.status === "failed" && (
            <div className="mb-3 rounded-[12px] border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] text-danger">
              {t("mail.scheduled_send_failed")}
            </div>
          )}
          <div className="space-y-1">
            <button
              className="flex w-full items-center gap-3 rounded-[16px] px-3 py-3 text-start text-[14px] font-medium text-[var(--text-primary)] active:bg-[var(--bg-tertiary)]"
              type="button"
              onClick={handle_scheduled_send_now}
            >
              {t("common.send_now")}
            </button>
            {scheduled_target && (
              <SchedulePicker
                force_picker
                on_schedule={handle_scheduled_reschedule}
                scheduled_time={new Date(scheduled_target.scheduled_at)}
                tooltip_key="common.reschedule"
                trigger={
                  <button
                    className="flex w-full items-center gap-3 rounded-[16px] px-3 py-3 text-start text-[14px] font-medium text-[var(--text-primary)] active:bg-[var(--bg-tertiary)]"
                    type="button"
                  >
                    {t("common.reschedule")}
                  </button>
                }
              />
            )}
            <button
              className="flex w-full items-center gap-3 rounded-[16px] px-3 py-3 text-start text-[14px] font-medium text-[var(--color-error,#ef4444)] active:bg-[var(--bg-tertiary)]"
              type="button"
              onClick={handle_scheduled_cancel}
            >
              {t("common.cancel_scheduled")}
            </button>
          </div>
        </div>
      </MobileBottomSheet>

      {spam_confirm_dialog}
    </div>
  );
}

export default MobileInbox;
