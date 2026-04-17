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
import { useState, useRef, useEffect } from "react";
import {
  ExclamationTriangleIcon,
  EyeIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { disable_totp } from "@/services/api/totp";
import { get_user_salt } from "@/services/api/auth";
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import {
  hash_email,
  derive_password_hash,
  base64_to_array,
} from "@/services/crypto/key_manager";

interface TotpDisableModalProps {
  is_open: boolean;
  on_close: () => void;
  on_success: () => void;
}

export function TotpDisableModal({
  is_open,
  on_close,
  on_success,
}: TotpDisableModalProps) {
  const { t } = use_i18n();
  const { user } = use_auth();
  const [code, set_code] = useState("");
  const [password, set_password] = useState("");
  const [show_password, set_show_password] = useState(false);
  const [is_loading, set_is_loading] = useState(false);
  const [error, set_error] = useState("");
  const input_refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (is_open) {
      set_code("");
      set_password("");
      set_error("");
      setTimeout(() => input_refs.current[0]?.focus(), 100);
    }
  }, [is_open]);

  const handle_code_input = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const new_code = code.split("");

    new_code[index] = value.slice(-1);
    const updated_code = new_code.join("").slice(0, 6);

    set_code(updated_code);

    if (value && index < 5) {
      input_refs.current[index + 1]?.focus();
    }
  };

  const handle_key_down = (index: number, e: React.KeyboardEvent) => {
    if (e["key"] === "Backspace" && !code[index] && index > 0) {
      input_refs.current[index - 1]?.focus();
    }
  };

  const handle_paste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);

    set_code(pasted);
    const focus_index = Math.min(pasted.length, 5);

    input_refs.current[focus_index]?.focus();
  };

  const handle_disable = async () => {
    if (code.length !== 6 || !password || !user?.email) return;

    set_is_loading(true);
    set_error("");

    try {
      const user_hash = await hash_email(user.email);
      const salt_response = await get_user_salt({ user_hash });

      if (salt_response.error || !salt_response.data) {
        set_error(salt_response.error || t("settings.failed_get_auth_data"));
        set_is_loading(false);

        return;
      }

      const salt = base64_to_array(salt_response.data.salt);
      const { hash: password_hash } = await derive_password_hash(
        password,
        salt,
      );

      const response = await disable_totp({
        code,
        password_hash,
      });

      if (response.error) {
        set_error(response.error);
        set_is_loading(false);

        return;
      }

      on_success();
      on_close();
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      set_error(t("common.failed_to_disable_2fa"));
    } finally {
      set_is_loading(false);
    }
  };

  return (
    <Modal is_open={is_open} on_close={on_close} size="md">
      <ModalHeader>
        <div className="flex items-center gap-3 mb-2">
          <ExclamationTriangleIcon className="w-5 h-5 text-red-500" />
          <ModalTitle>{t("settings.disable_two_factor_auth")}</ModalTitle>
        </div>
        <ModalDescription>
          {t("settings.disable_2fa_description")}
        </ModalDescription>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <div>
            <label
              className="text-sm font-medium block mb-2 text-txt-primary"
              htmlFor="totp-code-0"
            >
              {t("settings.authenticator_code")}
            </label>
            <div className="flex justify-center gap-2">
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <Input
                  key={index}
                  ref={(el) => {
                    input_refs.current[index] = el;
                  }}
                  className="w-10 h-12 text-center text-lg font-semibold"
                  disabled={is_loading}
                  id={index === 0 ? "totp-code-0" : undefined}
                  inputMode="numeric"
                  maxLength={1}
                  status={error ? "error" : "default"}
                  type="text"
                  value={code[index] || ""}
                  onChange={(e) => handle_code_input(index, e.target.value)}
                  onKeyDown={(e) => handle_key_down(index, e)}
                  onPaste={handle_paste}
                />
              ))}
            </div>
          </div>

          <div>
            <label
              className="text-sm font-medium block mb-2 text-txt-primary"
              htmlFor="disable-password"
            >
              {t("settings.password")}
            </label>
            <div className="relative">
              <Input
                className="w-full pr-10"
                disabled={is_loading}
                id="disable-password"
                placeholder={t("settings.enter_your_password_placeholder")}
                status={error ? "error" : "default"}
                type={show_password ? "text" : "password"}
                value={password}
                onChange={(e) => set_password(e.target.value)}
              />
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-txt-muted"
                type="button"
                onClick={() => set_show_password(!show_password)}
              >
                {show_password ? (
                  <EyeSlashIcon className="w-4 h-4" />
                ) : (
                  <EyeIcon className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-center text-red-500">{error}</p>}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button disabled={is_loading} variant="outline" onClick={on_close}>
          {t("common.cancel")}
        </Button>
        <Button
          disabled={code.length !== 6 || !password || is_loading}
          variant="destructive"
          onClick={handle_disable}
        >
          {is_loading ? t("settings.disabling") : t("settings.disable_2fa")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
