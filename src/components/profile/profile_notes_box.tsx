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
import { DocumentTextIcon, CheckCircleIcon } from "@heroicons/react/24/outline";

import {
  get_profile_note,
  save_profile_note,
  delete_profile_note,
} from "@/services/api/profile_notes";
import { Skeleton } from "@/components/ui/skeleton";
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";

interface ProfileNotesBoxProps {
  email: string;
  className?: string;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function ProfileNotesBox({
  email,
  className = "",
}: ProfileNotesBoxProps) {
  const { t } = use_i18n();
  const { has_keys } = use_auth();
  const [note, set_note] = useState("");
  const [is_loading, set_is_loading] = useState(true);
  const [save_status, set_save_status] = useState<SaveStatus>("idle");
  const [original_note, set_original_note] = useState("");

  const debounce_timeout_ref = useRef<NodeJS.Timeout | null>(null);
  const saved_timeout_ref = useRef<NodeJS.Timeout | null>(null);
  const is_mounted_ref = useRef(true);
  const current_email_ref = useRef(email);
  const save_version_ref = useRef(0);

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

      const target_email = current_email_ref.current;

      debounce_timeout_ref.current = setTimeout(() => {
        save_note(value, target_email);
      }, 1500);
    },
    [save_note, clear_timeouts],
  );

  const handle_blur = useCallback(() => {
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
      clear_timeouts();
    };
  }, [clear_timeouts]);

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
        }
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);
        if (cancelled) return;
      }

      set_is_loading(false);
    }

    load_note();

    return () => {
      cancelled = true;
      clear_timeouts();
    };
  }, [email, has_keys, clear_timeouts]);

  if (!has_keys || !email || email.trim().length === 0) {
    return null;
  }

  return (
    <div
      className={`rounded-xl border bg-surf-secondary border-edge-secondary ${className}`}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <DocumentTextIcon className="w-4 h-4 text-txt-muted" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-txt-muted">
            Notes
          </span>
        </div>
        {save_status === "saving" && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-[11px] text-blue-500">
              {t("common.saving")}
            </span>
          </div>
        )}
        {save_status === "saved" && (
          <div className="flex items-center gap-1">
            <CheckCircleIcon className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-[11px] text-blue-500">{t("mail.saved")}</span>
          </div>
        )}
        {save_status === "error" && (
          <span className="text-[11px] text-red-500">
            {t("common.error_label")}
          </span>
        )}
      </div>

      <div className="px-3 pb-3">
        {is_loading ? (
          <Skeleton className="h-16 rounded-lg" />
        ) : (
          <textarea
            className="w-full min-h-[64px] max-h-[160px] text-[13px] leading-relaxed bg-transparent outline-none resize-none placeholder:text-txt-muted text-txt-primary"
            maxLength={50000}
            placeholder={t("common.add_private_note_placeholder")}
            value={note}
            onBlur={handle_blur}
            onChange={(e) => handle_change(e.target.value)}
          />
        )}
      </div>
    </div>
  );
}
