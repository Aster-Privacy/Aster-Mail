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
import type { DecryptedFolder } from "@/hooks/use_folders";
import type { DecryptedTag } from "@/hooks/use_tags";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  useLayoutEffect,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDownIcon } from "@heroicons/react/24/outline";

import { use_platform } from "@/hooks/use_platform";
import { use_should_reduce_motion } from "@/provider";
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_folders } from "@/hooks/use_folders";
import { use_tags } from "@/hooks/use_tags";
import { use_mail_stats } from "@/hooks/use_mail_stats";
import { TAG_COLOR_PRESETS } from "@/components/ui/email_tag";
import { use_sidebar_aliases } from "@/hooks/use_sidebar_aliases";
import {
  create_alias,
  validate_local_part,
  check_alias_availability,
} from "@/services/api/aliases";
import { emit_aliases_changed } from "@/hooks/mail_events";
import {
  AccountMenuSheet,
  CreateFolderSheet,
  CreateLabelSheet,
  EditFolderSheet,
  EditTagSheet,
  CreateAliasSheet,
  PasswordModalWrapper,
  LogoutConfirmWrapper,
} from "@/components/mobile/mobile_drawer_sheets";
import { DrawerNavContent } from "@/components/mobile/mobile_drawer_nav";

interface MobileDrawerProps {
  is_open: boolean;
  on_close: () => void;
  on_navigate: (path: string) => void;
  active_path: string;
}

export const MobileDrawer = memo(function MobileDrawer({
  is_open,
  on_close,
  on_navigate,
  active_path,
}: MobileDrawerProps) {
  const { safe_area_insets } = use_platform();
  const reduce_motion = use_should_reduce_motion();
  const { user, logout } = use_auth();
  const { t } = use_i18n();
  const user_domain = useMemo(() => {
    const parts = user?.email?.split("@");

    return parts && parts.length === 2 ? parts[1] : "astermail.org";
  }, [user?.email]);
  const { preferences, update_preference, save_now } = use_preferences();
  const [show_logout_confirm, set_show_logout_confirm] = useState(false);
  const {
    state: folders_state,
    counts: folder_counts,
    create_new_folder,
    update_existing_folder,
    delete_existing_folder,
    toggle_folder_lock,
  } = use_folders();
  const {
    state: tags_state,
    counts: tag_counts,
    create_new_tag,
    update_existing_tag,
    delete_existing_tag,
  } = use_tags();
  const { aliases } = use_sidebar_aliases();
  const { stats } = use_mail_stats();

  const [show_account_menu, set_show_account_menu] = useState(false);
  const [show_create_folder, set_show_create_folder] = useState(false);
  const [show_create_label, set_show_create_label] = useState(false);
  const [new_folder_name, set_new_folder_name] = useState("");
  const [new_label_name, set_new_label_name] = useState("");
  const [new_folder_color, set_new_folder_color] = useState<string>(
    TAG_COLOR_PRESETS[10].hex,
  );
  const [new_label_color, set_new_label_color] = useState<string>(
    TAG_COLOR_PRESETS[10].hex,
  );
  const [new_label_icon, set_new_label_icon] = useState<string | undefined>(
    undefined,
  );
  const [show_create_alias, set_show_create_alias] = useState(false);
  const [new_alias_local, set_new_alias_local] = useState("");
  const [alias_error, set_alias_error] = useState("");
  const [creating_alias, set_creating_alias] = useState(false);
  const [password_modal_folder, set_password_modal_folder] = useState<{
    folder_id: string;
    folder_name: string;
    folder_token: string;
    mode: "setup" | "unlock";
  } | null>(null);
  const [editing_folder, set_editing_folder] = useState<DecryptedFolder | null>(
    null,
  );
  const [editing_tag, set_editing_tag] = useState<DecryptedTag | null>(null);
  const [edit_folder_name, set_edit_folder_name] = useState("");
  const [edit_folder_color, set_edit_folder_color] = useState("");
  const [edit_tag_name, set_edit_tag_name] = useState("");
  const [edit_tag_color, set_edit_tag_color] = useState("");
  const [edit_tag_icon, set_edit_tag_icon] = useState<string | undefined>(
    undefined,
  );
  const folder_input_ref = useRef<HTMLInputElement>(null);
  const label_input_ref = useRef<HTMLInputElement>(null);
  const nav_container_ref = useRef<HTMLDivElement>(null);
  const [indicator_style, set_indicator_style] = useState<{
    y: number;
    height: number;
    opacity: number;
  }>({ y: 0, height: 0, opacity: 0 });
  const drawer_scroll_ref = useRef<HTMLDivElement>(null);
  const bounce_content_ref = useRef<HTMLDivElement>(null);
  const bounce_touch_y = useRef(0);
  const bounce_origin_y = useRef(0);
  const is_bouncing = useRef(false);

  useEffect(() => {
    if (is_open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [is_open]);

  useEffect(() => {
    if (!is_open) return;

    const handle_back = (e: Event) => {
      if (show_logout_confirm) {
        e.preventDefault();
        set_show_logout_confirm(false);
      } else if (editing_folder) {
        e.preventDefault();
        set_editing_folder(null);
      } else if (editing_tag) {
        e.preventDefault();
        set_editing_tag(null);
      } else if (show_create_folder) {
        e.preventDefault();
        set_show_create_folder(false);
      } else if (show_create_label) {
        e.preventDefault();
        set_show_create_label(false);
      } else if (show_create_alias) {
        e.preventDefault();
        set_show_create_alias(false);
      } else if (show_account_menu) {
        e.preventDefault();
        set_show_account_menu(false);
      } else if (password_modal_folder) {
        e.preventDefault();
        set_password_modal_folder(null);
      } else {
        e.preventDefault();
        on_close();
      }
    };

    window.addEventListener("capacitor:backbutton", handle_back);

    return () =>
      window.removeEventListener("capacitor:backbutton", handle_back);
  }, [
    is_open,
    show_account_menu,
    show_create_folder,
    show_create_label,
    show_create_alias,
    editing_folder,
    editing_tag,
    password_modal_folder,
    show_logout_confirm,
    on_close,
  ]);

  useEffect(() => {
    if (!is_open) {
      set_show_account_menu(false);
      set_show_create_folder(false);
      set_show_create_label(false);
      set_new_folder_name("");
      set_new_label_name("");
      set_new_folder_color(TAG_COLOR_PRESETS[10].hex);
      set_new_label_color(TAG_COLOR_PRESETS[10].hex);
      set_new_label_icon(undefined);
      set_show_create_alias(false);
      set_new_alias_local("");
      set_alias_error("");
      set_editing_folder(null);
      set_editing_tag(null);
      set_password_modal_folder(null);
    }
  }, [is_open]);

  useEffect(() => {
    if (show_create_folder) {
      setTimeout(() => folder_input_ref.current?.focus(), 100);
    }
  }, [show_create_folder]);

  useEffect(() => {
    if (show_create_label) {
      setTimeout(() => label_input_ref.current?.focus(), 100);
    }
  }, [show_create_label]);

  useLayoutEffect(() => {
    if (!is_open || !nav_container_ref.current) return;
    const container = nav_container_ref.current;
    const active_btn = container.querySelector(
      "[data-nav-active='true']",
    ) as HTMLElement | null;

    if (!active_btn) {
      set_indicator_style((prev) => ({ ...prev, opacity: 0 }));

      return;
    }
    const container_rect = container.getBoundingClientRect();
    const btn_rect = active_btn.getBoundingClientRect();
    const y = Math.round(
      btn_rect.top - container_rect.top + container.scrollTop,
    );
    const height = Math.round(btn_rect.height);

    set_indicator_style({ y, height, opacity: 1 });
  }, [is_open, active_path]);

  const handle_nav = useCallback(
    (path: string) => {
      on_navigate(path);
      on_close();
    },
    [on_navigate, on_close],
  );

  const last_touch_y = useRef(0);

  const handle_bounce_touch_start = useCallback((e: React.TouchEvent) => {
    const y = e.touches[0].clientY;

    bounce_touch_y.current = y;
    last_touch_y.current = y;
    is_bouncing.current = false;
  }, []);

  const handle_bounce_touch_move = useCallback((e: React.TouchEvent) => {
    const el = drawer_scroll_ref.current;
    const content = bounce_content_ref.current;

    if (!el || !content) return;

    const current_y = e.touches[0].clientY;
    const incremental_delta = current_y - last_touch_y.current;

    last_touch_y.current = current_y;
    const at_top = el.scrollTop <= 0;
    const at_bottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;

    if (at_top && incremental_delta > 0) {
      if (!is_bouncing.current) {
        is_bouncing.current = true;
        bounce_origin_y.current = current_y;
      }
      const overscroll = (current_y - bounce_origin_y.current) * 0.4;

      content.style.transform = `translateY(${Math.min(Math.max(overscroll, 0), 80)}px)`;
      content.style.transition = "none";
    } else if (at_bottom && incremental_delta < 0) {
      if (!is_bouncing.current) {
        is_bouncing.current = true;
        bounce_origin_y.current = current_y;
      }
      const overscroll = (current_y - bounce_origin_y.current) * 0.4;

      content.style.transform = `translateY(${Math.max(Math.min(overscroll, 0), -80)}px)`;
      content.style.transition = "none";
    } else if (is_bouncing.current) {
      is_bouncing.current = false;
      content.style.transform = "translateY(0)";
      content.style.transition =
        "transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
    }
  }, []);

  const handle_bounce_touch_end = useCallback(() => {
    const content = bounce_content_ref.current;

    if (!content || !is_bouncing.current) return;
    is_bouncing.current = false;
    content.style.transform = "translateY(0)";
    content.style.transition =
      "transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
  }, []);

  const handle_create_folder = useCallback(async () => {
    const name = new_folder_name.trim();

    if (!name) return;
    await create_new_folder(name, new_folder_color);
    set_new_folder_name("");
    set_new_folder_color(TAG_COLOR_PRESETS[10].hex);
    set_show_create_folder(false);
  }, [new_folder_name, new_folder_color, create_new_folder]);

  const handle_create_label = useCallback(async () => {
    const name = new_label_name.trim();

    if (!name) return;
    await create_new_tag(name, new_label_color, new_label_icon);
    set_new_label_name("");
    set_new_label_color(TAG_COLOR_PRESETS[10].hex);
    set_new_label_icon(undefined);
    set_show_create_label(false);
  }, [new_label_name, new_label_color, new_label_icon, create_new_tag]);

  const handle_create_alias = useCallback(async () => {
    const trimmed = new_alias_local.trim().toLowerCase();
    const validation = validate_local_part(trimmed);

    if (!validation.valid) {
      set_alias_error(validation.error || t("settings.alias_invalid"));

      return;
    }

    set_creating_alias(true);
    set_alias_error("");

    try {
      const availability = await check_alias_availability(trimmed, user_domain);

      if (availability.data && !availability.data.available) {
        set_alias_error(t("settings.alias_already_taken"));
        set_creating_alias(false);

        return;
      }

      const result = await create_alias(trimmed, user_domain);

      if (result.data?.success) {
        emit_aliases_changed();
        set_new_alias_local("");
        set_alias_error("");
        set_show_create_alias(false);
      } else {
        set_alias_error(result.error || t("settings.alias_create_failed"));
      }
    } catch {
      set_alias_error(t("settings.alias_create_failed"));
    }

    set_creating_alias(false);
  }, [new_alias_local, user_domain]);

  const handle_open_edit_folder = useCallback((folder: DecryptedFolder) => {
    set_editing_folder(folder);
    set_edit_folder_name(folder.name);
    set_edit_folder_color(folder.color || TAG_COLOR_PRESETS[10].hex);
  }, []);

  const handle_save_folder = useCallback(async () => {
    if (!editing_folder) return;
    const name = edit_folder_name.trim();

    if (!name) return;
    await update_existing_folder(editing_folder.id, name, edit_folder_color);
    set_editing_folder(null);
  }, [
    editing_folder,
    edit_folder_name,
    edit_folder_color,
    update_existing_folder,
  ]);

  const handle_delete_folder = useCallback(async () => {
    if (!editing_folder) return;
    await delete_existing_folder(editing_folder.id);
    set_editing_folder(null);
  }, [editing_folder, delete_existing_folder]);

  const handle_open_edit_tag = useCallback((tag: DecryptedTag) => {
    set_editing_tag(tag);
    set_edit_tag_name(tag.name);
    set_edit_tag_color(tag.color || TAG_COLOR_PRESETS[10].hex);
    set_edit_tag_icon(tag.icon || undefined);
  }, []);

  const handle_save_tag = useCallback(async () => {
    if (!editing_tag) return;
    const name = edit_tag_name.trim();

    if (!name) return;
    await update_existing_tag(
      editing_tag.id,
      name,
      edit_tag_color,
      edit_tag_icon,
    );
    set_editing_tag(null);
  }, [
    editing_tag,
    edit_tag_name,
    edit_tag_color,
    edit_tag_icon,
    update_existing_tag,
  ]);

  const handle_delete_tag = useCallback(async () => {
    if (!editing_tag) return;
    await delete_existing_tag(editing_tag.id);
    set_editing_tag(null);
  }, [editing_tag, delete_existing_tag]);

  const handle_toggle_lock = useCallback(
    async (folder_id: string, is_currently_locked: boolean) => {
      await toggle_folder_lock(folder_id, !is_currently_locked);
    },
    [toggle_folder_lock],
  );

  const do_logout = useCallback(async () => {
    set_show_logout_confirm(false);
    set_show_account_menu(false);
    on_close();
    await logout();
  }, [logout, on_close]);

  const handle_logout = useCallback(() => {
    set_show_account_menu(false);
    if (preferences.skip_logout_confirmation) {
      do_logout();
    } else {
      setTimeout(() => set_show_logout_confirm(true), 300);
    }
  }, [preferences.skip_logout_confirmation, do_logout]);

  const handle_logout_dont_ask_again = useCallback(async () => {
    update_preference("skip_logout_confirmation", true);
    await save_now();
  }, [update_preference, save_now]);

  const folders = folders_state.folders ?? [];
  const tags = tags_state.tags ?? [];

  const storage_used = stats.storage_used_bytes;
  const storage_total = stats.storage_total_bytes;
  const storage_pct =
    storage_total > 0 ? Math.round((storage_used / storage_total) * 100) : 0;

  return (
    <>
      <AnimatePresence>
        {is_open && (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 bg-black/50"
            exit={{ opacity: 0 }}
            initial={reduce_motion ? false : { opacity: 0 }}
            transition={{ duration: reduce_motion ? 0 : 0.2 }}
            onClick={on_close}
          />
        )}
      </AnimatePresence>

      <motion.nav
        animate={{ x: is_open ? 0 : -320 }}
        className="fixed inset-y-0 left-0 z-50 flex w-80 max-w-[85vw] flex-col"
        initial={false}
        style={{
          paddingTop: safe_area_insets.top,
          paddingBottom: safe_area_insets.bottom,
          backgroundColor: "var(--mobile-sidebar-bg, var(--bg-primary))",
          willChange: "transform",
          pointerEvents: is_open ? "auto" : "none",
        }}
        transition={
          reduce_motion
            ? { duration: 0 }
            : { type: "tween", duration: 0.25, ease: "easeOut" }
        }
        onAnimationComplete={(definition) => {
          if (
            typeof definition === "object" &&
            "x" in definition &&
            definition.x === -320
          ) {
            const el = nav_container_ref.current?.closest("nav");

            if (el) el.style.visibility = "hidden";
          }
        }}
        onAnimationStart={() => {
          const el = nav_container_ref.current?.closest("nav");

          if (el) el.style.visibility = "visible";
        }}
      >
        <div className="px-4 pb-4 pt-5">
          <button
            className="flex w-full items-center gap-3.5"
            type="button"
            onClick={() => set_show_account_menu(true)}
          >
            <div className="relative h-11 w-11 shrink-0">
              <img
                alt="Aster"
                className="h-full w-full select-none rounded-xl"
                draggable={false}
                src="/mail_logo.webp"
              />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block truncate text-left text-[17px] font-semibold text-[var(--text-primary)]">
                Aster Mail
              </span>
              <span className="block truncate text-left text-[13px] text-[var(--text-muted)]">
                {user?.email ?? ""}
              </span>
            </div>
            <ChevronDownIcon className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
          </button>
        </div>

        <div
          ref={drawer_scroll_ref}
          className="flex-1 overflow-y-auto overscroll-y-auto px-2.5 pb-2 pt-0.5"
          style={{ WebkitOverflowScrolling: "touch" }}
          onTouchEnd={handle_bounce_touch_end}
          onTouchMove={handle_bounce_touch_move}
          onTouchStart={handle_bounce_touch_start}
        >
          <div ref={bounce_content_ref}>
            <DrawerNavContent
              active_path={active_path}
              aliases={aliases}
              folder_counts={folder_counts}
              folders={folders}
              handle_nav={handle_nav}
              indicator_style={indicator_style}
              nav_container_ref={nav_container_ref}
              on_open_create_alias={() => {
                set_show_create_folder(false);
                set_show_create_label(false);
                set_show_create_alias(true);
              }}
              on_open_create_folder={() => {
                set_show_create_label(false);
                set_show_create_alias(false);
                set_show_create_folder(true);
              }}
              on_open_create_label={() => {
                set_show_create_folder(false);
                set_show_create_alias(false);
                set_show_create_label(true);
              }}
              on_open_edit_folder={handle_open_edit_folder}
              on_open_edit_tag={handle_open_edit_tag}
              on_password_modal={set_password_modal_folder}
              on_toggle_lock={handle_toggle_lock}
              stats={stats}
              tag_counts={tag_counts}
              tags={tags}
            />
          </div>
        </div>
      </motion.nav>

      <AccountMenuSheet
        handle_logout={handle_logout}
        handle_nav={handle_nav}
        is_open={show_account_menu}
        on_close={() => set_show_account_menu(false)}
        storage_pct={storage_pct}
        storage_total={storage_total}
        storage_used={storage_used}
        user={user}
      />

      <CreateFolderSheet
        folder_color={new_folder_color}
        folder_input_ref={folder_input_ref}
        folder_name={new_folder_name}
        handle_create={handle_create_folder}
        is_open={show_create_folder}
        on_close={() => {
          set_show_create_folder(false);
          set_new_folder_name("");
          set_new_folder_color(TAG_COLOR_PRESETS[10].hex);
        }}
        set_folder_color={set_new_folder_color}
        set_folder_name={set_new_folder_name}
      />

      <CreateLabelSheet
        handle_create={handle_create_label}
        is_open={show_create_label}
        label_color={new_label_color}
        label_icon={new_label_icon}
        label_input_ref={label_input_ref}
        label_name={new_label_name}
        on_close={() => {
          set_show_create_label(false);
          set_new_label_name("");
          set_new_label_color(TAG_COLOR_PRESETS[10].hex);
          set_new_label_icon(undefined);
        }}
        set_label_color={set_new_label_color}
        set_label_icon={set_new_label_icon}
        set_label_name={set_new_label_name}
      />

      <EditFolderSheet
        edit_color={edit_folder_color}
        edit_name={edit_folder_name}
        editing_folder={editing_folder}
        handle_delete={handle_delete_folder}
        handle_save={handle_save_folder}
        on_close={() => set_editing_folder(null)}
        set_edit_color={set_edit_folder_color}
        set_edit_name={set_edit_folder_name}
      />

      <EditTagSheet
        edit_color={edit_tag_color}
        edit_icon={edit_tag_icon}
        edit_name={edit_tag_name}
        editing_tag={editing_tag}
        handle_delete={handle_delete_tag}
        handle_save={handle_save_tag}
        on_close={() => set_editing_tag(null)}
        set_edit_color={set_edit_tag_color}
        set_edit_icon={set_edit_tag_icon}
        set_edit_name={set_edit_tag_name}
      />

      <CreateAliasSheet
        alias_error={alias_error}
        alias_local={new_alias_local}
        creating={creating_alias}
        domain={user_domain}
        handle_create={handle_create_alias}
        is_open={show_create_alias}
        on_close={() => {
          set_show_create_alias(false);
          set_new_alias_local("");
          set_alias_error("");
        }}
        set_alias_error={set_alias_error}
        set_alias_local={set_new_alias_local}
      />

      <PasswordModalWrapper
        on_close={() => set_password_modal_folder(null)}
        on_success={() => {
          const token = password_modal_folder!.folder_token;

          set_password_modal_folder(null);
          handle_nav(`/folder/${encodeURIComponent(token)}`);
        }}
        password_modal_folder={password_modal_folder}
      />

      <LogoutConfirmWrapper
        is_open={show_logout_confirm}
        on_cancel={() => set_show_logout_confirm(false)}
        on_confirm={do_logout}
        on_dont_ask_again={handle_logout_dont_ask_again}
      />
    </>
  );
});
