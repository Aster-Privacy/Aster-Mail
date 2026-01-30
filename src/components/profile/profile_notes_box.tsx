import { useState, useEffect, useRef, useCallback } from "react";
import { DocumentTextIcon, CheckCircleIcon } from "@heroicons/react/24/outline";

import {
  get_profile_note,
  save_profile_note,
  delete_profile_note,
} from "@/services/api/profile_notes";
import { Skeleton } from "@/components/ui/skeleton";
import { use_auth } from "@/contexts/auth_context";

interface ProfileNotesBoxProps {
  email: string;
  className?: string;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function ProfileNotesBox({
  email,
  className = "",
}: ProfileNotesBoxProps) {
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
      } catch {
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
      } catch {
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
      className={`rounded-xl border ${className}`}
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderColor: "var(--border-secondary)",
      }}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <DocumentTextIcon
            className="w-4 h-4"
            style={{ color: "var(--text-muted)" }}
          />
          <span
            className="text-[11px] font-medium uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            Notes
          </span>
        </div>
        {save_status === "saving" && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-[11px] text-blue-500">Saving</span>
          </div>
        )}
        {save_status === "saved" && (
          <div className="flex items-center gap-1">
            <CheckCircleIcon className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-[11px] text-blue-500">Saved</span>
          </div>
        )}
        {save_status === "error" && (
          <span
            className="text-[11px]"
            style={{ color: "var(--error-color, #ef4444)" }}
          >
            Error
          </span>
        )}
      </div>

      <div className="px-3 pb-3">
        {is_loading ? (
          <Skeleton className="h-16 rounded-lg" />
        ) : (
          <textarea
            className="w-full min-h-[64px] max-h-[160px] text-[13px] leading-relaxed bg-transparent outline-none resize-none placeholder:text-[var(--text-muted)]"
            maxLength={50000}
            placeholder="Add a private note about this person..."
            style={{ color: "var(--text-primary)" }}
            value={note}
            onBlur={handle_blur}
            onChange={(e) => handle_change(e.target.value)}
          />
        )}
      </div>
    </div>
  );
}
