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
import { useState, useEffect, useMemo } from "react";
import {
  LockClosedIcon,
  PencilIcon,
  FolderIcon,
  TrashIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { TAG_COLOR_PRESETS } from "@/components/ui/email_tag";
import { use_folders } from "@/hooks/use_folders";
import { use_i18n } from "@/lib/i18n/context";

const MAX_FOLDER_NAME_LENGTH = 100;

interface FolderManagementModalProps {
  is_open: boolean;
  on_close: () => void;
  on_deleted?: () => void;
  folder_id: string;
  folder_name: string;
  folder_color: string;
  is_locked: boolean;
  hasChildren?: boolean;
  action: "encrypt" | "rename" | "recolor" | "delete" | null;
}

export function FolderManagementModal({
  is_open,
  on_close,
  on_deleted,
  folder_id,
  folder_name,
  folder_color,
  is_locked,
  hasChildren,
  action,
}: FolderManagementModalProps) {
  const { t } = use_i18n();
  const {
    update_existing_folder,
    delete_existing_folder,
    toggle_folder_lock,
    state: folders_state,
  } = use_folders();

  const [new_name, set_new_name] = useState(folder_name);
  const [new_color, set_new_color] = useState(folder_color);
  const [is_loading, set_is_loading] = useState(false);
  const [error, set_error] = useState("");

  const trimmed_name = new_name.trim();

  const rename_validation_error = useMemo(() => {
    if (!trimmed_name) return null;
    if (trimmed_name.length > MAX_FOLDER_NAME_LENGTH) {
      return t("common.folder_name_too_long", { max: MAX_FOLDER_NAME_LENGTH });
    }
    if (trimmed_name.toLowerCase() === folder_name.toLowerCase()) {
      return null;
    }
    const duplicate_exists = folders_state.folders.some(
      (f) =>
        f.id !== folder_id &&
        f.name.toLowerCase() === trimmed_name.toLowerCase(),
    );

    if (duplicate_exists) {
      return t("common.folder_already_exists");
    }

    return null;
  }, [trimmed_name, folder_name, folder_id, folders_state.folders]);

  const can_rename = trimmed_name && !rename_validation_error;

  useEffect(() => {
    set_new_name(folder_name);
    set_new_color(folder_color);
    set_error("");
  }, [folder_name, folder_color, is_open]);

  const handle_rename = async () => {
    if (!trimmed_name) {
      set_error(t("common.folder_name_cannot_be_empty"));

      return;
    }

    if (rename_validation_error) {
      set_error(rename_validation_error);

      return;
    }

    set_is_loading(true);
    set_error("");

    const success = await update_existing_folder(folder_id, trimmed_name);

    set_is_loading(false);

    if (success) {
      on_close();
    } else {
      set_error(t("common.failed_to_rename_folder"));
    }
  };

  const handle_recolor = async () => {
    set_is_loading(true);
    set_error("");

    const success = await update_existing_folder(
      folder_id,
      undefined,
      new_color,
    );

    set_is_loading(false);

    if (success) {
      on_close();
    } else {
      set_error(t("common.failed_to_change_folder_color"));
    }
  };

  const handle_delete = async () => {
    set_is_loading(true);
    set_error("");

    const success = await delete_existing_folder(folder_id);

    set_is_loading(false);

    if (success) {
      on_deleted?.();
      on_close();
    } else {
      set_error(t("common.failed_to_delete_folder"));
    }
  };

  const handle_encrypt = async () => {
    set_is_loading(true);
    set_error("");

    const success = await toggle_folder_lock(folder_id, !is_locked);

    set_is_loading(false);

    if (success) {
      on_close();
    } else {
      set_error(t("common.failed_to_update_folder_encryption"));
    }
  };

  const render_content = () => {
    switch (action) {
      case "encrypt":
        return (
          <>
            <ModalHeader>
              <div className="flex items-center gap-3">
                {is_locked ? (
                  <ShieldCheckIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
                ) : (
                  <LockClosedIcon className="w-5 h-5 text-blue-500 flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <ModalTitle>
                    {is_locked
                      ? t("common.unlock_folder")
                      : t("common.lock_folder")}
                  </ModalTitle>
                  <ModalDescription>{folder_name}</ModalDescription>
                </div>
              </div>
            </ModalHeader>

            <ModalBody>
              {!is_locked && (
                <div
                  className="rounded-lg p-4 mb-4 border"
                  style={{
                    backgroundColor: "rgba(59, 130, 246, 0.12)",
                    borderColor: "rgba(59, 130, 246, 0.35)",
                  }}
                >
                  <div className="flex items-start gap-3">
                    <ShieldCheckIcon className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-1">
                        {t("common.extra_protection_layer")}
                      </p>
                      <p className="text-xs text-txt-secondary">
                        {t("common.lock_folder_description")}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <p className="text-[14px] text-txt-secondary">
                {is_locked
                  ? t("common.unlock_folder_description")
                  : t("common.lock_extra_security")}
              </p>

              {error && (
                <p className="text-[13px] text-red-500 mt-4">{error}</p>
              )}
            </ModalBody>

            <ModalFooter>
              <Button
                className="flex-1"
                disabled={is_loading}
                size="xl"
                variant="outline"
                onClick={on_close}
              >
                {t("common.cancel")}
              </Button>
              <Button
                className="flex-1"
                disabled={is_loading}
                size="xl"
                variant={is_locked ? "destructive" : "primary"}
                onClick={handle_encrypt}
              >
                {is_loading
                  ? t("common.processing")
                  : is_locked
                    ? t("common.unlock_folder")
                    : t("common.lock_folder")}
              </Button>
            </ModalFooter>
          </>
        );

      case "rename":
        return (
          <>
            <ModalHeader>
              <div className="flex items-center gap-3">
                <PencilIcon className="w-5 h-5 text-blue-500 flex-shrink-0" />
                <div className="min-w-0">
                  <ModalTitle>{t("common.rename_folder")}</ModalTitle>
                  <ModalDescription>
                    {t("common.rename_folder_description")}
                  </ModalDescription>
                </div>
              </div>
            </ModalHeader>

            <ModalBody>
              <label
                className="block text-[13px] font-medium mb-2 text-txt-secondary"
                htmlFor="folder-rename"
              >
                {t("common.folder_name")}
              </label>
              <Input
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                className="w-full"
                id="folder-rename"
                placeholder={t("common.enter_folder_name")}
                status={rename_validation_error || error ? "error" : "default"}
                type="text"
                value={new_name}
                onChange={(e) => set_new_name(e.target.value)}
                onKeyDown={(e) => e["key"] === "Enter" && handle_rename()}
              />

              {(rename_validation_error || error) && (
                <p className="text-[13px] text-red-500 mt-3">
                  {rename_validation_error || error}
                </p>
              )}
            </ModalBody>

            <ModalFooter>
              <Button
                className="flex-1"
                disabled={is_loading}
                size="xl"
                variant="outline"
                onClick={on_close}
              >
                {t("common.cancel")}
              </Button>
              <Button
                className="flex-1"
                disabled={is_loading || !can_rename}
                size="xl"
                variant="depth"
                onClick={handle_rename}
              >
                {is_loading ? `${t("common.rename")}...` : t("common.rename")}
              </Button>
            </ModalFooter>
          </>
        );

      case "recolor":
        return (
          <>
            <ModalHeader>
              <div className="flex items-center gap-3">
                <FolderIcon
                  className="w-5 h-5 flex-shrink-0"
                  style={{ color: folder_color }}
                />
                <div className="min-w-0">
                  <ModalTitle>{t("common.change_folder_color")}</ModalTitle>
                  <ModalDescription>{folder_name}</ModalDescription>
                </div>
              </div>
            </ModalHeader>

            <ModalBody>
              <label
                className="block text-[13px] font-medium mb-3 text-txt-secondary"
                htmlFor="folder-color"
              >
                {t("common.select_a_color")}
              </label>
              <div className="flex flex-wrap gap-2">
                {TAG_COLOR_PRESETS.map((color) => (
                  <button
                    key={color.hex}
                    className="w-9 h-9 rounded-full"
                    style={{
                      backgroundColor: color.hex,
                      boxShadow:
                        new_color === color.hex
                          ? `0 0 0 2px var(--modal-bg), 0 0 0 4px ${color.hex}`
                          : "none",
                    }}
                    title={color.name}
                    onClick={() => set_new_color(color.hex)}
                  />
                ))}
              </div>

              {error && (
                <p className="text-[13px] text-red-500 mt-4">{error}</p>
              )}
            </ModalBody>

            <ModalFooter>
              <Button
                className="flex-1"
                disabled={is_loading}
                size="xl"
                variant="outline"
                onClick={on_close}
              >
                {t("common.cancel")}
              </Button>
              <Button
                className="flex-1 text-white"
                disabled={is_loading}
                size="xl"
                style={{ backgroundColor: new_color }}
                variant="depth"
                onClick={handle_recolor}
              >
                {is_loading ? (
                  <>
                    <Spinner className="mr-2" size="md" />
                    {t("common.saving")}
                  </>
                ) : (
                  `${t("common.save")} ${t("common.color")}`
                )}
              </Button>
            </ModalFooter>
          </>
        );

      case "delete":
        return (
          <>
            <ModalHeader>
              <div className="flex items-center gap-3">
                <TrashIcon className="w-5 h-5 text-red-500 flex-shrink-0" />
                <div className="min-w-0">
                  <ModalTitle>{t("common.delete_folder")}</ModalTitle>
                  <ModalDescription>{folder_name}</ModalDescription>
                </div>
              </div>
            </ModalHeader>

            <ModalBody>
              <div
                className="rounded-lg p-4 mb-4 bg-red-600 dark:bg-red-700"
              >
                <div className="flex items-start gap-3">
                  <ExclamationTriangleIcon className="w-5 h-5 text-white flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[13px] font-medium text-white mb-1">
                      {t("common.action_cannot_be_undone")}
                    </p>
                    <p className="text-[12px] text-red-100">
                      {t("common.delete_folder_warning")}
                      {hasChildren && t("common.delete_folder_subfolders")}
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-[14px] text-txt-secondary">
                {t("common.delete_folder_confirm")}{" "}
                <strong>&quot;{folder_name}&quot;</strong>?
              </p>

              {error && (
                <p className="text-[13px] text-red-500 mt-4">{error}</p>
              )}
            </ModalBody>

            <ModalFooter>
              <Button
                className="flex-1"
                disabled={is_loading}
                size="xl"
                variant="outline"
                onClick={on_close}
              >
                {t("common.cancel")}
              </Button>
              <Button
                className="flex-1"
                disabled={is_loading}
                size="xl"
                variant="destructive"
                onClick={handle_delete}
              >
                {is_loading
                  ? t("common.deleting")
                  : `${t("common.delete")} ${t("mail.folder")}`}
              </Button>
            </ModalFooter>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <Modal is_open={is_open} on_close={on_close} size="md">
      {render_content()}
    </Modal>
  );
}
