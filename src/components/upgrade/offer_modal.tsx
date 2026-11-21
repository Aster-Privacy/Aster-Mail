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
import type { PendingOffer } from "@/services/api/billing";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { XMarkIcon } from "@heroicons/react/24/solid";

import {
  dismiss_offer,
  offer_discount_percent,
  should_show_offer,
  snooze_offer,
} from "./offer_state";
import { OfferLedHero } from "./offer_led_hero";

import { Button } from "@/components/ui/button";
import { Modal, ModalTitle } from "@/components/ui/modal";
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import { get_subscription, format_price } from "@/services/api/billing";
import {
  PLAN_TIERS,
  convert_cents,
  detect_currency_from_locale,
} from "@/components/settings/billing/billing_constants";
import { use_currency_rates } from "@/components/settings/billing/use_currency_rates";
import { checkout_highlights } from "@/components/settings/billing/checkout_highlights";
import { days_until } from "@/components/settings/billing/win_back_offer_card";
import {
  is_on_auth_route,
  show_offer_upgrade,
  use_upgrade_state,
} from "@/stores/upgrade_store";

const REVEAL_DELAY_MS = 2000;

const FREE_PLAN_CODE = "free";

export function OfferModal() {
  const { t } = use_i18n();
  const { is_authenticated } = use_auth();
  const location = useLocation();
  const upgrade_state = use_upgrade_state();
  const [offer, set_offer] = useState<PendingOffer | null>(null);
  const [is_open, set_is_open] = useState(false);
  const [currency, set_currency] = useState("usd");

  use_currency_rates();

  useEffect(() => {
    set_currency(detect_currency_from_locale());
  }, []);

  const is_blocked = is_on_auth_route(location.pathname) || !is_authenticated;

  useEffect(() => {
    if (is_blocked) return;

    let cancelled = false;

    const load = async () => {
      try {
        const response = await get_subscription();
        const subscription = response.data;

        if (cancelled || !subscription) return;
        if (subscription.plan?.code !== FREE_PLAN_CODE) return;
        if (!should_show_offer(subscription.pending_offer)) return;

        set_offer(subscription.pending_offer ?? null);
      } catch {
        return;
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [is_blocked]);

  useEffect(() => {
    if (!offer || is_blocked) return;

    const timer = window.setTimeout(() => {
      snooze_offer(offer.code);
      set_is_open(true);
    }, REVEAL_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [offer, is_blocked]);

  const tier = useMemo(
    () => PLAN_TIERS.find((entry) => entry.is_recommended) ?? PLAN_TIERS[0],
    [],
  );

  const percent = offer_discount_percent(offer?.discount_label);

  const money = useCallback(
    (cents: number) => format_price(convert_cents(cents, currency), currency),
    [currency],
  );

  const handle_close = () => set_is_open(false);

  const handle_dismiss = () => {
    if (offer) dismiss_offer(offer.code);
    set_is_open(false);
  };

  const handle_accept = () => {
    set_is_open(false);
    show_offer_upgrade({ plan_code: tier?.id ?? null, interval: "year" });
  };

  if (!offer || !tier) return null;

  const days_left = days_until(offer.expires_at);

  const expiry_text =
    days_left === null
      ? null
      : days_left === 0
        ? t("settings.win_back_offer_expires_today")
        : days_left === 1
          ? t("settings.win_back_offer_expires_tomorrow")
          : t("settings.win_back_offer_expires_in", { days: days_left });

  const full_monthly_cents = Math.round(tier.yearly_cents / 12);
  const first_year_cents = percent
    ? tier.yearly_cents - Math.round((tier.yearly_cents * percent) / 100)
    : null;
  const offer_monthly_cents =
    first_year_cents === null
      ? full_monthly_cents
      : Math.round(first_year_cents / 12);

  const benefits = checkout_highlights(tier.id, t).slice(0, 3);

  const title =
    percent === null
      ? t("settings.win_back_offer_title", {
          discount: offer.discount_label,
        })
      : t("settings.offer_modal_title", { percent });

  return (
    <Modal
      is_open={is_open && !is_blocked && !upgrade_state.is_open}
      on_close={handle_close}
      panel_class_name="special_offer_panel"
      show_close_button={false}
      size="sm"
    >
      <OfferLedHero percent={percent} plan_name={tier.name} />

      <button
        aria-label={t("common.close")}
        className="absolute end-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-colors hover:bg-black/55 focus:outline-none"
        type="button"
        onClick={handle_close}
      >
        <XMarkIcon className="h-4 w-4" />
      </button>

      <div className="px-6 pb-6 pt-5">
        <ModalTitle className="text-[22px] font-semibold leading-[1.2] tracking-[-0.015em] text-txt-primary">
          {title}
        </ModalTitle>
        <p className="mt-2 text-[13px] leading-relaxed text-txt-secondary">
          {t("settings.offer_modal_subtitle", { plan: tier.name })}
        </p>
        {expiry_text && (
          <p className="mt-2 text-[12px] font-medium text-txt-tertiary">
            {expiry_text}
          </p>
        )}

        <div className="mt-4 flex items-baseline gap-2.5">
          <span className="text-[32px] font-semibold leading-none tracking-[-0.025em] text-txt-primary">
            {money(offer_monthly_cents)}
          </span>
          <span className="text-[13px] font-medium text-txt-secondary">
            {t("settings.per_month_short")}
          </span>
          {percent !== null && (
            <span className="text-[15px] font-medium text-txt-tertiary line-through">
              {money(full_monthly_cents)}
            </span>
          )}
        </div>
        <p className="mt-1.5 mb-4 text-[13px] font-medium text-txt-secondary">
          {first_year_cents === null
            ? t("settings.offer_modal_price_note")
            : t("settings.offer_modal_first_year_note", {
                first: money(first_year_cents),
                price: money(tier.yearly_cents),
              })}
        </p>

        <ul className="special_offer_features">
          {benefits.map((benefit) => (
            <li key={benefit} className="special_offer_feature">
              <CheckCircleIcon
                aria-hidden="true"
                className="special_offer_check h-[18px] w-[18px]"
                strokeWidth={2}
              />
              <p className="special_offer_feature_title">{benefit}</p>
            </li>
          ))}
        </ul>

        <Button
          className="mt-5 w-full !h-11 !text-[15px] !font-semibold"
          variant="depth"
          onClick={handle_accept}
        >
          {t("settings.offer_modal_action")}
        </Button>

        <p className="mt-4 text-center text-[12px] leading-relaxed text-txt-tertiary">
          {t("settings.offer_modal_fine_print", { code: offer.code })}
        </p>

        <button
          className="mt-3.5 w-full text-center text-[12px] text-txt-secondary underline underline-offset-2 transition-colors hover:text-txt-primary"
          type="button"
          onClick={handle_dismiss}
        >
          {t("settings.offer_modal_dismiss")}
        </button>
      </div>
    </Modal>
  );
}
