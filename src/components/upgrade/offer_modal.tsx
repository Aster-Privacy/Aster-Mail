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
import { CheckIcon } from "@heroicons/react/24/solid";
import { Button } from "@aster/ui";

import {
  dismiss_offer,
  offer_discount_percent,
  should_show_offer,
  snooze_offer,
} from "./offer_state";
import { OfferHero } from "./offer_hero";

import {
  Modal,
  ModalBody,
  ModalDescription,
  ModalTitle,
} from "@/components/ui/modal";
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
  const offer_monthly_cents = percent
    ? Math.round((full_monthly_cents * (100 - percent)) / 100)
    : full_monthly_cents;

  const benefits = checkout_highlights(tier.id, t).slice(0, 3);

  return (
    <Modal
      is_open={is_open && !is_blocked && !upgrade_state.is_open}
      on_close={handle_close}
      size="sm"
    >
      <div className="relative h-40 overflow-hidden rounded-t-xl">
        <OfferHero
          label={
            percent === null
              ? t("settings.win_back_offer_title", {
                  discount: offer.discount_label,
                })
              : t("settings.offer_modal_title", { percent })
          }
        />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-16"
          style={{
            backgroundImage:
              "linear-gradient(to top, var(--modal-bg), transparent)",
          }}
        />

        {percent !== null && (
          <span className="plan_galaxy_badge absolute start-5 top-5 inline-flex items-center rounded-full px-3 py-1 text-xs font-bold tracking-wide">
            {t("settings.offer_modal_badge", { percent })}
          </span>
        )}

        {expiry_text && (
          <span className="absolute end-5 top-5 inline-flex items-center rounded-full bg-black/35 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
            {expiry_text}
          </span>
        )}
      </div>

      <ModalBody className="space-y-5 pt-1">
        <div className="text-center">
          <ModalTitle className="text-[22px] font-bold leading-tight">
            {percent === null
              ? t("settings.win_back_offer_title", {
                  discount: offer.discount_label,
                })
              : t("settings.offer_modal_title", { percent })}
          </ModalTitle>
          <ModalDescription className="mt-1.5 text-[13px]">
            {t("settings.offer_modal_subtitle", { plan: tier.name })}
          </ModalDescription>
        </div>

        <div className="rounded-2xl border border-edge-secondary bg-surf-tertiary px-4 py-3.5 text-center">
          <div className="flex items-baseline justify-center gap-2">
            <span className="text-[34px] font-bold leading-none tracking-tight text-txt-primary">
              {money(offer_monthly_cents)}
            </span>
            {percent !== null && (
              <span className="text-base text-txt-muted line-through">
                {money(full_monthly_cents)}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs text-txt-muted">
            {t("settings.offer_modal_price_note")}
          </p>
        </div>

        <Button
          className="plan_galaxy_cta w-full"
          size="xl"
          variant="primary"
          onClick={handle_accept}
        >
          {t("settings.offer_modal_action")}
        </Button>

        <ul className="space-y-2.5">
          {benefits.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2.5">
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full"
                style={{
                  backgroundColor:
                    "color-mix(in srgb, var(--accent-color) 16%, transparent)",
                }}
              >
                <CheckIcon
                  className="h-3 w-3"
                  style={{ color: "var(--accent-color)" }}
                />
              </span>
              <span className="text-[13px] text-txt-secondary">{benefit}</span>
            </li>
          ))}
        </ul>

        <div className="border-t border-edge-secondary pt-4 text-center">
          <p className="text-[11px] leading-relaxed text-txt-muted">
            {t("settings.offer_modal_fine_print", { code: offer.code })}
          </p>
          <button
            className="mt-3 text-xs font-medium text-txt-muted underline underline-offset-2"
            type="button"
            onClick={handle_dismiss}
          >
            {t("settings.offer_modal_dismiss")}
          </button>
        </div>
      </ModalBody>
    </Modal>
  );
}
