import type { EditDraftData } from "@/components/compose/compose_manager";

import { useState, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  InboxIcon,
  StarIcon,
  PaperAirplaneIcon,
  DocumentTextIcon,
  ClockIcon,
  BellSnoozeIcon,
  ArchiveBoxIcon,
  ExclamationTriangleIcon,
  TrashIcon,
  PencilSquareIcon,
  PlusIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FolderIcon,
  LockClosedIcon,
  Bars3Icon,
  XMarkIcon,
  UsersIcon,
  GiftIcon,
  EnvelopeIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";

import { ShareModal } from "@/components/modals/share_modal";
import { CreateFolderModal } from "@/components/folders/create_folder_modal";
import { KeyboardShortcutBadge } from "@/components/common/keyboard_shortcut_badge";
import { FolderManagementModal } from "@/components/folders/folder_management_modal";
import { FolderPasswordModal } from "@/components/folders/folder_password_modal";
import { FolderContextMenu } from "@/components/folders/folder_context_menu";
import { ContactsModal } from "@/components/modals/contacts_modal";
import { InviteFriendsModal } from "@/components/modals/invite_friends_modal";
import { WorkspaceSwitcher } from "@/components/layout/workspace_switcher";
import { is_folder_unlocked } from "@/hooks/use_protected_folder";
import { use_mail_stats } from "@/hooks/use_mail_stats";
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import { use_folders } from "@/hooks/use_folders";
import { Skeleton } from "@/components/ui/skeleton";
import { CountBadge } from "@/components/common/count_badge";
import { format_bytes } from "@/lib/utils";

let mail_logo_cached = false;
let text_logo_cached = false;

interface FolderModalData {
  folder_id: string;
  folder_name: string;
  folder_token: string;
  folder_color: string;
  is_locked?: boolean;
}

interface SidebarProps {
  on_settings_click: (section?: string) => void;
  on_modal_open?: () => void;
  on_nav_click?: () => void;
  on_compose: () => void;
  on_draft_click_compose?: (draft: EditDraftData) => void;
  edit_draft?: EditDraftData | null;
  is_mobile_open?: boolean;
  on_mobile_toggle?: () => void;
  is_search_active?: boolean;
}

export const MobileMenuButton = ({ on_click }: { on_click: () => void }) => {
  return (
    <button
      aria-label="Open menu"
      className="md:hidden flex items-center justify-center w-10 h-10 rounded-lg transition-colors hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
      style={{ color: "var(--text-primary)" }}
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
}: SidebarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = use_auth();
  const { t } = use_i18n();
  const { stats } = use_mail_stats();
  const { state: folders_state, counts: folder_counts } = use_folders();

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
    };

    if (path.startsWith("/email/")) {
      return (location.state as { from_view?: string })?.from_view || "inbox";
    }

    if (path.startsWith("/folder/")) {
      const folder_token = decodeURIComponent(path.replace("/folder/", ""));

      return `folder-${folder_token}`;
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
  const [is_contacts_open, set_is_contacts_open] = useState(false);
  const [is_invite_open, set_is_invite_open] = useState(false);
  const [folder_modal_action, set_folder_modal_action] = useState<
    "encrypt" | "rename" | "recolor" | "delete" | null
  >(null);
  const [selected_folder_for_modal, set_selected_folder_for_modal] =
    useState<FolderModalData | null>(null);
  const [folders_expanded, set_folders_expanded] = useState(false);
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
  const container_ref = useRef<HTMLDivElement>(null);
  const folder_refs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const handle_click_outside = (event: MouseEvent) => {
      if (
        workspace_switcher_ref.current &&
        !workspace_switcher_ref.current.contains(event.target as Node)
      ) {
        set_show_workspace_switcher(false);
      }
    };

    if (show_workspace_switcher) {
      document.addEventListener("mousedown", handle_click_outside);
    }

    return () => {
      document.removeEventListener("mousedown", handle_click_outside);
    };
  }, [show_workspace_switcher]);

  useEffect(() => {
    if (mail_logo_cached) {
      set_mail_logo_loaded(true);
    } else if (mail_logo_ref.current?.complete) {
      mail_logo_cached = true;
      set_mail_logo_loaded(true);
    }
    if (text_logo_cached) {
      set_text_logo_loaded(true);
    } else if (text_logo_ref.current?.complete) {
      text_logo_cached = true;
      set_text_logo_loaded(true);
    }
  }, []);

  const handle_folder_lock = (
    folder: FolderModalData,
    password_set: boolean,
  ) => {
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
  };

  const handle_folder_modal = (
    folder: FolderModalData,
    action: "rename" | "recolor" | "delete",
  ) => {
    set_selected_folder_for_modal(folder);
    set_folder_modal_action(action);
  };

  const close_folder_modal = () => {
    set_folder_modal_action(null);
    set_selected_folder_for_modal(null);
  };

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
    };

    if (path.startsWith("/email/")) {
      const from_view =
        (location.state as { from_view?: string })?.from_view || "inbox";

      set_selected_item(from_view);
    } else if (path.startsWith("/folder/")) {
      const folder_token = decodeURIComponent(path.replace("/folder/", ""));

      set_selected_item(`folder-${folder_token}`);
    } else {
      const item = path_to_item[path] || "inbox";

      set_selected_item(item);
    }
  }, [location.pathname, location.state]);

  useLayoutEffect(() => {
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
    };

    const selected_ref = refs_map[selected_item];

    if (selected_ref?.current && container_ref.current) {
      const button_rect = selected_ref.current.getBoundingClientRect();
      const container_rect = container_ref.current.getBoundingClientRect();

      set_indicator_style({
        top: button_rect.top - container_rect.top,
        height: button_rect.height,
        opacity: 1,
      });
    } else if (selected_item.startsWith("folder-")) {
      const folder_token = selected_item.replace("folder-", "");
      const folder_button = folder_refs.current[folder_token];

      if (folder_button && container_ref.current) {
        const button_rect = folder_button.getBoundingClientRect();
        const container_rect = container_ref.current.getBoundingClientRect();

        set_indicator_style({
          top: button_rect.top - container_rect.top,
          height: button_rect.height,
          opacity: 1,
        });
      }
    }
  }, [selected_item, folders_state.folders, is_collapsed]);

  useEffect(() => {
    if (edit_draft?.id && on_draft_click_compose) {
      on_draft_click_compose(edit_draft);
    }
  }, [edit_draft?.id]);

  const handle_nav_click = (callback: () => void) => {
    on_nav_click?.();
    callback();
    if (is_mobile && on_mobile_toggle) {
      on_mobile_toggle();
    }
  };

  const sidebar_content = (
    <aside
      className={`flex h-full flex-col flex-shrink-0 transition-all duration-150 ${
        is_collapsed ? "w-16 min-w-16 max-w-16" : "w-64 min-w-64 max-w-64"
      }`}
      style={{ backgroundColor: "var(--sidebar-bg)" }}
    >
      <div
        ref={workspace_switcher_ref}
        className={`${is_collapsed ? "px-2" : "px-3"} ${is_mobile ? "pr-12" : ""} pt-4 pb-3 relative`}
      >
        {is_mobile && on_mobile_toggle && (
          <button
            aria-label="Close menu"
            className="absolute top-2 right-2 flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-black/[0.06] dark:hover:bg-white/[0.08] z-10"
            style={{ color: "var(--text-muted)" }}
            onClick={on_mobile_toggle}
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        )}
        <WorkspaceSwitcher
          is_open={show_workspace_switcher && !is_collapsed}
          on_open_change={set_show_workspace_switcher}
          trigger={
            <button
              className={`w-full flex items-center ${is_collapsed ? "justify-center" : "gap-3"} group`}
              onClick={() =>
                !is_collapsed &&
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
                <>
                  <div className="flex flex-col items-start min-w-0 flex-1">
                    <span
                      className="text-[15px] font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Aster Mail
                    </span>
                    <span
                      className="text-[11px] truncate w-full text-left"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {display_name}&apos;s Deck
                    </span>
                  </div>
                  <ChevronDownIcon
                    className={`h-4 w-4 flex-shrink-0 transition-transform duration-150 ${show_workspace_switcher ? "rotate-180" : ""}`}
                    style={{ color: "var(--text-muted)" }}
                  />
                </>
              )}
            </button>
          }
        />
      </div>

      <div className={`${is_collapsed ? "px-2" : "px-2.5"} pb-3`}>
        <button
          className={`w-full flex items-center justify-center ${is_collapsed ? "" : "gap-2"} h-9 rounded-lg text-[13px] font-semibold transition-all duration-150 hover:brightness-110`}
          data-onboarding="compose-button"
          style={{
            background:
              "linear-gradient(to bottom, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
            color: "#ffffff",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            borderBottom: "1px solid rgba(0, 0, 0, 0.15)",
          }}
          onClick={() => {
            on_modal_open?.();
            on_compose();
          }}
        >
          <PencilSquareIcon className="w-[15px] h-[15px]" />
          {!is_collapsed && (
            <>
              <span>{t("mail.compose")}</span>
              <KeyboardShortcutBadge
                className="bg-white/20 border-white/30 text-white/80 shadow-none"
                shortcut="c"
              />
            </>
          )}
        </button>
      </div>

      <ShareModal
        is_open={is_share_open}
        on_close={() => set_is_share_open(false)}
      />
      <CreateFolderModal
        is_open={is_create_folder_open}
        on_close={() => set_is_create_folder_open(false)}
      />
      <ContactsModal
        is_open={is_contacts_open}
        on_close={() => set_is_contacts_open(false)}
        on_compose_to={(_email) => {
          set_is_contacts_open(false);
          on_compose();
        }}
      />
      <InviteFriendsModal
        is_open={is_invite_open}
        on_close={() => set_is_invite_open(false)}
      />
      <FolderManagementModal
        action={folder_modal_action}
        folder_color={selected_folder_for_modal?.folder_color ?? "#3b82f6"}
        folder_id={selected_folder_for_modal?.folder_id ?? ""}
        folder_name={selected_folder_for_modal?.folder_name ?? ""}
        is_locked={selected_folder_for_modal?.is_locked ?? false}
        is_open={folder_modal_action !== null}
        on_close={close_folder_modal}
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
        className={`flex-1 overflow-y-auto ${is_collapsed ? "px-2" : "px-2.5"} pt-0.5`}
      >
        <div ref={container_ref} className="relative">
          {!is_collapsed && !is_search_active && (
            <div
              className="pointer-events-none absolute left-0 w-full rounded-md"
              style={{
                ...indicator_style,
                backgroundColor: "var(--indicator-bg)",
                border: "1px solid var(--border-primary)",
                zIndex: 0,
                transition:
                  (indicator_style as { opacity?: number }).opacity === 0
                    ? "opacity 100ms ease"
                    : "top 200ms ease, height 200ms ease, opacity 200ms ease",
              }}
            />
          )}

          {!is_collapsed && (
            <div className="mb-1 px-2.5">
              <span
                className="text-[10px] font-semibold uppercase tracking-[0.05em]"
                style={{ color: "var(--text-muted)", opacity: 0.7 }}
              >
                {t("common.mail")}
              </span>
            </div>
          )}

          <button
            ref={inbox_ref}
            className={`sidebar-nav-btn group relative w-full flex items-center ${is_collapsed ? "justify-center" : "gap-2.5"} rounded-md ${is_collapsed ? "px-0" : "px-2.5"} h-8 text-[14px] transition-colors duration-150 ${is_collapsed && effective_selected === "inbox" ? "sidebar-selected" : ""}`}
            style={{
              zIndex: 1,
              color:
                effective_selected === "inbox"
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
              backgroundColor:
                is_collapsed && effective_selected === "inbox"
                  ? "var(--indicator-bg)"
                  : undefined,
            }}
            title={is_collapsed ? t("mail.inbox") : undefined}
            onClick={() =>
              handle_nav_click(() => {
                set_selected_item("inbox");
                if (location.pathname !== "/") navigate("/");
              })
            }
          >
            <InboxIcon
              className={`${is_collapsed ? "w-5 h-5" : "w-4 h-4"} transition-colors duration-150`}
              style={{
                color:
                  effective_selected === "inbox"
                    ? "var(--text-primary)"
                    : "var(--text-muted)",
              }}
            />
            {!is_collapsed && (
              <>
                <span className="flex-1 text-left">{t("mail.inbox")}</span>
                <CountBadge
                  count={stats.inbox}
                  is_active={effective_selected === "inbox"}
                />
              </>
            )}
          </button>

          <button
            ref={sent_ref}
            className={`sidebar-nav-btn group relative w-full flex items-center ${is_collapsed ? "justify-center" : "gap-2.5"} rounded-md ${is_collapsed ? "px-0" : "px-2.5"} h-8 text-[14px] transition-colors duration-150 ${is_collapsed && effective_selected === "sent" ? "sidebar-selected" : ""}`}
            style={{
              zIndex: 1,
              color:
                effective_selected === "sent"
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
              backgroundColor:
                is_collapsed && effective_selected === "sent"
                  ? "var(--indicator-bg)"
                  : undefined,
            }}
            title={is_collapsed ? t("mail.sent") : undefined}
            onClick={() =>
              handle_nav_click(() => {
                set_selected_item("sent");
                navigate("/sent");
              })
            }
          >
            <PaperAirplaneIcon
              className={`${is_collapsed ? "w-5 h-5" : "w-4 h-4"} transition-colors duration-150`}
              style={{
                color:
                  effective_selected === "sent"
                    ? "var(--text-primary)"
                    : "var(--text-muted)",
              }}
            />
            {!is_collapsed && (
              <span className="flex-1 text-left">{t("mail.sent")}</span>
            )}
          </button>

          <button
            ref={scheduled_ref}
            className={`sidebar-nav-btn group relative w-full flex items-center ${is_collapsed ? "justify-center" : "gap-2.5"} rounded-md ${is_collapsed ? "px-0" : "px-2.5"} h-8 text-[14px] transition-colors duration-150 ${is_collapsed && effective_selected === "scheduled" ? "sidebar-selected" : ""}`}
            style={{
              zIndex: 1,
              color:
                effective_selected === "scheduled"
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
              backgroundColor:
                is_collapsed && effective_selected === "scheduled"
                  ? "var(--indicator-bg)"
                  : undefined,
            }}
            title={is_collapsed ? t("mail.scheduled") : undefined}
            onClick={() =>
              handle_nav_click(() => {
                set_selected_item("scheduled");
                navigate("/scheduled");
              })
            }
          >
            <ClockIcon
              className={`${is_collapsed ? "w-5 h-5" : "w-4 h-4"} transition-colors duration-150`}
              style={{
                color:
                  effective_selected === "scheduled"
                    ? "var(--text-primary)"
                    : "var(--text-muted)",
              }}
            />
            {!is_collapsed && (
              <>
                <span className="flex-1 text-left">{t("mail.scheduled")}</span>
                <CountBadge
                  count={stats.scheduled}
                  is_active={effective_selected === "scheduled"}
                />
              </>
            )}
          </button>

          <button
            ref={snoozed_ref}
            className={`sidebar-nav-btn group relative w-full flex items-center ${is_collapsed ? "justify-center" : "gap-2.5"} rounded-md ${is_collapsed ? "px-0" : "px-2.5"} h-8 text-[14px] transition-colors duration-150 ${is_collapsed && effective_selected === "snoozed" ? "sidebar-selected" : ""}`}
            style={{
              zIndex: 1,
              color:
                effective_selected === "snoozed"
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
              backgroundColor:
                is_collapsed && effective_selected === "snoozed"
                  ? "var(--indicator-bg)"
                  : undefined,
            }}
            title={is_collapsed ? "Snoozed" : undefined}
            onClick={() =>
              handle_nav_click(() => {
                set_selected_item("snoozed");
                navigate("/snoozed");
              })
            }
          >
            <BellSnoozeIcon
              className={`${is_collapsed ? "w-5 h-5" : "w-4 h-4"} transition-colors duration-150`}
              style={{
                color:
                  effective_selected === "snoozed"
                    ? "var(--text-primary)"
                    : "var(--text-muted)",
              }}
            />
            {!is_collapsed && (
              <>
                <span className="flex-1 text-left">Snoozed</span>
                <CountBadge
                  count={stats.snoozed}
                  is_active={effective_selected === "snoozed"}
                />
              </>
            )}
          </button>

          <button
            ref={drafts_ref}
            className={`sidebar-nav-btn group relative w-full flex items-center ${is_collapsed ? "justify-center" : "gap-2.5"} rounded-md ${is_collapsed ? "px-0" : "px-2.5"} h-8 text-[14px] transition-colors duration-150 ${is_collapsed && effective_selected === "drafts" ? "sidebar-selected" : ""}`}
            style={{
              zIndex: 1,
              color:
                effective_selected === "drafts"
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
              backgroundColor:
                is_collapsed && effective_selected === "drafts"
                  ? "var(--indicator-bg)"
                  : undefined,
            }}
            title={is_collapsed ? t("mail.drafts") : undefined}
            onClick={() =>
              handle_nav_click(() => {
                set_selected_item("drafts");
                navigate("/drafts");
              })
            }
          >
            <DocumentTextIcon
              className={`${is_collapsed ? "w-5 h-5" : "w-4 h-4"} transition-colors duration-150`}
              style={{
                color:
                  effective_selected === "drafts"
                    ? "var(--text-primary)"
                    : "var(--text-muted)",
              }}
            />
            {!is_collapsed && (
              <span className="flex-1 text-left">{t("mail.drafts")}</span>
            )}
          </button>

          {!is_collapsed && (
            <div className="mt-5 mb-1 px-2.5">
              <span
                className="text-[10px] font-semibold uppercase tracking-[0.05em]"
                style={{ color: "var(--text-muted)", opacity: 0.7 }}
              >
                More
              </span>
            </div>
          )}

          {is_collapsed && <div className="mt-3" />}

          <button
            ref={starred_ref}
            className={`sidebar-nav-btn group relative w-full flex items-center ${is_collapsed ? "justify-center" : "gap-2.5"} rounded-md ${is_collapsed ? "px-0" : "px-2.5"} h-8 text-[14px] transition-colors duration-150 ${is_collapsed && effective_selected === "starred" ? "sidebar-selected" : ""}`}
            style={{
              zIndex: 1,
              color:
                effective_selected === "starred"
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
              backgroundColor:
                is_collapsed && effective_selected === "starred"
                  ? "var(--indicator-bg)"
                  : undefined,
            }}
            title={is_collapsed ? t("mail.starred") : undefined}
            onClick={() =>
              handle_nav_click(() => {
                set_selected_item("starred");
                navigate("/starred");
              })
            }
          >
            <StarIcon
              className={`${is_collapsed ? "w-5 h-5" : "w-4 h-4"} transition-colors duration-150`}
              style={{
                color:
                  effective_selected === "starred"
                    ? "var(--text-primary)"
                    : "var(--text-muted)",
              }}
            />
            {!is_collapsed && (
              <span className="flex-1 text-left">{t("mail.starred")}</span>
            )}
          </button>

          <button
            ref={all_mail_ref}
            className={`sidebar-nav-btn group relative w-full flex items-center ${is_collapsed ? "justify-center" : "gap-2.5"} rounded-md ${is_collapsed ? "px-0" : "px-2.5"} h-8 text-[14px] transition-colors duration-150 ${is_collapsed && effective_selected === "all" ? "sidebar-selected" : ""}`}
            style={{
              zIndex: 1,
              color:
                effective_selected === "all"
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
              backgroundColor:
                is_collapsed && effective_selected === "all"
                  ? "var(--indicator-bg)"
                  : undefined,
            }}
            title={is_collapsed ? "All Mail" : undefined}
            onClick={() =>
              handle_nav_click(() => {
                set_selected_item("all");
                navigate("/all");
              })
            }
          >
            <EnvelopeIcon
              className={`${is_collapsed ? "w-5 h-5" : "w-4 h-4"} transition-colors duration-150`}
              style={{
                color:
                  effective_selected === "all"
                    ? "var(--text-primary)"
                    : "var(--text-muted)",
              }}
            />
            {!is_collapsed && (
              <>
                <span className="flex-1 text-left">All Mail</span>
                <CountBadge
                  count={stats.total_items}
                  is_active={effective_selected === "all"}
                />
              </>
            )}
          </button>

          <button
            ref={archive_ref}
            className={`sidebar-nav-btn group relative w-full flex items-center ${is_collapsed ? "justify-center" : "gap-2.5"} rounded-md ${is_collapsed ? "px-0" : "px-2.5"} h-8 text-[14px] transition-colors duration-150 ${is_collapsed && effective_selected === "archive" ? "sidebar-selected" : ""}`}
            style={{
              zIndex: 1,
              color:
                effective_selected === "archive"
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
              backgroundColor:
                is_collapsed && effective_selected === "archive"
                  ? "var(--indicator-bg)"
                  : undefined,
            }}
            title={is_collapsed ? t("mail.archive") : undefined}
            onClick={() =>
              handle_nav_click(() => {
                set_selected_item("archive");
                navigate("/archive");
              })
            }
          >
            <ArchiveBoxIcon
              className={`${is_collapsed ? "w-5 h-5" : "w-4 h-4"} transition-colors duration-150`}
              style={{
                color:
                  effective_selected === "archive"
                    ? "var(--text-primary)"
                    : "var(--text-muted)",
              }}
            />
            {!is_collapsed && (
              <>
                <span className="flex-1 text-left">{t("mail.archive")}</span>
                <CountBadge
                  count={stats.archived}
                  is_active={effective_selected === "archive"}
                />
              </>
            )}
          </button>

          <button
            ref={spam_ref}
            className={`sidebar-nav-btn group relative w-full flex items-center ${is_collapsed ? "justify-center" : "gap-2.5"} rounded-md ${is_collapsed ? "px-0" : "px-2.5"} h-8 text-[14px] transition-colors duration-150 ${is_collapsed && effective_selected === "spam" ? "sidebar-selected" : ""}`}
            style={{
              zIndex: 1,
              color:
                effective_selected === "spam"
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
              backgroundColor:
                is_collapsed && effective_selected === "spam"
                  ? "var(--indicator-bg)"
                  : undefined,
            }}
            title={is_collapsed ? t("mail.spam") : undefined}
            onClick={() =>
              handle_nav_click(() => {
                set_selected_item("spam");
                navigate("/spam");
              })
            }
          >
            <ExclamationTriangleIcon
              className={`${is_collapsed ? "w-5 h-5" : "w-4 h-4"} transition-colors duration-150`}
              style={{
                color:
                  effective_selected === "spam"
                    ? "var(--text-primary)"
                    : "var(--text-muted)",
              }}
            />
            {!is_collapsed && (
              <>
                <span className="flex-1 text-left">{t("mail.spam")}</span>
                <CountBadge
                  count={stats.spam}
                  is_active={effective_selected === "spam"}
                />
              </>
            )}
          </button>

          <button
            ref={trash_ref}
            className={`sidebar-nav-btn group relative w-full flex items-center ${is_collapsed ? "justify-center" : "gap-2.5"} rounded-md ${is_collapsed ? "px-0" : "px-2.5"} h-8 text-[14px] transition-colors duration-150 ${is_collapsed && effective_selected === "trash" ? "sidebar-selected" : ""}`}
            style={{
              zIndex: 1,
              color:
                effective_selected === "trash"
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
              backgroundColor:
                is_collapsed && effective_selected === "trash"
                  ? "var(--indicator-bg)"
                  : undefined,
            }}
            title={is_collapsed ? t("mail.trash") : undefined}
            onClick={() =>
              handle_nav_click(() => {
                set_selected_item("trash");
                navigate("/trash");
              })
            }
          >
            <TrashIcon
              className={`${is_collapsed ? "w-5 h-5" : "w-4 h-4"} transition-colors duration-150`}
              style={{
                color:
                  effective_selected === "trash"
                    ? "var(--text-primary)"
                    : "var(--text-muted)",
              }}
            />
            {!is_collapsed && (
              <span className="flex-1 text-left">{t("mail.trash")}</span>
            )}
          </button>

          <button
            ref={contacts_ref}
            className={`sidebar-nav-btn group relative w-full flex items-center ${is_collapsed ? "justify-center" : "gap-2.5"} rounded-md ${is_collapsed ? "px-0" : "px-2.5"} h-8 text-[14px] transition-colors duration-150 ${is_collapsed && effective_selected === "contacts" ? "sidebar-selected" : ""}`}
            style={{
              zIndex: 1,
              color:
                effective_selected === "contacts"
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
              backgroundColor:
                is_collapsed && effective_selected === "contacts"
                  ? "var(--indicator-bg)"
                  : undefined,
            }}
            title={is_collapsed ? t("common.contacts") : undefined}
            onClick={() =>
              handle_nav_click(() => {
                set_selected_item("contacts");
                navigate("/contacts");
              })
            }
          >
            <UsersIcon
              className={`${is_collapsed ? "w-5 h-5" : "w-4 h-4"} transition-colors duration-150`}
              style={{
                color:
                  effective_selected === "contacts"
                    ? "var(--text-primary)"
                    : "var(--text-muted)",
              }}
            />
            {!is_collapsed && (
              <>
                <span className="flex-1 text-left">{t("common.contacts")}</span>
                <CountBadge
                  count={stats.contacts}
                  is_active={effective_selected === "contacts"}
                />
              </>
            )}
          </button>

          {!is_collapsed && (
            <div className="mt-5 mb-1 px-2.5" data-onboarding="folders-section">
              <div className="w-full flex items-center justify-between">
                <span
                  className="text-[10px] font-semibold uppercase tracking-[0.05em]"
                  style={{ color: "var(--text-muted)", opacity: 0.7 }}
                >
                  {t("common.folders")}
                </span>
                <button
                  className="p-0.5 rounded transition-all duration-150 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                  style={{ color: "var(--text-muted)" }}
                  onClick={() => set_is_create_folder_open(true)}
                >
                  <PlusIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {is_collapsed && (
            <div className="mt-3 flex justify-center">
              <button
                className="p-1.5 rounded transition-all duration-150 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                style={{ color: "var(--text-muted)" }}
                title="Create folder"
                onClick={() => set_is_create_folder_open(true)}
              >
                <PlusIcon className="w-4 h-4" />
              </button>
            </div>
          )}

          <div>
            {(() => {
              const all_folders = folders_state.folders.filter(
                (f) => !f.is_system,
              );
              const max_visible = is_collapsed ? 3 : 5;
              const has_more = all_folders.length > max_visible;
              const visible_folders = folders_expanded
                ? all_folders
                : all_folders.slice(0, max_visible);
              const hidden_count = all_folders.length - max_visible;

              return (
                <>
                  {visible_folders.map((folder) => {
                    const folder_item_id = `folder-${folder.folder_token}`;
                    const folder_color = folder.color || "#3b82f6";
                    const folder_data: FolderModalData = {
                      folder_id: folder.id,
                      folder_name: folder.name,
                      folder_token: folder.folder_token,
                      folder_color,
                    };

                    return (
                      <FolderContextMenu
                        key={folder.id}
                        folder_color={folder_color}
                        on_delete={() =>
                          handle_folder_modal(folder_data, "delete")
                        }
                        on_lock={() =>
                          handle_folder_lock(folder_data, folder.password_set)
                        }
                        on_recolor={() =>
                          handle_folder_modal(folder_data, "recolor")
                        }
                        on_rename={() =>
                          handle_folder_modal(folder_data, "rename")
                        }
                        password_set={folder.password_set}
                      >
                        <button
                          ref={(el) => {
                            folder_refs.current[folder.folder_token] = el;
                          }}
                          className={`sidebar-nav-btn group relative w-full flex items-center ${is_collapsed ? "justify-center" : "gap-2.5"} rounded-md ${is_collapsed ? "px-0" : "px-2.5"} h-8 text-[14px] transition-colors duration-150 ${is_collapsed && effective_selected === folder_item_id ? "sidebar-selected" : ""}`}
                          style={{
                            zIndex: 1,
                            color:
                              effective_selected === folder_item_id
                                ? "var(--text-primary)"
                                : "var(--text-secondary)",
                            backgroundColor:
                              is_collapsed &&
                              effective_selected === folder_item_id
                                ? "var(--indicator-bg)"
                                : undefined,
                          }}
                          title={is_collapsed ? folder.name : undefined}
                          onClick={() =>
                            handle_nav_click(() => {
                              if (folder.is_password_protected) {
                                if (!folder.password_set) {
                                  set_password_modal_folder({
                                    folder_id: folder.id,
                                    folder_name: folder.name,
                                    folder_token: folder.folder_token,
                                    mode: "setup",
                                  });

                                  return;
                                }
                                if (!is_folder_unlocked(folder.id)) {
                                  set_password_modal_folder({
                                    folder_id: folder.id,
                                    folder_name: folder.name,
                                    folder_token: folder.folder_token,
                                    mode: "unlock",
                                  });

                                  return;
                                }
                              }
                              set_selected_item(folder_item_id);
                              navigate(
                                `/folder/${encodeURIComponent(folder.folder_token)}`,
                              );
                            })
                          }
                        >
                          <div className="relative">
                            <FolderIcon
                              className={`${is_collapsed ? "w-5 h-5" : "w-4 h-4"}`}
                              style={{ color: folder_color }}
                            />
                            {(folder.is_locked ||
                              (folder.is_password_protected &&
                                (!folder.password_set ||
                                  !is_folder_unlocked(folder.id)))) && (
                              <LockClosedIcon
                                className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 p-0.5 rounded-full"
                                style={{
                                  color: "var(--text-primary)",
                                  backgroundColor: "var(--bg-secondary)",
                                }}
                              />
                            )}
                          </div>
                          {!is_collapsed && (
                            <>
                              <span className="flex-1 text-left truncate">
                                {folder.name}
                              </span>
                              <CountBadge
                                count={folder_counts[folder.folder_token] ?? 0}
                                is_active={
                                  effective_selected === folder_item_id
                                }
                              />
                              {(folder.is_locked ||
                                (folder.is_password_protected &&
                                  (!folder.password_set ||
                                    !is_folder_unlocked(folder.id)))) && (
                                <LockClosedIcon
                                  className="w-3 h-3 ml-1"
                                  style={{ color: "var(--text-muted)" }}
                                />
                              )}
                            </>
                          )}
                        </button>
                      </FolderContextMenu>
                    );
                  })}
                  {has_more && !is_collapsed && (
                    <button
                      className="w-full flex items-center gap-2 px-2.5 h-7 text-[12px] transition-colors duration-150 rounded-md hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                      style={{ color: "var(--text-muted)" }}
                      onClick={() => set_folders_expanded(!folders_expanded)}
                    >
                      {folders_expanded ? (
                        <ChevronUpIcon className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDownIcon className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {folders_expanded
                          ? "Show less"
                          : `${hidden_count} more folder${hidden_count > 1 ? "s" : ""}`}
                      </span>
                    </button>
                  )}
                  {all_folders.length === 0 &&
                    !folders_state.is_loading &&
                    !is_collapsed && (
                      <p
                        className="text-[11px] px-2.5 py-2"
                        style={{ color: "var(--text-muted)" }}
                      >
                        No folders yet
                      </p>
                    )}
                </>
              );
            })()}
          </div>
        </div>
      </div>

      <div className="mt-auto">
        <div
          className={`${is_collapsed ? "mx-2" : "mx-3"} mb-3 h-px`}
          style={{ backgroundColor: "var(--border-primary)" }}
        />

        <div className={`${is_collapsed ? "px-2" : "px-3"} pb-3`}>
          {!is_collapsed && (
            <>
              <div className="mb-2">
                <div className="relative">
                  {!text_logo_loaded && (
                    <Skeleton className="h-[18px] w-[72px] rounded" />
                  )}
                  <img
                    ref={text_logo_ref}
                    alt="Aster"
                    className={`h-[18px] select-none transition-opacity duration-150 ${text_logo_loaded ? "opacity-100" : "opacity-0"}`}
                    decoding="async"
                    draggable={false}
                    src="/text_logo.png"
                    onLoad={() => {
                      text_logo_cached = true;
                      set_text_logo_loaded(true);
                    }}
                  />
                </div>
              </div>

              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span
                    className="text-[10px] font-medium tracking-wide"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Storage used
                  </span>
                  <span
                    className="text-[10px] tabular-nums font-medium"
                    style={{
                      color:
                        storage_percentage > 90
                          ? "#ef4444"
                          : storage_percentage > 70
                            ? "#f59e0b"
                            : "var(--text-tertiary)",
                    }}
                  >
                    {storage_percentage.toFixed(0)}%
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full overflow-hidden bg-black/[0.05] dark:bg-white/[0.06]">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${storage_percentage}%`,
                      backgroundColor:
                        storage_percentage > 90
                          ? "#ef4444"
                          : storage_percentage > 70
                            ? "#f59e0b"
                            : "#3b82f6",
                    }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <p
                    className="text-[9px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {format_bytes(stats.storage_used_bytes)} of{" "}
                    {format_bytes(stats.storage_total_bytes || 1073741824)}
                  </p>
                  <button
                    className="text-[10px] font-medium px-2 py-1 rounded transition-all duration-150 hover:brightness-110 hover:-translate-y-[1px]"
                    style={{
                      background:
                        "linear-gradient(to bottom, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
                      color: "#ffffff",
                    }}
                    onClick={() => on_settings_click("billing")}
                  >
                    Upgrade
                  </button>
                </div>
              </div>
            </>
          )}

          {!is_collapsed && (
            <div className="flex items-center gap-1">
              <button
                className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
                style={{ color: "var(--text-muted)" }}
                onClick={() => {
                  on_modal_open?.();
                  set_is_invite_open(true);
                }}
              >
                <GiftIcon className="w-3.5 h-3.5" />
                <span>{t("common.invite_friends")}</span>
              </button>
              <button
                className="p-1.5 rounded-md transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
                style={{ color: "var(--text-muted)" }}
                onClick={() => on_settings_click()}
              >
                <Cog6ToothIcon className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
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
                initial={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={on_mobile_toggle}
              />
              <motion.div
                animate={{ x: 0 }}
                className="fixed top-0 left-0 h-full z-50"
                exit={{ x: -280 }}
                initial={{ x: -280 }}
                transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
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
