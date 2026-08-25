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

import { useMemo } from "react";

import { open_external } from "@/utils/open_link";
import { cn } from "@/lib/utils";
import { use_i18n } from "@/lib/i18n/context";
import { is_any_lockdown_active } from "@/services/lockdown_store";
import { ContactAvatar } from "@/components/common/contacts/contact_avatar";

interface ShippingDetailsBannerProps {
  details: ExtractedShippingDetails;
  sender_email?: string;
  sender_name?: string;
  className?: string;
}

export function ShippingDetailsBanner({
  details,
  sender_email,
  sender_name,
  className,
}: ShippingDetailsBannerProps) {
  const { t } = use_i18n();

  const STATUS_CONFIG: Record<
    ShippingStatus,
    { label: string; color: string }
  > = useMemo(
    () => ({
      label_created: {
        label: t("mail.shipping_label_created"),
        color: "var(--text-muted)",
      },
      shipped: { label: t("mail.shipping_shipped"), color: "#2563eb" },
      in_transit: { label: t("mail.shipping_in_transit"), color: "#2563eb" },
      out_for_delivery: {
        label: t("mail.shipping_out_for_delivery"),
        color: "#d97706",
      },
      delivered: { label: t("mail.shipping_delivered"), color: "#16a34a" },
      exception: {
        label: t("mail.shipping_delivery_exception"),
        color: "#dc2626",
      },
      unknown: {
        label: t("mail.shipping_status_unknown"),
        color: "var(--text-muted)",
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

  const date_suffix =
    details.status === "delivered" && details.delivery_date
      ? details.delivery_date
      : details.estimated_delivery && details.status !== "delivered"
        ? t("common.estimated_short", { date: details.estimated_delivery })
        : null;

  const handle_track_click = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (details.tracking_url && !is_any_lockdown_active()) {
      open_external(details.tracking_url);
    }
  };

  return (
    <div className={cn("flex items-center gap-2 text-[13px]", className)}>
      <ContactAvatar
        email={sender_email}
        name={sender_name || details.carrier_name || undefined}
        rounded="rounded-md"
        size_px={20}
      />
      <span className="min-w-0 truncate text-txt-secondary">
        <span className="font-semibold text-txt-primary">
          {details.carrier_name || t("common.shipment_update")}
        </span>
        <span className="mx-1 text-txt-muted">·</span>
        <span className="font-medium" style={{ color: status_config.color }}>
          {status_config.label}
        </span>
        {date_suffix && (
          <span className="text-txt-muted">
            <span className="mx-1">·</span>
            {date_suffix}
          </span>
        )}
      </span>
      {details.tracking_url && (
        <button
          className="flex-shrink-0 ms-auto rounded px-1.5 py-0.5 text-xs font-medium text-blue-500 transition-colors hover:bg-blue-500/10"
          type="button"
          onClick={handle_track_click}
        >
          {t("common.track_package")}
        </button>
      )}
    </div>
  );
}
