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
import { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowDownTrayIcon,
  ClipboardDocumentIcon,
  EyeIcon,
  EyeSlashIcon,
  PrinterIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { copy_text_or_throw } from "@/utils/copy_text";
import { apply_input_transform } from "@/utils/input_transform";
import { show_toast } from "@/components/toast/simple_toast";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { use_i18n } from "@/lib/i18n/context";
import { use_auth } from "@/contexts/auth_context";
import { api_client } from "@/services/api/client";
import { base64_to_array } from "@/services/crypto/base64";
import {
  derive_password_hash,
  generate_recovery_codes,
  RECOVERY_CODE_SET_SIZE,
} from "@/services/crypto/key_manager_pgp";
import { encrypt_vault } from "@/services/crypto/key_manager_pgp_vault";
import {
  get_vault_from_memory,
  get_passphrase_from_memory,
  store_vault_in_memory,
} from "@/services/crypto/memory_key_store";
import { store_encrypted_vault } from "@/contexts/auth/session_passphrase";
import {
  generate_recovery_key,
  encrypt_vault_backup,
  generate_all_recovery_shares,
  clear_recovery_key,
  hash_recovery_code,
} from "@/services/crypto/recovery_key";
import {
  save_recovery_backup,
  verify_codes_step_up,
} from "@/services/api/recovery";
import {
  generate_recovery_pdf,
  download_recovery_text,
  print_recovery_codes,
} from "@/services/crypto/recovery_pdf";

interface SaltResponse {
  salt: string;
  totp_required: boolean;
}

interface DisplayCode {
  code: string;
  used: boolean;
}

export type RecoveryCodesModalMode = "show" | "regenerate";

interface RecoveryCodesModalProps {
  has_codes: boolean;
  is_open: boolean;
  mode: RecoveryCodesModalMode;
  on_close: () => void;
  on_saved: () => void;
}

export function RecoveryCodesModal({
  has_codes,
  is_open,
  mode,
  on_close,
  on_saved,
}: RecoveryCodesModalProps) {
  const { t } = use_i18n();
  const { user } = use_auth();
  const [step, set_step] = useState<"confirm" | "verify" | "codes">("verify");
  const [password, set_password] = useState("");
  const [totp_code, set_totp_code] = useState("");
  const [totp_required, set_totp_required] = useState(false);
  const [error, set_error] = useState("");
  const [is_working, set_is_working] = useState(false);
  const [codes, set_codes] = useState<DisplayCode[]>([]);
  const [codes_unavailable, set_codes_unavailable] = useState(false);
  const [are_codes_visible, set_are_codes_visible] = useState(false);
  const [saved_checkbox, set_saved_checkbox] = useState(false);
  const working_ref = useRef(false);
  const input_ref = useRef<HTMLInputElement>(null);

  const is_regenerate = mode === "regenerate";

  useEffect(() => {
    if (is_open) {
      set_step(is_regenerate && has_codes ? "confirm" : "verify");
      set_password("");
      set_totp_code("");
      set_totp_required(false);
      set_error("");
      set_is_working(false);
      set_codes([]);
      set_codes_unavailable(false);
      set_are_codes_visible(false);
      set_saved_checkbox(false);
      setTimeout(() => input_ref.current?.focus(), 100);
    } else {
      set_codes([]);
      set_password("");
    }
  }, [is_open, is_regenerate, has_codes]);

  const plain_codes = codes.map((entry) => entry.code);

  const run_step_up = async (): Promise<{
    token: string;
    used_hashes: Set<string>;
  } | null> => {
    const salt_response = await api_client.get<SaltResponse>(
      "/crypto/v1/encryption/salt",
      { skip_cache: true },
    );

    if (salt_response.error || !salt_response.data?.salt) {
      set_error(t("settings.failed_retrieve_auth"));

      return null;
    }

    if (salt_response.data.totp_required && !totp_required) {
      set_totp_required(true);
      set_totp_code("");

      return null;
    }

    const salt = base64_to_array(salt_response.data.salt);
    const { hash } = await derive_password_hash(password, salt);
    const step_up = await verify_codes_step_up(
      hash,
      totp_required && totp_code.trim() ? totp_code.trim() : undefined,
    );

    if (step_up.error || !step_up.data?.step_up_token) {
      set_error(step_up.error || t("settings.incorrect_password_error"));

      return null;
    }

    const used_hashes = new Set(
      step_up.data.codes
        .filter((entry) => entry.status === "used")
        .map((entry) => entry.code_hash),
    );

    return { token: step_up.data.step_up_token, used_hashes };
  };

  const show_existing_codes = async (used_hashes: Set<string>) => {
    const vault = get_vault_from_memory();
    const stored = vault?.recovery_codes ?? [];

    if (stored.length === 0) {
      set_codes([]);
      set_codes_unavailable(true);
      set_step("codes");

      return;
    }

    const entries: DisplayCode[] = [];

    for (const code of stored) {
      entries.push({
        code,
        used: used_hashes.has(await hash_recovery_code(code)),
      });
    }

    set_codes(entries);
    set_codes_unavailable(false);
    set_step("codes");
  };

  const replace_codes = async (step_up_token: string) => {
    const vault = get_vault_from_memory();
    const passphrase = get_passphrase_from_memory();

    if (!vault || !passphrase) {
      set_error(t("settings.failed_verify_password"));

      return;
    }

    const new_codes = generate_recovery_codes(RECOVERY_CODE_SET_SIZE);
    const recovery_key = generate_recovery_key();

    try {
      const updated_vault = { ...vault, recovery_codes: new_codes };
      const new_backup = await encrypt_vault_backup(updated_vault, recovery_key);
      const new_shares = await generate_all_recovery_shares(
        new_codes,
        recovery_key,
      );
      const { encrypted_vault, vault_nonce } = await encrypt_vault(
        updated_vault,
        passphrase,
      );

      const save_response = await save_recovery_backup(
        new_backup.encrypted_data,
        new_backup.nonce,
        new_backup.salt,
        new_shares,
        {
          step_up_token,
          encrypted_vault,
          vault_nonce,
          vault_format: updated_vault.vault_format,
        },
      );

      if (save_response.error || !save_response.data?.success) {
        set_error(
          save_response.error || t("settings.recovery_codes_save_failed"),
        );

        return;
      }

      await store_vault_in_memory(updated_vault, passphrase, user?.id);

      if (user?.id) {
        store_encrypted_vault(user.id, encrypted_vault, vault_nonce);
      }

      set_codes(new_codes.map((code) => ({ code, used: false })));
      set_codes_unavailable(false);
      set_step("codes");
      on_saved();
    } finally {
      clear_recovery_key(recovery_key);
    }
  };

  const handle_continue = async () => {
    if (working_ref.current) return;

    if (!password.trim()) {
      set_error(t("settings.please_enter_password"));

      return;
    }

    if (totp_required && !totp_code.trim()) {
      set_error(t("settings.please_enter_2fa_code"));

      return;
    }

    working_ref.current = true;
    set_is_working(true);
    set_error("");

    try {
      const verified = await run_step_up();

      if (!verified) return;

      if (is_regenerate) {
        await replace_codes(verified.token);
      } else {
        await show_existing_codes(verified.used_hashes);
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      set_error(t("settings.recovery_codes_save_failed"));
    } finally {
      working_ref.current = false;
      set_is_working(false);
    }
  };

  const handle_copy = async () => {
    try {
      await copy_text_or_throw(plain_codes.join("\n"));
      show_toast(t("auth.codes_copied"), "success");
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      show_toast(t("common.failed_to_copy"), "error");
    }
  };

  const handle_download_pdf = async () => {
    try {
      await generate_recovery_pdf(user?.email ?? "", plain_codes, t);
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      show_toast(t("common.download_failed"), "error");
    }
  };

  const handle_download_text = async () => {
    try {
      await download_recovery_text(user?.email ?? "", plain_codes, t);
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      show_toast(t("common.download_failed"), "error");
    }
  };

  const handle_print = () => {
    print_recovery_codes(user?.email ?? "", plain_codes, t);
  };

  const handle_modal_close = useCallback(() => {
    if (working_ref.current) return;
    on_close();
  }, [on_close]);

  const primary_label = is_regenerate
    ? t("settings.recovery_codes_regenerate")
    : t("settings.recovery_codes_show");

  return (
    <Modal
      close_on_escape={step !== "codes"}
      close_on_overlay={false}
      is_open={is_open}
      on_close={handle_modal_close}
      show_close_button={step !== "codes"}
      size="md"
    >
      {step === "confirm" && (
        <>
          <ModalHeader>
            <ModalTitle>{t("settings.recovery_codes_get_new_title")}</ModalTitle>
            <ModalDescription>
              {t("settings.recovery_codes_regenerate_warning")}
            </ModalDescription>
          </ModalHeader>
          <ModalFooter>
            <Button variant="outline" onClick={handle_modal_close}>
              {t("common.cancel")}
            </Button>
            <Button variant="depth" onClick={() => set_step("verify")}>
              {t("settings.recovery_codes_regenerate")}
            </Button>
          </ModalFooter>
        </>
      )}
      {step === "verify" && (
        <>
          <ModalHeader>
            <ModalTitle>{t("settings.recovery_codes_confirm_title")}</ModalTitle>
            <ModalDescription>
              {t("settings.recovery_codes_confirm_desc")}
            </ModalDescription>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div>
                <label
                  className="text-sm font-medium block mb-2 text-txt-primary"
                  htmlFor="codes-current-password"
                >
                  {t("settings.password_label")}
                </label>
                <Input
                  ref={input_ref}
                  autoComplete="current-password"
                  disabled={is_working}
                  id="codes-current-password"
                  status={error ? "error" : "default"}
                  type="password"
                  value={password}
                  onChange={(e) => {
                    set_password(e.target.value);
                    if (error) set_error("");
                  }}
                  onKeyDown={(e) => e["key"] === "Enter" && handle_continue()}
                />
              </div>
              {totp_required && (
                <div>
                  <label
                    className="text-sm font-medium block mb-2 text-txt-primary"
                    htmlFor="codes-totp-code"
                  >
                    {t("settings.authenticator_code")}
                  </label>
                  <Input
                    autoComplete="one-time-code"
                    className="text-center text-2xl font-semibold tracking-[0.5em]"
                    disabled={is_working}
                    id="codes-totp-code"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    status={error ? "error" : "default"}
                    type="text"
                    value={totp_code}
                    onChange={(e) => {
                      set_totp_code(
                        apply_input_transform(e.target, (v) =>
                          v.replace(/\D/g, "").slice(0, 6),
                        ),
                      );
                      if (error) set_error("");
                    }}
                    onKeyDown={(e) => e["key"] === "Enter" && handle_continue()}
                  />
                </div>
              )}
              {error && (
                <p className="text-sm text-center text-red-500">{error}</p>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              disabled={is_working}
              variant="outline"
              onClick={handle_modal_close}
            >
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!password.trim() || is_working}
              is_loading={is_working}
              variant="depth"
              onClick={handle_continue}
            >
              {primary_label}
            </Button>
          </ModalFooter>
        </>
      )}
      {step === "codes" && (
        <>
          <ModalHeader>
            <ModalTitle>{t("settings.recovery_codes_title")}</ModalTitle>
            <ModalDescription>
              {t("auth.store_codes_safely")}
            </ModalDescription>
          </ModalHeader>
          <ModalBody>
            {codes_unavailable ? (
              <p className="text-sm text-txt-secondary">
                {t("settings.recovery_codes_unavailable")}
              </p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-end">
                  <div className="flex items-center gap-1">
                    <button
                      aria-label={t("settings.show_password_toggle")}
                      className="p-1.5 rounded transition-colors hover:opacity-80 text-txt-muted"
                      type="button"
                      onClick={() => set_are_codes_visible(!are_codes_visible)}
                    >
                      {are_codes_visible ? (
                        <EyeSlashIcon className="w-4 h-4" />
                      ) : (
                        <EyeIcon className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      aria-label={t("auth.copy_codes")}
                      className="p-1.5 rounded transition-colors hover:opacity-80 text-txt-muted"
                      type="button"
                      onClick={handle_copy}
                    >
                      <ClipboardDocumentIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {codes.map((entry, index) => (
                    <div
                      key={entry.code}
                      className="rounded-lg px-3 py-2.5 border flex items-center gap-2 bg-surf-tertiary border-edge-secondary"
                    >
                      <span className="text-xs text-txt-muted w-5 text-end shrink-0">
                        {index + 1}.
                      </span>
                      <span
                        className={`text-xs font-mono break-all ${
                          entry.used
                            ? "line-through text-txt-muted"
                            : "text-txt-primary"
                        }`}
                        style={{
                          filter: are_codes_visible ? "none" : "blur(4px)",
                          transition: "filter 0.2s ease",
                          userSelect: are_codes_visible ? "text" : "none",
                        }}
                      >
                        {entry.code}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="secondary" onClick={handle_download_pdf}>
                    <ArrowDownTrayIcon className="w-4 h-4 me-2" />
                    {t("settings.download_pdf")}
                  </Button>
                  <Button variant="secondary" onClick={handle_download_text}>
                    <ArrowDownTrayIcon className="w-4 h-4 me-2" />
                    {t("auth.download_as_text")}
                  </Button>
                  <Button variant="secondary" onClick={handle_print}>
                    <PrinterIcon className="w-4 h-4 me-2" />
                    {t("auth.print_codes")}
                  </Button>
                </div>
                {is_regenerate && (
                  <label className="w-full flex items-start gap-2 cursor-pointer text-txt-tertiary">
                    <input
                      checked={saved_checkbox}
                      className="mt-0.5 accent-current"
                      type="checkbox"
                      onChange={(e) => set_saved_checkbox(e.target.checked)}
                    />
                    <span className="text-sm leading-relaxed">
                      {t("auth.i_saved_these_codes")}
                    </span>
                  </label>
                )}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button
              disabled={is_regenerate && !codes_unavailable && !saved_checkbox}
              variant="depth"
              onClick={on_close}
            >
              {t("common.done")}
            </Button>
          </ModalFooter>
        </>
      )}
    </Modal>
  );
}
