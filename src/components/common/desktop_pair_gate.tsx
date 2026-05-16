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
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@aster/ui";

import {
  type DevicePubkeys,
  init_desktop_device_auth,
  is_tauri,
  request_device_code,
  poll_device_code_status,
  complete_device_pairing,
  consume_pending_device_login,
  clear_device_session,
} from "@/native/desktop_device_auth";
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import { decrypt_vault } from "@/services/crypto/key_manager";
import { get_user_info } from "@/services/api/auth";
import { emit_auth_ready } from "@/hooks/mail_events";
import { use_should_reduce_motion } from "@/provider";
import { Logo } from "@/components/auth/auth_styles";
import { Spinner } from "@/components/ui/spinner";

type GateState =
  | "loading"
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

export function DesktopPairGate({ children }: { children: React.ReactNode }) {
  const { is_authenticated, login } = use_auth();
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const [checked, set_checked] = useState(false);
  const [pubkeys, set_pubkeys] = useState<DevicePubkeys | null>(null);
  const [gate_state, set_gate_state] = useState<GateState>("loading");
  const [code, set_code] = useState<string | null>(null);
  const [copied, set_copied] = useState(false);
  const [time_left, set_time_left] = useState(0);
  const poll_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdown_ref = useRef<ReturnType<typeof setInterval> | null>(null);
  const poll_count_ref = useRef(0);
  const is_active_ref = useRef(true);

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

  const start_code_flow = useCallback(
    async (pk: DevicePubkeys) => {
      set_gate_state("requesting_code");
      stop_polling();
      is_active_ref.current = true;

      try {
        const result = await request_device_code(pk);

        set_code(result.code);
        const exp = Date.now() + result.expires_in * 1000;

        set_time_left(result.expires_in);
        set_gate_state("showing_code");

        countdown_ref.current = setInterval(() => {
          const remaining = Math.max(0, Math.round((exp - Date.now()) / 1000));

          set_time_left(remaining);
          if (remaining <= 0) {
            stop_polling();
            set_gate_state("expired");
          }
        }, 1000);

        const get_poll_delay = (count: number): number => {
          if (count < 10) return 3000;
          if (count < 20) return 5000;

          return 8000;
        };

        const schedule_poll = () => {
          poll_count_ref.current += 1;
          if (poll_count_ref.current > 60) {
            stop_polling();
            set_gate_state("expired");

            return;
          }

          const delay = get_poll_delay(poll_count_ref.current);

          poll_ref.current = setTimeout(async () => {
            if (!is_active_ref.current) return;
            try {
              const status = await poll_device_code_status(result.code);

              if (
                status.status === "confirmed" &&
                status.device_id &&
                status.sealed_envelope
              ) {
                stop_polling();
                set_gate_state("completing");

                try {
                  const result = await complete_device_pairing(
                    status.device_id,
                    status.sealed_envelope,
                  );

                  if (result.login_response && result.passphrase) {
                    const lr = result.login_response as {
                      user_id: string;
                      username: string;
                      email: string;
                      encrypted_vault: string;
                      vault_nonce: string;
                    };

                    try {
                      const vault = await decrypt_vault(
                        lr.encrypted_vault,
                        lr.vault_nonce,
                        result.passphrase,
                      );
                      const user_info_response = await get_user_info();
                      const user_data = user_info_response.data
                        ? {
                            id: lr.user_id,
                            username: lr.username,
                            email: lr.email,
                            display_name:
                              user_info_response.data.display_name || undefined,
                            profile_color:
                              user_info_response.data.profile_color ||
                              undefined,
                            profile_picture:
                              user_info_response.data.profile_picture ||
                              undefined,
                          }
                        : {
                            id: lr.user_id,
                            username: lr.username,
                            email: lr.email,
                          };

                      await login(
                        user_data,
                        vault,
                        result.passphrase,
                        lr.encrypted_vault,
                        lr.vault_nonce,
                      );
                      setTimeout(() => emit_auth_ready(), 50);
                      set_pubkeys(null);
                    } catch (inner_err) {
                      if (import.meta.env.DEV) console.error(inner_err);
                      set_gate_state("error");
                    }
                  } else {
                    set_gate_state("error");
                  }
                } catch (err) {
                  if (import.meta.env.DEV) console.error(err);
                  set_gate_state("error");
                }
              } else if (status.status === "expired") {
                stop_polling();
                set_gate_state("expired");
              } else {
                schedule_poll();
              }
            } catch (poll_err) {
              if (import.meta.env.DEV) console.error(poll_err);
              schedule_poll();
            }
          }, delay);
        };

        schedule_poll();
      } catch (request_err) {
        if (import.meta.env.DEV) console.error(request_err);
        set_gate_state("error");
      }
    },
    [stop_polling],
  );

  useEffect(() => {
    if (!is_tauri()) {
      set_checked(true);

      return;
    }

    let cancelled = false;

    (async () => {
      try {
        await init_desktop_device_auth();
        const core = await import("@tauri-apps/api/core");
        const pk = await core.invoke<DevicePubkeys>("device_get_pubkeys");

        if (cancelled) return;
        if (!pk.device_id) {
          set_pubkeys(pk);
          start_code_flow(pk);
        } else {
          const pending = consume_pending_device_login();

          if (pending?.login_response && pending?.passphrase) {
            set_gate_state("completing");

            try {
              const lr = pending.login_response as {
                user_id: string;
                username: string;
                email: string;
                encrypted_vault: string;
                vault_nonce: string;
              };
              const vault = await decrypt_vault(
                lr.encrypted_vault,
                lr.vault_nonce,
                pending.passphrase,
              );
              const user_info_response = await get_user_info();
              const user_data = user_info_response.data
                ? {
                    id: lr.user_id,
                    username: lr.username,
                    email: lr.email,
                    display_name:
                      user_info_response.data.display_name || undefined,
                    profile_color:
                      user_info_response.data.profile_color || undefined,
                    profile_picture:
                      user_info_response.data.profile_picture || undefined,
                  }
                : {
                    id: lr.user_id,
                    username: lr.username,
                    email: lr.email,
                  };

              await login(
                user_data,
                vault,
                pending.passphrase,
                lr.encrypted_vault,
                lr.vault_nonce,
              );
              setTimeout(() => emit_auth_ready(), 50);
            } catch (pending_login_err) {
              if (import.meta.env.DEV) console.error(pending_login_err);
              await clear_device_session();
              const fresh_pk =
                await core.invoke<DevicePubkeys>("device_get_pubkeys");

              if (!cancelled) {
                set_pubkeys(fresh_pk);
                start_code_flow(fresh_pk);
              }
            }
          } else {
            await clear_device_session();
            const fresh_pk =
              await core.invoke<DevicePubkeys>("device_get_pubkeys");

            if (!cancelled) {
              set_pubkeys(fresh_pk);
              start_code_flow(fresh_pk);
            }
          }
        }
      } catch (init_err) {
        if (import.meta.env.DEV) console.error(init_err);
        if (!cancelled) set_gate_state("error");
      } finally {
        if (!cancelled) set_checked(true);
      }
    })();

    const on_paired = () => {
      set_pubkeys(null);
      stop_polling();
    };

    window.addEventListener("astermail:device-paired", on_paired);

    return () => {
      cancelled = true;
      is_active_ref.current = false;
      stop_polling();
      window.removeEventListener("astermail:device-paired", on_paired);
    };
  }, [login, start_code_flow, stop_polling]);

  useEffect(() => {
    return () => stop_polling();
  }, [stop_polling]);

  const handle_copy_code = async () => {
    if (!code) return;

    const raw = code.replace(/-/g, "");
    let success = false;

    try {
      const core = await import("@tauri-apps/api/core");

      await core.invoke("plugin:clipboard-manager|write_text", {
        text: raw,
      });
      success = true;
    } catch (clipboard_tauri_err) {
      if (import.meta.env.DEV) console.error(clipboard_tauri_err);
      try {
        await navigator.clipboard.writeText(raw);
        success = true;
      } catch (clipboard_fallback_err) {
        if (import.meta.env.DEV) console.error(clipboard_fallback_err);
      }
    }

    if (success) {
      set_copied(true);
      setTimeout(() => set_copied(false), 2000);
    }
  };

  const handle_open_browser = async () => {
    try {
      const core = await import("@tauri-apps/api/core");

      await core.invoke("open_external_url", {
        url: "https://app.astermail.org/link-device",
      });
    } catch (open_url_err) {
      if (import.meta.env.DEV) console.error(open_url_err);
    }
  };

  const handle_new_code = () => {
    if (pubkeys) {
      start_code_flow(pubkeys);
    }
  };

  const format_time = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;

    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const code_chars = code ? code.replace(/-/g, "").split("") : [];

  if (!checked) return null;

  if (!is_tauri() || is_authenticated) {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 overflow-y-auto transition-colors duration-200 bg-surf-primary">
      <div className="min-h-full flex items-center justify-center px-4 py-8">
        <AnimatePresence mode="wait">
          {(gate_state === "loading" || gate_state === "requesting_code") && (
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

          {gate_state === "completing" && (
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

          {gate_state === "error" && (
            <motion.div
              key="error"
              animate="animate"
              className="flex flex-col items-center w-full max-w-sm px-4"
              exit="exit"
              initial={reduce_motion ? false : "initial"}
              transition={page_transition}
              variants={page_variants}
            >
              <Logo />
              <h1 className="text-xl font-semibold mt-6 text-txt-primary text-center">
                {t("auth.link_device_failed")}
              </h1>
              <p className="text-sm mt-2 leading-relaxed text-txt-tertiary text-center">
                {t("auth.link_device_try_again")}
              </p>
              <Button
                className="w-full mt-6"
                size="xl"
                variant="depth"
                onClick={handle_new_code}
              >
                {t("auth.device_code_get_new")}
              </Button>
            </motion.div>
          )}

          {gate_state === "expired" && (
            <motion.div
              key="expired"
              animate="animate"
              className="flex flex-col items-center w-full max-w-sm px-4"
              exit="exit"
              initial={reduce_motion ? false : "initial"}
              transition={page_transition}
              variants={page_variants}
            >
              <Logo />
              <h1 className="text-xl font-semibold mt-6 text-txt-primary text-center">
                {t("auth.device_code_expired")}
              </h1>
              <p className="text-sm mt-2 leading-relaxed text-txt-tertiary text-center">
                {t("auth.device_code_expired_description")}
              </p>
              <Button
                className="w-full mt-6"
                size="xl"
                variant="depth"
                onClick={handle_new_code}
              >
                {t("auth.device_code_get_new")}
              </Button>
            </motion.div>
          )}

          {gate_state === "showing_code" && (
            <motion.div
              key="showing_code"
              animate="animate"
              className="flex flex-col items-center w-full max-w-sm px-4"
              exit="exit"
              initial={reduce_motion ? false : "initial"}
              transition={page_transition}
              variants={page_variants}
            >
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
                    {t("auth.device_code_expires_in")}{" "}
                    {format_time(time_left)}
                  </span>
                  <button
                    className="p-1.5 rounded transition-colors hover:opacity-80 text-txt-muted"
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
                <div
                  className="grid grid-cols-8 gap-2 cursor-pointer"
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
                </div>
              </div>

              <div className="flex items-center gap-3 w-full mt-6">
                <Button
                  className="flex-1"
                  size="xl"
                  variant="secondary"
                  onClick={handle_copy_code}
                >
                  {copied
                    ? t("auth.device_code_copied")
                    : t("auth.device_code_copy")}
                </Button>
                <Button
                  className="flex-1"
                  size="xl"
                  variant="depth"
                  onClick={handle_open_browser}
                >
                  {t("auth.device_code_open_browser")}
                </Button>
              </div>

              <div className="mt-6 flex items-center gap-2">
                <Spinner size="xs" />
                <span className="text-xs text-txt-muted">
                  {t("auth.device_code_waiting")}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
