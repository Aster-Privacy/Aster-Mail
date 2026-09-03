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
import type { ReactNode } from "react";
import type { theme_colors } from "./checkout_modal";
import type { checkout_term } from "@/components/settings/billing/checkout_terms";

import { useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";

export interface checkout_summary_model {
  plan_name: string;
  term: checkout_term;
  term_label: string;
  savings_percent: number;
  monthly_display: string | null;
  total_display: string;
  amount_due_display: string;
  strikethrough_display: string | null;
  credits_display: string | null;
  autorenew_text: string | null;
  security_text: string | null;
  discount_note: string | null;
}

interface checkout_summary_props {
  model: checkout_summary_model;
  colors: theme_colors;
  highlights?: string[];
  promo_slot?: ReactNode;
  children: ReactNode;
}

export function CheckoutSummary({
  model,
  colors,
  highlights,
  promo_slot,
  children,
}: checkout_summary_props) {
  const { t } = use_i18n();
  const [show_highlights, set_show_highlights] = useState(false);

  return (
    <aside
      className="w-full lg:w-[288px] lg:flex-shrink-0 rounded-2xl p-5"
      style={{
        backgroundColor: colors.bg_input,
        border: `1px solid ${colors.border_rest}`,
      }}
    >
      <h4
        className="text-base font-semibold"
        style={{ color: colors.text_primary }}
      >
        {t("settings.domain_purchase_order_summary")}
      </h4>

      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className="text-sm font-semibold truncate"
            style={{ color: colors.text_primary }}
          >
            {model.plan_name}
          </p>
          <p className="text-xs mt-0.5" style={{ color: colors.text_tertiary }}>
            {model.monthly_display ?? model.term_label}
          </p>
        </div>
        {model.savings_percent > 0 && (
          <span
            className="flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
            style={{ backgroundColor: colors.success }}
          >
            {t("settings.save_percent", { percent: model.savings_percent })}
          </span>
        )}
      </div>

      <div
        className="mt-4 pt-4 flex items-baseline justify-between gap-3"
        style={{ borderTop: `1px solid ${colors.border_rest}` }}
      >
        <span className="text-xs" style={{ color: colors.text_secondary }}>
          {model.term_label}
        </span>
        <span className="text-sm" style={{ color: colors.text_primary }}>
          {model.strikethrough_display && (
            <span
              className="me-2 line-through"
              style={{ color: colors.text_tertiary }}
            >
              {model.strikethrough_display}
            </span>
          )}
          {model.total_display}
        </span>
      </div>

      {model.credits_display && (
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <span className="text-xs" style={{ color: colors.text_secondary }}>
            {t("settings.credits")}
          </span>
          <span
            className="text-sm font-medium"
            style={{ color: colors.success }}
          >
            {model.credits_display}
          </span>
        </div>
      )}

      <div
        className="mt-4 pt-4 flex items-baseline justify-between gap-3"
        style={{ borderTop: `1px solid ${colors.border_rest}` }}
      >
        <span
          className="text-base font-semibold"
          style={{ color: colors.text_primary }}
        >
          {t("settings.checkout_amount_due")}
        </span>
        <span
          className="text-lg font-semibold"
          style={{ color: colors.text_primary }}
        >
          {model.amount_due_display}
        </span>
      </div>

      <div className="mt-4">{children}</div>

      {promo_slot && <div className="mt-3">{promo_slot}</div>}

      {model.discount_note && (
        <p
          className="mt-3 text-[11px] leading-relaxed"
          style={{ color: colors.success }}
        >
          {model.discount_note}
        </p>
      )}

      {model.autorenew_text && (
        <p
          className="mt-3 text-[11px] leading-relaxed"
          style={{ color: colors.text_tertiary }}
        >
          {model.autorenew_text}
        </p>
      )}

      {model.security_text && (
        <div className="mt-3 flex items-start gap-2">
          <LockClosedIcon
            className="mt-0.5 h-3.5 w-3.5 flex-shrink-0"
            style={{ color: colors.text_tertiary }}
          />
          <p
            className="text-[11px] leading-relaxed"
            style={{ color: colors.text_tertiary }}
          >
            {model.security_text}
          </p>
        </div>
      )}

      {highlights && highlights.length > 0 && (
        <div
          className="mt-4 pt-4"
          style={{ borderTop: `1px solid ${colors.border_rest}` }}
        >
          <button
            aria-expanded={show_highlights}
            className="flex w-full items-center justify-between gap-2 text-start"
            type="button"
            onClick={() => set_show_highlights((open) => !open)}
          >
            <span
              className="text-sm font-medium"
              style={{ color: colors.text_primary }}
            >
              {t("settings.checkout_what_you_get")}
            </span>
            <ChevronDownIcon
              className="h-4 w-4 flex-shrink-0 transition-transform"
              style={{
                color: colors.text_tertiary,
                transform: show_highlights ? "rotate(180deg)" : "none",
              }}
            />
          </button>
          {show_highlights && (
            <ul className="mt-3 space-y-2">
              {highlights.map((highlight) => (
                <li key={highlight} className="flex items-start gap-2">
                  <CheckIcon
                    className="mt-0.5 h-3.5 w-3.5 flex-shrink-0"
                    style={{ color: colors.success }}
                  />
                  <span
                    className="text-xs leading-relaxed"
                    style={{ color: colors.text_secondary }}
                  >
                    {highlight}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  );
}
