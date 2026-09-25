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
import { IslandSection } from "@aster/ui";

import {
  format_price,
  format_date,
  type BillingHistoryItem,
} from "@/services/api/billing";
import { use_i18n } from "@/lib/i18n/context";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import { describe_billing_entry } from "@/utils/billing_description";

interface BillingHistorySectionProps {
  history: BillingHistoryItem[];
  load_failed?: boolean;
  on_retry?: () => void;
}

const history_grid =
  "grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 md:grid-cols-[7.5rem_minmax(0,1fr)_6.5rem_5.5rem_2.5rem]";

function status_color(status: string): string {
  if (status === "paid") return "var(--color-success)";
  if (status === "failed") return "var(--color-danger)";

  return "var(--color-warning)";
}

export function BillingHistorySection({
  history,
  load_failed,
  on_retry,
}: BillingHistorySectionProps) {
  const { t } = use_i18n();

  if (history.length === 0 && !(load_failed && on_retry)) return null;

  return (
    <IslandSection
      bare={history.length === 0 && !!load_failed && !!on_retry}
      island_class_name="overflow-hidden"
      title={t("settings.billing_history")}
    >
      {history.length === 0 && load_failed && on_retry ? (
        <LoadFailedNotice on_retry={on_retry} />
      ) : (
        <>
          <div
            className={`${history_grid} hidden px-4 pb-1 pt-3 text-xs font-medium text-txt-muted md:grid`}
          >
            <span>{t("mail.date")}</span>
            <span>{t("common.description")}</span>
            <span>{t("settings.billing_amount")}</span>
            <span>{t("settings.status")}</span>
            <span className="sr-only">{t("settings.pdf")}</span>
          </div>
          <ul>
            {history.map((item) => (
              <li
                key={item.id}
                className={`${history_grid} min-h-14 items-center gap-y-0.5 px-4 py-2.5 text-sm`}
              >
                <span className="col-start-1 row-start-2 text-xs text-txt-muted md:col-start-auto md:row-start-auto md:text-sm md:text-txt-secondary">
                  {format_date(item.created_at)}
                </span>
                <span className="col-start-1 row-start-1 truncate text-txt-primary md:col-start-auto md:row-start-auto">
                  {describe_billing_entry(item.description, t) ||
                    item.plan_name ||
                    t("settings.payment")}
                </span>
                <span className="col-start-2 row-start-1 text-end font-medium text-txt-primary md:col-start-auto md:row-start-auto md:text-start">
                  {format_price(item.amount_cents, item.currency)}
                </span>
                <span
                  className="col-start-2 row-start-2 text-end text-xs font-medium md:col-start-auto md:row-start-auto md:text-start md:text-sm"
                  style={{ color: status_color(item.status) }}
                >
                  {t(`settings.invoice_status_${item.status}` as any)}
                </span>
                <span className="col-start-3 row-span-2 row-start-1 text-end md:col-start-auto md:row-span-1 md:row-start-auto">
                  {item.invoice_pdf_url && (
                    <a
                      className="text-xs text-txt-secondary underline-offset-2 hover:text-txt-primary hover:underline"
                      href={item.invoice_pdf_url}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {t("settings.pdf")}
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </IslandSection>
  );
}
