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
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { show_toast } from "@/components/toast/simple_toast";
import {
  normalize_smtp_token_name,
  rename_smtp_token,
  SMTP_TOKEN_NAME_MAX_LENGTH,
  type SmtpToken,
} from "@/services/api/smtp_tokens";
import { use_i18n } from "@/lib/i18n/context";
import { is_composing } from "@/utils/ime";

interface SmtpTokenRenameModalProps {
  token: SmtpToken | null;
  on_close: () => void;
  on_renamed: (token_id: string, name: string) => void;
}

export function SmtpTokenRenameModal({
  token,
  on_close,
  on_renamed,
}: SmtpTokenRenameModalProps) {
  const { t } = use_i18n();
  const [name, set_name] = useState("");
  const [is_saving, set_is_saving] = useState(false);
  const [error, set_error] = useState("");
  const active_id_ref = useRef<string | null>(null);
  const token_id = token?.id ?? null;
  const token_name = token?.name ?? "";

  useEffect(() => {
    active_id_ref.current = token_id;
    set_name(token_name);
    set_is_saving(false);
    set_error("");
  }, [token_id, token_name]);

  const normalized = normalize_smtp_token_name(name);
  const is_unchanged = normalized !== null && normalized === token_name;
  const can_save = normalized !== null && !is_unchanged && !is_saving;

  const handle_save = async () => {
    if (!token_id || is_saving) return;

    if (normalized === null) {
      set_error(t("settings.smtp_token_rename_invalid"));

      return;
    }

    if (is_unchanged) {
      on_close();

      return;
    }

    set_is_saving(true);
    set_error("");

    const result = await rename_smtp_token(token_id, normalized);

    if (active_id_ref.current !== token_id) return;

    set_is_saving(false);

    if (result.name !== undefined) {
      on_renamed(token_id, result.name);
      show_toast(t("settings.smtp_token_renamed_toast"), "success");
      on_close();

      return;
    }

    if (result.failure === "invalid_name") {
      set_error(t("settings.smtp_token_rename_invalid"));
    } else if (result.failure === "unavailable") {
      set_error(t("settings.smtp_token_rename_unavailable"));
    } else {
      set_error(t("settings.smtp_token_rename_failed"));
    }
  };

  return (
    <Modal
      close_on_overlay={!is_saving}
      is_open={token !== null}
      on_close={on_close}
      size="md"
    >
      <ModalHeader>
        <ModalTitle>{t("settings.smtp_token_rename_title")}</ModalTitle>
        <ModalDescription>
          {t("settings.smtp_token_rename_description")}
        </ModalDescription>
      </ModalHeader>
      <ModalBody className="space-y-2">
        <label
          className="block text-sm font-medium text-txt-primary"
          htmlFor="smtp-token-rename"
        >
          {t("settings.smtp_token_name_label")}
        </label>
        <Input
          aria-describedby={error ? "smtp-token-rename-error" : undefined}
          aria-invalid={error ? true : undefined}
          autoFocus={true}
          disabled={is_saving}
          id="smtp-token-rename"
          maxLength={SMTP_TOKEN_NAME_MAX_LENGTH}
          placeholder={t("settings.smtp_token_name_placeholder")}
          status={error ? "error" : "default"}
          value={name}
          onChange={(e) => {
            set_name(e.target.value);
            set_error("");
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || is_composing(e)) return;
            e.preventDefault();
            handle_save();
          }}
        />
        {error && (
          <p
            className="text-sm text-red-500"
            id="smtp-token-rename-error"
            role="alert"
          >
            {error}
          </p>
        )}
      </ModalBody>
      <ModalFooter>
        <Button disabled={is_saving} variant="outline" onClick={on_close}>
          {t("common.cancel")}
        </Button>
        <Button
          disabled={!can_save}
          is_loading={is_saving}
          variant="depth"
          onClick={handle_save}
        >
          {t("common.save")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
