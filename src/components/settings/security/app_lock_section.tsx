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
import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { Button, Switch } from "@aster/ui";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

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

function PinPad({ on_digit, on_backspace, disabled }: {
  on_digit: (d: string) => void;
  on_backspace: () => void;
  disabled?: boolean;
}) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "←"];
  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map((k, i) =>
        k === "" ? (
          <div key={i} />
        ) : (
          <button
            key={i}
            type="button"
            disabled={disabled}
            className={cn(
              "h-12 w-12 mx-auto rounded-full text-base font-medium flex items-center justify-center transition-colors",
              disabled ? "opacity-40 cursor-not-allowed" : "bg-muted hover:bg-muted/70 active:scale-95",
            )}
            onClick={() => k === "←" ? on_backspace() : on_digit(k)}
          >
            {k}
          </button>
        ),
      )}
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
  const digits = get_app_lock_config(account_id)?.digits ?? 4;
  const [input, set_input] = useState("");
  const [shake_key, set_shake_key] = useState(0);
  const [error_msg, set_error_msg] = useState<string | null>(null);
  const [verifying, set_verifying] = useState(false);
  const [locked_out, set_locked_out] = useState(false);
  const [lockout_secs, set_lockout_secs] = useState(0);

  useEffect(() => {
    if (!is_open) {
      set_input("");
      set_shake_key(0);
      set_error_msg(null);
      set_verifying(false);
      set_locked_out(false);
      set_lockout_secs(0);
      return;
    }
    const { locked, remaining_ms } = is_locked_out(account_id);
    if (locked) {
      set_locked_out(true);
      set_lockout_secs(Math.ceil(remaining_ms / 1000));
    }
  }, [is_open, account_id]);

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

  const handle_digit = useCallback(async (d: string) => {
    if (verifying || locked_out) return;
    const next = input + d;
    set_input(next);
    if (next.length === digits) {
      set_verifying(true);
      const result = await verify_pin(account_id, next);
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
    }
  }, [account_id, input, digits, verifying, locked_out, on_success, t]);

  const handle_backspace = useCallback(() => {
    if (locked_out || verifying) return;
    set_input(prev => prev.slice(0, -1));
  }, [locked_out, verifying]);

  useEffect(() => {
    if (!is_open) return;
    const on_key = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") handle_digit(e.key);
      else if (e.key === "Backspace") handle_backspace();
    };
    window.addEventListener("keydown", on_key);
    return () => window.removeEventListener("keydown", on_key);
  }, [is_open, handle_digit, handle_backspace]);

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
        <div className="flex flex-col items-center gap-5 py-2">
          <PinDots digits={digits} filled={input.length} shake_key={shake_key} />
          <div className="h-4 flex items-center justify-center">
            {error_msg && <p className="text-sm text-red-500">{error_msg}</p>}
            {verifying && !error_msg && (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            )}
          </div>
          <PinPad on_digit={handle_digit} on_backspace={handle_backspace} disabled={verifying || locked_out} />
        </div>
      </ModalBody>
    </Modal>
  );
}

type SetupStep = "choose_digits" | "set_pin" | "confirm_pin";

function SetupPinModal({ account_id, is_open, on_close, on_success }: {
  account_id: string;
  is_open: boolean;
  on_close: () => void;
  on_success: () => void;
}) {
  const { t } = use_i18n();
  const [step, set_step] = useState<SetupStep>("choose_digits");
  const [chosen_digits, set_chosen_digits] = useState(4);
  const [first_pin, set_first_pin] = useState("");
  const [confirm_input, set_confirm_input] = useState("");
  const [shake_key, set_shake_key] = useState(0);
  const [error_msg, set_error_msg] = useState<string | null>(null);
  const [saving, set_saving] = useState(false);

  const reset = useCallback(() => {
    set_step("choose_digits");
    set_chosen_digits(4);
    set_first_pin("");
    set_confirm_input("");
    set_shake_key(0);
    set_error_msg(null);
    set_saving(false);
  }, []);

  useEffect(() => {
    if (!is_open) reset();
  }, [is_open, reset]);

  const handle_back = useCallback(() => {
    if (step === "set_pin") { set_step("choose_digits"); set_first_pin(""); }
    else if (step === "confirm_pin") { set_step("set_pin"); set_first_pin(""); set_confirm_input(""); set_error_msg(null); }
  }, [step]);

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
      const salt = generate_pin_salt();
      const pin_hash = await hash_pin(next, salt);
      const pin_salt = Array.from(salt).map(b => b.toString(16).padStart(2, "0")).join("");
      save_app_lock_config(account_id, { enabled: true, digits: chosen_digits, pin_hash, pin_salt });
      mark_session_unlocked(account_id);
      set_saving(false);
      on_success();
    }
  }, [account_id, confirm_input, first_pin, chosen_digits, saving, on_success, t]);

  const handle_confirm_backspace = useCallback(() => {
    set_confirm_input(prev => prev.slice(0, -1));
  }, []);

  useEffect(() => {
    if (!is_open) return;
    const on_key = (e: KeyboardEvent) => {
      if (step === "set_pin") {
        if (e.key >= "0" && e.key <= "9") handle_first_digit(e.key);
        else if (e.key === "Backspace") handle_first_backspace();
      } else if (step === "confirm_pin") {
        if (e.key >= "0" && e.key <= "9") handle_confirm_digit(e.key);
        else if (e.key === "Backspace") handle_confirm_backspace();
      }
    };
    window.addEventListener("keydown", on_key);
    return () => window.removeEventListener("keydown", on_key);
  }, [is_open, step, handle_first_digit, handle_first_backspace, handle_confirm_digit, handle_confirm_backspace]);

  const step_index = step === "choose_digits" ? 0 : step === "set_pin" ? 1 : 2;

  return (
    <Modal is_open={is_open} on_close={on_close} size="sm" close_on_overlay={step === "choose_digits"}>
      <ModalHeader>
        <div className="flex items-center gap-2">
          {step !== "choose_digits" && (
            <button type="button" className="p-1 -ml-1 rounded-lg hover:bg-muted transition-colors" onClick={handle_back}>
              <ArrowLeftIcon className="h-4 w-4" />
            </button>
          )}
          <ModalTitle>
            {step === "choose_digits" ? t("settings.app_lock_choose_digits")
              : step === "set_pin" ? t("settings.app_lock_set_pin")
              : t("settings.app_lock_confirm_pin")}
          </ModalTitle>
        </div>
        <div className="flex items-center gap-1.5 mt-2">
          {[0, 1, 2].map(i => (
            <div key={i} className={cn("h-1 rounded-full transition-all duration-300", i <= step_index ? "bg-primary w-6" : "bg-muted w-3")} />
          ))}
        </div>
      </ModalHeader>
      <ModalBody>
        {step === "choose_digits" && (
          <div className="flex flex-col gap-2">
            {([4, 6, 8] as const).map(n => (
              <button
                key={n}
                type="button"
                className={cn(
                  "w-full py-3 px-4 rounded-xl border-2 text-sm font-medium transition-colors text-left",
                  chosen_digits === n
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-edge-secondary bg-surf-secondary text-txt-primary hover:bg-surf-tertiary",
                )}
                onClick={() => set_chosen_digits(n)}
              >
                {n === 4 ? t("settings.app_lock_digits_4") : n === 6 ? t("settings.app_lock_digits_6") : t("settings.app_lock_digits_8")}
              </button>
            ))}
          </div>
        )}
        {step === "set_pin" && (
          <div className="flex flex-col items-center gap-6 py-2">
            <PinDots digits={chosen_digits} filled={first_pin.length} shake_key={0} />
            <PinPad on_digit={handle_first_digit} on_backspace={handle_first_backspace} />
          </div>
        )}
        {step === "confirm_pin" && (
          <div className="flex flex-col items-center gap-5 py-2">
            <PinDots digits={chosen_digits} filled={confirm_input.length} shake_key={shake_key} />
            <div className="h-4 flex items-center justify-center">
              {error_msg && <p className="text-sm text-red-500">{error_msg}</p>}
              {saving && <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />}
            </div>
            <PinPad on_digit={handle_confirm_digit} on_backspace={handle_confirm_backspace} disabled={saving} />
          </div>
        )}
      </ModalBody>
      {step === "choose_digits" && (
        <ModalFooter>
          <Button variant="outline" onClick={on_close}>{t("common.cancel")}</Button>
          <Button variant="depth" onClick={() => set_step("set_pin")}>{t("common.continue")}</Button>
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
            className="mt-3 text-xs text-primary hover:underline"
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
