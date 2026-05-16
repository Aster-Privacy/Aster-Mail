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
  PencilIcon,
  TagIcon,
  TrashIcon,
  ExclamationTriangleIcon,
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
import {
  TAG_COLOR_PRESETS,
  TAG_ICONS,
  tag_icon_map,
  type TagIconName,
} from "@/components/ui/email_tag";
import { use_tags } from "@/hooks/use_tags";
import { use_i18n } from "@/lib/i18n/context";

const MAX_TAG_NAME_LENGTH = 100;

interface TagManagementModalProps {
  is_open: boolean;
  on_close: () => void;
  on_deleted?: () => void;
  tag_id: string;
  tag_name: string;
  tag_color: string;
  tag_icon?: string;
  action: "rename" | "recolor" | "reicon" | "delete" | null;
}

export function TagManagementModal({
  is_open,
  on_close,
  on_deleted,
  tag_id,
  tag_name,
  tag_color,
  tag_icon,
  action,
}: TagManagementModalProps) {
  const { t } = use_i18n();
  const {
    update_existing_tag,
    delete_existing_tag,
    state: tags_state,
  } = use_tags();

  const [new_name, set_new_name] = useState(tag_name);
  const [new_color, set_new_color] = useState(tag_color);
  const [new_icon, set_new_icon] = useState<string | undefined>(tag_icon);
  const [is_loading, set_is_loading] = useState(false);
  const [error, set_error] = useState("");

  const trimmed_name = new_name.trim();

  const rename_validation_error = useMemo(() => {
    if (!trimmed_name) return null;
    if (trimmed_name.length > MAX_TAG_NAME_LENGTH) {
      return t("common.label_name_too_long", { max: MAX_TAG_NAME_LENGTH });
    }
    if (trimmed_name.toLowerCase() === tag_name.toLowerCase()) {
      return null;
    }
    const duplicate_exists = tags_state.tags.some(
      (tag) =>
        tag.id !== tag_id &&
        tag.name.toLowerCase() === trimmed_name.toLowerCase(),
    );

    if (duplicate_exists) {
      return t("common.label_already_exists");
    }

    return null;
  }, [trimmed_name, tag_name, tag_id, tags_state.tags]);

  const can_rename = trimmed_name && !rename_validation_error;

  useEffect(() => {
    set_new_name(tag_name);
    set_new_color(tag_color);
    set_new_icon(tag_icon);
    set_error("");
  }, [tag_name, tag_color, tag_icon, is_open]);

  const handle_rename = async () => {
    if (!trimmed_name) {
      set_error(t("common.label_name_cannot_be_empty"));

      return;
    }

    if (rename_validation_error) {
      set_error(rename_validation_error);

      return;
    }

    set_is_loading(true);
    set_error("");

    const success = await update_existing_tag(tag_id, trimmed_name);

    set_is_loading(false);

    if (success) {
      on_close();
    } else {
      set_error(t("common.failed_to_rename_label"));
    }
  };

  const handle_recolor = async () => {
    set_is_loading(true);
    set_error("");

    const success = await update_existing_tag(tag_id, undefined, new_color);

    set_is_loading(false);

    if (success) {
      on_close();
    } else {
      set_error(t("common.failed_to_change_label_color"));
    }
  };

  const handle_reicon = async () => {
    set_is_loading(true);
    set_error("");

    const success = await update_existing_tag(
      tag_id,
      undefined,
      undefined,
      new_icon || "",
    );

    set_is_loading(false);

    if (success) {
      on_close();
    } else {
      set_error(t("common.failed_to_change_label_icon"));
    }
  };

  const handle_delete = async () => {
    set_is_loading(true);
    set_error("");

    const success = await delete_existing_tag(tag_id);

    set_is_loading(false);

    if (success) {
      on_deleted?.();
      on_close();
    } else {
      set_error(t("common.failed_to_delete_label"));
    }
  };

  const render_content = () => {
    switch (action) {
      case "rename":
        return (
          <>
            <ModalHeader>
              <div className="flex items-center gap-3">
                <PencilIcon className="w-5 h-5 text-blue-500 flex-shrink-0" />
                <div className="min-w-0">
                  <ModalTitle>{t("common.rename_label")}</ModalTitle>
                  <ModalDescription>
                    {t("common.rename_label_description")}
                  </ModalDescription>
                </div>
              </div>
            </ModalHeader>

            <ModalBody>
              <label
                className="block text-[13px] font-medium mb-2 text-txt-secondary"
                htmlFor="tag-rename"
              >
                {t("settings.label_name")}
              </label>
              <Input
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                className="w-full"
                id="tag-rename"
                placeholder={t("common.enter_label_name")}
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
                <TagIcon
                  className="w-5 h-5 flex-shrink-0"
                  style={{ color: tag_color }}
                />
                <div className="min-w-0">
                  <ModalTitle>{t("common.change_label_color")}</ModalTitle>
                  <ModalDescription>{tag_name}</ModalDescription>
                </div>
              </div>
            </ModalHeader>

            <ModalBody>
              <label
                className="block text-[13px] font-medium mb-3 text-txt-secondary"
                htmlFor="tag-color"
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

      case "reicon":
        return (
          <>
            <ModalHeader>
              <div className="flex items-center gap-3">
                <TagIcon
                  className="w-5 h-5 flex-shrink-0"
                  style={{ color: tag_color }}
                />
                <div className="min-w-0">
                  <ModalTitle>{t("common.change_label_icon")}</ModalTitle>
                  <ModalDescription>{tag_name}</ModalDescription>
                </div>
              </div>
            </ModalHeader>

            <ModalBody>
              <label className="block text-[13px] font-medium mb-3 text-txt-secondary">
                {t("common.select_an_icon")}
              </label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  className="w-8 h-8 rounded-[8px] flex items-center justify-center text-[11px] transition-colors"
                  style={{
                    backgroundColor: !new_icon
                      ? "var(--indicator-bg)"
                      : "transparent",
                    border: !new_icon
                      ? "1px solid var(--border-primary)"
                      : "1px solid transparent",
                    color: "var(--text-muted)",
                  }}
                  title={t("common.no_icon")}
                  onClick={() => set_new_icon(undefined)}
                >
                  &mdash;
                </button>
                {TAG_ICONS.map((icon_name) => {
                  const IconComponent = tag_icon_map[icon_name as TagIconName];
                  const is_selected = new_icon === icon_name;

                  return (
                    <button
                      key={icon_name}
                      className="w-8 h-8 rounded-[8px] flex items-center justify-center transition-colors"
                      style={{
                        backgroundColor: is_selected
                          ? "var(--indicator-bg)"
                          : "transparent",
                        border: is_selected
                          ? "1px solid var(--border-primary)"
                          : "1px solid transparent",
                        color: is_selected ? tag_color : "var(--text-muted)",
                      }}
                      title={icon_name}
                      onClick={() => set_new_icon(icon_name)}
                    >
                      {IconComponent && <IconComponent className="w-4 h-4" />}
                    </button>
                  );
                })}
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
                className="flex-1"
                disabled={is_loading}
                size="xl"
                variant="depth"
                onClick={handle_reicon}
              >
                {is_loading ? (
                  <>
                    <Spinner className="mr-2" size="md" />
                    {t("common.saving")}
                  </>
                ) : (
                  t("common.save")
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
                  <ModalTitle>{t("common.delete_label")}</ModalTitle>
                  <ModalDescription>{tag_name}</ModalDescription>
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
                      {t("common.label_permanently_deleted_warning")}
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-[14px] text-txt-secondary">
                {t("common.confirm_delete_label")}{" "}
                <strong>&quot;{tag_name}&quot;</strong>?
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
                {is_loading ? t("common.deleting") : t("common.delete")}
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
