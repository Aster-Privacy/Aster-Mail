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
import { useState, useEffect } from "react";
import { CurrencyDollarIcon } from "@heroicons/react/24/outline";

import {
  format_price,
  format_date,
  update_credit_settings,
  get_credit_transactions,
  get_credit_packages,
  purchase_credits_crypto,
  type CreditBalanceResponse,
  type CreditTransactionItem,
  type CreditPackageItem,
} from "@/services/api/billing";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { PlanPaymentMethodModal } from "@/components/settings/billing/plan_payment_method_modal";
import { CreditCheckoutModal } from "@/components/settings/billing/credit_checkout_modal";

interface CreditsSectionProps {
  credit_balance: CreditBalanceResponse | null;
  set_credit_balance: React.Dispatch<
    React.SetStateAction<CreditBalanceResponse | null>
  >;
  preferred_currency: string;
}

export function CreditsSection({
  credit_balance,
  set_credit_balance,
  preferred_currency,
}: CreditsSectionProps) {
  const { t } = use_i18n();
  const [credit_transactions_list, set_credit_transactions_list] = useState<
    CreditTransactionItem[]
  >([]);
  const [show_all_transactions, set_show_all_transactions] = useState(false);
  const [packages, set_packages] = useState<CreditPackageItem[]>([]);
  const [selected_package, set_selected_package] = useState<CreditPackageItem | null>(null);
  const [show_package_picker, set_show_package_picker] = useState(false);
  const [show_method_modal, set_show_method_modal] = useState(false);
  const [show_card_checkout, set_show_card_checkout] = useState(false);
  const [crypto_busy, set_crypto_busy] = useState(false);

  useEffect(() => {
    if (show_package_picker && packages.length === 0) {
      get_credit_packages().then((res) => {
        if (res.data?.packages?.length) {
          set_packages(res.data.packages);
          set_selected_package(res.data.packages[0]);
        }
      });
    }
  }, [show_package_picker, packages.length]);

  const open_top_up = () => {
    set_show_package_picker(true);
  };

  const proceed_to_payment = () => {
    if (!selected_package) return;
    set_show_method_modal(true);
  };

  const handle_choose_card = () => {
    set_show_method_modal(false);
    set_show_card_checkout(true);
  };

  const handle_choose_crypto = async () => {
    if (!selected_package) return;
    set_show_method_modal(false);
    set_crypto_busy(true);
    try {
      const res = await purchase_credits_crypto(selected_package.id);
      if (res.data?.url) {
        window.location.assign(res.data.url);
      } else {
        show_toast(t("settings.credit_purchase_error"), "error");
      }
    } catch {
      show_toast(t("settings.credit_purchase_error"), "error");
    } finally {
      set_crypto_busy(false);
    }
  };

  const handle_card_success = (new_balance_cents: number) => {
    set_show_card_checkout(false);
    set_show_package_picker(false);
    set_credit_balance((prev) =>
      prev
        ? { ...prev, balance_cents: new_balance_cents, balance_dollars: (new_balance_cents / 100).toFixed(2), use_credits_for_renewals: true }
        : prev,
    );
  };

  const has_transactions =
    !!credit_balance &&
    (credit_balance.recent_transactions?.length ?? 0) > 0;

  return (
    <div className="border-t border-edge-secondary pt-8">
      <div className="mb-2">
        <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
          <CurrencyDollarIcon className="w-4 h-4 text-txt-primary flex-shrink-0" />
          {t("settings.credits")}
        </h3>
        <p className="text-xs text-txt-muted mt-1">
          {t("settings.top_up_credits_description")}
        </p>
        <div className="mt-2 h-px bg-edge-secondary" />
      </div>

      <div className="flex items-center justify-between px-4 py-4 rounded-lg border border-edge-secondary mb-3">
        <div>
          <p className="text-xs text-txt-muted">
            {t("settings.credit_balance")}
          </p>
          <p className="text-2xl font-bold text-txt-primary mt-0.5">
            {credit_balance ? `$${credit_balance.balance_dollars}` : "$0.00"}
          </p>
        </div>
        <button
          type="button"
          className="aster_btn aster_btn_primary aster_btn_md"
          onClick={open_top_up}
        >
          {t("settings.top_up_credits")}
        </button>
      </div>

      {show_package_picker && (
        <div className="rounded-lg border border-edge-secondary mb-3 overflow-hidden">
          <div className="px-4 py-3 border-b border-edge-secondary">
            <p className="text-sm font-semibold text-txt-primary">
              {t("settings.top_up_credits")}
            </p>
          </div>
          {packages.length === 0 ? (
            <p className="text-xs text-txt-muted px-4 py-4">
              {t("settings.credit_packages_loading")}
            </p>
          ) : (
            <div className="p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                {packages.map((pkg) => {
                  const total = pkg.amount_cents + pkg.bonus_cents;
                  const is_selected = selected_package?.id === pkg.id;
                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => set_selected_package(pkg)}
                      className={`rounded-lg border p-3 text-left transition-colors ${
                        is_selected
                          ? "border-blue-500 bg-blue-500/10"
                          : "border-edge-secondary hover:border-edge-primary"
                      }`}
                    >
                      <p className="text-base font-bold text-txt-primary">
                        {format_price(pkg.price_cents)}
                      </p>
                      {pkg.bonus_cents > 0 && (
                        <p className="text-xs text-green-500 mt-0.5">
                          {t("settings.credit_package_bonus", {
                            bonus: format_price(pkg.bonus_cents),
                          })}
                        </p>
                      )}
                      <p className="text-xs text-txt-muted mt-0.5">
                        {t("settings.credit_package_total", {
                          total: format_price(total),
                        })}
                      </p>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                disabled={!selected_package}
                onClick={proceed_to_payment}
                className="aster_btn aster_btn_primary aster_btn_lg w-full disabled:opacity-50"
              >
                {t("settings.buy_credits")}
              </button>
            </div>
          )}
        </div>
      )}

      {credit_balance && (Number(credit_balance.balance_cents) > 0 || has_transactions) && (
        <>
          <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-edge-secondary mb-3">
            <div className="flex-1">
              <p className="text-sm text-txt-primary">
                {t("settings.use_credits_for_renewals")}
              </p>
              <p className="text-xs text-txt-muted mt-0.5">
                {t("settings.use_credits_for_renewals_description")}
              </p>
            </div>
            <button
              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                credit_balance?.use_credits_for_renewals
                  ? "bg-blue-500"
                  : "bg-zinc-600"
              }`}
              type="button"
              onClick={async () => {
                const new_value = !credit_balance?.use_credits_for_renewals;
                if (new_value && (credit_balance?.balance_cents ?? 0) <= 0) {
                  show_toast(t("settings.credits_earn_first"), "error");
                  return;
                }
                try {
                  const res = await update_credit_settings(new_value);
                  if (res.data) {
                    set_credit_balance((prev) =>
                      prev
                        ? {
                            ...prev,
                            use_credits_for_renewals: new_value,
                            balance_cents: res.data!.balance_cents,
                          }
                        : prev,
                    );
                    show_toast(t("settings.credits_toggle_updated"), "success");
                  }
                } catch {
                  show_toast(t("settings.credits_toggle_failed"), "error");
                }
              }}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  credit_balance?.use_credits_for_renewals
                    ? "translate-x-4"
                    : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {has_transactions && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-txt-secondary">
                  {t("settings.recent_transactions")}
                </p>
                <button
                  className="text-xs text-blue-500 hover:underline"
                  type="button"
                  onClick={async () => {
                    set_show_all_transactions(!show_all_transactions);
                    if (!show_all_transactions && credit_transactions_list.length === 0) {
                      const res = await get_credit_transactions(1, 50);
                      if (res.data) set_credit_transactions_list(res.data.transactions);
                    }
                  }}
                >
                  {show_all_transactions
                    ? t("common.close")
                    : t("settings.view_all_transactions")}
                </button>
              </div>
              <div className="rounded-lg border overflow-hidden border-edge-secondary">
                {(show_all_transactions
                  ? credit_transactions_list
                  : credit_balance.recent_transactions
                ).map((tx) => {
                  const credit_type_labels: Record<string, string> = {
                    referral_reward: t("settings.credit_type_referral_reward"),
                    referral_commission: t("settings.credit_type_referral_commission"),
                    admin_grant: t("settings.credit_type_admin_grant"),
                    promo: t("settings.credit_type_promo"),
                    renewal_deduction: t("settings.credit_type_renewal_deduction"),
                    reversal: t("settings.credit_type_reversal"),
                    purchase: t("settings.credit_type_purchase"),
                    install_android_reward: t("settings.credit_type_install_android"),
                    install_desktop_reward: t("settings.credit_type_install_desktop"),
                    install_ios_reward: t("settings.credit_type_install_ios"),
                  };
                  const type_label = credit_type_labels[tx.transaction_type] || tx.transaction_type;
                  const is_positive = tx.amount_cents > 0;
                  return (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between px-4 py-2.5 hover:bg-surf-hover transition-colors"
                    >
                      <div>
                        <p className="text-sm text-txt-primary">
                          {tx.description || tx.transaction_type}
                        </p>
                        <p className="text-xs mt-0.5 text-txt-muted">
                          {format_date(tx.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${is_positive ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500"}`}>
                          {type_label}
                        </span>
                        <p className={`text-sm font-medium ${is_positive ? "text-green-500" : "text-red-500"}`}>
                          {is_positive ? "+" : ""}{format_price(Math.abs(tx.amount_cents))}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      <PlanPaymentMethodModal
        open={show_method_modal}
        plan_name={selected_package ? `${format_price(selected_package.amount_cents + selected_package.bonus_cents)} ${t("settings.in_credits")}` : ""}
        busy={crypto_busy}
        on_close={() => {
          set_show_method_modal(false);
          set_show_package_picker(true);
        }}
        on_choose_card={handle_choose_card}
        on_choose_crypto={handle_choose_crypto}
      />

      <CreditCheckoutModal
        open={show_card_checkout}
        package_item={selected_package}
        currency={preferred_currency}
        on_close={() => {
          set_show_card_checkout(false);
          set_show_package_picker(true);
        }}
        on_success={handle_card_success}
      />
    </div>
  );
}
