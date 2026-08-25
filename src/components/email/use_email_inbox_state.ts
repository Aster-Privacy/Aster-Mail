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
import type { EmailInboxProps } from "@/components/email/inbox/inbox_types";

import {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
} from "react";

import { use_inbox_view_state } from "./use_inbox_view_state";

import {
  is_fully_built as is_category_index_built,
  is_index_settled,
} from "@/services/category_index";
import { use_category_drop } from "@/components/email/inbox/use_category_drop";
import { use_settled_empty_state } from "@/components/email/inbox/use_settled_empty_state";
import { builtin_category_def } from "@/data/category_catalog";
import { type BulkScopeFilter } from "@/services/api/mail";
import {
  filter_emails_by_view,
  apply_active_filter,
  should_recover_empty_view,
} from "@/components/email/inbox/inbox_view_helpers";
import { use_split_email_view } from "@/components/email/inbox/use_split_email_view";
import { use_split_pane } from "@/components/email/inbox/use_split_pane";
import { use_inbox_list_scroll } from "@/components/email/inbox/use_inbox_list_scroll";
import { use_inbox_keyboard } from "@/components/email/inbox/use_inbox_keyboard";
import { use_inbox_navigation } from "@/components/email/inbox/use_inbox_navigation";
import { use_inbox_selection } from "@/components/email/inbox/use_inbox_selection";
import { use_inbox_selection_menu } from "@/components/email/inbox/use_inbox_selection_menu";
import { use_inbox_bulk_actions } from "@/components/email/inbox/use_inbox_bulk_actions";

export type {
  ReplyData,
  ForwardData,
  DraftClickData,
  ScheduledClickData,
} from "@/components/email/inbox/inbox_types";

export function use_email_inbox_state(props: EmailInboxProps) {
  const {
    current_view,
    on_draft_click,
    on_scheduled_click,
    on_email_click,
    split_email_id,
    on_split_close,
    split_scheduled_data,
    on_split_scheduled_close,
    on_email_list_change,
    active_email_id,
    on_navigate_to,
  } = props;
  const {
    t,
    user,
    preferences,
    update_preference,
    mail_stats,
    folders_state,
    tags_state,
    current_page,
    set_current_page,
    page_size,
    categories,
    is_drafts_view,
    is_scheduled_view,
    is_snoozed_view,
    is_archive_view,
    spam_retention_days,
    family_policy,
    is_folder_view,
    folder_view_token,
    folders_loading_for_view,
    folder_not_found,
    is_tag_view,
    tag_view_token,
    tag_not_found,
    locked_folder,
    page_category_ref,
    fetch_page,
    is_page_cached,
    update_email,
    refresh_active_list,
    refresh_current_view,
    update_draft,
    scheduled_state,
    update_scheduled,
    manual_refresh_active,
    handle_snooze,
    handle_unsnooze,
    handle_category_change,
    email_state,
    handle_edit_thread_draft,
    folders_lookup,
    tags_lookup,
    toolbar,
    context_menu_actions,
  } = use_inbox_view_state(props);

  const [active_filter, set_active_filter] = useState<InboxFilterType>("all");
  const [is_paginating, set_is_paginating] = useState(false);
  const prev_view_ref_page = useRef(current_view);
  const prev_page_ref = useRef(current_page);
  const initial_page_synced = useRef(false);

  useEffect(() => {
    if (prev_view_ref_page.current !== current_view) {
      prev_view_ref_page.current = current_view;
      initial_page_synced.current = false;
      set_current_page(0);
    }
  }, [current_view, set_current_page]);

  const prev_category_ref = useRef(categories.active_category);

  useEffect(() => {
    if (prev_category_ref.current !== categories.active_category) {
      prev_category_ref.current = categories.active_category;
      set_current_page(0);
    }
    page_category_ref.current = categories.active_category;
  }, [categories.active_category, set_current_page]);

  const prev_initial_load_ref = useRef(false);

  useLayoutEffect(() => {
    const reloaded_from_reset =
      !prev_initial_load_ref.current && email_state.has_initial_load;

    prev_initial_load_ref.current = email_state.has_initial_load;
    if (!email_state.has_initial_load) return;

    if (
      reloaded_from_reset &&
      initial_page_synced.current &&
      current_page > 0
    ) {
      prev_page_ref.current = 0;
      set_current_page(0);

      return;
    }

    const page_changed = prev_page_ref.current !== current_page;

    prev_page_ref.current = current_page;
    if (!initial_page_synced.current || page_changed) {
      initial_page_synced.current = true;
      if (
        (current_page > 0 || page_changed) &&
        !is_drafts_view &&
        !is_scheduled_view &&
        !is_snoozed_view
      ) {
        const instant = is_page_cached(current_page, page_size);

        if (!instant) set_is_paginating(true);
        fetch_page(current_page, page_size, {
          force: true,
          silent: categories.enabled,
        }).finally(() => {
          if (!instant) set_is_paginating(false);
        });
      }
    }
  }, [
    email_state.has_initial_load,
    current_page,
    fetch_page,
    is_page_cached,
    is_drafts_view,
    is_scheduled_view,
    is_snoozed_view,
    page_size,
    set_current_page,
  ]);

  const [custom_snooze_email, set_custom_snooze_email] =
    useState<InboxEmail | null>(null);
  const [show_toolbar_custom_snooze, set_show_toolbar_custom_snooze] =
    useState(false);

  const enrich_email_folders = useCallback(
    (email: InboxEmail): InboxEmail => {
      if (!email.folders || email.folders.length === 0) return email;
      const enriched_folders = email.folders.map((folder) => {
        const full_data = folders_lookup.get(folder.folder_token);

        return full_data
          ? { ...folder, name: full_data.name, color: full_data.color }
          : folder;
      });

      return { ...email, folders: enriched_folders };
    },
    [folders_lookup],
  );

  const enrich_email_tags = useCallback(
    (email: InboxEmail): InboxEmail => {
      if (!email.tags || email.tags.length === 0) return email;
      const enriched_tags = email.tags.map((tag) => {
        const full_data = tags_lookup.get(tag.id);

        return full_data
          ? {
              ...tag,
              name: full_data.name,
              color: full_data.color,
              icon: full_data.icon,
            }
          : tag;
      });

      return { ...email, tags: enriched_tags };
    },
    [tags_lookup],
  );

  const view_filtered_emails = useMemo(
    () => filter_emails_by_view(email_state.emails, current_view),
    [email_state.emails, current_view],
  );
  const filtered_emails = useMemo(
    () =>
      apply_active_filter(view_filtered_emails, active_filter)
        .map(enrich_email_folders)
        .map(enrich_email_tags),
    [
      view_filtered_emails,
      active_filter,
      enrich_email_folders,
      enrich_email_tags,
    ],
  );
  const pinned_emails = useMemo(
    () => filtered_emails.filter((e) => e.is_pinned),
    [filtered_emails],
  );
  const all_primary_emails = useMemo(
    () => filtered_emails.filter((e) => !e.is_pinned),
    [filtered_emails],
  );
  const primary_emails = all_primary_emails;

  const handle_category_drop = use_category_drop({
    emails: filtered_emails,
    update_email,
    t,
  });

  const skeleton_pending =
    is_paginating ||
    (filtered_emails.length === 0 &&
      (folders_loading_for_view ||
        !email_state.has_initial_load ||
        email_state.is_loading));
  const empty_state_key = `${current_view}|${user?.id ?? ""}|${
    categories.enabled ? categories.active_category : ""
  }|${current_page}|${active_filter}`;
  const empty_state_settled =
    email_state.has_initial_load &&
    !email_state.is_loading &&
    !email_state.is_loading_more &&
    !is_paginating &&
    !folders_loading_for_view &&
    !manual_refresh_active &&
    (!categories.enabled || is_index_settled());
  const empty_state_visible = use_settled_empty_state({
    view_key: empty_state_key,
    is_empty: filtered_emails.length === 0,
    is_settled: empty_state_settled,
  });
  const skeleton_visible =
    !empty_state_visible && (skeleton_pending || filtered_emails.length === 0);

  const is_client_filtered = active_filter !== "all";
  const stats_total_for_view = useMemo(() => {
    switch (current_view) {
      case "inbox":
      case "":
        return mail_stats.inbox;
      case "sent":
        return mail_stats.sent;
      case "drafts":
        return mail_stats.drafts;
      case "scheduled":
        return mail_stats.scheduled;
      case "snoozed":
        return mail_stats.snoozed;
      case "starred":
        return mail_stats.starred;
      case "archive":
        return mail_stats.archived;
      case "spam":
        return mail_stats.spam;
      case "trash":
        return mail_stats.trash;
      case "all":
        return preferences.conversation_grouping !== false
          ? mail_stats.total_items_collapsed
          : mail_stats.total_items;
      default:
        return filtered_emails.length;
    }
  }, [
    current_view,
    mail_stats,
    filtered_emails.length,
    preferences.conversation_grouping,
  ]);

  const is_alias_view = current_view.startsWith("alias-");
  const effective_total_for_pages = is_client_filtered
    ? all_primary_emails.length
    : categories.enabled
      ? is_category_index_built()
        ? (categories.counts[categories.active_category]?.total ?? 0)
        : stats_total_for_view || 0
      : is_alias_view
        ? filtered_emails.length
        : Math.max(
            0,
            !email_state.has_load_error && email_state.total_messages > 0
              ? email_state.total_messages
              : stats_total_for_view || 0,
          );
  const total_pages = Math.max(
    1,
    Math.ceil(effective_total_for_pages / page_size),
  );

  const totals_authoritative = categories.enabled
    ? is_category_index_built()
    : email_state.has_initial_load && !email_state.is_loading;

  useEffect(() => {
    if (!totals_authoritative) return;
    if (effective_total_for_pages <= 0) return;
    if (current_page >= total_pages && total_pages > 0) {
      set_current_page(total_pages - 1);
    }
  }, [
    current_page,
    total_pages,
    set_current_page,
    totals_authoritative,
    effective_total_for_pages,
  ]);

  const empty_recovery_ref = useRef<{ view: string; attempts: number }>({
    view: current_view,
    attempts: 0,
  });

  useEffect(() => {
    if (empty_recovery_ref.current.view !== current_view) {
      empty_recovery_ref.current = { view: current_view, attempts: 0 };
    }
  }, [current_view]);

  useEffect(() => {
    const should_recover = should_recover_empty_view({
      categories_enabled: categories.enabled,
      is_client_filtered,
      is_alias_view,
      current_page,
      has_initial_load: email_state.has_initial_load,
      is_loading: email_state.is_loading,
      skeleton_visible: skeleton_pending,
      email_count: filtered_emails.length,
      effective_total: effective_total_for_pages,
      attempts: empty_recovery_ref.current.attempts,
    });

    if (!should_recover) return;

    empty_recovery_ref.current.attempts += 1;
    refresh_active_list();
  }, [
    categories.enabled,
    is_client_filtered,
    is_alias_view,
    current_page,
    email_state.has_initial_load,
    email_state.is_loading,
    skeleton_pending,
    filtered_emails.length,
    effective_total_for_pages,
    refresh_active_list,
  ]);

  const selection = use_inbox_selection({
    current_view,
    active_category: categories.enabled ? categories.active_category : "",
    is_drafts_view,
    is_scheduled_view,
    emails: email_state.emails,
    pinned_emails,
    primary_emails,
    update_email,
    update_draft: update_draft as (
      id: string,
      updates: Partial<InboxEmail>,
    ) => void,
    update_scheduled: update_scheduled as (
      id: string,
      updates: Partial<InboxEmail>,
    ) => void,
  });

  const scope_for_view = useMemo((): BulkScopeFilter | null => {
    if (is_folder_view) {
      return folder_view_token
        ? { label_token: folder_view_token, is_trashed: false, is_spam: false }
        : null;
    }

    if (is_tag_view) {
      return tag_view_token
        ? { tag_token: tag_view_token, is_trashed: false, is_spam: false }
        : null;
    }

    switch (current_view) {
      case "trash":
        return { is_trashed: true };
      case "spam":
        return { is_spam: true };
      case "archive":
        return { is_archived: true, is_trashed: false, is_spam: false };
      case "starred":
        return { is_starred: true, is_trashed: false, is_spam: false };
      case "snoozed":
        return { is_snoozed: true, is_trashed: false, is_spam: false };
      case "sent":
        return { item_type: "sent", is_trashed: false, is_spam: false };
      case "all":
        return { is_trashed: false, is_spam: false };
      case "":
      case "inbox":
        return {
          item_type: "received",
          is_archived: false,
          is_trashed: false,
          is_spam: false,
          is_snoozed: false,
        };
      default:
        return null;
    }
  }, [
    current_view,
    is_folder_view,
    folder_view_token,
    is_tag_view,
    tag_view_token,
  ]);

  const active_category_title = useMemo((): string | undefined => {
    if (!categories.enabled) return undefined;
    const id = categories.active_category;

    if (id === "primary") return undefined;

    const builtin = builtin_category_def(id);

    if (builtin) return t(builtin.label_key);

    return (preferences.custom_categories ?? []).find((c) => c.id === id)?.name;
  }, [
    categories.enabled,
    categories.active_category,
    preferences.custom_categories,
    t,
  ]);

  const bulk_actions = use_inbox_bulk_actions({
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
  });

  const {
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
    handle_folder_toggle_wrapped,
    handle_tag_toggle_wrapped,
    handle_snooze_wrapped,
  } = bulk_actions;

  const selection_menu = use_inbox_selection_menu({
    categories,
    selection,
    toolbar,
    bulk_actions,
    email_state,
    effective_total_for_pages,
    handle_category_drop,
    set_show_toolbar_custom_snooze,
  });

  const nav = use_inbox_navigation({
    current_view,
    emails: email_state.emails,
    scheduled_emails: scheduled_state.emails,
    pinned_emails,
    primary_emails,
    active_email_id,
    split_email_id,
    on_draft_click,
    on_scheduled_click,
    on_email_click,
    on_navigate_to,
    on_email_list_change,
  });

  const extra_keyboard_actions = useMemo(
    () => ({
      handle_open_snooze: (email: InboxEmail) => set_custom_snooze_email(email),
      handle_select: selection.handle_toggle_select,
      handle_select_all: selection.handle_toggle_select_all,
    }),
    [selection.handle_toggle_select, selection.handle_toggle_select_all],
  );

  const keyboard_context_menu_actions = useMemo(() => {
    const describe = (email: InboxEmail) => ({
      is_trash: current_view === "trash" || email.is_trashed,
      is_spam: current_view === "spam" || email.is_spam,
      is_archive: current_view === "archive" || email.is_archived,
    });

    return {
      ...context_menu_actions,
      handle_archive: (email: InboxEmail) => {
        const state = describe(email);

        if (state.is_archive) {
          void context_menu_actions.handle_move_to_inbox(email);

          return;
        }

        if (
          state.is_trash ||
          state.is_spam ||
          is_drafts_view ||
          is_scheduled_view
        ) {
          return;
        }

        context_menu_actions.handle_archive(email);
      },
      handle_spam: (email: InboxEmail) => {
        const state = describe(email);

        if (state.is_spam) {
          void context_menu_actions.handle_mark_not_spam(email);

          return;
        }

        if (state.is_trash || is_drafts_view || is_scheduled_view) return;

        context_menu_actions.handle_spam(email);
      },
    };
  }, [context_menu_actions, current_view, is_drafts_view, is_scheduled_view]);

  use_inbox_keyboard(
    email_state.emails,
    keyboard_context_menu_actions,
    extra_keyboard_actions,
  );

  const is_split_view = !!split_email_id || !!split_scheduled_data;
  const is_full_view_mode = preferences.email_view_mode === "fullpage";
  const show_full_email_viewer =
    is_full_view_mode && !!split_email_id && !split_scheduled_data;
  const {
    split_email_snoozed_until,
    split_email_grouped_ids,
    split_email_label_hints,
    handle_list_snooze,
    handle_list_unsnooze,
    list_tags,
    viewer_folders,
    handle_viewer_folder_toggle,
  } = use_split_email_view({
    split_email_id,
    email_state,
    filtered_emails,
    handle_snooze,
    handle_unsnooze,
    tags_state,
    folders_state,
    context_menu_actions,
  });

  const is_bottom_pane = preferences.reading_pane_position === "bottom";
  const split_pane = use_split_pane({
    is_split_view,
    is_bottom_pane,
    split_pane_width: preferences.split_pane_width,
    split_pane_height: preferences.split_pane_height,
    update_preference,
    on_split_close,
    on_split_scheduled_close,
  });

  const { handle_list_scroll, handle_page_change, handle_filter_change } =
    use_inbox_list_scroll({
      show_full_email_viewer,
      split_pane,
      current_page,
      page_size,
      is_page_cached,
      set_is_paginating,
      set_current_page,
      set_active_filter,
    });

  return {
    t,
    user,
    preferences,
    mail_stats,
    folders_state,
    tags_state,
    current_page,
    page_size,
    categories,
    is_drafts_view,
    is_scheduled_view,
    is_archive_view,
    spam_retention_days,
    family_policy,
    folder_not_found,
    tag_not_found,
    locked_folder,
    refresh_active_list,
    refresh_current_view,
    manual_refresh_active,
    handle_snooze,
    handle_category_change,
    email_state,
    handle_edit_thread_draft,
    toolbar,
    context_menu_actions,
    active_filter,
    custom_snooze_email,
    set_custom_snooze_email,
    show_toolbar_custom_snooze,
    set_show_toolbar_custom_snooze,
    filtered_emails,
    pinned_emails,
    primary_emails,
    handle_category_drop,
    empty_state_visible,
    skeleton_visible,
    effective_total_for_pages,
    total_pages,
    selection,
    scope_for_view,
    active_category_title,
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
    handle_folder_toggle_wrapped,
    handle_tag_toggle_wrapped,
    handle_snooze_wrapped,
    selection_menu,
    nav,
    is_split_view,
    is_full_view_mode,
    show_full_email_viewer,
    split_email_snoozed_until,
    split_email_grouped_ids,
    split_email_label_hints,
    handle_list_snooze,
    handle_list_unsnooze,
    list_tags,
    viewer_folders,
    handle_viewer_folder_toggle,
    is_bottom_pane,
    split_pane,
    handle_list_scroll,
    handle_page_change,
    handle_filter_change,
  };
}
