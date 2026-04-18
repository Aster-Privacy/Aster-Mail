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
import { useState, useEffect } from "react";
import { Button } from "@aster/ui";

import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import { api_client } from "@/services/api/client";
import { get_user_salt } from "@/services/api/auth";
import { get_totp_status } from "@/services/api/totp";
import {
  hash_email,
  derive_password_hash,
  base64_to_array,
} from "@/services/crypto/key_manager";

interface DeleteAccountModalProps {
  is_open: boolean;
  on_close: () => void;
  on_deleted: () => void;
}

export function DeleteAccountModal({
  is_open,
  on_close,
  on_deleted,
}: DeleteAccountModalProps) {
  const { t } = use_i18n();
  const { user, logout_all } = use_auth();
  const [confirmation_text, set_confirmation_text] = useState("");
  const [password, set_password] = useState("");
  const [totp_code, set_totp_code] = useState("");
  const [two_factor_enabled, set_two_factor_enabled] = useState(false);
  const [is_deleting, set_is_deleting] = useState(false);
  const [error, set_error] = useState<string | null>(null);

  const is_delete_typed = confirmation_text.toUpperCase() === "DELETE";
  const can_submit =
    is_delete_typed &&
    password.length > 0 &&
    (!two_factor_enabled || totp_code.length > 0);

  useEffect(() => {
    if (!is_open) {
      set_confirmation_text("");
      set_password("");
      set_totp_code("");
      set_is_deleting(false);
      set_error(null);

      return;
    }

    const check_totp = async () => {
      try {
        const status = await get_totp_status();

        set_two_factor_enabled(status.data?.enabled ?? false);
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);
        set_two_factor_enabled(false);
      }
    };

    check_totp();
  }, [is_open]);

  const handle_delete_account = async () => {
    if (!can_submit || !user?.email || is_deleting) return;

    set_is_deleting(true);
    set_error(null);

    try {
      const user_hash = await hash_email(user.email);
      const salt_response = await get_user_salt({ user_hash });

      if (salt_response.error || !salt_response.data) {
        set_error(t("common.fill_required_fields"));
        set_is_deleting(false);

        return;
      }

      const salt = base64_to_array(salt_response.data.salt);
      const { hash: password_hash } = await derive_password_hash(
        password,
        salt,
      );

      const response = await api_client.delete<{
        success: boolean;
        message?: string;
      }>("/core/v1/auth/me", {
        data: {
          password_hash,
          totp_code: two_factor_enabled ? totp_code : undefined,
        },
      });

      if (response.data?.success || response.data?.message) {
        await logout_all();
        on_deleted();
      } else {
        if (response.code === "UNAUTHORIZED") {
          set_error(t("settings.incorrect_password_error"));
        } else if (response.code === "VALIDATION_ERROR") {
          set_error(t("settings.invalid_2fa_code"));
        } else {
          set_error(response.error || t("common.failed_to_delete_account"));
        }
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      set_error(t("common.delete_account_error"));
    } finally {
      set_is_deleting(false);
    }
  };

  const handle_close = () => {
    if (!is_deleting) {
      on_close();
    }
  };

  return (
    <Modal
      close_on_overlay={!is_deleting}
      is_open={is_open}
      on_close={handle_close}
      show_close_button={!is_deleting}
      size="md"
    >
      <ModalHeader>
        <ModalTitle>{t("settings.delete_your_account")}</ModalTitle>
      </ModalHeader>

      <ModalBody>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label
              className="text-[13px] font-medium"
              htmlFor="delete-password"
              style={{ color: "var(--text-secondary)" }}
            >
              {t("settings.password_label")}
            </label>
            <Input
              autoComplete="current-password"
              disabled={is_deleting}
              id="delete-password"
              placeholder={t("settings.enter_your_password_placeholder")}
              size="lg"
              type="password"
              value={password}
              onChange={(e) => set_password(e.target.value)}
            />
          </div>

          {two_factor_enabled && (
            <div className="space-y-1.5">
              <label
                className="text-[13px] font-medium"
                htmlFor="delete-totp"
                style={{ color: "var(--text-secondary)" }}
              >
                {t("settings.two_factor_code_label")}
              </label>
              <Input
                autoComplete="one-time-code"
                disabled={is_deleting}
                id="delete-totp"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                size="lg"
                value={totp_code}
                onChange={(e) =>
                  set_totp_code(e.target.value.replace(/\D/g, ""))
                }
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label
              className="text-[13px] font-medium"
              htmlFor="delete-confirmation"
              style={{ color: "var(--text-secondary)" }}
            >
              {t("settings.type_delete_to_confirm")}
            </label>
            <Input
              autoComplete="off"
              disabled={is_deleting}
              id="delete-confirmation"
              placeholder={t("settings.type_delete_placeholder")}
              size="lg"
              spellCheck={false}
              value={confirmation_text}
              onChange={(e) => set_confirmation_text(e.target.value)}
              onKeyDown={(e) => {
                if (e["key"] === "Enter" && can_submit) {
                  handle_delete_account();
                }
              }}
            />
          </div>

          {error && (
            <p className="text-[13px]" style={{ color: "var(--color-danger)" }}>
              {error}
            </p>
          )}
        </div>
      </ModalBody>

      <ModalFooter>
        <Button
          className="h-10 px-5 text-[14px] font-normal"
          disabled={is_deleting}
          variant="ghost"
          onClick={handle_close}
        >
          {t("common.cancel")}
        </Button>
        <Button
          className="h-10 px-5 text-[14px] font-normal"
          disabled={!can_submit || is_deleting}
          variant="destructive"
          onClick={handle_delete_account}
        >
          {is_deleting ? (
            <span className="flex items-center gap-2">
              <Spinner size="md" />
              {t("settings.deleting_label")}
            </span>
          ) : (
            t("settings.delete_account_button")
          )}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
