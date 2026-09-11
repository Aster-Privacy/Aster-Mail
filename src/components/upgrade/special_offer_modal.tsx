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
import { use_auth } from "@/contexts/auth_context";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import { use_special_offer_checkout } from "@/hooks/use_special_offer_checkout";
import { use_i18n } from "@/lib/i18n/context";
import { format_price, start_hosted_checkout } from "@/services/api/billing";
import {
  PLAN_TIERS,
  convert_cents,
  detect_currency_from_locale,
} from "@/components/settings/billing/billing_constants";
import { use_currency_rates } from "@/components/settings/billing/use_currency_rates";
import { PlanPaymentMethodModal } from "@/components/settings/billing/plan_payment_method_modal";
import { CryptoTermModal } from "@/components/settings/billing/crypto_term_modal";
import {
  SPECIAL_OFFER_DURATION_MONTHS,
  SPECIAL_OFFER_INTERVAL,
  SPECIAL_OFFER_PERCENT_OFF,
  SPECIAL_OFFER_PLAN_CODE,
  is_special_offer_available,
  special_offer_pricing,
  special_offer_promo_code,
} from "@/lib/special_offer";
import special_offer_hero_url from "@/assets/special_offer_hero.webp";
import {
  can_show_special_offer,
  close_special_offer,
  show_special_offer,
  use_special_offer_state,
} from "@/stores/special_offer_store";
import {
  claim_special_offer_slot,
  get_special_offer_generation,
  record_special_offer_accepted,
  record_special_offer_dismissed,
  refresh_special_offer_status,
  use_special_offer_status,
} from "@/stores/special_offer_status";

const AUTO_SHOW_DELAY_MS = 4000;
const AUTO_SHOW_RETRY_MS = 4000;

type checkout_step = "method" | "crypto" | null;

function is_another_dialog_open(): boolean {
  if (typeof document === "undefined") return false;

  return document.querySelector("[role='dialog']") !== null;
}

export function SpecialOfferModal() {
  const { t } = use_i18n();
  const { status, is_loaded } = use_special_offer_status();
  const offer_checkout = use_special_offer_checkout();
  const { is_open } = use_special_offer_state();
  const { is_authenticated, user } = use_auth();
  const { plan_code, refresh: refresh_plan_limits } = use_plan_limits();
  const [currency, set_currency] = useState("usd");
  const [is_accepting, set_is_accepting] = useState(false);
  const [is_hero_loaded, set_is_hero_loaded] = useState(false);
  const [step, set_step] = useState<checkout_step>(null);
  const [is_starting_checkout, set_is_starting_checkout] = useState(false);
  const hero_ref = useRef<HTMLImageElement | null>(null);
  const accepting_ref = useRef(false);
  const starting_checkout_ref = useRef(false);
  const checkout_opened_ref = useRef(false);
  const user_id = is_authenticated ? (user?.id ?? null) : null;
  const is_offer_active =
    is_loaded &&
    !!status?.available &&
    is_special_offer_available({
      plan_code,
      is_dismissed: status?.dismissed ?? false,
    });
  const can_auto_show = is_offer_active && !!status?.auto_show;

  use_currency_rates();

  useEffect(() => {
    if (user_id) void refresh_plan_limits();
  }, [user_id, refresh_plan_limits]);

  useEffect(() => {
    set_step(null);
  }, [user_id]);

  useEffect(() => {
    if (!is_offer_active) set_step(null);
  }, [is_offer_active]);

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
    if (!can_auto_show) return;

    let timer = setTimeout(function attempt() {
      if (is_another_dialog_open() || !can_show_special_offer()) {
        timer = setTimeout(attempt, AUTO_SHOW_RETRY_MS);

        return;
      }

      const claim_generation = get_special_offer_generation();

      void claim_special_offer_slot().then((granted) => {
        if (!granted) return;
        if (claim_generation !== get_special_offer_generation()) return;

        show_special_offer("auto");
      });
    }, AUTO_SHOW_DELAY_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [can_auto_show, user_id]);

  const pricing = useMemo(() => special_offer_pricing(), []);
  const promo_code = useMemo(() => special_offer_promo_code(), []);
  const offer_tier = useMemo(
    () => PLAN_TIERS.find((tier) => tier.id === SPECIAL_OFFER_PLAN_CODE),
    [],
  );

  if (!pricing || !offer_tier) return null;

  const offer_label = format_price(
    convert_cents(pricing.offer_cents, currency),
    currency,
  );
  const list_label = format_price(
    convert_cents(pricing.list_cents, currency),
    currency,
  );

  const accept = async () => {
    if (accepting_ref.current) return;

    accepting_ref.current = true;
    set_is_accepting(true);

    try {
      const accepted = await record_special_offer_accepted();

      if (!accepted) {
        show_toast(t("settings.special_offer_checkout_error"), "error", 4000);
        void refresh_special_offer_status();

        return;
      }

      close_special_offer();
      set_step("method");
    } finally {
      accepting_ref.current = false;
      set_is_accepting(false);
    }
  };

  const pay_with_card = async () => {
    if (starting_checkout_ref.current) return;

    starting_checkout_ref.current = true;
    set_is_starting_checkout(true);

    try {
      const result = await start_hosted_checkout(
        SPECIAL_OFFER_PLAN_CODE,
        SPECIAL_OFFER_INTERVAL,
        currency,
        undefined,
        promo_code ?? undefined,
      );

      if (!result.ok) {
        show_toast(t("settings.special_offer_checkout_error"), "error", 4000);

        return;
      }

      set_step(null);
    } finally {
      starting_checkout_ref.current = false;
      set_is_starting_checkout(false);
    }
  };

  const pay_with_crypto = () => {
    if (starting_checkout_ref.current) return;

    checkout_opened_ref.current = false;
    set_step("crypto");
  };

  const close_method_step = () => {
    if (starting_checkout_ref.current) return;

    set_step(null);
  };

  const handle_crypto_checkout_opened = () => {
    checkout_opened_ref.current = true;
    set_step(null);
  };

  const close_crypto_step = () => {
    set_step(checkout_opened_ref.current ? null : "method");
  };

  const dismiss_forever = () => {
    if (accepting_ref.current) return;

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
      <PlanPaymentMethodModal
        busy={is_starting_checkout}
        card_currency={currency}
        discount_duration_months={SPECIAL_OFFER_DURATION_MONTHS}
        discount_percent_off={SPECIAL_OFFER_PERCENT_OFF}
        on_choose_card={() => void pay_with_card()}
        on_choose_crypto={pay_with_crypto}
        on_close={close_method_step}
        open={step === "method"}
        plan_name={offer_tier.name}
        selected_term="monthly"
        special_offer={offer_checkout.plan_pricing(SPECIAL_OFFER_PLAN_CODE)}
        term_options={[
          {
            id: "monthly",
            label: t("settings.billing_monthly"),
            per_month_cents: pricing.list_cents,
            total_cents: pricing.list_cents,
            save_cents: 0,
          },
        ]}
      />
      <CryptoTermModal
        discount_percent_off={offer_checkout.percent_off}
        discounted_price_cents={offer_checkout.crypto_price(
          SPECIAL_OFFER_PLAN_CODE,
        )}
        initial_term_months={1}
        is_open={step === "crypto"}
        monthly_price_cents={offer_tier.monthly_cents}
        on_checkout_opened={handle_crypto_checkout_opened}
        on_close={close_crypto_step}
        plan_code={SPECIAL_OFFER_PLAN_CODE}
        plan_name={offer_tier.name}
        preferred_currency={currency}
        promo_code={promo_code}
        yearly_price_cents={offer_tier.yearly_cents}
      />
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
            disabled={!is_hero_loaded || is_accepting}
            is_loading={!is_hero_loaded || is_accepting}
            variant="depth"
            onClick={() => void accept()}
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
            className="mt-3.5 w-full text-center text-[12px] text-txt-secondary underline underline-offset-2 transition-colors hover:text-txt-primary disabled:pointer-events-none disabled:opacity-50"
            disabled={is_accepting}
            type="button"
            onClick={dismiss_forever}
          >
            {t("settings.special_offer_dismiss")}
          </button>
        </div>
      </Modal>
    </>
  );
}
