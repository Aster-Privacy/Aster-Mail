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
import {
  ChevronDownIcon,
  InformationCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { Modal, ModalTitle } from "@/components/ui/modal";
import { show_toast } from "@/components/toast/simple_toast";
import { use_auth } from "@/contexts/auth_context";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import { use_special_offer_checkout } from "@/hooks/use_special_offer_checkout";
import { use_i18n } from "@/lib/i18n/context";
import {
  format_price,
  remember_checkout_target,
  start_hosted_checkout,
} from "@/services/api/billing";
import { create_family_group } from "@/services/api/family";
import { is_tauri_env } from "@/services/api/client/helpers";
import { request_cache } from "@/services/api/request_cache";
import {
  FAMILY_PLAN_TIERS,
  PLAN_TIERS,
  convert_cents,
  detect_currency_from_locale,
} from "@/components/settings/billing/billing_constants";
import { use_currency_rates } from "@/components/settings/billing/use_currency_rates";
import { PlanPaymentMethodModal } from "@/components/settings/billing/plan_payment_method_modal";
import { CryptoTermModal } from "@/components/settings/billing/crypto_term_modal";
import { Segmented } from "@/components/settings/billing/plan_card";
import { OfferCountdown } from "@/components/upgrade/offer_countdown";
import { SpecialOfferFeatureList } from "@/components/upgrade/special_offer_success_modal";
import {
  SPECIAL_OFFER_DURATION_MONTHS,
  SPECIAL_OFFER_PERCENT_OFF,
  SPECIAL_OFFER_PLAN_CODE,
  type SpecialOfferInterval,
  is_special_offer_active,
  offer_plan_codes,
  special_offer_discounted_cents,
  special_offer_interval_months,
  special_offer_pricing,
  special_offer_can_auto_show,
  special_offer_promo_code,
} from "@/lib/special_offer";
import special_offer_hero_url from "@/assets/special_offer_hero.webp";
import { SpecialOfferHeroLockup } from "@/components/upgrade/special_offer_hero_lockup";
import {
  can_auto_show_special_offer,
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

const BLACK_FRIDAY_THEME = "black_friday";

function find_plan_tier(code: string) {
  return (
    PLAN_TIERS.find((tier) => tier.id === code) ??
    FAMILY_PLAN_TIERS.find((tier) => tier.id === code)
  );
}

interface OfferCheckoutResult {
  ok: boolean;
  server_code?: string;
}

async function start_offer_family_checkout(
  plan_code: string,
  interval: SpecialOfferInterval,
  special_offer: boolean,
  promo_code: string | undefined,
): Promise<OfferCheckoutResult> {
  try {
    const is_tauri = is_tauri_env();
    const origin = is_tauri
      ? "https://app.astermail.org"
      : window.location.origin;

    const response = await create_family_group(
      plan_code,
      interval,
      `${origin}/?family=success`,
      `${origin}/?family=cancelled`,
      promo_code,
      special_offer || undefined,
    );
    const checkout_url = response.data?.checkout_url;

    if (!checkout_url) return { ok: false, server_code: response.server_code };

    const parsed = new URL(checkout_url);

    if (parsed.protocol !== "https:") return { ok: false };

    remember_checkout_target(plan_code, interval, special_offer);

    if (is_tauri) {
      const core = await import("@tauri-apps/api/core");

      await core.invoke("open_external_url", { url: parsed.toString() });
    } else {
      window.location.href = parsed.toString();
    }

    return { ok: true };
  } catch {
    return { ok: false };
  }
}

function is_another_dialog_open(): boolean {
  if (typeof document === "undefined") return false;

  return document.querySelector("[role='dialog']") !== null;
}

export function SpecialOfferModal() {
  const { t } = use_i18n();
  const { status, is_loaded } = use_special_offer_status();
  const offer_checkout = use_special_offer_checkout();
  const { is_open, checkout_seq, checkout_interval, checkout_plan_code } =
    use_special_offer_state();
  const { is_authenticated, user } = use_auth();
  const { plan_code, refresh: refresh_plan_limits } = use_plan_limits();
  const [currency, set_currency] = useState("usd");
  const [interval_choice, set_interval] = useState<SpecialOfferInterval | null>(
    null,
  );
  const [plan_choice, set_plan_choice] = useState<string | null>(null);
  const [is_accepting, set_is_accepting] = useState(false);
  const [is_hero_loaded, set_is_hero_loaded] = useState(false);
  const [step, set_step] = useState<checkout_step>(null);
  const [is_starting_checkout, set_is_starting_checkout] = useState(false);
  const [is_why_open, set_is_why_open] = useState(false);
  const hero_ref = useRef<HTMLImageElement | null>(null);
  const accepting_ref = useRef(false);
  const starting_checkout_ref = useRef(false);
  const checkout_opened_ref = useRef(false);
  const handled_checkout_seq_ref = useRef(0);
  const opened_from_popup_ref = useRef(false);
  const pending_desktop_checkout_ref = useRef(false);
  const user_id = is_authenticated ? (user?.id ?? null) : null;
  const is_offer_active = is_special_offer_active({
    status,
    is_loaded,
    plan_code,
  });
  const can_auto_show = special_offer_can_auto_show({
    status,
    is_loaded,
    plan_code,
  });
  const eligible_terms_key = status?.eligible_terms?.join(",") ?? "";
  const plan_codes = useMemo(() => offer_plan_codes(status), [status]);
  const default_plan_code =
    status?.plan_code && plan_codes.includes(status.plan_code)
      ? status.plan_code
      : (plan_codes[0] ?? SPECIAL_OFFER_PLAN_CODE);
  const selected_plan =
    plan_choice && plan_codes.includes(plan_choice)
      ? plan_choice
      : default_plan_code;
  const interval: SpecialOfferInterval =
    interval_choice ?? (status?.ends_at ? "year" : "month");
  const was_offer_active_ref = useRef(is_offer_active);
  const previous_user_id_ref = useRef(user_id);

  use_currency_rates();

  useEffect(() => {
    if (user_id) void refresh_plan_limits();
  }, [user_id, refresh_plan_limits]);

  useEffect(() => {
    set_step(null);
    pending_desktop_checkout_ref.current = false;
  }, [user_id]);

  useEffect(() => {
    const handle_focus = () => {
      if (!pending_desktop_checkout_ref.current) return;
      pending_desktop_checkout_ref.current = false;
      request_cache.invalidate("/payments/v1");
      void refresh_plan_limits(true);
      void refresh_special_offer_status();
    };

    window.addEventListener("focus", handle_focus);

    return () => window.removeEventListener("focus", handle_focus);
  }, [refresh_plan_limits]);

  useEffect(() => {
    const was_offer_active = was_offer_active_ref.current;

    was_offer_active_ref.current = is_offer_active;
    if (is_offer_active || !was_offer_active) return;

    set_step(null);
    close_special_offer();
  }, [is_offer_active]);

  useEffect(() => {
    if (previous_user_id_ref.current === user_id) return;

    previous_user_id_ref.current = user_id;
    close_special_offer();
  }, [user_id]);

  useEffect(() => {
    if (!is_offer_active || checkout_seq === handled_checkout_seq_ref.current)
      return;

    handled_checkout_seq_ref.current = checkout_seq;

    opened_from_popup_ref.current = false;
    set_interval(checkout_interval);
    set_plan_choice(checkout_plan_code);
    set_step("method");
  }, [checkout_seq, checkout_interval, checkout_plan_code, is_offer_active]);

  useEffect(() => {
    set_currency(detect_currency_from_locale());
  }, []);

  useEffect(() => {
    if (!is_open) {
      set_is_hero_loaded(false);
      set_is_why_open(false);

      return;
    }

    if (hero_ref.current?.complete) set_is_hero_loaded(true);

    if (opened_from_popup_ref.current) {
      opened_from_popup_ref.current = false;

      return;
    }

    set_plan_choice(null);
    set_interval(null);
  }, [is_open]);

  useEffect(() => {
    set_plan_choice(null);
    set_interval(null);
  }, [eligible_terms_key]);

  useEffect(() => {
    if (!can_auto_show) return;

    let timer = setTimeout(function attempt() {
      if (is_another_dialog_open() || !can_auto_show_special_offer()) {
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

  const percent_off = status?.percent_off ?? SPECIAL_OFFER_PERCENT_OFF;
  const duration_months =
    status?.duration_months ?? SPECIAL_OFFER_DURATION_MONTHS;
  const pricing = useMemo(
    () => special_offer_pricing(interval, selected_plan, percent_off),
    [interval, selected_plan, percent_off],
  );
  const promo_code = useMemo(() => special_offer_promo_code(), []);
  const offer_tier = useMemo(
    () => find_plan_tier(selected_plan),
    [selected_plan],
  );

  if (!pricing || !offer_tier) return null;

  const is_yearly = interval === "year";
  const term_id = is_yearly ? "yearly" : "monthly";
  const is_black_friday = status?.theme === BLACK_FRIDAY_THEME;
  const is_family_plan = selected_plan === "duo" || selected_plan === "family";
  const is_covered = offer_checkout.covers(selected_plan, interval);
  const is_plan_list = plan_codes.length > 1;

  const change_interval = (next: SpecialOfferInterval) => {
    set_interval(next);
    if (offer_checkout.covers(selected_plan, next)) return;

    const fallback = plan_codes.find((code) =>
      offer_checkout.covers(code, next),
    );

    if (fallback) set_plan_choice(fallback);
  };

  const plan_price_labels = (code: string, covered: boolean) => {
    const row_pricing = special_offer_pricing(interval, code, percent_off);

    if (!row_pricing) return null;

    const list_cents = convert_cents(row_pricing.list_cents, currency);

    return {
      offer: format_price(
        covered
          ? special_offer_discounted_cents(list_cents, percent_off)
          : list_cents,
        currency,
      ),
      list: format_price(list_cents, currency),
    };
  };

  const offer_label = format_price(
    is_covered
      ? special_offer_discounted_cents(
          convert_cents(pricing.list_cents, currency),
          percent_off,
        )
      : convert_cents(pricing.list_cents, currency),
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
      opened_from_popup_ref.current = true;
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
      const result: OfferCheckoutResult = is_family_plan
        ? await start_offer_family_checkout(
            selected_plan,
            interval,
            is_covered,
            promo_code ?? undefined,
          )
        : await start_hosted_checkout(
            selected_plan,
            interval,
            currency,
            undefined,
            promo_code ?? undefined,
            is_covered || undefined,
          );

      if (!result.ok) {
        const offer_gone = result.server_code === "SPECIAL_OFFER_UNAVAILABLE";

        if (offer_gone) {
          void refresh_special_offer_status();
        }
        show_toast(
          offer_gone
            ? t("settings.special_offer_unavailable")
            : t("settings.special_offer_checkout_error"),
          "error",
          4000,
        );

        return;
      }

      if (is_tauri_env()) pending_desktop_checkout_ref.current = true;
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
    if (opened_from_popup_ref.current) show_special_offer("manual");
  };

  const handle_crypto_checkout_opened = () => {
    checkout_opened_ref.current = true;
    if (is_tauri_env()) pending_desktop_checkout_ref.current = true;
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

  return (
    <>
      <PlanPaymentMethodModal
        busy={is_starting_checkout}
        card_currency={currency}
        discount_duration_months={duration_months}
        discount_percent_off={percent_off}
        on_choose_card={() => void pay_with_card()}
        on_choose_crypto={pay_with_crypto}
        on_close={close_method_step}
        open={step === "method"}
        plan_name={offer_tier.name}
        selected_term={term_id}
        special_offer={
          is_covered ? offer_checkout.plan_pricing(selected_plan) : undefined
        }
        term_options={[
          {
            id: term_id,
            label: t(
              is_yearly
                ? "settings.billing_yearly"
                : "settings.billing_monthly",
            ),
            per_month_cents: Math.round(
              pricing.list_cents / special_offer_interval_months(interval),
            ),
            total_cents: pricing.list_cents,
            save_cents: 0,
          },
        ]}
      />
      <CryptoTermModal
        special_offer
        discount_percent_off={offer_checkout.percent_off}
        discounted_price_cents={offer_checkout.crypto_price(selected_plan)}
        initial_term_months={special_offer_interval_months(interval)}
        is_open={step === "crypto"}
        monthly_price_cents={offer_tier.monthly_cents}
        on_checkout_opened={handle_crypto_checkout_opened}
        on_close={close_crypto_step}
        plan_code={selected_plan}
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
        <div
          className="special_offer_hero rounded-t-xl"
          onDragStart={(event) => event.preventDefault()}
        >
          <img
            ref={hero_ref}
            alt=""
            aria-hidden="true"
            className="special_offer_hero_image"
            draggable={false}
            src={special_offer_hero_url}
            onError={() => set_is_hero_loaded(true)}
            onLoad={() => set_is_hero_loaded(true)}
          />
          <SpecialOfferHeroLockup plan_name={offer_tier.name} />
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
            {is_black_friday
              ? t("settings.special_offer_black_friday_title", {
                  percent: String(percent_off),
                  months: String(duration_months),
                })
              : t("settings.special_offer_title")}
          </ModalTitle>

          {is_black_friday && (
            <>
              <p className="mt-2 text-[13px] leading-relaxed text-txt-secondary">
                {t("settings.special_offer_black_friday_body", {
                  percent: String(percent_off),
                  months: String(duration_months),
                })}
              </p>
              {status?.ends_at && (
                <OfferCountdown
                  class_name="mt-2 block text-[12px] font-medium text-txt-tertiary"
                  ends_at={status.ends_at}
                />
              )}
            </>
          )}

          <div
            aria-label={t("settings.special_offer_billing_period")}
            className={is_plan_list ? "mt-5" : "mt-4 w-56"}
            role="group"
          >
            <Segmented
              on_change={change_interval}
              options={[
                { id: "month", label: t("settings.billing_monthly") },
                { id: "year", label: t("settings.billing_yearly") },
              ]}
              value={interval}
            />
          </div>

          {is_plan_list ? (
            <div
              aria-label={t("settings.special_offer_choose_plan")}
              className="special_offer_plans"
              role="radiogroup"
            >
              {plan_codes.map((code) => {
                const tier = find_plan_tier(code);
                const covered = offer_checkout.covers(code, interval);
                const labels = plan_price_labels(code, covered);
                const is_selected = code === selected_plan;
                const is_star_monthly = code === "star" && interval === "month";

                return (
                  <label
                    key={code}
                    className="special_offer_plan"
                    data-disabled={!covered || undefined}
                    data-selected={is_selected || undefined}
                  >
                    <input
                      checked={is_selected}
                      className="sr-only"
                      disabled={!covered}
                      name="special_offer_plan"
                      type="radio"
                      value={code}
                      onChange={() => set_plan_choice(code)}
                    />
                    <span aria-hidden="true" className="special_offer_radio" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold leading-5 text-txt-primary">
                        {tier?.name ?? code}
                      </span>
                      {is_star_monthly && (
                        <span className="block text-[12px] leading-4 text-txt-tertiary">
                          {t("settings.special_offer_not_on_star_monthly")}
                        </span>
                      )}
                    </span>
                    {labels && (
                      <span className="flex shrink-0 items-baseline gap-2">
                        {covered && (
                          <span className="text-[12px] text-txt-tertiary line-through">
                            {labels.list}
                          </span>
                        )}
                        <span className="text-[14px] font-semibold text-txt-primary">
                          {labels.offer}
                          <span className="text-[12px] font-medium text-txt-tertiary">
                            {t(
                              is_yearly
                                ? "settings.per_year_short"
                                : "settings.per_month_short",
                            )}
                          </span>
                        </span>
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          ) : (
            <>
              <div className="mt-4 flex items-baseline gap-2.5">
                <span className="text-[32px] font-semibold leading-none tracking-[-0.025em] text-txt-primary">
                  {offer_label}
                </span>
                <span className="text-[13px] font-medium text-txt-secondary">
                  {t(
                    is_yearly
                      ? "settings.special_offer_price_period_year"
                      : "settings.special_offer_price_period",
                  )}
                </span>
                {is_covered && (
                  <span className="text-[15px] font-medium text-txt-tertiary line-through">
                    {list_label}
                  </span>
                )}
              </div>
              <p className="mt-1.5 mb-4 text-[13px] font-medium text-txt-secondary">
                {is_covered
                  ? is_yearly
                    ? t("settings.special_offer_hero_duration_year")
                    : t("settings.special_offer_hero_duration", {
                        months: String(duration_months),
                      })
                  : null}
              </p>
              <SpecialOfferFeatureList />
            </>
          )}

          <div className="mt-4">
            <button
              aria-controls="special_offer_why_body"
              aria-expanded={is_why_open}
              className="special_offer_why_toggle"
              type="button"
              onClick={() => set_is_why_open((open) => !open)}
            >
              <InformationCircleIcon
                aria-hidden="true"
                className="h-[15px] w-[15px] shrink-0"
              />
              <span>{t("settings.special_offer_why_label")}</span>
              <ChevronDownIcon
                aria-hidden="true"
                className="special_offer_why_chevron h-4 w-4"
              />
            </button>
            {is_why_open && (
              <p className="special_offer_why_body" id="special_offer_why_body">
                {t("settings.special_offer_why_body")}
              </p>
            )}
          </div>

          {is_covered && (
            <Button
              className="mt-5 w-full !h-11 !text-[15px] !font-semibold"
              disabled={!is_hero_loaded || is_accepting}
              is_loading={!is_hero_loaded || is_accepting}
              variant="depth"
              onClick={() => void accept()}
            >
              {t("settings.special_offer_cta", {
                percent: String(percent_off),
              })}
            </Button>
          )}

          {is_covered && (
            <p className="mt-4 text-center text-[12px] leading-relaxed text-txt-tertiary">
              {is_black_friday
                ? t("settings.special_offer_renews_at", {
                    price: list_label,
                    months: String(duration_months),
                  })
                : t(
                    is_yearly
                      ? "settings.special_offer_fine_print_year"
                      : "settings.special_offer_fine_print",
                    {
                      offer_price: offer_label,
                      price: list_label,
                      months: String(duration_months),
                    },
                  )}
            </p>
          )}

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
