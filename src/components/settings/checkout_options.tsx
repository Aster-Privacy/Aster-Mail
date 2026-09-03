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
import type { ComponentType, SVGProps } from "react";
import type { theme_colors } from "./checkout_modal";
import type { checkout_term } from "@/components/settings/billing/checkout_terms";

import {
  BanknotesIcon,
  CreditCardIcon,
  CurrencyDollarIcon,
  DevicePhoneMobileIcon,
} from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";

export type checkout_method = "card" | "wallet" | "cashapp" | "crypto";

export interface checkout_term_option {
  term: checkout_term;
  label: string;
  monthly_display: string;
  total_display: string;
  savings_display: string | null;
}

interface radio_dot_props {
  selected: boolean;
  colors: theme_colors;
}

function RadioDot({ selected, colors }: radio_dot_props) {
  return (
    <span
      className="flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full"
      style={{
        border: `1.5px solid ${selected ? colors.accent : colors.border_hover}`,
        transition: "border-color 0.15s ease",
      }}
    >
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{
          backgroundColor: selected ? colors.accent : "transparent",
          transition: "background-color 0.15s ease",
        }}
      />
    </span>
  );
}

interface term_selector_props {
  options: checkout_term_option[];
  selected: checkout_term;
  disabled: boolean;
  colors: theme_colors;
  on_select: (term: checkout_term) => void;
}

export function CheckoutTermSelector({
  options,
  selected,
  disabled,
  colors,
  on_select,
}: term_selector_props) {
  const { t } = use_i18n();

  return (
    <section>
      <h4
        className="text-sm font-semibold mb-2.5"
        style={{ color: colors.text_primary }}
      >
        {t("settings.checkout_term_title")}
      </h4>
      <div className="space-y-2" role="radiogroup">
        {options.map((option) => {
          const is_selected = option.term === selected;

          return (
            <button
              key={option.term}
              aria-checked={is_selected}
              className="flex w-full items-center gap-3 rounded-[14px] border p-3.5 text-start transition-colors"
              disabled={disabled}
              role="radio"
              style={{
                borderColor: is_selected ? colors.accent : colors.border_rest,
                backgroundColor: colors.bg_input,
              }}
              type="button"
              onClick={() => on_select(option.term)}
            >
              <RadioDot colors={colors} selected={is_selected} />
              <span className="min-w-0 flex-1">
                <span
                  className="block text-sm font-semibold"
                  style={{ color: colors.text_primary }}
                >
                  {option.label}
                </span>
                <span
                  className="block text-xs mt-0.5"
                  style={{ color: colors.text_tertiary }}
                >
                  {option.monthly_display}
                </span>
              </span>
              <span className="flex-shrink-0 text-end">
                <span
                  className="block text-sm font-semibold"
                  style={{
                    color: is_selected ? colors.accent : colors.text_primary,
                  }}
                >
                  {option.total_display}
                </span>
                {option.savings_display && (
                  <span
                    className="block text-xs mt-0.5"
                    style={{ color: colors.success }}
                  >
                    {option.savings_display}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

const METHOD_ICONS: Record<
  checkout_method,
  ComponentType<SVGProps<SVGSVGElement>>
> = {
  card: CreditCardIcon,
  wallet: DevicePhoneMobileIcon,
  cashapp: BanknotesIcon,
  crypto: CurrencyDollarIcon,
};

interface method_list_props {
  methods: checkout_method[];
  selected: checkout_method;
  disabled: boolean;
  colors: theme_colors;
  on_select: (method: checkout_method) => void;
}

export function CheckoutMethodList({
  methods,
  selected,
  disabled,
  colors,
  on_select,
}: method_list_props) {
  const { t } = use_i18n();

  const method_label = (method: checkout_method) => {
    if (method === "card") return t("settings.checkout_method_card");
    if (method === "wallet") return t("settings.checkout_method_wallet");
    if (method === "cashapp") return t("settings.checkout_method_cashapp");

    return t("settings.checkout_method_crypto");
  };

  return (
    <section>
      <h4
        className="text-sm font-semibold mb-2.5"
        style={{ color: colors.text_primary }}
      >
        {t("settings.checkout_method_title")}
      </h4>
      <div className="space-y-1" role="radiogroup">
        {methods.map((method) => {
          const is_selected = method === selected;
          const Icon = METHOD_ICONS[method];

          return (
            <button
              key={method}
              aria-checked={is_selected}
              className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-start transition-colors"
              disabled={disabled}
              role="radio"
              style={{
                backgroundColor: is_selected ? colors.bg_input : "transparent",
              }}
              type="button"
              onClick={() => on_select(method)}
            >
              <RadioDot colors={colors} selected={is_selected} />
              <Icon
                className="h-4 w-4 flex-shrink-0"
                style={{ color: colors.text_secondary }}
              />
              <span className="text-sm" style={{ color: colors.text_primary }}>
                {method_label(method)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
