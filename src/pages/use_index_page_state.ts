//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type {
  ReplyData,
  DraftClickData,
  ScheduledClickData,
} from "@/components/email/email_inbox";
import type { TranslationKey } from "@/lib/i18n";
import type { LocalEmailData } from "@/components/email/email_viewer_types";
import type { CachedSubscription } from "@/services/subscription_cache";
import type { SettingsSection } from "@/components/settings/settings_panel";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { use_compose_manager } from "@/components/compose/compose_manager";
import { use_i18n } from "@/lib/i18n/context";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_metadata_migration } from "@/hooks/use_metadata_migration";
import { use_background_subscription_scan } from "@/hooks/use_background_subscription_scan";
import { use_subscriptions } from "@/hooks/use_subscriptions";
import { use_document_title } from "@/hooks/use_document_title";
import { use_keyboard_shortcuts } from "@/hooks/use_keyboard_shortcuts";
import { use_key_rotation } from "@/hooks/use_key_rotation";
import { lock_all_folders } from "@/hooks/use_protected_folder";
import {
  emit_folders_changed,
  emit_mail_items_removed,
  emit_mail_item_updated,
  emit_mail_soft_refresh,
} from "@/hooks/mail_events";
import { use_show_mobile_ui } from "@/hooks/use_platform";
import { adjust_inbox_count } from "@/hooks/use_mail_counts";
import { adjust_stats_archived } from "@/hooks/use_mail_stats";
import { invalidate_mail_cache } from "@/hooks/email_list_cache";
import { bulk_add_folder, bulk_remove_folder } from "@/services/api/mail";
import {
  batch_archive as api_batch_archive,
  batch_unarchive as api_batch_unarchive,
} from "@/services/api/archive";
import { bulk_add_tag, bulk_remove_tag } from "@/services/api/tags";
import { show_action_toast } from "@/components/toast/action_toast";
import { show_toast } from "@/components/toast/simple_toast";
import { set_forward_mail_id } from "@/services/forward_store";

export interface ForwardData {
  sender_name: string;
  sender_email: string;
  sender_avatar: string;
  email_subject: string;
  email_body: string;
  email_timestamp: string;
  is_external?: boolean;
  original_mail_id?: string;
}

export function use_index_page_state() {
  const [is_settings_open, set_is_settings_open] = useState(false);
  const [settings_section, set_settings_section] = useState<
    SettingsSection | undefined
  >(undefined);
  const {
    instances: compose_instances,
    open_compose: open_compose_instance,
    close_compose,
    toggle_minimize,
    has_instances: has_compose_instances,
  } = use_compose_manager();
  const [is_reply_open, set_is_reply_open] = useState(false);
  const [is_forward_open, set_is_forward_open] = useState(false);
  const [reply_data, set_reply_data] = useState<ReplyData | null>(null);
  const [forward_data, set_forward_data] = useState<ForwardData | null>(null);
  const [edit_draft, set_edit_draft] = useState<DraftClickData | null>(null);
  const [is_mobile_sidebar_open, set_is_mobile_sidebar_open] = useState(false);
  const [popup_email_id, set_popup_email_id] = useState<string | null>(null);
  const [popup_scheduled, set_popup_scheduled] =
    useState<ScheduledClickData | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const [search_params, set_search_params] = useSearchParams();
  const is_mobile = use_show_mobile_ui();
  const { vault, current_account_id } = use_auth();
  const { preferences } = use_preferences();
  const last_loaded_account = useRef<string | null>(null);

  use_metadata_migration();
  use_background_subscription_scan();

  const { unsubscribe: unsubscribe_sender } = use_subscriptions();

  const {
    show_modal: show_rotation_modal,
    key_age_hours,
    key_fingerprint,
    perform_rotation,
    close_modal: close_rotation_modal,
  } = use_key_rotation();

  const { t } = use_i18n();

  const [checkout_success, set_checkout_success] = useState<{
    plan: string;
    billing: string;
  } | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("aster_checkout_success");

    if (raw) {
      sessionStorage.removeItem("aster_checkout_success");
      try {
        const data = JSON.parse(raw);

        if (data.plan) {
          set_checkout_success(data);
          import("@/services/api/billing").then(({ activate_subscription }) => {
            activate_subscription().catch(() => {});
          });
        }
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    const oauth_status = search_params.get("oauth");

    if (!oauth_status) return;

    const provider = search_params.get("provider") || "";

    if (oauth_status === "success") {
      const provider_label =
        provider === "google"
          ? "Gmail"
          : provider === "microsoft"
            ? "Outlook"
            : provider === "yahoo"
              ? "Yahoo"
              : provider;

      show_toast(
        t("settings.oauth_import_success", { provider: provider_label }),
        "success",
      );
      set_settings_section("import" as SettingsSection);
      set_is_settings_open(true);
    } else if (oauth_status === "error") {
      const raw_reason = search_params.get("reason") || "";
      const reason_key_map: Record<string, string> = {
        provider_denied: "settings.oauth_reason_provider_denied",
        missing_code: "settings.oauth_reason_missing_code",
        missing_state: "settings.oauth_reason_missing_state",
        internal_error: "settings.oauth_reason_internal_error",
        invalid_state: "settings.oauth_reason_invalid_state",
        expired_state: "settings.oauth_reason_expired_state",
        invalid_provider: "settings.oauth_reason_invalid_provider",
        provider_not_configured: "settings.oauth_reason_provider_not_configured",
        token_exchange_failed: "settings.oauth_reason_token_exchange_failed",
        encryption_error: "settings.oauth_reason_encryption_error",
        account_creation_failed: "settings.oauth_reason_account_creation_failed",
      };
      const reason_i18n_key = reason_key_map[raw_reason] || "settings.oauth_reason_unknown";
      const reason = t(reason_i18n_key as TranslationKey);

      show_toast(t("settings.oauth_import_error", { reason }), "error");
    }

    set_search_params({}, { replace: true });
  }, [search_params, set_search_params, t]);

  const toggle_mobile_sidebar = useCallback(() => {
    set_is_mobile_sidebar_open((prev) => !prev);
  }, []);

  const open_compose = useCallback(() => {
    set_popup_email_id(null);
    set_popup_scheduled(null);
    set_split_scheduled_data(null);
    open_compose_instance();
  }, [open_compose_instance]);

  const handle_reply = useCallback((data: ReplyData) => {
    set_popup_email_id(null);
    set_popup_scheduled(null);
    set_split_scheduled_data(null);
    set_reply_data(data);
    set_is_reply_open(true);
  }, []);

  const handle_draft_click = useCallback((data: DraftClickData) => {
    set_popup_email_id(null);
    set_popup_scheduled(null);
    set_split_scheduled_data(null);
    set_edit_draft(data);
  }, []);

  const handle_draft_cleared = useCallback(() => {
    set_edit_draft(null);
  }, []);

  const [split_email_id, set_split_email_id] = useState<string | null>(null);
  const [split_scheduled_data, set_split_scheduled_data] =
    useState<ScheduledClickData | null>(null);
  const [preview_local_email, set_preview_local_email] =
    useState<LocalEmailData | null>(null);
  const [visible_email_ids, set_visible_email_ids] = useState<string[]>([]);
  const [email_snooze_map, set_email_snooze_map] = useState<
    Record<string, string | undefined>
  >({});
  const [email_grouped_ids_map, set_email_grouped_ids_map] = useState<
    Record<string, string[] | undefined>
  >({});

  const [is_search_open, set_is_search_open] = useState(false);
  const [active_search_query, set_active_search_query] = useState<
    string | null
  >(search_params.get("q"));
  const [sender_subscription, set_sender_subscription] =
    useState<CachedSubscription | null>(null);
  const [is_command_palette_open, set_is_command_palette_open] =
    useState(false);
  const [is_shortcuts_open, set_is_shortcuts_open] = useState(false);
  const [focused_email_index, set_focused_email_index] = useState(-1);
  const [initial_search_query, set_initial_search_query] = useState<
    string | undefined
  >(undefined);

  const [email_subject_map, set_email_subject_map] = useState<
    Record<string, string>
  >({});

  const handle_email_list_change = useCallback(
    (
      ids: string[],
      snooze_info?: Record<string, string | undefined>,
      grouped_ids_map?: Record<string, string[] | undefined>,
      subject_map?: Record<string, string>,
    ) => {
      set_visible_email_ids(ids);
      if (snooze_info) {
        set_email_snooze_map(snooze_info);
      }
      if (grouped_ids_map) {
        set_email_grouped_ids_map(grouped_ids_map);
      }
      if (subject_map) {
        set_email_subject_map(subject_map);
      }
    },
    [],
  );

  const current_email_index = useMemo(() => {
    const active_id = popup_email_id || split_email_id;

    if (!active_id || visible_email_ids.length === 0) return -1;

    return visible_email_ids.indexOf(active_id);
  }, [popup_email_id, split_email_id, visible_email_ids]);

  const can_go_prev = current_email_index > 0;
  const can_go_next =
    current_email_index !== -1 &&
    current_email_index < visible_email_ids.length - 1;

  const handle_navigate_prev = useCallback(() => {
    if (can_go_prev) {
      const prev_id = visible_email_ids[current_email_index - 1];

      if (popup_email_id) {
        set_popup_email_id(prev_id);
      } else if (split_email_id) {
        set_split_email_id(prev_id);
      }
    }
  }, [
    can_go_prev,
    current_email_index,
    visible_email_ids,
    popup_email_id,
    split_email_id,
  ]);

  const handle_navigate_next = useCallback(() => {
    if (can_go_next) {
      const next_id = visible_email_ids[current_email_index + 1];

      if (popup_email_id) {
        set_popup_email_id(next_id);
      } else if (split_email_id) {
        set_split_email_id(next_id);
      }
    }
  }, [
    can_go_next,
    current_email_index,
    visible_email_ids,
    popup_email_id,
    split_email_id,
  ]);

  const use_popup_mode =
    preferences.email_view_mode === "popup" ||
    (preferences.email_view_mode === "split" &&
      preferences.reading_pane_position === "hidden");

  const handle_navigate_to = useCallback(
    (id: string) => {
      if (use_popup_mode) {
        set_popup_email_id(id);
      } else {
        set_split_email_id(id);
      }
    },
    [use_popup_mode],
  );

  const has_auto_opened_welcome = useRef(false);

  useEffect(() => {
    if (has_auto_opened_welcome.current) return;
    const should_open = localStorage.getItem("show_onboarding") === "true";

    if (!should_open) return;
    if (Object.keys(email_subject_map).length === 0) return;

    const welcome_entry = Object.entries(email_subject_map).find(
      ([, subject]) => subject.toLowerCase().includes("welcome to aster"),
    );

    if (welcome_entry) {
      has_auto_opened_welcome.current = true;
      localStorage.removeItem("show_onboarding");
      handle_navigate_to(welcome_entry[0]);
    }
  }, [email_subject_map, handle_navigate_to]);

  const handle_email_click = useCallback(
    (id: string) => {
      set_edit_draft(null);
      set_popup_scheduled(null);
      set_split_scheduled_data(null);
      const index = visible_email_ids.indexOf(id);

      if (index !== -1) {
        set_focused_email_index(index);
      }
      if (is_mobile) {
        navigate(`/email/${id}`);
      } else if (use_popup_mode) {
        set_split_email_id(null);
        set_popup_email_id(id);
      } else {
        set_popup_email_id(null);
        set_split_email_id(id);
      }
    },
    [is_mobile, use_popup_mode, visible_email_ids, navigate],
  );

  const handle_split_close = useCallback(() => {
    set_split_email_id(null);
    set_preview_local_email(null);
  }, []);

  const handle_popup_close = useCallback(() => {
    set_popup_email_id(null);
    set_preview_local_email(null);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const data = (e as CustomEvent<LocalEmailData>).detail;

      set_preview_local_email(data);
      set_edit_draft(null);
      set_popup_scheduled(null);
      set_split_scheduled_data(null);

      if (use_popup_mode) {
        set_split_email_id(null);
        set_popup_email_id("undo-send-preview");
      } else {
        set_popup_email_id(null);
        set_split_email_id("undo-send-preview");
      }
    };

    window.addEventListener("astermail:undo-send-preview", handler);

    return () =>
      window.removeEventListener("astermail:undo-send-preview", handler);
  }, [use_popup_mode]);

  const handle_popup_reply = useCallback((data: ReplyData) => {
    set_popup_email_id(null);
    set_popup_scheduled(null);
    set_split_scheduled_data(null);
    set_reply_data(data);
    set_is_reply_open(true);
  }, []);

  const handle_popup_forward = useCallback((data: ForwardData) => {
    set_forward_mail_id(data.original_mail_id);
    set_popup_email_id(null);
    set_popup_scheduled(null);
    set_split_scheduled_data(null);
    set_forward_data(data);
    set_is_forward_open(true);
  }, []);

  const handle_scheduled_click = useCallback(
    (data: ScheduledClickData) => {
      set_popup_email_id(null);
      set_split_email_id(null);
      if (preferences.email_view_mode === "popup") {
        set_popup_scheduled(data);
      } else if (preferences.email_view_mode === "split") {
        set_split_scheduled_data(data);
      } else {
        set_popup_scheduled(data);
      }
    },
    [preferences.email_view_mode],
  );

  const handle_scheduled_popup_close = useCallback(() => {
    set_popup_scheduled(null);
  }, []);

  const handle_split_scheduled_close = useCallback(() => {
    set_split_scheduled_data(null);
  }, []);

  const handle_sidebar_nav_click = useCallback(() => {
    set_popup_email_id(null);
    set_popup_scheduled(null);
    set_split_email_id(null);
    set_split_scheduled_data(null);
    set_active_search_query(null);
    set_sender_subscription(null);
  }, []);

  const handle_header_view_change = useCallback(
    (route: string) => {
      set_popup_email_id(null);
      set_popup_scheduled(null);
      set_split_email_id(null);
      set_split_scheduled_data(null);
      set_active_search_query(null);
      set_sender_subscription(null);
      navigate(route);
    },
    [navigate],
  );

  useEffect(() => {
    if (
      vault &&
      current_account_id &&
      last_loaded_account.current !== current_account_id
    ) {
      last_loaded_account.current = current_account_id;
      set_popup_email_id(null);
      set_split_email_id(null);
      set_popup_scheduled(null);
      set_split_scheduled_data(null);
    }
  }, [vault, current_account_id]);

  useEffect(() => {
    if (preferences.email_view_mode === "popup") {
      set_split_email_id(null);
      set_split_scheduled_data(null);
    }
  }, [preferences.email_view_mode]);

  const get_current_view = () => {
    const path = location.pathname;

    if (path === "/all") return "all";
    if (path === "/starred") return "starred";
    if (path === "/sent") return "sent";
    if (path === "/drafts") return "drafts";
    if (path === "/scheduled") return "scheduled";
    if (path === "/snoozed") return "snoozed";
    if (path === "/archive") return "archive";
    if (path === "/spam") return "spam";
    if (path === "/trash") return "trash";
    if (path.startsWith("/folder/")) {
      const folder_token = decodeURIComponent(path.replace("/folder/", ""));

      return `folder-${folder_token}`;
    }
    if (path.startsWith("/tag/")) {
      const tag_token = decodeURIComponent(path.replace("/tag/", ""));

      return `tag-${tag_token}`;
    }
    if (path.startsWith("/alias/")) {
      return `alias-${decodeURIComponent(path.replace("/alias/", ""))}`;
    }

    return "inbox";
  };

  const current_view = get_current_view();

  const handle_drop_to_folder = useCallback(
    async (email_ids: string[], folder_token: string, folder_name: string) => {
      if (email_ids.length === 0) {
        show_toast(t("common.already_in_folder", { folder: folder_name }));

        return;
      }
      const is_protected_view =
        current_view === "sent" ||
        current_view === "drafts" ||
        current_view === "scheduled" ||
        current_view === "trash" ||
        current_view === "spam" ||
        current_view === "archive";

      if (is_protected_view) return;

      const is_inbox_like_view =
        current_view === "inbox" ||
        current_view === "" ||
        current_view === "all" ||
        current_view === "starred" ||
        current_view === "snoozed";
      const is_source_folder_view =
        current_view.startsWith("folder-") &&
        current_view.replace("folder-", "") !== folder_token;

      if (is_inbox_like_view || is_source_folder_view) {
        emit_mail_items_removed({ ids: email_ids });
      }

      const result = await bulk_add_folder(email_ids, folder_token);

      if (result.error) {
        if (is_inbox_like_view || is_source_folder_view) {
          emit_mail_soft_refresh();
        }

        return;
      }

      let archived = false;

      if (is_inbox_like_view) {
        const archive_result = await api_batch_archive({
          ids: email_ids,
          tier: "hot",
        });

        if (!archive_result.error && archive_result.data?.success) {
          archived = true;
          adjust_inbox_count(-email_ids.length);
          adjust_stats_archived(email_ids.length);
          invalidate_mail_cache();
        } else {
          emit_mail_soft_refresh();
        }
      }

      const new_folders = [{ folder_token, name: folder_name }];

      for (const id of email_ids) {
        emit_mail_item_updated({ id, folders: new_folders });
      }

      show_action_toast({
        message:
          email_ids.length === 1
            ? t("common.moved_to_folder", { folder: folder_name })
            : t("common.conversations_moved_to_folder", {
                count: email_ids.length,
                folder: folder_name,
              }),
        action_type: "folder",
        email_ids,
        on_undo: async () => {
          await bulk_remove_folder(email_ids, folder_token);
          if (archived) {
            const unarchive_result = await api_batch_unarchive({
              ids: email_ids,
            });

            if (!unarchive_result.error && unarchive_result.data?.success) {
              adjust_inbox_count(email_ids.length);
              adjust_stats_archived(-email_ids.length);
              invalidate_mail_cache();
            }
          }
          emit_mail_soft_refresh();
        },
      });
    },
    [t, current_view],
  );

  const handle_drop_to_tag = useCallback(
    async (email_ids: string[], tag_token: string, tag_name: string) => {
      if (email_ids.length === 0) {
        show_toast(t("common.already_has_label", { label: tag_name }));

        return;
      }
      const result = await bulk_add_tag(email_ids, tag_token);

      if (result.error) return;
      emit_mail_soft_refresh();
      show_action_toast({
        message: t("common.conversations_added_label", {
          count: email_ids.length,
          label: tag_name,
        }),
        action_type: "tag",
        email_ids,
        on_undo: async () => {
          await bulk_remove_tag(email_ids, tag_token);
          emit_mail_soft_refresh();
        },
      });
    },
    [t],
  );

  use_document_title({ view: current_view });

  useEffect(() => {
    if (location.pathname !== "/compose") return;

    const to_param = search_params.get("to");

    if (!to_param) {
      open_compose_instance();
      navigate("/", { replace: true });

      return;
    }

    const mailto_match = to_param.match(/^mailto:(.+)/i);
    const recipient = mailto_match
      ? decodeURIComponent(mailto_match[1])
      : to_param;

    open_compose_instance(null, recipient);
    navigate("/", { replace: true });
  }, [location.pathname, search_params, open_compose_instance, navigate]);

  useEffect(() => {
    const handle_prefilled_compose = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        to: string[];
        subject: string;
        body: string;
      };

      open_compose_instance({
        id: "",
        version: 0,
        draft_type: "new",
        to_recipients: detail.to,
        cc_recipients: [],
        bcc_recipients: [],
        subject: detail.subject,
        message: detail.body,
        updated_at: new Date().toISOString(),
      });
    };

    window.addEventListener(
      "aster:open-compose-prefilled",
      handle_prefilled_compose,
    );

    return () =>
      window.removeEventListener(
        "aster:open-compose-prefilled",
        handle_prefilled_compose,
      );
  }, [open_compose_instance]);

  useEffect(() => {
    const handle_open_search_with_query = (e: Event) => {
      const custom_event = e as CustomEvent<{ query?: string }>;

      set_initial_search_query(custom_event.detail?.query || "");
      set_is_search_open(true);
    };

    const handle_open_shortcuts_modal = () => {
      set_is_shortcuts_open(true);
    };

    const handle_internal_link = (e: Event) => {
      const custom_event = e as CustomEvent<{ path: string }>;
      const path = custom_event.detail?.path || "";

      if (path.startsWith("settings")) {
        const section = path.split("/")[1] as SettingsSection | undefined;

        set_popup_email_id(null);
        set_popup_scheduled(null);
        set_split_scheduled_data(null);
        set_settings_section(section);
        set_is_settings_open(true);
      }
    };

    window.addEventListener(
      "astermail:open-search-with-query",
      handle_open_search_with_query,
    );
    window.addEventListener(
      "open-shortcuts-modal",
      handle_open_shortcuts_modal,
    );
    window.addEventListener("aster-internal-link", handle_internal_link);

    return () => {
      window.removeEventListener(
        "astermail:open-search-with-query",
        handle_open_search_with_query,
      );
      window.removeEventListener(
        "open-shortcuts-modal",
        handle_open_shortcuts_modal,
      );
      window.removeEventListener("aster-internal-link", handle_internal_link);
    };
  }, []);

  const handle_initial_query_consumed = useCallback(() => {
    set_initial_search_query(undefined);
  }, []);

  const handle_search_submit = useCallback(
    (query: string) => {
      set_is_search_open(false);
      set_active_search_query(query);
      set_sender_subscription(null);
      set_search_params({ q: query });
      set_popup_email_id(null);
      set_split_email_id(null);
      set_popup_scheduled(null);
      set_split_scheduled_data(null);
    },
    [set_search_params],
  );

  const handle_sender_search = useCallback(
    (query: string, subscription: CachedSubscription) => {
      set_popup_email_id(null);
      set_split_email_id(null);
      set_popup_scheduled(null);
      set_split_scheduled_data(null);
      set_active_search_query(query);
      set_sender_subscription(subscription);
      navigate(`/?q=${encodeURIComponent(query)}`);
    },
    [navigate],
  );

  const handle_close_search_results = useCallback(() => {
    const was_from_subscriptions = !!sender_subscription;

    set_active_search_query(null);
    set_sender_subscription(null);
    set_search_params({});

    if (was_from_subscriptions) {
      navigate("/subscriptions");
    }
  }, [set_search_params, sender_subscription, navigate]);

  const handle_search_result_click = useCallback(
    (id: string) => {
      if (is_mobile) {
        navigate(`/email/${id}`);

        return;
      }
      if (use_popup_mode) {
        set_split_email_id(null);
        set_popup_email_id(id);
      } else {
        set_popup_email_id(null);
        set_split_email_id(id);
      }
    },
    [is_mobile, use_popup_mode, navigate],
  );

  const handle_search_split_close = useCallback(() => {
    set_split_email_id(null);
  }, []);

  const is_input_modal_open = useMemo(() => {
    return (
      is_settings_open ||
      has_compose_instances ||
      is_reply_open ||
      is_forward_open ||
      is_search_open ||
      is_command_palette_open ||
      is_shortcuts_open
    );
  }, [
    is_settings_open,
    has_compose_instances,
    is_reply_open,
    is_forward_open,
    is_search_open,
    is_command_palette_open,
    is_shortcuts_open,
  ]);

  const has_viewed_email = !!(popup_email_id || split_email_id);
  const has_focused_email =
    focused_email_index >= 0 && focused_email_index < visible_email_ids.length;

  const focused_email_id = useMemo(() => {
    if (has_focused_email) {
      return visible_email_ids[focused_email_index];
    }

    return null;
  }, [has_focused_email, focused_email_index, visible_email_ids]);

  const handle_keyboard_next = useCallback(() => {
    if (has_viewed_email) {
      handle_navigate_next();
    } else if (visible_email_ids.length > 0) {
      set_focused_email_index((prev) => {
        if (prev < 0) return 0;

        return Math.min(prev + 1, visible_email_ids.length - 1);
      });
    }
  }, [has_viewed_email, handle_navigate_next, visible_email_ids.length]);

  const handle_keyboard_prev = useCallback(() => {
    if (has_viewed_email) {
      handle_navigate_prev();
    } else if (visible_email_ids.length > 0) {
      set_focused_email_index((prev) => {
        if (prev < 0) return 0;

        return Math.max(prev - 1, 0);
      });
    }
  }, [has_viewed_email, handle_navigate_prev, visible_email_ids.length]);

  const handle_keyboard_open = useCallback(() => {
    if (has_viewed_email) return;

    if (focused_email_id) {
      handle_email_click(focused_email_id);
    } else if (visible_email_ids.length > 0) {
      set_focused_email_index(0);
      handle_email_click(visible_email_ids[0]);
    }
  }, [
    focused_email_id,
    has_viewed_email,
    handle_email_click,
    visible_email_ids,
  ]);

  const handle_keyboard_close = useCallback(() => {
    if (popup_email_id) {
      set_popup_email_id(null);
    } else if (split_email_id) {
      set_split_email_id(null);
    } else if (popup_scheduled) {
      set_popup_scheduled(null);
    } else if (split_scheduled_data) {
      set_split_scheduled_data(null);
    }
  }, [popup_email_id, split_email_id, popup_scheduled, split_scheduled_data]);

  const handle_keyboard_reply = useCallback(() => {
    if (!has_viewed_email) return;
    window.dispatchEvent(new CustomEvent("astermail:keyboard-reply"));
  }, [has_viewed_email]);

  const handle_keyboard_forward = useCallback(() => {
    if (!has_viewed_email) return;
    window.dispatchEvent(new CustomEvent("astermail:keyboard-forward"));
  }, [has_viewed_email]);

  const get_target_email_id = useCallback((): string | null => {
    if (popup_email_id) return popup_email_id;
    if (split_email_id) return split_email_id;
    if (focused_email_id) return focused_email_id;

    return null;
  }, [popup_email_id, split_email_id, focused_email_id]);

  const handle_keyboard_archive = useCallback(() => {
    const id = get_target_email_id();

    if (!id) return;
    window.dispatchEvent(
      new CustomEvent("astermail:keyboard-archive", { detail: { id } }),
    );
  }, [get_target_email_id]);

  const handle_keyboard_delete = useCallback(() => {
    const id = get_target_email_id();

    if (!id) return;
    window.dispatchEvent(
      new CustomEvent("astermail:keyboard-delete", { detail: { id } }),
    );
  }, [get_target_email_id]);

  const handle_keyboard_spam = useCallback(() => {
    const id = get_target_email_id();

    if (!id) return;
    window.dispatchEvent(
      new CustomEvent("astermail:keyboard-spam", { detail: { id } }),
    );
  }, [get_target_email_id]);

  const handle_keyboard_star = useCallback(() => {
    const id = get_target_email_id();

    if (!id) return;
    window.dispatchEvent(
      new CustomEvent("astermail:keyboard-star", { detail: { id } }),
    );
  }, [get_target_email_id]);

  const handle_keyboard_mark_read = useCallback(() => {
    const id = get_target_email_id();

    if (!id) return;
    window.dispatchEvent(
      new CustomEvent("astermail:keyboard-mark-read", { detail: { id } }),
    );
  }, [get_target_email_id]);

  const handle_keyboard_mark_unread = useCallback(() => {
    const id = get_target_email_id();

    if (!id) return;
    window.dispatchEvent(
      new CustomEvent("astermail:keyboard-mark-unread", { detail: { id } }),
    );
  }, [get_target_email_id]);

  use_keyboard_shortcuts({
    is_any_modal_open: is_input_modal_open,
    has_focused_email:
      has_focused_email || has_viewed_email || visible_email_ids.length > 0,
    has_viewed_email,
    handlers: {
      on_next_email: handle_keyboard_next,
      on_prev_email: handle_keyboard_prev,
      on_open_email: handle_keyboard_open,
      on_close_viewer: handle_keyboard_close,
      on_compose: open_compose,
      on_reply: handle_keyboard_reply,
      on_forward: handle_keyboard_forward,
      on_archive: handle_keyboard_archive,
      on_delete: handle_keyboard_delete,
      on_spam: handle_keyboard_spam,
      on_toggle_star: handle_keyboard_star,
      on_mark_read: handle_keyboard_mark_read,
      on_mark_unread: handle_keyboard_mark_unread,
      on_search: () => {
        set_is_search_open(true);
        window.dispatchEvent(new CustomEvent("aster:focus-search"));
      },
      on_command_palette: () => set_is_command_palette_open(true),
      on_show_shortcuts: () => set_is_shortcuts_open(true),
    },
  });

  const previous_view = useRef(current_view);

  useEffect(() => {
    if (previous_view.current === current_view) return;
    set_focused_email_index(-1);
    set_active_search_query(null);
    set_split_email_id(null);
  }, [current_view]);

  useEffect(() => {
    const was_folder = previous_view.current.startsWith("folder-");
    const is_folder = current_view.startsWith("folder-");

    previous_view.current = current_view;

    if (
      was_folder &&
      !is_folder &&
      preferences.protected_folder_lock_mode === "on_leave"
    ) {
      lock_all_folders();
      emit_folders_changed();
    }
  }, [current_view, preferences.protected_folder_lock_mode]);

  useEffect(() => {
    if (
      focused_email_index >= 0 &&
      focused_email_index >= visible_email_ids.length
    ) {
      set_focused_email_index(
        visible_email_ids.length > 0 ? visible_email_ids.length - 1 : -1,
      );
    }
  }, [visible_email_ids.length, focused_email_index]);

  return {
    is_settings_open,
    set_is_settings_open,
    settings_section,
    set_settings_section,
    compose_instances,
    open_compose_instance,
    close_compose,
    toggle_minimize,
    is_reply_open,
    set_is_reply_open,
    is_forward_open,
    set_is_forward_open,
    reply_data,
    set_reply_data,
    forward_data,
    set_forward_data,
    edit_draft,
    is_mobile_sidebar_open,
    popup_email_id,
    set_popup_email_id,
    popup_scheduled,
    set_popup_scheduled,
    location,
    preferences,
    current_account_id,
    checkout_success,
    set_checkout_success,
    toggle_mobile_sidebar,
    handle_drop_to_folder,
    handle_drop_to_tag,
    open_compose,
    handle_reply,
    handle_draft_click,
    handle_draft_cleared,
    split_email_id,
    set_split_email_id,
    preview_local_email,
    split_scheduled_data,
    set_split_scheduled_data,
    visible_email_ids,
    email_snooze_map,
    email_grouped_ids_map,
    is_search_open,
    set_is_search_open,
    active_search_query,
    sender_subscription,
    set_sender_subscription,
    is_command_palette_open,
    set_is_command_palette_open,
    is_shortcuts_open,
    set_is_shortcuts_open,
    focused_email_id,
    initial_search_query,
    handle_email_list_change,
    current_email_index,
    can_go_prev,
    can_go_next,
    handle_navigate_prev,
    handle_navigate_next,
    use_popup_mode,
    handle_navigate_to,
    handle_email_click,
    handle_split_close,
    handle_popup_close,
    handle_popup_reply,
    handle_popup_forward,
    handle_scheduled_click,
    handle_scheduled_popup_close,
    handle_split_scheduled_close,
    handle_sidebar_nav_click,
    handle_header_view_change,
    current_view,
    handle_initial_query_consumed,
    handle_search_submit,
    handle_sender_search,
    handle_close_search_results,
    handle_search_result_click,
    handle_search_split_close,
    show_rotation_modal,
    key_age_hours,
    key_fingerprint,
    perform_rotation,
    close_rotation_modal,
    unsubscribe_sender,
    email_subject_map,
  };
}
