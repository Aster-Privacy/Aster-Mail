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
import type { RefObject } from "react";
import type { DecryptedFolder } from "@/hooks/use_folders";
import type { DecryptedTag } from "@/hooks/use_tags";
import type { User } from "@/services/account_manager";

import {
  AccountMenuSheetView,
  CreateAliasSheetView,
  CreateFolderSheetView,
  CreateLabelSheetView,
  EditFolderSheetView,
  EditTagSheetView,
} from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
import { MobileBottomSheet } from "@/components/mobile/mobile_bottom_sheet";
import { format_bytes } from "@/lib/utils";
import { TAG_COLOR_PRESETS, type TagIconName } from "@/components/ui/email_tag";
import { TagIconPicker } from "@/components/tags/tag_icon_picker";
import { FolderPasswordModal } from "@/components/folders/folder_password_modal";
import { prompt_alias_limit_upgrade } from "@/components/settings/aliases/feature_lock";
import {
  TurnstileWidget,
  type TurnstileWidgetRef,
} from "@/components/auth/turnstile_widget";
import mail_logo_url from "@/assets/mail_logo.webp";
import { show_upgrade_plans } from "@/stores/upgrade_store";
import { use_resubscribe } from "@/hooks/use_resubscribe";

interface AccountMenuSheetProps {
  is_open: boolean;
  on_close: () => void;
  user: User | null;
  storage_used: number;
  storage_total: number;
  storage_pct: number;
  handle_nav: (path: string) => void;
  handle_logout: () => void;
}

export function AccountMenuSheet({
  is_open,
  on_close,
  user,
  storage_used,
  storage_total,
  storage_pct,
  handle_nav,
  handle_logout,
}: AccountMenuSheetProps) {
  const { can_resubscribe, resubscribe } = use_resubscribe(is_open);
  const { t } = use_i18n();

  return (
    <MobileBottomSheet
      aria_label={t("settings.account")}
      is_open={is_open}
      on_close={on_close}
    >
      <AccountMenuSheetView
        email={user?.email ?? ""}
        logo_src={mail_logo_url}
        name={user?.display_name ?? user?.username ?? ""}
        settings_label={t("settings.title")}
        sign_out_label={t("auth.sign_out")}
        storage_detail={`${format_bytes(storage_used)} ${t("common.of")} ${format_bytes(storage_total)}`}
        storage_label={t("common.storage_used")}
        storage_pct={storage_pct}
        upgrade_label={
          can_resubscribe ? t("auth.resubscribe_to_aster") : t("common.upgrade")
        }
        on_settings={() => {
          on_close();
          handle_nav("/settings");
        }}
        on_sign_out={handle_logout}
        on_upgrade={() => {
          on_close();
          if (can_resubscribe) resubscribe();
          else show_upgrade_plans();
        }}
      />
    </MobileBottomSheet>
  );
}

interface CreateFolderSheetProps {
  is_open: boolean;
  on_close: () => void;
  folder_name: string;
  set_folder_name: (v: string) => void;
  folder_color: string;
  set_folder_color: (v: string) => void;
  folder_input_ref: React.Ref<HTMLInputElement>;
  handle_create: () => void;
  is_creating: boolean;
}

export function CreateFolderSheet({
  is_open,
  on_close,
  folder_name,
  set_folder_name,
  folder_color,
  set_folder_color,
  folder_input_ref,
  handle_create,
  is_creating,
}: CreateFolderSheetProps) {
  const { t } = use_i18n();

  return (
    <MobileBottomSheet
      aria_label={t("common.create_folder")}
      is_open={is_open}
      on_close={on_close}
    >
      <CreateFolderSheetView
        color={folder_color}
        colors={TAG_COLOR_PRESETS}
        input_ref={folder_input_ref}
        is_creating={is_creating}
        name={folder_name}
        placeholder={t("common.folders")}
        submit_label={t("common.create")}
        title={t("common.create_folder")}
        on_color_change={set_folder_color}
        on_name_change={set_folder_name}
        on_submit={handle_create}
      />
    </MobileBottomSheet>
  );
}

interface CreateLabelSheetProps {
  is_open: boolean;
  on_close: () => void;
  label_name: string;
  set_label_name: (v: string) => void;
  label_color: string;
  set_label_color: (v: string) => void;
  label_icon: string | undefined;
  set_label_icon: (v: string | undefined) => void;
  label_input_ref: React.Ref<HTMLInputElement>;
  is_creating: boolean;
  handle_create: () => void;
}

export function CreateLabelSheet({
  is_open,
  on_close,
  label_name,
  set_label_name,
  label_color,
  set_label_color,
  label_icon,
  set_label_icon,
  label_input_ref,
  handle_create,
  is_creating,
}: CreateLabelSheetProps) {
  const { t } = use_i18n();

  return (
    <MobileBottomSheet
      aria_label={t("common.create_label")}
      is_open={is_open}
      on_close={on_close}
    >
      <CreateLabelSheetView
        color={label_color}
        color_label={t("common.color_label")}
        colors={TAG_COLOR_PRESETS}
        icon={label_icon}
        icon_label={t("common.icon_label")}
        icon_picker={
          <TagIconPicker
            accent_color={label_color}
            on_select={set_label_icon}
            selected_icon={label_icon as TagIconName | undefined}
          />
        }
        input_ref={label_input_ref}
        is_creating={is_creating}
        name={label_name}
        placeholder={t("common.labels")}
        submit_label={t("common.create")}
        title={t("common.create_label")}
        on_color_change={set_label_color}
        on_name_change={set_label_name}
        on_submit={handle_create}
      />
    </MobileBottomSheet>
  );
}

interface EditFolderSheetProps {
  editing_folder: DecryptedFolder | null;
  on_close: () => void;
  edit_name: string;
  set_edit_name: (v: string) => void;
  edit_color: string;
  set_edit_color: (v: string) => void;
  handle_save: () => void;
  handle_delete: () => void;
}

export function EditFolderSheet({
  editing_folder,
  on_close,
  edit_name,
  set_edit_name,
  edit_color,
  set_edit_color,
  handle_save,
  handle_delete,
}: EditFolderSheetProps) {
  const { t } = use_i18n();
  const { preferences, update_preference } = use_preferences();

  const muted_tokens = preferences.muted_folder_tokens ?? [];
  const is_muted = editing_folder
    ? muted_tokens.includes(editing_folder.folder_token)
    : false;

  const toggle_notifications = () => {
    if (!editing_folder) return;

    const next = is_muted
      ? muted_tokens.filter((token) => token !== editing_folder.folder_token)
      : [...muted_tokens, editing_folder.folder_token];

    update_preference("muted_folder_tokens", next, true);
  };

  return (
    <MobileBottomSheet
      aria_label={t("common.edit_folder")}
      is_open={!!editing_folder}
      on_close={on_close}
    >
      <EditFolderSheetView
        color={edit_color}
        colors={TAG_COLOR_PRESETS}
        delete_label={t("common.delete")}
        name={edit_name}
        notifications_enabled={!is_muted}
        notifications_label={t("settings.notifications")}
        placeholder={t("common.folders")}
        save_label={t("common.save")}
        title={t("common.edit_folder")}
        on_color_change={set_edit_color}
        on_delete={handle_delete}
        on_name_change={set_edit_name}
        on_save={handle_save}
        on_toggle_notifications={toggle_notifications}
      />
    </MobileBottomSheet>
  );
}

interface EditTagSheetProps {
  editing_tag: DecryptedTag | null;
  on_close: () => void;
  edit_name: string;
  set_edit_name: (v: string) => void;
  edit_color: string;
  set_edit_color: (v: string) => void;
  edit_icon: string | undefined;
  set_edit_icon: (v: string | undefined) => void;
  handle_save: () => void;
  handle_delete: () => void;
}

const ignore_name_change = (): void => undefined;

export function EditTagSheet({
  editing_tag,
  on_close,
  edit_name,
  set_edit_name,
  edit_color,
  set_edit_color,
  edit_icon,
  set_edit_icon,
  handle_save,
  handle_delete,
}: EditTagSheetProps) {
  const { t } = use_i18n();

  return (
    <MobileBottomSheet
      aria_label={t("common.edit_label")}
      is_open={!!editing_tag}
      on_close={on_close}
    >
      <EditTagSheetView
        color={edit_color}
        color_label={t("common.color_label")}
        colors={TAG_COLOR_PRESETS}
        delete_label={t("common.delete")}
        icon={edit_icon}
        icon_label={t("common.icon_label")}
        icon_picker={
          <TagIconPicker
            accent_color={edit_color}
            on_select={set_edit_icon}
            selected_icon={edit_icon as TagIconName | undefined}
          />
        }
        name={edit_name}
        placeholder={t("common.labels")}
        save_label={t("common.save")}
        title={t("common.edit_label")}
        on_color_change={set_edit_color}
        on_delete={handle_delete}
        on_name_change={
          editing_tag?.is_undecryptable ? ignore_name_change : set_edit_name
        }
        on_save={handle_save}
      />
    </MobileBottomSheet>
  );
}

interface CreateAliasSheetProps {
  is_open: boolean;
  on_close: () => void;
  alias_local: string;
  set_alias_local: (v: string) => void;
  alias_error: string;
  set_alias_error: (v: string) => void;
  creating: boolean;
  handle_create: () => void;
  domain: string;
  at_limit?: boolean;
  captcha_token: string | null;
  set_captcha_token: (v: string | null) => void;
  turnstile_ref: RefObject<TurnstileWidgetRef>;
  turnstile_required: boolean;
}

export function CreateAliasSheet({
  is_open,
  on_close,
  alias_local,
  set_alias_local,
  alias_error,
  set_alias_error,
  creating,
  handle_create,
  domain,
  at_limit = false,
  captcha_token,
  set_captcha_token,
  turnstile_ref,
  turnstile_required,
}: CreateAliasSheetProps) {
  const { t } = use_i18n();

  return (
    <MobileBottomSheet
      aria_label={t("common.alias_limit_reached")}
      is_open={is_open}
      on_close={on_close}
    >
      <CreateAliasSheetView
        at_limit={at_limit}
        domain={domain}
        error={alias_error}
        is_creating={creating}
        limit_message={t("settings.upgrade_plan_more_aliases")}
        local_part={alias_local}
        placeholder={t("settings.alias_local_part_placeholder")}
        submit_blocked={turnstile_required && !captcha_token}
        submit_label={t("common.create")}
        title={
          at_limit
            ? t("common.alias_limit_reached")
            : t("settings.create_alias")
        }
        turnstile={
          turnstile_required ? (
            <TurnstileWidget
              ref={turnstile_ref}
              class_name="flex justify-center"
              on_expire={() => set_captcha_token(null)}
              on_verify={set_captcha_token}
            />
          ) : undefined
        }
        upgrade_label={t("settings.alias_feature_locked_upgrade_cta")}
        on_local_part_change={(value) => {
          set_alias_local(value);
          set_alias_error("");
        }}
        on_submit={handle_create}
        on_upgrade={() => {
          on_close();
          prompt_alias_limit_upgrade();
        }}
      />
    </MobileBottomSheet>
  );
}

interface PasswordModalWrapperProps {
  password_modal_folder: {
    folder_id: string;
    folder_name: string;
    folder_token: string;
    mode: "setup" | "unlock";
  } | null;
  on_close: () => void;
  on_success: () => void;
}

export function PasswordModalWrapper({
  password_modal_folder,
  on_close,
  on_success,
}: PasswordModalWrapperProps) {
  if (!password_modal_folder) return null;

  return (
    <FolderPasswordModal
      is_open
      folder_id={password_modal_folder.folder_id}
      folder_name={password_modal_folder.folder_name}
      mode={password_modal_folder.mode}
      on_close={on_close}
      on_success={on_success}
    />
  );
}
