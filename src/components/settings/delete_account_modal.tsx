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
import { useState } from "react";
import {
  TrashIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { use_auth } from "@/contexts/auth_context";
import { api_client } from "@/services/api/client";
import { get_user_salt } from "@/services/api/auth";
import {
  hash_email,
  derive_password_hash,
  base64_to_array,
} from "@/services/crypto/key_manager";
import { use_i18n } from "@/lib/i18n/context";

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
  const [show_password, set_show_password] = useState(false);
  const [is_deleting, set_is_deleting] = useState(false);
  const [error, set_error] = useState<string | null>(null);
  const [status, set_status] = useState<string | null>(null);

  const expected_text = t("common.delete_confirm_phrase");
  const is_confirmed =
    confirmation_text.toLowerCase() === expected_text && password.length > 0;

  const handle_delete = async () => {
    if (!is_confirmed || !user?.email) return;

    set_is_deleting(true);
    set_error(null);
    set_status(t("settings.verifying_credentials"));

    try {
      const user_hash = await hash_email(user.email);
      const salt_response = await get_user_salt({ user_hash });

      if (salt_response.error || !salt_response.data) {
        set_error(t("settings.failed_verify_credentials"));
        set_is_deleting(false);
        set_status(null);

        return;
      }

      const salt = base64_to_array(salt_response.data.salt);
      const { hash: password_hash } = await derive_password_hash(
        password,
        salt,
      );

      set_status(t("settings.deleting_account"));

      const response = await api_client.delete<{
        success: boolean;
        message?: string;
      }>("/core/v1/auth/me", { data: { password_hash } });

      if (response.data?.success || response.data?.message) {
        await logout_all();
        on_deleted();
      } else {
        set_error(response.error || t("settings.failed_delete_account"));
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      set_error(t("settings.error_deleting_account"));
    } finally {
      set_is_deleting(false);
      set_status(null);
    }
  };

  const handle_close = () => {
    if (is_deleting) return;
    set_confirmation_text("");
    set_password("");
    set_show_password(false);
    set_error(null);
    set_status(null);
    on_close();
  };

  return (
    <Modal
      close_on_overlay={!is_deleting}
      is_open={is_open}
      on_close={handle_close}
      size="md"
    >
      <ModalHeader className="pb-0">
        <div className="flex items-center gap-3">
          <TrashIcon className="w-6 h-6 text-red-500 flex-shrink-0" />
          <div>
            <h3 className="text-base font-semibold leading-tight text-txt-primary">
              {t("settings.delete_account_title")}
            </h3>
            <p className="text-[13px] mt-1 text-txt-tertiary">{user?.email}</p>
          </div>
        </div>
      </ModalHeader>

      <ModalBody>
        <div
          className="rounded-lg p-4 mb-4 border"
          style={{
            backgroundColor: "#dc2626",
            color: "#fff",
          }}
        >
          <div className="flex items-start gap-3">
            <ExclamationTriangleIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-1">
                {t("settings.delete_account_permanent")}
              </p>
              <p className="text-xs text-txt-secondary">
                {t("settings.delete_account_description")}
              </p>
            </div>
          </div>
        </div>

        <p className="text-sm mb-4 text-txt-secondary">
          {t("settings.type_delete_confirm")}{" "}
          <strong className="text-red-500">
            {t("common.delete_confirm_phrase")}
          </strong>
          :
        </p>

        <Input
          autoComplete="off"
          className="mb-3"
          disabled={is_deleting}
          placeholder={t("settings.type_to_confirm_placeholder")}
          type="text"
          value={confirmation_text}
          onChange={(e) => set_confirmation_text(e.target.value)}
        />

        <p className="text-sm mb-2 text-txt-secondary">
          {t("settings.enter_password_confirm")}
        </p>

        <div className="relative">
          <Input
            autoComplete="current-password"
            className="pr-10"
            disabled={is_deleting}
            placeholder={t("auth.password")}
            type={show_password ? "text" : "password"}
            value={password}
            onChange={(e) => set_password(e.target.value)}
            onKeyDown={(e) =>
              e["key"] === "Enter" && is_confirmed && handle_delete()
            }
          />
          <Button
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
            disabled={is_deleting}
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => set_show_password(!show_password)}
          >
            {show_password ? (
              <EyeSlashIcon className="w-4 h-4 text-txt-muted" />
            ) : (
              <EyeIcon className="w-4 h-4 text-txt-muted" />
            )}
          </Button>
        </div>

        {error && <p className="text-sm text-red-500 mt-4">{error}</p>}
        {status && !error && (
          <p className="text-sm mt-4 text-txt-tertiary">{status}</p>
        )}
      </ModalBody>

      <ModalFooter>
        <Button
          className="flex-1"
          disabled={is_deleting}
          size="xl"
          variant="outline"
          onClick={handle_close}
        >
          {t("common.cancel")}
        </Button>
        <Button
          className="flex-1"
          disabled={!is_confirmed || is_deleting}
          size="xl"
          variant="destructive"
          onClick={handle_delete}
        >
          {is_deleting ? (
            <>
              <Spinner size="md" />
              {t("settings.deleting_account")}
            </>
          ) : (
            t("settings.delete_account_title")
          )}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
