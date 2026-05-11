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

import { useEffect, useRef, useState } from "react";

import { Spinner } from "@/components/ui/spinner";
import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";

const MAX_DISPLAY_NAME_LENGTH = 128;

function sanitize_display_name(value: string): string {
  return value.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "").trim();
}

interface AliasDisplayNameEditorProps {
  alias_address: string;
  display_name?: string;
  is_locked?: boolean;
  on_save: (next_display_name: string) => Promise<{ error?: unknown }>;
  on_saved: (next_display_name: string) => void;
  variant?: "desktop" | "mobile";
}

export function AliasDisplayNameEditor({
  alias_address,
  display_name,
  is_locked = false,
  on_save,
  on_saved,
  variant = "desktop",
}: AliasDisplayNameEditorProps) {
  const { t } = use_i18n();
  const [is_editing, set_is_editing] = useState(false);
  const [value, set_value] = useState(display_name ?? "");
  const [saving, set_saving] = useState(false);
  const input_ref = useRef<HTMLInputElement | null>(null);
  const commit_lock = useRef(false);

  useEffect(() => {
    set_value(display_name ?? "");
  }, [display_name]);

  useEffect(() => {
    if (is_editing) {
      input_ref.current?.focus();
      const len = input_ref.current?.value.length ?? 0;

      input_ref.current?.setSelectionRange(len, len);
    }
  }, [is_editing]);

  const enter_edit = () => {
    if (saving || is_locked) return;
    commit_lock.current = false;
    set_value(display_name ?? "");
    set_is_editing(true);
  };

  const exit_edit = () => {
    commit_lock.current = false;
    set_is_editing(false);
  };

  const commit_save = async () => {
    if (commit_lock.current) return;
    commit_lock.current = true;

    const cleaned = sanitize_display_name(value);

    if (cleaned.length > MAX_DISPLAY_NAME_LENGTH) {
      show_toast(t("common.display_name_too_long"), "error");
      commit_lock.current = false;

      return;
    }

    if (cleaned === (display_name ?? "")) {
      exit_edit();

      return;
    }

    set_saving(true);
    try {
      const response = await on_save(cleaned);

      if (response.error) {
        show_toast(t("common.failed_update_alias_display_name"), "error");
        set_value(display_name ?? "");
      } else {
        on_saved(cleaned);
        show_toast(t("common.alias_display_name_updated"), "success");
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      show_toast(t("common.failed_update_alias_display_name"), "error");
      set_value(display_name ?? "");
    } finally {
      set_saving(false);
      exit_edit();
    }
  };

  const handle_cancel = () => {
    commit_lock.current = true;
    set_value(display_name ?? "");
    set_is_editing(false);
  };

  const handle_key_down = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit_save();
    } else if (event.key === "Escape") {
      event.preventDefault();
      handle_cancel();
    }
  };

  const handle_change = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;

    if (next.length <= MAX_DISPLAY_NAME_LENGTH) {
      set_value(next);
    }
  };

  const placeholder_label = t("common.add_display_name_placeholder");
  const aria_label = `${t("common.edit_display_name")} ${alias_address}`;

  if (is_editing) {
    const input_class =
      variant === "mobile"
        ? "mt-1 w-full bg-transparent text-[13px] text-[var(--mobile-text-muted)] outline-none ring-0 border-b border-edge-primary placeholder:opacity-50 focus:outline-none focus:ring-0"
        : "mt-0.5 w-full bg-transparent text-xs text-txt-muted outline-none ring-0 border-b border-edge-primary placeholder:opacity-50 focus:outline-none focus:ring-0";

    return (
      <span className="flex items-center gap-1">
        <input
          ref={input_ref}
          aria-label={aria_label}
          className={input_class}
          disabled={saving}
          maxLength={MAX_DISPLAY_NAME_LENGTH}
          placeholder={placeholder_label}
          value={value}
          onBlur={commit_save}
          onChange={handle_change}
          onKeyDown={handle_key_down}
        />
        {saving && <Spinner className="text-txt-muted" size="xs" />}
      </span>
    );
  }

  const has_name = !!display_name;
  const display_label = has_name ? display_name : placeholder_label;
  const cursor_class = is_locked ? "cursor-not-allowed" : "cursor-text";

  if (variant === "mobile") {
    return (
      <button
        aria-label={aria_label}
        className={`mt-1 block max-w-full ${cursor_class} truncate text-left text-[13px] ${
          has_name
            ? "text-[var(--mobile-text-muted)]"
            : "text-[var(--mobile-text-muted)] opacity-70"
        } focus:outline-none focus:ring-0`}
        disabled={is_locked}
        type="button"
        onClick={enter_edit}
      >
        {display_label}
      </button>
    );
  }

  return (
    <button
      aria-label={aria_label}
      className={`mt-0.5 block max-w-full ${cursor_class} truncate text-left text-xs ${
        has_name ? "text-txt-muted" : "text-txt-muted opacity-70"
      } focus:outline-none focus:ring-0`}
      disabled={is_locked}
      type="button"
      onClick={enter_edit}
    >
      {display_label}
    </button>
  );
}
