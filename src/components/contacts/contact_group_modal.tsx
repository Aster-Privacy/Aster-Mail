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
import type { CSSProperties } from "react";
import type { ContactGroup } from "@/types/contacts";
import type { TagIconName } from "@/components/ui/email_tag";

import { useCallback, useEffect, useMemo, useState } from "react";
import { UserGroupIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { ContactGroupGlyph } from "@/components/common/contacts/contact_group_glyph";
import { TagIconPicker } from "@/components/tags/tag_icon_picker";
import {
  TAG_COLOR_PRESETS,
  tag_color_label_key,
} from "@/components/ui/email_tag";
import {
  use_contact_groups,
  MAX_CONTACT_GROUPS,
  MAX_CONTACT_GROUP_NAME_LENGTH,
} from "@/hooks/use_contact_groups";
import { use_i18n } from "@/lib/i18n/context";
import { is_composing } from "@/utils/ime";

interface ContactGroupModalProps {
  is_open: boolean;
  group?: ContactGroup | null;
  on_close: () => void;
  on_created?: (group: ContactGroup) => void;
  on_saved?: (group_id: string) => void;
  existing_count?: number;
}

export function ContactGroupModal({
  is_open,
  group = null,
  on_close,
  on_created,
  on_saved,
  existing_count,
}: ContactGroupModalProps) {
  const { t } = use_i18n();
  const { groups, create_group, rename_group } = use_contact_groups();
  const is_editing = Boolean(group);
  const group_count = existing_count ?? groups.length;
  const default_color =
    TAG_COLOR_PRESETS[group_count % TAG_COLOR_PRESETS.length].hex;

  const [name, set_name] = useState("");
  const [color, set_color] = useState<string>(default_color);
  const [icon, set_icon] = useState<TagIconName | undefined>(undefined);
  const [is_saving, set_is_saving] = useState(false);
  const [error, set_error] = useState("");

  useEffect(() => {
    if (!is_open) return;
    set_name(group?.name ?? "");
    set_color(group?.color || default_color);
    set_icon(group?.icon);
    set_error("");
    set_is_saving(false);
  }, [default_color, group, is_open]);

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
  }, [group?.id, groups, is_editing, t, trimmed_name]);

  const handle_close = useCallback(() => {
    if (is_saving) return;
    set_error("");
    on_close();
  }, [is_saving, on_close]);

  const submit = useCallback(async () => {
    if (!trimmed_name || is_saving || validation_error) return;

    set_is_saving(true);
    set_error("");

    if (is_editing && group) {
      const saved = await rename_group(group.id, {
        name: trimmed_name,
        color,
        icon,
      });

      set_is_saving(false);

      if (!saved) {
        set_error(t("common.failed_to_save_contact_group"));

        return;
      }

      on_saved?.(group.id);
      on_close();

      return;
    }

    const created = await create_group({ name: trimmed_name, color, icon });

    set_is_saving(false);

    if (!created) {
      set_error(t("common.failed_to_create_contact_group"));

      return;
    }

    on_created?.(created);
    on_saved?.(created.id);
    on_close();
  }, [
    color,
    create_group,
    group,
    icon,
    is_editing,
    is_saving,
    on_close,
    on_created,
    on_saved,
    rename_group,
    t,
    trimmed_name,
    validation_error,
  ]);

  if (!is_open) return null;

  const message = validation_error || error;

  return (
    <Modal is_open={is_open} on_close={handle_close} size="sm">
      <ModalHeader>
        <div className="flex items-center gap-3">
          <UserGroupIcon className="h-5 w-5 flex-shrink-0 text-txt-muted" />
          <div className="min-w-0">
            <ModalTitle>
              {is_editing
                ? t("common.rename_contact_group")
                : t("common.add_new_group")}
            </ModalTitle>
            <ModalDescription>
              {t("common.group_modal_description")}
            </ModalDescription>
          </div>
        </div>
      </ModalHeader>

      <ModalBody>
        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <label
              className="block text-[12.5px] font-medium text-txt-secondary"
              htmlFor="contact_group_name"
            >
              {t("common.group_name")}
            </label>
            <Input
              autoFocus
              aria-describedby={
                message ? "contact_group_name_error" : undefined
              }
              aria-invalid={Boolean(message)}
              id="contact_group_name"
              maxLength={MAX_CONTACT_GROUP_NAME_LENGTH}
              placeholder={t("common.enter_contact_group_name")}
              size="md"
              status={message ? "error" : "default"}
              value={name}
              onChange={(e) => set_name(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !is_composing(e)) void submit();
              }}
            />
          </div>

          <div className="space-y-2">
            <span
              className="block text-[12.5px] font-medium text-txt-secondary"
              id="contact_group_color_label"
            >
              {t("common.color")}
            </span>
            <div
              aria-labelledby="contact_group_color_label"
              className="contact_group_color_grid"
              role="group"
            >
              {TAG_COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.hex}
                  aria-label={t(tag_color_label_key(preset.variant))}
                  aria-pressed={preset.hex === color}
                  className="contact_group_swatch aspect-square w-full rounded-full"
                  data-selected={preset.hex === color}
                  style={
                    {
                      backgroundColor: preset.hex,
                      "--swatch-ring": preset.hex,
                    } as CSSProperties
                  }
                  title={t(tag_color_label_key(preset.variant))}
                  type="button"
                  onClick={() => set_color(preset.hex)}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <span className="block text-[12.5px] font-medium text-txt-secondary">
              {t("common.icon_optional")}
            </span>
            <TagIconPicker
              accent_color={color}
              on_select={set_icon}
              selected_icon={icon}
            />
          </div>

          <div className="flex">
            <span className="contact_group_preview min-w-0">
              <ContactGroupGlyph color={color} icon={icon} />
              <span className="truncate text-[13px] font-medium">
                {trimmed_name || t("common.group_name")}
              </span>
            </span>
          </div>

          {message && (
            <p
              className="text-[12.5px]"
              id="contact_group_name_error"
              role="alert"
              style={{ color: "var(--color-danger)" }}
            >
              {message}
            </p>
          )}
        </div>
      </ModalBody>

      <ModalFooter>
        <Button disabled={is_saving} variant="ghost" onClick={handle_close}>
          {t("common.cancel")}
        </Button>
        <Button
          disabled={!trimmed_name || Boolean(validation_error)}
          is_loading={is_saving}
          loading_position="before"
          variant="depth"
          onClick={submit}
        >
          {is_editing ? t("common.save") : t("common.create")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
