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
import type {} from "@/services/api/aliases";
import type {} from "@/lib/i18n/types";

import { useEffect, useState } from "react";

import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { prompt_upgrade } from "@/components/settings/aliases/feature_lock";
import { InfoHint } from "@/components/settings/aliases/info_hint";
import { is_composing } from "@/utils/ime";

export const INPUT_CLASS =
  "flex-1 min-w-0 h-9 px-3 rounded-lg bg-transparent border border-edge-secondary text-sm text-txt-primary placeholder:text-txt-muted outline-none";

export const MAX_DISPLAY_NAME_LENGTH = 128;
export const MAX_NOTE_LENGTH = 500;

export function sanitize_text(value: string): string {
  return value.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "").trim();
}

export function PanelRow({
  label,
  description,
  info,
  align_top,
  children,
}: {
  label: string;
  description?: string;
  info?: string;
  align_top?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex justify-between gap-6 py-4 ${align_top ? "items-start" : "items-center"}`}
    >
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-medium text-txt-primary">
          {label}
          {info && <InfoHint tip={info} title={label} />}
        </p>
        {description && (
          <p className="mt-0.5 text-sm text-txt-muted">{description}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-end">{children}</div>
    </div>
  );
}

export function TextFieldRow({
  label,
  description,
  placeholder,
  value,
  max_length,
  too_long_message,
  success_message,
  error_message,
  is_locked,
  on_save,
  on_saved,
}: {
  label: string;
  description: string;
  placeholder: string;
  value?: string;
  max_length: number;
  too_long_message: string;
  success_message: string;
  error_message: string;
  is_locked?: boolean;
  on_save: (next: string) => Promise<{ error?: unknown }>;
  on_saved: (next: string) => void;
}) {
  const { t } = use_i18n();
  const [draft, set_draft] = useState(value ?? "");
  const [saving, set_saving] = useState(false);

  useEffect(() => {
    set_draft(value ?? "");
  }, [value]);

  const commit = async () => {
    const cleaned = sanitize_text(draft);

    if (cleaned === (value ?? "")) {
      set_draft(cleaned);

      return;
    }

    if (cleaned.length > max_length) {
      show_toast(too_long_message, "error");

      return;
    }

    set_saving(true);
    try {
      const response = await on_save(cleaned);

      if (response.error) {
        show_toast(error_message, "error");
        set_draft(value ?? "");

        return;
      }
      on_saved(cleaned);
      show_toast(success_message, "success");
    } catch {
      show_toast(error_message, "error");
      set_draft(value ?? "");
    } finally {
      set_saving(false);
    }
  };

  return (
    <PanelRow description={description} label={label}>
      <div className="relative w-64">
        <Input
          className={`w-full pe-8${is_locked ? " pointer-events-none" : ""}`}
          disabled={saving}
          maxLength={max_length}
          placeholder={placeholder}
          readOnly={is_locked}
          size="md"
          tabIndex={is_locked ? -1 : undefined}
          value={draft}
          onBlur={commit}
          onChange={(event) => set_draft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !is_composing(event)) {
              event.preventDefault();
              event.currentTarget.blur();
            } else if (event.key === "Escape") {
              event.preventDefault();
              set_draft(value ?? "");
            }
          }}
        />
        {saving && (
          <span className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2">
            <Spinner className="text-txt-muted" size="xs" />
          </span>
        )}
        {is_locked && (
          <button
            aria-label={t("settings.feature_requires_upgrade")}
            className="absolute inset-0 cursor-pointer rounded-[12px]"
            type="button"
            onClick={() =>
              prompt_upgrade(
                t("settings.feature_requires_upgrade"),
                undefined,
                "has_alias_avatars",
              )
            }
          />
        )}
      </div>
    </PanelRow>
  );
}
