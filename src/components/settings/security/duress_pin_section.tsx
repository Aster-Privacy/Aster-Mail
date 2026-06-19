// AGPL-3.0 License
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { useState, useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "@aster/ui";
import { ArrowLeftIcon, BackspaceIcon, CheckIcon, EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";

import { show_toast } from "@/components/toast/simple_toast";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { use_i18n } from "@/lib/i18n/context";
import { clamp_password } from "@/services/sanitize";
import { use_auth_safe } from "@/contexts/auth_context";
import { cn } from "@/lib/utils";
import { get_user_salt } from "@/services/api/auth";
import { get_totp_status } from "@/services/api/totp";
import { verify_vanguard_credentials } from "@/services/api/vanguard";
import { hash_email, derive_password_hash } from "@/services/crypto/key_manager_pgp";
import { base64_to_array } from "@/services/crypto/key_manager";
import {
  get_app_lock_config,
  has_duress_pin,
  save_duress_pin,
  clear_duress_pin,
  generate_pin_salt,
  hash_pin,
  pin_matches_regular,
  duress_pin_correct,
  ensure_pepper,
  KDF_VERSION_PEPPER,
} from "@/services/app_lock_store";

function PinDots({ digits, filled, shake_key }: { digits: number; filled: number; shake_key: number }) {
  return (
    <motion.div
      key={shake_key}
      animate={shake_key > 0 ? { x: [0, -10, 10, -10, 10, 0] } : { x: 0 }}
      transition={{ duration: 0.35 }}
      className="flex items-center gap-3 justify-center"
    >
      {Array.from({ length: digits }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "w-3.5 h-3.5 rounded-full border-2 transition-all duration-150",
            i < filled ? "bg-primary border-primary" : "border-muted-foreground/40 bg-transparent",
          )}
        />
      ))}
    </motion.div>
  );
}

function PinPad({ on_digit, on_backspace, on_check, disabled }: {
  on_digit: (d: string) => void;
  on_backspace: () => void;
  on_check?: () => void;
  disabled?: boolean;
}) {
  const [pressed_key, set_pressed_key] = useState<string | null>(null);

  const flash = useCallback((k: string) => {
    set_pressed_key(k);
    setTimeout(() => set_pressed_key(null), 120);
  }, []);

  useEffect(() => {
    const on_key = (e: KeyboardEvent) => {
      if (disabled) return;
      const k = e.key;
      if (k >= "0" && k <= "9") { flash(k); on_digit(k); }
      else if (k === "Backspace") { flash("Backspace"); on_backspace(); }
      else if (k === "Enter") { flash("Enter"); on_check?.(); }
    };
    window.addEventListener("keydown", on_key);
    return () => window.removeEventListener("keydown", on_key);
  }, [disabled, on_digit, on_backspace, on_check, flash]);

  const btn = (active: boolean) => cn(
    "h-12 w-12 mx-auto rounded-full flex items-center justify-center transition-all duration-75 focus:outline-none focus-visible:outline-none",
    disabled ? "opacity-40 cursor-not-allowed" : "bg-muted hover:bg-muted/70",
    active && !disabled && "scale-90 bg-muted/50",
  );
  return (
    <div className="grid grid-cols-3 gap-2">
      {["1","2","3","4","5","6","7","8","9"].map(k => (
        <button key={k} type="button" disabled={disabled}
          className={cn(btn(pressed_key === k), "text-base font-medium")}
          onClick={() => on_digit(k)}>{k}</button>
      ))}
      <button type="button" disabled={disabled} className={btn(pressed_key === "Backspace")} onClick={on_backspace}>
        <BackspaceIcon className="h-4 w-4 text-txt-primary" />
      </button>
      <button key="0" type="button" disabled={disabled}
        className={cn(btn(pressed_key === "0"), "text-base font-medium")}
        onClick={() => on_digit("0")}>0</button>
      <button type="button" disabled={disabled} className={btn(pressed_key === "Enter")} onClick={on_check}>
        <CheckIcon className="h-4 w-4 text-txt-primary" />
      </button>
    </div>
  );
}

type SetupStep = "verify_credentials" | "set_pin" | "confirm_pin" | "set_text" | "confirm_text" | "confirm_setup";

function SetupDuressPinModal({ account_id, is_open, on_close, on_success }: {
  account_id: string;
  is_open: boolean;
  on_close: () => void;
  on_success: () => void;
}) {
  const { t } = use_i18n();
  const auth = use_auth_safe();
  const config = get_app_lock_config(account_id);
  const pin_type = config?.pin_type ?? "numeric";
  const digits = pin_type === "numeric" ? (config?.digits ?? 4) : 0;

  const [step, set_step] = useState<SetupStep>("verify_credentials");
  const [password, set_password] = useState("");
  const [show_password, set_show_password] = useState(false);
  const [totp_code, set_totp_code] = useState("");
  const [totp_required, set_totp_required] = useState(false);
  const [totp_loading, set_totp_loading] = useState(false);
  const [verifying_creds, set_verifying_creds] = useState(false);
  const [creds_error, set_creds_error] = useState<string | null>(null);

  const [first_pin, set_first_pin] = useState("");
  const [confirm_input, set_confirm_input] = useState("");
  const [text_input, set_text_input] = useState("");
  const [first_text, set_first_text] = useState("");
  const [shake_key, set_shake_key] = useState(0);
  const [error_msg, set_error_msg] = useState<string | null>(null);
  const [saving, set_saving] = useState(false);
  const [show_passphrase, set_show_passphrase] = useState(false);
  const [pending_pin, set_pending_pin] = useState("");

  const password_ref = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    set_step("verify_credentials");
    set_password("");
    set_show_password(false);
    set_totp_code("");
    set_totp_required(false);
    set_creds_error(null);
    set_verifying_creds(false);
    set_first_pin("");
    set_confirm_input("");
    set_text_input("");
    set_first_text("");
    set_shake_key(0);
    set_error_msg(null);
    set_saving(false);
    set_show_passphrase(false);
    set_pending_pin("");
  }, []);

  useEffect(() => {
    if (!is_open) { reset(); return; }
    set_totp_loading(true);
    get_totp_status()
      .then((res) => {
        if (res.data) set_totp_required(res.data.enabled);
        set_totp_loading(false);
        setTimeout(() => password_ref.current?.focus(), 150);
      })
      .catch(() => set_totp_loading(false));
  }, [is_open, reset]);

  const handle_verify_credentials = useCallback(async () => {
    if (verifying_creds || !password) return;
    if (totp_required && totp_code.length !== 6) {
      set_creds_error(t("settings.duress_pin_invalid_credentials"));
      return;
    }
    set_verifying_creds(true);
    set_creds_error(null);
    try {
      const email = auth?.user?.email;
      if (!email) throw new Error("no_email");
      const user_hash = await hash_email(email);
      const salt_res = await get_user_salt({ user_hash });
      if (salt_res.error || !salt_res.data) throw new Error("salt");
      const salt = base64_to_array(salt_res.data.salt);
      const { hash: password_hash } = await derive_password_hash(password, salt);
      const res = await verify_vanguard_credentials({
        password_hash,
        totp_code: totp_required ? totp_code : undefined,
      });
      if (res.error || !res.data?.valid) {
        set_creds_error(t("settings.duress_pin_invalid_credentials"));
        set_verifying_creds(false);
        return;
      }
      set_step(pin_type === "numeric" ? "set_pin" : "set_text");
    } catch {
      set_creds_error(t("settings.duress_pin_invalid_credentials"));
    }
    set_verifying_creds(false);
  }, [verifying_creds, password, totp_required, totp_code, auth, account_id, t, pin_type]);

  const handle_first_digit = useCallback((d: string) => {
    const next = first_pin + d;
    set_first_pin(next);
    if (next.length === digits) { set_confirm_input(""); set_step("confirm_pin"); }
  }, [first_pin, digits]);

  const handle_confirm_digit = useCallback(async (d: string) => {
    if (saving) return;
    const next = confirm_input + d;
    set_confirm_input(next);
    if (next.length === digits) {
      if (next !== first_pin) {
        set_shake_key((k) => k + 1);
        set_error_msg(t("settings.app_lock_pin_mismatch"));
        setTimeout(() => {
          set_confirm_input("");
          set_first_pin("");
          set_step("set_pin");
          set_error_msg(null);
        }, 800);
        return;
      }
      set_saving(true);
      try {
        const is_same = await pin_matches_regular(account_id, next);
        if (is_same) {
          set_shake_key((k) => k + 1);
          set_error_msg(t("settings.duress_pin_matches_regular"));
          setTimeout(() => {
            set_confirm_input("");
            set_first_pin("");
            set_step("set_pin");
            set_error_msg(null);
          }, 1500);
          set_saving(false);
          return;
        }
        set_pending_pin(next);
        set_step("confirm_setup");
      } catch {
        set_error_msg(t("common.something_went_wrong"));
      }
      set_saving(false);
    }
  }, [account_id, confirm_input, first_pin, digits, saving, t]);

  const handle_text_continue = useCallback(async () => {
    if (step === "set_text") {
      if (text_input.length < 4) {
        set_error_msg(t("settings.app_lock_passphrase_too_short"));
        setTimeout(() => set_error_msg(null), 2000);
        return;
      }
      set_first_text(text_input);
      set_text_input("");
      set_step("confirm_text");
      return;
    }
    if (step === "confirm_text") {
      if (text_input !== first_text) {
        set_shake_key((k) => k + 1);
        set_error_msg(t("settings.app_lock_passphrase_mismatch"));
        setTimeout(() => {
          set_text_input("");
          set_first_text("");
          set_step("set_text");
          set_error_msg(null);
        }, 800);
        return;
      }
      set_saving(true);
      try {
        const is_same = await pin_matches_regular(account_id, text_input);
        if (is_same) {
          set_shake_key((k) => k + 1);
          set_error_msg(t("settings.duress_pin_matches_regular"));
          setTimeout(() => {
            set_text_input("");
            set_first_text("");
            set_step("set_text");
            set_error_msg(null);
          }, 1500);
          set_saving(false);
          return;
        }
        set_pending_pin(text_input);
        set_step("confirm_setup");
      } catch {
        set_error_msg(t("common.something_went_wrong"));
      }
      set_saving(false);
    }
  }, [step, text_input, first_text, account_id, t]);

  const handle_confirm_setup = useCallback(async () => {
    if (!pending_pin) return;
    set_saving(true);
    try {
      const salt = generate_pin_salt();
      const existing = get_app_lock_config(account_id);
      const pepper =
        existing?.kdf_version === KDF_VERSION_PEPPER
          ? (await ensure_pepper(account_id)) ?? undefined
          : undefined;
      const pin_hash = await hash_pin(pending_pin, salt, pepper);
      const pin_salt = Array.from(salt).map((b) => b.toString(16).padStart(2, "0")).join("");
      save_duress_pin(account_id, pin_hash, pin_salt);
      on_success();
    } catch {
      set_error_msg(t("common.something_went_wrong"));
      set_saving(false);
    }
  }, [pending_pin, account_id, on_success, t]);

  const step_index = step === "verify_credentials" ? 0 : step === "set_pin" || step === "set_text" ? 1 : step === "confirm_pin" || step === "confirm_text" ? 2 : 3;

  const modal_title =
    step === "verify_credentials" ? t("settings.duress_pin_verify_identity")
    : step === "set_pin" || step === "set_text" ? t("settings.duress_pin_set")
    : step === "confirm_setup" ? t("settings.duress_pin_how_it_works")
    : t("settings.duress_pin_confirm");

  return (
    <Modal is_open={is_open} on_close={on_close} size="sm" close_on_overlay={step === "verify_credentials"}>
      <ModalHeader>
        <div className="flex items-center gap-2">
          {step !== "verify_credentials" && (
            <button
              type="button"
              className="p-1 -ml-1 rounded-lg hover:bg-muted transition-colors"
              onClick={() => {
                if (step === "set_pin" || step === "set_text") {
                  set_step("verify_credentials");
                  set_first_pin("");
                  set_text_input("");
                  set_first_text("");
                  set_show_passphrase(false);
                  set_show_password(false);
                  set_creds_error(null);
                } else if (step === "confirm_pin") {
                  set_step("set_pin");
                  set_first_pin("");
                  set_confirm_input("");
                  set_error_msg(null);
                } else if (step === "confirm_text") {
                  set_step("set_text");
                  set_text_input("");
                  set_first_text("");
                  set_show_passphrase(false);
                  set_error_msg(null);
                } else if (step === "confirm_setup") {
                  set_step(pin_type === "numeric" ? "set_pin" : "set_text");
                  set_pending_pin("");
                  set_confirm_input("");
                  set_first_pin("");
                  set_text_input("");
                  set_first_text("");
                  set_show_passphrase(false);
                  set_error_msg(null);
                }
              }}
            >
              <ArrowLeftIcon className="h-4 w-4" />
            </button>
          )}
          <ModalTitle>{modal_title}</ModalTitle>
        </div>
        <div className="flex items-center gap-1 mt-2 w-full">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={cn("h-1 flex-1 rounded-full transition-all duration-300", i <= step_index ? "bg-brand" : "bg-muted")} />
          ))}
        </div>
      </ModalHeader>
      <ModalBody>
        {step === "verify_credentials" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-txt-muted -mt-1">
              {totp_required
                ? t("settings.duress_pin_verify_identity_totp_desc")
                : t("settings.duress_pin_verify_identity_desc")}
            </p>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-txt-secondary">{t("settings.duress_pin_password_label")}</label>
              <div className="relative">
                <input
                  ref={password_ref}
                  type={show_password ? "text" : "password"}
                  autoComplete="current-password"
                  className="w-full px-3 py-2.5 pr-10 rounded-xl text-sm text-txt-primary bg-surf-secondary border border-edge-secondary focus:border-brand focus:outline-none transition-colors"
                  value={password}
                  maxLength={128}
                  disabled={verifying_creds}
                  onChange={(e) => set_password(clamp_password(e.target.value))}
                  onKeyDown={(e) => { if (e.key === "Enter") handle_verify_credentials(); }}
                />
                <button type="button" tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-txt-muted hover:text-txt-primary transition-colors"
                  onClick={() => set_show_password((v) => !v)}>
                  {show_password ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {totp_required && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-txt-secondary">{t("settings.duress_pin_totp_label")}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-txt-primary bg-surf-secondary border border-edge-secondary focus:border-brand focus:outline-none transition-colors tracking-widest"
                  value={totp_code}
                  disabled={verifying_creds}
                  onChange={(e) => set_totp_code(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(e) => { if (e.key === "Enter") handle_verify_credentials(); }}
                />
              </div>
            )}
            {creds_error && <p className="text-sm text-red-500 -mt-1">{creds_error}</p>}
          </div>
        )}
        {step === "set_pin" && (
          <div className="flex flex-col items-center gap-2 pt-1">
            <PinDots digits={digits} filled={first_pin.length} shake_key={0} />
            <PinPad
              on_digit={handle_first_digit}
              on_backspace={() => set_first_pin((p) => p.slice(0, -1))}
            />
          </div>
        )}
        {step === "confirm_pin" && (
          <div className="flex flex-col items-center gap-2 pt-1">
            <PinDots digits={digits} filled={confirm_input.length} shake_key={shake_key} />
            {(error_msg || saving) && (
              <div className="flex items-center justify-center -mb-1">
                {error_msg && <p className="text-xs text-red-500">{error_msg}</p>}
                {saving && <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />}
              </div>
            )}
            <PinPad
              on_digit={handle_confirm_digit}
              on_backspace={() => set_confirm_input((p) => p.slice(0, -1))}
              disabled={saving}
            />
          </div>
        )}
        {step === "confirm_setup" && (
          <div className="flex flex-col gap-3 pt-1">
            <div className="rounded-2xl bg-surf-secondary border border-edge-secondary px-4 py-3.5 flex flex-col gap-2">
              <p className="text-sm text-txt-primary leading-relaxed">{t("settings.duress_pin_how_it_works_body")}</p>
            </div>
          </div>
        )}
        {(step === "set_text" || step === "confirm_text") && (
          <div className="flex flex-col gap-3">
            <motion.div
              key={shake_key}
              animate={shake_key > 0 ? { x: [0, -10, 10, -10, 10, 0] } : { x: 0 }}
              transition={{ duration: 0.35 }}
              className="relative"
            >
              <input
                type={show_passphrase ? "text" : "password"}
                autoComplete="off"
                data-form-type="other"
                autoFocus
                className="w-full px-3 py-2.5 pr-10 rounded-xl text-sm text-txt-primary bg-surf-secondary border border-edge-secondary focus:border-brand focus:outline-none transition-colors"
                value={text_input}
                onChange={(e) => set_text_input(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handle_text_continue()}
                placeholder={t("settings.app_lock_text_placeholder")}
              />
              <button type="button" tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-txt-muted hover:text-txt-primary transition-colors"
                onClick={() => set_show_passphrase((v) => !v)}>
                {show_passphrase ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
              </button>
            </motion.div>
            {error_msg && <p className="text-sm text-red-500 -mt-1">{error_msg}</p>}
            {saving && <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />}
          </div>
        )}
      </ModalBody>
      {step === "verify_credentials" && (
        <ModalFooter>
          <Button variant="outline" onClick={on_close}>{t("common.cancel")}</Button>
          <Button
            variant="depth"
            disabled={verifying_creds || totp_loading || !password || (totp_required && totp_code.length !== 6)}
            onClick={handle_verify_credentials}
          >
            {verifying_creds
              ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mx-auto" />
              : t("common.continue")}
          </Button>
        </ModalFooter>
      )}
      {(step === "set_text" || step === "confirm_text") && (
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              if (step === "set_text") { set_step("verify_credentials"); set_text_input(""); set_first_text(""); }
              else { set_step("set_text"); set_text_input(""); set_first_text(""); set_error_msg(null); }
            }}
          >
            {t("common.back")}
          </Button>
          <Button variant="depth" disabled={saving || text_input.length < 1} onClick={handle_text_continue}>
            {t("common.continue")}
          </Button>
        </ModalFooter>
      )}
      {step === "confirm_setup" && (
        <ModalFooter>
          <Button variant="outline" onClick={() => {
            set_step(pin_type === "numeric" ? "confirm_pin" : "confirm_text");
            set_pending_pin("");
            set_confirm_input("");
            set_first_pin("");
            set_text_input("");
            set_first_text("");
          }}>
            {t("common.back")}
          </Button>
          <Button variant="depth" disabled={saving} onClick={handle_confirm_setup}>
            {saving
              ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mx-auto" />
              : t("settings.duress_pin_confirm_setup")}
          </Button>
        </ModalFooter>
      )}
    </Modal>
  );
}

const REMOVE_MAX_ATTEMPTS = 5;

function RemoveDuressPinModal({ account_id, is_open, on_close, on_success }: {
  account_id: string;
  is_open: boolean;
  on_close: () => void;
  on_success: () => void;
}) {
  const { t } = use_i18n();
  const config = get_app_lock_config(account_id);
  const pin_type = config?.pin_type ?? "numeric";
  const digits = pin_type === "numeric" ? (config?.digits ?? 4) : 0;

  const [input, set_input] = useState("");
  const [shake_key, set_shake_key] = useState(0);
  const [error_msg, set_error_msg] = useState<string | null>(null);
  const [verifying, set_verifying] = useState(false);
  const [show_passphrase, set_show_passphrase] = useState(false);
  const [attempts_remaining, set_attempts_remaining] = useState(REMOVE_MAX_ATTEMPTS);
  const verifying_ref = useRef(false);
  const text_ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!is_open) {
      verifying_ref.current = false;
      set_input("");
      set_shake_key(0);
      set_error_msg(null);
      set_verifying(false);
      set_show_passphrase(false);
      set_attempts_remaining(REMOVE_MAX_ATTEMPTS);
      return;
    }
    if (pin_type === "text") setTimeout(() => text_ref.current?.focus(), 150);
  }, [is_open, pin_type]);

  const attempt = useCallback(async (value: string) => {
    if (verifying_ref.current) return;
    verifying_ref.current = true;
    set_verifying(true);
    const correct = await duress_pin_correct(account_id, value);
    if (correct) {
      verifying_ref.current = false;
      set_verifying(false);
      on_success();
      return;
    }
    const remaining = attempts_remaining - 1;
    set_attempts_remaining(remaining);
    if (remaining <= 0) {
      on_close();
      return;
    }
    set_shake_key((k) => k + 1);
    set_input("");
    set_error_msg(t("settings.app_lock_attempts_remaining", { n: remaining }));
    setTimeout(() => set_error_msg(null), 2000);
    await new Promise<void>(resolve => setTimeout(resolve, 600));
    verifying_ref.current = false;
    set_verifying(false);
  }, [account_id, attempts_remaining, on_success, on_close, t]);

  const handle_digit = useCallback(async (d: string) => {
    if (verifying_ref.current) return;
    const next = input + d;
    set_input(next);
    if (next.length === digits) await attempt(next);
  }, [input, digits, attempt]);

  const handle_text_submit = useCallback(async () => {
    if (verifying || input.length < 1) return;
    await attempt(input);
  }, [verifying, input, attempt]);

  return (
    <Modal is_open={is_open} on_close={on_close} size="sm">
      <ModalHeader>
        <ModalTitle>{t("settings.duress_pin_remove")}</ModalTitle>
        <ModalDescription>{t("settings.duress_pin_enter_to_remove")}</ModalDescription>
      </ModalHeader>
      <ModalBody>
        {pin_type === "numeric" ? (
          <div className="flex flex-col items-center gap-2 pt-1">
            <PinDots digits={digits} filled={input.length} shake_key={shake_key} />
            {(error_msg || verifying) && (
              <div className="flex items-center justify-center -mb-1">
                {error_msg && <p className="text-xs text-red-500">{error_msg}</p>}
                {verifying && !error_msg && <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />}
              </div>
            )}
            <PinPad
              on_digit={handle_digit}
              on_backspace={() => set_input((p) => p.slice(0, -1))}
              disabled={verifying}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <motion.div
              key={shake_key}
              animate={shake_key > 0 ? { x: [0, -10, 10, -10, 10, 0] } : { x: 0 }}
              transition={{ duration: 0.35 }}
            >
              <div className="relative">
                <input
                  ref={text_ref}
                  type={show_passphrase ? "text" : "password"}
                  autoComplete="off"
                  className="w-full px-3 py-2.5 pr-10 rounded-xl text-sm text-txt-primary bg-surf-secondary border border-edge-secondary focus:border-brand focus:outline-none transition-colors"
                  value={input}
                  disabled={verifying}
                  onChange={(e) => { if (!verifying) set_input(e.target.value); }}
                  onKeyDown={(e) => { if (e.key === "Enter") handle_text_submit(); }}
                  placeholder={t("settings.app_lock_text_placeholder")}
                />
                <button type="button" tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-txt-muted hover:text-txt-primary transition-colors"
                  onClick={() => set_show_passphrase((v) => !v)}>
                  {show_passphrase ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                </button>
              </div>
            </motion.div>
            {error_msg && <p className="text-sm text-red-500 -mt-1">{error_msg}</p>}
            <Button variant="depth" disabled={verifying || input.length < 1} onClick={handle_text_submit}>
              {verifying
                ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mx-auto" />
                : t("settings.duress_pin_remove")}
            </Button>
          </div>
        )}
      </ModalBody>
    </Modal>
  );
}

type DuressPinModal = "setup" | "change" | "remove" | null;

export function DuressPinSection() {
  const { t } = use_i18n();
  const auth = use_auth_safe();
  const account_id = auth?.current_account_id ?? "";
  const [enabled, set_enabled] = useState(false);
  const [modal, set_modal] = useState<DuressPinModal>(null);

  useEffect(() => {
    if (account_id) set_enabled(has_duress_pin(account_id));
  }, [account_id]);

  const close_modal = useCallback(() => set_modal(null), []);

  const handle_setup_success = useCallback(() => {
    set_enabled(true);
    set_modal(null);
    show_toast(t("settings.duress_pin_enabled_toast"), "success");
  }, [t]);

  const handle_change_success = useCallback(() => {
    set_modal(null);
    show_toast(t("settings.duress_pin_changed_toast"), "success");
  }, [t]);

  const handle_remove_success = useCallback(() => {
    clear_duress_pin(account_id);
    set_enabled(false);
    set_modal(null);
    show_toast(t("settings.duress_pin_disabled_toast"), "success");
  }, [account_id, t]);

  if (!account_id) return null;

  return (
    <>
      <div className="py-4 px-1">
        <div className="flex items-center justify-between">
          <div className="flex-1 pr-4">
            <p className="text-sm font-medium text-txt-primary">{t("settings.duress_pin")}</p>
            <p className="text-xs mt-0.5 text-txt-muted">{t("settings.duress_pin_description")}</p>
          </div>
          <Button
            size="sm"
            variant={enabled ? "outline" : "depth"}
            onClick={() => set_modal(enabled ? "remove" : "setup")}
          >
            {enabled ? t("settings.duress_pin_remove") : t("settings.duress_pin_setup")}
          </Button>
        </div>
        {enabled && (
          <button
            type="button"
            className="mt-3 text-xs text-brand underline underline-offset-2 hover:opacity-80"
            onClick={() => set_modal("change")}
          >
            {t("settings.duress_pin_change")}
          </button>
        )}
      </div>

      <SetupDuressPinModal
        account_id={account_id}
        is_open={modal === "setup" || modal === "change"}
        on_close={close_modal}
        on_success={modal === "change" ? handle_change_success : handle_setup_success}
      />

      <RemoveDuressPinModal
        account_id={account_id}
        is_open={modal === "remove"}
        on_close={close_modal}
        on_success={handle_remove_success}
      />
    </>
  );
}
