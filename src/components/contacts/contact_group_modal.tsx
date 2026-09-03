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
import type { ContactGroup } from "@/types/contacts";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { UserGroupIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { Input } from "@/components/ui/input";
import {
  TAG_COLOR_PRESETS,
  tag_color_label_key,
} from "@/components/ui/email_tag";
import {
  use_contact_groups,
  MAX_CONTACT_GROUPS,
  MAX_CONTACT_GROUP_NAME_LENGTH,
} from "@/hooks/use_contact_groups";
import { DEFAULT_GROUP_COLOR } from "@/services/api/contacts";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import { is_composing } from "@/utils/ime";
import { use_dialog_shell } from "@/lib/use_dialog_shell";

interface ContactGroupModalProps {
  is_open: boolean;
  group?: ContactGroup | null;
  on_close: () => void;
  on_saved?: (group_id: string) => void;
}

export function ContactGroupModal({
  is_open,
  group = null,
  on_close,
  on_saved,
}: ContactGroupModalProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const { groups, create_group, rename_group } = use_contact_groups();
  const is_editing = !!group;
  const [name, set_name] = useState("");
  const [color, set_color] = useState<string>(DEFAULT_GROUP_COLOR);
  const [is_saving, set_is_saving] = useState(false);
  const [error, set_error] = useState("");

  useEffect(() => {
    if (!is_open) return;
    set_name(group?.name ?? "");
    set_color(group?.color || DEFAULT_GROUP_COLOR);
    set_error("");
  }, [is_open, group]);

  const trimmed_name = name.trim();

  const validation_error = useMemo(() => {
    if (!trimmed_name) return null;
    if (trimmed_name.length > MAX_CONTACT_GROUP_NAME_LENGTH) {
      return t("common.contact_group_name_too_long", {
        max: MAX_CONTACT_GROUP_NAME_LENGTH,
      });
    }
    const duplicate = groups.some(
      (existing) =>
        existing.id !== group?.id &&
        existing.name.toLowerCase() === trimmed_name.toLowerCase(),
    );

    if (duplicate) return t("common.contact_group_already_exists");

    if (!is_editing && groups.length >= MAX_CONTACT_GROUPS) {
      return t("common.contact_group_limit_reached", {
        max: MAX_CONTACT_GROUPS,
      });
    }

    return null;
  }, [trimmed_name, groups, group?.id, is_editing, t]);

  const handle_close = () => {
    if (is_saving) return;
    set_error("");
    on_close();
  };

  const handle_save = async () => {
    if (!trimmed_name || is_saving || validation_error) return;

    set_is_saving(true);
    set_error("");

    if (is_editing && group) {
      const ok = await rename_group(group.id, { name: trimmed_name, color });

      set_is_saving(false);
      if (!ok) {
        set_error(t("common.failed_to_save_contact_group"));

        return;
      }
      on_saved?.(group.id);
      on_close();

      return;
    }

    const created = await create_group({ name: trimmed_name, color });

    set_is_saving(false);
    if (!created) {
      set_error(t("common.failed_to_create_contact_group"));

      return;
    }
    on_saved?.(created.id);
    on_close();
  };

  const { dialog_ref, handle_backdrop_pointer_down } =
    use_dialog_shell<HTMLDivElement>(is_open, handle_close, "contact_group_modal");

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
            className="absolute inset-0 backdrop-blur-md"
            style={{ backgroundColor: "var(--modal-overlay)" }}
            onPointerDown={handle_backdrop_pointer_down}
          />
          <motion.div
            ref={dialog_ref}
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-full max-w-md rounded-xl border overflow-hidden bg-modal-bg border-edge-primary"
            exit={{ opacity: 0, scale: 0.96 }}
            initial={reduce_motion ? false : { opacity: 0, scale: 0.96 }}
            style={{ boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)" }}
            tabIndex={-1}
            transition={{ duration: reduce_motion ? 0 : 0.15 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-center gap-3 mb-5">
                <UserGroupIcon className="w-5 h-5 text-txt-secondary" />
                <h2 className="text-[16px] font-semibold text-txt-primary">
                  {is_editing
                    ? t("common.rename_contact_group")
                    : t("common.create_contact_group")}
                </h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label
                    className="block text-[13px] font-medium mb-2 text-txt-secondary"
                    htmlFor="contact-group-name"
                  >
                    {t("common.contact_group_name")}
                  </label>
                  <Input
                    autoFocus
                    aria-describedby={
                      validation_error || error
                        ? "contact-group-name-error"
                        : undefined
                    }
                    aria-invalid={Boolean(validation_error || error)}
                    className="w-full"
                    id="contact-group-name"
                    placeholder={t("common.enter_contact_group_name")}
                    status={validation_error || error ? "error" : "default"}
                    type="text"
                    value={name}
                    onChange={(e) => set_name(e.target.value)}
                    onKeyDown={(e) =>
                      e["key"] === "Enter" && !is_composing(e) && handle_save()
                    }
                  />
                </div>

                <div>
                  <span
                    className="block text-[13px] font-medium mb-2 text-txt-secondary"
                    id="contact-group-color-label"
                  >
                    {t("common.color_label")}
                  </span>
                  <div
                    aria-labelledby="contact-group-color-label"
                    className="flex flex-wrap gap-2"
                    role="group"
                  >
                    {TAG_COLOR_PRESETS.map((preset) => (
                      <button
                        key={preset.hex}
                        aria-label={t(tag_color_label_key(preset.variant))}
                        aria-pressed={color === preset.hex}
                        className="w-9 h-9 rounded-full"
                        style={{
                          backgroundColor: preset.hex,
                          boxShadow:
                            color === preset.hex
                              ? `0 0 0 2px var(--modal-bg), 0 0 0 4px ${preset.hex}`
                              : "none",
                        }}
                        title={t(tag_color_label_key(preset.variant))}
                        onClick={() => set_color(preset.hex)}
                      />
                    ))}
                  </div>
                </div>

                {(validation_error || error) && (
                  <p
                    className="text-[13px] text-red-500 mt-2"
                    id="contact-group-name-error"
                    role="alert"
                  >
                    {validation_error || error}
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 pb-6 pt-2">
              <Button
                disabled={is_saving}
                size="xl"
                variant="outline"
                onClick={handle_close}
              >
                {t("common.cancel")}
              </Button>
              <Button
                className="text-white"
                disabled={!trimmed_name || is_saving || !!validation_error}
                is_loading={is_saving}
                size="xl"
                style={{ backgroundColor: color }}
                variant="depth"
                onClick={handle_save}
              >
                {is_editing ? t("common.save") : t("common.create")}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
