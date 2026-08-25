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
import type { ExtractedPurchaseDetails } from "@/services/extraction/types";

import { useState } from "react";
import {
  ShoppingBagIcon,
  ChevronDownIcon,
  HandThumbUpIcon,
  HandThumbDownIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { Tooltip } from "@aster/ui";

import { cn } from "@/lib/utils";
import { use_i18n } from "@/lib/i18n/context";
import { submit_receipt_feedback } from "@/services/api/mail";

const COLLAPSED_PREF_KEY = "receipt_banner_collapsed";
const FEEDBACK_KEY_PREFIX = "receipt_feedback_";

function read_collapsed_pref(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_PREF_KEY) === "1";
  } catch {
    return false;
  }
}

function write_collapsed_pref(collapsed: boolean) {
  try {
    localStorage.setItem(COLLAPSED_PREF_KEY, collapsed ? "1" : "0");
  } catch {
    return;
  }
}

function read_voted(email_id: string | undefined): boolean {
  if (!email_id) return false;
  try {
    return localStorage.getItem(`${FEEDBACK_KEY_PREFIX}${email_id}`) !== null;
  } catch {
    return false;
  }
}

function write_voted(email_id: string | undefined, is_correct: boolean) {
  if (!email_id) return;
  try {
    localStorage.setItem(
      `${FEEDBACK_KEY_PREFIX}${email_id}`,
      is_correct ? "up" : "down",
    );
  } catch {
    return;
  }
}

interface PurchaseDetailsBannerProps {
  details: ExtractedPurchaseDetails;
  email_id?: string;
  className?: string;
}

export function PurchaseDetailsBanner({
  details,
  email_id,
  className,
}: PurchaseDetailsBannerProps) {
  const { t } = use_i18n();
  const [is_collapsed, set_is_collapsed] = useState(read_collapsed_pref);
  const [has_voted, set_has_voted] = useState(() => read_voted(email_id));
  const [voted_email_id, set_voted_email_id] = useState(email_id);

  if (voted_email_id !== email_id) {
    set_voted_email_id(email_id);
    set_has_voted(read_voted(email_id));
  }

  const clean_items = details.items.filter(
    (item) => item.name && item.name.trim().length > 0,
  );

  const has_meaningful_data =
    details.order_id ||
    details.total ||
    clean_items.length > 0 ||
    details.merchant_name;

  if (!has_meaningful_data) {
    return null;
  }

  const toggle_collapsed = () => {
    set_is_collapsed((prev) => {
      write_collapsed_pref(!prev);

      return !prev;
    });
  };

  const handle_feedback = (is_correct: boolean) => {
    set_has_voted(true);
    write_voted(email_id, is_correct);
    void submit_receipt_feedback(is_correct).catch(() => undefined);
  };

  const amount_rows: { label: string; amount: string; accent?: boolean }[] = [];

  if (details.subtotal) {
    amount_rows.push({
      label: t("common.subtotal"),
      amount: details.subtotal.formatted,
    });
  }
  if (details.shipping_cost) {
    amount_rows.push({
      label: t("common.shipping"),
      amount: details.shipping_cost.formatted,
    });
  }
  if (details.tax) {
    amount_rows.push({
      label: t("common.tax"),
      amount: details.tax.formatted,
    });
  }
  if (details.discount) {
    amount_rows.push({
      label: t("common.discount"),
      amount: `-${details.discount.formatted}`,
      accent: true,
    });
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-edge-primary overflow-hidden bg-surf-secondary",
        className,
      )}
    >
      <button
        aria-expanded={!is_collapsed}
        className="w-full flex items-center gap-3 px-4 py-3 text-start hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors"
        type="button"
        onClick={toggle_collapsed}
      >
        <ShoppingBagIcon
          aria-hidden="true"
          className="w-6 h-6 shrink-0 text-emerald-600 dark:text-emerald-400"
          strokeWidth={1.75}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-txt-primary truncate">
            {t("mail.purchase_receipt")}
          </div>
          <div className="text-xs text-txt-muted truncate">
            {[
              details.merchant_name,
              details.order_id
                ? t("mail.order_number", { id: details.order_id })
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        {details.total && (
          <span className="text-sm font-semibold tabular-nums text-txt-primary shrink-0">
            {details.total.formatted}
          </span>
        )}
        <ChevronDownIcon
          aria-hidden="true"
          className={cn(
            "w-4 h-4 shrink-0 text-txt-muted transition-transform",
            !is_collapsed && "rotate-180",
          )}
        />
      </button>

      {!is_collapsed && (
        <div className="px-4 pb-4 border-t border-edge-secondary">
          {details.merchant_name && (
            <div className="pt-3 text-sm text-txt-secondary">
              {t("mail.ordered_from", { merchant: details.merchant_name })}
              {details.order_date && (
                <span className="text-txt-muted"> · {details.order_date}</span>
              )}
            </div>
          )}

          {clean_items.length > 0 && (
            <div className="mt-3">
              <h4 className="text-xs font-medium uppercase tracking-wider mb-2 text-txt-muted">
                {t("mail.items")}
              </h4>
              <div className="space-y-1.5">
                {clean_items.slice(0, 5).map((item, index) => (
                  <div
                    key={index}
                    className="flex items-baseline justify-between gap-4 text-sm"
                  >
                    <span className="line-clamp-1 min-w-0 text-txt-primary">
                      {item.quantity && item.quantity > 1
                        ? `${item.quantity} × ${item.name}`
                        : item.name}
                    </span>
                    {item.total_price && (
                      <span className="tabular-nums shrink-0 text-txt-secondary">
                        {item.total_price.formatted}
                      </span>
                    )}
                  </div>
                ))}
                {clean_items.length > 5 && (
                  <span className="text-xs text-txt-muted">
                    {t("mail.more_items_count", {
                      count: clean_items.length - 5,
                    })}
                  </span>
                )}
              </div>
            </div>
          )}

          {(amount_rows.length > 0 || details.total) && (
            <div className="mt-3 pt-3 border-t border-edge-secondary space-y-1.5">
              {amount_rows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-txt-muted">{row.label}</span>
                  <span
                    className={cn(
                      "tabular-nums",
                      row.accent
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-txt-secondary",
                    )}
                  >
                    {row.amount}
                  </span>
                </div>
              ))}
              {details.total && (
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span className="text-txt-primary">{t("common.total")}</span>
                  <span className="tabular-nums text-txt-primary">
                    {details.total.formatted}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="mt-3 pt-3 border-t border-edge-secondary flex items-center justify-between gap-3">
            {has_voted ? (
              <span className="text-xs text-txt-muted">
                {t("mail.receipt_feedback_thanks")}
              </span>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-txt-muted">
                  {t("mail.receipt_is_this_correct")}
                </span>
                <Tooltip tip={t("mail.receipt_feedback_correct")}>
                  <button
                    aria-label={t("mail.receipt_feedback_correct")}
                    className="p-1 rounded-md text-txt-muted hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                    type="button"
                    onClick={() => handle_feedback(true)}
                  >
                    <HandThumbUpIcon className="w-4 h-4" />
                  </button>
                </Tooltip>
                <Tooltip tip={t("mail.receipt_feedback_incorrect")}>
                  <button
                    aria-label={t("mail.receipt_feedback_incorrect")}
                    className="p-1 rounded-md text-txt-muted hover:text-red-500 dark:hover:text-red-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                    type="button"
                    onClick={() => handle_feedback(false)}
                  >
                    <HandThumbDownIcon className="w-4 h-4" />
                  </button>
                </Tooltip>
              </div>
            )}
            <div className="flex items-center gap-1.5 min-w-0">
              <ShieldCheckIcon className="w-3.5 h-3.5 shrink-0 text-txt-muted" />
              <span className="text-[10px] text-txt-muted truncate">
                {t("mail.purchase_extraction_privacy")}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
