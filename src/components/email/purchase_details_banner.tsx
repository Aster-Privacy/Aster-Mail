import { useState } from "react";
import {
  ShoppingBagIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CreditCardIcon,
  ReceiptRefundIcon,
  TagIcon,
} from "@heroicons/react/24/outline";

import type { ExtractedPurchaseDetails } from "@/services/extraction/types";
import { cn } from "@/lib/utils";

interface PurchaseDetailsBannerProps {
  details: ExtractedPurchaseDetails;
  className?: string;
}

export function PurchaseDetailsBanner({
  details,
  className,
}: PurchaseDetailsBannerProps) {
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
        "rounded-lg border overflow-hidden",
        className,
      )}
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderColor: "var(--border-primary)",
      }}
    >
      <button
        type="button"
        onClick={() => set_is_expanded(!is_expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-lg"
            style={{ backgroundColor: "rgba(16, 185, 129, 0.1)" }}
          >
            <ShoppingBagIcon
              className="w-5 h-5"
              style={{ color: "rgb(16, 185, 129)" }}
            />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span
                className="text-sm font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                Purchase Receipt
              </span>
              {details.merchant_name && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: "var(--bg-tertiary)",
                    color: "var(--text-secondary)",
                  }}
                >
                  {details.merchant_name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              {details.order_id && (
                <span
                  className="text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  Order #{details.order_id}
                </span>
              )}
              {details.order_date && (
                <span
                  className="text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
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
          {has_additional_details && (
            is_expanded ? (
              <ChevronUpIcon
                className="w-4 h-4"
                style={{ color: "var(--text-muted)" }}
              />
            ) : (
              <ChevronDownIcon
                className="w-4 h-4"
                style={{ color: "var(--text-muted)" }}
              />
            )
          )}
        </div>
      </button>

      {is_expanded && has_additional_details && (
        <div
          className="px-4 pb-4 pt-1 border-t"
          style={{ borderColor: "var(--border-secondary)" }}
        >
          {details.items.length > 0 && (
            <div className="mb-4">
              <h4
                className="text-xs font-medium uppercase tracking-wider mb-2"
                style={{ color: "var(--text-muted)" }}
              >
                Items
              </h4>
              <div className="space-y-2">
                {details.items.slice(0, 5).map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2">
                      {item.quantity && item.quantity > 1 && (
                        <span
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: "var(--bg-tertiary)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {item.quantity}x
                        </span>
                      )}
                      <span
                        className="line-clamp-1"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {item.name}
                      </span>
                    </div>
                    {item.total_price && (
                      <span style={{ color: "var(--text-secondary)" }}>
                        {item.total_price.formatted}
                      </span>
                    )}
                  </div>
                ))}
                {details.items.length > 5 && (
                  <span
                    className="text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    +{details.items.length - 5} more items
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {details.subtotal && (
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: "var(--text-muted)" }}>Subtotal</span>
                <span style={{ color: "var(--text-secondary)" }}>
                  {details.subtotal.formatted}
                </span>
              </div>
            )}

            {details.shipping_cost && (
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: "var(--text-muted)" }}>Shipping</span>
                <span style={{ color: "var(--text-secondary)" }}>
                  {details.shipping_cost.formatted}
                </span>
              </div>
            )}

            {details.tax && (
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: "var(--text-muted)" }}>Tax</span>
                <span style={{ color: "var(--text-secondary)" }}>
                  {details.tax.formatted}
                </span>
              </div>
            )}

            {details.discount && (
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1">
                  <TagIcon className="w-3.5 h-3.5" style={{ color: "rgb(34, 197, 94)" }} />
                  <span style={{ color: "var(--text-muted)" }}>Discount</span>
                </div>
                <span style={{ color: "rgb(34, 197, 94)" }}>
                  -{details.discount.formatted}
                </span>
              </div>
            )}
          </div>

          {(details.payment_method || details.card_last_four) && (
            <div
              className="mt-3 pt-3 border-t flex items-center gap-2"
              style={{ borderColor: "var(--border-secondary)" }}
            >
              <CreditCardIcon
                className="w-4 h-4"
                style={{ color: "var(--text-muted)" }}
              />
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {details.payment_method ||
                  (details.card_last_four && `Card ending in ${details.card_last_four}`)}
              </span>
            </div>
          )}

          {(details.confirmation_number || details.transaction_id) && (
            <div className="mt-2 flex items-center gap-2">
              <ReceiptRefundIcon
                className="w-4 h-4"
                style={{ color: "var(--text-muted)" }}
              />
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {details.confirmation_number
                  ? `Confirmation: ${details.confirmation_number}`
                  : `Transaction: ${details.transaction_id}`}
              </span>
            </div>
          )}

          <div
            className="mt-3 pt-3 border-t flex items-center gap-1.5"
            style={{ borderColor: "var(--border-secondary)" }}
          >
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ color: "var(--text-muted)" }}
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              Extracted locally from your email. Nothing is sent to our servers.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
