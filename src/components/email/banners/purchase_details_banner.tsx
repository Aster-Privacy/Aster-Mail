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
  ChevronUpIcon,
  CreditCardIcon,
  ReceiptRefundIcon,
  TagIcon,
} from "@heroicons/react/24/outline";

import { cn } from "@/lib/utils";
import { use_i18n } from "@/lib/i18n/context";

interface PurchaseDetailsBannerProps {
  details: ExtractedPurchaseDetails;
  className?: string;
}

export function PurchaseDetailsBanner({
  details,
  className,
}: PurchaseDetailsBannerProps) {
  const { t } = use_i18n();
  const [is_expanded, set_is_expanded] = useState(false);

  const has_meaningful_data =
    details.order_id ||
    details.total ||
    details.items.length > 0 ||
    details.merchant_name;

  if (!has_meaningful_data) {
    return null;
  }

  const has_additional_details =
    details.items.length > 0 ||
    details.subtotal ||
    details.tax ||
    details.shipping_cost ||
    details.discount ||
    details.payment_method ||
    details.card_last_four;

  return (
    <div
      className={cn(
        "rounded-lg border border-edge-primary overflow-hidden bg-surf-secondary",
        className,
      )}
    >
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
        type="button"
        onClick={() => set_is_expanded(!is_expanded)}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-lg"
            style={{ backgroundColor: "#16a34a" }}
          >
            <ShoppingBagIcon className="w-5 h-5" style={{ color: "#ffffff" }} />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-txt-primary">
                {t("mail.purchase_receipt")}
              </span>
              {details.merchant_name && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-surf-tertiary text-txt-secondary">
                  {details.merchant_name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              {details.order_id && (
                <span className="text-xs text-txt-muted">
                  {t("mail.order_number", { id: details.order_id })}
                </span>
              )}
              {details.order_date && (
                <span className="text-xs text-txt-muted">
                  {details.order_date}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {details.total && (
            <span
              className="text-base font-bold"
              style={{ color: "rgb(16, 185, 129)" }}
            >
              {details.total.formatted}
            </span>
          )}
          {has_additional_details &&
            (is_expanded ? (
              <ChevronUpIcon className="w-4 h-4 text-txt-muted" />
            ) : (
              <ChevronDownIcon className="w-4 h-4 text-txt-muted" />
            ))}
        </div>
      </button>

      {is_expanded && has_additional_details && (
        <div className="px-4 pb-4 pt-1 border-t border-edge-secondary">
          {details.items.length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs font-medium uppercase tracking-wider mb-2 text-txt-muted">
                {t("mail.items")}
              </h4>
              <div className="space-y-2">
                {details.items.slice(0, 5).map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2">
                      {item.quantity && item.quantity > 1 && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-surf-tertiary text-txt-secondary">
                          {item.quantity}x
                        </span>
                      )}
                      <span className="line-clamp-1 text-txt-primary">
                        {item.name}
                      </span>
                    </div>
                    {item.total_price && (
                      <span className="text-txt-secondary">
                        {item.total_price.formatted}
                      </span>
                    )}
                  </div>
                ))}
                {details.items.length > 5 && (
                  <span className="text-xs text-txt-muted">
                    {t("mail.more_items_count", {
                      count: details.items.length - 5,
                    })}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {details.subtotal && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-txt-muted">{t("common.subtotal")}</span>
                <span className="text-txt-secondary">
                  {details.subtotal.formatted}
                </span>
              </div>
            )}

            {details.shipping_cost && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-txt-muted">{t("common.shipping")}</span>
                <span className="text-txt-secondary">
                  {details.shipping_cost.formatted}
                </span>
              </div>
            )}

            {details.tax && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-txt-muted">{t("common.tax")}</span>
                <span className="text-txt-secondary">
                  {details.tax.formatted}
                </span>
              </div>
            )}

            {details.discount && (
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1">
                  <TagIcon
                    className="w-3.5 h-3.5"
                    style={{ color: "rgb(34, 197, 94)" }}
                  />
                  <span className="text-txt-muted">{t("common.discount")}</span>
                </div>
                <span style={{ color: "rgb(34, 197, 94)" }}>
                  -{details.discount.formatted}
                </span>
              </div>
            )}
          </div>

          {(details.payment_method || details.card_last_four) && (
            <div className="mt-3 pt-3 border-t border-edge-secondary flex items-center gap-2">
              <CreditCardIcon className="w-4 h-4 text-txt-muted" />
              <span className="text-sm text-txt-secondary">
                {details.payment_method ||
                  (details.card_last_four &&
                    t("mail.card_ending_in", {
                      last_four: details.card_last_four,
                    }))}
              </span>
            </div>
          )}

          {(details.confirmation_number || details.transaction_id) && (
            <div className="mt-2 flex items-center gap-2">
              <ReceiptRefundIcon className="w-4 h-4 text-txt-muted" />
              <span className="text-xs text-txt-muted">
                {details.confirmation_number
                  ? t("mail.confirmation_label", {
                      number: details.confirmation_number,
                    })
                  : t("mail.transaction_label", {
                      id: details.transaction_id ?? "",
                    })}
              </span>
            </div>
          )}

          <div className="mt-3 pt-3 border-t border-edge-secondary flex items-center gap-1.5">
            <svg
              className="w-3.5 h-3.5 text-txt-muted"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span className="text-[10px] text-txt-muted">
              {t("mail.purchase_extraction_privacy")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
