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
import type { TranslationFn } from "@/components/settings/external_accounts/form_types";

import { HexColorPicker } from "react-colorful";

import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TAG_COLOR_PRESETS } from "@/components/ui/email_tag";
import { HEX_COLOR_REGEX } from "@/components/settings/hooks/use_external_accounts";

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
  set_form_label_color,
  handle_label_color_change,
  handle_label_color_input,
  t,
}: LabelSectionProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-txt-primary">
        {t("settings.label")}
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            className="text-xs font-medium mb-1 block text-txt-muted"
            htmlFor="ext-account-label-name"
          >
            {t("settings.label_name")}
          </label>
          <Input
            className="w-full"
            id="ext-account-label-name"
            maxLength={100}
            placeholder={t("settings.label_name_placeholder")}
            type="text"
            value={form_label_name}
            onChange={(e) => set_form_label_name(e.target.value)}
          />
        </div>
        <div>
          <label
            className="text-xs font-medium mb-1 block text-txt-muted"
            htmlFor="ext-account-label-color"
          >
            {t("settings.label_color")}
          </label>
          <Popover>
            <PopoverTrigger asChild>
              <button
                aria-label={t("settings.choose_label_color")}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-[14px] text-sm outline-none transition-colors cursor-pointer bg-surf-secondary border border-edge-primary"
                id="ext-account-label-color"
                type="button"
              >
                <span
                  className="w-5 h-5 rounded-full flex-shrink-0 border border-edge-primary"
                  style={{
                    backgroundColor: HEX_COLOR_REGEX.test(form_label_color)
                      ? form_label_color
                      : "#3B82F6",
                  }}
                />
                <span className="text-txt-muted">{form_label_color}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-auto p-3 z-[70] bg-modal-bg border-edge-primary"
              sideOffset={6}
            >
              <div className="space-y-3">
                <HexColorPicker
                  color={form_label_color}
                  style={{ width: "100%" }}
                  onChange={handle_label_color_change}
                />
                <div className="flex flex-wrap gap-1.5">
                  {TAG_COLOR_PRESETS.map((color) => (
                    <button
                      key={color.hex}
                      aria-label={t("settings.select_color", { name: color.name })}
                      className="w-9 h-9 rounded-full"
                      style={{
                        backgroundColor: color.hex,
                        boxShadow:
                          form_label_color.toLowerCase() === color.hex
                            ? `0 0 0 2px var(--modal-bg), 0 0 0 3.5px ${color.hex}`
                            : "none",
                      }}
                      title={color.name}
                      type="button"
                      onClick={() => set_form_label_color(color.hex)}
                    />
                  ))}
                </div>
                <Input
                  aria-label={t("settings.hex_color_value")}
                  className="w-full font-mono"
                  maxLength={7}
                  placeholder="#000000"
                  type="text"
                  value={form_label_color}
                  onChange={(e) => handle_label_color_input(e.target.value)}
                />
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}
