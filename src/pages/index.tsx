import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";

import { Sidebar, MobileMenuButton } from "@/components/sidebar";
import {
  ComposeManager,
  useComposeManager,
} from "@/components/compose_manager";
import {
  EmailInbox,
  type ReplyData,
  type DraftClickData,
  type ScheduledClickData,
} from "@/components/email_inbox";
import { ContactsContent } from "@/components/contacts_content";
import { SettingsPanel } from "@/components/settings/settings_panel";
import { ReplyModal } from "@/components/reply_modal";
import { ForwardModal } from "@/components/forward_modal";
import { EmailPopupViewer } from "@/components/email_popup_viewer";
import { ScheduledPopupViewer } from "@/components/scheduled_popup_viewer";
import { OnboardingTour } from "@/components/onboarding_tour";
import { SearchModal } from "@/components/search_modal";
import { SearchResultsPage } from "@/components/search_results_page";
import { CommandPalette } from "@/components/command_palette";
import { KeyboardShortcutsModal } from "@/components/keyboard_shortcuts_modal";
import { KeyRotationModal } from "@/components/key_rotation_modal";
import { use_auth } from "@/contexts/auth_context";
import { useTheme } from "@/contexts/theme_context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_metadata_migration } from "@/hooks/use_metadata_migration";
import { use_document_title } from "@/hooks/use_document_title";
import { use_keyboard_shortcuts } from "@/hooks/use_keyboard_shortcuts";
import { use_key_rotation } from "@/hooks/use_key_rotation";

interface ForwardData {
  sender_name: string;
  sender_email: string;
  sender_avatar: string;
  email_subject: string;
  email_body: string;
  email_timestamp: string;
}

export default function IndexPage() {
  const [is_settings_open, set_is_settings_open] = useState(false);
  const [settings_section, set_settings_section] = useState<string | undefined>(
    undefined,
  );
  const {
    instances: compose_instances,
    open_compose: open_compose_instance,
    close_compose,
    toggle_minimize,
    has_instances: has_compose_instances,
  } = useComposeManager();
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
  const { vault, current_account_id } = use_auth();
  const { load_theme_from_preferences } = useTheme();
  const { preferences } = use_preferences();
  const last_loaded_account = useRef<string | null>(null);

  use_metadata_migration();

  const {
    show_modal: show_rotation_modal,
    key_age_hours,
    key_fingerprint,
    perform_rotation,
    close_modal: close_rotation_modal,
  } = use_key_rotation();

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
  const [visible_email_ids, set_visible_email_ids] = useState<string[]>([]);
  const [email_snooze_map, set_email_snooze_map] = useState<
    Record<string, string | undefined>
  >({});

  const [is_search_open, set_is_search_open] = useState(false);
  const [active_search_query, set_active_search_query] = useState<
    string | null
  >(null);
  const [is_command_palette_open, set_is_command_palette_open] =
    useState(false);
  const [is_shortcuts_open, set_is_shortcuts_open] = useState(false);
  const [focused_email_index, set_focused_email_index] = useState(-1);
  const [initial_search_query, set_initial_search_query] = useState<
    string | undefined
  >(undefined);

  const handle_email_list_change = useCallback(
    (ids: string[], snooze_info?: Record<string, string | undefined>) => {
      set_visible_email_ids(ids);
      if (snooze_info) {
        set_email_snooze_map(snooze_info);
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

  const handle_email_click = useCallback(
    (id: string) => {
      set_edit_draft(null);
      set_popup_scheduled(null);
      set_split_scheduled_data(null);
      const index = visible_email_ids.indexOf(id);

      if (index !== -1) {
        set_focused_email_index(index);
      }
      if (preferences.email_view_mode === "popup") {
        set_split_email_id(null);
        set_popup_email_id(id);
      } else {
        set_popup_email_id(null);
        set_split_email_id(id);
      }
    },
    [preferences.email_view_mode, visible_email_ids],
  );

  const handle_split_close = useCallback(() => {
    set_split_email_id(null);
  }, []);

  const handle_popup_close = useCallback(() => {
    set_popup_email_id(null);
  }, []);

  const handle_popup_reply = useCallback((data: ReplyData) => {
    set_popup_email_id(null);
    set_popup_scheduled(null);
    set_split_scheduled_data(null);
    set_reply_data(data);
    set_is_reply_open(true);
  }, []);

  const handle_popup_forward = useCallback((data: ForwardData) => {
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
  }, []);

  useEffect(() => {
    if (
      vault &&
      current_account_id &&
      last_loaded_account.current !== current_account_id
    ) {
      last_loaded_account.current = current_account_id;
      load_theme_from_preferences(vault);
      set_popup_email_id(null);
      set_split_email_id(null);
      set_popup_scheduled(null);
      set_split_scheduled_data(null);
    }
  }, [vault, current_account_id, load_theme_from_preferences]);

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

    return "inbox";
  };

  const current_view = get_current_view();

  use_document_title({ view: current_view });

  useEffect(() => {
    const handle_open_search_with_query = (e: Event) => {
      const custom_event = e as CustomEvent<{ query?: string }>;

      set_initial_search_query(custom_event.detail?.query || "");
      set_is_search_open(true);
    };

    const handle_open_shortcuts_modal = () => {
      set_is_shortcuts_open(true);
    };

    window.addEventListener(
      "astermail:open-search-with-query",
      handle_open_search_with_query,
    );
    window.addEventListener(
      "open-shortcuts-modal",
      handle_open_shortcuts_modal,
    );

    return () => {
      window.removeEventListener(
        "astermail:open-search-with-query",
        handle_open_search_with_query,
      );
      window.removeEventListener(
        "open-shortcuts-modal",
        handle_open_shortcuts_modal,
      );
    };
  }, []);

  const handle_initial_query_consumed = useCallback(() => {
    set_initial_search_query(undefined);
  }, []);

  const handle_search_submit = useCallback((query: string) => {
    set_is_search_open(false);
    set_active_search_query(query);
    set_popup_email_id(null);
    set_split_email_id(null);
    set_popup_scheduled(null);
    set_split_scheduled_data(null);
  }, []);

  const handle_close_search_results = useCallback(() => {
    set_active_search_query(null);
  }, []);

  const handle_search_result_click = useCallback(
    (id: string) => {
      if (preferences.email_view_mode === "popup") {
        set_popup_email_id(id);
      } else {
        set_split_email_id(id);
      }
    },
    [preferences.email_view_mode],
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
      on_search: () => set_is_search_open(true),
      on_command_palette: () => set_is_command_palette_open(true),
      on_show_shortcuts: () => set_is_shortcuts_open(true),
    },
  });

  useEffect(() => {
    set_focused_email_index(-1);
    set_active_search_query(null);
    set_split_email_id(null);
  }, [current_view]);

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

  return (
    <>
      <div
        className="h-screen w-full flex transition-colors duration-200 overflow-hidden"
        style={{ backgroundColor: "var(--bg-secondary)" }}
      >
        <Sidebar
          edit_draft={edit_draft}
          is_mobile_open={is_mobile_sidebar_open}
          is_search_active={!!active_search_query}
          on_compose={open_compose}
          on_draft_click_compose={(draft) => {
            set_popup_email_id(null);
            set_popup_scheduled(null);
            set_split_scheduled_data(null);
            open_compose_instance(draft);
          }}
          on_mobile_toggle={toggle_mobile_sidebar}
          on_modal_open={() => {
            set_popup_email_id(null);
            set_popup_scheduled(null);
            set_split_scheduled_data(null);
          }}
          on_nav_click={handle_sidebar_nav_click}
          on_settings_click={(section) => {
            set_popup_email_id(null);
            set_popup_scheduled(null);
            set_split_scheduled_data(null);
            set_settings_section(section);
            set_is_settings_open(true);
          }}
        />
        <div className="flex-1 p-1 md:p-2 min-h-0 min-w-0 flex flex-col overflow-hidden">
          <div className="md:hidden flex items-center h-12 px-2 flex-shrink-0">
            <MobileMenuButton on_click={toggle_mobile_sidebar} />
            <div className="flex-1 flex justify-center">
              <img
                alt="Aster Mail"
                className="h-7 select-none"
                draggable={false}
                src="/text_logo.png"
              />
            </div>
            <div className="w-10" />
          </div>
          <div
            className="flex-1 w-full rounded-lg md:rounded-xl border overflow-hidden transition-colors duration-200"
            style={{
              backgroundColor: "var(--bg-primary)",
              borderColor: "var(--border-primary)",
            }}
          >
            {location.pathname === "/contacts" ? (
              <ContactsContent on_mobile_menu_toggle={toggle_mobile_sidebar} />
            ) : active_search_query ? (
              <SearchResultsPage
                query={active_search_query}
                on_close={handle_close_search_results}
                on_result_click={handle_search_result_click}
                on_search_click={() => set_is_search_open(true)}
                on_split_close={handle_search_split_close}
                split_email_id={
                  preferences.email_view_mode === "split" ||
                  preferences.email_view_mode === "fullpage"
                    ? split_email_id
                    : null
                }
              />
            ) : (
              <EmailInbox
                key={current_account_id}
                active_email_id={popup_email_id ?? split_email_id}
                can_go_next={can_go_next}
                can_go_prev={can_go_prev}
                current_email_index={current_email_index}
                current_view={current_view}
                focused_email_id={focused_email_id}
                on_compose={open_compose}
                on_draft_click={handle_draft_click}
                on_email_click={handle_email_click}
                on_email_list_change={handle_email_list_change}
                on_forward={handle_popup_forward}
                on_navigate_next={handle_navigate_next}
                on_navigate_prev={handle_navigate_prev}
                on_reply={handle_reply}
                on_scheduled_click={handle_scheduled_click}
                on_search_click={() => set_is_search_open(true)}
                on_settings_click={() => {
                  set_popup_email_id(null);
                  set_popup_scheduled(null);
                  set_split_scheduled_data(null);
                  set_is_settings_open(true);
                }}
                on_split_close={handle_split_close}
                on_split_scheduled_close={handle_split_scheduled_close}
                split_email_id={
                  preferences.email_view_mode === "split" ||
                  preferences.email_view_mode === "fullpage"
                    ? split_email_id
                    : null
                }
                split_scheduled_data={
                  preferences.email_view_mode === "split" ||
                  preferences.email_view_mode === "fullpage"
                    ? split_scheduled_data
                    : null
                }
                total_email_count={visible_email_ids.length}
              />
            )}
          </div>
        </div>
      </div>
      <SettingsPanel
        initial_section={settings_section as "billing" | "account" | undefined}
        is_open={is_settings_open}
        on_close={() => {
          set_is_settings_open(false);
          set_settings_section(undefined);
        }}
      />
      {reply_data && (
        <ReplyModal
          is_open={is_reply_open}
          on_close={() => {
            set_is_reply_open(false);
            set_reply_data(null);
          }}
          original_body={reply_data.original_body}
          original_email_id={reply_data.original_email_id}
          original_subject={reply_data.original_subject}
          original_timestamp={reply_data.original_timestamp}
          recipient_avatar={reply_data.recipient_avatar}
          recipient_email={reply_data.recipient_email}
          recipient_name={reply_data.recipient_name}
          thread_token={reply_data.thread_token}
        />
      )}
      {forward_data && (
        <ForwardModal
          email_body={forward_data.email_body}
          email_subject={forward_data.email_subject}
          email_timestamp={forward_data.email_timestamp}
          is_open={is_forward_open}
          on_close={() => {
            set_is_forward_open(false);
            set_forward_data(null);
          }}
          sender_avatar={forward_data.sender_avatar}
          sender_email={forward_data.sender_email}
          sender_name={forward_data.sender_name}
        />
      )}
      <AnimatePresence>
        {popup_email_id && (
          <EmailPopupViewer
            can_go_next={can_go_next}
            can_go_prev={can_go_prev}
            current_index={current_email_index}
            email_id={popup_email_id}
            on_close={handle_popup_close}
            on_forward={handle_popup_forward}
            on_navigate_next={handle_navigate_next}
            on_navigate_prev={handle_navigate_prev}
            on_reply={handle_popup_reply}
            snoozed_until={
              popup_email_id ? email_snooze_map[popup_email_id] : undefined
            }
            total_count={visible_email_ids.length}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {popup_scheduled && (
          <ScheduledPopupViewer
            on_close={handle_scheduled_popup_close}
            scheduled_data={popup_scheduled}
          />
        )}
      </AnimatePresence>
      <OnboardingTour />
      <SearchModal
        initial_query={initial_search_query}
        is_open={is_search_open}
        on_close={() => set_is_search_open(false)}
        on_compose={open_compose}
        on_initial_query_consumed={handle_initial_query_consumed}
        on_search_submit={handle_search_submit}
      />
      <CommandPalette
        is_open={is_command_palette_open}
        on_close={() => set_is_command_palette_open(false)}
        on_compose={open_compose}
        on_settings={() => set_is_settings_open(true)}
        on_shortcuts={() => set_is_shortcuts_open(true)}
      />
      <KeyboardShortcutsModal
        is_open={is_shortcuts_open}
        on_close={() => set_is_shortcuts_open(false)}
      />
      <KeyRotationModal
        is_open={show_rotation_modal}
        key_age_hours={key_age_hours}
        key_fingerprint={key_fingerprint}
        on_close={close_rotation_modal}
        on_rotate={perform_rotation}
      />
      <ComposeManager
        instances={compose_instances}
        on_close={close_compose}
        on_draft_cleared={handle_draft_cleared}
        on_toggle_minimize={toggle_minimize}
      />
    </>
  );
}
