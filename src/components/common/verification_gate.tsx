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
import { useState, useEffect, useCallback, useRef } from "react";

import {
  save_recovery_email,
  check_recovery_email_verified,
  resend_recovery_verification,
} from "@/services/api/recovery_email";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";
import { use_i18n } from "@/lib/i18n/context";

type GateStep = "email_input" | "verification" | "done";

export function VerificationGate({ children }: { children: React.ReactNode }) {
  const { t } = use_i18n();
  const [is_required, set_is_required] = useState(false);
  const [step, set_step] = useState<GateStep>("email_input");
  const [email, set_email] = useState("");
  const [error, set_error] = useState("");
  const [is_submitting, set_is_submitting] = useState(false);
  const [is_verified, set_is_verified] = useState(false);
  const [resend_cooldown, set_resend_cooldown] = useState(0);
  const poll_ref = useRef<ReturnType<typeof setInterval> | null>(null);
  const cooldown_ref = useRef<ReturnType<typeof setInterval> | null>(null);

  const handle_verification_required = useCallback(() => {
    set_is_required(true);
  }, []);

  useEffect(() => {
    window.addEventListener(
      "aster:verification-required",
      handle_verification_required,
    );

    return () => {
      window.removeEventListener(
        "aster:verification-required",
        handle_verification_required,
      );
    };
  }, [handle_verification_required]);

  useEffect(() => {
    return () => {
      if (poll_ref.current) clearInterval(poll_ref.current);
      if (cooldown_ref.current) clearInterval(cooldown_ref.current);
    };
  }, []);

  const start_polling = useCallback(() => {
    if (poll_ref.current) clearInterval(poll_ref.current);
    poll_ref.current = setInterval(async () => {
      try {
        const verified = await check_recovery_email_verified();

        if (verified) {
          set_is_verified(true);
          if (poll_ref.current) clearInterval(poll_ref.current);
          setTimeout(() => {
            set_is_required(false);
            set_step("done");
          }, 1500);
        }
      } catch {
        /* noop */
      }
    }, 5000);
  }, []);

  const start_cooldown = useCallback(() => {
    set_resend_cooldown(60);
    if (cooldown_ref.current) clearInterval(cooldown_ref.current);
    cooldown_ref.current = setInterval(() => {
      set_resend_cooldown((prev) => {
        if (prev <= 1) {
          if (cooldown_ref.current) clearInterval(cooldown_ref.current);

          return 0;
        }

        return prev - 1;
      });
    }, 1000);
  }, []);

  const handle_submit_email = useCallback(async () => {
    const trimmed = email.trim().toLowerCase();

    if (!trimmed || !trimmed.includes("@")) {
      set_error(t("common.please_enter_valid_email"));

      return;
    }

    set_is_submitting(true);
    set_error("");

    try {
      const vault = get_vault_from_memory();

      if (!vault) {
        set_error(t("common.vault_access_error"));
        set_is_submitting(false);

        return;
      }

      const result = await save_recovery_email(trimmed, vault);

      if (result && typeof result === "object" && "error" in result) {
        const err = result as { error: string; code?: string };

        if (err.code === "CONFLICT") {
          set_error(t("common.recovery_email_already_used"));
        } else {
          set_error(err.error || t("common.something_went_wrong_try_again"));
        }
        set_is_submitting(false);

        return;
      }

      set_step("verification");
      start_polling();
      start_cooldown();
    } catch {
      set_error(t("common.something_went_wrong_try_again"));
    }
    set_is_submitting(false);
  }, [email, start_polling, start_cooldown]);

  const handle_resend = useCallback(async () => {
    if (resend_cooldown > 0) return;
    try {
      await resend_recovery_verification(email.trim().toLowerCase());
      start_cooldown();
    } catch {
      /* noop */
    }
  }, [email, resend_cooldown, start_cooldown]);

  if (!is_required) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <div
        className="fixed inset-0 z-[99998] flex items-center justify-center backdrop-blur-md"
        style={{ backgroundColor: "var(--modal-overlay)" }}
      >
        <div
          className="relative w-full max-w-[480px] mx-4 rounded-xl border overflow-hidden"
          style={{
            backgroundColor: "var(--modal-bg)",
            borderColor: "var(--border-primary)",
            maxHeight: "90vh",
            overflowY: "auto",
          }}
        >
          {step === "email_input" && (
            <>
              <div className="px-6 pt-8 pb-4 flex flex-col items-center text-center">
                <svg
                  className="w-10 h-10 mb-5"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  style={{ color: "var(--accent-color, #3b82f6)" }}
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                </svg>

                <h2
                  className="text-xl font-semibold leading-tight"
                  style={{ color: "var(--text-primary)" }}
                >
                  {t("common.add_recovery_email")}
                </h2>

                <p
                  className="text-sm mt-2 leading-relaxed max-w-[360px]"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {t("common.add_recovery_email_gate_desc")}
                </p>
              </div>

              <div className="px-6 pb-6">
                <div className="space-y-3">
                  <div>
                    <label
                      className="block text-sm font-medium mb-2"
                      htmlFor="recovery-email"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {t("common.recovery_email_label")}
                    </label>
                    <input
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-colors duration-150"
                      id="recovery-email"
                      placeholder="your@email.com"
                      style={{
                        backgroundColor: "var(--input-bg, var(--bg-primary))",
                        borderColor: error
                          ? "var(--color-danger, #ef4444)"
                          : "var(--input-border, var(--border-primary))",
                        color: "var(--text-primary)",
                      }}
                      type="email"
                      value={email}
                      onChange={(e) => {
                        set_email(e.target.value);
                        set_error("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handle_submit_email();
                      }}
                    />
                    {error && (
                      <p
                        className="text-xs mt-1.5"
                        style={{ color: "var(--color-danger, #ef4444)" }}
                      >
                        {error}
                      </p>
                    )}
                  </div>

                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {t("common.recovery_email_encrypted_note")}
                  </p>
                </div>
              </div>

              <div className="px-6 pb-6 pt-0">
                <button
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 "
                  disabled={is_submitting || !email.trim()}
                  style={{
                    backgroundColor: "var(--accent-color)",
                    color: "#ffffff",
                  }}
                  onClick={handle_submit_email}
                >
                  {is_submitting ? (
                    <svg
                      className="animate-spin w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        fill="currentColor"
                      />
                    </svg>
                  ) : null}
                  {is_submitting
                    ? t("common.submitting")
                    : t("common.continue")}
                </button>
              </div>
            </>
          )}

          {step === "verification" && (
            <>
              <div className="px-6 pt-8 pb-4 flex flex-col items-center text-center">
                {is_verified ? (
                  <svg
                    className="w-10 h-10 mb-5"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    style={{ color: "var(--color-success, #22c55e)" }}
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                ) : (
                  <svg
                    className="w-10 h-10 mb-5"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    style={{ color: "var(--accent-color, #3b82f6)" }}
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                  </svg>
                )}

                <h2
                  className="text-xl font-semibold leading-tight"
                  style={{ color: "var(--text-primary)" }}
                >
                  {is_verified
                    ? t("common.verified")
                    : t("auth.check_your_inbox")}
                </h2>

                <p
                  className="text-sm mt-2 leading-relaxed max-w-[360px]"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {is_verified
                    ? t("common.recovery_email_verified_redirect")
                    : t("common.verification_link_sent_to", {
                        email: email.trim().toLowerCase(),
                      })}
                </p>
              </div>

              {!is_verified && (
                <div className="px-6 pb-6">
                  <div
                    className="rounded-xl border p-4 flex items-start gap-3"
                    style={{
                      backgroundColor: "var(--bg-tertiary)",
                      borderColor: "var(--border-secondary)",
                    }}
                  >
                    <svg
                      className="w-4 h-4 flex-shrink-0 mt-0.5"
                      fill="currentColor"
                      style={{ color: "var(--text-muted)" }}
                      viewBox="0 0 20 20"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        clipRule="evenodd"
                        d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z"
                        fillRule="evenodd"
                      />
                    </svg>
                    <p
                      className="text-xs leading-relaxed"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {t("common.check_spam_folder_note")}
                    </p>
                  </div>

                  <button
                    className="w-full mt-3 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium transition-all duration-150 border cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-80 "
                    disabled={resend_cooldown > 0}
                    style={{
                      backgroundColor: "var(--bg-hover)",
                      color: "var(--text-primary)",
                      borderColor: "var(--border-primary)",
                    }}
                    onClick={handle_resend}
                  >
                    {resend_cooldown > 0
                      ? t("auth.resend_in_seconds", {
                          seconds: String(resend_cooldown),
                        })
                      : t("auth.resend_verification_email")}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
