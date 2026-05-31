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
import { PencilSquareIcon } from "@heroicons/react/24/outline";

import { Spinner } from "@/components/ui/spinner";
import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";

const MAX_NOTE_LENGTH = 1024;

function sanitize_note(value: string): string {
  return value.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "").trim();
}

interface AliasNoteEditorProps {
  alias_address: string;
  note?: string;
  is_locked?: boolean;
  on_save: (next_note: string) => Promise<{ error?: unknown }>;
  on_saved: (next_note: string) => void;
}

export function AliasNoteEditor({
  alias_address,
  note,
  is_locked = false,
  on_save,
  on_saved,
}: AliasNoteEditorProps) {
  const { t } = use_i18n();
  const [is_editing, set_is_editing] = useState(false);
  const [value, set_value] = useState(note ?? "");
  const [saving, set_saving] = useState(false);
  const input_ref = useRef<HTMLTextAreaElement | null>(null);
  const commit_lock = useRef(false);
  const cancelled = useRef(false);

  useEffect(() => {
    set_value(note ?? "");
  }, [note]);

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
    cancelled.current = false;
    set_value(note ?? "");
    set_is_editing(true);
  };

  const exit_edit = () => {
    commit_lock.current = false;
    set_is_editing(false);
  };

  const commit_save = async () => {
    if (cancelled.current || !is_editing) return;
    if (commit_lock.current) return;
    commit_lock.current = true;

    const cleaned = sanitize_note(value);

    if (cleaned.length > MAX_NOTE_LENGTH) {
      show_toast(t("common.alias_note_too_long"), "error");
      commit_lock.current = false;

      return;
    }

    if (cleaned === (note ?? "")) {
      exit_edit();

      return;
    }

    set_saving(true);
    try {
      const response = await on_save(cleaned);

      if (response.error) {
        show_toast(t("common.failed_update_alias_note"), "error");
        set_value(note ?? "");
      } else {
        on_saved(cleaned);
        show_toast(t("common.alias_note_updated"), "success");
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      show_toast(t("common.failed_update_alias_note"), "error");
      set_value(note ?? "");
    } finally {
      set_saving(false);
      exit_edit();
    }
  };

  const handle_cancel = () => {
    cancelled.current = true;
    commit_lock.current = true;
    set_value(note ?? "");
    set_is_editing(false);
  };

  const handle_key_down = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      commit_save();
    } else if (event.key === "Escape") {
      event.preventDefault();
      handle_cancel();
    }
  };

  const handle_change = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value;

    if (next.length <= MAX_NOTE_LENGTH) {
      set_value(next);
    }
  };

  const placeholder_label = t("common.alias_note_placeholder");
  const aria_label = `${t("common.edit_alias_note")} ${alias_address}`;

  if (is_editing) {
    return (
      <span className="mt-0.5 flex flex-col gap-0.5">
        <span className="flex items-start gap-1">
          <textarea
            ref={input_ref}
            aria-label={aria_label}
            className="w-full resize-none bg-transparent text-xs text-txt-muted outline-none ring-0 border-b border-edge-primary placeholder:opacity-50 focus:outline-none focus:ring-0"
            disabled={saving}
            maxLength={MAX_NOTE_LENGTH}
            placeholder={placeholder_label}
            rows={2}
            value={value}
            onBlur={commit_save}
            onChange={handle_change}
            onKeyDown={handle_key_down}
          />
          {saving && <Spinner className="text-txt-muted" size="xs" />}
        </span>
        <span className="self-end text-[10px] tabular-nums text-txt-muted">
          {t("common.alias_note_char_count", {
            count: value.length,
            max: MAX_NOTE_LENGTH,
          })}
        </span>
      </span>
    );
  }

  const has_note = !!note;
  const display_label = has_note ? note : placeholder_label;
  const cursor_class = is_locked ? "cursor-not-allowed" : "cursor-text";

  return (
    <button
      aria-label={aria_label}
      className={`mt-0.5 flex max-w-full items-center gap-1 ${cursor_class} truncate text-left text-xs ${
        has_note ? "text-txt-muted" : "text-txt-muted opacity-70"
      } focus:outline-none focus:ring-0`}
      disabled={is_locked}
      type="button"
      onClick={enter_edit}
    >
      <PencilSquareIcon className="w-3 h-3 flex-shrink-0" />
      <span className="truncate">{display_label}</span>
    </button>
  );
}
