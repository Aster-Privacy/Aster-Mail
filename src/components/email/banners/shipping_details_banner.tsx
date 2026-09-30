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

import { useMemo, useState } from "react";
import {
  ArrowTopRightOnSquareIcon,
  CalendarDaysIcon,
  ClockIcon,
  CubeIcon,
  HashtagIcon,
  TruckIcon,
} from "@heroicons/react/24/outline";

import { open_external } from "@/utils/open_link";
import { use_i18n } from "@/lib/i18n/context";
import { is_any_lockdown_active } from "@/services/lockdown_store";
import { ContactAvatar } from "@/components/common/contacts/contact_avatar";

import {
  ExtractionCard,
  ExtractionCardAction,
  ExtractionCardActions,
  ExtractionCardRow,
} from "./extraction_card";

const COLLAPSED_PREF_KEY = "shipping_banner_collapsed";
const MAX_VISIBLE_ITEMS = 3;

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
  const [is_collapsed, set_is_collapsed] = useState(read_collapsed_pref);

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

  const is_delivered = details.status === "delivered";

  const date_line = is_delivered
    ? details.delivery_date
      ? t("mail.delivered_on", { date: details.delivery_date })
      : null
    : details.estimated_delivery
      ? t("mail.expected_by", { date: details.estimated_delivery })
      : null;

  const toggle_collapsed = () => {
    set_is_collapsed((prev) => {
      write_collapsed_pref(!prev);

      return !prev;
    });
  };

  const handle_track_click = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (details.tracking_url && !is_any_lockdown_active()) {
      open_external(details.tracking_url);
    }
  };

  const title = details.carrier_name
    ? t("mail.package_from", { carrier: details.carrier_name })
    : t("mail.shipment_update");

  const visible_items = details.items_shipped
    .filter((item) => item.trim().length > 0)
    .slice(0, MAX_VISIBLE_ITEMS);

  return (
    <ExtractionCard
      className={className}
      is_collapsed={is_collapsed}
      leading={
        <ContactAvatar
          email={sender_email}
          name={sender_name || details.carrier_name || undefined}
          rounded="rounded-lg"
          size_px={36}
        />
      }
      subtitle={
        <>
          <span className="font-medium" style={{ color: status_config.color }}>
            {status_config.label}
          </span>
          {date_line && (
            <>
              <span className="mx-1">·</span>
              <span>{date_line}</span>
            </>
          )}
        </>
      }
      test_id="shipping_details_card"
      title={title}
      toggle_label={
        is_collapsed ? t("mail.show_details") : t("mail.hide_details")
      }
      on_toggle={toggle_collapsed}
    >
      <div className="py-2">
        {details.carrier_name && (
          <ExtractionCardRow
            icon={TruckIcon}
            primary={details.carrier_name}
            secondary={status_config.label}
            test_id="shipping_carrier_row"
          />
        )}
        {details.tracking_number && (
          <ExtractionCardRow
            icon={HashtagIcon}
            primary={
              <span className="font-mono tabular-nums">
                {details.tracking_number}
              </span>
            }
            secondary={t("mail.tracking_number")}
            test_id="shipping_tracking_row"
          />
        )}
        {date_line && (
          <ExtractionCardRow
            icon={ClockIcon}
            primary={date_line}
            test_id="shipping_date_row"
          />
        )}
        {details.shipped_date && !is_delivered && (
          <ExtractionCardRow
            icon={CalendarDaysIcon}
            primary={t("mail.shipped_on", { date: details.shipped_date })}
          />
        )}
        {visible_items.length > 0 && (
          <ExtractionCardRow
            icon={CubeIcon}
            primary={t("mail.items")}
            secondary={
              <div className="space-y-0.5 mt-1">
                {visible_items.map((item, index) => (
                  <div key={index} className="text-sm text-txt-primary">
                    {item}
                  </div>
                ))}
              </div>
            }
          />
        )}
      </div>
      {details.tracking_url && (
        <ExtractionCardActions>
          <ExtractionCardAction
            icon={ArrowTopRightOnSquareIcon}
            label={t("mail.track_package")}
            test_id="shipping_track_package"
            on_click={handle_track_click}
          />
        </ExtractionCardActions>
      )}
    </ExtractionCard>
  );
}
