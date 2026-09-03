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
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckIcon } from "@heroicons/react/20/solid";
import {
  CreditCardIcon,
  CurrencyDollarIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TagIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import {
  CardBrandMarks,
  CoinStack,
  SecurityMarks,
} from "@/components/settings/billing/payment_brand_marks";
import { PlanFeaturesModal } from "@/components/settings/billing/plan_features_modal";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { use_i18n } from "@/lib/i18n/context";
import { format_price } from "@/services/api/billing";
import text_logo_url from "@/assets/text_logo.webp";

export interface plan_term_option {
  id: string;
  label: string;
  per_month_cents: number;
  total_cents: number;
  save_cents: number;
  crypto_only?: boolean;
}

type pay_method = "card" | "crypto";

export interface plan_choice_option {
  id: string;
  name: string;
  price_label: string;
  note?: string;
  is_recommended?: boolean;
}

export interface plan_feature_line {
  label: ReactNode;
  on?: boolean;
}

interface plan_payment_method_modal_props {
  open: boolean;
  plan_name: string;
  term_options?: plan_term_option[];
  selected_term?: string;
  on_select_term?: (id: string) => void;
  plan_choices?: plan_choice_option[];
  selected_plan_id?: string;
  on_select_plan?: (id: string) => void;
  features?: plan_feature_line[];
  full_feature_lines?: plan_feature_line[];
  comparison_plan_code?: string | null;
  busy?: boolean;
  credit_balance_cents?: number;
  credits_apply_to_card?: boolean;
  discount_percent_off?: number;
  discount_duration_months?: number;
  on_close: () => void;
  on_choose_card: (term_id?: string) => void;
  on_choose_crypto: (term_id?: string) => void;
}

const selected_tint =
  "color-mix(in srgb, var(--accent-color) 14%, transparent)";

function section_heading(text: string) {
  return (
    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-txt-muted">
      {text}
    </p>
  );
}

const tile_base =
  "relative rounded-xl border text-start transition-colors focus:outline-none disabled:pointer-events-none disabled:opacity-50";

function tile_style(active: boolean) {
  return active
    ? {
        borderColor: "var(--accent-color)",
        backgroundColor: selected_tint,
        boxShadow: "0 0 0 1px var(--accent-color)",
      }
    : undefined;
}

function tile_check(active: boolean) {
  if (!active) return null;

  return (
    <span
      aria-hidden="true"
      className="absolute end-2 top-2 flex h-4 w-4 items-center justify-center rounded-full"
      style={{ backgroundColor: "var(--accent-color)" }}
    >
      <CheckIcon
        className="h-2.5 w-2.5"
        style={{ color: "var(--accent-fg, #ffffff)" }}
      />
    </span>
  );
}

export function PlanPaymentMethodModal({
  open,
  plan_name,
  term_options,
  selected_term,
  on_select_term,
  plan_choices,
  selected_plan_id,
  on_select_plan,
  features,
  full_feature_lines,
  comparison_plan_code,
  busy = false,
  credit_balance_cents,
  credits_apply_to_card = true,
  discount_percent_off,
  discount_duration_months,
  on_close,
  on_choose_card,
  on_choose_crypto,
}: plan_payment_method_modal_props) {
  const { t } = use_i18n();
  const [active_term, set_active_term] = useState(selected_term);
  const [method, set_method] = useState<pay_method>("card");
  const [features_open, set_features_open] = useState(false);
  const has_plan_features = !!features && features.length > 0;
  const [confirm_abandon, set_confirm_abandon] = useState(false);
  const opened_plan_ref = useRef<string | undefined>(undefined);
  const opened_term_ref = useRef<string | undefined>(undefined);
  const was_open_ref = useRef(false);

  useEffect(() => {
    if (open && !was_open_ref.current) {
      was_open_ref.current = true;
      opened_plan_ref.current = selected_plan_id;
      opened_term_ref.current = selected_term;
      set_active_term(selected_term);
      set_method("card");
      set_features_open(false);
      set_confirm_abandon(false);
    }

    if (!open) {
      was_open_ref.current = false;
      set_features_open(false);
      set_confirm_abandon(false);
    }
  }, [open, selected_term, selected_plan_id]);

  const term_id = active_term ?? selected_term;
  const active_option = term_options?.find((option) => option.id === term_id);
  const card_unavailable = !!active_option?.crypto_only;
  const effective_method: pay_method = card_unavailable ? "crypto" : method;
  const active_choice = plan_choices?.find(
    (choice) => choice.id === selected_plan_id,
  );
  const summary_name = active_choice?.name ?? plan_name;
  const best_value_id = (term_options ?? []).reduce<plan_term_option | null>(
    (best, option) =>
      option.save_cents > 0 && (!best || option.save_cents > best.save_cents)
        ? option
        : best,
    null,
  )?.id;
  const credit_amount =
    credits_apply_to_card && credit_balance_cents && credit_balance_cents > 0
      ? format_price(credit_balance_cents)
      : null;
  const discount_note =
    discount_percent_off &&
    discount_percent_off > 0 &&
    discount_duration_months &&
    discount_duration_months > 0
      ? t(
          discount_duration_months === 1
            ? "settings.first_addon_discount_applied_singular"
            : "settings.first_addon_discount_applied",
          {
            percent: String(discount_percent_off),
            months: String(discount_duration_months),
          },
        )
      : null;
  const amount_due = active_option
    ? format_price(active_option.total_cents)
    : null;

  const methods: {
    id: pay_method;
    label: string;
    note: string;
    icon: typeof CreditCardIcon;
    disabled: boolean;
  }[] = [
    {
      id: "card",
      label: t("settings.checkout_method_card"),
      note: t("settings.checkout_method_card_note"),
      icon: CreditCardIcon,
      disabled: card_unavailable,
    },
    {
      id: "crypto",
      label: t("settings.checkout_method_crypto"),
      note: t("settings.crypto_no_renew_notice"),
      icon: CurrencyDollarIcon,
      disabled: false,
    },
  ];

  const has_changes =
    term_id !== opened_term_ref.current ||
    selected_plan_id !== opened_plan_ref.current ||
    method !== "card";

  const request_close = () => {
    if (busy) return;

    if (has_changes) {
      set_confirm_abandon(true);

      return;
    }
    on_close();
  };

  const handle_continue = () => {
    if (effective_method === "crypto") {
      on_choose_crypto(term_id);

      return;
    }
    on_choose_card(term_id);
  };

  return (
    <Modal
      show_close_button
      close_on_escape={false}
      close_on_overlay={false}
      is_open={open}
      on_close={request_close}
      size="2xl"
    >
      <ModalHeader className="pb-4">
        <ModalTitle className="text-lg">
          {t("settings.checkout_review_title")}
        </ModalTitle>
      </ModalHeader>
      <ModalBody className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_312px]">
        <div className="min-w-0 space-y-5">
          {plan_choices && plan_choices.length > 1 && (
            <div>
              {section_heading(t("settings.change_plan"))}
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
                {plan_choices.map((choice) => {
                  const active = choice.id === selected_plan_id;

                  return (
                    <button
                      key={choice.id}
                      aria-checked={active}
                      className={`${tile_base} flex flex-col px-3 pb-3 pt-3 ${
                        active
                          ? ""
                          : "border-edge-secondary hover:bg-surf-tertiary"
                      }`}
                      disabled={busy}
                      role="radio"
                      style={tile_style(active)}
                      type="button"
                      onClick={() => on_select_plan?.(choice.id)}
                    >
                      {tile_check(active)}
                      <span className="block pe-5 text-[13px] font-semibold text-txt-primary">
                        {choice.name}
                      </span>
                      <span className="mt-1 block text-[15px] font-bold text-txt-primary">
                        {choice.price_label}
                      </span>
                      {choice.note && (
                        <span className="mt-1 block text-[11px] leading-snug text-txt-muted">
                          {choice.note}
                        </span>
                      )}
                      {choice.is_recommended && (
                        <span className="plan_galaxy_badge mt-2 inline-flex w-fit items-center self-start rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                          {t("settings.plan_recommended")}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {term_options && term_options.length > 1 && (
            <div>
              {section_heading(t("settings.checkout_term_title"))}
              <div className="space-y-2" role="radiogroup">
                {term_options.map((option) => {
                  const active = option.id === term_id;

                  return (
                    <button
                      key={option.id}
                      aria-checked={active}
                      className={`${tile_base} flex w-full items-center gap-3 py-3 pe-9 ps-4 ${
                        active
                          ? ""
                          : "border-edge-secondary hover:bg-surf-tertiary"
                      }`}
                      disabled={busy}
                      role="radio"
                      style={tile_style(active)}
                      type="button"
                      onClick={() => {
                        set_active_term(option.id);
                        on_select_term?.(option.id);
                      }}
                    >
                      {tile_check(active)}
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] font-semibold text-txt-primary">
                            {option.label}
                          </span>
                          {option.id === best_value_id && (
                            <span className="plan_galaxy_badge inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                              {t("settings.best_value")}
                            </span>
                          )}
                        </span>
                        {option.save_cents > 0 && (
                          <span
                            className="mt-0.5 block text-[11px] leading-snug"
                            style={{ color: "var(--accent-color)" }}
                          >
                            {t("settings.checkout_term_save", {
                              amount: format_price(option.save_cents),
                            })}
                          </span>
                        )}
                      </span>
                      <span className="flex-shrink-0 text-end">
                        <span className="block text-[15px] font-bold text-txt-primary">
                          {t("settings.checkout_term_per_month", {
                            amount: format_price(option.per_month_cents),
                          })}
                        </span>
                        <span className="block text-[11px] text-txt-muted">
                          {t("settings.checkout_term_total", {
                            amount: format_price(option.total_cents),
                          })}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            {section_heading(t("settings.payment_details"))}
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
              {methods.map((entry) => {
                const active = entry.id === effective_method;
                const MethodIcon = entry.icon;

                return (
                  <button
                    key={entry.id}
                    aria-checked={active}
                    className={`${tile_base} flex flex-col px-3 pb-3 pt-3 ${
                      active
                        ? ""
                        : "border-edge-secondary hover:bg-surf-tertiary"
                    }`}
                    disabled={busy || entry.disabled}
                    role="radio"
                    style={tile_style(active)}
                    type="button"
                    onClick={() => set_method(entry.id)}
                  >
                    {tile_check(active)}
                    <span className="flex items-center gap-2">
                      <MethodIcon className="h-5 w-5 flex-shrink-0 text-txt-primary" />
                      <span className="text-[13px] font-semibold text-txt-primary">
                        {entry.label}
                      </span>
                    </span>
                    <span className="mt-1 block text-[11px] leading-snug text-txt-muted">
                      {entry.note}
                    </span>
                    {entry.id === "card" && (
                      <CardBrandMarks class_name="mt-2.5" />
                    )}
                    {entry.id === "crypto" && <CoinStack class_name="mt-2.5" />}
                    {entry.id === "card" && discount_note && (
                      <span
                        className="mt-1 flex items-center gap-1.5 text-[11px]"
                        style={{ color: "var(--accent-color)" }}
                      >
                        <TagIcon className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>{discount_note}</span>
                      </span>
                    )}
                    {entry.id === "card" && credit_amount && (
                      <span
                        className="mt-1 flex items-center gap-1.5 text-[11px]"
                        style={{ color: "var(--accent-color)" }}
                      >
                        <SparklesIcon className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>
                          {t("settings.credits_will_be_applied", {
                            amount: credit_amount,
                          })}
                        </span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <SecurityMarks
              class_name="mt-2.5 px-1"
              label={t("settings.stripe_secure_short")}
            />
            {card_unavailable && (
              <p className="mt-2 px-1 text-[11px] leading-relaxed text-txt-muted">
                {t("settings.checkout_card_term_unavailable")}
              </p>
            )}
          </div>
        </div>

        <aside className="min-w-0">
          <div className="plan_galaxy rounded-2xl border border-edge-secondary p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider plan_galaxy_text_muted">
                {t("settings.domain_purchase_order_summary")}
              </p>
              <img
                alt="Aster"
                className="h-4 w-auto flex-shrink-0 opacity-80"
                decoding="async"
                draggable={false}
                {...{ fetchpriority: "high" }}
                height={16}
                src={text_logo_url}
              />
            </div>

            <div className="mt-3 flex items-start justify-between gap-2">
              <span className="text-[15px] font-bold plan_galaxy_text_primary">
                {summary_name}
              </span>
              {active_option && active_option.id === best_value_id && (
                <span className="plan_galaxy_badge inline-flex flex-shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                  {t("settings.best_value")}
                </span>
              )}
            </div>

            {active_option && (
              <>
                <div className="mt-3 space-y-1.5 text-[12px] plan_galaxy_text_body">
                  <div className="flex items-center justify-between gap-2">
                    <span className="plan_galaxy_text_muted">
                      {active_option.label}
                    </span>
                    <span>
                      {t("settings.checkout_term_per_month", {
                        amount: format_price(active_option.per_month_cents),
                      })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="plan_galaxy_text_muted">
                      {t("common.subtotal")}
                    </span>
                    <span>{format_price(active_option.total_cents)}</span>
                  </div>
                  {active_option.save_cents > 0 && (
                    <div style={{ color: "var(--accent-color)" }}>
                      {t("settings.checkout_term_save", {
                        amount: format_price(active_option.save_cents),
                      })}
                    </div>
                  )}
                </div>

                <div className="plan_galaxy_divider mt-3 border-t pt-3">
                  <div className="flex items-end justify-between gap-2">
                    <span className="text-[12px] font-semibold plan_galaxy_text_muted">
                      {t("settings.checkout_amount_due")}
                    </span>
                    <span className="text-[22px] font-bold leading-none plan_galaxy_text_primary">
                      {amount_due}
                    </span>
                  </div>
                </div>
              </>
            )}

            <Button
              className="mt-4 w-full"
              disabled={busy}
              variant="primary"
              onClick={handle_continue}
            >
              {busy ? (
                <Spinner size="xs" />
              ) : (
                t("settings.continue_to_checkout")
              )}
            </Button>

            <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] plan_galaxy_text_muted">
              <ShieldCheckIcon className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{t("settings.money_back_guarantee")}</span>
            </div>

            <p className="mt-2 text-[11px] leading-relaxed plan_galaxy_text_muted">
              {t("settings.autorenew_notice_short")}
            </p>

            {features && features.length > 0 && (
              <div className="plan_galaxy_divider mt-3 border-t pt-3">
                <p className="text-[12px] font-semibold plan_galaxy_text_primary">
                  {t("settings.checkout_what_you_get")}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {features.slice(0, 5).map((feature, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-2 text-[12px] leading-snug plan_galaxy_text_body"
                    >
                      <CheckIcon
                        className="mt-0.5 h-3.5 w-3.5 flex-shrink-0"
                        style={{ color: "var(--accent-blue)" }}
                      />
                      <span>{feature.label}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-3 w-full"
                  size="sm"
                  variant="secondary"
                  onClick={() => set_features_open(true)}
                >
                  {t("auth.plan_view_full_features")}
                </Button>
              </div>
            )}
          </div>
        </aside>
      </ModalBody>

      {has_plan_features && (
        <PlanFeaturesModal
          feature_lines={full_feature_lines}
          highlight_plan_code={comparison_plan_code}
          is_open={features_open}
          on_close={() => set_features_open(false)}
          plan_name={summary_name}
          z_index={80}
        />
      )}

      <Modal
        close_on_escape
        close_on_overlay={false}
        is_open={confirm_abandon}
        on_close={() => set_confirm_abandon(false)}
        show_close_button={false}
        size="sm"
        z_index={90}
      >
        <ModalHeader className="pb-2">
          <ModalTitle className="text-base">
            {t("settings.checkout_abandon_title")}
          </ModalTitle>
        </ModalHeader>
        <ModalBody>
          <p className="text-[13px] leading-relaxed text-txt-secondary">
            {t("settings.checkout_abandon_message")}
          </p>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="secondary"
            onClick={() => set_confirm_abandon(false)}
          >
            {t("settings.checkout_abandon_keep")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              set_confirm_abandon(false);
              on_close();
            }}
          >
            {t("settings.checkout_abandon_confirm")}
          </Button>
        </ModalFooter>
      </Modal>
    </Modal>
  );
}
