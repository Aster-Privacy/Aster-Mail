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
  ArrowRightIcon,
  PencilIcon,
  TagIcon,
  TrashIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { ButtonSpinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import {
  TAG_COLOR_PRESETS,
  tag_color_label_key,
  type TagIconName,
} from "@/components/ui/email_tag";
import { TagIconPicker } from "@/components/tags/tag_icon_picker";
import { use_tags } from "@/hooks/use_tags";
import {
  get_eligible_parent_tags,
  get_tag_descendant_tokens,
  has_sibling_tag_named,
  tag_option_indent,
} from "@/hooks/tag_tree";
import { use_i18n } from "@/lib/i18n/context";
import { is_composing } from "@/utils/ime";

const MAX_TAG_NAME_LENGTH = 100;

interface TagManagementModalProps {
  is_open: boolean;
  on_close: () => void;
  on_deleted?: () => void;
  tag_id: string;
  tag_name: string;
  tag_color: string;
  tag_icon?: string;
  action: "rename" | "recolor" | "reicon" | "move" | "delete" | null;
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
  const [selected_parent_token, set_selected_parent_token] = useState("");

  const trimmed_name = new_name.trim();
  const current_tag = useMemo(
    () => tags_state.tags.find((tag) => tag.id === tag_id),
    [tags_state.tags, tag_id],
  );
  const current_parent_token = useMemo(() => {
    const parent_token = current_tag?.parent_token;

    return parent_token &&
      tags_state.tags.some((tag) => tag.tag_token === parent_token)
      ? parent_token
      : "";
  }, [current_tag, tags_state.tags]);
  const eligible_parents = useMemo(
    () => get_eligible_parent_tags(tags_state.tags, tag_id),
    [tags_state.tags, tag_id],
  );
  const has_sublabels = useMemo(
    () =>
      current_tag
        ? get_tag_descendant_tokens(tags_state.tags, current_tag.tag_token)
            .size > 0
        : false,
    [current_tag, tags_state.tags],
  );
  const move_validation_error = useMemo(() => {
    if (selected_parent_token === current_parent_token) return null;

    return has_sibling_tag_named(
      tags_state.tags,
      tag_name,
      selected_parent_token,
      tag_id,
    )
      ? t("common.label_already_exists")
      : null;
  }, [
    selected_parent_token,
    current_parent_token,
    tags_state.tags,
    tag_name,
    tag_id,
    t,
  ]);

  const rename_validation_error = useMemo(() => {
    if (!trimmed_name) return null;
    if (trimmed_name.length > MAX_TAG_NAME_LENGTH) {
      return t("common.label_name_too_long", { max: MAX_TAG_NAME_LENGTH });
    }
    if (trimmed_name.toLowerCase() === tag_name.toLowerCase()) {
      return null;
    }
    const duplicate_exists = has_sibling_tag_named(
      tags_state.tags,
      trimmed_name,
      current_parent_token,
      tag_id,
    );

    if (duplicate_exists) {
      return t("common.label_already_exists");
    }

    return null;
  }, [
    trimmed_name,
    tag_name,
    tag_id,
    tags_state.tags,
    current_parent_token,
    t,
  ]);

  const can_rename = trimmed_name && !rename_validation_error;

  useEffect(() => {
    set_new_name(tag_name);
    set_new_color(tag_color);
    set_new_icon(tag_icon);
    set_error("");
  }, [tag_name, tag_color, tag_icon, is_open]);

  useEffect(() => {
    if (is_open) set_selected_parent_token(current_parent_token);
  }, [is_open, tag_id, current_parent_token]);

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

  const handle_move = async () => {
    if (move_validation_error) {
      set_error(move_validation_error);

      return;
    }

    set_is_loading(true);
    set_error("");

    const success = await update_existing_tag(
      tag_id,
      undefined,
      undefined,
      undefined,
      undefined,
      selected_parent_token || null,
    );

    set_is_loading(false);

    if (success) {
      on_close();
    } else {
      set_error(t("common.failed_to_move_label"));
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
                <PencilIcon className="w-5 h-5 text-[var(--accent-color)] flex-shrink-0" />
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
                onKeyDown={(e) =>
                  e["key"] === "Enter" && !is_composing(e) && handle_rename()
                }
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
                variant="outline"
                onClick={on_close}
              >
                {t("common.cancel")}
              </Button>
              <Button
                className="flex-1"
                disabled={is_loading || !can_rename}
                variant="depth"
                onClick={handle_rename}
              >
                {t("common.rename")}
                {is_loading && <ButtonSpinner />}
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
              <span
                className="block text-[13px] font-medium mb-3 text-txt-secondary"
                id="tag-color-label"
              >
                {t("common.select_a_color")}
              </span>
              <div
                aria-labelledby="tag-color-label"
                className="flex flex-wrap gap-2"
                role="group"
              >
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
                    title={t(tag_color_label_key(color.variant))}
                    onClick={() => set_new_color(color.hex)}
                  />
                ))}
              </div>

              {error && (
                <p className="text-[13px] text-red-500 mt-4" role="alert">
                  {error}
                </p>
              )}
            </ModalBody>

            <ModalFooter>
              <Button
                className="flex-1"
                disabled={is_loading}
                variant="outline"
                onClick={on_close}
              >
                {t("common.cancel")}
              </Button>
              <Button
                className="flex-1 text-white"
                disabled={is_loading}
                style={{ backgroundColor: new_color }}
                variant="depth"
                onClick={handle_recolor}
              >
                {`${t("common.save")} ${t("common.color")}`}
                {is_loading && <ButtonSpinner />}
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
              <TagIconPicker
                accent_color={tag_color}
                on_select={set_new_icon}
                selected_icon={new_icon as TagIconName | undefined}
              />

              {error && (
                <p className="text-[13px] text-red-500 mt-4" role="alert">
                  {error}
                </p>
              )}
            </ModalBody>

            <ModalFooter>
              <Button
                className="flex-1"
                disabled={is_loading}
                variant="outline"
                onClick={on_close}
              >
                {t("common.cancel")}
              </Button>
              <Button
                className="flex-1"
                disabled={is_loading}
                variant="depth"
                onClick={handle_reicon}
              >
                {t("common.save")}
                {is_loading && <ButtonSpinner />}
              </Button>
            </ModalFooter>
          </>
        );

      case "move":
        return (
          <>
            <ModalHeader>
              <div className="flex items-start gap-3">
                <ArrowRightIcon className="w-5 h-5 text-brand flex-shrink-0 mt-0.5 rtl:-scale-x-100" />
                <div className="min-w-0">
                  <ModalTitle>{t("common.move_label")}</ModalTitle>
                  <ModalDescription>
                    {t("common.move_label_description")}
                  </ModalDescription>
                </div>
              </div>
            </ModalHeader>

            <ModalBody>
              <p className="text-[13px] font-medium mb-2 text-txt-secondary">
                {t("common.select_parent_label")}
              </p>
              <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
                <button
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-start transition-colors ${selected_parent_token === "" ? "bg-brand/15 text-brand" : "hover:bg-surface-secondary"}`}
                  data-testid="tag-parent-option-root"
                  type="button"
                  onClick={() => set_selected_parent_token("")}
                >
                  <TagIcon className="w-4 h-4 flex-shrink-0" />
                  {t("common.no_parent_label")}
                </button>
                {eligible_parents.map(({ tag, depth }) => (
                  <button
                    key={tag.id}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-start transition-colors ${selected_parent_token === tag.tag_token ? "bg-brand/15 text-brand" : "hover:bg-surface-secondary"}`}
                    data-testid={`tag-parent-option-${tag.id}`}
                    style={{
                      paddingInlineStart: 12 + tag_option_indent(depth),
                    }}
                    type="button"
                    onClick={() => set_selected_parent_token(tag.tag_token)}
                  >
                    <TagIcon
                      className="w-4 h-4 flex-shrink-0"
                      style={{ color: tag.color || "#3b82f6" }}
                    />
                    <span className="truncate">{tag.name}</span>
                  </button>
                ))}
              </div>

              {(move_validation_error || error) && (
                <p className="text-[13px] text-red-500 mt-4" role="alert">
                  {move_validation_error || error}
                </p>
              )}
            </ModalBody>

            <ModalFooter>
              <Button
                className="flex-1"
                disabled={is_loading}
                variant="outline"
                onClick={on_close}
              >
                {t("common.cancel")}
              </Button>
              <Button
                className="flex-1"
                disabled={
                  is_loading ||
                  selected_parent_token === current_parent_token ||
                  !!move_validation_error
                }
                variant="depth"
                onClick={handle_move}
              >
                {t("common.move_label")}
                {is_loading && <ButtonSpinner />}
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
              <div className="rounded-lg p-4 mb-4 bg-red-600 dark:bg-red-700">
                <div className="flex items-start gap-3">
                  <ExclamationTriangleIcon className="w-5 h-5 text-white flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[13px] font-medium text-white mb-1">
                      {t("common.action_cannot_be_undone")}
                    </p>
                    <p className="text-[12px] text-red-100">
                      {t("common.label_permanently_deleted_warning")}
                    </p>
                    {has_sublabels && (
                      <p className="text-[12px] text-red-100 mt-1">
                        {t("common.label_delete_keeps_sublabels")}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <p className="text-[14px] text-txt-secondary">
                {t("common.confirm_delete_label")}{" "}
                <strong>&quot;{tag_name}&quot;</strong>?
              </p>

              {error && (
                <p className="text-[13px] text-red-500 mt-4" role="alert">
                  {error}
                </p>
              )}
            </ModalBody>

            <ModalFooter>
              <Button
                className="flex-1"
                disabled={is_loading}
                variant="outline"
                onClick={on_close}
              >
                {t("common.cancel")}
              </Button>
              <Button
                className="flex-1"
                disabled={is_loading}
                is_loading={is_loading}
                variant="destructive"
                onClick={handle_delete}
              >
                {t("common.delete")}
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
