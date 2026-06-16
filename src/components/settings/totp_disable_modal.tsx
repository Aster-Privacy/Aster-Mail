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
  const input_ref = useRef<HTMLInputElement>(null);
  const verifying_ref = useRef(false);

  useEffect(() => {
    if (is_open) {
      set_code("");
      set_password("");
      set_error("");
      setTimeout(() => input_ref.current?.focus(), 100);
    }
  }, [is_open]);

  const handle_code_change = (value: string) => {
    set_code(value.replace(/\D/g, "").slice(0, 6));
    if (error) set_error("");
  };

  const handle_disable = async () => {
    if (
      code.length !== 6 ||
      !password ||
      !user?.email ||
      verifying_ref.current
    )
      return;

    verifying_ref.current = true;
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

      show_toast(t("settings.two_factor_auth_disabled"), "success");
      on_success();
      on_close();
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      set_error(t("common.failed_to_disable_2fa"));
      show_toast(t("common.failed_to_disable_2fa"), "error");
    } finally {
      verifying_ref.current = false;
      set_is_loading(false);
    }
  };

  return (
    <Modal is_open={is_open} on_close={on_close} size="md">
      <ModalHeader>
        <div className="flex items-center gap-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-red-500 flex-shrink-0" />
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
            <Input
              ref={input_ref}
              autoComplete="one-time-code"
              className="text-center text-2xl font-semibold tracking-[0.5em]"
              disabled={is_loading}
              id="totp-code-0"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              status={error ? "error" : "default"}
              type="text"
              value={code}
              onChange={(e) => handle_code_change(e.target.value)}
              onKeyDown={(e) => e["key"] === "Enter" && handle_disable()}
            />
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
