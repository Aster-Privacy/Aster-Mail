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
import { motion, AnimatePresence } from "framer-motion";
import { LockClosedIcon } from "@heroicons/react/24/outline";

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
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import { use_auth_safe } from "@/contexts/auth_context";
import {
  get_app_lock_config,
  is_session_unlocked,
  is_locked_out,
  mark_session_unlocked,
  clear_session_unlock,
  verify_pin,
} from "@/services/app_lock_store";

const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

function PinDots({ digits, filled, shake_key }: { digits: number; filled: number; shake_key: number }) {
  return (
    <motion.div
      key={shake_key}
      animate={shake_key > 0 ? { x: [0, -10, 10, -10, 10, 0] } : { x: 0 }}
      transition={{ duration: 0.4 }}
      className="flex items-center gap-3"
    >
      {Array.from({ length: digits }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "w-4 h-4 rounded-full border-2 transition-all duration-150",
            i < filled
              ? "bg-primary border-primary"
              : "border-muted-foreground/40 bg-transparent",
          )}
        />
      ))}
    </motion.div>
  );
}

function PinPad({ on_digit, on_backspace }: { on_digit: (d: string) => void; on_backspace: () => void }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "←"];
  return (
    <div className="grid grid-cols-3 gap-3">
      {keys.map((k, i) =>
        k === "" ? (
          <div key={i} />
        ) : (
          <button
            key={i}
            type="button"
            className="h-14 w-14 mx-auto rounded-full bg-muted hover:bg-muted/80 text-xl font-medium flex items-center justify-center transition-colors"
            onClick={() => k === "←" ? on_backspace() : on_digit(k)}
          >
            {k}
          </button>
        ),
      )}
    </div>
  );
}

function WebPinOverlay({
  account_id,
  digits,
  on_unlock,
  reduce_motion,
  t,
}: {
  account_id: string;
  digits: number;
  on_unlock: () => void;
  reduce_motion: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const [input, set_input] = useState("");
  const [shake_key, set_shake_key] = useState(0);
  const [message, set_message] = useState<string | null>(null);
  const [verifying, set_verifying] = useState(false);
  const [locked_out, set_locked_out] = useState(false);
  const [lockout_remaining, set_lockout_remaining] = useState(0);

  useEffect(() => {
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

  const handle_digit = useCallback(async (d: string) => {
    if (verifying || locked_out) return;
    const next = input + d;
    set_input(next);
    if (next.length === digits) {
      set_verifying(true);
      const result = await verify_pin(account_id, next);
      if (result.ok) {
        mark_session_unlocked(account_id);
        set_verifying(false);
        on_unlock();
        return;
      }
      if (result.locked) {
        set_locked_out(true);
        set_input("");
        const { remaining_ms } = is_locked_out(account_id);
        set_lockout_remaining(Math.ceil(remaining_ms / 1000));
        set_message(t("common.app_lock_locked_out"));
      } else {
        set_shake_key(k => k + 1);
        set_input("");
        const msg = result.attempts_remaining > 0
          ? t("common.app_lock_attempts_remaining", { n: result.attempts_remaining })
          : t("common.wrong_pin");
        set_message(msg);
        setTimeout(() => set_message(null), 2000);
      }
      set_verifying(false);
    }
  }, [account_id, input, digits, verifying, locked_out, on_unlock, t]);

  const handle_backspace = useCallback(() => {
    if (locked_out || verifying) return;
    set_input(prev => prev.slice(0, -1));
  }, [locked_out, verifying]);

  useEffect(() => {
    const on_key = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") handle_digit(e.key);
      else if (e.key === "Backspace") handle_backspace();
    };
    window.addEventListener("keydown", on_key);
    return () => window.removeEventListener("keydown", on_key);
  }, [handle_digit, handle_backspace]);

  return (
    <motion.div
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      initial={reduce_motion ? false : { opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background select-none"
    >
      <motion.div
        animate={{ scale: 1, opacity: 1 }}
        initial={reduce_motion ? false : { scale: 0.9, opacity: 0 }}
        transition={{ delay: 0.05 }}
        className="flex flex-col items-center gap-8"
      >
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
          <LockClosedIcon className="h-10 w-10 text-primary" />
        </div>
        <div className="text-center">
          <h1 className="text-xl font-semibold">{t("common.app_locked")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {locked_out
              ? t("common.app_lock_try_again_in", { s: lockout_remaining })
              : t("common.enter_pin_to_unlock")}
          </p>
        </div>
        <PinDots digits={digits} filled={input.length} shake_key={shake_key} />
        <div className="h-5 flex items-center justify-center -mt-4">
          {message && <p className="text-sm text-red-500">{message}</p>}
          {verifying && !message && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          )}
        </div>
        <PinPad on_digit={handle_digit} on_backspace={handle_backspace} />
      </motion.div>
    </motion.div>
  );
}

export function AppLock({ children }: { children: React.ReactNode }) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const { preferences } = use_preferences();
  const auth = use_auth_safe();
  const account_id = auth?.current_account_id ?? "";

  const [is_locked, set_is_locked] = useState(false);
  const [is_authenticating, set_is_authenticating] = useState(false);
  const [biometry_name, set_biometry_name] = useState("Biometric");
  const [last_active, set_last_active] = useState(Date.now());
  const [is_web_locked, set_is_web_locked] = useState(false);
  const [web_pin_digits, set_web_pin_digits] = useState(4);
  const hidden_at_ref = useRef<number | null>(null);
  const is_authenticated_ref = useRef(false);
  const account_id_ref = useRef("");

  useEffect(() => {
    is_authenticated_ref.current = auth?.is_authenticated ?? false;
    account_id_ref.current = auth?.current_account_id ?? "";
  }, [auth?.is_authenticated, auth?.current_account_id]);

  useEffect(() => {
    if (!is_native_platform() || !preferences.biometric_app_lock_enabled) return;
    const check_and_lock = async () => {
      const availability = await check_biometric_availability();
      if (availability.is_available) {
        set_biometry_name(get_biometry_type_name(availability.biometry_type));
        set_is_locked(true);
      }
    };
    check_and_lock();
  }, [preferences.biometric_app_lock_enabled]);

  useEffect(() => {
    if (!is_native_platform() || !preferences.biometric_app_lock_enabled) return;
    const unsubscribe = add_app_state_listener((is_active) => {
      if (is_active) {
        if (Date.now() - last_active >= LOCK_TIMEOUT_MS) set_is_locked(true);
      } else {
        set_last_active(Date.now());
      }
    });
    return unsubscribe;
  }, [last_active, preferences.biometric_app_lock_enabled]);

  const handle_unlock = useCallback(async () => {
    if (is_authenticating) return;
    set_is_authenticating(true);
    try {
      const success = await authenticate_biometric(t("common.unlock_aster_mail"));
      if (success) {
        set_is_locked(false);
        set_last_active(Date.now());
      }
    } finally {
      set_is_authenticating(false);
    }
  }, [is_authenticating, t]);

  useEffect(() => {
    if (is_locked && !is_authenticating) handle_unlock();
  }, [is_locked, is_authenticating, handle_unlock]);

  useEffect(() => {
    if (is_native_platform()) return;
    if (!auth?.is_authenticated || !account_id) {
      set_is_web_locked(false);
      return;
    }
    const config = get_app_lock_config(account_id);
    if (!config?.enabled) return;
    set_web_pin_digits(config.digits);
    if (!is_session_unlocked(account_id)) set_is_web_locked(true);
  }, [auth?.is_authenticated, account_id]);

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
      const hidden_for = hidden_at_ref.current !== null ? Date.now() - hidden_at_ref.current : 0;
      hidden_at_ref.current = null;
      if (hidden_for >= LOCK_TIMEOUT_MS) {
        clear_session_unlock(id);
        set_web_pin_digits(config.digits);
        set_is_web_locked(true);
      }
    };
    document.addEventListener("visibilitychange", handle_visibility);
    return () => document.removeEventListener("visibilitychange", handle_visibility);
  }, []);

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
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                <LockClosedIcon className="h-10 w-10 text-primary" />
              </div>
              <div className="text-center">
                <h1 className="text-xl font-semibold">{t("common.aster_mail_locked")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("common.use_biometry_to_unlock", { name: biometry_name })}
                </p>
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
                {is_authenticating ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <LockClosedIcon className="h-5 w-5" />
                )}
                <span>
                  {is_authenticating
                    ? t("auth.authenticating")
                    : t("common.unlock_with_biometry", { name: biometry_name })}
                </span>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {is_web_locked && account_id && (
          <WebPinOverlay
            account_id={account_id}
            digits={web_pin_digits}
            on_unlock={() => set_is_web_locked(false)}
            reduce_motion={reduce_motion}
            t={t}
          />
        )}
      </AnimatePresence>
    </>
  );
}
