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
import { useState, useEffect, useRef, useCallback } from "react";
import { CheckCircleIcon } from "@heroicons/react/24/outline";

import {
  get_profile_note,
  note_exceeds_limit,
  save_profile_note,
  delete_profile_note,
} from "@/services/api/profile_notes";
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";

interface ProfileNotesInlineProps {
  email: string;
}

type SaveStatus = "idle" | "saving" | "saved" | "error" | "too_long";

export function ProfileNotesInline({ email }: ProfileNotesInlineProps) {
  const { t } = use_i18n();
  const { has_keys } = use_auth();
  const [note, set_note] = useState("");
  const [is_loading, set_is_loading] = useState(true);
  const [save_status, set_save_status] = useState<SaveStatus>("idle");
  const [original_note, set_original_note] = useState("");
  const [load_failed, set_load_failed] = useState(false);

  const debounce_timeout_ref = useRef<NodeJS.Timeout | null>(null);
  const saved_timeout_ref = useRef<NodeJS.Timeout | null>(null);
  const is_mounted_ref = useRef(true);
  const current_email_ref = useRef(email);
  const save_version_ref = useRef(0);
  const pending_save_ref = useRef<{
    content: string;
    email: string;
    original: string;
  } | null>(null);
  const textarea_ref = useRef<HTMLTextAreaElement>(null);

  const flush_pending_save = useCallback(() => {
    const pending = pending_save_ref.current;

    if (!pending) return;

    pending_save_ref.current = null;

    const trimmed = pending.content.trim();

    if (trimmed === pending.original.trim()) return;
    if (note_exceeds_limit(trimmed)) return;

    const request =
      trimmed === ""
        ? delete_profile_note(pending.email)
        : save_profile_note(pending.email, trimmed);

    void request.catch(() => undefined);
  }, []);

  const clear_timeouts = useCallback(() => {
    if (debounce_timeout_ref.current) {
      clearTimeout(debounce_timeout_ref.current);
      debounce_timeout_ref.current = null;
    }
    if (saved_timeout_ref.current) {
      clearTimeout(saved_timeout_ref.current);
      saved_timeout_ref.current = null;
    }
  }, []);

  useEffect(() => {
    current_email_ref.current = email;
  }, [email]);

  const save_note = useCallback(
    async (content: string, target_email: string) => {
      if (!is_mounted_ref.current || !has_keys) return;
      if (!target_email || target_email.trim().length === 0) return;

      const trimmed = content.trim();

      if (note_exceeds_limit(trimmed)) {
        set_save_status("too_long");

        return;
      }

      const current_version = ++save_version_ref.current;

      if (trimmed === original_note.trim()) {
        set_save_status("idle");

        return;
      }

      set_save_status("saving");

      try {
        if (trimmed === "") {
          const response = await delete_profile_note(target_email);

          if (!is_mounted_ref.current) return;
          if (current_email_ref.current !== target_email) return;
          if (save_version_ref.current !== current_version) return;

          if (response.error) {
            set_save_status("error");
          } else {
            set_original_note("");
            set_save_status("saved");
            clear_timeouts();
            saved_timeout_ref.current = setTimeout(() => {
              if (
                is_mounted_ref.current &&
                save_version_ref.current === current_version
              ) {
                set_save_status("idle");
              }
            }, 2000);
          }
        } else {
          const response = await save_profile_note(target_email, trimmed);

          if (!is_mounted_ref.current) return;
          if (current_email_ref.current !== target_email) return;
          if (save_version_ref.current !== current_version) return;

          if (response.error) {
            set_save_status("error");
          } else {
            set_original_note(trimmed);
            set_save_status("saved");
            clear_timeouts();
            saved_timeout_ref.current = setTimeout(() => {
              if (
                is_mounted_ref.current &&
                save_version_ref.current === current_version
              ) {
                set_save_status("idle");
              }
            }, 2000);
          }
        }
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);
        if (
          is_mounted_ref.current &&
          save_version_ref.current === current_version
        ) {
          set_save_status("error");
        }
      }
    },
    [original_note, has_keys, clear_timeouts],
  );

  const handle_change = useCallback(
    (value: string) => {
      set_note(value);
      clear_timeouts();

      if (note_exceeds_limit(value)) {
        pending_save_ref.current = null;
        set_save_status("too_long");

        return;
      }

      const target_email = current_email_ref.current;

      pending_save_ref.current = {
        content: value,
        email: target_email,
        original: original_note,
      };
      debounce_timeout_ref.current = setTimeout(() => {
        pending_save_ref.current = null;
        save_note(value, target_email);
      }, 1500);
    },
    [save_note, clear_timeouts, original_note],
  );

  const handle_blur = useCallback(() => {
    pending_save_ref.current = null;
    if (debounce_timeout_ref.current) {
      clearTimeout(debounce_timeout_ref.current);
      debounce_timeout_ref.current = null;
    }

    if (note.trim() !== original_note.trim()) {
      save_note(note, current_email_ref.current);
    }
  }, [note, original_note, save_note]);

  useEffect(() => {
    is_mounted_ref.current = true;

    return () => {
      is_mounted_ref.current = false;
      flush_pending_save();
      clear_timeouts();
    };
  }, [clear_timeouts, flush_pending_save]);

  useEffect(() => {
    let cancelled = false;

    async function load_note() {
      if (!has_keys || !email || email.trim().length === 0) {
        set_is_loading(false);

        return;
      }

      clear_timeouts();
      save_version_ref.current++;
      set_is_loading(true);
      set_note("");
      set_original_note("");
      set_save_status("idle");

      try {
        const response = await get_profile_note(email);

        if (cancelled) return;

        if (response.data) {
          set_note(response.data.content);
          set_original_note(response.data.content);
          set_load_failed(false);
        } else {
          set_load_failed(true);
        }
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);
        if (cancelled) return;
        set_load_failed(true);
      }

      set_is_loading(false);

      setTimeout(() => {
        if (!cancelled && textarea_ref.current) {
          textarea_ref.current.focus();
        }
      }, 50);
    }

    load_note();

    return () => {
      cancelled = true;
      flush_pending_save();
      clear_timeouts();
    };
  }, [email, has_keys, clear_timeouts, flush_pending_save]);

  if (!has_keys || !email || email.trim().length === 0) {
    return null;
  }

  return (
    <div
      className="p-2 bg-surf-secondary"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-txt-muted">
          {t("common.notes")}
        </span>
        {save_status === "saving" && (
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 border-[1.5px] border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-[10px] text-blue-500">
              {t("common.saving")}
            </span>
          </div>
        )}
        {save_status === "saved" && (
          <div className="flex items-center gap-0.5">
            <CheckCircleIcon className="w-3 h-3 text-blue-500" />
            <span className="text-[10px] text-blue-500">{t("mail.saved")}</span>
          </div>
        )}
        {save_status === "error" && (
          <span className="text-[10px] text-red-500">
            {t("common.error_label")}
          </span>
        )}
        {save_status === "too_long" && (
          <span className="text-[10px] text-red-500">
            {t("common.alias_note_too_long")}
          </span>
        )}
      </div>

      {is_loading ? (
        <div className="h-14 rounded animate-pulse bg-surf-tertiary" />
      ) : load_failed ? (
        <p className="h-14 text-[12px] text-txt-muted">
          {t("common.something_went_wrong_try_again")}
        </p>
      ) : (
        <textarea
          ref={textarea_ref}
          className="w-full h-14 text-[12px] leading-relaxed bg-transparent outline-none resize-none placeholder:text-txt-muted text-txt-primary"
          maxLength={50000}
          placeholder={t("common.add_note_placeholder")}
          value={note}
          onBlur={handle_blur}
          onChange={(e) => handle_change(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e["key"] === "Escape") {
              (e.target as HTMLTextAreaElement).blur();
            }
          }}
        />
      )}
    </div>
  );
}
