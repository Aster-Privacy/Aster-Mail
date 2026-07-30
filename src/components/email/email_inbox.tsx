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
import type { InboxEmail, InboxFilterType, EmailCategory } from "@/types/email";
import type { DraftWithContent } from "@/services/api/multi_drafts";
import type { EmailInboxProps } from "@/components/email/inbox/inbox_types";

import {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
} from "react";
import { useSearchParams } from "react-router-dom";

import { EmailListHeader } from "@/components/email/email_list_header";
import { build_reply_recipient } from "@/components/email/build_reply_recipient";
import {
  show_action_toast,
  update_progress_toast,
  hide_action_toast,
} from "@/components/toast/action_toast";
import { show_toast } from "@/components/toast/simple_toast";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_email_list } from "@/hooks/use_email_list";
import {
  RATCHET_UNDECRYPTABLE_SENTINEL,
  PGP_UNDECRYPTABLE_SENTINEL,
} from "@/utils/email_crypto";
import { use_drafts_list } from "@/hooks/use_drafts_list";
import { use_scheduled_emails } from "@/hooks/use_scheduled_emails";
import { use_snoozed_emails } from "@/hooks/use_snoozed_emails";
import { use_folders } from "@/hooks/use_folders";
import { use_tags } from "@/hooks/use_tags";
import { use_inbox_categories } from "@/hooks/use_inbox_categories";
import { use_category_inbox } from "@/hooks/use_category_inbox";
import { CategoryTabs } from "@/components/email/inbox/category_tabs";
import { CategoryEmptyState } from "@/components/email/inbox/category_empty_state";
import {
  set_message_category,
  remove_ids as remove_category_index_ids,
  reindex_ids as reindex_category_ids,
  is_fully_built as is_category_index_built,
} from "@/services/category_index";
import { run_category_scope_action } from "@/components/email/inbox/category_bulk_actions";
import { PROGRESS_THRESHOLDS } from "@/constants/batch_config";
import { category_for_tab } from "@/services/mail_categorizer";
import { is_folder_unlocked } from "@/hooks/use_protected_folder";
import { use_snooze } from "@/hooks/use_snooze";
import { use_mail_stats } from "@/hooks/use_mail_stats";
import { MAIL_EVENTS, mail_event_bus, on_mail_event } from "@/hooks/mail_events";
import { REFRESH_STATE_MS } from "@/constants/timings";
import {
  patch_all_view_caches,
  remove_ids_from_all_view_caches,
} from "@/hooks/email_list_cache";
import {
  bulk_action_by_scope,
  type BulkScopeAction,
  type BulkScopeFilter,
} from "@/services/api/mail";
import {
  await_preloaded_email,
  get_preloaded_email,
  preload_email_detail,
} from "@/components/email/hooks/preload_cache";
import { thread_imported_emails } from "@/services/import/repair_threads";
import { ErrorBoundary } from "@/components/ui/error_boundary";
import { SplitEmailViewer } from "@/components/email/split_email_viewer";
import { SplitScheduledViewer } from "@/components/scheduled/split_scheduled_viewer";
import { FullEmailViewer } from "@/components/email/full_email_viewer";
import { use_i18n } from "@/lib/i18n/context";
import {
  get_view_title,
  get_search_context,
  filter_emails_by_view,
  apply_active_filter,
  should_recover_empty_view,
} from "@/components/email/inbox/inbox_view_helpers";
import { use_context_menu_actions } from "@/components/email/inbox/inbox_context_menu_handler";
import { InboxDialogs } from "@/components/email/inbox/inbox_dialogs";
import { ConfirmModal } from "@/components/email/inbox/inbox_confirmation_dialog";
import {
  EmailList,
  LoadingState,
  EmptyState,
  FolderNotFoundState,
  TagNotFoundState,
  LockedFolderState,
} from "@/components/email/inbox/inbox_email_list";
import { BottomPagination } from "@/components/email/inbox/inbox_bottom_pagination";
import { StorageBanner } from "@/components/email/inbox/inbox_storage_banner";
import { TrashBanner } from "@/components/email/inbox/inbox_trash_banner";
import { get_spam_settings } from "@/services/api/preferences";
import { get_member_retention_policy } from "@/services/api/family_org";
import type { MemberRetentionPolicy } from "@/services/api/family_org";
import { use_split_pane } from "@/components/email/inbox/use_split_pane";
import { use_inbox_toolbar_actions } from "@/components/email/inbox/use_inbox_toolbar_actions";
import { use_inbox_keyboard } from "@/components/email/inbox/use_inbox_keyboard";
import { use_inbox_navigation } from "@/components/email/inbox/use_inbox_navigation";
import { use_inbox_selection } from "@/components/email/inbox/use_inbox_selection";
import { set_forward_mail_id } from "@/services/forward_store";
import { prewarm_search_index } from "@/hooks/use_search";

export type {
  ReplyData,
  ForwardData,
  DraftClickData,
  ScheduledClickData,
} from "@/components/email/inbox/inbox_types";

const noop_load_more = async (): Promise<void> => {};

export function EmailInbox({
  on_settings_click,
  on_quick_settings_click,
  current_view,
  on_compose,
  on_reply,
  on_forward,
  on_draft_click,
  on_scheduled_click,
  on_email_click,
  split_email_id,
  split_local_email,
  on_split_close,
  split_scheduled_data,
  on_split_scheduled_close,
  on_scheduled_edit,
  on_email_list_change,
  on_search_click,
  on_search_result_click,
  on_search_submit,
  focused_email_id,
  active_email_id,
  on_navigate_to,
  on_view_change,
}: EmailInboxProps): React.ReactElement {
  const { t } = use_i18n();
  const [search_params, set_search_params] = useSearchParams();
  const { user } = use_auth();
  const { preferences, update_preference, save_now } = use_preferences();
  const { stats: mail_stats } = use_mail_stats();
  const {
    state: folders_state,
    add_folder_to_email,
    remove_folder_from_email,
  } = use_folders();
  const {
    state: tags_state,
    add_tag_to_email,
    remove_tag_from_email,
  } = use_tags();

  const url_page = parseInt(search_params.get("page") || "1", 10);
  const current_page = Math.max(0, (isNaN(url_page) ? 1 : url_page) - 1);
  const set_current_page = useCallback(
    (page: number) => {
      const display_page = page + 1;

      set_search_params(
        (prev) => {
          const next = new URLSearchParams(prev);

          if (display_page <= 1) {
            next.delete("page");
          } else {
            next.set("page", String(display_page));
          }

          return next;
        },
        { replace: true },
      );
    },
    [set_search_params],
  );
  const page_size = 30;
  const categories = use_inbox_categories(current_view);

  const is_drafts_view = current_view === "drafts";
  const is_scheduled_view = current_view === "scheduled";
  const is_snoozed_view = current_view === "snoozed";
  const is_archive_view = current_view === "archive";
  const [folder_unlock_key, set_folder_unlock_key] = useState(0);
  const [spam_retention_days, set_spam_retention_days] = useState<
    number | null
  >(null);
  const [family_policy, set_family_policy] = useState<MemberRetentionPolicy | null>(null);

  useEffect(() => {
    get_spam_settings().then((result) => {
      if (result.data) {
        set_spam_retention_days(result.data.spam_retention_days);
      }
    });
    get_member_retention_policy().then((result) => {
      if (result.data) {
        set_family_policy(result.data);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user?.email) return;

    const idle = (
      window as unknown as {
        requestIdleCallback?: (cb: () => void) => number;
      }
    ).requestIdleCallback;
    const cancel_idle = (
      window as unknown as {
        cancelIdleCallback?: (handle: number) => void;
      }
    ).cancelIdleCallback;

    let timeout_id: ReturnType<typeof setTimeout> | null = null;
    let idle_id: number | null = null;

    const run = () => {
      void prewarm_search_index(user.email, preferences.search_encrypted_content);
    };

    if (idle) {
      idle_id = idle(run);
    } else {
      timeout_id = setTimeout(run, 2000);
    }

    return () => {
      if (idle_id !== null && cancel_idle) cancel_idle(idle_id);
      if (timeout_id !== null) clearTimeout(timeout_id);
    };
  }, [user?.email, preferences.search_encrypted_content]);

  useEffect(() => {
    if (current_view !== "trash" && current_view !== "spam") return;
    get_member_retention_policy().then((result) => {
      if (result.data) set_family_policy(result.data);
    }).catch(() => {});
  }, [current_view]);

  useEffect(() => {
    const handle_folders_changed = () => {
      set_folder_unlock_key((prev) => prev + 1);
    };

    window.addEventListener(
      MAIL_EVENTS.FOLDERS_CHANGED,
      handle_folders_changed,
    );

    return () => {
      window.removeEventListener(
        MAIL_EVENTS.FOLDERS_CHANGED,
        handle_folders_changed,
      );
    };
  }, []);

  const is_folder_view = current_view.startsWith("folder-");
  const folder_view_token = is_folder_view
    ? current_view.replace("folder-", "")
    : null;
  const current_folder = is_folder_view
    ? folders_state.folders.find((f) => f.folder_token === folder_view_token)
    : null;
  const folders_loading_for_view =
    is_folder_view && folders_state.is_loading && !current_folder;
  const folder_not_found =
    is_folder_view && !folders_state.is_loading && !current_folder;

  const is_tag_view = current_view.startsWith("tag-");
  const tag_view_token = is_tag_view ? current_view.replace("tag-", "") : null;
  const current_tag = is_tag_view
    ? tags_state.tags.find((t) => t.tag_token === tag_view_token)
    : null;
  const tag_not_found = is_tag_view && !tags_state.is_loading && !current_tag;

  const locked_folder = useMemo(() => {
    if (!current_folder) return null;
    if (
      current_folder.is_password_protected &&
      current_folder.password_set &&
      !is_folder_unlocked(current_folder.id)
    ) {
      return current_folder;
    }

    return null;
  }, [current_folder, folder_unlock_key]);

  const page_category_ref = useRef(categories.active_category);
  const category_page =
    page_category_ref.current === categories.active_category
      ? current_page
      : 0;

  const default_list = use_email_list(current_view);
  const category_list = use_category_inbox(
    categories.active_category,
    category_page,
    categories.enabled && categories.restored,
  );

  const prev_categories_enabled_ref = useRef(categories.enabled);
  const categories_just_disabled =
    prev_categories_enabled_ref.current &&
    !categories.enabled &&
    (current_view === "inbox" || current_view === "");
  prev_categories_enabled_ref.current = categories.enabled;

  const active_list = categories.enabled ? category_list : default_list;
  const {
    state: raw_mail_state,
    fetch_page,
    is_page_cached,
    load_more: load_more_active_list,
    update_email,
    remove_email,
    remove_emails,
    bulk_delete,
    bulk_archive,
    bulk_unarchive,
    refresh: refresh_active_list,
  } = active_list;

  const mail_state = useMemo(() => {
    if (categories_just_disabled) {
      return { ...raw_mail_state, emails: [], is_loading: true, has_initial_load: false };
    }
    return raw_mail_state;
  }, [categories_just_disabled, raw_mail_state]);
  const {
    state: drafts_state,
    update_draft,
    schedule_delete_drafts,
  } = use_drafts_list(is_drafts_view);
  const { state: scheduled_state, update_scheduled } =
    use_scheduled_emails(is_scheduled_view);
  const {
    state: snoozed_state,
    fetch_snoozed,
    unsnooze: unsnooze_snoozed,
  } = use_snoozed_emails();
  const {
    snooze: snooze_email_action,
    bulk_snooze: bulk_snooze_action,
    unsnooze_mail,
  } = use_snooze();

  useEffect(() => {
    if (is_snoozed_view) fetch_snoozed();
  }, [is_snoozed_view, fetch_snoozed]);

  const [manual_refresh_active, set_manual_refresh_active] = useState(false);

  useEffect(() => {
    let timeout_id: ReturnType<typeof setTimeout> | undefined;
    const handle_refresh_requested = () => {
      set_manual_refresh_active(true);
      clearTimeout(timeout_id);
      timeout_id = setTimeout(() => {
        set_manual_refresh_active(false);
      }, REFRESH_STATE_MS);
    };

    window.addEventListener(
      MAIL_EVENTS.REFRESH_REQUESTED,
      handle_refresh_requested,
    );

    return () => {
      window.removeEventListener(
        MAIL_EVENTS.REFRESH_REQUESTED,
        handle_refresh_requested,
      );
      clearTimeout(timeout_id);
    };
  }, []);

  useEffect(() => {
    const unsub = mail_event_bus.subscribe(MAIL_EVENTS.MAIL_CHANGED, () => {
      thread_imported_emails().catch((e) => {
        if (import.meta.env.DEV) console.error(e);
      });
    });

    return unsub;
  }, []);

  useEffect(() => {
    const unsub_updated = on_mail_event(
      MAIL_EVENTS.MAIL_ITEM_UPDATED,
      (detail) => patch_all_view_caches(detail),
    );
    const unsub_removed = on_mail_event(
      MAIL_EVENTS.MAIL_ITEMS_REMOVED,
      (detail) => remove_ids_from_all_view_caches(detail.ids),
    );

    return () => {
      unsub_updated();
      unsub_removed();
    };
  }, []);

  const handle_snooze = useCallback(
    async (email_id: string, snooze_until: Date) => {
      try {
        await snooze_email_action(email_id, snooze_until);
        update_email(email_id, { snoozed_until: snooze_until.toISOString() });
        if (categories.enabled) {
          remove_category_index_ids([email_id]);
        }
        show_action_toast({
          message: t("common.email_snoozed"),
          action_type: "snooze",
          email_ids: [email_id],
        });
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);
        show_toast(t("common.failed_to_snooze"), "error");
      }
    },
    [snooze_email_action, update_email, categories.enabled, t],
  );

  const handle_unsnooze = useCallback(
    async (email_id: string) => {
      try {
        if (is_snoozed_view) {
          await unsnooze_snoozed(email_id);
        } else {
          await unsnooze_mail(email_id);
          update_email(email_id, { snoozed_until: undefined });
        }
        reindex_category_ids([email_id]);
        show_action_toast({
          message: t("common.email_unsnoozed"),
          action_type: "snooze",
          email_ids: [email_id],
        });
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);
        show_toast(t("common.failed_to_unsnooze"), "error");
      }
    },
    [is_snoozed_view, unsnooze_snoozed, unsnooze_mail, update_email],
  );

  const handle_category_change = useCallback(
    async (email: InboxEmail, category: EmailCategory) => {
      if (category_for_tab(email.mail_category) === category) return;
      const ok = await set_message_category(email, category);

      if (ok) {
        update_email(email.id, { mail_category: category });
        show_toast(t("mail.moved_to_category"), "success");
      } else {
        show_toast(t("common.something_went_wrong"), "error");
      }
    },
    [update_email, t],
  );

  const raw_email_state = useMemo(() => {
    if (is_drafts_view) {
      return {
        emails: drafts_state.drafts as InboxEmail[],
        is_loading: drafts_state.is_loading,
        is_loading_more: false,
        total_messages: drafts_state.total_count,
        has_more: false,
        has_initial_load: !drafts_state.is_loading,
      };
    }
    if (is_scheduled_view) {
      return {
        emails: scheduled_state.emails as InboxEmail[],
        is_loading: scheduled_state.is_loading,
        is_loading_more: false,
        total_messages: scheduled_state.total_count,
        has_more: false,
        has_initial_load: !scheduled_state.is_loading,
      };
    }
    if (is_snoozed_view) {
      return {
        emails: snoozed_state.emails,
        is_loading: snoozed_state.is_loading,
        is_loading_more: false,
        total_messages: snoozed_state.total,
        has_more: false,
        has_initial_load: snoozed_state.has_loaded,
      };
    }

    return mail_state;
  }, [
    is_drafts_view,
    is_scheduled_view,
    is_snoozed_view,
    drafts_state,
    scheduled_state,
    snoozed_state,
    mail_state,
  ]);

  const email_state = raw_email_state;

  const open_compose = useCallback(
    (mode: "reply" | "forward", email: InboxEmail, safe_body: string) => {
      if (mode === "reply" && on_reply) {
        const is_own_message = email.item_type === "sent";
        const is_forwarded = !is_own_message && !!email.display_sender_email;
        const first_recipient = email.recipient_addresses?.[0];
        const { recipient_name, recipient_email } = build_reply_recipient(
          {
            sender_name: email.sender_name,
            sender_email: email.sender_email,
            first_to: first_recipient
              ? { name: "", email: first_recipient }
              : undefined,
            reply_to: email.reply_to
              ? { name: email.reply_to.name ?? "", email: email.reply_to.email }
              : undefined,
            reply_alias: is_forwarded
              ? { name: email.sender_name, email: email.sender_email }
              : undefined,
          },
          is_own_message,
        );

        on_reply({
          recipient_name,
          recipient_email,
          recipient_avatar: email.avatar_url,
          original_subject: email.subject,
          original_body: safe_body,
          original_timestamp: email.timestamp,
          thread_token: email.thread_token,
          original_email_id: email.id,
        });
      } else if (mode === "forward" && on_forward) {
        set_forward_mail_id(email.id);
        on_forward({
          sender_name: email.sender_name,
          sender_email: email.sender_email,
          sender_avatar: email.avatar_url || "/mail_logo.webp",
          email_subject: email.subject,
          email_body: safe_body,
          email_timestamp: email.timestamp,
          original_mail_id: email.id,
        });
      }
    },
    [on_reply, on_forward],
  );

  const handle_open_compose = useCallback(
    (mode: "reply" | "forward", email: InboxEmail) => {
      const is_sentinel = (value: string | undefined): boolean =>
        value === RATCHET_UNDECRYPTABLE_SENTINEL ||
        value === PGP_UNDECRYPTABLE_SENTINEL;
      const fallback_body =
        (is_sentinel(email.body_html) ? "" : email.body_html) ||
        (is_sentinel(email.preview) ? "" : email.preview) ||
        "";
      const cached_body = get_preloaded_email(email.id)?.email.body ?? "";

      if (!cached_body) {
        void (async () => {
          let resolved = fallback_body;

          try {
            await preload_email_detail(email.id, user?.email);

            const preloaded = await await_preloaded_email(email.id);
            const body = preloaded?.email.body ?? "";

            if (body && !is_sentinel(body)) resolved = body;
          } catch {
            resolved = fallback_body;
          }

          open_compose(mode, email, resolved);
        })();

        return;
      }

      open_compose(
        mode,
        email,
        is_sentinel(cached_body) ? fallback_body : cached_body,
      );
    },
    [open_compose, user?.email],
  );

  const handle_edit_thread_draft = useCallback(
    (draft: DraftWithContent) => {
      if (on_draft_click) {
        on_draft_click({
          id: draft.id,
          version: draft.version,
          draft_type: draft.draft_type,
          reply_to_id: draft.reply_to_id,
          forward_from_id: draft.forward_from_id,
          thread_token: draft.thread_token,
          to_recipients: draft.content.to_recipients,
          cc_recipients: draft.content.cc_recipients,
          bcc_recipients: draft.content.bcc_recipients,
          subject: draft.content.subject,
          message: draft.content.message,
          updated_at: draft.updated_at,
          attachments: draft.content.attachments,
        });
      }
    },
    [on_draft_click],
  );

  const folders_lookup = useMemo(() => {
    const lookup = new Map<string, { name: string; color?: string }>();

    for (const folder of folders_state.folders) {
      lookup.set(folder.folder_token, {
        name: folder.name,
        color: folder.color,
      });
    }

    return lookup;
  }, [folders_state.folders]);

  const tags_lookup = useMemo(() => {
    const lookup = new Map<
      string,
      { name: string; color?: string; icon?: string }
    >();

    for (const tag of tags_state.tags) {
      lookup.set(tag.tag_token, {
        name: tag.name,
        color: tag.color,
        icon: tag.icon,
      });
    }

    return lookup;
  }, [tags_state.tags]);

  const toolbar = use_inbox_toolbar_actions({
    t,
    current_view,
    email_state,
    get_selected_ids: (emails) =>
      emails.filter((e) => e.is_selected).map((e) => e.id),
    update_email,
    remove_email,
    remove_emails,
    bulk_delete,
    schedule_delete_drafts,
    bulk_archive,
    bulk_unarchive,
    bulk_snooze_action,
    folders_lookup,
    tags_lookup,
    preferences: {
      confirm_before_delete: preferences.confirm_before_delete,
      confirm_before_spam: preferences.confirm_before_spam,
      confirm_before_archive: preferences.confirm_before_archive,
    },
    update_preference,
    save_now,
    is_drafts_view,
    is_scheduled_view,
  });

  const context_menu_actions = use_context_menu_actions({
    t,
    current_view,
    emails: email_state.emails,
    update_email,
    remove_email,
    remove_emails,
    handle_open_compose,
    folders_lookup,
    tags_lookup,
    add_folder_to_email,
    remove_folder_from_email,
    add_tag_to_email,
    remove_tag_from_email,
    preferences: {
      confirm_before_delete: preferences.confirm_before_delete,
      confirm_before_spam: preferences.confirm_before_spam,
      confirm_before_archive: preferences.confirm_before_archive,
    },
    set_pending_delete_email: toolbar.set_pending_delete_email,
    set_show_single_delete_confirm: toolbar.set_show_single_delete_confirm,
    set_pending_spam_email: toolbar.set_pending_spam_email,
    set_show_single_spam_confirm: toolbar.set_show_single_spam_confirm,
    set_pending_archive_email: toolbar.set_pending_archive_email,
    set_show_single_archive_confirm: toolbar.set_show_single_archive_confirm,
    is_drafts_view,
    is_scheduled_view,
    schedule_delete_drafts,
  });

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
        fetch_page(current_page, page_size, true).finally(() => {
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

  const skeleton_visible =
    is_paginating ||
    (filtered_emails.length === 0 &&
      (folders_loading_for_view || !email_state.has_initial_load));

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
        return mail_stats.total_items;
      default:
        return filtered_emails.length;
    }
  }, [current_view, mail_stats, filtered_emails.length]);

  const is_alias_view = current_view.startsWith("alias-");
  const effective_total_for_pages = is_client_filtered
    ? all_primary_emails.length
    : categories.enabled
      ? (is_category_index_built()
          ? (categories.counts[categories.active_category]?.total ?? 0)
          : (stats_total_for_view || 0))
      : is_alias_view
        ? filtered_emails.length
        : Math.max(
            0,
            email_state.has_initial_load &&
            !email_state.is_loading &&
            !email_state.has_load_error
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
    if (current_page >= total_pages && total_pages > 0) {
      set_current_page(total_pages - 1);
    }
  }, [current_page, total_pages, set_current_page, totals_authoritative]);

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
      skeleton_visible,
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
    skeleton_visible,
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
    has_more: categories.enabled ? false : email_state.has_more,
    load_more: categories.enabled ? noop_load_more : load_more_active_list,
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

  const scope_for_view = useMemo((): BulkScopeFilter => {
    switch (current_view) {
      case "trash":
        return { is_trashed: true };
      case "spam":
        return { is_spam: true };
      case "archive":
        return { is_archived: true };
      case "starred":
        return { is_starred: true, is_trashed: false };
      case "snoozed":
        return { is_snoozed: true, is_trashed: false };
      case "sent":
        return { item_type: "sent", is_trashed: false };
      default:
        return { is_archived: false, is_trashed: false, is_spam: false };
    }
  }, [current_view]);

  const [pending_select_all_action, set_pending_select_all_action] = useState<
    (() => void) | null
  >(null);

  const queue_select_all_action = useCallback((action: () => void) => {
    set_pending_select_all_action(() => action);
  }, []);

  const run_category_bulk_action = useCallback(
    async (action: BulkScopeAction): Promise<boolean> => {
      let progress_toast_shown = false;

      try {
        const outcome = await run_category_scope_action(
          action,
          categories.active_category,
          {
            on_progress: (completed, total) => {
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

        return outcome !== "not_ready";
      } finally {
        if (progress_toast_shown) hide_action_toast();
      }
    },
    [categories.active_category, t],
  );

  const run_scope_action = useCallback(
    async (action: BulkScopeAction) => {
      try {
        if (categories.enabled) {
          const handled = await run_category_bulk_action(action);

          if (!handled) {
            show_toast(t("mail.bulk_action_index_not_ready"), "error");

            return;
          }
        } else {
          const res = await bulk_action_by_scope({
            action,
            scope: scope_for_view,
          });

          if (res.error) throw new Error(res.error);
        }
        selection.exit_select_all_mode();
        selection.handle_clear_selection();
        set_current_page(0);
        fetch_page(0, page_size);
        mail_event_bus.emit(MAIL_EVENTS.MAIL_CHANGED);
      } catch (e) {
        if (import.meta.env.DEV) console.error(e);
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
    }),
    [selection.handle_toggle_select],
  );

  use_inbox_keyboard(
    email_state.emails,
    context_menu_actions,
    extra_keyboard_actions,
  );

  const is_split_view = !!split_email_id || !!split_scheduled_data;
  const is_full_view_mode = preferences.email_view_mode === "fullpage";
  const show_full_email_viewer =
    is_full_view_mode && !!split_email_id && !split_scheduled_data;
  const split_email_snoozed_until = useMemo(() => {
    if (!split_email_id) return undefined;

    return email_state.emails.find((e) => e.id === split_email_id)
      ?.snoozed_until;
  }, [split_email_id, email_state.emails]);
  const split_email_grouped_ids = useMemo(() => {
    if (!split_email_id) return undefined;

    return email_state.emails.find((e) => e.id === split_email_id)
      ?.grouped_email_ids;
  }, [split_email_id, email_state.emails]);
  const split_email_label_hints = useMemo(() => {
    if (!split_email_id) return undefined;
    const found =
      filtered_emails.find((e) => e.id === split_email_id) ??
      email_state.emails.find((e) => e.id === split_email_id);

    if (!found) return undefined;
    const hints: {
      token: string;
      name: string;
      color?: string;
      icon?: string;
      show_icon?: boolean;
    }[] = [];

    for (const f of found.folders ?? []) {
      if (f.name)
        hints.push({
          token: f.folder_token,
          name: f.name,
          color: f.color,
          icon: f.icon,
          show_icon: true,
        });
    }
    for (const tag of found.tags ?? []) {
      if (tag.name)
        hints.push({
          token: tag.id,
          name: tag.name,
          color: tag.color,
          icon: tag.icon,
          show_icon: true,
        });
    }

    return hints.length > 0 ? hints : undefined;
  }, [split_email_id, filtered_emails, email_state.emails]);
  const viewer_folders = useMemo(
    () =>
      folders_state.folders
        .filter((f) => !f.is_system)
        .map((f) => ({
          id: f.folder_token,
          name: f.name,
          color: f.color || "#6366f1",
        })),
    [folders_state.folders],
  );
  const handle_viewer_folder_toggle = useCallback(
    (folder_id: string) => {
      if (!split_email_id) return;
      const email = email_state.emails.find((e) => e.id === split_email_id);

      if (email) {
        context_menu_actions.handle_folder_toggle(email, folder_id);
      }
    },
    [split_email_id, email_state.emails, context_menu_actions],
  );

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

  const list_scroll_top_ref = useRef(0);
  const handle_list_scroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>): void => {
      list_scroll_top_ref.current = e.currentTarget.scrollTop;
    },
    [],
  );

  useLayoutEffect(() => {
    if (show_full_email_viewer) return;
    const container = split_pane.list_scroll_ref.current;
    if (container && list_scroll_top_ref.current > 0) {
      container.scrollTop = list_scroll_top_ref.current;
    }
  }, [show_full_email_viewer, split_pane.list_scroll_ref]);

  const handle_page_change = useCallback(
    (page: number): void => {
      set_current_page(page);
      list_scroll_top_ref.current = 0;
      split_pane.list_panel_ref.current?.scrollTo(0, 0);
      split_pane.list_scroll_ref.current?.scrollTo(0, 0);
    },
    [set_current_page, split_pane.list_panel_ref, split_pane.list_scroll_ref],
  );
  const handle_filter_change = useCallback(
    (filter: InboxFilterType): void => {
      set_active_filter(filter);
      set_current_page(0);
    },
    [set_current_page],
  );

  const email_list_content = (
    <>
      {folder_not_found ? (
        <FolderNotFoundState />
      ) : tag_not_found ? (
        <TagNotFoundState />
      ) : locked_folder ? (
        <LockedFolderState
          folder_id={locked_folder.id}
          folder_name={locked_folder.name}
        />
      ) : !skeleton_visible &&
        filtered_emails.length === 0 &&
        email_state.has_initial_load ? (
        categories.enabled && !email_state.has_load_error ? (
          <CategoryEmptyState category={categories.active_category} />
        ) : (
          <EmptyState
            current_view={current_view}
            user_email={user?.email}
            has_load_error={email_state.has_load_error}
            on_retry={refresh_active_list}
          />
        )
      ) : (
        <div className="relative min-h-full">
          <div>
            {filtered_emails.length > 0 && (
              <EmailList
                categories_enabled={categories.enabled}
                current_view={current_view}
                density={preferences.density}
                focused_email_id={focused_email_id}
                on_category_change={handle_category_change}
                folders={folders_state.folders
                  .filter((f) => !f.is_system)
                  .map((f) => ({
                    id: f.folder_token,
                    name: f.name,
                    color: f.color || "#6366f1",
                  }))}
                on_archive={context_menu_actions.handle_archive}
                on_custom_snooze={(email) => set_custom_snooze_email(email)}
                on_delete={context_menu_actions.handle_delete}
                on_email_click={nav.handle_email_click}
                on_folder_toggle={context_menu_actions.handle_folder_toggle}
                on_forward={context_menu_actions.handle_forward}
                on_mark_not_spam={context_menu_actions.handle_mark_not_spam}
                on_move_to_inbox={context_menu_actions.handle_move_to_inbox}
                on_reply={context_menu_actions.handle_reply}
                on_restore={context_menu_actions.handle_restore}
                on_snooze={(email, snooze_until) =>
                  handle_snooze(email.id, snooze_until)
                }
                on_spam={context_menu_actions.handle_spam}
                on_tag_toggle={context_menu_actions.handle_tag_toggle}
                on_toggle_pin={context_menu_actions.handle_toggle_pin}
                on_toggle_read={context_menu_actions.handle_toggle_read}
                on_toggle_select={selection.handle_toggle_select}
                on_toggle_star={context_menu_actions.handle_toggle_star}
                on_unsnooze={(email) => handle_unsnooze(email.id)}
                pinned_emails={pinned_emails}
                primary_emails={primary_emails}
                selected_email_id={active_email_id ?? split_scheduled_data?.id}
                show_email_preview={
                  !is_split_view && preferences.show_email_preview
                }
                show_message_size={preferences.show_message_size}
                show_profile_pictures={preferences.show_profile_pictures}
                show_thread_count={preferences.conversation_grouping !== false}
                tags={tags_state.tags.map((t) => ({
                  tag_token: t.tag_token,
                  name: t.name,
                  color: t.color || "#6366f1",
                }))}
              />
            )}
            {!skeleton_visible &&
              filtered_emails.length > 0 &&
              total_pages > 1 && (
                <BottomPagination
                  current_page={current_page}
                  on_page_change={handle_page_change}
                  total_pages={total_pages}
                />
              )}
          </div>
          {(skeleton_visible ||
            manual_refresh_active ||
            (email_state.is_loading_more && primary_emails.length === 0)) && (
            <div className="absolute inset-0 z-10 bg-surf-primary">
              <LoadingState />
            </div>
          )}
        </div>
      )}
    </>
  );

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-full bg-surf-primary">
        <EmailListHeader
          active_filter={active_filter}
          all_selected={selection.all_selected}
          can_go_next={nav.local_can_go_next}
          can_go_prev={nav.local_can_go_prev}
          current_email_index={nav.local_email_index}
          current_page={current_page}
          display_count={
            current_view === "inbox" || current_view === ""
              ? categories.enabled
                ? categories.counts[categories.active_category]?.unread
                : mail_stats.unread
              : current_view === "drafts"
                ? mail_stats.drafts
                : current_view === "scheduled"
                  ? mail_stats.scheduled
                  : current_view === "snoozed"
                    ? mail_stats.snoozed
                    : current_view === "spam" || current_view === "trash"
                      ? effective_total_for_pages
                      : current_view.startsWith("alias-")
                        ? filtered_emails.filter((e) => !e.is_read).length
                        : undefined
          }
          filtered_count={effective_total_for_pages}
          folders={folders_state.folders
            .filter((f) => !f.is_system)
            .map((f) => ({
              folder_token: f.folder_token,
              name: f.name,
              color: f.color || "#6366f1",
              status: selection.get_folder_status_for_selection(
                f.folder_token,
              ),
            }))}
          is_archive_view={is_archive_view}
          is_drafts_view={is_drafts_view}
          is_scheduled_view={is_scheduled_view}
          is_spam_view={current_view === "spam"}
          is_trash_view={current_view === "trash"}
          on_activate_select_all_mode={selection.activate_select_all_mode}
          on_archive={handle_archive_wrapped}
          on_clear_selection={selection.handle_clear_selection}
          on_compose={on_compose}
          on_delete={handle_delete_wrapped}
          on_empty_spam={toolbar.handle_empty_spam}
          on_empty_trash={toolbar.handle_empty_trash}
          on_filter_change={handle_filter_change}
          on_folder_toggle={(folder_token) => {
            toolbar.handle_toolbar_toggle_folder(
              folder_token,
              selection.get_folder_status_for_selection(folder_token) === "all",
            );
          }}
          on_mark_read={handle_mark_read_wrapped}
          on_mark_unread={handle_mark_unread_wrapped}
          on_navigate_next={
            nav.effective_email_id ? nav.handle_local_navigate_next : undefined
          }
          on_navigate_prev={
            nav.effective_email_id ? nav.handle_local_navigate_prev : undefined
          }
          on_page_change={
            show_full_email_viewer || nav.effective_email_id
              ? undefined
              : handle_page_change
          }
          on_restore={handle_restore_wrapped}
          on_search_click={on_search_click}
          on_search_result_click={on_search_result_click}
          on_search_submit={on_search_submit}
          on_select_by_filter={selection.handle_select_by_filter}
          on_settings_click={on_settings_click}
          on_quick_settings_click={on_quick_settings_click}
          on_snooze={toolbar.handle_toolbar_snooze}
          on_spam={handle_spam_wrapped}
          on_tag_toggle={(tag_token) => {
            toolbar.handle_toolbar_toggle_tag(
              tag_token,
              selection.get_tag_status_for_selection(tag_token) === "all",
            );
          }}
          on_toggle_select_all={
            show_full_email_viewer
              ? undefined
              : selection.handle_toggle_select_all
          }
          on_toggle_star={handle_toggle_star_wrapped}
          on_unarchive={handle_unarchive_wrapped}
          on_view_change={on_view_change}
          page_selected_count={selection.selected_count}
          page_size={page_size}
          search_context={get_search_context(
            current_view,
            folders_state.folders,
            tags_state.tags,
          )}
          select_all_mode={selection.select_all_mode}
          selected_count={selection.selected_count}
          some_selected={selection.some_selected}
          spam_count={email_state.emails.filter((e) => e.is_spam).length}
          tags={tags_state.tags.map((t) => ({
            tag_token: t.tag_token,
            name: t.name,
            color: t.color || "#6366f1",
            status: selection.get_tag_status_for_selection(t.tag_token),
          }))}
          total_email_count={nav.visible_ids.length}
          total_messages={email_state.total_messages}
          trash_count={mail_stats.trash}
          view_title={get_view_title(
            current_view,
            folders_state.folders,
            tags_state.tags,
            t,
          )}
        />

        {categories.enabled &&
          categories.restored &&
          !show_full_email_viewer && (
            <CategoryTabs
              active_category={categories.active_category}
              counts={categories.counts}
              on_change={categories.set_active_category}
            />
          )}

        <StorageBanner
          on_settings_click={on_settings_click}
          storage_total_bytes={mail_stats.storage_total_bytes}
          storage_used_bytes={mail_stats.storage_used_bytes}
        />


        {(current_view === "trash" || current_view === "spam") &&
          !selection.some_selected &&
          !selection.all_selected && (() => {
            const is_trash = current_view === "trash";
            const family_enforced = !!family_policy?.enforce_on_members;
            let effective_days: number | null;
            let banner_family_enforced: boolean;
            if (is_trash) {
              if (family_enforced && family_policy?.trash_retention_days != null && family_policy.trash_retention_days > 0) {
                effective_days = family_policy.trash_retention_days;
                banner_family_enforced = true;
              } else {
                effective_days = null;
                banner_family_enforced = false;
              }
            } else {
              if (family_enforced && family_policy?.spam_retention_days != null && family_policy.spam_retention_days > 0) {
                effective_days = family_policy.spam_retention_days;
                banner_family_enforced = true;
              } else {
                effective_days = spam_retention_days;
                banner_family_enforced = false;
              }
            }
            return effective_days !== null && effective_days > 0 ? (
              <TrashBanner
                family_enforced={banner_family_enforced}
                retention_days={effective_days}
                view={current_view as "trash" | "spam"}
              />
            ) : null;
          })()}

        {show_full_email_viewer && split_email_id ? (
          <div className="flex-1 overflow-hidden">
            <FullEmailViewer
              email_id={split_email_id}
              folders={viewer_folders}
              grouped_email_ids={split_email_grouped_ids}
              label_hints={split_email_label_hints}
              local_email={split_local_email ?? undefined}
              on_back={on_split_close || (() => {})}
              on_edit_draft={handle_edit_thread_draft}
              on_folder_toggle={handle_viewer_folder_toggle}
              on_forward={on_forward}
              on_reply={on_reply}
              snoozed_until={split_email_snoozed_until}
            />
          </div>
        ) : is_split_view && !is_full_view_mode ? (
          <div
            className={`flex-1 flex min-h-0 ${is_bottom_pane ? "flex-col" : ""}`}
          >
            <div
              ref={split_pane.list_panel_ref}
              className="overflow-y-auto overflow-x-hidden relative"
              style={
                is_bottom_pane
                  ? {
                      height: split_pane.pane_height,
                      flexShrink: 0,
                      flexGrow: 0,
                      overflowAnchor: "none",
                    }
                  : {
                      width: split_pane.pane_width,
                      flexShrink: 0,
                      flexGrow: 0,
                      overflowAnchor: "none",
                    }
              }
            >
              {email_list_content}
            </div>
            <div
              className={`${is_bottom_pane ? "h-px cursor-row-resize" : "w-px cursor-col-resize"} relative hover:bg-blue-500 shrink-0 ${split_pane.is_dragging ? "bg-blue-500" : "bg-edge-primary"}`}
              role="presentation"
              onMouseDown={split_pane.handle_drag_start}
            >
              {is_bottom_pane ? (
                <div className="absolute inset-x-0 -top-1.5 -bottom-1.5" />
              ) : (
                <div className="absolute inset-y-0 -left-1.5 -right-1.5" />
              )}
            </div>
            <div
              ref={split_pane.detail_panel_ref}
              className="@container overflow-hidden relative"
              style={
                is_bottom_pane
                  ? { flex: 1, minHeight: 0 }
                  : { flex: 1, minWidth: 0 }
              }
            >
              {split_scheduled_data ? (
                <SplitScheduledViewer
                  on_close={on_split_scheduled_close || (() => {})}
                  on_edit={on_scheduled_edit}
                  scheduled_data={split_scheduled_data}
                />
              ) : split_email_id ? (
                <SplitEmailViewer
                  email_id={split_email_id}
                  folders={viewer_folders}
                  grouped_email_ids={split_email_grouped_ids}
                  label_hints={split_email_label_hints}
                  local_email={split_local_email ?? undefined}
                  on_close={on_split_close || (() => {})}
                  on_folder_toggle={handle_viewer_folder_toggle}
                  on_forward={on_forward}
                  on_reply={on_reply}
                  snoozed_until={split_email_snoozed_until}
                />
              ) : null}
            </div>
          </div>
        ) : (
          <div
            ref={split_pane.list_scroll_ref}
            className="flex-1 overflow-y-auto relative"
            style={{ overflowAnchor: "none" }}
            onScroll={handle_list_scroll}
          >
            {email_list_content}
          </div>
        )}

        <InboxDialogs
          cancel_archive={toolbar.cancel_archive}
          cancel_delete={toolbar.cancel_delete}
          cancel_empty_spam={toolbar.cancel_empty_spam}
          cancel_empty_trash={toolbar.cancel_empty_trash}
          cancel_single_archive={toolbar.cancel_single_archive}
          cancel_single_delete={toolbar.cancel_single_delete}
          cancel_single_spam={toolbar.cancel_single_spam}
          cancel_spam={toolbar.cancel_spam}
          confirm_archive={toolbar.confirm_archive}
          confirm_delete={toolbar.confirm_delete}
          confirm_empty_spam={toolbar.confirm_empty_spam}
          confirm_empty_trash={toolbar.confirm_empty_trash}
          confirm_single_archive={toolbar.confirm_single_archive}
          confirm_single_delete={toolbar.confirm_single_delete}
          confirm_single_spam={toolbar.confirm_single_spam}
          confirm_spam={toolbar.confirm_spam}
          confirmations={toolbar.confirmations}
          current_view={current_view}
          custom_snooze_open={
            custom_snooze_email !== null || show_toolbar_custom_snooze
          }
          dont_ask_archive={toolbar.dont_ask_archive}
          dont_ask_delete={toolbar.dont_ask_delete}
          dont_ask_single_archive={toolbar.dont_ask_single_archive}
          dont_ask_single_delete={toolbar.dont_ask_single_delete}
          dont_ask_single_spam={toolbar.dont_ask_single_spam}
          dont_ask_spam={toolbar.dont_ask_spam}
          is_emptying_spam={toolbar.is_emptying_spam}
          is_emptying_trash={toolbar.is_emptying_trash}
          on_custom_snooze={async (snooze_until) => {
            if (custom_snooze_email) {
              await handle_snooze(custom_snooze_email.id, snooze_until);
            } else if (show_toolbar_custom_snooze) {
              await toolbar.handle_toolbar_snooze(snooze_until);
            }
          }}
          on_custom_snooze_close={() => {
            set_custom_snooze_email(null);
            set_show_toolbar_custom_snooze(false);
          }}
          set_dont_ask_archive={toolbar.set_dont_ask_archive}
          set_dont_ask_delete={toolbar.set_dont_ask_delete}
          set_dont_ask_single_archive={toolbar.set_dont_ask_single_archive}
          set_dont_ask_single_delete={toolbar.set_dont_ask_single_delete}
          set_dont_ask_single_spam={toolbar.set_dont_ask_single_spam}
          set_dont_ask_spam={toolbar.set_dont_ask_spam}
          show_empty_spam_dialog={toolbar.show_empty_spam_dialog}
          show_empty_trash_dialog={toolbar.show_empty_trash_dialog}
          show_single_archive_confirm={toolbar.show_single_archive_confirm}
          show_single_delete_confirm={toolbar.show_single_delete_confirm}
          show_single_spam_confirm={toolbar.show_single_spam_confirm}
          spam_count={email_state.emails.filter((e) => e.is_spam).length}
          trash_count={mail_stats.trash}
        />
        <ConfirmModal
          hide_dont_ask
          confirm_text={t("common.ok")}
          confirm_variant="default"
          description={t("mail.confirm_bulk_action_description")}
          dont_ask={false}
          on_cancel={() => set_pending_select_all_action(null)}
          on_confirm={() => {
            const action = pending_select_all_action;

            set_pending_select_all_action(null);
            action?.();
          }}
          on_dont_ask_change={() => {}}
          show={pending_select_all_action !== null}
          title={t("mail.confirm_bulk_action_title")}
        />
      </div>
    </ErrorBoundary>
  );
}
