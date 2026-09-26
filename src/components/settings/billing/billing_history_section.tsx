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
import { Fragment, useState } from "react";
import { DocumentTextIcon } from "@heroicons/react/24/outline";
import { Island, IslandDivider, IslandRow, IslandSection } from "@aster/ui";

import {
  format_price,
  format_date,
  type BillingHistoryItem,
} from "@/services/api/billing";
import { use_i18n } from "@/lib/i18n/context";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import {
  BillingMoreRow,
  billing_row_icon,
} from "@/components/settings/billing/billing_more_section";
import { describe_billing_entry } from "@/utils/billing_description";

interface BillingHistorySectionProps {
  history: BillingHistoryItem[];
  load_failed?: boolean;
  on_retry?: () => void;
  embedded?: boolean;
}

function status_color(status: string): string {
  if (status === "paid") return "var(--color-success)";
  if (status === "failed" || status === "void") return "var(--color-danger)";

  return "var(--color-warning)";
}

function year_of(item: BillingHistoryItem): string {
  const year = new Date(item.created_at).getFullYear();

  return Number.isNaN(year) ? "" : String(year);
}

export function BillingHistorySection({
  history,
  load_failed,
  on_retry,
  embedded = false,
}: BillingHistorySectionProps) {
  const { t } = use_i18n();
  const [open, set_open] = useState(false);

  if (!embedded && history.length === 0 && !(load_failed && on_retry)) {
    return null;
  }

  const years = Array.from(new Set(history.map(year_of)));
  const show_years = years.length > 1;
  const groups = show_years
    ? years.map((year) => ({
        year,
        items: history.filter((item) => year_of(item) === year),
      }))
    : [{ year: "", items: history }];

  const rows_of = (items: BillingHistoryItem[]) =>
    items.map((item, index) => (
      <Fragment key={item.id}>
        {index > 0 && <IslandDivider />}
        <li>
          <IslandRow
            description={format_date(item.created_at)}
            href={item.invoice_pdf_url || undefined}
            label={
              describe_billing_entry(item.description, t) ||
              item.plan_name ||
              t("settings.payment")
            }
            rel="noopener noreferrer"
            target={item.invoice_pdf_url ? "_blank" : undefined}
            value={
              <span className="flex flex-col items-end gap-0.5">
                <span className="text-[15px] font-semibold tabular-nums text-txt-primary">
                  {format_price(item.amount_cents, item.currency)}
                </span>
                <span
                  className="text-[12px] font-medium"
                  style={{ color: status_color(item.status) }}
                >
                  {t(`settings.invoice_status_${item.status}` as any)}
                </span>
              </span>
            }
          />
        </li>
      </Fragment>
    ));

  if (embedded) {
    const has_items = history.length > 0;
    const can_open = has_items || (load_failed && !!on_retry);

    return (
      <BillingMoreRow
        flush
        description={
          has_items
            ? t("settings.billing_invoice_count", { count: history.length })
            : t("settings.billing_history_empty")
        }
        icon={billing_row_icon(DocumentTextIcon)}
        label={t("settings.billing_history")}
        on_toggle={can_open ? () => set_open((value) => !value) : undefined}
        open={open}
      >
        {!has_items && load_failed && on_retry ? (
          <div className="px-4 pb-4 pt-3">
            <LoadFailedNotice on_retry={on_retry} />
          </div>
        ) : (
          groups.map((group, group_index) => (
            <Fragment key={group.year || "all"}>
              {group_index > 0 && <IslandDivider />}
              {show_years && (
                <p className="px-4 pb-1 pt-3 text-[12px] font-semibold uppercase tracking-wide text-txt-muted">
                  {group.year}
                </p>
              )}
              <ul>{rows_of(group.items)}</ul>
            </Fragment>
          ))
        )}
      </BillingMoreRow>
    );
  }

  return (
    <IslandSection bare title={t("settings.billing_history")}>
      {history.length === 0 && load_failed && on_retry ? (
        <LoadFailedNotice on_retry={on_retry} />
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((group) => (
            <div key={group.year || "all"} className="flex flex-col gap-1.5">
              {show_years && (
                <p className="px-1 text-[12px] font-semibold uppercase tracking-wide text-txt-muted">
                  {group.year}
                </p>
              )}
              <Island className="overflow-hidden" padding="none">
                <ul>{rows_of(group.items)}</ul>
              </Island>
            </div>
          ))}
        </div>
      )}
    </IslandSection>
  );
}
