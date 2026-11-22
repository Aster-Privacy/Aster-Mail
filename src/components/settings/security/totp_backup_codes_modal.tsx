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
import { Button } from "@aster/ui";

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { BackupCodesPanel } from "@/components/settings/security/backup_codes_panel";
import { use_i18n } from "@/lib/i18n/context";

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
        <ModalTitle>{t("settings.two_factor_auth_enabled")}</ModalTitle>
        <ModalDescription>
          {t("settings.save_backup_codes_description")}
        </ModalDescription>
        <ModalDescription>
          {t("settings.two_factor_other_devices_signed_out")}
        </ModalDescription>
      </ModalHeader>
      <ModalBody>
        <BackupCodesPanel backup_codes={backup_codes} />
      </ModalBody>
      <ModalFooter>
        <Button variant="depth" onClick={on_done}>
          {t("common.done")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
