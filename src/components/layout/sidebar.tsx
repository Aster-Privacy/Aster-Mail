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
import type { EditDraftData } from "@/components/compose/compose_manager";
import type { SettingsSection } from "@/components/settings/settings_panel";
import type { FolderModalData } from "@/components/layout/sidebar/sidebar_folders";
import type { TagModalData } from "@/components/layout/sidebar/sidebar_tags";

import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  PencilSquareIcon,
  ChevronDownIcon,
  Bars3Icon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button, Kbd } from "@aster/ui";

import { ShareModal } from "@/components/modals/share_modal";
import { CreateFolderModal } from "@/components/folders/create_folder_modal";
import { FolderManagementModal } from "@/components/folders/folder_management_modal";
import { FolderPasswordModal } from "@/components/folders/folder_password_modal";
import { CreateTagModal } from "@/components/tags/create_tag_modal";
import { TagManagementModal } from "@/components/tags/tag_management_modal";
import { ContactsModal } from "@/components/modals/contacts_modal";
import { WorkspaceSwitcher } from "@/components/layout/workspace_switcher";
import { use_mail_stats } from "@/hooks/use_mail_stats";
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import { use_folders } from "@/hooks/use_folders";
import { use_tags } from "@/hooks/use_tags";
import { Skeleton } from "@/components/ui/skeleton";
import { use_should_reduce_motion } from "@/provider";
import { SidebarNavSection } from "@/components/layout/sidebar/sidebar_nav_section";
import { SidebarFolders } from "@/components/layout/sidebar/sidebar_folders";
import { SidebarTags } from "@/components/layout/sidebar/sidebar_tags";
import { SidebarAliases } from "@/components/layout/sidebar/sidebar_aliases";
import { SidebarAccountSwitcher } from "@/components/layout/sidebar/sidebar_account_switcher";
import { use_sidebar_aliases } from "@/hooks/use_sidebar_aliases";
import { use_preferences } from "@/contexts/preferences_context";
import { cache_sidebar_state } from "@/services/api/preferences";

let mail_logo_cached = false;
let text_logo_cached = false;

interface SidebarProps {
  on_settings_click: (section?: SettingsSection) => void;
  on_modal_open?: () => void;
  on_nav_click?: () => void;
  on_compose: () => void;
  on_draft_click_compose?: (draft: EditDraftData) => void;
  edit_draft?: EditDraftData | null;
  is_mobile_open?: boolean;
  on_mobile_toggle?: () => void;
  is_search_active?: boolean;
  on_drop_to_folder?: (
    email_ids: string[],
    folder_token: string,
    folder_name: string,
  ) => void;
  on_drop_to_tag?: (
    email_ids: string[],
    tag_token: string,
    tag_name: string,
  ) => void;
}

export const MobileMenuButton = ({ on_click }: { on_click: () => void }) => {
  const { t } = use_i18n();

  return (
    <button
      aria-label={t("common.open_menu")}
      className="md:hidden flex items-center justify-center w-10 h-10 rounded-lg transition-colors hover:bg-black/[0.06] dark:hover:bg-white/[0.08] text-txt-primary"
      onClick={on_click}
    >
      <Bars3Icon className="w-5 h-5" />
    </button>
  );
};

export const Sidebar = ({
  on_settings_click,
  on_modal_open,
  on_nav_click,
  on_compose,
  on_draft_click_compose,
  edit_draft,
  is_mobile_open = false,
  on_mobile_toggle,
  is_search_active = false,
  on_drop_to_folder,
  on_drop_to_tag,
}: SidebarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = use_auth();
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const { stats, has_initialized } = use_mail_stats();
  const { state: folders_state, counts: folder_counts } = use_folders();
  const { state: tags_state, counts: tag_counts } = use_tags();
  const { aliases, is_loading: aliases_loading } = use_sidebar_aliases();
  const { preferences, update_preference } = use_preferences();

  const [is_mobile, set_is_mobile] = useState(false);
  const [is_tablet, set_is_tablet] = useState(false);

  useEffect(() => {
    const check_breakpoints = () => {
      const width = window.innerWidth;

      set_is_mobile(width < 768);
      set_is_tablet(width >= 768 && width < 1024);
    };

    check_breakpoints();
    window.addEventListener("resize", check_breakpoints);

    return () => window.removeEventListener("resize", check_breakpoints);
  }, []);

  const is_collapsed = is_tablet;

  const user_email = user?.email || "";
  const raw_display_name = user?.display_name || user?.username || user_email;
  const display_name =
    raw_display_name.charAt(0).toUpperCase() + raw_display_name.slice(1);

  const get_initial_selected_item = () => {
    const path = location.pathname;
    const path_to_item: Record<string, string> = {
      "/": "inbox",
      "/all": "all",
      "/starred": "starred",
      "/sent": "sent",
      "/drafts": "drafts",
      "/scheduled": "scheduled",
      "/snoozed": "snoozed",
      "/archive": "archive",
      "/spam": "spam",
      "/trash": "trash",
      "/contacts": "contacts",
      "/subscriptions": "subscriptions",
    };

    if (path.startsWith("/email/")) {
      return (location.state as { from_view?: string })?.from_view || "inbox";
    }

    if (path.startsWith("/folder/")) {
      const folder_token = decodeURIComponent(path.replace("/folder/", ""));

      return `folder-${folder_token}`;
    }

    if (path.startsWith("/tag/")) {
      const tag_token = decodeURIComponent(path.replace("/tag/", ""));

      return `tag-${tag_token}`;
    }

    if (path.startsWith("/alias/")) {
      const alias_address = decodeURIComponent(path.replace("/alias/", ""));

      return `alias-${alias_address}`;
    }

    return path_to_item[path] || "inbox";
  };

  const [selected_item, set_selected_item] = useState(
    get_initial_selected_item(),
  );
  const effective_selected = is_search_active ? null : selected_item;
  const [indicator_style, set_indicator_style] = useState({});
  const [is_share_open, set_is_share_open] = useState(false);
  const [is_create_folder_open, set_is_create_folder_open] = useState(false);
  const [create_folder_parent_token, set_create_folder_parent_token] = useState<
    string | undefined
  >(undefined);
  const [is_contacts_open, set_is_contacts_open] = useState(false);
  const [folder_modal_action, set_folder_modal_action] = useState<
    "encrypt" | "rename" | "recolor" | "delete" | null
  >(null);
  const [selected_folder_for_modal, set_selected_folder_for_modal] =
    useState<FolderModalData | null>(null);
  const [folders_expanded, set_folders_expanded] = useState(false);
  const [labels_expanded, set_labels_expanded] = useState(false);
  const [aliases_expanded, set_aliases_expanded] = useState(false);
  const [is_create_tag_open, set_is_create_tag_open] = useState(false);
  const [tag_modal_action, set_tag_modal_action] = useState<
    "rename" | "recolor" | "reicon" | "delete" | null
  >(null);
  const [selected_tag_for_modal, set_selected_tag_for_modal] =
    useState<TagModalData | null>(null);
  const [password_modal_folder, set_password_modal_folder] = useState<{
    folder_id: string;
    folder_name: string;
    folder_token: string;
    mode: "setup" | "unlock" | "settings";
  } | null>(null);
  const [show_workspace_switcher, set_show_workspace_switcher] =
    useState(false);
  const [mail_logo_loaded, set_mail_logo_loaded] = useState(mail_logo_cached);
  const [text_logo_loaded, set_text_logo_loaded] = useState(text_logo_cached);
  const mail_logo_ref = useRef<HTMLImageElement>(null);
  const text_logo_ref = useRef<HTMLImageElement>(null);
  const workspace_switcher_ref = useRef<HTMLDivElement>(null);

  const storage_percentage = useMemo(() => {
    const total = stats.storage_total_bytes || 1073741824;

    if (!Number.isFinite(total) || total <= 0) return 0;
    const used = stats.storage_used_bytes || 0;

    if (!Number.isFinite(used)) return 0;

    return Math.min(100, (used / total) * 100);
  }, [stats.storage_used_bytes, stats.storage_total_bytes]);

  const inbox_ref = useRef<HTMLButtonElement>(null);
  const all_mail_ref = useRef<HTMLButtonElement>(null);
  const starred_ref = useRef<HTMLButtonElement>(null);
  const sent_ref = useRef<HTMLButtonElement>(null);
  const drafts_ref = useRef<HTMLButtonElement>(null);
  const scheduled_ref = useRef<HTMLButtonElement>(null);
  const snoozed_ref = useRef<HTMLButtonElement>(null);
  const archive_ref = useRef<HTMLButtonElement>(null);
  const spam_ref = useRef<HTMLButtonElement>(null);
  const trash_ref = useRef<HTMLButtonElement>(null);
  const contacts_ref = useRef<HTMLButtonElement>(null);
  const subscriptions_ref = useRef<HTMLButtonElement>(null);
  const container_ref = useRef<HTMLDivElement>(null);
  const folder_refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const tag_refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const alias_refs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (!show_workspace_switcher) return;

    const handle_escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        set_show_workspace_switcher(false);
      }
    };

    document.addEventListener("keydown", handle_escape);

    return () => {
      document.removeEventListener("keydown", handle_escape);
    };
  }, [show_workspace_switcher]);

  useEffect(() => {
    if (mail_logo_cached) {
      set_mail_logo_loaded(true);
    } else if (mail_logo_ref.current?.complete) {
      mail_logo_cached = true;
      set_mail_logo_loaded(true);
    }
  }, []);

  const handle_folder_lock = useCallback(
    (folder: FolderModalData, password_set: boolean) => {
      if (password_set) {
        set_password_modal_folder({
          folder_id: folder.folder_id,
          folder_name: folder.folder_name,
          folder_token: folder.folder_token,
          mode: "settings",
        });
      } else {
        set_password_modal_folder({
          folder_id: folder.folder_id,
          folder_name: folder.folder_name,
          folder_token: folder.folder_token,
          mode: "setup",
        });
      }
    },
    [],
  );

  const handle_folder_modal = useCallback(
    (folder: FolderModalData, action: "rename" | "recolor" | "delete") => {
      set_selected_folder_for_modal(folder);
      set_folder_modal_action(action);
    },
    [],
  );

  const close_folder_modal = useCallback(() => {
    set_folder_modal_action(null);
    set_selected_folder_for_modal(null);
  }, []);

  const handle_folder_deleted = useCallback(() => {
    if (
      selected_folder_for_modal?.folder_token &&
      location.pathname ===
        `/folder/${encodeURIComponent(selected_folder_for_modal.folder_token)}`
    ) {
      navigate("/");
    }
  }, [selected_folder_for_modal, location.pathname, navigate]);

  const handle_tag_modal = useCallback(
    (tag: TagModalData, action: "rename" | "recolor" | "reicon" | "delete") => {
      set_selected_tag_for_modal(tag);
      set_tag_modal_action(action);
    },
    [],
  );

  const close_tag_modal = useCallback(() => {
    set_tag_modal_action(null);
    set_selected_tag_for_modal(null);
  }, []);

  const handle_tag_deleted = useCallback(() => {
    if (
      selected_tag_for_modal?.tag_token &&
      location.pathname ===
        `/tag/${encodeURIComponent(selected_tag_for_modal.tag_token)}`
    ) {
      navigate("/");
    }
  }, [selected_tag_for_modal, location.pathname, navigate]);

  useEffect(() => {
    const path = location.pathname;
    const path_to_item: Record<string, string> = {
      "/": "inbox",
      "/all": "all",
      "/starred": "starred",
      "/sent": "sent",
      "/drafts": "drafts",
      "/scheduled": "scheduled",
      "/snoozed": "snoozed",
      "/archive": "archive",
      "/spam": "spam",
      "/trash": "trash",
      "/contacts": "contacts",
      "/subscriptions": "subscriptions",
    };

    if (path.startsWith("/email/")) {
      const from_view =
        (location.state as { from_view?: string })?.from_view || "inbox";

      set_selected_item(from_view);
    } else if (path.startsWith("/folder/")) {
      const folder_token = decodeURIComponent(path.replace("/folder/", ""));

      set_selected_item(`folder-${folder_token}`);
    } else if (path.startsWith("/tag/")) {
      const tag_token = decodeURIComponent(path.replace("/tag/", ""));

      set_selected_item(`tag-${tag_token}`);
    } else if (path.startsWith("/alias/")) {
      const alias_address = decodeURIComponent(path.replace("/alias/", ""));

      set_selected_item(`alias-${alias_address}`);
    } else {
      const item = path_to_item[path] || "inbox";

      set_selected_item(item);
    }
  }, [location.pathname, location.state]);

  useEffect(() => {
    const handle_navigate = (e: Event) => {
      const path = (e as CustomEvent<string>).detail;

      if (path) navigate(path);
    };

    window.addEventListener("astermail:navigate", handle_navigate);

    return () =>
      window.removeEventListener("astermail:navigate", handle_navigate);
  }, [navigate]);

  const indicator_style_ref = useRef<{
    top: number;
    height: number;
    opacity: number;
  } | null>(null);

  const recalculate_indicator = useCallback(() => {
    const refs_map: Record<string, React.RefObject<HTMLButtonElement>> = {
      inbox: inbox_ref,
      all: all_mail_ref,
      starred: starred_ref,
      sent: sent_ref,
      drafts: drafts_ref,
      scheduled: scheduled_ref,
      snoozed: snoozed_ref,
      archive: archive_ref,
      spam: spam_ref,
      trash: trash_ref,
      contacts: contacts_ref,
      subscriptions: subscriptions_ref,
    };

    let target_button: HTMLElement | null = null;

    const selected_ref = refs_map[selected_item];

    if (selected_ref?.current) {
      target_button = selected_ref.current;
    } else if (selected_item.startsWith("folder-")) {
      const folder_token = selected_item.replace("folder-", "");

      target_button = folder_refs.current[folder_token] || null;
    } else if (selected_item.startsWith("tag-")) {
      const tag_token = selected_item.replace("tag-", "");

      target_button = tag_refs.current[tag_token] || null;
    } else if (selected_item.startsWith("alias-")) {
      const alias_address = selected_item.replace("alias-", "");

      target_button = alias_refs.current[alias_address] || null;
    }

    if (target_button && container_ref.current) {
      const button_rect = target_button.getBoundingClientRect();
      const container_rect = container_ref.current.getBoundingClientRect();
      const new_top = Math.round(button_rect.top - container_rect.top);
      const new_height = Math.round(button_rect.height);
      const prev = indicator_style_ref.current;

      if (
        !prev ||
        prev.top !== new_top ||
        prev.height !== new_height ||
        prev.opacity !== 1
      ) {
        indicator_style_ref.current = {
          top: new_top,
          height: new_height,
          opacity: 1,
        };
        set_indicator_style({
          transform: `translateY(${new_top}px)`,
          height: new_height,
          opacity: 1,
        });
      }
    } else if (!target_button) {
      const prev = indicator_style_ref.current;

      if (!prev || prev.opacity !== 0) {
        indicator_style_ref.current = {
          top: prev?.top ?? 0,
          height: prev?.height ?? 0,
          opacity: 0,
        };
        set_indicator_style((s) => ({ ...s, opacity: 0 }));
      }
    }
  }, [selected_item, is_collapsed]);

  useLayoutEffect(() => {
    recalculate_indicator();
  }, [
    recalculate_indicator,
    folders_state.folders,
    tags_state.tags,
    aliases,
    preferences.sidebar_more_collapsed,
    preferences.sidebar_folders_collapsed,
    preferences.sidebar_labels_collapsed,
    preferences.sidebar_aliases_collapsed,
  ]);

  useEffect(() => {
    if (!container_ref.current) return;

    let raf_id: number;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf_id);
      raf_id = requestAnimationFrame(recalculate_indicator);
    });

    observer.observe(container_ref.current);

    return () => {
      cancelAnimationFrame(raf_id);
      observer.disconnect();
    };
  }, [recalculate_indicator]);

  useEffect(() => {
    if (edit_draft?.id && on_draft_click_compose) {
      on_draft_click_compose(edit_draft);
    }
  }, [edit_draft?.id]);

  const handle_nav_click = useCallback(
    (callback: () => void) => {
      on_nav_click?.();
      callback();
      if (is_mobile && on_mobile_toggle) {
        on_mobile_toggle();
      }
    },
    [on_nav_click, is_mobile, on_mobile_toggle],
  );

  const toggle_more_collapsed = useCallback(() => {
    const next = !preferences.sidebar_more_collapsed;

    cache_sidebar_state("sidebar_more_collapsed", next);
    update_preference("sidebar_more_collapsed", next, true);
  }, [preferences.sidebar_more_collapsed, update_preference]);

  const toggle_folders_collapsed = useCallback(() => {
    const next = !preferences.sidebar_folders_collapsed;

    cache_sidebar_state("sidebar_folders_collapsed", next);
    update_preference("sidebar_folders_collapsed", next, true);
  }, [preferences.sidebar_folders_collapsed, update_preference]);

  const toggle_labels_collapsed = useCallback(() => {
    const next = !preferences.sidebar_labels_collapsed;

    cache_sidebar_state("sidebar_labels_collapsed", next);
    update_preference("sidebar_labels_collapsed", next, true);
  }, [preferences.sidebar_labels_collapsed, update_preference]);

  const toggle_aliases_collapsed = useCallback(() => {
    const next = !preferences.sidebar_aliases_collapsed;

    cache_sidebar_state("sidebar_aliases_collapsed", next);
    update_preference("sidebar_aliases_collapsed", next, true);
  }, [preferences.sidebar_aliases_collapsed, update_preference]);

  const sidebar_content = (
    <aside
      className={`flex h-full flex-col flex-shrink-0 transition-all duration-150 bg-sidebar-bg-custom ${
        is_collapsed ? "w-16 min-w-16 max-w-16" : "w-64 min-w-64 max-w-64"
      }`}
    >
      <div
        ref={workspace_switcher_ref}
        className={`${is_collapsed ? "px-2" : "px-3"} ${is_mobile ? "pr-12" : ""} pt-4 pb-3 relative`}
      >
        {is_mobile && on_mobile_toggle && (
          <button
            aria-label={t("common.close_menu")}
            className="absolute top-2 right-2 flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-black/[0.06] dark:hover:bg-white/[0.08] z-10 text-txt-muted"
            onClick={on_mobile_toggle}
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        )}
        <WorkspaceSwitcher
          is_open={show_workspace_switcher}
          on_open_change={set_show_workspace_switcher}
          trigger={
            <button
              className={`w-full flex items-center ${is_collapsed ? "justify-center" : "gap-3"} group`}
              onClick={() =>
                set_show_workspace_switcher(!show_workspace_switcher)
              }
            >
              <div
                className={`${is_collapsed ? "w-8 h-8" : "w-9 h-9"} flex-shrink-0 relative`}
              >
                {!mail_logo_loaded && (
                  <Skeleton className="absolute inset-0 rounded-lg" />
                )}
                <img
                  ref={mail_logo_ref}
                  alt="Mail"
                  className={`w-full h-full select-none rounded-lg transition-opacity duration-150 ${mail_logo_loaded ? "opacity-100" : "opacity-0"}`}
                  decoding="async"
                  draggable={false}
                  src="/mail_logo.webp"
                  onLoad={() => {
                    mail_logo_cached = true;
                    set_mail_logo_loaded(true);
                  }}
                />
              </div>
              {!is_collapsed && (
                <div className="flex flex-col items-start min-w-0 flex-1">
                  <span className="text-[15px] font-semibold text-txt-primary">
                    {t("common.aster_mail")}
                  </span>
                  <span className="text-[11px] truncate w-full text-left text-txt-muted">
                    {t("common.deck", { name: display_name })}
                  </span>
                </div>
              )}
              {!is_collapsed && (
                <ChevronDownIcon
                  className={`h-4 w-4 flex-shrink-0 transition-transform duration-150 text-txt-muted ${show_workspace_switcher ? "rotate-180" : ""}`}
                />
              )}
            </button>
          }
        />
      </div>

      <div className={`${is_collapsed ? "px-2" : "px-2.5"} pb-3`}>
        <Button
          className={`w-full ${is_collapsed ? "" : "gap-2"}`}
          data-onboarding="compose-button"
          variant="depth"
          onClick={() => {
            on_modal_open?.();
            on_compose();
          }}
        >
          <PencilSquareIcon className="w-[15px] h-[15px]" />
          {!is_collapsed && (
            <>
              <span>{t("mail.compose")}</span>
              <Kbd keys="c" size="sm" variant="inlay" />
            </>
          )}
        </Button>
      </div>

      <ShareModal
        is_open={is_share_open}
        on_close={() => set_is_share_open(false)}
      />
      <CreateFolderModal
        initial_parent_token={create_folder_parent_token}
        is_open={is_create_folder_open}
        on_close={() => {
          set_is_create_folder_open(false);
          set_create_folder_parent_token(undefined);
        }}
      />
      <ContactsModal
        is_open={is_contacts_open}
        on_close={() => set_is_contacts_open(false)}
        on_compose_to={(_email) => {
          set_is_contacts_open(false);
          on_compose();
        }}
      />
      <FolderManagementModal
        action={folder_modal_action}
        folder_color={selected_folder_for_modal?.folder_color ?? "#3b82f6"}
        folder_id={selected_folder_for_modal?.folder_id ?? ""}
        folder_name={selected_folder_for_modal?.folder_name ?? ""}
        hasChildren={selected_folder_for_modal?.hasChildren}
        is_locked={selected_folder_for_modal?.is_locked ?? false}
        is_open={folder_modal_action !== null}
        on_close={close_folder_modal}
        on_deleted={handle_folder_deleted}
      />
      <CreateTagModal
        is_open={is_create_tag_open}
        on_close={() => set_is_create_tag_open(false)}
      />
      <TagManagementModal
        action={tag_modal_action}
        is_open={tag_modal_action !== null}
        on_close={close_tag_modal}
        on_deleted={handle_tag_deleted}
        tag_color={selected_tag_for_modal?.tag_color ?? "#3b82f6"}
        tag_icon={selected_tag_for_modal?.tag_icon}
        tag_id={selected_tag_for_modal?.tag_id ?? ""}
        tag_name={selected_tag_for_modal?.tag_name ?? ""}
      />
      {password_modal_folder && (
        <FolderPasswordModal
          folder_id={password_modal_folder.folder_id}
          folder_name={password_modal_folder.folder_name}
          is_open={true}
          mode={password_modal_folder.mode}
          on_close={() => set_password_modal_folder(null)}
          on_success={() => {
            const folder_token = password_modal_folder.folder_token;
            const mode = password_modal_folder.mode;

            set_password_modal_folder(null);
            if (mode === "unlock" || mode === "setup") {
              set_selected_item(`folder-${folder_token}`);
              navigate(`/folder/${encodeURIComponent(folder_token)}`);
            }
          }}
        />
      )}

      <div
        className={`flex-1 overflow-y-auto ${is_collapsed ? "px-2" : "px-2.5"} pt-0.5 pb-2`}
      >
        <div ref={container_ref} className="relative">
          {!is_collapsed && !is_search_active && (
            <div
              className="pointer-events-none absolute left-0 w-full rounded-md border-edge-primary"
              style={{
                ...indicator_style,
                top: 0,
                backgroundColor: "var(--indicator-bg)",
                border: "1px solid var(--border-primary)",
                zIndex: 0,
                willChange: "transform, opacity",
                transition:
                  (indicator_style as { opacity?: number }).opacity === 0
                    ? "opacity 100ms ease"
                    : "transform 200ms ease, height 200ms ease, opacity 200ms ease",
              }}
            />
          )}

          <SidebarNavSection
            all_mail_ref={all_mail_ref}
            archive_ref={archive_ref}
            contacts_ref={contacts_ref}
            drafts_ref={drafts_ref}
            effective_selected={effective_selected}
            handle_nav_click={handle_nav_click}
            inbox_ref={inbox_ref}
            is_collapsed={is_collapsed}
            navigate={navigate}
            on_toggle_section={toggle_more_collapsed}
            scheduled_ref={scheduled_ref}
            section_collapsed={preferences.sidebar_more_collapsed}
            sent_ref={sent_ref}
            set_selected_item={set_selected_item}
            snoozed_ref={snoozed_ref}
            spam_ref={spam_ref}
            starred_ref={starred_ref}
            stats={stats}
            stats_loading={!has_initialized}
            subscriptions_ref={subscriptions_ref}
            trash_ref={trash_ref}
          />

          <SidebarFolders
            effective_selected={effective_selected}
            folder_counts={folder_counts}
            folder_refs={folder_refs}
            folders={folders_state.folders}
            folders_expanded={folders_expanded}
            handle_folder_lock={handle_folder_lock}
            handle_folder_modal={handle_folder_modal}
            handle_nav_click={handle_nav_click}
            is_collapsed={is_collapsed}
            is_loading={folders_state.is_loading}
            navigate={navigate}
            on_drop_emails={on_drop_to_folder}
            on_toggle_section={toggle_folders_collapsed}
            section_collapsed={preferences.sidebar_folders_collapsed}
            set_create_folder_parent_token={set_create_folder_parent_token}
            set_folders_expanded={set_folders_expanded}
            set_is_create_folder_open={set_is_create_folder_open}
            set_password_modal_folder={set_password_modal_folder}
            set_selected_item={set_selected_item}
          />

          <SidebarTags
            effective_selected={effective_selected}
            handle_nav_click={handle_nav_click}
            handle_tag_modal={handle_tag_modal}
            is_collapsed={is_collapsed}
            is_loading={tags_state.is_loading}
            labels_expanded={labels_expanded}
            navigate={navigate}
            on_drop_emails={on_drop_to_tag}
            on_toggle_section={toggle_labels_collapsed}
            section_collapsed={preferences.sidebar_labels_collapsed}
            set_is_create_tag_open={set_is_create_tag_open}
            set_labels_expanded={set_labels_expanded}
            set_selected_item={set_selected_item}
            tag_counts={tag_counts}
            tag_refs={tag_refs}
            tags={tags_state.tags}
          />

          <SidebarAliases
            alias_refs={alias_refs}
            aliases={aliases}
            aliases_expanded={aliases_expanded}
            effective_selected={effective_selected}
            handle_nav_click={handle_nav_click}
            is_collapsed={is_collapsed}
            is_loading={aliases_loading}
            navigate={navigate}
            on_create_alias={() => {
              on_settings_click("aliases");
              setTimeout(() => {
                window.dispatchEvent(
                  new CustomEvent("astermail:auto-open-create-alias"),
                );
              }, 100);
            }}
            on_settings_click={on_settings_click}
            on_toggle_section={toggle_aliases_collapsed}
            section_collapsed={preferences.sidebar_aliases_collapsed}
            set_aliases_expanded={set_aliases_expanded}
            set_selected_item={set_selected_item}
          />
        </div>
      </div>

      <SidebarAccountSwitcher
        is_collapsed={is_collapsed}
        on_modal_open={on_modal_open}
        on_settings_click={on_settings_click}
        set_text_logo_loaded={(loaded) => {
          text_logo_cached = true;
          set_text_logo_loaded(loaded);
        }}
        storage_percentage={storage_percentage}
        storage_total_bytes={stats.storage_total_bytes}
        storage_used_bytes={stats.storage_used_bytes}
        text_logo_loaded={text_logo_loaded}
        text_logo_ref={text_logo_ref}
      />
    </aside>
  );

  return (
    <>
      {is_mobile ? (
        <AnimatePresence>
          {is_mobile_open && (
            <>
              <motion.div
                animate={{ opacity: 1 }}
                className="fixed inset-0 bg-black/50 backdrop-blur-md z-40"
                exit={{ opacity: 0 }}
                initial={reduce_motion ? false : { opacity: 0 }}
                transition={{ duration: reduce_motion ? 0 : 0.2 }}
                onClick={on_mobile_toggle}
              />
              <motion.div
                animate={{ x: 0 }}
                className="fixed top-0 left-0 h-full z-50"
                exit={{ x: -280 }}
                initial={reduce_motion ? false : { x: -280 }}
                transition={{
                  type: "tween",
                  duration: reduce_motion ? 0 : 0.25,
                  ease: "easeOut",
                }}
              >
                {sidebar_content}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      ) : (
        sidebar_content
      )}
    </>
  );
};
