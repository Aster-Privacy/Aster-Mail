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
import type { InboxEmail, EmailCategory } from "@/types/email";
import type { DraftWithContent } from "@/services/api/multi_drafts";
import type { EmailInboxProps } from "@/components/email/inbox/inbox_types";
import type { MemberRetentionPolicy } from "@/services/api/family_org";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";

import { build_reply_recipient } from "@/components/email/build_reply_recipient";
import { show_action_toast } from "@/components/toast/action_toast";
import { show_toast } from "@/components/toast/simple_toast";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { resolve_effective_page_size } from "@/lib/inbox_page_size";
import { use_email_list } from "@/hooks/use_email_list";
import {
  RATCHET_UNDECRYPTABLE_SENTINEL,
  PGP_UNDECRYPTABLE_SENTINEL,
  is_password_protected_body,
} from "@/utils/email_crypto";
import { use_drafts_list } from "@/hooks/use_drafts_list";
import { use_scheduled_emails } from "@/hooks/use_scheduled_emails";
import { use_snoozed_emails } from "@/hooks/use_snoozed_emails";
import { use_folders } from "@/hooks/use_folders";
import { use_tags } from "@/hooks/use_tags";
import { use_inbox_categories } from "@/hooks/use_inbox_categories";
import { use_category_inbox } from "@/hooks/use_category_inbox";
import {
  set_message_category,
  remove_ids as remove_category_index_ids,
  reindex_ids as reindex_category_ids,
} from "@/services/category_index";
import { use_settled_not_found } from "@/components/email/inbox/use_settled_not_found";
import { category_for_tab } from "@/services/mail_categorizer";
import { is_folder_unlocked } from "@/hooks/use_protected_folder";
import { use_snooze } from "@/hooks/use_snooze";
import { use_mail_stats } from "@/hooks/use_mail_stats";
import {
  MAIL_EVENTS,
  mail_event_bus,
  on_mail_event,
  emit_mail_item_updated,
} from "@/hooks/mail_events";
import { REFRESH_STATE_MS } from "@/constants/timings";
import {
  patch_all_view_caches,
  remove_ids_from_all_view_caches,
} from "@/hooks/email_list_cache";
import {
  await_preloaded_email,
  get_preloaded_email,
  preload_email_detail,
} from "@/components/email/hooks/preload_cache";
import { thread_imported_emails } from "@/services/import/repair_threads";
import { use_i18n } from "@/lib/i18n/context";
import { use_context_menu_actions } from "@/components/email/inbox/inbox_context_menu_handler";
import { get_spam_settings } from "@/services/api/preferences";
import { get_member_retention_policy } from "@/services/api/family_org";
import { use_inbox_toolbar_actions } from "@/components/email/inbox/use_inbox_toolbar_actions";
import { set_forward_mail_id } from "@/services/forward_store";
import { prewarm_search_index } from "@/hooks/use_search";
import mail_logo_url from "@/assets/mail_logo.webp";
import { ignore_error } from "@/lib/ignore_error";

export type {
  ReplyData,
  ForwardData,
  DraftClickData,
  ScheduledClickData,
} from "@/components/email/inbox/inbox_types";

export function use_inbox_view_state(props: EmailInboxProps) {
  const { current_view, on_reply, on_forward, on_draft_click } = props;

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
  const page_size = resolve_effective_page_size(
    preferences.inbox_page_size,
    preferences.low_network_mode,
  );
  const categories = use_inbox_categories(current_view);

  const is_drafts_view = current_view === "drafts";
  const is_scheduled_view = current_view === "scheduled";
  const is_snoozed_view = current_view === "snoozed";
  const is_archive_view = current_view === "archive";
  const [folder_unlock_key, set_folder_unlock_key] = useState(0);
  const [spam_retention_days, set_spam_retention_days] = useState<
    number | null
  >(null);
  const [family_policy, set_family_policy] =
    useState<MemberRetentionPolicy | null>(null);

  useEffect(() => {
    get_spam_settings().then((result) => {
      if (result.data) {
        set_spam_retention_days(result.data.spam_retention_days);
      }
    });
    get_member_retention_policy()
      .then((result) => {
        if (result.data) {
          set_family_policy(result.data);
        }
      })
      .catch((caught) =>
        ignore_error(
          "components/email/use_inbox_view_state:use_inbox_view_state",
          caught,
        ),
      );
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
      void prewarm_search_index(
        user.email,
        preferences.search_encrypted_content,
      );
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
    get_member_retention_policy()
      .then((result) => {
        if (result.data) set_family_policy(result.data);
      })
      .catch((caught) =>
        ignore_error("components/email/use_inbox_view_state:run", caught),
      );
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
  const folder_not_found = use_settled_not_found({
    kind: "folder",
    token: folder_view_token,
    is_found: Boolean(current_folder),
    is_loading: folders_state.is_loading,
  });

  const is_tag_view = current_view.startsWith("tag-");
  const tag_view_token = is_tag_view ? current_view.replace("tag-", "") : null;
  const current_tag = is_tag_view
    ? tags_state.tags.find((t) => t.tag_token === tag_view_token)
    : null;
  const tag_not_found = use_settled_not_found({
    kind: "tag",
    token: tag_view_token,
    is_found: Boolean(current_tag),
    is_loading: tags_state.is_loading,
  });

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
    page_category_ref.current === categories.active_category ? current_page : 0;

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
    update_email,
    remove_email,
    remove_emails,
    restore_emails,
    bulk_delete,
    bulk_archive,
    bulk_unarchive,
    refresh: refresh_active_list,
  } = active_list;

  const mail_state = useMemo(() => {
    if (categories_just_disabled) {
      return {
        ...raw_mail_state,
        emails: [],
        is_loading: true,
        has_initial_load: false,
      };
    }

    return raw_mail_state;
  }, [categories_just_disabled, raw_mail_state]);
  const {
    state: drafts_state,
    update_draft,
    schedule_delete_drafts,
    refresh: refresh_drafts,
  } = use_drafts_list(is_drafts_view);
  const {
    state: scheduled_state,
    update_scheduled,
    refresh: refresh_scheduled,
  } = use_scheduled_emails(is_scheduled_view);
  const {
    state: snoozed_state,
    fetch_snoozed,
    refresh: refresh_snoozed,
    unsnooze: unsnooze_snoozed,
  } = use_snoozed_emails();

  const refresh_current_view = useCallback(() => {
    if (is_drafts_view) {
      refresh_drafts();

      return;
    }
    if (is_scheduled_view) {
      refresh_scheduled();

      return;
    }
    if (is_snoozed_view) {
      refresh_snoozed();

      return;
    }

    refresh_active_list();
  }, [
    is_drafts_view,
    is_scheduled_view,
    is_snoozed_view,
    refresh_active_list,
    refresh_drafts,
    refresh_scheduled,
    refresh_snoozed,
  ]);
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
    async (email_id: string, snooze_until: Date): Promise<boolean> => {
      try {
        await snooze_email_action(email_id, snooze_until);
        const snoozed_until_iso = snooze_until.toISOString();

        if (is_snoozed_view) {
          update_email(email_id, { snoozed_until: snoozed_until_iso });
        } else {
          remove_email(email_id);
        }
        emit_mail_item_updated({
          id: email_id,
          snoozed_until: snoozed_until_iso,
        });
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

        return false;
      }

      return true;
    },
    [
      snooze_email_action,
      is_snoozed_view,
      update_email,
      remove_email,
      categories.enabled,
      t,
    ],
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
        emit_mail_item_updated({ id: email_id, snoozed_until: null });
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
    [is_snoozed_view, unsnooze_snoozed, unsnooze_mail, update_email, t],
  );

  const handle_category_change = useCallback(
    async (email: InboxEmail, category: EmailCategory) => {
      if (category_for_tab(email.mail_category) === category) return;
      const outcome = await set_message_category(email, category);

      if (outcome.applied) {
        update_email(email.id, { mail_category: category });
        show_toast(t("mail.moved_to_category"), "success");
      } else {
        show_toast(
          outcome.undecryptable
            ? t("errors.metadata_undecryptable_change")
            : t("common.something_went_wrong"),
          "error",
        );
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
        has_load_error:
          Boolean(drafts_state.error) && drafts_state.drafts.length === 0,
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
        has_load_error:
          Boolean(scheduled_state.error) && scheduled_state.emails.length === 0,
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
        has_load_error:
          Boolean(snoozed_state.error) && snoozed_state.emails.length === 0,
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
    (
      mode: "reply" | "reply_all" | "forward",
      email: InboxEmail,
      safe_body: string,
      cc_emails?: string[],
    ) => {
      if (mode !== "forward" && on_reply) {
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
          ...(mode === "reply_all"
            ? {
                reply_all: true,
                original_to: email.recipient_addresses ?? [],
                original_cc: cc_emails ?? [],
              }
            : {}),
        });
      } else if (mode === "forward" && on_forward) {
        set_forward_mail_id(email.id);
        on_forward({
          sender_name: email.sender_name,
          sender_email: email.sender_email,
          sender_avatar: email.avatar_url || mail_logo_url,
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
    (mode: "reply" | "reply_all" | "forward", email: InboxEmail) => {
      const is_sentinel = (value: string | undefined): boolean =>
        value === RATCHET_UNDECRYPTABLE_SENTINEL ||
        value === PGP_UNDECRYPTABLE_SENTINEL ||
        is_password_protected_body(value ?? "");
      const fallback_body =
        (is_sentinel(email.body_html) ? "" : email.body_html) ||
        (is_sentinel(email.preview) ? "" : email.preview) ||
        "";
      const cached = get_preloaded_email(email.id)?.email;
      const cached_body = cached?.body ?? "";

      if (!cached_body) {
        void (async () => {
          let resolved = fallback_body;
          let resolved_cc: string[] | undefined;

          try {
            await preload_email_detail(email.id, user?.email);

            const preloaded = await await_preloaded_email(email.id);
            const body = preloaded?.email.body ?? "";

            if (body && !is_sentinel(body)) resolved = body;
            resolved_cc = preloaded?.email.cc?.flatMap((r) =>
              r.email ? [r.email] : [],
            );
          } catch {
            resolved = fallback_body;
          }

          open_compose(mode, email, resolved, resolved_cc);
        })();

        return;
      }

      open_compose(
        mode,
        email,
        is_sentinel(cached_body) ? fallback_body : cached_body,
        cached?.cc?.flatMap((r) => (r.email ? [r.email] : [])),
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
          from_email: draft.content.from_email,
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
    restore_emails,
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
      conversation_grouping: preferences.conversation_grouping,
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
    restore_emails,
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

  return {
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
  };
}
