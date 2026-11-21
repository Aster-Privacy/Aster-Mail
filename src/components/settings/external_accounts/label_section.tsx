//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { TranslationFn } from "@/components/settings/external_accounts/form_types";

import { TagIcon } from "@heroicons/react/24/outline";
import { IslandDivider, IslandRow, IslandSection } from "@aster/ui";

import { Input } from "@/components/ui/input";
import { ColorSwatchRow } from "@/components/ui/color_wheel_picker";
import { HEX_COLOR_REGEX } from "@/components/settings/hooks/use_external_accounts";
import {
  FieldGroup,
  FormField,
} from "@/components/settings/external_accounts/form_field";

const FALLBACK_LABEL_COLOR = "#3B82F6";

interface LabelSectionProps {
  form_label_name: string;
  set_form_label_name: (value: string) => void;
  form_label_color: string;
  set_form_label_color: (value: string) => void;
  handle_label_color_change: (value: string) => void;
  handle_label_color_input: (value: string) => void;
  t: TranslationFn;
}

export function LabelSection({
  form_label_name,
  set_form_label_name,
  form_label_color,
  handle_label_color_change,
  t,
}: LabelSectionProps) {
  const preview_color = HEX_COLOR_REGEX.test(form_label_color)
    ? form_label_color
    : FALLBACK_LABEL_COLOR;
  const preview_name =
    form_label_name.trim() || t("settings.label_name_placeholder");

  return (
    <IslandSection
      description={t("settings.ext_v2_label_description")}
      icon={<TagIcon />}
      title={t("settings.label")}
      trailing={
        <span
          aria-hidden="true"
          className="inline-flex items-center gap-1.5 max-w-[180px] h-7 px-2.5 rounded-full text-xs font-medium text-txt-primary transition-colors"
          data-testid="ext-account-label-preview"
          style={{
            backgroundColor: `color-mix(in srgb, ${preview_color} 16%, transparent)`,
          }}
        >
          <span
            className="w-2 h-2 shrink-0 rounded-full"
            style={{ backgroundColor: preview_color }}
          />
          <span
            className={`truncate ${form_label_name.trim() ? "" : "text-txt-muted"}`}
          >
            {preview_name}
          </span>
        </span>
      }
    >
      <FieldGroup>
        <FormField id="ext-account-label-name" label={t("settings.label_name")}>
          <Input
            className="aster_input_tonal w-full"
            id="ext-account-label-name"
            maxLength={100}
            placeholder={t("settings.label_name_placeholder")}
            size="md"
            type="text"
            value={form_label_name}
            onChange={(e) => set_form_label_name(e.target.value)}
          />
        </FormField>
      </FieldGroup>
      <IslandDivider />
      <IslandRow
        label={t("settings.label_color")}
        layout="block"
        trailing={
          <ColorSwatchRow
            label={t("settings.label_color")}
            max_swatch_size={34}
            on_change={handle_label_color_change}
            value={preview_color}
          />
        }
      />
    </IslandSection>
  );
}
