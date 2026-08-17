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
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

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
} from "@/services/crypto/key_manager_pgp";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";
import {
  generate_recovery_key,
  encrypt_vault_backup,
  generate_all_recovery_shares,
  clear_recovery_key,
} from "@/services/crypto/recovery_key";
import { save_recovery_backup } from "@/services/api/recovery";
import {
  generate_recovery_pdf,
  download_recovery_text,
} from "@/services/crypto/recovery_pdf";

interface SaltResponse {
  salt: string;
  totp_required: boolean;
}

interface VerifyPasswordResponse {
  verified: boolean;
}

interface RecoveryCodesModalProps {
  has_codes: boolean;
  is_open: boolean;
  on_close: () => void;
  on_saved: () => void;
}

export function RecoveryCodesModal({
  has_codes,
  is_open,
  on_close,
  on_saved,
}: RecoveryCodesModalProps) {
  const { t } = use_i18n();
  const { user } = use_auth();
  const [step, set_step] = useState<"verify" | "show">("verify");
  const [password, set_password] = useState("");
  const [totp_code, set_totp_code] = useState("");
  const [totp_required, set_totp_required] = useState(false);
  const [error, set_error] = useState("");
  const [is_working, set_is_working] = useState(false);
  const [codes, set_codes] = useState<string[]>([]);
  const [are_codes_visible, set_are_codes_visible] = useState(false);
  const [saved_checkbox, set_saved_checkbox] = useState(false);
  const working_ref = useRef(false);
  const input_ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (is_open) {
      set_step("verify");
      set_password("");
      set_totp_code("");
      set_totp_required(false);
      set_error("");
      set_is_working(false);
      set_codes([]);
      set_are_codes_visible(false);
      set_saved_checkbox(false);
      setTimeout(() => input_ref.current?.focus(), 100);
    } else {
      set_codes([]);
      set_password("");
    }
  }, [is_open]);

  const handle_generate = async () => {
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
      const salt_response = await api_client.get<SaltResponse>(
        "/crypto/v1/encryption/salt",
        { skip_cache: true },
      );

      if (salt_response.error || !salt_response.data?.salt) {
        set_error(t("settings.failed_retrieve_auth"));

        return;
      }

      if (salt_response.data.totp_required && !totp_required) {
        set_totp_required(true);
        set_totp_code("");

        return;
      }

      const salt = base64_to_array(salt_response.data.salt);
      const { hash } = await derive_password_hash(password, salt);

      const body: { password_hash: string; totp_code?: string } = {
        password_hash: hash,
      };

      if (totp_required && totp_code.trim()) {
        body.totp_code = totp_code.trim();
      }

      const verify_response = await api_client.post<VerifyPasswordResponse>(
        "/crypto/v1/encryption/verify-password",
        body,
      );

      if (verify_response.error) {
        set_error(verify_response.error);

        return;
      }

      if (!verify_response.data?.verified) {
        set_error(t("settings.incorrect_password_error"));

        return;
      }

      const vault = get_vault_from_memory();

      if (!vault) {
        set_error(t("settings.failed_verify_password"));

        return;
      }

      const new_codes = generate_recovery_codes(6);
      const recovery_key = generate_recovery_key();

      try {
        const new_backup = await encrypt_vault_backup(vault, recovery_key);
        const new_shares = await generate_all_recovery_shares(
          new_codes,
          recovery_key,
        );

        const save_response = await save_recovery_backup(
          new_backup.encrypted_data,
          new_backup.nonce,
          new_backup.salt,
          new_shares,
        );

        if (save_response.error || !save_response.data?.success) {
          set_error(
            save_response.error || t("settings.recovery_codes_save_failed"),
          );

          return;
        }
      } finally {
        clear_recovery_key(recovery_key);
      }

      set_codes(new_codes);
      set_step("show");
      on_saved();
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
      await navigator.clipboard.writeText(codes.join("\n"));
      show_toast(t("auth.recovery_codes_copied"), "success");
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
    }
  };

  const handle_download_pdf = async () => {
    try {
      await generate_recovery_pdf(user?.email ?? "", codes, t);
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
    }
  };

  const handle_download_text = async () => {
    try {
      await download_recovery_text(user?.email ?? "", codes, t);
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
    }
  };

  const handle_modal_close = useCallback(() => {
    if (working_ref.current) return;
    on_close();
  }, [on_close]);

  return (
    <Modal
      close_on_overlay={false}
      is_open={is_open}
      on_close={handle_modal_close}
      size="md"
    >
      {step === "verify" ? (
        <>
          <ModalHeader>
            <ModalTitle>
              {has_codes
                ? t("settings.recovery_codes_regenerate")
                : t("settings.recovery_codes_generate")}
            </ModalTitle>
            <ModalDescription>
              {has_codes
                ? t("settings.recovery_codes_regenerate_warning")
                : t("settings.recovery_codes_row_desc")}
            </ModalDescription>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div>
                <label
                  className="text-sm font-medium block mb-2 text-txt-primary"
                  htmlFor="codes-current-password"
                >
                  {t("settings.current_password")}
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
                  onKeyDown={(e) => e["key"] === "Enter" && handle_generate()}
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
                      set_totp_code(e.target.value.replace(/\D/g, "").slice(0, 6));
                      if (error) set_error("");
                    }}
                    onKeyDown={(e) => e["key"] === "Enter" && handle_generate()}
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
              variant="depth"
              onClick={handle_generate}
            >
              {is_working
                ? t("common.verifying")
                : has_codes
                  ? t("settings.recovery_codes_regenerate")
                  : t("settings.recovery_codes_generate")}
            </Button>
          </ModalFooter>
        </>
      ) : (
        <>
          <ModalHeader>
            <ModalTitle>{t("auth.save_recovery_codes")}</ModalTitle>
            <ModalDescription>
              {t("settings.recovery_codes_saved_confirm")}
            </ModalDescription>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div className="flex items-center justify-end">
                <div className="flex items-center gap-1">
                  <button
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
                    className="p-1.5 rounded transition-colors hover:opacity-80 text-txt-muted"
                    type="button"
                    onClick={handle_copy}
                  >
                    <ClipboardDocumentIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {codes.map((code, index) => (
                  <div
                    key={index}
                    className="rounded-lg px-3 py-2.5 border flex items-center gap-2 bg-surf-tertiary border-edge-secondary"
                  >
                    <span className="text-xs text-txt-muted w-5 text-right shrink-0">
                      {index + 1}.
                    </span>
                    <span
                      className="text-xs font-mono text-txt-primary break-all"
                      style={{
                        filter: are_codes_visible ? "none" : "blur(4px)",
                        transition: "filter 0.2s ease",
                        userSelect: are_codes_visible ? "text" : "none",
                      }}
                    >
                      {code}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex justify-center gap-2">
                <Button variant="secondary" onClick={handle_download_pdf}>
                  <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
                  {t("settings.download_pdf")}
                </Button>
                <Button variant="secondary" onClick={handle_download_text}>
                  <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
                  {t("auth.download_as_text")}
                </Button>
              </div>
              <label className="w-full flex items-start gap-2 cursor-pointer text-txt-tertiary">
                <input
                  checked={saved_checkbox}
                  className="mt-0.5 accent-current"
                  type="checkbox"
                  onChange={(e) => set_saved_checkbox(e.target.checked)}
                />
                <span className="text-sm leading-relaxed">
                  {t("settings.recovery_codes_saved_checkbox")}
                </span>
              </label>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              disabled={!saved_checkbox}
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
