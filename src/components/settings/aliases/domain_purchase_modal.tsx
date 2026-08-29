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
import { DomainPurchaseFlow } from "./domain_purchase_flow";

import { use_i18n } from "@/lib/i18n/context";
import { InfoPopover } from "@/components/ui/info_popover";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
} from "@/components/ui/modal";

interface DomainPurchaseModalProps {
  is_open: boolean;
  initial_order_id?: string | null;
  initial_query?: string | null;
  on_close: () => void;
  on_purchased: () => void;
  on_create_address?: () => void;
}

export function DomainPurchaseModal({
  is_open,
  initial_order_id,
  initial_query,
  on_close,
  on_purchased,
  on_create_address,
}: DomainPurchaseModalProps) {
  const { t } = use_i18n();

  if (!is_open) return null;

  return (
    <Modal
      close_on_overlay={false}
      is_open={is_open}
      on_close={on_close}
      size="2xl"
    >
      <ModalHeader>
        <ModalTitle>
          <span className="flex items-center gap-2">
            {t("settings.domain_purchase_title")}
            <InfoPopover
              description={t("settings.domain_purchase_purchased_info")}
              title={t("settings.domain_purchase_title")}
            />
          </span>
        </ModalTitle>
      </ModalHeader>
      <ModalBody>
        <DomainPurchaseFlow
          initial_order_id={initial_order_id}
          initial_query={initial_query}
          on_create_address={on_create_address}
          on_done={on_close}
          on_purchased={on_purchased}
        />
      </ModalBody>
    </Modal>
  );
}
