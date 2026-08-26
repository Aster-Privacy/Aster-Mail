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
import {
  ClipboardDocumentIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";
import { trigger_download } from "@/utils/download_blob";
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
import { use_i18n } from "@/lib/i18n/context";
import { copy_text } from "@/utils/copy_text";

interface TotpBackupCodesModalProps {
  is_open: boolean;
  backup_codes: string[];
  on_done: () => void;
}

export function TotpBackupCodesModal({
  is_open,
  backup_codes,
  on_done,
}: TotpBackupCodesModalProps) {
  const { t } = use_i18n();

  const copy_single_code = async (code: string) => {
    if (await copy_text(code)) {
      show_toast(t("common.copied_to_clipboard"), "success");
    } else {
      show_toast(t("common.failed_to_copy"), "error");
    }
  };

  const copy_backup_codes = async () => {
    if (await copy_text(backup_codes.join("\n"))) {
      show_toast(t("common.copied_to_clipboard"), "success");
    } else {
      show_toast(t("common.failed_to_copy"), "error");
    }
  };

  return (
    <Modal
      close_on_escape={false}
      close_on_overlay={false}
      is_open={is_open}
      on_close={on_done}
      show_close_button={false}
      size="md"
    >
      <ModalHeader>
        <div className="flex items-center gap-3">
          <ShieldCheckIcon className="w-6 h-6 text-txt-primary flex-shrink-0" />
          <ModalTitle>{t("settings.two_factor_auth_enabled")}</ModalTitle>
        </div>
        <ModalDescription>
          {t("settings.save_backup_codes_description")}
        </ModalDescription>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <div className="p-4 rounded-lg border bg-surf-tertiary border-edge-secondary">
            <div className="grid grid-cols-2 gap-2">
              {backup_codes.map((code, index) => (
                <button
                  key={index}
                  className="px-3 py-2 text-sm font-mono text-center rounded cursor-pointer transition-colors hover:opacity-80 bg-surf-secondary text-txt-primary"
                  type="button"
                  onClick={() => copy_single_code(code)}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-center gap-2">
            <Button variant="secondary" onClick={copy_backup_codes}>
              <ClipboardDocumentIcon className="w-4 h-4 me-2" />
              {t("settings.copy_all_codes")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                trigger_download(
                  new Blob([backup_codes.join("\n")], { type: "text/plain" }),
                  "aster-backup-codes.txt",
                );
              }}
            >
              <ArrowDownTrayIcon className="w-4 h-4 me-2" />
              {t("common.download")}
            </Button>
          </div>
          <div
            className="flex items-center gap-2 p-3 rounded-lg"
            style={{
              backgroundColor: "var(--accent-color-hover)",
              color: "var(--accent-fg, #ffffff)",
            }}
          >
            <ExclamationTriangleIcon
              className="w-5 h-5 flex-shrink-0"
              style={{ color: "var(--accent-fg, #ffffff)" }}
            />
            <p className="text-xs" style={{ color: "#fff" }}>
              {t("settings.backup_code_security_note")}
            </p>
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="depth" onClick={on_done}>
          {t("common.done")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
