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
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Checkbox, Island, Switch } from "@aster/ui";

import { TurnstileWidget } from "@/components/auth/turnstile_widget";
import {
  Modal,
  ModalBody,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import { ButtonSpinner } from "@/components/ui/spinner";
import { format_price } from "@/services/api/billing";
import { set_domain_auto_renew } from "@/services/api/domains";
import { use_i18n } from "@/lib/i18n/context";
import { app_locale, get_display_time_zone } from "@/utils/date_format";

const SUPPORT_ADDRESS = "hello@astermail.org";
const EXPIRING_SOON_DAYS = 30;
const ROW_DIVIDER =
  "1px solid color-mix(in srgb, var(--text-primary) 8%, transparent)";

interface PurchasedDomainManageModalProps {
  is_open: boolean;
  on_close: () => void;
  order: DomainOrder | null;
  custom_domain?: CustomDomain;
  captcha_pending: boolean;
  renewing: boolean;
  renew_error?: string;
  on_renew: (auto_renew: boolean, captcha_token?: string) => void;
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
  const [auto_renew, set_auto_renew] = useState(order?.auto_renew ?? false);
  const [auto_renew_saving, set_auto_renew_saving] = useState(false);
  const [auto_renew_error, set_auto_renew_error] = useState<string | null>(
    null,
  );
  const [renew_opt_in, set_renew_opt_in] = useState(false);

  useEffect(() => {
    set_auto_renew(order?.auto_renew ?? false);
    set_auto_renew_error(null);
  }, [order?.id, order?.auto_renew]);

  useEffect(() => {
    set_renew_opt_in(false);
  }, [order?.id]);

  if (!order) return null;

  const can_auto_renew = order.auto_renew_available || auto_renew;
  const renew_with_opt_in = !can_auto_renew && renew_opt_in;

  const toggle_auto_renew = async (enabled: boolean) => {
    set_auto_renew(enabled);
    set_auto_renew_saving(true);
    set_auto_renew_error(null);
    const response = await set_domain_auto_renew(order.id, enabled);

    set_auto_renew_saving(false);
    if (response.data) {
      set_auto_renew(response.data.auto_renew);
    } else {
      set_auto_renew(!enabled);
      set_auto_renew_error(
        response.error ??
          t("settings.domain_purchase_manage_auto_renew_error"),
      );
    }
  };

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
      <ModalBody className="px-6 space-y-4">
        <Island className="overflow-hidden">
          {rows.map((row, index) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-4 px-4 py-3"
              style={{ borderTop: index > 0 ? ROW_DIVIDER : "none" }}
            >
              <span className="text-[13px] text-txt-muted">{row.label}</span>
              <span
                className={`text-[13px] font-medium text-end ${
                  row.danger ? "text-[var(--color-danger)]" : "text-txt-primary"
                }`}
              >
                {row.value}
              </span>
            </div>
          ))}
        </Island>

        {can_auto_renew ? (
          <Island className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-txt-primary">
                {t("settings.domain_purchase_auto_renew_label")}
              </p>
              <p className="mt-0.5 text-[12px] leading-snug text-txt-muted">
                {auto_renew
                  ? t("settings.domain_purchase_manage_auto_renew_on_note")
                  : t("settings.domain_purchase_manage_auto_renew_note")}
              </p>
            </div>
            <Switch
              aria-label={t("settings.domain_purchase_auto_renew_label")}
              checked={auto_renew}
              disabled={auto_renew_saving}
              size="lg"
              onCheckedChange={toggle_auto_renew}
            />
          </Island>
        ) : (
          <>
            <p className="text-xs text-txt-muted leading-relaxed">
              {t("settings.domain_purchase_manage_auto_renew_note")}
            </p>
            <label className="flex cursor-pointer select-none items-start gap-3 rounded-[var(--aster-radius-control)] bg-[var(--aster-field-bg)] px-4 py-3.5 transition-colors hover:bg-[var(--aster-field-hover)]">
              <Checkbox
                checked={renew_opt_in}
                className="mt-0.5"
                disabled={renewing || captcha_pending}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  set_renew_opt_in(e.target.checked)
                }
              />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-txt-primary">
                  {t("settings.domain_purchase_auto_renew_label")}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-txt-muted">
                  {t("settings.domain_purchase_auto_renew_hint")}
                </span>
              </span>
            </label>
          </>
        )}

        {auto_renew_error && (
          <p className="text-xs text-[var(--color-danger)]">
            {auto_renew_error}
          </p>
        )}

        {captcha_pending && !renewing && (
          <TurnstileWidget
            class_name="flex justify-center"
            on_verify={(token) => on_renew(renew_with_opt_in, token)}
          />
        )}

        {renew_error && (
          <p className="text-xs text-[var(--color-danger)]">{renew_error}</p>
        )}

        <p className="text-xs text-txt-muted leading-relaxed">
          {t("settings.domain_purchase_manage_support_note")}
        </p>
      </ModalBody>
      <ModalFooter className="flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button
          className="w-full sm:w-auto"
          variant="ghost"
          onClick={contact_support}
        >
          <LifebuoyIcon className="w-4 h-4 me-2" />
          {t("common.contact_support")}
        </Button>

        <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:items-center">
          {custom_domain && (
            <Button
              className="w-full sm:w-auto"
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
            className="w-full sm:w-auto"
            disabled={renewing || captcha_pending}
            variant="depth"
            onClick={() => on_renew(renew_with_opt_in)}
          >
            <ArrowPathIcon className="w-4 h-4 me-2" />
            {(renewing || captcha_pending) && <ButtonSpinner size="xs" />}
            {t("settings.domain_purchase_renew")}
          </Button>
        </div>
      </ModalFooter>
    </Modal>
  );
}
