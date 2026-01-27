import { useState } from "react";
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

import type { ExtractedShippingDetails, ShippingStatus } from "@/services/extraction/types";
import { cn } from "@/lib/utils";

interface ShippingDetailsBannerProps {
  details: ExtractedShippingDetails;
  className?: string;
}

const STATUS_CONFIG: Record<
  ShippingStatus,
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  label_created: {
    label: "Label Created",
    color: "rgb(107, 114, 128)",
    bg: "rgba(107, 114, 128, 0.1)",
    icon: <ClockIcon className="w-4 h-4" />,
  },
  shipped: {
    label: "Shipped",
    color: "rgb(59, 130, 246)",
    bg: "rgba(59, 130, 246, 0.1)",
    icon: <TruckIcon className="w-4 h-4" />,
  },
  in_transit: {
    label: "In Transit",
    color: "rgb(59, 130, 246)",
    bg: "rgba(59, 130, 246, 0.1)",
    icon: <TruckIcon className="w-4 h-4" />,
  },
  out_for_delivery: {
    label: "Out for Delivery",
    color: "rgb(245, 158, 11)",
    bg: "rgba(245, 158, 11, 0.1)",
    icon: <TruckIcon className="w-4 h-4" />,
  },
  delivered: {
    label: "Delivered",
    color: "rgb(16, 185, 129)",
    bg: "rgba(16, 185, 129, 0.1)",
    icon: <CheckCircleIcon className="w-4 h-4" />,
  },
  exception: {
    label: "Delivery Exception",
    color: "rgb(239, 68, 68)",
    bg: "rgba(239, 68, 68, 0.1)",
    icon: <ExclamationTriangleIcon className="w-4 h-4" />,
  },
  unknown: {
    label: "Status Unknown",
    color: "rgb(107, 114, 128)",
    bg: "rgba(107, 114, 128, 0.1)",
    icon: <ClockIcon className="w-4 h-4" />,
  },
};

export function ShippingDetailsBanner({
  details,
  className,
}: ShippingDetailsBannerProps) {
  const [is_expanded, set_is_expanded] = useState(false);

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
      window.open(details.tracking_url, "_blank", "noopener,noreferrer");
    }
  };

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
            style={{ backgroundColor: status_config.bg }}
          >
            <TruckIcon className="w-5 h-5" style={{ color: status_config.color }} />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span
                className="text-sm font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                Shipment Update
              </span>
              {details.carrier_name && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: "var(--bg-tertiary)",
                    color: "var(--text-secondary)",
                  }}
                >
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
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Est. {details.estimated_delivery}
                </span>
              )}
              {details.delivery_date && details.status === "delivered" && (
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {details.delivery_date}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {details.tracking_url && (
            <button
              type="button"
              onClick={handle_track_click}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors"
              style={{
                backgroundColor: "var(--accent-color)",
                color: "#ffffff",
              }}
            >
              Track Package
              <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
            </button>
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
          {details.tracking_number && (
            <div className="mb-3">
              <h4
                className="text-xs font-medium uppercase tracking-wider mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Tracking Number
              </h4>
              <div className="flex items-center gap-2">
                <code
                  className="text-sm font-mono px-2 py-1 rounded"
                  style={{
                    backgroundColor: "var(--bg-tertiary)",
                    color: "var(--text-primary)",
                  }}
                >
                  {details.tracking_number}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(details.tracking_number || "");
                  }}
                  className="text-xs px-2 py-1 rounded hover:bg-black/[0.05] dark:hover:bg-white/[0.05] transition-colors"
                  style={{ color: "var(--text-muted)" }}
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {details.shipped_date && (
              <div>
                <span
                  className="text-xs block"
                  style={{ color: "var(--text-muted)" }}
                >
                  Shipped Date
                </span>
                <span
                  className="text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {details.shipped_date}
                </span>
              </div>
            )}

            {details.estimated_delivery && details.status !== "delivered" && (
              <div>
                <span
                  className="text-xs block"
                  style={{ color: "var(--text-muted)" }}
                >
                  Estimated Delivery
                </span>
                <span
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {details.estimated_delivery}
                </span>
              </div>
            )}

            {details.delivery_date && details.status === "delivered" && (
              <div>
                <span
                  className="text-xs block"
                  style={{ color: "var(--text-muted)" }}
                >
                  Delivered On
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
              <MapPinIcon
                className="w-4 h-4 mt-0.5"
                style={{ color: "var(--text-muted)" }}
              />
              <div>
                <span
                  className="text-xs block"
                  style={{ color: "var(--text-muted)" }}
                >
                  Delivery Address
                </span>
                <span
                  className="text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {details.destination}
                </span>
              </div>
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
