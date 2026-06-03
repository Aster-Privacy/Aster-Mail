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
import { useState, useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Button, Switch } from "@aster/ui";
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
import { use_auth_safe } from "@/contexts/auth_context";
import { cn } from "@/lib/utils";

import {
  get_app_lock_config,
  save_app_lock_config,
  clear_app_lock_config,
  clear_session_unlock,
  generate_pin_salt,
  hash_pin,
  verify_pin,
  is_locked_out,
  mark_session_unlocked,
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

function VerifyPinModal({ account_id, is_open, on_close, on_success, description }: {
  account_id: string;
  is_open: boolean;
  on_close: () => void;
  on_success: () => void;
  description: string;
}) {
  const { t } = use_i18n();
  const config = get_app_lock_config(account_id);
  const pin_type = config?.pin_type ?? "numeric";
  const digits = pin_type === "numeric" ? (config?.digits ?? 4) : 0;
  const text_input_ref = useRef<HTMLInputElement>(null);
  const [input, set_input] = useState("");
  const [shake_key, set_shake_key] = useState(0);
  const [error_msg, set_error_msg] = useState<string | null>(null);
  const [verifying, set_verifying] = useState(false);
  const [locked_out, set_locked_out] = useState(false);
  const [lockout_secs, set_lockout_secs] = useState(0);
  const [show_passphrase, set_show_passphrase] = useState(false);

  useEffect(() => {
    if (!is_open) {
      set_input("");
      set_shake_key(0);
      set_error_msg(null);
      set_verifying(false);
      set_locked_out(false);
      set_lockout_secs(0);
      set_show_passphrase(false);
      return;
    }
    const { locked, remaining_ms } = is_locked_out(account_id);
    if (locked) {
      set_locked_out(true);
      set_lockout_secs(Math.ceil(remaining_ms / 1000));
    }
    if (pin_type === "text") {
      const timer = setTimeout(() => text_input_ref.current?.focus(), 150);
      return () => clearTimeout(timer);
    }
  }, [is_open, account_id, pin_type]);

  useEffect(() => {
    if (!locked_out) return;
    const interval = setInterval(() => {
      const { locked, remaining_ms } = is_locked_out(account_id);
      if (!locked) {
        set_locked_out(false);
        set_lockout_secs(0);
      } else {
        set_lockout_secs(Math.ceil(remaining_ms / 1000));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [locked_out, account_id]);

  const attempt_verify = useCallback(async (value: string) => {
    set_verifying(true);
    const result = await verify_pin(account_id, value);
    if (result.ok) {
      set_input("");
      set_verifying(false);
      on_success();
      return;
    }
    if (result.locked) {
      set_locked_out(true);
      set_input("");
      const { remaining_ms } = is_locked_out(account_id);
      set_lockout_secs(Math.ceil(remaining_ms / 1000));
      set_error_msg(null);
    } else {
      set_shake_key(k => k + 1);
      set_input("");
      const msg = result.attempts_remaining > 0
        ? t("settings.app_lock_attempts_remaining", { n: result.attempts_remaining })
        : t("settings.app_lock_wrong_pin");
      set_error_msg(msg);
      setTimeout(() => set_error_msg(null), 2000);
    }
    set_verifying(false);
  }, [account_id, on_success, t]);

  const handle_digit = useCallback(async (d: string) => {
    if (verifying || locked_out) return;
    const next = input + d;
    set_input(next);
    if (next.length === digits) {
      await attempt_verify(next);
    }
  }, [account_id, input, digits, verifying, locked_out, attempt_verify]);

  const handle_backspace = useCallback(() => {
    if (locked_out || verifying) return;
    set_input(prev => prev.slice(0, -1));
  }, [locked_out, verifying]);

  const handle_text_submit = useCallback(async () => {
    if (verifying || locked_out || input.length < 1) return;
    await attempt_verify(input);
  }, [verifying, locked_out, input, attempt_verify]);

  useEffect(() => {
    if (!is_open || pin_type !== "text") return;
    const on_key = (e: KeyboardEvent) => {
      if (e.key === "Enter") handle_text_submit();
    };
    window.addEventListener("keydown", on_key);
    return () => window.removeEventListener("keydown", on_key);
  }, [is_open, pin_type, handle_text_submit]);

  return (
    <Modal is_open={is_open} on_close={on_close} size="sm">
      <ModalHeader>
        <ModalTitle>{t("settings.app_lock_pin")}</ModalTitle>
        <ModalDescription>
          {locked_out
            ? t("settings.app_lock_locked_out_for", { s: lockout_secs })
            : description}
        </ModalDescription>
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
            <PinPad on_digit={handle_digit} on_backspace={handle_backspace} disabled={verifying || locked_out} />
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
                  ref={text_input_ref}
                  type={show_passphrase ? "text" : "password"}
                  autoComplete="off"
                  data-form-type="other"
                  className="w-full px-3 py-2.5 pr-10 rounded-xl text-sm text-txt-primary bg-surf-secondary border border-edge-secondary focus:border-brand focus:outline-none transition-colors"
                  value={input}
                  disabled={verifying || locked_out}
                  onChange={e => { if (!verifying && !locked_out) set_input(e.target.value); }}
                  onKeyDown={e => { if (e.key === "Enter") handle_text_submit(); }}
                  placeholder={t("settings.app_lock_text_placeholder")}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-txt-muted hover:text-txt-primary transition-colors"
                  onClick={() => set_show_passphrase(v => !v)}
                >
                  {show_passphrase ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                </button>
              </div>
            </motion.div>
            {error_msg && <p className="text-sm text-red-500 -mt-1">{error_msg}</p>}
            <Button variant="depth" disabled={verifying || locked_out || input.length < 1} onClick={handle_text_submit}>
              {verifying
                ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mx-auto" />
                : t("common.continue")}
            </Button>
          </div>
        )}
      </ModalBody>
    </Modal>
  );
}

type SetupStep = "choose_mode" | "choose_digits" | "set_pin" | "confirm_pin" | "set_text" | "confirm_text";

function SetupPinModal({ account_id, is_open, on_close, on_success }: {
  account_id: string;
  is_open: boolean;
  on_close: () => void;
  on_success: () => void;
}) {
  const { t } = use_i18n();
  const [step, set_step] = useState<SetupStep>("choose_mode");
  const [chosen_mode, set_chosen_mode] = useState<"numeric" | "text">("numeric");
  const [chosen_digits, set_chosen_digits] = useState(4);
  const [first_pin, set_first_pin] = useState("");
  const [confirm_input, set_confirm_input] = useState("");
  const [text_input, set_text_input] = useState("");
  const [first_text, set_first_text] = useState("");
  const [shake_key, set_shake_key] = useState(0);
  const [error_msg, set_error_msg] = useState<string | null>(null);
  const [saving, set_saving] = useState(false);
  const [show_passphrase, set_show_passphrase] = useState(false);

  const reset = useCallback(() => {
    set_step("choose_mode");
    set_chosen_mode("numeric");
    set_chosen_digits(4);
    set_first_pin("");
    set_confirm_input("");
    set_text_input("");
    set_first_text("");
    set_shake_key(0);
    set_error_msg(null);
    set_saving(false);
    set_show_passphrase(false);
  }, []);

  useEffect(() => {
    if (!is_open) reset();
  }, [is_open, reset]);

  const handle_back = useCallback(() => {
    if (step === "choose_digits") { set_step("choose_mode"); }
    else if (step === "set_pin") { set_step("choose_digits"); set_first_pin(""); }
    else if (step === "confirm_pin") { set_step("set_pin"); set_first_pin(""); set_confirm_input(""); set_error_msg(null); }
    else if (step === "set_text") { set_step("choose_mode"); set_text_input(""); set_first_text(""); }
    else if (step === "confirm_text") { set_step("set_text"); set_text_input(""); set_first_text(""); set_error_msg(null); }
  }, [step]);

  const handle_mode_continue = useCallback(() => {
    if (chosen_mode === "numeric") set_step("choose_digits");
    else set_step("set_text");
  }, [chosen_mode]);

  const handle_first_digit = useCallback((d: string) => {
    const next = first_pin + d;
    set_first_pin(next);
    if (next.length === chosen_digits) { set_confirm_input(""); set_step("confirm_pin"); }
  }, [first_pin, chosen_digits]);

  const handle_first_backspace = useCallback(() => {
    set_first_pin(prev => prev.slice(0, -1));
  }, []);

  const handle_confirm_digit = useCallback(async (d: string) => {
    if (saving) return;
    const next = confirm_input + d;
    set_confirm_input(next);
    if (next.length === chosen_digits) {
      if (next !== first_pin) {
        set_shake_key(k => k + 1);
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
        const salt = generate_pin_salt();
        const pin_hash = await hash_pin(next, salt);
        const pin_salt = Array.from(salt).map(b => b.toString(16).padStart(2, "0")).join("");
        save_app_lock_config(account_id, { enabled: true, pin_type: "numeric", digits: chosen_digits, pin_hash, pin_salt });
        mark_session_unlocked(account_id);
        on_success();
      } catch {
        set_error_msg(t("common.something_went_wrong"));
      }
      set_saving(false);
    }
  }, [account_id, confirm_input, first_pin, chosen_digits, saving, on_success, t]);

  const handle_confirm_backspace = useCallback(() => {
    set_confirm_input(prev => prev.slice(0, -1));
  }, []);

  const handle_text_continue = useCallback(() => {
    if (step === "set_text") {
      if (text_input.length < 4) {
        set_error_msg(t("settings.app_lock_passphrase_too_short"));
        setTimeout(() => set_error_msg(null), 2000);
        return;
      }
      set_first_text(text_input);
      set_text_input("");
      set_step("confirm_text");
    } else if (step === "confirm_text") {
      if (text_input !== first_text) {
        set_shake_key(k => k + 1);
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
      const salt = generate_pin_salt();
      hash_pin(text_input, salt).then(pin_hash => {
        const pin_salt = Array.from(salt).map(b => b.toString(16).padStart(2, "0")).join("");
        save_app_lock_config(account_id, { enabled: true, pin_type: "text", digits: 0, pin_hash, pin_salt });
        mark_session_unlocked(account_id);
        set_saving(false);
        on_success();
      }).catch(() => {
        set_error_msg(t("common.something_went_wrong"));
        set_saving(false);
      });
    }
  }, [step, text_input, first_text, account_id, on_success, t]);

  const step_index = step === "choose_mode" ? 0
    : step === "choose_digits" || step === "set_text" ? 1
    : 2;

  const is_first_step = step === "choose_mode";

  const modal_title = step === "choose_mode" ? t("settings.app_lock_choose_mode")
    : step === "choose_digits" ? t("settings.app_lock_choose_digits")
    : step === "set_pin" ? t("settings.app_lock_set_pin")
    : step === "confirm_pin" ? t("settings.app_lock_confirm_pin")
    : step === "set_text" ? t("settings.app_lock_set_passphrase")
    : t("settings.app_lock_confirm_passphrase");

  return (
    <Modal is_open={is_open} on_close={on_close} size="sm" close_on_overlay={is_first_step}>
      <ModalHeader>
        <div className="flex items-center gap-2">
          {!is_first_step && (
            <button type="button" className="p-1 -ml-1 rounded-lg hover:bg-muted transition-colors" onClick={handle_back}>
              <ArrowLeftIcon className="h-4 w-4" />
            </button>
          )}
          <ModalTitle>{modal_title}</ModalTitle>
        </div>
        <div className="flex items-center gap-1 mt-2 w-full">
          {[0, 1, 2].map(i => (
            <div key={i} className={cn("h-1 flex-1 rounded-full transition-all duration-300", i <= step_index ? "bg-brand" : "bg-muted")} />
          ))}
        </div>
      </ModalHeader>
      <ModalBody>
        {step === "choose_mode" && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className={cn(
                "w-full py-3 px-4 rounded-xl text-sm font-medium transition-colors text-left",
                chosen_mode === "numeric"
                  ? "bg-brand text-white border border-brand"
                  : "bg-surf-secondary text-txt-primary hover:bg-surf-tertiary border border-edge-secondary",
              )}
              onClick={() => set_chosen_mode("numeric")}
            >
              <div className="font-medium">{t("settings.app_lock_mode_numeric")}</div>
              <div className={cn("text-xs mt-0.5", chosen_mode === "numeric" ? "text-white/70" : "text-txt-muted")}>
                {t("settings.app_lock_mode_numeric_desc")}
              </div>
            </button>
            <button
              type="button"
              className={cn(
                "w-full py-3 px-4 rounded-xl text-sm font-medium transition-colors text-left",
                chosen_mode === "text"
                  ? "bg-brand text-white border border-brand"
                  : "bg-surf-secondary text-txt-primary hover:bg-surf-tertiary border border-edge-secondary",
              )}
              onClick={() => set_chosen_mode("text")}
            >
              <div className="font-medium">{t("settings.app_lock_mode_text")}</div>
              <div className={cn("text-xs mt-0.5", chosen_mode === "text" ? "text-white/70" : "text-txt-muted")}>
                {t("settings.app_lock_mode_text_desc")}
              </div>
            </button>
          </div>
        )}
        {step === "choose_digits" && (
          <div className="flex flex-col gap-2">
            {([4, 6, 8] as const).map(n => (
              <button
                key={n}
                type="button"
                className={cn(
                  "w-full py-3 px-4 rounded-xl text-sm font-medium transition-colors text-left",
                  chosen_digits === n
                    ? "bg-brand text-white border border-brand"
                    : "bg-surf-secondary text-txt-primary hover:bg-surf-tertiary border border-edge-secondary",
                )}
                onClick={() => set_chosen_digits(n)}
              >
                {n === 4 ? t("settings.app_lock_digits_4") : n === 6 ? t("settings.app_lock_digits_6") : t("settings.app_lock_digits_8")}
              </button>
            ))}
          </div>
        )}
        {step === "set_pin" && (
          <div className="flex flex-col items-center gap-2 pt-1">
            <PinDots digits={chosen_digits} filled={first_pin.length} shake_key={0} />
            <PinPad on_digit={handle_first_digit} on_backspace={handle_first_backspace} />
          </div>
        )}
        {step === "confirm_pin" && (
          <div className="flex flex-col items-center gap-2 pt-1">
            <PinDots digits={chosen_digits} filled={confirm_input.length} shake_key={shake_key} />
            {(error_msg || saving) && (
              <div className="flex items-center justify-center -mb-1">
                {error_msg && <p className="text-xs text-red-500">{error_msg}</p>}
                {saving && <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />}
              </div>
            )}
            <PinPad on_digit={handle_confirm_digit} on_backspace={handle_confirm_backspace} disabled={saving} />
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
                onChange={e => set_text_input(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handle_text_continue()}
                placeholder={t("settings.app_lock_text_placeholder")}
              />
              <button
                type="button"
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-txt-muted hover:text-txt-primary transition-colors"
                onClick={() => set_show_passphrase(v => !v)}
              >
                {show_passphrase ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
              </button>
            </motion.div>
            {error_msg && <p className="text-sm text-red-500 -mt-1">{error_msg}</p>}
            {saving && <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />}
          </div>
        )}
      </ModalBody>
      {(step === "choose_mode" || step === "choose_digits" || step === "set_text" || step === "confirm_text") && (
        <ModalFooter>
          <Button variant="outline" onClick={is_first_step ? on_close : handle_back}>
            {is_first_step ? t("common.cancel") : t("common.back")}
          </Button>
          {(step === "choose_mode" || step === "choose_digits") && (
            <Button variant="depth" onClick={step === "choose_mode" ? handle_mode_continue : () => set_step("set_pin")}>
              {t("common.continue")}
            </Button>
          )}
          {(step === "set_text" || step === "confirm_text") && (
            <Button variant="depth" disabled={saving || text_input.length < 1} onClick={handle_text_continue}>
              {t("common.continue")}
            </Button>
          )}
        </ModalFooter>
      )}
    </Modal>
  );
}

type AppLockModal = "setup" | "verify_to_change" | "change" | "disable" | null;

export function AppLockSection() {
  const { t } = use_i18n();
  const auth = use_auth_safe();
  const account_id = auth?.current_account_id ?? "";
  const [enabled, set_enabled] = useState(false);
  const [modal, set_modal] = useState<AppLockModal>(null);

  useEffect(() => {
    if (account_id) set_enabled(get_app_lock_config(account_id)?.enabled ?? false);
  }, [account_id]);

  const close_modal = useCallback(() => set_modal(null), []);

  const handle_toggle = useCallback((checked: boolean) => {
    set_modal(checked ? "setup" : "disable");
  }, []);

  const handle_setup_success = useCallback(() => {
    set_enabled(true);
    set_modal(null);
    show_toast(t("settings.app_lock_enabled_toast"), "success");
  }, [t]);

  const handle_disable_success = useCallback(() => {
    clear_app_lock_config(account_id);
    clear_session_unlock(account_id);
    set_enabled(false);
    set_modal(null);
    show_toast(t("settings.app_lock_disabled_toast"), "success");
  }, [account_id, t]);

  const handle_verify_to_change_success = useCallback(() => {
    set_modal("change");
  }, []);

  const handle_change_success = useCallback(() => {
    set_modal(null);
    show_toast(t("settings.app_lock_enabled_toast"), "success");
  }, [t]);

  return (
    <>
      <div className="py-4 px-1">
        <div className="flex items-center justify-between">
          <div className="flex-1 pr-4">
            <p className="text-sm font-medium text-txt-primary">{t("settings.app_lock_pin")}</p>
            <p className="text-xs mt-0.5 text-txt-muted">{t("settings.app_lock_pin_description")}</p>
          </div>
          <Switch checked={enabled} onCheckedChange={handle_toggle} />
        </div>
        {enabled && (
          <button
            type="button"
            className="mt-3 text-xs text-brand underline underline-offset-2 hover:opacity-80"
            onClick={() => set_modal("verify_to_change")}
          >
            {t("settings.app_lock_change_pin")}
          </button>
        )}
      </div>

      <SetupPinModal
        account_id={account_id}
        is_open={modal === "setup" || modal === "change"}
        on_close={close_modal}
        on_success={modal === "change" ? handle_change_success : handle_setup_success}
      />

      <VerifyPinModal
        account_id={account_id}
        is_open={modal === "verify_to_change"}
        on_close={close_modal}
        on_success={handle_verify_to_change_success}
        description={t("settings.app_lock_enter_to_change")}
      />

      <VerifyPinModal
        account_id={account_id}
        is_open={modal === "disable"}
        on_close={close_modal}
        on_success={handle_disable_success}
        description={t("settings.app_lock_enter_to_disable")}
      />
    </>
  );
}
