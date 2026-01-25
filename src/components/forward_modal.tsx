import { useState, useEffect, useCallback, useRef, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { TemplatePicker } from "./template_picker";
import { CloseIcon } from "./icons";

import { Button } from "@/components/ui/button";
import { use_draggable_modal } from "@/hooks/use_draggable_modal";
import { undo_send_manager } from "@/hooks/use_undo_send";
import { MODAL_SIZES } from "@/constants/modal";
import { send_forward, type OriginalEmail } from "@/services/mail_actions";
import { get_undo_send_delay_ms } from "@/services/send_queue";
import { use_preferences } from "@/contexts/preferences_context";
import { use_auth } from "@/contexts/auth_context";
import { show_toast } from "@/components/simple_toast";
import { EMAIL_REGEX } from "@/lib/utils";

const ASTER_FOOTER_TEXT = "\n\nSecured by Aster Mail - https://astermail.org";

interface ForwardModalProps {
  is_open: boolean;
  on_close: () => void;
  sender_name: string;
  sender_email: string;
  sender_avatar: string;
  email_subject: string;
  email_body?: string;
  email_timestamp?: string;
}

export function ForwardModal({
  is_open,
  on_close,
  sender_name,
  sender_email,
  email_subject,
  email_body = "",
  email_timestamp = new Date().toISOString(),
}: ForwardModalProps) {
  const { user } = use_auth();
  const { preferences } = use_preferences();
  const [recipients, set_recipients] = useState<string[]>([]);
  const [input_value, set_input_value] = useState("");
  const [forward_message, set_forward_message] = useState("");
  const [is_sending, set_is_sending] = useState(false);
  const [error_message, set_error_message] = useState<string | null>(null);
  const [input_error, set_input_error] = useState<string | null>(null);
  const [is_minimized, set_is_minimized] = useState(false);
  const [is_expanded, set_is_expanded] = useState(false);
  const input_ref = useRef<HTMLInputElement>(null);
  const { handle_drag_start, get_position_style } = use_draggable_modal(
    is_open,
    MODAL_SIZES.medium,
  );

  const format_date = useCallback((timestamp: string): string => {
    const date = new Date(timestamp);

    return date.toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }, []);

  const build_forward_content = useCallback((): string => {
    const formatted_date = format_date(email_timestamp);
    const header = `---------- Forwarded message ---------\nFrom: ${sender_name} <${sender_email}>\nDate: ${formatted_date}\nSubject: ${email_subject}\n\n`;

    const plain_body = email_body
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .trim();

    return header + plain_body;
  }, [
    email_body,
    email_subject,
    email_timestamp,
    sender_email,
    sender_name,
    format_date,
  ]);

  useEffect(() => {
    if (!is_open) return;

    const handle_escape = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        on_close();
      }
    };

    document.addEventListener("keydown", handle_escape);

    return () => document.removeEventListener("keydown", handle_escape);
  }, [is_open, on_close]);

  useEffect(() => {
    if (is_open) {
      set_recipients([]);
      set_input_value("");
      set_forward_message(ASTER_FOOTER_TEXT + "\n\n" + build_forward_content());
      set_is_sending(false);
      set_error_message(null);
      set_input_error(null);
    }
  }, [is_open, build_forward_content]);

  const validate_and_add_recipient = useCallback(
    (email: string): boolean => {
      const trimmed = email.trim().toLowerCase();

      if (!trimmed) return false;

      if (!EMAIL_REGEX.test(trimmed)) {
        set_input_error("Invalid email address");

        return false;
      }

      if (recipients.includes(trimmed)) {
        set_input_error("Recipient already added");

        return false;
      }

      set_recipients((prev) => [...prev, trimmed]);
      set_input_value("");
      set_input_error(null);

      return true;
    },
    [recipients],
  );

  const handle_input_keydown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === "," || e.key === " ") {
        e.preventDefault();
        if (input_value.trim()) {
          validate_and_add_recipient(input_value);
        }
      } else if (
        e.key === "Backspace" &&
        !input_value &&
        recipients.length > 0
      ) {
        set_recipients((prev) => prev.slice(0, -1));
      }
    },
    [input_value, recipients.length, validate_and_add_recipient],
  );

  const handle_input_blur = useCallback(() => {
    if (input_value.trim()) {
      validate_and_add_recipient(input_value);
    }
  }, [input_value, validate_and_add_recipient]);

  const remove_recipient = useCallback((email: string) => {
    set_recipients((prev) => prev.filter((r) => r !== email));
  }, []);

  const handle_forward = useCallback(async () => {
    if (recipients.length === 0 || is_sending) return;

    set_error_message(null);
    set_is_sending(true);

    const original: OriginalEmail = {
      sender_email,
      sender_name,
      subject: email_subject,
      body: email_body,
      timestamp: email_timestamp,
    };

    const delay_ms = get_undo_send_delay_ms(
      preferences.undo_send_enabled,
      preferences.undo_send_seconds,
      preferences.undo_send_period,
    );
    const delay_seconds = delay_ms / 1000;

    const result = await send_forward(
      { original, recipients, message: forward_message },
      {
        on_complete: () => {
          show_toast("Email sent.", "success");
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("astermail:email-sent"));
          }, 100);
        },
        on_cancel: () => {},
        on_error: (error) => {
          set_error_message(error);
          set_is_sending(false);
        },
      },
      preferences.undo_send_period,
    );

    if (result.success && result.queued_id) {
      undo_send_manager.add({
        id: result.queued_id,
        to: recipients,
        subject: `Fwd: ${email_subject}`,
        body: forward_message,
        scheduled_time: Date.now() + delay_ms,
        total_seconds: delay_seconds,
      });

      on_close();
    } else if (!result.success) {
      set_error_message(result.error || "Failed to forward email");
      set_is_sending(false);
    }
  }, [
    recipients,
    is_sending,
    sender_email,
    sender_name,
    email_subject,
    email_body,
    email_timestamp,
    forward_message,
    preferences.undo_send_period,
    on_close,
  ]);

  const handle_close = useCallback(() => {
    on_close();
  }, [on_close]);

  const is_valid = recipients.length > 0;
  const can_send = is_valid && !is_sending;

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          animate={{ opacity: 1 }}
          className={`fixed z-50 flex flex-col shadow-2xl sm:border ${
            is_minimized
              ? "sm:w-[320px] sm:h-auto sm:rounded-t-lg"
              : is_expanded
                ? "inset-0 sm:inset-4 sm:w-auto sm:h-auto sm:rounded-lg"
                : "max-sm:inset-0 max-sm:rounded-none max-sm:border-0 sm:rounded-lg"
          }`}
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          style={{
            width: is_minimized
              ? undefined
              : is_expanded
                ? undefined
                : window.innerWidth < 640
                  ? "100%"
                  : `${MODAL_SIZES.medium.width}px`,
            height: is_minimized
              ? undefined
              : is_expanded
                ? undefined
                : window.innerWidth < 640
                  ? "100%"
                  : `${MODAL_SIZES.medium.height}px`,
            ...(window.innerWidth >= 640 && !is_expanded && !is_minimized
              ? get_position_style()
              : {}),
            ...(is_minimized && window.innerWidth >= 640
              ? { bottom: 0, right: 24, top: "auto", left: "auto" }
              : {}),
            backgroundColor: "var(--modal-bg)",
            borderColor: "var(--border-secondary)",
            willChange: "opacity",
          }}
          transition={{ duration: 0.15, ease: "easeOut" }}
        >
          <div
            className="flex items-center justify-between px-4 py-3 border-b cursor-move select-none"
            role="presentation"
            style={{ borderColor: "var(--border-secondary)" }}
            onMouseDown={handle_drag_start}
          >
            <h2
              className="text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              Forward
            </h2>
            <div
              className="flex items-center gap-1"
              role="presentation"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                className="transition-colors duration-200 p-1.5 w-7 h-7 flex items-center justify-center rounded"
                style={{ color: "var(--text-muted)" }}
                onClick={() => set_is_minimized(!is_minimized)}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = "var(--bg-hover)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M20 12H4" strokeLinecap="round" />
                </svg>
              </button>
              <button
                className="transition-colors duration-200 p-1.5 w-7 h-7 flex items-center justify-center rounded"
                style={{ color: "var(--text-muted)" }}
                onClick={() => {
                  set_is_expanded(!is_expanded);
                  set_is_minimized(false);
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = "var(--bg-hover)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
              >
                {is_expanded ? (
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
              <button
                className="transition-colors duration-200 p-1.5 w-7 h-7 flex items-center justify-center rounded"
                style={{ color: "var(--text-muted)" }}
                onClick={handle_close}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = "var(--bg-hover)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {!is_minimized && (
            <>
              <div className="px-4 pt-3 pb-2 space-y-2">
                <div
                  className="flex items-center gap-2 py-2 border-b"
                  style={{ borderColor: "var(--border-secondary)" }}
                >
                  <span
                    className="text-sm w-14 flex-shrink-0"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    From
                  </span>
                  <span
                    className="text-sm"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {user?.email || ""}
                  </span>
                </div>
                <div
                  className="flex items-center gap-2 py-2 border-b"
                  style={{ borderColor: "var(--border-secondary)" }}
                >
                  <span
                    className="text-sm w-14 flex-shrink-0"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    To
                  </span>
                  <div
                    className="flex-1 flex flex-wrap items-center gap-1 cursor-text"
                    role="button"
                    tabIndex={0}
                    onClick={() => input_ref.current?.focus()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        input_ref.current?.focus();
                      }
                    }}
                  >
                    {recipients.map((email) => (
                      <span
                        key={email}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-default-100 border"
                        style={{ borderColor: "var(--border-secondary)" }}
                      >
                        <span style={{ color: "var(--text-primary)" }}>
                          {email}
                        </span>
                        <button
                          className="hover:text-red-500 transition-colors"
                          style={{ color: "var(--text-muted)" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            remove_recipient(email);
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <input
                      ref={input_ref}
                      // eslint-disable-next-line jsx-a11y/no-autofocus
                      autoFocus
                      className="flex-1 min-w-[100px] text-sm outline-none bg-transparent disabled:opacity-50"
                      disabled={is_sending}
                      placeholder={recipients.length === 0 ? "Recipients" : ""}
                      style={{ color: "var(--text-primary)" }}
                      type="text"
                      value={input_value}
                      onBlur={handle_input_blur}
                      onChange={(e) => {
                        set_input_value(e.target.value);
                        set_input_error(null);
                      }}
                      onKeyDown={handle_input_keydown}
                    />
                  </div>
                </div>
                {input_error && (
                  <p className="text-xs text-red-500 pl-16">{input_error}</p>
                )}
                <div
                  className="flex items-center gap-2 py-2 border-b"
                  style={{ borderColor: "var(--border-secondary)" }}
                >
                  <span
                    className="text-sm w-14 flex-shrink-0"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    Subject
                  </span>
                  <span
                    className="text-sm truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Fwd: {email_subject}
                  </span>
                </div>
              </div>

              {error_message && (
                <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-700 dark:text-red-400">
                    {error_message}
                  </p>
                </div>
              )}

              <div className="flex-1 px-4 py-3 overflow-hidden">
                <textarea
                  className="w-full h-full text-sm leading-relaxed border-none outline-none resize-none bg-transparent disabled:opacity-50"
                  disabled={is_sending}
                  placeholder="Write message"
                  style={{ color: "var(--text-primary)" }}
                  value={forward_message}
                  onChange={(e) => set_forward_message(e.target.value)}
                />
              </div>

              <div
                className="border-t px-3 py-2.5 flex items-center gap-2"
                style={{ borderColor: "var(--border-primary)" }}
              >
                <Button
                  disabled={!can_send}
                  size="sm"
                  variant="primary"
                  onClick={handle_forward}
                >
                  {is_sending ? "Sending..." : "Forward"}
                </Button>

                <div className="flex items-center gap-0.5">
                  <TemplatePicker
                    disabled={is_sending}
                    on_select={(content) => set_forward_message(content)}
                  />
                </div>
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
