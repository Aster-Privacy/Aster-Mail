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
import { use_i18n } from "@/lib/i18n/context";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
} from "@/components/ui/modal";
import { DomainPurchaseFlow } from "./domain_purchase_flow";

interface DomainPurchaseModalProps {
  is_open: boolean;
  initial_order_id?: string | null;
  on_close: () => void;
  on_purchased: () => void;
}

export function DomainPurchaseModal({
  is_open,
  initial_order_id,
  on_close,
  on_purchased,
}: DomainPurchaseModalProps) {
  const { t } = use_i18n();

  if (!is_open) return null;

  return (
    <Modal close_on_overlay={false} is_open={is_open} on_close={on_close} size="2xl">
      <ModalHeader>
        <ModalTitle>{t("settings.domain_purchase_title")}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <DomainPurchaseFlow
          initial_order_id={initial_order_id}
          on_done={on_close}
          on_purchased={on_purchased}
        />
      </ModalBody>
    </Modal>
  );
}
