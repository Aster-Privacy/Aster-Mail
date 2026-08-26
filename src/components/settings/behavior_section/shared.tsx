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
import type {} from "@/services/api/preferences";
import type {} from "@/services/api/family_org";

import { Switch } from "@aster/ui";
import {
  LockClosedIcon,
  XMarkIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SUPPORTED_LANGUAGES,
  type LanguageCode,
} from "@/services/translation/engine_types";
import { language_display_name } from "@/services/translation/accepted_languages";
import { InfoPopover } from "@/components/ui/info_popover";

export interface ToggleSettingProps {
  title: string;
  description: string;
  enabled: boolean;
  on_toggle: () => void;
  info?: { title: string; description: string };
}

export function is_redundant_info(
  info: { title: string; description: string } | undefined,
  title: string,
  description: string,
): boolean {
  if (!info) return true;

  return info.title === title && info.description === description;
}

export function ToggleSetting({
  title,
  description,
  enabled,
  on_toggle,
  info,
}: ToggleSettingProps) {
  return (
    <div className="flex items-center justify-between py-4">
      <div className="flex-1 pe-4">
        <p className="flex items-center gap-1.5 text-sm font-medium text-txt-primary">
          {title}
          {!is_redundant_info(info, title, description) && info && (
            <InfoPopover description={info.description} title={info.title} />
          )}
        </p>
        <p className="text-sm mt-0.5 text-txt-muted">{description}</p>
      </div>
      <Switch
        aria-label={title}
        checked={enabled}
        size="lg"
        onCheckedChange={on_toggle}
      />
    </div>
  );
}

export interface SelectSettingProps {
  title: string;
  description: string;
  value: string;
  options: { value: string; label: string }[];
  on_change: (value: string) => void;
  info?: { title: string; description: string };
  disabled?: boolean;
  disabled_note?: string;
}

export function SelectSetting({
  title,
  description,
  value,
  options,
  on_change,
  info,
  disabled,
  disabled_note,
}: SelectSettingProps) {
  return (
    <div className="flex items-center justify-between py-4">
      <div className="flex-1 pe-4">
        <p className="text-sm font-medium text-txt-primary flex items-center gap-1.5">
          {title}
          {!is_redundant_info(info, title, description) && info && (
            <InfoPopover description={info.description} title={info.title} />
          )}
        </p>
        <p className="text-sm mt-0.5 text-txt-muted">{description}</p>
        {disabled && disabled_note && (
          <p className="text-xs mt-1 text-amber-500 dark:text-amber-400 flex items-center gap-1">
            <LockClosedIcon className="w-3 h-3 flex-shrink-0" />
            {disabled_note}
          </p>
        )}
      </div>
      <Select disabled={disabled} value={value} onValueChange={on_change}>
        <SelectTrigger className="w-[200px]">
          <SelectValue>
            {disabled && disabled_note ? disabled_note : undefined}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export interface LanguagePickerProps {
  title: string;
  description: string;
  selected: readonly string[];
  is_auto: boolean;
  ui_locale: string;
  add_label: string;
  auto_label: string;
  on_add: (code: string) => void;
  on_remove: (code: string) => void;
}

export function LanguagePicker({
  title,
  description,
  selected,
  is_auto,
  ui_locale,
  add_label,
  auto_label,
  on_add,
  on_remove,
}: LanguagePickerProps) {
  const available = SUPPORTED_LANGUAGES.filter(
    (code) => !selected.includes(code),
  );
  const display = (code: string) =>
    language_display_name(code as LanguageCode, ui_locale);

  return (
    <div className="py-4">
      <p className="text-sm font-medium text-txt-primary">{title}</p>
      <p className="text-sm mt-0.5 text-txt-muted">{description}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {selected.map((code) => (
          <span
            key={code}
            className="inline-flex items-center gap-1.5 rounded-full border border-edge-primary bg-surf-tertiary ps-3 pe-1.5 py-1 text-sm font-medium text-txt-primary"
          >
            {display(code)}
            <button
              aria-label={display(code)}
              className="rounded-full p-0.5 text-txt-muted hover:text-txt-primary hover:bg-white/10 transition-colors"
              type="button"
              onClick={() => on_remove(code)}
            >
              <XMarkIcon className="w-3.5 h-3.5" />
            </button>
          </span>
        ))}

        {available.length > 0 && (
          <Select value="" onValueChange={(v) => v && on_add(v)}>
            <SelectTrigger className="h-auto w-auto gap-1.5 rounded-full border-dashed bg-transparent px-3 py-1 text-txt-secondary hover:text-txt-primary">
              <span className="inline-flex items-center gap-1.5">
                <PlusIcon className="w-3.5 h-3.5" />
                {add_label}
              </span>
            </SelectTrigger>
            <SelectContent>
              {available.map((code) => (
                <SelectItem key={code} value={code}>
                  {display(code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {is_auto && selected.length > 0 && (
          <span className="text-xs text-txt-muted">{auto_label}</span>
        )}
      </div>
    </div>
  );
}

export const UNDO_PRESET_SECONDS = [3, 5, 10, 15, 20, 30] as const;
export const UNDO_MIN_SECONDS = 1;
export const UNDO_MAX_SECONDS = 30;
export const UNDO_DEFAULT_SECONDS = 10;

export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 360;
export const SIDEBAR_DEFAULT_WIDTH = 256;
export const SIDEBAR_PRESET_WIDTHS = [200, 256, 320] as const;

export function clamp_sidebar_width(value: number): number {
  if (!Number.isFinite(value)) return SIDEBAR_DEFAULT_WIDTH;

  return Math.min(
    SIDEBAR_MAX_WIDTH,
    Math.max(SIDEBAR_MIN_WIDTH, Math.round(value)),
  );
}

export function undo_send_is_active(
  enabled: boolean | undefined,
  seconds: number | undefined,
): boolean {
  if (enabled === false) {
    return false;
  }

  if (typeof seconds === "number" && Number.isFinite(seconds) && seconds <= 0) {
    return false;
  }

  return true;
}

export function clamp_undo_seconds(value: number): number {
  if (!Number.isFinite(value) || value < UNDO_MIN_SECONDS) {
    return UNDO_DEFAULT_SECONDS;
  }

  return Math.min(value, UNDO_MAX_SECONDS);
}
