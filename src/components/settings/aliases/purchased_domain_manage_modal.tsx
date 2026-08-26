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
import type { CustomDomain, DomainOrder } from "@/services/api/domains";

import {
  ArrowPathIcon,
  Cog6ToothIcon,
  LifebuoyIcon,
} from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";
import { Button } from "@aster/ui";

import { TurnstileWidget } from "@/components/auth/turnstile_widget";
import {
  Modal,
  ModalBody,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { format_price } from "@/services/api/billing";
import { use_i18n } from "@/lib/i18n/context";
import { app_locale, get_display_time_zone } from "@/utils/date_format";

const SUPPORT_ADDRESS = "hello@astermail.org";
const EXPIRING_SOON_DAYS = 30;

interface PurchasedDomainManageModalProps {
  is_open: boolean;
  on_close: () => void;
  order: DomainOrder | null;
  custom_domain?: CustomDomain;
  captcha_pending: boolean;
  renewing: boolean;
  renew_error?: string;
  on_renew: (captcha_token?: string) => void;
  on_open_setup: (domain: CustomDomain) => void;
}

function format_day(value: string): string {
  return new Date(value).toLocaleDateString(app_locale(), {
    timeZone: get_display_time_zone(),
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function days_until(value: string): number {
  const ms = new Date(value).getTime() - Date.now();

  return Math.ceil(ms / 86_400_000);
}

export function PurchasedDomainManageModal({
  is_open,
  on_close,
  order,
  custom_domain,
  captcha_pending,
  renewing,
  renew_error,
  on_renew,
  on_open_setup,
}: PurchasedDomainManageModalProps) {
  const { t } = use_i18n();
  const navigate = useNavigate();

  if (!order) return null;

  const remaining_days = order.expires_at ? days_until(order.expires_at) : null;
  const is_lapsed =
    order.status === "lapsed" ||
    (remaining_days !== null && remaining_days < 0);
  const is_expiring_soon =
    !is_lapsed &&
    remaining_days !== null &&
    remaining_days <= EXPIRING_SOON_DAYS;

  const status_label = is_lapsed
    ? t("settings.domain_purchase_purchased_lapsed")
    : is_expiring_soon
      ? t("settings.domain_purchase_manage_status_expiring")
      : t("settings.domain_purchase_manage_status_active");

  const rows: { label: string; value: string; danger?: boolean }[] = [
    {
      label: t("settings.domain_purchase_manage_status"),
      value: status_label,
      danger: is_lapsed,
    },
    {
      label: t("settings.domain_purchase_manage_registered"),
      value: format_day(order.created_at),
    },
  ];

  if (order.expires_at) {
    rows.push({
      label: t("settings.domain_purchase_manage_expires"),
      value: format_day(order.expires_at),
      danger: is_lapsed,
    });
  }

  rows.push({
    label: t("settings.domain_purchase_manage_term"),
    value:
      order.years === 1
        ? t("settings.domain_purchase_one_year")
        : t("settings.domain_purchase_n_years", { count: order.years }),
  });

  rows.push({
    label: t("settings.domain_purchase_manage_paid"),
    value: format_price(order.price_cents, order.currency),
  });

  const contact_support = () => {
    on_close();
    if (window.location.pathname.startsWith("/settings")) {
      navigate("/");
    }
    window.dispatchEvent(
      new CustomEvent("aster:open-compose-prefilled", {
        detail: {
          to: [SUPPORT_ADDRESS],
          subject: t("settings.domain_purchase_manage_support_subject", {
            domain: order.domain,
          }),
          body: "",
        },
      }),
    );
  };

  return (
    <Modal is_open={is_open} on_close={on_close} size="lg">
      <ModalHeader>
        <ModalTitle>{order.domain}</ModalTitle>
        <ModalDescription>
          {t("settings.domain_purchase_manage_description")}
        </ModalDescription>
      </ModalHeader>
      <ModalBody className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-edge-secondary bg-surf-primary divide-y divide-edge-secondary">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <span className="text-xs font-medium text-txt-muted">
                {row.label}
              </span>
              <span
                className={`text-sm text-end ${
                  row.danger ? "text-[var(--color-danger)]" : "text-txt-primary"
                }`}
              >
                {row.value}
              </span>
            </div>
          ))}
        </div>

        <p className="text-xs text-txt-muted leading-relaxed">
          {t("settings.domain_purchase_manage_auto_renew_note")}
        </p>

        <div className="flex flex-col gap-2">
          <Button
            className="w-full"
            disabled={renewing || captcha_pending}
            size="lg"
            variant="depth"
            onClick={() => on_renew()}
          >
            {renewing || captcha_pending ? (
              <Spinner size="xs" />
            ) : (
              <ArrowPathIcon className="w-4 h-4 me-2" />
            )}
            {t("settings.domain_purchase_renew")}
          </Button>

          {custom_domain && (
            <Button
              className="w-full"
              size="lg"
              variant="secondary"
              onClick={() => {
                on_close();
                on_open_setup(custom_domain);
              }}
            >
              <Cog6ToothIcon className="w-4 h-4 me-2" />
              {t("settings.domain_purchase_manage_dns")}
            </Button>
          )}

          <Button
            className="w-full"
            size="lg"
            variant="ghost"
            onClick={contact_support}
          >
            <LifebuoyIcon className="w-4 h-4 me-2" />
            {t("common.contact_support")}
          </Button>
        </div>

        {captcha_pending && !renewing && (
          <TurnstileWidget
            class_name="flex justify-center"
            on_verify={(token) => on_renew(token)}
          />
        )}

        {renew_error && (
          <p className="text-xs text-[var(--color-danger)]">{renew_error}</p>
        )}

        <p className="text-xs text-txt-muted leading-relaxed">
          {t("settings.domain_purchase_manage_support_note")}
        </p>
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={on_close}>
          {t("common.close")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
