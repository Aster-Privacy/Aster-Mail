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
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { Modal, ModalTitle } from "@/components/ui/modal";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { format_price, start_hosted_checkout } from "@/services/api/billing";
import {
  PLAN_TIERS,
  convert_cents,
  detect_currency_from_locale,
} from "@/components/settings/billing/billing_constants";
import { PlanPaymentMethodModal } from "@/components/settings/billing/plan_payment_method_modal";
import { CryptoTermModal } from "@/components/settings/billing/crypto_term_modal";
import { use_currency_rates } from "@/components/settings/billing/use_currency_rates";
import {
  SPECIAL_OFFER_DURATION_MONTHS,
  SPECIAL_OFFER_INTERVAL,
  SPECIAL_OFFER_PERCENT_OFF,
  SPECIAL_OFFER_PLAN_CODE,
  special_offer_pricing,
  special_offer_promo_code,
} from "@/lib/special_offer";
import special_offer_hero_url from "@/assets/special_offer_hero.webp";
import {
  close_special_offer,
  show_special_offer,
  use_special_offer_state,
} from "@/stores/special_offer_store";
import {
  claim_special_offer_slot,
  record_special_offer_accepted,
  record_special_offer_dismissed,
  use_special_offer_status,
} from "@/stores/special_offer_status";

const AUTO_SHOW_DELAY_MS = 4000;
const AUTO_SHOW_RETRY_MS = 4000;

function is_another_dialog_open(): boolean {
  if (typeof document === "undefined") return false;

  return document.querySelector("[role='dialog']") !== null;
}

export function SpecialOfferModal() {
  const { t } = use_i18n();
  const { status, is_loaded } = use_special_offer_status();
  const { is_open } = use_special_offer_state();
  const [currency, set_currency] = useState("usd");
  const [is_starting_checkout, set_is_starting_checkout] = useState(false);
  const [is_choosing_method, set_is_choosing_method] = useState(false);
  const [is_choosing_coin, set_is_choosing_coin] = useState(false);
  const [is_hero_loaded, set_is_hero_loaded] = useState(false);
  const hero_ref = useRef<HTMLImageElement | null>(null);

  use_currency_rates();

  useEffect(() => {
    set_currency(detect_currency_from_locale());
  }, []);

  useEffect(() => {
    if (!is_open) {
      set_is_hero_loaded(false);

      return;
    }

    if (hero_ref.current?.complete) set_is_hero_loaded(true);
  }, [is_open]);

  useEffect(() => {
    if (!is_loaded) return;
    if (!status?.auto_show) return;

    let cancelled = false;

    let timer = setTimeout(function attempt() {
      if (is_another_dialog_open()) {
        timer = setTimeout(attempt, AUTO_SHOW_RETRY_MS);

        return;
      }

      void claim_special_offer_slot().then((granted) => {
        if (cancelled || !granted) return;

        show_special_offer("auto");
      });
    }, AUTO_SHOW_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [is_loaded, status?.auto_show]);

  const pricing = useMemo(() => special_offer_pricing(), []);
  const promo_code = useMemo(() => special_offer_promo_code(), []);
  const offer_tier = useMemo(
    () =>
      PLAN_TIERS.find((tier) => tier.id === SPECIAL_OFFER_PLAN_CODE) ?? null,
    [],
  );

  if (!pricing) return null;

  const offer_label = format_price(
    convert_cents(pricing.offer_cents, currency),
    currency,
  );
  const list_label = format_price(
    convert_cents(pricing.list_cents, currency),
    currency,
  );

  const accept = () => {
    if (is_starting_checkout) return;

    void record_special_offer_accepted();
    set_is_choosing_method(true);
  };

  const pay_with_card = async () => {
    if (is_starting_checkout) return;

    set_is_starting_checkout(true);

    const result = await start_hosted_checkout(
      SPECIAL_OFFER_PLAN_CODE,
      SPECIAL_OFFER_INTERVAL,
      currency,
      undefined,
      promo_code ?? undefined,
    );

    set_is_starting_checkout(false);

    if (!result.ok) {
      show_toast(t("settings.special_offer_checkout_error"), "error", 4000);

      return;
    }

    set_is_choosing_method(false);
    close_special_offer();
  };

  const pay_with_crypto = () => {
    if (is_starting_checkout) return;

    set_is_choosing_method(false);
    set_is_choosing_coin(true);
  };

  const dismiss_forever = () => {
    void record_special_offer_dismissed();
    close_special_offer();
    show_toast(t("settings.special_offer_dismissed_toast"), "success", 3000);
  };

  const features = [
    t("settings.special_offer_feature_aliases"),
    t("settings.special_offer_feature_vanguard"),
    t("settings.special_offer_feature_storage"),
  ];

  return (
    <>
      <Modal
        close_on_escape={false}
        close_on_overlay={false}
        is_open={is_open}
        on_close={close_special_offer}
        overlay_class_name="special_offer_overlay"
        panel_class_name="special_offer_panel"
        show_close_button={false}
        size="sm"
      >
        <div className="special_offer_hero rounded-t-xl">
          <img
            ref={hero_ref}
            alt=""
            aria-hidden="true"
            className="special_offer_hero_image"
            src={special_offer_hero_url}
            onError={() => set_is_hero_loaded(true)}
            onLoad={() => set_is_hero_loaded(true)}
          />
        </div>

        <button
          aria-label={t("common.close")}
          className="absolute end-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-colors hover:bg-black/55 focus:outline-none"
          type="button"
          onClick={close_special_offer}
        >
          <XMarkIcon className="h-4 w-4" />
        </button>

        <div className="px-6 pb-6 pt-5">
          <ModalTitle className="text-[22px] font-semibold leading-[1.2] tracking-[-0.015em] text-txt-primary">
            {t("settings.special_offer_title")}
          </ModalTitle>

          <div className="mt-4 flex items-baseline gap-2.5">
            <span className="text-[32px] font-semibold leading-none tracking-[-0.025em] text-txt-primary">
              {offer_label}
            </span>
            <span className="text-[13px] font-medium text-txt-secondary">
              {t("settings.special_offer_price_period")}
            </span>
            <span className="text-[15px] font-medium text-txt-tertiary line-through">
              {list_label}
            </span>
          </div>

          <p className="mt-1.5 mb-4 text-[13px] font-medium text-txt-secondary">
            {t("settings.special_offer_hero_duration", {
              months: String(SPECIAL_OFFER_DURATION_MONTHS),
            })}
          </p>

          <ul className="special_offer_features">
            {features.map((feature) => (
              <li key={feature} className="special_offer_feature">
                <CheckIcon
                  aria-hidden="true"
                  className="special_offer_check h-[15px] w-[15px]"
                  strokeWidth={2.5}
                />
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          <Button
            className="mt-5 w-full !h-11 !text-[15px] !font-semibold"
            disabled={!is_hero_loaded}
            is_loading={!is_hero_loaded}
            variant="depth"
            onClick={accept}
          >
            {t("settings.special_offer_cta", {
              percent: String(SPECIAL_OFFER_PERCENT_OFF),
            })}
          </Button>

          <p className="mt-4 text-center text-[12px] leading-relaxed text-txt-tertiary">
            {t("settings.special_offer_fine_print", {
              offer_price: offer_label,
              price: list_label,
              months: String(SPECIAL_OFFER_DURATION_MONTHS),
            })}
          </p>

          <button
            className="mt-3.5 w-full text-center text-[12px] text-txt-secondary underline underline-offset-2 transition-colors hover:text-txt-primary"
            type="button"
            onClick={dismiss_forever}
          >
            {t("settings.special_offer_dismiss")}
          </button>
        </div>
      </Modal>

      {offer_tier && is_choosing_method && (
        <PlanPaymentMethodModal
          busy={is_starting_checkout}
          discount_duration_months={SPECIAL_OFFER_DURATION_MONTHS}
          discount_percent_off={SPECIAL_OFFER_PERCENT_OFF}
          on_choose_card={() => void pay_with_card()}
          on_choose_crypto={pay_with_crypto}
          on_close={() => {
            if (is_starting_checkout) return;
            set_is_choosing_method(false);
          }}
          open={is_choosing_method}
          plan_name={offer_tier.name}
          selected_term="monthly"
          term_options={[
            {
              id: "monthly",
              label: t("settings.billing_monthly"),
              per_month_cents: pricing.offer_cents,
              total_cents: pricing.offer_cents,
              save_cents: pricing.list_cents - pricing.offer_cents,
            },
          ]}
        />
      )}

      {offer_tier && is_choosing_coin && (
        <CryptoTermModal
          initial_term_months={SPECIAL_OFFER_DURATION_MONTHS}
          is_open={is_choosing_coin}
          monthly_price_cents={offer_tier.monthly_cents}
          on_checkout_opened={close_special_offer}
          on_close={() => {
            set_is_choosing_coin(false);
            set_is_choosing_method(true);
          }}
          plan_code={SPECIAL_OFFER_PLAN_CODE}
          plan_name={offer_tier.name}
          preferred_currency={currency}
          promo_code={promo_code}
          yearly_price_cents={offer_tier.yearly_cents}
        />
      )}
    </>
  );
}
