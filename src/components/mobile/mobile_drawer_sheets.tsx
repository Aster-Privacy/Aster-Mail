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
import type { User } from "@/services/account_manager";

import {
  Cog6ToothIcon,
  ArrowRightStartOnRectangleIcon,
  FolderIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { MobileBottomSheet } from "@/components/mobile/mobile_bottom_sheet";
import { Input } from "@/components/ui/input";
import { format_bytes } from "@/lib/utils";
import {
  TAG_COLOR_PRESETS,
  tag_icon_map,
  TAG_ICONS,
} from "@/components/ui/email_tag";
import { FolderPasswordModal } from "@/components/folders/folder_password_modal";

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
  const { t } = use_i18n();

  return (
    <MobileBottomSheet is_open={is_open} on_close={on_close}>
      <div className="px-4 pb-4">
        <div className="flex items-center gap-3 pb-4">
          <div className="relative h-9 w-9 shrink-0">
            <img
              alt="Aster"
              className="h-full w-full select-none rounded-lg"
              draggable={false}
              src="/mail_logo.webp"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-[var(--text-primary)]">
              {user?.display_name ?? user?.username ?? ""}
            </p>
            <p className="truncate text-[12px] text-[var(--text-muted)]">
              {user?.email ?? ""}
            </p>
          </div>
        </div>
        <div className="mb-3 px-1">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-medium tracking-wide text-[var(--text-muted)]">
              {t("common.storage_used")}
            </span>
            <span
              className="text-[11px] font-medium tabular-nums"
              style={{
                color:
                  storage_pct > 90
                    ? "var(--color-danger)"
                    : storage_pct > 70
                      ? "var(--color-warning)"
                      : "var(--text-tertiary, var(--text-muted))",
              }}
            >
              {storage_pct}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/[0.05] dark:bg-white/[0.06]">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(storage_pct, 100)}%`,
                backgroundColor:
                  storage_pct > 90
                    ? "var(--color-danger)"
                    : storage_pct > 70
                      ? "var(--color-warning)"
                      : "var(--color-info)",
              }}
            />
          </div>
          <p className="mt-1 text-[10px] text-[var(--text-muted)]">
            {format_bytes(storage_used)} of {format_bytes(storage_total)}
          </p>
        </div>

        <div className="space-y-1">
          <Button
            className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[14px] font-medium"
            type="button"
            variant="depth"
            onClick={() => {
              on_close();
              handle_nav("/settings");
            }}
          >
            {t("common.upgrade")}
          </Button>
          <button
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left active:bg-[var(--bg-tertiary)]"
            type="button"
            onClick={() => {
              on_close();
              handle_nav("/settings");
            }}
          >
            <Cog6ToothIcon className="h-5 w-5 text-[var(--text-muted)]" />
            <span className="text-[15px] text-[var(--text-primary)]">
              {t("settings.title")}
            </span>
          </button>
          <button
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left active:bg-[var(--bg-tertiary)]"
            type="button"
            onClick={handle_logout}
          >
            <ArrowRightStartOnRectangleIcon className="h-5 w-5 text-[var(--color-danger,#ef4444)]" />
            <span className="text-[15px] text-[var(--color-danger,#ef4444)]">
              {t("auth.sign_out")}
            </span>
          </button>
        </div>
      </div>
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
}: CreateFolderSheetProps) {
  const { t } = use_i18n();

  return (
    <MobileBottomSheet is_open={is_open} on_close={on_close}>
      <div className="px-4 pb-4">
        <p className="mb-4 text-[16px] font-semibold text-[var(--text-primary)]">
          {t("common.create_folder")}
        </p>
        <div className="mb-3 flex items-center gap-3">
          <FolderIcon
            className="h-6 w-6 shrink-0"
            style={{ color: folder_color }}
          />
          <Input
            ref={folder_input_ref}
            className="flex-1"
            placeholder={t("common.folders")}
            value={folder_name}
            onChange={(e) => set_folder_name(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handle_create();
            }}
          />
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {TAG_COLOR_PRESETS.map((color) => (
            <button
              key={color.hex}
              className="h-7 w-7 rounded-full"
              style={{
                backgroundColor: color.hex,
                boxShadow:
                  folder_color === color.hex
                    ? `0 0 0 2px var(--bg-primary), 0 0 0 4px ${color.hex}`
                    : "none",
              }}
              type="button"
              onClick={() => set_folder_color(color.hex)}
            />
          ))}
        </div>
        <Button
          className="mt-1 w-full rounded-xl py-3 text-[15px] font-medium"
          type="button"
          variant="depth"
          onClick={handle_create}
        >
          {t("common.create")}
        </Button>
      </div>
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
}: CreateLabelSheetProps) {
  const { t } = use_i18n();

  return (
    <MobileBottomSheet is_open={is_open} on_close={on_close}>
      <div className="px-4 pb-4">
        <p className="mb-4 text-[16px] font-semibold text-[var(--text-primary)]">
          {t("common.create_label")}
        </p>
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center">
            {label_icon && tag_icon_map[label_icon] ? (
              (() => {
                const Icon = tag_icon_map[label_icon];

                return (
                  <Icon className="h-5 w-5" style={{ color: label_color }} />
                );
              })()
            ) : (
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: label_color }}
              />
            )}
          </span>
          <Input
            ref={label_input_ref}
            className="flex-1"
            placeholder={t("common.labels")}
            value={label_name}
            onChange={(e) => set_label_name(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handle_create();
            }}
          />
        </div>
        <p className="mb-1.5 text-[12px] font-medium text-[var(--text-muted)]">
          {t("common.color_label")}
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          {TAG_COLOR_PRESETS.map((color) => (
            <button
              key={color.hex}
              className="h-7 w-7 rounded-full"
              style={{
                backgroundColor: color.hex,
                boxShadow:
                  label_color === color.hex
                    ? `0 0 0 2px var(--bg-primary), 0 0 0 4px ${color.hex}`
                    : "none",
              }}
              type="button"
              onClick={() => set_label_color(color.hex)}
            />
          ))}
        </div>
        <p className="mb-1.5 text-[12px] font-medium text-[var(--text-muted)]">
          {t("common.icon_label")}
        </p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[11px]"
            style={{
              backgroundColor: !label_icon
                ? "var(--indicator-bg, var(--bg-tertiary))"
                : "transparent",
              border: !label_icon
                ? "1px solid var(--border-primary)"
                : "1px solid transparent",
              color: "var(--text-muted)",
            }}
            type="button"
            onClick={() => set_label_icon(undefined)}
          >
            &mdash;
          </button>
          {TAG_ICONS.map((icon_name) => {
            const IconComponent = tag_icon_map[icon_name];

            return (
              <button
                key={icon_name}
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{
                  backgroundColor:
                    label_icon === icon_name
                      ? "var(--indicator-bg, var(--bg-tertiary))"
                      : "transparent",
                  border:
                    label_icon === icon_name
                      ? "1px solid var(--border-primary)"
                      : "1px solid transparent",
                  color:
                    label_icon === icon_name
                      ? label_color
                      : "var(--text-muted)",
                }}
                type="button"
                onClick={() => set_label_icon(icon_name)}
              >
                {IconComponent && <IconComponent className="h-4 w-4" />}
              </button>
            );
          })}
        </div>
        <Button
          className="mt-1 w-full rounded-xl py-3 text-[15px] font-medium"
          type="button"
          variant="depth"
          onClick={handle_create}
        >
          {t("common.create")}
        </Button>
      </div>
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

  return (
    <MobileBottomSheet is_open={!!editing_folder} on_close={on_close}>
      <div className="px-4 pb-4">
        <p className="mb-4 text-[16px] font-semibold text-[var(--text-primary)]">
          {t("common.edit_folder")}
        </p>
        <div className="mb-3 flex items-center gap-3">
          <FolderIcon
            className="h-6 w-6 shrink-0"
            style={{ color: edit_color }}
          />
          <Input
            className="flex-1"
            placeholder={t("common.folders")}
            value={edit_name}
            onChange={(e) => set_edit_name(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handle_save();
            }}
          />
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {TAG_COLOR_PRESETS.map((color) => (
            <button
              key={color.hex}
              className="h-7 w-7 rounded-full"
              style={{
                backgroundColor: color.hex,
                boxShadow:
                  edit_color === color.hex
                    ? `0 0 0 2px var(--bg-primary), 0 0 0 4px ${color.hex}`
                    : "none",
              }}
              type="button"
              onClick={() => set_edit_color(color.hex)}
            />
          ))}
        </div>
        <div className="flex gap-2">
          <Button
            className="flex-1 rounded-xl py-3 text-[15px] font-medium"
            type="button"
            variant="depth"
            onClick={handle_save}
          >
            {t("common.save")}
          </Button>
          <button
            className="rounded-xl px-5 py-3 text-[15px] font-medium text-white transition-all "
            style={{
              background: "linear-gradient(180deg, #ef4444 0%, #dc2626 100%)",
            }}
            type="button"
            onClick={handle_delete}
          >
            {t("common.delete")}
          </button>
        </div>
      </div>
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
    <MobileBottomSheet is_open={!!editing_tag} on_close={on_close}>
      <div className="px-4 pb-4">
        <p className="mb-4 text-[16px] font-semibold text-[var(--text-primary)]">
          {t("common.edit_label")}
        </p>
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center">
            {edit_icon && tag_icon_map[edit_icon] ? (
              (() => {
                const Icon = tag_icon_map[edit_icon];

                return (
                  <Icon className="h-5 w-5" style={{ color: edit_color }} />
                );
              })()
            ) : (
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: edit_color }}
              />
            )}
          </span>
          <Input
            className="flex-1"
            placeholder={t("common.labels")}
            value={edit_name}
            onChange={(e) => set_edit_name(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handle_save();
            }}
          />
        </div>
        <p className="mb-1.5 text-[12px] font-medium text-[var(--text-muted)]">
          {t("common.color_label")}
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          {TAG_COLOR_PRESETS.map((color) => (
            <button
              key={color.hex}
              className="h-7 w-7 rounded-full"
              style={{
                backgroundColor: color.hex,
                boxShadow:
                  edit_color === color.hex
                    ? `0 0 0 2px var(--bg-primary), 0 0 0 4px ${color.hex}`
                    : "none",
              }}
              type="button"
              onClick={() => set_edit_color(color.hex)}
            />
          ))}
        </div>
        <p className="mb-1.5 text-[12px] font-medium text-[var(--text-muted)]">
          {t("common.icon_label")}
        </p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[11px]"
            style={{
              backgroundColor: !edit_icon
                ? "var(--indicator-bg, var(--bg-tertiary))"
                : "transparent",
              border: !edit_icon
                ? "1px solid var(--border-primary)"
                : "1px solid transparent",
              color: "var(--text-muted)",
            }}
            type="button"
            onClick={() => set_edit_icon(undefined)}
          >
            &mdash;
          </button>
          {TAG_ICONS.map((icon_name) => {
            const IconComponent = tag_icon_map[icon_name];

            return (
              <button
                key={icon_name}
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{
                  backgroundColor:
                    edit_icon === icon_name
                      ? "var(--indicator-bg, var(--bg-tertiary))"
                      : "transparent",
                  border:
                    edit_icon === icon_name
                      ? "1px solid var(--border-primary)"
                      : "1px solid transparent",
                  color:
                    edit_icon === icon_name ? edit_color : "var(--text-muted)",
                }}
                type="button"
                onClick={() => set_edit_icon(icon_name)}
              >
                {IconComponent && <IconComponent className="h-4 w-4" />}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <Button
            className="flex-1 rounded-xl py-3 text-[15px] font-medium"
            type="button"
            variant="depth"
            onClick={handle_save}
          >
            {t("common.save")}
          </Button>
          <button
            className="rounded-xl px-5 py-3 text-[15px] font-medium text-white transition-all "
            style={{
              background: "linear-gradient(180deg, #ef4444 0%, #dc2626 100%)",
            }}
            type="button"
            onClick={handle_delete}
          >
            {t("common.delete")}
          </button>
        </div>
      </div>
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
}: CreateAliasSheetProps) {
  const { t } = use_i18n();

  return (
    <MobileBottomSheet is_open={is_open} on_close={on_close}>
      <div className="px-4 pb-4">
        <p className="mb-4 text-[16px] font-semibold text-[var(--text-primary)]">
          {t("settings.create_alias")}
        </p>
        <div className="mb-3 flex items-center gap-0">
          <Input
            className="flex-1 !rounded-r-none"
            disabled={creating}
            placeholder={t("settings.alias_local_part_placeholder")}
            status={alias_error ? "error" : "default"}
            value={alias_local}
            onChange={(e) => {
              set_alias_local(e.target.value);
              set_alias_error("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handle_create();
            }}
          />
          <span className="rounded-r-xl bg-[var(--bg-tertiary)] px-3 py-3 text-[15px] text-[var(--text-muted)] select-none">
            @{domain}
          </span>
        </div>
        {alias_error && (
          <p className="mb-3 text-[13px] text-red-500">{alias_error}</p>
        )}
        <Button
          className="w-full rounded-xl py-3 text-[15px] font-medium"
          disabled={!alias_local.trim() || creating}
          type="button"
          variant="depth"
          onClick={handle_create}
        >
          {creating ? t("common.creating") : t("common.create")}
        </Button>
      </div>
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

interface LogoutConfirmWrapperProps {
  is_open: boolean;
  on_cancel: () => void;
  on_confirm: () => void;
  on_dont_ask_again: () => void;
}

export function LogoutConfirmWrapper({
  is_open,
  on_cancel,
  on_confirm,
  on_dont_ask_again,
}: LogoutConfirmWrapperProps) {
  const { t } = use_i18n();

  return (
    <ConfirmationModal
      show_dont_ask_again
      cancel_text={t("common.cancel")}
      confirm_text={t("auth.sign_out")}
      is_open={is_open}
      message={t("common.sign_out_confirmation")}
      on_cancel={on_cancel}
      on_confirm={on_confirm}
      on_dont_ask_again={on_dont_ask_again}
      title={t("auth.sign_out")}
      variant="danger"
    />
  );
}
