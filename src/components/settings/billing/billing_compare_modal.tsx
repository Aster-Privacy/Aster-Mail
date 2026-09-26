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
import type { TranslationKey } from "@/lib/i18n/types";

import { useEffect, useState } from "react";
import { CheckIcon, MinusIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { BillingSegmented } from "@/components/settings/billing/billing_segmented";
import {
  convert_cents,
  FAMILY_PLAN_TIERS,
  PLAN_TIERS,
} from "@/components/settings/billing/billing_constants";
import {
  Modal,
  ModalBody,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import { format_price } from "@/services/api/billing";
import { use_i18n } from "@/lib/i18n/context";

export type BillingPlanType = "individual" | "family";

type CompareValue = string | boolean;

interface CompareRow {
  label_key: TranslationKey;
  values: CompareValue[];
}

const INDIVIDUAL_ROWS: CompareRow[] = [
  { label_key: "settings.storage", values: ["50 GB", "500 GB", "5 TB"] },
  {
    label_key: "settings.bill_aliases",
    values: ["15", "unlimited", "unlimited"],
  },
  {
    label_key: "settings.bill_custom_domains",
    values: ["5", "30", "unlimited"],
  },
  {
    label_key: "settings.bill_attachments",
    values: ["50 MB", "100 MB", "250 MB"],
  },
  { label_key: "settings.bill_tracker_protection", values: [true, true, true] },
  { label_key: "settings.bill_external_accounts", values: [true, true, true] },
  { label_key: "settings.bill_priority_support", values: [true, true, true] },
  { label_key: "settings.bill_encrypted_export", values: [false, true, true] },
  { label_key: "settings.bill_protected_folders", values: [false, true, true] },
  { label_key: "settings.bill_key_rotation", values: [false, true, true] },
  { label_key: "settings.bill_receipt_tracking", values: [false, false, true] },
  { label_key: "settings.bill_early_access", values: [false, false, true] },
  {
    label_key: "settings.bill_dedicated_support",
    values: [false, false, true],
  },
];

const FAMILY_ROWS: CompareRow[] = [
  { label_key: "settings.bill_shared_storage", values: ["1 TB", "3 TB"] },
  { label_key: "settings.bill_members", values: ["2", "up_to_6"] },
  { label_key: "settings.bill_aliases", values: ["unlimited", "unlimited"] },
  { label_key: "settings.bill_shared_aliases", values: [true, true] },
  { label_key: "settings.bill_custom_domains", values: ["30", "30"] },
  { label_key: "settings.bill_tracker_protection", values: [true, true] },
  { label_key: "settings.bill_external_accounts", values: [true, true] },
  { label_key: "settings.bill_priority_support", values: [true, true] },
];

interface BillingCompareModalProps {
  open: boolean;
  on_close: () => void;
  plan_type: BillingPlanType;
  on_plan_type_change: (value: BillingPlanType) => void;
  initial_plan_code: string | null;
  current_plan_code: string | null;
  preferred_currency: string;
  billing_period: "monthly" | "yearly" | "biennial";
  on_choose: (plan_code: string, plan_type: BillingPlanType) => void;
}

export function BillingCompareModal({
  open,
  on_close,
  plan_type,
  on_plan_type_change,
  initial_plan_code,
  current_plan_code,
  preferred_currency,
  billing_period,
  on_choose,
}: BillingCompareModalProps) {
  const { t } = use_i18n();
  const tiers = plan_type === "family" ? FAMILY_PLAN_TIERS : PLAN_TIERS;
  const rows = plan_type === "family" ? FAMILY_ROWS : INDIVIDUAL_ROWS;
  const [highlighted, set_highlighted] = useState<string>(
    initial_plan_code ?? tiers[0].id,
  );

  useEffect(() => {
    if (!open) return;
    const fallback = tiers.find((tier) => tier.id === initial_plan_code)
      ? initial_plan_code!
      : tiers[0].id;

    set_highlighted(fallback);
  }, [open, plan_type, initial_plan_code, tiers]);

  const highlighted_tier =
    tiers.find((tier) => tier.id === highlighted) ?? tiers[0];
  const is_current = highlighted_tier.id === current_plan_code;

  const price_for = (tier: { monthly_cents: number; yearly_cents: number }) =>
    format_price(
      convert_cents(
        billing_period === "monthly"
          ? tier.monthly_cents
          : Math.round(tier.yearly_cents / 12),
        preferred_currency,
      ),
      preferred_currency,
    );

  const cell_text = (value: string) =>
    value === "unlimited"
      ? t("settings.unlimited")
      : value === "up_to_6"
        ? t("settings.bill_up_to", { count: 6 })
        : value;

  return (
    <Modal is_open={open} on_close={on_close} size="lg">
      <ModalHeader>
        <ModalTitle className="text-center text-xl font-bold">
          {t("settings.bill_compare_plans")}
        </ModalTitle>
      </ModalHeader>
      <ModalBody>
        <BillingSegmented
          aria_label={t("settings.bill_plans")}
          on_change={on_plan_type_change}
          options={[
            { id: "individual", label: t("settings.bill_individual") },
            { id: "family", label: t("settings.bill_family") },
          ]}
          value={plan_type}
        />

        <div
          className="mt-4 grid items-end gap-2"
          style={{
            gridTemplateColumns: `minmax(0, 1.4fr) repeat(${tiers.length}, minmax(0, 1fr))`,
          }}
        >
          <span />
          {tiers.map((tier) => {
            const active = tier.id === highlighted;

            return (
              <button
                key={tier.id}
                aria-pressed={active}
                className="rounded-lg px-1 py-2 text-center transition-colors hover:bg-surf-hover"
                type="button"
                onClick={() => set_highlighted(tier.id)}
              >
                <span
                  className="block text-[13px] font-semibold"
                  style={{
                    color: active
                      ? "var(--accent-blue)"
                      : "var(--text-primary)",
                  }}
                >
                  {tier.name}
                </span>
                <span
                  className="block text-[11px]"
                  style={{
                    color: active ? "var(--accent-blue)" : "var(--text-muted)",
                  }}
                >
                  {price_for(tier)}
                  {t("settings.per_month_short")}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-1">
          {rows.map((row) => (
            <div
              key={row.label_key}
              className="grid items-center gap-2 py-3"
              style={{
                gridTemplateColumns: `minmax(0, 1.4fr) repeat(${tiers.length}, minmax(0, 1fr))`,
              }}
            >
              <span className="text-[13px] text-txt-primary">
                {t(row.label_key)}
              </span>
              {row.values.map((value, index) => {
                const tier = tiers[index];
                const active = tier?.id === highlighted;
                const color = active
                  ? "var(--accent-blue)"
                  : "var(--text-secondary)";

                return (
                  <span
                    key={`${row.label_key}_${tier?.id ?? index}`}
                    className="flex justify-center text-[13px] font-medium"
                    style={{ color }}
                  >
                    {value === true ? (
                      <CheckIcon
                        aria-label={t("common.yes")}
                        className="h-[18px] w-[18px]"
                        strokeWidth={2.2}
                      />
                    ) : value === false ? (
                      <MinusIcon
                        aria-label={t("common.no")}
                        className="h-4 w-4 text-txt-muted"
                      />
                    ) : (
                      cell_text(value)
                    )}
                  </span>
                );
              })}
            </div>
          ))}
        </div>

        <Button
          className="mt-4 w-full"
          disabled={is_current}
          size="md"
          variant="depth"
          onClick={() => on_choose(highlighted_tier.id, plan_type)}
        >
          {is_current
            ? t("settings.bill_current_plan")
            : t("settings.get_plan", { name: highlighted_tier.name })}
        </Button>
      </ModalBody>
    </Modal>
  );
}
