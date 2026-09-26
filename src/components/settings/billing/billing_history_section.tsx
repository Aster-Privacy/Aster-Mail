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
  BILLING_CARD_CLASS,
  BillingHistorySkeleton,
} from "@/components/settings/billing/billing_skeleton";
import {
  format_price,
  format_date,
  type BillingHistoryItem,
  type CreditTransactionItem,
} from "@/services/api/billing";
import { use_i18n } from "@/lib/i18n/context";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import {
  describe_billing_entry,
  describe_credit_entry,
} from "@/utils/billing_description";

interface BillingHistorySectionProps {
  history: BillingHistoryItem[];
  credit_transactions?: CreditTransactionItem[];
  is_loading?: boolean;
  load_failed?: boolean;
  on_retry?: () => void;
}

export function BillingHistorySection({
  history,
  credit_transactions = [],
  is_loading = false,
  load_failed,
  on_retry,
}: BillingHistorySectionProps) {
  const { t } = use_i18n();
  const show_history = history.length > 0 || (is_loading && !load_failed);
  const show_failed = history.length === 0 && !!load_failed && !!on_retry;

  if (!show_history && !show_failed && credit_transactions.length === 0)
    return null;

  return (
    <div className="space-y-6">
      {(show_history || show_failed) && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-txt-primary">
            {t("settings.bill_history")}
          </h3>
          {show_failed ? (
            <LoadFailedNotice on_retry={on_retry!} />
          ) : history.length === 0 ? (
            <BillingHistorySkeleton rows={3} />
          ) : (
            <div className={`${BILLING_CARD_CLASS} py-1`}>
              {history.map((item) => (
                <div
                  key={item.id}
                  className="flex min-h-[54px] items-center justify-between gap-3 px-4 py-2 transition-colors hover:bg-surf-hover"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-txt-primary">
                      {describe_billing_entry(item.description, t) ||
                        item.plan_name ||
                        t("settings.payment")}
                    </p>
                    <p className="text-[13px] text-txt-muted">
                      {format_date(item.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-3">
                    <span
                      className="text-xs font-semibold"
                      style={{
                        color:
                          item.status === "paid"
                            ? "var(--color-success)"
                            : item.status === "failed"
                              ? "var(--color-danger)"
                              : "var(--color-warning)",
                      }}
                    >
                      {t(`settings.invoice_status_${item.status}` as any)}
                    </span>
                    <p className="text-sm font-semibold text-txt-primary">
                      {format_price(item.amount_cents, item.currency)}
                    </p>
                    {item.invoice_pdf_url && (
                      <a
                        className="text-xs font-semibold hover:underline"
                        href={item.invoice_pdf_url}
                        rel="noopener noreferrer"
                        style={{ color: "var(--accent-blue)" }}
                        target="_blank"
                      >
                        PDF
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {credit_transactions.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-txt-primary">
            {t("settings.bill_recent_transactions")}
          </h3>
          <div className={`${BILLING_CARD_CLASS} py-1`}>
            {credit_transactions.map((entry) => (
              <div
                key={entry.id}
                className="flex min-h-[54px] items-center justify-between gap-3 px-4 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-txt-primary">
                    {describe_credit_entry(entry.description, t)}
                  </p>
                  <p className="text-[13px] text-txt-muted">
                    {format_date(entry.created_at)}
                  </p>
                </div>
                <p
                  className="flex-shrink-0 text-sm font-semibold"
                  style={{
                    color:
                      entry.amount_cents >= 0
                        ? "var(--color-success)"
                        : "var(--text-primary)",
                  }}
                >
                  {entry.amount_cents >= 0 ? "+" : ""}
                  {format_price(entry.amount_cents)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
