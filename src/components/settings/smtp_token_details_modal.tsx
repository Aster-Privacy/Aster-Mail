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
import type { SmtpToken } from "@/services/api/smtp_tokens";

import {
  ClipboardDocumentIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
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
  build_smtp_connection_rows,
  smtp_settings_rows_to_text,
  SmtpTokenSettingsRows,
  type SmtpTokenSettingsRow,
} from "@/components/settings/smtp_token_settings_rows";
import { use_i18n } from "@/lib/i18n/context";
import { copy_text } from "@/utils/copy_text";

interface SmtpTokenDetailsModalProps {
  token: SmtpToken | null;
  on_close: () => void;
}

export function SmtpTokenDetailsModal({
  token,
  on_close,
}: SmtpTokenDetailsModalProps) {
  const { t } = use_i18n();
  const settings = token?.smtp_settings ?? null;

  const rows: SmtpTokenSettingsRow[] = settings
    ? [
        ...build_smtp_connection_rows(t, settings),
        {
          label: t("settings.smtp_token_password"),
          value: t("settings.smtp_token_password_hidden"),
          copyable: false,
        },
      ]
    : [];

  const copy_value = async (value: string) => {
    if (await copy_text(value)) {
      show_toast(t("common.copied_to_clipboard"), "success");
    } else {
      show_toast(t("common.failed_to_copy"), "error");
    }
  };

  return (
    <Modal
      is_open={token !== null && settings !== null}
      on_close={on_close}
      size="md"
    >
      <ModalHeader>
        <ModalTitle>{t("settings.smtp_token_details_title")}</ModalTitle>
        <ModalDescription>
          {t("settings.smtp_token_details_description")}
        </ModalDescription>
      </ModalHeader>
      <ModalBody className="space-y-4">
        {token && (
          <div className="min-w-0">
            <p
              className="text-sm font-medium text-txt-primary truncate"
              title={token.name}
            >
              {token.name}
            </p>
            <p
              className="text-xs text-txt-muted truncate"
              title={token.bound_address}
            >
              {token.bound_address}
            </p>
          </div>
        )}
        <SmtpTokenSettingsRows rows={rows} on_copy={copy_value} />
        <Button
          className="w-full"
          size="lg"
          variant="secondary"
          onClick={() => copy_value(smtp_settings_rows_to_text(rows))}
        >
          <ClipboardDocumentIcon className="w-4 h-4 me-2" />
          {t("settings.smtp_token_copy_all")}
        </Button>
        <div className="flex items-start gap-2.5 rounded-xl border border-edge-secondary p-3.5">
          <LockClosedIcon className="w-4 h-4 flex-shrink-0 text-txt-muted mt-0.5" />
          <p className="text-xs text-txt-muted leading-relaxed">
            {t("settings.smtp_token_password_hidden_note")}
          </p>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="depth" onClick={on_close}>
          {t("common.done")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
