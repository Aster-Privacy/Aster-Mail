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
import type {
  ExtractedShippingDetails,
  ShippingStatus,
} from "@/services/extraction/types";

import { useState, useMemo } from "react";
import {
  TruckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  MapPinIcon,
} from "@heroicons/react/24/outline";

import { open_external } from "@/utils/open_link";
import { cn } from "@/lib/utils";
import { use_i18n } from "@/lib/i18n/context";

interface ShippingDetailsBannerProps {
  details: ExtractedShippingDetails;
  className?: string;
}

export function ShippingDetailsBanner({
  details,
  className,
}: ShippingDetailsBannerProps) {
  const { t } = use_i18n();
  const [is_expanded, set_is_expanded] = useState(false);

  const STATUS_CONFIG: Record<
    ShippingStatus,
    { label: string; color: string; bg: string; icon: React.ReactNode }
  > = useMemo(
    () => ({
      label_created: {
        label: t("mail.shipping_label_created"),
        color: "rgb(107, 114, 128)",
        bg: "rgba(107, 114, 128, 0.1)",
        icon: <ClockIcon className="w-4 h-4" />,
      },
      shipped: {
        label: t("mail.shipping_shipped"),
        color: "#ffffff",
        bg: "#2563eb",
        icon: <TruckIcon className="w-4 h-4" />,
      },
      in_transit: {
        label: t("mail.shipping_in_transit"),
        color: "#ffffff",
        bg: "#2563eb",
        icon: <TruckIcon className="w-4 h-4" />,
      },
      out_for_delivery: {
        label: t("mail.shipping_out_for_delivery"),
        color: "#ffffff",
        bg: "#d97706",
        icon: <TruckIcon className="w-4 h-4" />,
      },
      delivered: {
        label: t("mail.shipping_delivered"),
        color: "#ffffff",
        bg: "#16a34a",
        icon: <CheckCircleIcon className="w-4 h-4" />,
      },
      exception: {
        label: t("mail.shipping_delivery_exception"),
        color: "#ffffff",
        bg: "#dc2626",
        icon: <ExclamationTriangleIcon className="w-4 h-4" />,
      },
      unknown: {
        label: t("mail.shipping_status_unknown"),
        color: "rgb(107, 114, 128)",
        bg: "rgba(107, 114, 128, 0.1)",
        icon: <ClockIcon className="w-4 h-4" />,
      },
    }),
    [t],
  );

  const has_meaningful_data =
    details.tracking_number || details.carrier_name || details.status;

  if (!has_meaningful_data) {
    return null;
  }

  const status_config = details.status
    ? STATUS_CONFIG[details.status]
    : STATUS_CONFIG.unknown;

  const has_additional_details =
    details.estimated_delivery ||
    details.shipped_date ||
    details.delivery_date ||
    details.destination ||
    details.tracking_number;

  const handle_track_click = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (details.tracking_url) {
      open_external(details.tracking_url);
    }
  };

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
            style={{ backgroundColor: status_config.bg }}
          >
            <TruckIcon
              className="w-5 h-5"
              style={{ color: status_config.color }}
            />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-txt-primary">
                {t("common.shipment_update")}
              </span>
              {details.carrier_name && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-surf-tertiary text-txt-secondary">
                  {details.carrier_name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className="text-xs font-medium px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: status_config.bg,
                  color: status_config.color,
                }}
              >
                {status_config.label}
              </span>
              {details.estimated_delivery && details.status !== "delivered" && (
                <span className="text-xs text-txt-muted">
                  {t("common.estimated_short", {
                    date: details.estimated_delivery,
                  })}
                </span>
              )}
              {details.delivery_date && details.status === "delivered" && (
                <span className="text-xs text-txt-muted">
                  {details.delivery_date}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {details.tracking_url && (
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors bg-brand text-white"
              type="button"
              onClick={handle_track_click}
            >
              {t("common.track_package")}
              <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
            </button>
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
          {details.tracking_number && (
            <div className="mb-3">
              <h4 className="text-xs font-medium uppercase tracking-wider mb-1 text-txt-muted">
                {t("common.tracking_number")}
              </h4>
              <div className="flex items-center gap-2">
                <code className="text-sm font-mono px-2 py-1 rounded bg-surf-tertiary text-txt-primary">
                  {details.tracking_number}
                </code>
                <button
                  className="text-xs px-2 py-1 rounded hover:bg-black/[0.05] dark:hover:bg-white/[0.05] transition-colors text-txt-muted"
                  type="button"
                  onClick={() => {
                    navigator.clipboard
                      .writeText(details.tracking_number || "")
                      .catch(() => {});
                  }}
                >
                  {t("common.copy")}
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {details.shipped_date && (
              <div>
                <span className="text-xs block text-txt-muted">
                  {t("mail.shipping_shipped_date")}
                </span>
                <span className="text-sm text-txt-secondary">
                  {details.shipped_date}
                </span>
              </div>
            )}

            {details.estimated_delivery && details.status !== "delivered" && (
              <div>
                <span className="text-xs block text-txt-muted">
                  {t("common.estimated_delivery")}
                </span>
                <span className="text-sm font-medium text-txt-primary">
                  {details.estimated_delivery}
                </span>
              </div>
            )}

            {details.delivery_date && details.status === "delivered" && (
              <div>
                <span className="text-xs block text-txt-muted">
                  {t("mail.shipping_delivered_on")}
                </span>
                <span
                  className="text-sm font-medium"
                  style={{ color: "rgb(16, 185, 129)" }}
                >
                  {details.delivery_date}
                </span>
              </div>
            )}
          </div>

          {details.destination && (
            <div className="mt-3 flex items-start gap-2">
              <MapPinIcon className="w-4 h-4 mt-0.5 text-txt-muted" />
              <div>
                <span className="text-xs block text-txt-muted">
                  {t("common.delivery_address")}
                </span>
                <span className="text-sm text-txt-secondary">
                  {details.destination}
                </span>
              </div>
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
              {t("common.extracted_locally_message")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
