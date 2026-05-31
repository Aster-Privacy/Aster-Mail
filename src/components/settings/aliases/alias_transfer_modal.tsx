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
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { show_toast } from "@/components/toast/simple_toast";
import { transfer_alias } from "@/services/api/alias_transfer";

interface AliasTransferModalProps {
  alias_id: string;
  alias_address: string;
  is_open: boolean;
  on_close: () => void;
  on_transferred: () => void;
}

export function AliasTransferModal({
  alias_id,
  alias_address,
  is_open,
  on_close,
  on_transferred,
}: AliasTransferModalProps) {
  const { t } = use_i18n();
  const [recipient_email, set_recipient_email] = useState("");
  const [transferring, set_transferring] = useState(false);
  const [error, set_error] = useState<string | null>(null);

  const handle_close = () => {
    if (transferring) return;
    set_recipient_email("");
    set_error(null);
    on_close();
  };

  const handle_transfer = async () => {
    if (!recipient_email.trim()) return;
    set_transferring(true);
    set_error(null);
    try {
      const response = await transfer_alias(alias_id, recipient_email.trim());
      if (response.error) {
        set_error(response.error);
      } else {
        show_toast(t("settings.alias_transfer_success"), "success");
        set_recipient_email("");
        on_transferred();
        on_close();
      }
    } catch (err) {
      set_error(err instanceof Error ? err.message : t("common.something_went_wrong"));
    } finally {
      set_transferring(false);
    }
  };

  const can_submit = !transferring && !!recipient_email.trim();

  return (
    <Modal is_open={is_open} close_on_overlay={!transferring} on_close={handle_close} size="md">
      <ModalHeader>
        <ModalTitle>{t("settings.alias_transfer_title")}</ModalTitle>
        <ModalDescription>{alias_address}</ModalDescription>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <div className="flex items-start gap-3 px-3 py-3 rounded-lg bg-amber-500 text-white">
            <ExclamationTriangleIcon className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="text-sm font-medium">
              {t("settings.alias_transfer_warning")}
            </p>
          </div>
          <div>
            <label
              className="block mb-2 text-sm font-medium text-txt-primary"
              htmlFor="transfer-recipient"
            >
              {t("settings.alias_transfer_recipient_label")}
            </label>
            <input
              autoFocus
              className="w-full h-10 px-3 rounded-lg bg-transparent border border-edge-secondary text-sm text-txt-primary placeholder:text-txt-muted outline-none focus:border-blue-500"
              id="transfer-recipient"
              placeholder={t("settings.alias_transfer_recipient_placeholder")}
              type="email"
              value={recipient_email}
              onChange={(e) => set_recipient_email(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && can_submit) handle_transfer();
              }}
            />
          </div>
          {error && (
            <div className="px-3 py-2.5 rounded-lg text-sm bg-red-500/[0.08] border border-red-500/20 text-red-500">
              {error}
            </div>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button disabled={transferring} variant="ghost" onClick={handle_close}>
          {t("common.cancel")}
        </Button>
        <Button
          className="bg-red-500 hover:bg-red-600 text-white border-red-500"
          disabled={!can_submit}
          variant="depth"
          onClick={handle_transfer}
        >
          {transferring ? t("common.processing") : t("settings.alias_transfer_confirm")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
