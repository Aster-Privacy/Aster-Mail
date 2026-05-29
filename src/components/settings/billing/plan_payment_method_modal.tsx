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
import { CreditCardIcon, CurrencyDollarIcon } from "@heroicons/react/24/outline";

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
} from "@/components/ui/modal";
import { use_i18n } from "@/lib/i18n/context";

interface plan_payment_method_modal_props {
  open: boolean;
  plan_name: string;
  busy?: boolean;
  on_close: () => void;
  on_choose_card: () => void;
  on_choose_crypto: () => void;
}

export function PlanPaymentMethodModal({
  open,
  plan_name,
  busy = false,
  on_close,
  on_choose_card,
  on_choose_crypto,
}: plan_payment_method_modal_props) {
  const { t } = use_i18n();

  return (
    <Modal show_close_button is_open={open} on_close={on_close} size="md">
      <ModalHeader>
        <ModalTitle>{plan_name}</ModalTitle>
        <ModalDescription>{t("settings.checkout_description")}</ModalDescription>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-2">
          <button
            className="w-full flex items-center gap-3 rounded-[14px] border p-3.5 text-left transition-colors hover:opacity-80 disabled:opacity-50 disabled:pointer-events-none"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              borderColor: "var(--border-secondary)",
            }}
            disabled={busy}
            type="button"
            onClick={on_choose_card}
          >
            <CreditCardIcon
              className="w-5 h-5 flex-shrink-0"
              style={{ color: "var(--text-tertiary)" }}
            />
            <div
              className="text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              {t("settings.checkout_method_card")}
            </div>
          </button>

          <button
            className="w-full flex items-center gap-3 rounded-[14px] border p-3.5 text-left transition-colors hover:opacity-80 disabled:opacity-50 disabled:pointer-events-none"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              borderColor: "var(--border-secondary)",
            }}
            disabled={busy}
            type="button"
            onClick={on_choose_crypto}
          >
            <CurrencyDollarIcon
              className="w-5 h-5 flex-shrink-0"
              style={{ color: "var(--text-tertiary)" }}
            />
            <div
              className="text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              {t("settings.checkout_method_crypto")}
            </div>
          </button>
        </div>
      </ModalBody>
    </Modal>
  );
}
