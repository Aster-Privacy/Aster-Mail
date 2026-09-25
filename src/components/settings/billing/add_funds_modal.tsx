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
import { Button } from "@aster/ui";

import { BillingOptionRow } from "@/components/settings/billing/billing_option_row";
import {
  BILLING_CARD_CLASS,
  BillingOptionRowsSkeleton,
} from "@/components/settings/billing/billing_skeleton";
import { convert_cents } from "@/components/settings/billing/billing_constants";
import { Modal, ModalBody } from "@/components/ui/modal";
import {
  format_price,
  get_credit_packages,
  purchase_credits,
  purchase_credits_crypto,
  update_credit_settings,
  type CreditBalanceResponse,
  type CreditPackageItem,
} from "@/services/api/billing";
import { payment_url_or_throw } from "@/lib/payment_url";
import {
  show_toast,
  TOAST_DURATION_BILLING_MS,
} from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";

interface AddFundsModalProps {
  open: boolean;
  on_close: () => void;
  credit_balance: CreditBalanceResponse | null;
  preferred_currency: string;
  on_balance_change: (
    update: (
      prev: CreditBalanceResponse | null,
    ) => CreditBalanceResponse | null,
  ) => void;
}

export function AddFundsModal({
  open,
  on_close,
  credit_balance,
  preferred_currency,
  on_balance_change,
}: AddFundsModalProps) {
  const { t } = use_i18n();
  const [packages, set_packages] = useState<CreditPackageItem[]>([]);
  const [packages_failed, set_packages_failed] = useState(false);
  const [selected_id, set_selected_id] = useState<string | null>(null);
  const [buying, set_buying] = useState(false);
  const [toggling, set_toggling] = useState(false);

  useEffect(() => {
    if (!open || packages.length > 0) return;
    set_packages_failed(false);
    get_credit_packages().then((res) => {
      if (res.data?.packages?.length) {
        set_packages(res.data.packages);
        set_selected_id(res.data.packages[0].id);

        return;
      }
      set_packages_failed(true);
    });
  }, [open, packages.length]);

  useEffect(() => {
    const handle_page_show = (event: PageTransitionEvent) => {
      if (event.persisted) set_buying(false);
    };

    window.addEventListener("pageshow", handle_page_show);

    return () => window.removeEventListener("pageshow", handle_page_show);
  }, []);

  const selected_package =
    packages.find((entry) => entry.id === selected_id) ?? null;
  const money = (cents: number) =>
    format_price(convert_cents(cents, preferred_currency), preferred_currency);

  const handle_buy = async (method: "card" | "crypto") => {
    if (!selected_package || buying) return;
    set_buying(true);
    try {
      const res =
        method === "crypto"
          ? await purchase_credits_crypto(selected_package.id)
          : await purchase_credits(selected_package.id, preferred_currency);

      if (res.data?.url) {
        const url = payment_url_or_throw(res.data.url);
        const is_tauri =
          typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

        if (is_tauri) {
          const core = await import("@tauri-apps/api/core");

          await core.invoke("open_external_url", { url });
          set_buying(false);
        } else {
          window.location.assign(url);
        }
      } else {
        show_toast(
          t("settings.credit_purchase_error"),
          "error",
          TOAST_DURATION_BILLING_MS,
        );
        set_buying(false);
      }
    } catch {
      show_toast(
        t("settings.credit_purchase_error"),
        "error",
        TOAST_DURATION_BILLING_MS,
      );
      set_buying(false);
    }
  };

  const handle_toggle = async () => {
    if (toggling) return;
    const new_value = !credit_balance?.use_credits_for_renewals;

    if (new_value && (credit_balance?.balance_cents ?? 0) <= 0) {
      show_toast(t("settings.credits_earn_first"), "error");

      return;
    }
    set_toggling(true);
    try {
      const res = await update_credit_settings(new_value);

      if (res.data) {
        const balance_cents = res.data.balance_cents;

        on_balance_change((prev) =>
          prev
            ? { ...prev, use_credits_for_renewals: new_value, balance_cents }
            : prev,
        );
        show_toast(t("settings.credits_toggle_updated"), "success");
      } else {
        show_toast(t("settings.credits_toggle_failed"), "error");
      }
    } catch {
      show_toast(t("settings.credits_toggle_failed"), "error");
    } finally {
      set_toggling(false);
    }
  };

  const renewals_on = !!credit_balance?.use_credits_for_renewals;

  return (
    <Modal is_open={open} on_close={buying ? () => {} : on_close} size="sm">
      <ModalBody>
        <div className="flex flex-col items-center pt-2 text-center">
          <span className="text-xs font-medium uppercase tracking-wide text-txt-muted">
            {t("settings.bill_credits")}
          </span>
          <span className="mt-1 text-[34px] font-bold leading-none text-txt-primary">
            {credit_balance
              ? format_price(credit_balance.balance_cents)
              : format_price(0)}
          </span>
          <h2 className="mt-5 text-lg font-semibold text-txt-primary">
            {t("settings.bill_add_funds")}
          </h2>
          <p className="mt-1 text-[13px] text-txt-muted">
            {t("settings.bill_add_funds_body")}
          </p>
        </div>

        <div className="mt-4">
          {packages.length === 0 && !packages_failed ? (
            <BillingOptionRowsSkeleton rows={3} />
          ) : packages_failed ? (
            <p className="py-3 text-center text-sm text-txt-muted">
              {t("settings.bill_top_ups_unavailable")}
            </p>
          ) : (
            <div
              aria-label={t("settings.bill_add_funds")}
              className={`${BILLING_CARD_CLASS} p-1`}
              role="radiogroup"
            >
              {packages.map((entry) => (
                <BillingOptionRow
                  key={entry.id}
                  disabled={buying}
                  note={
                    entry.bonus_cents > 0
                      ? t("settings.bill_bonus", {
                          amount: format_price(entry.bonus_cents),
                        })
                      : undefined
                  }
                  note_tone="success"
                  on_select={() => set_selected_id(entry.id)}
                  selected={entry.id === selected_id}
                  title={format_price(entry.amount_cents)}
                  trailing_amount={money(entry.price_cents)}
                />
              ))}
            </div>
          )}
        </div>

        <Button
          className="mt-4 w-full"
          disabled={!selected_package || buying}
          size="md"
          variant="depth"
          onClick={() => handle_buy("card")}
        >
          {t("settings.bill_pay_with_card")}
        </Button>
        <button
          className="mt-2 flex w-full justify-center py-1 text-sm font-semibold hover:underline disabled:opacity-50"
          disabled={!selected_package || buying}
          style={{ color: "var(--accent-blue)" }}
          type="button"
          onClick={() => handle_buy("crypto")}
        >
          {t("settings.bill_pay_with_crypto")}
        </button>

        <div className="mt-4 flex items-center gap-3 rounded-xl bg-surf-tertiary px-4 py-3">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-txt-primary">
              {t("settings.bill_use_credits_renewals")}
            </span>
            <span className="block text-[13px] text-txt-muted">
              {t("settings.bill_use_credits_renewals_body")}
            </span>
          </span>
          <button
            aria-checked={renewals_on}
            aria-label={t("settings.bill_use_credits_renewals")}
            className="relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50"
            disabled={toggling}
            role="switch"
            style={{
              backgroundColor: renewals_on
                ? "var(--accent-blue)"
                : "var(--border-primary)",
            }}
            type="button"
            onClick={handle_toggle}
          >
            <span
              className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-surf-primary shadow-sm transition-transform duration-200"
              style={{
                transform: renewals_on ? "translateX(20px)" : "translateX(0)",
              }}
            />
          </button>
        </div>
      </ModalBody>
    </Modal>
  );
}
