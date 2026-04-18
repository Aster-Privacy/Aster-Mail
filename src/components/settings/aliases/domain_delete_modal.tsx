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
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";

interface DomainDeleteModalProps {
  is_open: boolean;
  domain_name: string;
  on_cancel: () => void;
  on_confirm: () => void;
}

export function DomainDeleteModal({
  is_open,
  domain_name,
  on_cancel,
  on_confirm,
}: DomainDeleteModalProps) {
  const { t } = use_i18n();

  return (
    <Modal is_open={is_open} on_close={on_cancel} size="md">
      <ModalHeader>
        <ModalTitle>{t("common.delete_domain")}</ModalTitle>
      </ModalHeader>

      <ModalBody>
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-red-600">
            <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 text-white mt-0.5" />
            <div>
              <p className="text-sm font-medium text-white">
                {domain_name}
              </p>
              <p className="text-sm mt-1 text-red-100">
                {t("settings.delete_domain_warning")}
              </p>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-surf-tertiary border border-edge-secondary">
            <p className="text-sm text-txt-secondary">
              {t("settings.delete_domain_cooldown")}
            </p>
          </div>
        </div>
      </ModalBody>

      <ModalFooter>
        <Button variant="ghost" onClick={on_cancel}>
          {t("common.cancel")}
        </Button>
        <Button variant="destructive" onClick={on_confirm}>
          {t("common.delete")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
