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
import type { PaymentPastDueState } from "@/hooks/use_payment_past_due";

import { ExclamationTriangleIcon } from "@heroicons/react/24/solid";
import { StatusBanner } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { request_payment_method_update } from "@/lib/payment_action";

interface PaymentPastDueBannerProps {
  state: PaymentPastDueState;
}

export function PaymentPastDueBanner({
  state,
}: PaymentPastDueBannerProps): JSX.Element | null {
  const { t } = use_i18n();

  const handle_action = () => {
    window.dispatchEvent(
      new CustomEvent("navigate-settings", { detail: "billing" }),
    );
    request_payment_method_update();
  };

  if (!state.is_past_due) return null;

  const message =
    state.days_left !== null && state.days_left > 1
      ? t("common.payment_past_due_message_days", { days: state.days_left })
      : t("common.payment_past_due_message");

  return (
    <StatusBanner
      actions={[
        { label: t("common.payment_past_due_action"), on_click: handle_action },
      ]}
      animated={false}
      icon={ExclamationTriangleIcon}
      message={message}
      role="alert"
      tone="danger"
      variant="alert"
    />
  );
}
