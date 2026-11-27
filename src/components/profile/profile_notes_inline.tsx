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
import type { KeyboardEvent, SyntheticEvent } from "react";

import { useId, useRef } from "react";
import { ExclamationCircleIcon } from "@heroicons/react/24/outline";

import { use_profile_note } from "@/components/profile/use_profile_note";
import { use_i18n } from "@/lib/i18n/context";
import { SaveStatusIndicator } from "@/components/common/save_status_indicator";

interface ProfileNotesInlineProps {
  email: string;
}

const NOTE_MAX_LENGTH = 50000;

const FIELD_SURFACE_CLASS =
  "rounded-[var(--aster-radius-field,10px)] bg-[var(--aster-field-bg)]";

function stop_propagation(event: SyntheticEvent) {
  event.stopPropagation();
}

export function ProfileNotesInline({ email }: ProfileNotesInlineProps) {
  const { t } = use_i18n();
  const field_id = useId();
  const textarea_ref = useRef<HTMLTextAreaElement>(null);
  const {
    is_available,
    note,
    is_loading,
    load_failed,
    save_status,
    handle_change,
    handle_blur,
    retry_load,
    retry_save,
  } = use_profile_note(email, { focus_ref: textarea_ref });

  if (!is_available) {
    return null;
  }

  const is_too_long = save_status === "too_long";
  const is_save_failed = save_status === "error";
  const show_indicator = save_status === "saving" || save_status === "saved";

  const handle_textarea_key_down = (
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.currentTarget.blur();
    }
  };

  return (
    <div
      className="px-1.5 pt-0.5 pb-1.5"
      data-testid="sender_notes"
      onClick={stop_propagation}
      onKeyDown={stop_propagation}
    >
      <div className="flex min-h-[20px] items-center justify-between gap-2 px-1 pb-1.5">
        <label
          className="text-[12px] font-medium text-txt-secondary"
          htmlFor={field_id}
        >
          {t("common.notes")}
        </label>
        {show_indicator ? <SaveStatusIndicator status={save_status} /> : null}
      </div>

      {is_loading ? (
        <div
          aria-busy="true"
          className={`h-[76px] animate-pulse ${FIELD_SURFACE_CLASS}`}
          data-testid="sender_notes_loading"
        />
      ) : load_failed ? (
        <div
          className={`flex items-center gap-2 px-3 py-2.5 ${FIELD_SURFACE_CLASS}`}
          role="alert"
        >
          <ExclamationCircleIcon className="h-4 w-4 flex-shrink-0 text-[color:var(--color-danger,#ef4444)]" />
          <span className="flex-1 min-w-0 text-[12px] leading-snug text-txt-secondary">
            {t("common.sender_note_load_failed")}
          </span>
          <button
            className="flex-shrink-0 text-[12px] font-medium text-[color:var(--accent-color)] hover:underline"
            type="button"
            onClick={retry_load}
          >
            {t("common.retry")}
          </button>
        </div>
      ) : (
        <textarea
          ref={textarea_ref}
          aria-invalid={is_too_long || is_save_failed}
          className={`aster_input aster_input_tonal min-h-[76px] max-h-[160px] resize-none px-3 py-2 text-[13px] leading-relaxed text-txt-primary placeholder:text-txt-muted ${
            is_too_long || is_save_failed ? "aster_input_error" : ""
          }`}
          id={field_id}
          maxLength={NOTE_MAX_LENGTH}
          placeholder={t("common.add_note_placeholder")}
          rows={3}
          value={note}
          onBlur={handle_blur}
          onChange={(event) => handle_change(event.target.value)}
          onClick={stop_propagation}
          onKeyDown={handle_textarea_key_down}
        />
      )}

      {is_too_long ? (
        <p className="px-1 pt-1.5 text-[11px] leading-snug text-[color:var(--color-danger,#ef4444)]">
          {t("common.alias_note_too_long")}
        </p>
      ) : is_save_failed ? (
        <div className="flex items-center gap-2 px-1 pt-1.5" role="alert">
          <span className="flex-1 min-w-0 text-[11px] leading-snug text-[color:var(--color-danger,#ef4444)]">
            {t("common.sender_note_save_failed")}
          </span>
          <button
            className="flex-shrink-0 text-[11px] font-medium text-[color:var(--accent-color)] hover:underline"
            type="button"
            onClick={retry_save}
            onMouseDown={(event) => event.preventDefault()}
          >
            {t("common.retry")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
