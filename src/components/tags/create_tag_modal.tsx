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
import { useState, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { TagIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import {
  EmailTag,
  TAG_COLOR_PRESETS,
  TAG_ICONS,
  tag_icon_map,
  hex_to_variant,
  type TagIconName,
} from "@/components/ui/email_tag";
import { use_tags } from "@/hooks/use_tags";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";

const MAX_TAG_NAME_LENGTH = 100;

interface CreateTagModalProps {
  is_open: boolean;
  on_close: () => void;
}

export function CreateTagModal({ is_open, on_close }: CreateTagModalProps) {
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

  const trimmed_name = tag_name.trim();

  const validation_error = useMemo(() => {
    if (!trimmed_name) return null;
    if (trimmed_name.length > MAX_TAG_NAME_LENGTH) {
      return t("common.label_name_too_long", { max: MAX_TAG_NAME_LENGTH });
    }
    const duplicate_exists = tags_state.tags.some(
      (t) => t.name.toLowerCase() === trimmed_name.toLowerCase(),
    );

    if (duplicate_exists) {
      return t("common.label_already_exists");
    }

    return null;
  }, [trimmed_name, tags_state.tags]);

  const handle_create = async () => {
    if (!trimmed_name || is_creating || validation_error) return;

    set_is_creating(true);
    set_error("");

    const result = await create_new_tag(
      trimmed_name,
      selected_color,
      selected_icon,
    );

    set_is_creating(false);

    if (result) {
      on_close();
      set_tag_name("");
      set_selected_color(TAG_COLOR_PRESETS[10].hex as string);
      set_selected_icon(undefined);
    } else {
      set_error(t("common.failed_to_create_label"));
    }
  };

  const handle_close = () => {
    if (is_creating) return;
    set_tag_name("");
    set_selected_color(TAG_COLOR_PRESETS[10].hex);
    set_selected_icon(undefined);
    set_error("");
    on_close();
  };

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[60] flex items-center justify-center"
          exit={{ opacity: 0 }}
          initial={reduce_motion ? false : { opacity: 0 }}
          transition={{ duration: reduce_motion ? 0 : 0.15 }}
          onClick={handle_close}
        >
          <div
            className="absolute inset-0 backdrop-blur-md"
            style={{ backgroundColor: "var(--modal-overlay)" }}
          />
          <motion.div
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-full max-w-md rounded-xl border overflow-hidden bg-modal-bg border-edge-primary"
            exit={{ opacity: 0, scale: 0.96 }}
            initial={reduce_motion ? false : { opacity: 0, scale: 0.96 }}
            style={{
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
            }}
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
                    onKeyDown={(e) => e["key"] === "Enter" && handle_create()}
                  />
                </div>

                <div>
                  <label
                    className="block text-[13px] font-medium mb-2 text-txt-secondary"
                    htmlFor="create-tag-color"
                  >
                    {t("common.color_label")}
                  </label>
                  <div className="flex flex-wrap gap-2">
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
                        title={color.name}
                        onClick={() => set_selected_color(color.hex)}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label
                    className="block text-[13px] font-medium mb-2 text-txt-secondary"
                    htmlFor="create-tag-icon"
                  >
                    {t("common.icon_optional")}
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      className="w-8 h-8 rounded-[8px] flex items-center justify-center text-[11px] transition-colors"
                      style={{
                        backgroundColor: !selected_icon
                          ? "var(--indicator-bg)"
                          : "transparent",
                        border: !selected_icon
                          ? "1px solid var(--border-primary)"
                          : "1px solid transparent",
                        color: "var(--text-muted)",
                      }}
                      onClick={() => set_selected_icon(undefined)}
                    >
                      &mdash;
                    </button>
                    {TAG_ICONS.map((icon_name) => {
                      const IconComponent = tag_icon_map[icon_name];

                      return (
                        <button
                          key={icon_name}
                          className="w-8 h-8 rounded-[8px] flex items-center justify-center transition-colors"
                          style={{
                            backgroundColor:
                              selected_icon === icon_name
                                ? "var(--indicator-bg)"
                                : "transparent",
                            border:
                              selected_icon === icon_name
                                ? "1px solid var(--border-primary)"
                                : "1px solid transparent",
                            color:
                              selected_icon === icon_name
                                ? selected_color
                                : "var(--text-muted)",
                          }}
                          title={icon_name}
                          onClick={() => set_selected_icon(icon_name)}
                        >
                          {IconComponent && (
                            <IconComponent className="w-4 h-4" />
                          )}
                        </button>
                      );
                    })}
                  </div>
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
                size="xl"
                variant="outline"
                onClick={handle_close}
              >
                {t("common.cancel")}
              </Button>
              <Button
                className="text-white"
                disabled={!trimmed_name || is_creating || !!validation_error}
                size="xl"
                style={{ backgroundColor: selected_color }}
                variant="depth"
                onClick={handle_create}
              >
                {is_creating && <Spinner className="mr-2" size="md" />}
                {is_creating ? t("common.creating") : t("common.create_label")}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
