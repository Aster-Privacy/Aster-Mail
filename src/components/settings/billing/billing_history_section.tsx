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
import { ReceiptPercentIcon } from "@heroicons/react/24/outline";

import {
  format_price,
  format_date,
  type BillingHistoryItem,
} from "@/services/api/billing";
import { use_i18n } from "@/lib/i18n/context";

interface BillingHistorySectionProps {
  history: BillingHistoryItem[];
}

export function BillingHistorySection({ history }: BillingHistorySectionProps) {
  const { t } = use_i18n();

  if (history.length === 0) return null;

  return (
    <div className="border-t border-edge-secondary pt-8">
      <div className="mb-2">
        <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
          <ReceiptPercentIcon className="w-4 h-4 text-txt-primary flex-shrink-0" />
          {t("settings.billing_history")}
        </h3>
        <div className="mt-2 h-px bg-edge-secondary" />
      </div>
      <div className="rounded-lg border overflow-hidden border-edge-secondary">
        <div>
          {history.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between px-4 py-3 hover:bg-surf-hover transition-colors"
            >
              <div>
                <p className="text-sm text-txt-primary">
                  {(
                    item.description ||
                    item.plan_name ||
                    t("settings.payment")
                  ).replace(/\b\w/g, (c) => c.toUpperCase())}
                </p>
                <p className="text-xs mt-0.5 text-txt-muted">
                  {format_date(item.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded ${
                    item.status === "paid"
                      ? "bg-green-500/20 text-green-500"
                      : item.status === "failed"
                        ? "bg-red-500/20 text-red-500"
                        : "bg-yellow-500/20 text-yellow-500"
                  }`}
                >
                  {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                </span>
                <p className="text-sm font-medium text-txt-primary">
                  {format_price(item.amount_cents, item.currency)}
                </p>
                {item.invoice_pdf_url && (
                  <a
                    className="text-xs text-blue-500 hover:underline"
                    href={item.invoice_pdf_url}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    PDF
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
