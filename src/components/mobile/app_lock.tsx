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
import type { TranslationKey } from "@/lib/i18n/types";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BackspaceIcon } from "@heroicons/react/24/outline";
import { PinLockOverlayView } from "@aster/ui";

import { cn } from "@/lib/utils";
import {
  authenticate_biometric,
  check_biometric_availability,
  get_biometry_type_name,
} from "@/native/biometric_auth";
import { use_preferences } from "@/contexts/preferences_context";
import {
  is_native_platform,
  add_app_state_listener,
} from "@/native/capacitor_bridge";
import { set_screen_capture_blocked } from "@/native/screen_privacy";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import { use_auth_safe } from "@/contexts/auth_context";
import {
  get_app_lock_config,
  has_pending_lock_hint,
  is_session_unlocked,
  is_locked_out,
  mark_session_unlocked,
  clear_session_unlock,
} from "@/services/app_lock_store";
import {
  attempt_app_unlock,
  flush_pending_app_lock_deletes,
  is_app_lock_server_wrapped,
  lock_server_wrapped_session,
  release_app_lock,
  unlock_with_password,
  wipe_unlocked_secrets,
} from "@/services/app_lock_unlock";
import {
  clear_native_lock_hint,
  has_pending_native_lock_hint,
  save_native_lock_hint,
} from "@/services/app_lock_store";
import { purge_all_local_data } from "@/contexts/auth/purge_local_data";
import { sync_client } from "@/services/sync_client";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import { MAIL_EVENTS } from "@/hooks/mail_events";
import { set_app_network_locked } from "@/services/app_lock_network_gate";
import { lock_all_folders } from "@/hooks/use_protected_folder";
import { ignore_error } from "@/lib/ignore_error";
import { get_active_translations } from "@/lib/i18n/translations";
import { ButtonSpinner } from "@/components/ui/spinner";
import { show_toast } from "@/components/toast/simple_toast";

const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

function WebPinOverlay({
  account_id,
  digits,
  pin_type,
  on_unlock,
  on_sign_out,
  reduce_motion,
  t,
}: {
  account_id: string;
  digits: number;
  pin_type: "numeric" | "text";
  on_unlock: () => void;
  on_sign_out: () => void;
  reduce_motion: boolean;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}) {
  const [input, set_input] = useState("");
  const [shake_key, set_shake_key] = useState(0);
  const [message, set_message] = useState<string | null>(null);
  const [verifying, set_verifying] = useState(false);
  const [locked_out, set_locked_out] = useState(false);
  const [lockout_remaining, set_lockout_remaining] = useState(0);
  const [pressed_key, set_pressed_key] = useState<string | null>(null);
  const [wiping, set_wiping] = useState(false);
  const [password_mode, set_password_mode] = useState(false);
  const [offer_password, set_offer_password] = useState(false);
  const wiping_ref = useRef(false);
  const verifying_ref = useRef(false);
  const message_timer = useRef<number | null>(null);

  const show_message = useCallback((text: string, sticky = false) => {
    if (message_timer.current !== null) {
      window.clearTimeout(message_timer.current);
      message_timer.current = null;
    }
    set_message(text);
    if (!sticky) {
      message_timer.current = window.setTimeout(() => {
        message_timer.current = null;
        set_message(null);
      }, 2500);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (message_timer.current !== null) {
        window.clearTimeout(message_timer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (is_app_lock_server_wrapped(account_id)) return;
    const { locked, remaining_ms } = is_locked_out(account_id);

    if (locked) {
      set_locked_out(true);
      set_lockout_remaining(Math.ceil(remaining_ms / 1000));
    }
  }, [account_id]);

  useEffect(() => {
    if (!locked_out) return;
    const interval = setInterval(() => {
      const { locked, remaining_ms } = is_locked_out(account_id);

      if (!locked) {
        set_locked_out(false);
        set_lockout_remaining(0);
      } else {
        set_lockout_remaining(Math.ceil(remaining_ms / 1000));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [locked_out, account_id]);

  const handle_duress_confirm = useCallback(async () => {
    if (wiping_ref.current) return;
    wiping_ref.current = true;
    set_wiping(true);
    try {
      await release_app_lock(account_id).catch(() => undefined);
      const purged = await purge_all_local_data({ erase_device_traces: true });

      if (!purged) await purge_all_local_data({ erase_device_traces: true });
    } finally {
      window.location.href = "/";
    }
  }, [account_id]);

  const reject_input = useCallback(
    (text: string) => {
      set_shake_key((k) => k + 1);
      set_input("");
      show_message(text);
    },
    [show_message],
  );

  const attempt_verify = useCallback(
    async (value: string) => {
      if (verifying_ref.current) return;
      verifying_ref.current = true;
      set_verifying(true);
      try {
        if (password_mode) {
          const opened = await unlock_with_password(account_id, value);

          if (opened) {
            verifying_ref.current = false;
            set_verifying(false);
            on_unlock();

            return;
          }
          reject_input(t("common.app_lock_wrong_password"));
        } else {
          const result = await attempt_app_unlock(account_id, value);

          if (result.outcome === "unlocked") {
            verifying_ref.current = false;
            set_verifying(false);
            on_unlock();

            return;
          }
          if (result.outcome === "duress") {
            set_input("");
            await handle_duress_confirm();

            return;
          }
          if (result.outcome === "reset") {
            set_input("");
            show_toast(t("common.app_lock_pin_reset"), "info");
            verifying_ref.current = false;
            set_verifying(false);
            on_unlock();

            return;
          }
          if (result.outcome === "unavailable") {
            set_input("");
            set_offer_password(true);
            show_message(t("common.app_lock_server_unreachable"), true);
          } else if (result.outcome === "busy") {
            set_input("");
            show_message(t("common.app_lock_try_again_later"));
          } else if (result.outcome === "locked_out") {
            set_locked_out(true);
            set_input("");
            set_lockout_remaining(Math.ceil(result.remaining_ms / 1000));
            show_message(t("common.app_lock_locked_out"));
          } else {
            reject_input(
              result.attempts_remaining !== null &&
                result.attempts_remaining > 0
                ? t("common.app_lock_attempts_remaining", {
                    count: result.attempts_remaining,
                  })
                : t("common.wrong_pin"),
            );
          }
        }
      } catch {
        reject_input(
          password_mode
            ? t("common.app_lock_wrong_password")
            : t("common.wrong_pin"),
        );
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 600));
      verifying_ref.current = false;
      set_verifying(false);
    },
    [
      account_id,
      on_unlock,
      t,
      handle_duress_confirm,
      password_mode,
      reject_input,
      show_message,
    ],
  );

  const active_type: "numeric" | "text" = password_mode ? "text" : pin_type;

  const handle_digit = useCallback(
    async (d: string) => {
      if (verifying_ref.current || wiping_ref.current) return;
      const next = input + d;

      set_input(next);
      if (next.length === digits) {
        await attempt_verify(next);
      }
    },
    [input, digits, attempt_verify],
  );

  const handle_backspace = useCallback(() => {
    if (verifying) return;
    set_input((prev) => prev.slice(0, -1));
  }, [verifying]);

  const handle_text_submit = useCallback(async () => {
    if (verifying || wiping_ref.current || input.length < 1) return;
    if (active_type !== "text" && input.length < digits) return;
    await attempt_verify(input);
  }, [verifying, input, attempt_verify, active_type, digits]);

  useEffect(() => {
    const on_key = (e: KeyboardEvent) => {
      if (active_type === "text") {
        if (e.key === "Enter") handle_text_submit();
      } else {
        const k = e.key;

        if (k >= "0" && k <= "9") {
          set_pressed_key(k);
          setTimeout(() => set_pressed_key(null), 120);
          handle_digit(k);
        } else if (k === "Backspace") {
          set_pressed_key("Backspace");
          setTimeout(() => set_pressed_key(null), 120);
          handle_backspace();
        } else if (k === "Enter") {
          set_pressed_key("Enter");
          setTimeout(() => set_pressed_key(null), 120);
          handle_text_submit();
        }
      }
    };

    window.addEventListener("keydown", on_key);

    return () => window.removeEventListener("keydown", on_key);
  }, [active_type, handle_digit, handle_backspace, handle_text_submit]);

  const toggle_password_mode = useCallback(() => {
    if (verifying_ref.current) return;
    set_input("");
    set_message(null);
    set_password_mode((prev) => !prev);
  }, []);

  return (
    <>
      <PinLockOverlayView
        confirm_label={t("common.confirm")}
        delete_label={t("common.delete")}
        digits={password_mode ? 0 : digits}
        is_locked_out={false}
        is_verifying={verifying || wiping}
        lockout_text={
          locked_out && !password_mode
            ? t("common.app_lock_try_again_in", { s: lockout_remaining })
            : null
        }
        logo_alt="Aster Mail"
        logo_src="/text_logo.png"
        message={message}
        passphrase_placeholder={
          password_mode
            ? t("common.app_lock_enter_password")
            : t("common.enter_passphrase")
        }
        pin_type={active_type}
        pressed_key={pressed_key}
        reduce_motion={reduce_motion}
        shake_key={shake_key}
        sign_out_label={t("settings.sign_out")}
        title={t("common.app_locked")}
        unlock_label={t("common.unlock")}
        value={input}
        on_backspace={handle_backspace}
        on_digit={handle_digit}
        on_sign_out={on_sign_out}
        on_submit={handle_text_submit}
        on_value_change={set_input}
      />
      {(offer_password || password_mode) && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[101] flex justify-center px-4">
          <button
            className="pointer-events-auto text-sm text-muted-foreground underline-offset-4 hover:underline"
            disabled={verifying || wiping}
            type="button"
            onClick={toggle_password_mode}
          >
            {password_mode
              ? t("common.app_lock_use_pin")
              : t("common.app_lock_unlock_with_password")}
          </button>
        </div>
      )}
    </>
  );
}

export function AppLock({ children }: { children: React.ReactNode }) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const { preferences, has_loaded_from_server } = use_preferences();
  const auth = use_auth_safe();
  const account_id = auth?.current_account_id ?? "";

  const [is_locked, set_is_locked] = useState(
    () => is_native_platform() && has_pending_native_lock_hint(),
  );
  const [is_authenticating, set_is_authenticating] = useState(false);
  const [unlock_error, set_unlock_error] = useState<string | null>(null);
  const [biometry_name, set_biometry_name] = useState(
    () => get_active_translations().common.biometry_generic,
  );
  const [last_active, set_last_active] = useState(Date.now());
  const [is_web_locked, set_is_web_locked] = useState(() => {
    if (is_native_platform()) return false;

    return has_pending_lock_hint();
  });
  const [web_pin_digits, set_web_pin_digits] = useState(4);
  const [web_pin_type, set_web_pin_type] = useState<"numeric" | "text">(
    "numeric",
  );
  const hidden_at_ref = useRef<number | null>(null);
  const is_authenticated_ref = useRef(false);
  const account_id_ref = useRef("");
  const was_locked_ref = useRef(false);

  useEffect(() => {
    const locked_now = is_locked || (is_web_locked && !!account_id);

    if (locked_now) {
      was_locked_ref.current = true;
      sync_client.disconnect();
      set_app_network_locked(true);
    } else if (was_locked_ref.current) {
      was_locked_ref.current = false;
      set_app_network_locked(false);
      sync_client
        .connect()
        .catch((caught) =>
          ignore_error("components/mobile/app_lock:stored_id", caught),
        );
      invalidate_mail_stats();
      window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
    }
  }, [is_locked, is_web_locked, account_id]);

  useEffect(() => {
    is_authenticated_ref.current = auth?.is_authenticated ?? false;
    account_id_ref.current = auth?.current_account_id ?? "";
  }, [auth?.is_authenticated, auth?.current_account_id]);

  useEffect(() => {
    if (!auth?.is_authenticated || !account_id) return;
    if (is_locked || is_web_locked) return;
    void flush_pending_app_lock_deletes().catch(() => 0);
  }, [auth?.is_authenticated, account_id, is_locked, is_web_locked]);

  useEffect(() => {
    if (!is_native_platform()) return;
    if (!preferences.biometric_app_lock_enabled) {
      if (has_loaded_from_server) {
        clear_native_lock_hint(account_id);
        set_is_locked(false);
      }

      return;
    }
    const check_and_lock = async () => {
      const availability = await check_biometric_availability();

      if (availability.is_available) {
        set_biometry_name(get_biometry_type_name(availability.biometry_type));
        save_native_lock_hint(account_id);
        set_is_locked(true);
      } else {
        clear_native_lock_hint(account_id);
        set_is_locked(false);
      }
    };

    check_and_lock();
  }, [
    preferences.biometric_app_lock_enabled,
    has_loaded_from_server,
    account_id,
  ]);

  useEffect(() => {
    if (!is_native_platform()) return;
    const lock_configured = has_loaded_from_server
      ? !!preferences.biometric_app_lock_enabled
      : !!preferences.biometric_app_lock_enabled ||
        has_pending_native_lock_hint();

    set_screen_capture_blocked(lock_configured).catch((caught) =>
      ignore_error("components/mobile/app_lock:screen_privacy", caught),
    );
  }, [preferences.biometric_app_lock_enabled, has_loaded_from_server]);

  useEffect(() => {
    if (!is_native_platform() || !preferences.biometric_app_lock_enabled)
      return;
    const unsubscribe = add_app_state_listener((is_active) => {
      if (is_active) {
        if (Date.now() - last_active >= LOCK_TIMEOUT_MS) set_is_locked(true);
      } else {
        set_last_active(Date.now());
      }
    });

    return unsubscribe;
  }, [last_active, preferences.biometric_app_lock_enabled]);

  const auto_prompt_done = useRef(false);

  const handle_unlock = useCallback(async () => {
    if (is_authenticating) return;
    set_is_authenticating(true);
    set_unlock_error(null);
    try {
      const success = await authenticate_biometric(
        t("common.unlock_aster_mail"),
      );

      if (success) {
        set_is_locked(false);
        set_last_active(Date.now());
      } else {
        set_unlock_error(t("errors.authentication_failed"));
      }
    } finally {
      set_is_authenticating(false);
    }
  }, [is_authenticating, t]);

  useEffect(() => {
    if (!is_locked) {
      auto_prompt_done.current = false;

      return;
    }
    if (auto_prompt_done.current || is_authenticating) return;
    auto_prompt_done.current = true;
    handle_unlock();
  }, [is_locked, is_authenticating, handle_unlock]);

  useEffect(() => {
    if (is_native_platform()) return;
    if (!auth?.is_loading || !account_id) return;
    if (!is_app_lock_server_wrapped(account_id)) return;
    if (is_session_unlocked(account_id)) return;
    const config = get_app_lock_config(account_id);

    if (!config?.enabled) return;
    const resolved_type = config.pin_type ?? "numeric";

    set_web_pin_type(resolved_type);
    set_web_pin_digits(resolved_type === "numeric" ? config.digits || 4 : 0);
    set_is_web_locked(true);
  }, [auth?.is_loading, account_id]);

  useEffect(() => {
    if (is_native_platform()) return;
    if (auth?.is_loading) return;
    if (!auth?.is_authenticated || !account_id) {
      if (!auth?.is_loading) set_is_web_locked(false);

      return;
    }
    const config = get_app_lock_config(account_id);

    if (!config?.enabled) {
      set_is_web_locked(false);

      return;
    }
    const resolved_type = config.pin_type ?? "numeric";

    set_web_pin_type(resolved_type);
    set_web_pin_digits(resolved_type === "numeric" ? config.digits || 4 : 0);
    if (!is_session_unlocked(account_id)) set_is_web_locked(true);
  }, [auth?.is_authenticated, auth?.is_loading, account_id]);

  useEffect(() => {
    if (is_native_platform()) return;
    const on_unload = () => {
      if (account_id_ref.current) clear_session_unlock(account_id_ref.current);
    };

    window.addEventListener("beforeunload", on_unload);

    return () => window.removeEventListener("beforeunload", on_unload);
  }, []);

  useEffect(() => {
    if (is_native_platform()) return;
    const handle_visibility = () => {
      if (document.visibilityState === "hidden") {
        hidden_at_ref.current = Date.now();

        return;
      }
      const id = account_id_ref.current;

      if (!is_authenticated_ref.current || !id) return;
      const config = get_app_lock_config(id);

      if (!config?.enabled) return;
      const hidden_for =
        hidden_at_ref.current !== null ? Date.now() - hidden_at_ref.current : 0;

      hidden_at_ref.current = null;
      if (hidden_for >= LOCK_TIMEOUT_MS) {
        if (is_app_lock_server_wrapped(id)) {
          lock_all_folders();
          void lock_server_wrapped_session(id).then((wiped) => {
            if (wiped) window.location.reload();
          });

          return;
        }
        clear_session_unlock(id);
        lock_all_folders();
        if (wipe_unlocked_secrets(id)) {
          window.location.reload();

          return;
        }
        const vt = config.pin_type ?? "numeric";

        set_web_pin_type(vt);
        set_web_pin_digits(vt === "numeric" ? config.digits || 4 : 0);
        set_is_web_locked(true);
      }
    };

    document.addEventListener("visibilitychange", handle_visibility);

    return () =>
      document.removeEventListener("visibilitychange", handle_visibility);
  }, []);

  if (is_web_locked && account_id) {
    return (
      <AnimatePresence>
        <WebPinOverlay
          account_id={account_id}
          digits={web_pin_digits}
          on_sign_out={() => {
            set_is_web_locked(false);
            auth?.logout?.();
          }}
          on_unlock={() => {
            mark_session_unlocked(account_id);
            set_is_web_locked(false);
          }}
          pin_type={web_pin_type}
          reduce_motion={reduce_motion}
          t={t}
        />
      </AnimatePresence>
    );
  }

  return (
    <>
      {children}

      <AnimatePresence>
        {is_locked && (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background"
            exit={{ opacity: 0 }}
            initial={reduce_motion ? false : { opacity: 0 }}
          >
            <motion.div
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center gap-6"
              initial={reduce_motion ? false : { scale: 0.8, opacity: 0 }}
              transition={{ delay: 0.1 }}
            >
              <img
                alt="Aster Mail"
                className="h-7 opacity-90"
                draggable={false}
                src="/text_logo.png"
              />
              <div className="text-center">
                <h1 className="text-xl font-semibold">
                  {t("common.aster_mail_locked")}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("common.use_biometry_to_unlock", { name: biometry_name })}
                </p>
                {unlock_error && (
                  <p className="mt-2 text-sm text-red-500">{unlock_error}</p>
                )}
              </div>
              <button
                className={cn(
                  "flex items-center gap-2 rounded-full",
                  "bg-primary px-6 py-3 text-primary-foreground transition-transform",
                  is_authenticating && "opacity-50",
                )}
                disabled={is_authenticating}
                onClick={handle_unlock}
              >
                <BackspaceIcon className="h-5 w-5 rotate-180" />
                {is_authenticating && <ButtonSpinner />}
                <span>
                  {is_authenticating
                    ? t("auth.authenticating")
                    : t("common.unlock_with_biometry", { name: biometry_name })}
                </span>
              </button>
              <button
                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                disabled={is_authenticating}
                type="button"
                onClick={() => {
                  set_is_locked(false);
                  auth?.logout?.();
                }}
              >
                {t("settings.sign_out")}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
