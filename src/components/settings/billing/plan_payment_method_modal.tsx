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
import { useEffect, useState } from "react";
import {
  ChevronRightIcon,
  CreditCardIcon,
  CurrencyDollarIcon,
  SparklesIcon,
  TagIcon,
} from "@heroicons/react/24/outline";

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
} from "@/components/ui/modal";
import { use_i18n } from "@/lib/i18n/context";
import { format_price } from "@/services/api/billing";

export interface plan_term_option {
  id: string;
  label: string;
  per_month_cents: number;
  total_cents: number;
  save_cents: number;
  crypto_only?: boolean;
}

interface plan_payment_method_modal_props {
  open: boolean;
  plan_name: string;
  term_options?: plan_term_option[];
  selected_term?: string;
  on_select_term?: (id: string) => void;
  busy?: boolean;
  credit_balance_cents?: number;
  credits_apply_to_card?: boolean;
  discount_percent_off?: number;
  discount_duration_months?: number;
  on_close: () => void;
  on_choose_card: (term_id?: string) => void;
  on_choose_crypto: (term_id?: string) => void;
}

export function PlanPaymentMethodModal({
  open,
  plan_name,
  term_options,
  selected_term,
  on_select_term,
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

  useEffect(() => {
    if (open) set_active_term(selected_term);
  }, [open, selected_term]);

  const term_id = active_term ?? selected_term;
  const active_option = term_options?.find((option) => option.id === term_id);
  const card_unavailable = !!active_option?.crypto_only;
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

  return (
    <Modal
      show_close_button
      close_on_escape={false}
      close_on_overlay={false}
      is_open={open}
      on_close={on_close}
      size="md"
    >
      <ModalHeader>
        <ModalTitle>{plan_name}</ModalTitle>
        <ModalDescription>
          {t("settings.checkout_method_description")}
        </ModalDescription>
      </ModalHeader>
      <ModalBody>
        {term_options && term_options.length > 1 && (
          <div className="mb-5 space-y-2">
            <p
              className="text-[11px] font-semibold uppercase tracking-wide"
              style={{ color: "var(--text-tertiary)" }}
            >
              {t("settings.checkout_term_title")}
            </p>
            {term_options.map((option) => {
              const active = option.id === term_id;

              return (
                <button
                  key={option.id}
                  aria-pressed={active}
                  className="flex w-full items-center gap-3 rounded-[14px] border p-3 text-start transition-colors disabled:pointer-events-none disabled:opacity-50"
                  disabled={busy}
                  style={{
                    backgroundColor: active
                      ? "color-mix(in srgb, var(--accent-color) 6%, var(--bg-tertiary))"
                      : "var(--bg-tertiary)",
                    borderColor: active
                      ? "color-mix(in srgb, var(--accent-color) 45%, transparent)"
                      : "var(--border-secondary)",
                  }}
                  type="button"
                  onClick={() => {
                    set_active_term(option.id);
                    on_select_term?.(option.id);
                  }}
                >
                  <span
                    className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border"
                    style={{
                      borderColor: active
                        ? "var(--accent-color)"
                        : "color-mix(in srgb, var(--text-muted) 45%, transparent)",
                    }}
                  >
                    {active && (
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: "var(--accent-color)" }}
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span
                        className="text-sm font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {option.label}
                      </span>
                      {option.id === best_value_id && (
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{
                            backgroundColor: "var(--accent-color)",
                            color: "var(--accent-fg, #ffffff)",
                          }}
                        >
                          {t("settings.best_value")}
                        </span>
                      )}
                    </span>
                    {option.save_cents > 0 && (
                      <span
                        className="mt-0.5 block text-xs font-medium"
                        style={{ color: "var(--accent-color)" }}
                      >
                        {t("settings.checkout_term_save", {
                          amount: format_price(option.save_cents),
                        })}
                      </span>
                    )}
                    {option.crypto_only && (
                      <span
                        className="mt-0.5 block text-[11px]"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {t("settings.checkout_term_crypto_only")}
                      </span>
                    )}
                  </span>
                  <span className="flex-shrink-0 text-end">
                    <span
                      className="block text-sm font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {t("settings.checkout_term_per_month", {
                        amount: format_price(option.per_month_cents),
                      })}
                    </span>
                    <span
                      className="block text-[11px]"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {t("settings.checkout_term_total", {
                        amount: format_price(option.total_cents),
                      })}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {term_options && term_options.length > 1 && (
          <p
            className="mb-2 text-[11px] font-semibold uppercase tracking-wide"
            style={{ color: "var(--text-tertiary)" }}
          >
            {t("settings.checkout_method_title")}
          </p>
        )}

        <div className="space-y-2">
          <button
            className="w-full flex items-center gap-3 rounded-[14px] border p-3.5 text-start transition-colors hover:opacity-80 disabled:opacity-50 disabled:pointer-events-none"
            disabled={busy || card_unavailable}
            style={{
              backgroundColor: "var(--bg-tertiary)",
              borderColor: "var(--border-secondary)",
            }}
            type="button"
            onClick={() => on_choose_card(term_id)}
          >
            <CreditCardIcon
              className="w-5 h-5 flex-shrink-0"
              style={{ color: "var(--text-tertiary)" }}
            />
            <div className="flex-1 min-w-0">
              <div
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                {t("settings.checkout_method_card")}
              </div>
              <div
                className="mt-0.5 text-xs leading-relaxed"
                style={{ color: "var(--text-tertiary)" }}
              >
                {t("settings.checkout_method_card_note")}
              </div>
              {discount_note && (
                <div
                  className="flex items-center gap-1.5 mt-1 text-xs"
                  style={{ color: "var(--accent-color)" }}
                >
                  <TagIcon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{discount_note}</span>
                </div>
              )}
              {credit_amount && (
                <div
                  className="flex items-center gap-1.5 mt-1 text-xs"
                  style={{ color: "var(--accent-color)" }}
                >
                  <SparklesIcon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>
                    {t("settings.credits_will_be_applied", {
                      amount: credit_amount,
                    })}
                  </span>
                </div>
              )}
            </div>
            <ChevronRightIcon
              className="w-4 h-4 flex-shrink-0 rtl:-scale-x-100"
              style={{ color: "var(--text-tertiary)" }}
            />
          </button>

          {card_unavailable && (
            <p
              className="px-1 text-xs leading-relaxed"
              style={{ color: "var(--text-tertiary)" }}
            >
              {t("settings.checkout_card_term_unavailable")}
            </p>
          )}

          <button
            className="w-full flex items-center gap-3 rounded-[14px] border p-3.5 text-start transition-colors hover:opacity-80 disabled:opacity-50 disabled:pointer-events-none"
            disabled={busy}
            style={{
              backgroundColor: "var(--bg-tertiary)",
              borderColor: "var(--border-secondary)",
            }}
            type="button"
            onClick={() => on_choose_crypto(term_id)}
          >
            <CurrencyDollarIcon
              className="w-5 h-5 flex-shrink-0"
              style={{ color: "var(--text-tertiary)" }}
            />
            <div className="flex-1 min-w-0">
              <div
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                {t("settings.checkout_method_crypto")}
              </div>
              <div
                className="mt-0.5 text-xs leading-relaxed"
                style={{ color: "var(--text-tertiary)" }}
              >
                {t("settings.checkout_method_crypto_note")}
              </div>
            </div>
            <ChevronRightIcon
              className="w-4 h-4 flex-shrink-0 rtl:-scale-x-100"
              style={{ color: "var(--text-tertiary)" }}
            />
          </button>
        </div>

        <p
          className="mt-3 text-[11px] leading-relaxed"
          style={{ color: "var(--text-tertiary)" }}
        >
          {t("settings.autorenew_notice_short")}
        </p>
      </ModalBody>
    </Modal>
  );
}
