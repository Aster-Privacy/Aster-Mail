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
import { useState, useMemo, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDownIcon, TagIcon } from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown_menu";
import {
  EmailTag,
  TAG_COLOR_PRESETS,
  hex_to_variant,
  tag_color_label_key,
  type TagIconName,
} from "@/components/ui/email_tag";
import { TagIconPicker } from "@/components/tags/tag_icon_picker";
import { use_tags } from "@/hooks/use_tags";
import {
  get_eligible_parent_tags,
  has_sibling_tag_named,
} from "@/hooks/tag_tree";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import { is_composing } from "@/utils/ime";
import { use_dialog_shell } from "@/lib/use_dialog_shell";

const MAX_TAG_NAME_LENGTH = 100;

interface CreateTagModalProps {
  is_open: boolean;
  on_close: () => void;
  initial_parent_token?: string;
}

export function CreateTagModal({
  is_open,
  on_close,
  initial_parent_token,
}: CreateTagModalProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const { create_new_tag, state: tags_state } = use_tags();
  const [tag_name, set_tag_name] = useState("");
  const [selected_color, set_selected_color] = useState<string>(
    TAG_COLOR_PRESETS[10].hex,
  );
  const [selected_icon, set_selected_icon] = useState<TagIconName | undefined>(
    undefined,
  );
  const [is_creating, set_is_creating] = useState(false);
  const [error, set_error] = useState("");
  const [selected_parent_token, set_selected_parent_token] = useState<
    string | undefined
  >(initial_parent_token);
  const [parent_menu_open, set_parent_menu_open] = useState(false);

  useEffect(() => {
    if (is_open) {
      set_selected_parent_token(initial_parent_token);
      set_parent_menu_open(false);
    }
  }, [is_open, initial_parent_token]);

  const parent_options = useMemo(
    () => get_eligible_parent_tags(tags_state.tags),
    [tags_state.tags],
  );
  const selected_parent = selected_parent_token
    ? parent_options.find(
        (entry) => entry.tag.tag_token === selected_parent_token,
      )?.tag
    : undefined;
  const effective_parent_token = selected_parent?.tag_token;

  const trimmed_name = tag_name.trim();

  const validation_error = useMemo(() => {
    if (!trimmed_name) return null;
    if (trimmed_name.length > MAX_TAG_NAME_LENGTH) {
      return t("common.label_name_too_long", { max: MAX_TAG_NAME_LENGTH });
    }
    const duplicate_exists = has_sibling_tag_named(
      tags_state.tags,
      trimmed_name,
      effective_parent_token,
    );

    if (duplicate_exists) {
      return t("common.label_already_exists");
    }

    return null;
  }, [trimmed_name, tags_state.tags, effective_parent_token, t]);

  const handle_create = async () => {
    if (!trimmed_name || is_creating || validation_error) return;

    set_is_creating(true);
    set_error("");

    const result = await create_new_tag(
      trimmed_name,
      selected_color,
      selected_icon,
      effective_parent_token,
    );

    set_is_creating(false);

    if (result) {
      on_close();
      set_tag_name("");
      set_selected_color(TAG_COLOR_PRESETS[10].hex as string);
      set_selected_icon(undefined);
      set_selected_parent_token(undefined);
    } else {
      set_error(t("common.failed_to_create_label"));
    }
  };

  const handle_close = () => {
    if (is_creating) return;
    set_tag_name("");
    set_selected_color(TAG_COLOR_PRESETS[10].hex);
    set_selected_icon(undefined);
    set_selected_parent_token(undefined);
    set_error("");
    on_close();
  };

  const { dialog_ref, handle_backdrop_pointer_down } =
    use_dialog_shell<HTMLDivElement>(is_open, handle_close, "create_tag_modal");

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[60] flex items-center justify-center"
          exit={{ opacity: 0 }}
          initial={reduce_motion ? false : { opacity: 0 }}
          transition={{ duration: reduce_motion ? 0 : 0.15 }}
        >
          <div
            className="absolute inset-0"
            style={{ backgroundColor: "var(--modal-overlay)" }}
            onPointerDown={handle_backdrop_pointer_down}
          />
          <motion.div
            ref={dialog_ref}
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-full max-w-md overflow-hidden rounded-[var(--aster-radius-floating,16px)] bg-[var(--aster-floating-bg,var(--modal-bg))] shadow-[var(--aster-floating-shadow)]"
            exit={{ opacity: 0, scale: 0.96 }}
            initial={reduce_motion ? false : { opacity: 0, scale: 0.96 }}
            tabIndex={-1}
            transition={{ duration: reduce_motion ? 0 : 0.15 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-center gap-3 mb-5">
                <TagIcon className="w-5 h-5 text-txt-secondary" />
                <h2 className="text-[16px] font-semibold text-txt-primary">
                  {t("common.create_label")}
                </h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label
                    className="block text-[13px] font-medium mb-2 text-txt-secondary"
                    htmlFor="create-tag-name"
                  >
                    {t("settings.label_name")}
                  </label>
                  <Input
                    autoFocus
                    className="w-full"
                    id="create-tag-name"
                    placeholder={t("common.enter_label_name")}
                    status={validation_error || error ? "error" : "default"}
                    type="text"
                    value={tag_name}
                    onChange={(e) => set_tag_name(e.target.value)}
                    onKeyDown={(e) =>
                      e["key"] === "Enter" &&
                      !is_composing(e) &&
                      handle_create()
                    }
                  />
                </div>

                {parent_options.length > 0 && (
                  <div>
                    <span className="block text-[13px] font-medium mb-2 text-txt-secondary">
                      {t("common.parent_label")}
                    </span>
                    <DropdownMenu
                      open={parent_menu_open}
                      onOpenChange={set_parent_menu_open}
                    >
                      <DropdownMenuTrigger asChild>
                        <button
                          className="aster_input w-full items-center gap-2 px-3 py-2 text-[14px] text-start"
                          data-testid="create-tag-parent-trigger"
                          type="button"
                        >
                          {selected_parent ? (
                            <TagIcon
                              className="w-4 h-4 flex-shrink-0"
                              style={{
                                color: selected_parent.color || "#3b82f6",
                              }}
                            />
                          ) : null}
                          <span className="flex-1 truncate">
                            {selected_parent
                              ? selected_parent.name
                              : t("common.no_parent_label")}
                          </span>
                          <ChevronDownIcon className="w-4 h-4 flex-shrink-0 text-txt-muted" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="start"
                        className="max-h-56 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"
                        sideOffset={4}
                      >
                        <DropdownMenuItem
                          onClick={() => set_selected_parent_token(undefined)}
                        >
                          <span className="truncate">
                            {t("common.no_parent_label")}
                          </span>
                        </DropdownMenuItem>
                        {parent_options.map(({ tag, depth }) => (
                          <DropdownMenuItem
                            key={tag.id}
                            style={{ paddingInlineStart: 8 + depth * 14 }}
                            onClick={() =>
                              set_selected_parent_token(tag.tag_token)
                            }
                          >
                            <TagIcon
                              className="w-4 h-4 me-2 flex-shrink-0"
                              style={{ color: tag.color || "#3b82f6" }}
                            />
                            <span className="truncate">{tag.name}</span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}

                <div>
                  <span
                    className="block text-[13px] font-medium mb-2 text-txt-secondary"
                    id="create-tag-color-label"
                  >
                    {t("common.color_label")}
                  </span>
                  <div
                    aria-labelledby="create-tag-color-label"
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
                            selected_color === color.hex
                              ? `0 0 0 2px var(--modal-bg), 0 0 0 4px ${color.hex}`
                              : "none",
                        }}
                        title={t(tag_color_label_key(color.variant))}
                        onClick={() => set_selected_color(color.hex)}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <span className="block text-[13px] font-medium mb-2 text-txt-secondary">
                    {t("common.icon_optional")}
                  </span>
                  <TagIconPicker
                    accent_color={selected_color}
                    on_select={set_selected_icon}
                    selected_icon={selected_icon}
                  />
                </div>

                <div className="flex items-center gap-2.5 pt-2">
                  <EmailTag
                    icon={selected_icon}
                    label={tag_name || t("common.label_preview")}
                    show_icon={!!selected_icon}
                    variant={hex_to_variant(selected_color)}
                    {...(hex_to_variant(selected_color) === "custom"
                      ? { custom_color: selected_color }
                      : {})}
                  />
                </div>

                {(validation_error || error) && (
                  <p className="text-[13px] text-red-500 mt-2">
                    {validation_error || error}
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 pb-6 pt-2">
              <Button
                disabled={is_creating}
                variant="outline"
                onClick={handle_close}
              >
                {t("common.cancel")}
              </Button>
              <Button
                className="text-white"
                disabled={!trimmed_name || is_creating || !!validation_error}
                is_loading={is_creating}
                style={{ backgroundColor: selected_color }}
                variant="depth"
                onClick={handle_create}
              >
                {t("common.create_label")}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
