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
import type { User } from "@/services/account_manager";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { copy_text_or_throw } from "@/utils/copy_text";
import { open_external } from "@/utils/open_link";
import {
  type DevicePubkeys,
  request_device_code,
  poll_device_code_status,
  complete_device_pairing,
} from "@/native/desktop_device_auth";
import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import { decrypt_vault } from "@/services/crypto/key_manager";
import { get_user_info } from "@/services/api/auth";
import { use_should_reduce_motion } from "@/provider";
import { Logo } from "@/components/auth/auth_styles";
import { Spinner } from "@/components/ui/spinner";

const WEB_LINK_DEVICE_URL = "https://app.astermail.org/link-device";
const WEB_SIGN_UP_URL = "https://app.astermail.org/register";

export interface DeviceSignInSession {
  user: User;
  vault: Awaited<ReturnType<typeof decrypt_vault>>;
  passphrase: string;
  encrypted_vault: string;
  vault_nonce: string;
  device_id: string;
}

interface DeviceLoginResponse {
  user_id: string;
  username: string;
  email: string;
  encrypted_vault: string;
  vault_nonce: string;
}

export async function resolve_device_login_session(
  login_response: unknown,
  passphrase: string | null,
  device_id: string,
): Promise<DeviceSignInSession> {
  if (!passphrase) throw new Error("passphrase_null");

  const lr = login_response as DeviceLoginResponse;
  const vault = await decrypt_vault(
    lr.encrypted_vault,
    lr.vault_nonce,
    passphrase,
  );
  const user_info_response = await get_user_info();
  const user: User = user_info_response.data
    ? {
        id: lr.user_id,
        username: lr.username,
        email: lr.email,
        display_name: user_info_response.data.display_name || undefined,
        profile_color: user_info_response.data.profile_color || undefined,
        profile_picture: user_info_response.data.profile_picture || undefined,
      }
    : {
        id: lr.user_id,
        username: lr.username,
        email: lr.email,
      };

  return {
    user,
    vault,
    passphrase,
    encrypted_vault: lr.encrypted_vault,
    vault_nonce: lr.vault_nonce,
    device_id,
  };
}

type FlowState =
  | "requesting_code"
  | "showing_code"
  | "completing"
  | "error"
  | "expired";

const page_variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const page_transition = {
  duration: 0.2,
  ease: "easeOut" as const,
};

const MAX_POLLS = 60;

function poll_delay(count: number): number {
  if (count < 10) return 3000;
  if (count < 20) return 5000;

  return 8000;
}

function format_time(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;

  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface DesktopCodeSignInProps {
  on_signed_in: (session: DeviceSignInSession) => Promise<void>;
  on_cancel?: () => void;
  cancel_label?: string;
}

export function DesktopCodeSignIn({
  on_signed_in,
  on_cancel,
  cancel_label,
}: DesktopCodeSignInProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const [flow_state, set_flow_state] = useState<FlowState>("requesting_code");
  const [code, set_code] = useState<string | null>(null);
  const [copied, set_copied] = useState(false);
  const [time_left, set_time_left] = useState(0);
  const [error_detail, set_error_detail] = useState<string | null>(null);
  const [flow_key, set_flow_key] = useState(0);
  const poll_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdown_ref = useRef<ReturnType<typeof setInterval> | null>(null);
  const poll_count_ref = useRef(0);
  const active_ref = useRef(true);
  const on_signed_in_ref = useRef(on_signed_in);

  on_signed_in_ref.current = on_signed_in;

  const stop_polling = useCallback(() => {
    if (poll_ref.current) {
      clearTimeout(poll_ref.current);
      poll_ref.current = null;
    }
    if (countdown_ref.current) {
      clearInterval(countdown_ref.current);
      countdown_ref.current = null;
    }
    poll_count_ref.current = 0;
  }, []);

  useEffect(() => {
    active_ref.current = true;
    set_flow_state("requesting_code");
    set_error_detail(null);
    stop_polling();

    let cancelled = false;

    const fail = (detail: string) => {
      if (cancelled) return;
      set_error_detail(detail);
      set_flow_state("error");
    };

    const finish = async (device_id: string, sealed_envelope: string) => {
      stop_polling();
      set_flow_state("completing");

      try {
        const result = await complete_device_pairing(
          device_id,
          sealed_envelope,
        );

        if (result.error) {
          fail(`pair:${result.error}`);

          return;
        }

        const session = await resolve_device_login_session(
          result.login_response,
          result.passphrase,
          result.device_id,
        );

        await on_signed_in_ref.current(session);
      } catch (err) {
        if (import.meta.env.DEV) console.error(err);
        fail(`complete:${err instanceof Error ? err.message : String(err)}`);
      }
    };

    const schedule_poll = (code_value: string) => {
      poll_count_ref.current += 1;
      if (poll_count_ref.current > MAX_POLLS) {
        stop_polling();
        set_flow_state("expired");

        return;
      }

      poll_ref.current = setTimeout(async () => {
        if (cancelled || !active_ref.current) return;
        try {
          const status = await poll_device_code_status(code_value);

          if (cancelled) return;
          if (
            status.status === "confirmed" &&
            status.device_id &&
            status.sealed_envelope
          ) {
            await finish(status.device_id, status.sealed_envelope);
          } else if (status.status === "expired") {
            stop_polling();
            set_flow_state("expired");
          } else {
            schedule_poll(code_value);
          }
        } catch (poll_err) {
          if (import.meta.env.DEV) console.error(poll_err);
          schedule_poll(code_value);
        }
      }, poll_delay(poll_count_ref.current));
    };

    (async () => {
      try {
        const core = await import("@tauri-apps/api/core");
        const pubkeys = await core.invoke<DevicePubkeys>("device_get_pubkeys");
        const result = await request_device_code(pubkeys);

        if (cancelled) return;

        set_code(result.code);
        set_time_left(result.expires_in);
        set_flow_state("showing_code");

        const expires_at = Date.now() + result.expires_in * 1000;

        countdown_ref.current = setInterval(() => {
          const remaining = Math.max(
            0,
            Math.round((expires_at - Date.now()) / 1000),
          );

          set_time_left(remaining);
          if (remaining <= 0) {
            stop_polling();
            set_flow_state("expired");
          }
        }, 1000);

        schedule_poll(result.code);
      } catch (request_err) {
        if (import.meta.env.DEV) console.error(request_err);
        fail(
          `request:${request_err instanceof Error ? request_err.message : String(request_err)}`,
        );
      }
    })();

    return () => {
      cancelled = true;
      active_ref.current = false;
      stop_polling();
    };
  }, [flow_key, stop_polling]);

  const handle_copy_code = async () => {
    if (!code) return;

    const raw = code.replace(/-/g, "");
    let success = false;

    try {
      const core = await import("@tauri-apps/api/core");

      await core.invoke("plugin:clipboard-manager|write_text", { text: raw });
      success = true;
    } catch (clipboard_tauri_err) {
      if (import.meta.env.DEV) console.error(clipboard_tauri_err);
      try {
        await copy_text_or_throw(raw);
        success = true;
      } catch (clipboard_fallback_err) {
        if (import.meta.env.DEV) console.error(clipboard_fallback_err);
        show_toast(t("common.failed_to_copy"), "error");
      }
    }

    if (success) {
      set_copied(true);
      setTimeout(() => set_copied(false), 2000);
    }
  };

  const handle_new_code = () => {
    set_error_detail(null);
    set_flow_key((k) => k + 1);
  };

  const code_chars = code ? code.replace(/-/g, "").split("") : [];

  const cancel_button = on_cancel ? (
    <button
      className="flex items-center gap-1 text-sm mb-6 transition-colors hover:opacity-80 text-txt-tertiary self-start"
      type="button"
      onClick={on_cancel}
    >
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path
          d="M15 19l-7-7 7-7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {cancel_label ?? t("auth.link_device_cancel")}
    </button>
  ) : null;

  return (
    <div className="fixed inset-0 overflow-y-auto transition-colors duration-200 bg-surf-primary">
      <div className="min-h-full flex items-center justify-center px-4 py-8">
        <AnimatePresence mode="wait">
          {flow_state === "requesting_code" && (
            <motion.div
              key="loading"
              animate="animate"
              className="flex flex-col items-center"
              exit="exit"
              initial={reduce_motion ? false : "initial"}
              transition={page_transition}
              variants={page_variants}
            >
              <Logo />
              <div className="mt-8">
                <Spinner size="md" />
              </div>
            </motion.div>
          )}

          {flow_state === "completing" && (
            <motion.div
              key="completing"
              animate="animate"
              className="flex flex-col items-center"
              exit="exit"
              initial={reduce_motion ? false : "initial"}
              transition={page_transition}
              variants={page_variants}
            >
              <Logo />
              <div className="mt-8">
                <Spinner size="md" />
              </div>
              <p className="text-sm mt-4 text-txt-muted">
                {t("auth.signing_in")}
              </p>
            </motion.div>
          )}

          {flow_state === "error" && (
            <motion.div
              key="error"
              animate="animate"
              className="flex flex-col items-center w-full max-w-sm px-4"
              exit="exit"
              initial={reduce_motion ? false : "initial"}
              transition={page_transition}
              variants={page_variants}
            >
              {cancel_button}
              <Logo />
              <h1 className="text-xl font-semibold mt-6 text-txt-primary text-center">
                {t("auth.link_device_failed")}
              </h1>
              <p className="text-sm mt-2 leading-relaxed text-txt-tertiary text-center">
                {t("auth.link_device_try_again")}
              </p>
              {error_detail && (
                <pre className="w-full mt-4 p-3 rounded-lg text-xs break-all whitespace-pre-wrap bg-surf-tertiary text-txt-tertiary border border-edge-secondary">
                  {import.meta.env.DEV
                    ? error_detail
                    : error_detail.split(":")[0]}
                </pre>
              )}
              <button
                className="aster_btn aster_btn_depth aster_btn_xl w-full mt-6"
                type="button"
                onClick={handle_new_code}
              >
                {t("auth.device_code_get_new")}
              </button>
            </motion.div>
          )}

          {flow_state === "expired" && (
            <motion.div
              key="expired"
              animate="animate"
              className="flex flex-col items-center w-full max-w-sm px-4"
              exit="exit"
              initial={reduce_motion ? false : "initial"}
              transition={page_transition}
              variants={page_variants}
            >
              {cancel_button}
              <Logo />
              <h1 className="text-xl font-semibold mt-6 text-txt-primary text-center">
                {t("auth.device_code_expired")}
              </h1>
              <p className="text-sm mt-2 leading-relaxed text-txt-tertiary text-center">
                {t("auth.device_code_expired_description")}
              </p>
              <button
                className="aster_btn aster_btn_depth aster_btn_xl w-full mt-6"
                type="button"
                onClick={handle_new_code}
              >
                {t("auth.device_code_get_new")}
              </button>
            </motion.div>
          )}

          {flow_state === "showing_code" && (
            <motion.div
              key="showing_code"
              animate="animate"
              className="flex flex-col items-center w-full max-w-sm px-4"
              exit="exit"
              initial={reduce_motion ? false : "initial"}
              transition={page_transition}
              variants={page_variants}
            >
              {cancel_button}
              <Logo />

              <h1 className="text-xl font-semibold mt-6 text-txt-primary text-center">
                {t("auth.device_code_title")}
              </h1>
              <p className="text-sm mt-2 leading-relaxed text-txt-tertiary text-center">
                {t("auth.device_code_instruction")}
              </p>

              <div className="w-full mt-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-txt-muted">
                    {t("auth.device_code_expires_in")} {format_time(time_left)}
                  </span>
                  <button
                    className="p-1.5 rounded transition-colors hover:opacity-80 text-txt-muted"
                    type="button"
                    onClick={handle_copy_code}
                  >
                    {copied ? (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M5 13l4 4L19 7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                      >
                        <rect height="13" rx="2" width="13" x="9" y="9" />
                        <path
                          d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>
                </div>
                <button
                  aria-label={t("auth.device_code_copy")}
                  className="grid grid-cols-8 gap-2 cursor-pointer w-full"
                  type="button"
                  onClick={handle_copy_code}
                >
                  {code_chars.map((char, i) => (
                    <div
                      key={i}
                      className="relative overflow-hidden rounded-lg py-2.5 border text-center transition-colors hover:opacity-80 bg-surf-tertiary border-edge-secondary"
                    >
                      <span className="text-base font-mono font-bold text-txt-primary">
                        {char}
                      </span>
                    </div>
                  ))}
                </button>
              </div>

              <div className="flex items-center gap-3 w-full mt-6">
                <button
                  className="aster_btn aster_btn_secondary aster_btn_xl flex-1"
                  type="button"
                  onClick={handle_copy_code}
                >
                  {copied
                    ? t("auth.device_code_copied")
                    : t("auth.device_code_copy")}
                </button>
                <button
                  className="aster_btn aster_btn_depth aster_btn_xl flex-1"
                  type="button"
                  onClick={() => open_external(WEB_LINK_DEVICE_URL)}
                >
                  {t("auth.device_code_open_browser")}
                </button>
              </div>

              <div className="mt-6 flex items-center gap-2">
                <Spinner size="xs" />
                <span className="text-xs text-txt-muted">
                  {t("auth.device_code_waiting")}
                </span>
              </div>

              <button
                className="aster_btn aster_btn_secondary aster_btn_xl w-full mt-8"
                type="button"
                onClick={() => open_external(WEB_SIGN_UP_URL)}
              >
                {t("auth.create_account")}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
