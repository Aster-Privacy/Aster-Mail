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

import { useCallback, useEffect, useState } from "react";
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
import { use_i18n } from "@/lib/i18n/context";
import { is_composing } from "@/utils/ime";
import { create_contact_group } from "@/services/api/contacts";

interface ContactGroupModalProps {
  is_open: boolean;
  on_close: () => void;
  on_created: (group: ContactGroup) => void;
  existing_count?: number;
}

export function ContactGroupModal({
  is_open,
  on_close,
  on_created,
  existing_count = 0,
}: ContactGroupModalProps) {
  const { t } = use_i18n();
  const [name, set_name] = useState("");
  const [color, set_color] = useState(
    TAG_COLOR_PRESETS[existing_count % TAG_COLOR_PRESETS.length].hex,
  );
  const [icon, set_icon] = useState<TagIconName | undefined>(undefined);
  const [is_saving, set_is_saving] = useState(false);
  const [error, set_error] = useState("");

  useEffect(() => {
    if (!is_open) return;
    set_name("");
    set_error("");
    set_is_saving(false);
    set_icon(undefined);
    set_color(TAG_COLOR_PRESETS[existing_count % TAG_COLOR_PRESETS.length].hex);
  }, [existing_count, is_open]);

  const submit = useCallback(async () => {
    const trimmed = name.trim();

    if (!trimmed || is_saving) return;

    set_is_saving(true);
    set_error("");

    const response = await create_contact_group({
      name: trimmed,
      color,
      icon,
    });

    set_is_saving(false);

    if (response.error || !response.data) {
      set_error(response.error || t("common.failed_to_create_group"));

      return;
    }

    on_created(response.data);
    on_close();
  }, [color, icon, is_saving, name, on_close, on_created, t]);

  if (!is_open) return null;

  return (
    <Modal is_open={is_open} on_close={on_close} size="sm">
      <ModalHeader>
        <div className="flex items-center gap-3">
          <UserGroupIcon className="h-5 w-5 flex-shrink-0 text-txt-muted" />
          <div className="min-w-0">
            <ModalTitle>{t("common.add_new_group")}</ModalTitle>
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
              id="contact_group_name"
              maxLength={64}
              size="md"
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
                {name.trim() || t("common.group_name")}
              </span>
            </span>
          </div>

          {error && (
            <p
              className="text-[12.5px]"
              style={{ color: "var(--color-danger)" }}
            >
              {error}
            </p>
          )}
        </div>
      </ModalBody>

      <ModalFooter>
        <Button variant="ghost" onClick={on_close}>
          {t("common.cancel")}
        </Button>
        <Button
          disabled={!name.trim()}
          is_loading={is_saving}
          loading_position="before"
          variant="depth"
          onClick={submit}
        >
          {t("common.create")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
