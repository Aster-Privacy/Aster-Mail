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

import { use_i18n } from "@/lib/i18n/context";
import { request_payment_method_update } from "@/lib/payment_action";

const BANNER_BG = "#dc2626";
const BANNER_TEXT = "#ffffff";

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
    <div
      className="w-full flex-shrink-0"
      role="alert"
      style={{ backgroundColor: BANNER_BG, color: BANNER_TEXT }}
    >
      <div className="flex items-center justify-between gap-4 px-4 py-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <ExclamationTriangleIcon className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="text-xs font-semibold truncate">{message}</span>
        </div>

        <button
          className="flex-shrink-0 rounded-[12px] px-2.5 py-0.5 text-xs font-semibold transition-colors"
          style={{ backgroundColor: "rgba(255, 255, 255, 0.22)" }}
          type="button"
          onClick={handle_action}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor =
              "rgba(255, 255, 255, 0.34)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor =
              "rgba(255, 255, 255, 0.22)")
          }
        >
          {t("common.payment_past_due_action")}
        </button>
      </div>
    </div>
  );
}
