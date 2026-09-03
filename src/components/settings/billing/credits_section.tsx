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
import { CheckIcon } from "@heroicons/react/20/solid";
import {
  CreditCardIcon,
  CurrencyDollarIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import {
  CardBrandMarks,
  CoinStack,
  SecurityMarks,
} from "@/components/settings/billing/payment_brand_marks";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import {
  format_price,
  format_date,
  update_credit_settings,
  get_credit_transactions,
  get_credit_packages,
  purchase_credits,
  purchase_credits_crypto,
  type CreditBalanceResponse,
  type CreditTransactionItem,
  type CreditPackageItem,
} from "@/services/api/billing";
import { payment_url_or_throw } from "@/lib/payment_url";
import {
  show_toast,
  TOAST_DURATION_BILLING_MS,
} from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { convert_cents } from "@/components/settings/billing/billing_constants";
import { describe_credit_entry } from "@/utils/billing_description";

function capitalize_words(value: string): string {
  return value
    .split(/([\s_-]+)/)
    .map((part) =>
      /^[\s_-]+$/.test(part)
        ? part.replace(/_/g, " ")
        : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join("");
}

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
  const [selected_package, set_selected_package] =
    useState<CreditPackageItem | null>(null);
  const [show_picker, set_show_picker] = useState(false);
  const [buying, set_buying] = useState(false);
  const [credit_method, set_credit_method] = useState<"card" | "crypto">(
    "card",
  );
  const [packages_failed, set_packages_failed] = useState(false);
  const [packages_tick, set_packages_tick] = useState(0);

  useEffect(() => {
    if (show_picker) set_credit_method("card");
  }, [show_picker]);

  useEffect(() => {
    if (!show_picker || packages.length > 0) return;
    set_packages_failed(false);
    get_credit_packages().then((res) => {
      if (res.data?.packages?.length) {
        set_packages(res.data.packages);
        set_selected_package(res.data.packages[0]);

        return;
      }
      set_packages_failed(true);
    });
  }, [show_picker, packages.length, packages_tick]);

  useEffect(() => {
    const handle_page_show = (event: PageTransitionEvent) => {
      if (event.persisted) {
        set_buying(false);
      }
    };

    window.addEventListener("pageshow", handle_page_show);

    return () => window.removeEventListener("pageshow", handle_page_show);
  }, []);

  const handle_buy = async () => {
    if (!selected_package || buying) return;
    set_buying(true);
    try {
      const res =
        credit_method === "crypto"
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

  const credit_methods: {
    id: "card" | "crypto";
    label: string;
    note: string;
    icon: typeof CreditCardIcon;
  }[] = [
    {
      id: "card",
      label: t("settings.checkout_method_card"),
      note: t("settings.credits_method_card_note"),
      icon: CreditCardIcon,
    },
    {
      id: "crypto",
      label: t("settings.checkout_method_crypto"),
      note: t("settings.credits_method_crypto_note"),
      icon: CurrencyDollarIcon,
    },
  ];

  const has_transactions =
    !!credit_balance && (credit_balance.recent_transactions?.length ?? 0) > 0;

  return (
    <div className="border-t border-edge-secondary pt-8" id="credits_section">
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

      <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-edge-secondary mb-3">
        <div>
          <p className="text-xs text-txt-muted">
            {t("settings.credit_balance")}
          </p>
          <p className="text-2xl font-bold text-txt-primary mt-0.5">
            {format_price(credit_balance?.balance_cents ?? 0)}
          </p>
        </div>
        <button
          className="aster_btn aster_btn_primary aster_btn_md"
          type="button"
          onClick={() => set_show_picker(true)}
        >
          {t("settings.top_up_credits")}
        </button>
      </div>

      <Modal
        show_close_button
        is_open={show_picker}
        on_close={() => set_show_picker(false)}
        size="md"
      >
        <ModalHeader>
          <ModalTitle>{t("settings.top_up_credits")}</ModalTitle>
          <ModalDescription>
            {t("settings.top_up_credits_description")}
          </ModalDescription>
        </ModalHeader>
        <ModalBody>
          {packages.length === 0 ? (
            <div className="flex items-center justify-between gap-3 py-4">
              <p className="text-xs text-txt-muted">
                {packages_failed
                  ? t("settings.credit_packages_failed")
                  : t("settings.credit_packages_loading")}
              </p>
              {packages_failed && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => set_packages_tick((n) => n + 1)}
                >
                  {t("common.retry")}
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {packages.map((pkg) => {
                const price = convert_cents(
                  pkg.price_cents,
                  preferred_currency,
                );
                const total = convert_cents(
                  pkg.amount_cents + pkg.bonus_cents,
                  preferred_currency,
                );
                const bonus = convert_cents(
                  pkg.bonus_cents,
                  preferred_currency,
                );
                const is_selected = selected_package?.id === pkg.id;

                return (
                  <button
                    key={pkg.id}
                    aria-pressed={is_selected}
                    className="flex h-full flex-col rounded-[14px] border p-3 text-start transition-colors"
                    style={{
                      backgroundColor: is_selected
                        ? "color-mix(in srgb, var(--accent-color) 8%, var(--bg-tertiary))"
                        : "var(--bg-tertiary)",
                      borderColor: is_selected
                        ? "var(--accent-color)"
                        : "var(--border-secondary)",
                    }}
                    type="button"
                    onClick={() => set_selected_package(pkg)}
                  >
                    <p className="text-base font-bold text-txt-primary">
                      {format_price(price, preferred_currency)}
                    </p>
                    {bonus > 0 && (
                      <p
                        className="text-xs mt-0.5 font-medium"
                        style={{ color: "var(--accent-color)" }}
                      >
                        {t("settings.credit_package_bonus", {
                          bonus: format_price(bonus, preferred_currency),
                        })}
                      </p>
                    )}
                    <p className="mt-auto pt-1 text-xs text-txt-muted">
                      {t("settings.credit_package_total", {
                        total: format_price(total, preferred_currency),
                      })}
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          {packages.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-txt-muted">
                {t("settings.checkout_method_title")}
              </p>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
                {credit_methods.map((entry) => {
                  const active = entry.id === credit_method;
                  const MethodIcon = entry.icon;

                  return (
                    <button
                      key={entry.id}
                      aria-checked={active}
                      className={`relative flex h-full flex-col rounded-xl border p-3 text-start transition-colors focus:outline-none disabled:pointer-events-none disabled:opacity-50 ${
                        active
                          ? ""
                          : "border-edge-secondary hover:bg-surf-tertiary"
                      }`}
                      disabled={buying}
                      role="radio"
                      style={
                        active
                          ? {
                              borderColor: "var(--accent-color)",
                              backgroundColor:
                                "color-mix(in srgb, var(--accent-color) 14%, transparent)",
                              boxShadow: "0 0 0 1px var(--accent-color)",
                            }
                          : undefined
                      }
                      type="button"
                      onClick={() => set_credit_method(entry.id)}
                    >
                      {active && (
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
                      )}
                      <span className="flex items-center gap-2">
                        <MethodIcon className="h-5 w-5 flex-shrink-0 text-txt-primary" />
                        <span className="text-[13px] font-semibold text-txt-primary">
                          {entry.label}
                        </span>
                      </span>
                      <span className="mt-1 block text-[11px] leading-snug text-txt-muted">
                        {entry.note}
                      </span>
                      {entry.id === "card" ? (
                        <CardBrandMarks class_name="mt-auto pt-2.5" />
                      ) : (
                        <CoinStack class_name="mt-auto pt-2.5" />
                      )}
                    </button>
                  );
                })}
              </div>
              <SecurityMarks
                class_name="mt-2.5 px-1"
                label={t("settings.stripe_secure_short")}
              />
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            disabled={buying}
            variant="outline"
            onClick={() => set_show_picker(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            disabled={buying || !selected_package}
            variant="primary"
            onClick={handle_buy}
          >
            {buying ? t("settings.buying_credits") : t("settings.buy_credits")}
          </Button>
        </ModalFooter>
      </Modal>

      {credit_balance &&
        (Number(credit_balance.balance_cents) > 0 || has_transactions) && (
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
                      show_toast(
                        t("settings.credits_toggle_updated"),
                        "success",
                      );
                    } else {
                      show_toast(t("settings.credits_toggle_failed"), "error");
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
                      if (show_all_transactions) {
                        set_show_all_transactions(false);

                        return;
                      }

                      if (credit_transactions_list.length > 0) {
                        set_show_all_transactions(true);

                        return;
                      }

                      const res = await get_credit_transactions(1, 50);

                      if (!res.data) {
                        show_toast(
                          t("common.something_went_wrong_try_again"),
                          "error",
                        );

                        return;
                      }
                      set_credit_transactions_list(res.data.transactions);
                      set_show_all_transactions(true);
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
                      referral_reward: t(
                        "settings.credit_type_referral_reward",
                      ),
                      referral_commission: t(
                        "settings.credit_type_referral_commission",
                      ),
                      admin_grant: t("settings.credit_type_admin_grant"),
                      promo: t("settings.credit_type_promo"),
                      renewal_deduction: t(
                        "settings.credit_type_renewal_deduction",
                      ),
                      reversal: t("settings.credit_type_reversal"),
                      purchase: t("settings.credit_type_purchase"),
                      install_android_reward: t(
                        "settings.credit_type_install_android",
                      ),
                      install_desktop_reward: t(
                        "settings.credit_type_install_desktop",
                      ),
                      install_ios_reward: t("settings.credit_type_install_ios"),
                      refunded: t("settings.credit_type_refunded"),
                      spent: t("settings.credit_type_spent"),
                      clawback: t("settings.credit_type_clawback"),
                      admin_removal: t("settings.credit_type_admin_removal"),
                      crypto_overpayment: t(
                        "settings.credit_type_crypto_overpayment",
                      ),
                      crypto_overpayment_reversal: t(
                        "settings.credit_type_crypto_overpayment_reversal",
                      ),
                      prepaid_switch_residual: t(
                        "settings.credit_type_prepaid_switch_residual",
                      ),
                      prepaid_switch_residual_reversal: t(
                        "settings.credit_type_prepaid_switch_residual_reversal",
                      ),
                    };
                    const type_label =
                      credit_type_labels[tx.transaction_type] ||
                      capitalize_words(tx.transaction_type);
                    const is_positive = tx.amount_cents > 0;

                    return (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between px-4 py-2.5 hover:bg-surf-hover transition-colors"
                      >
                        <div>
                          <p className="text-sm text-txt-primary">
                            {describe_credit_entry(tx.description, t) ||
                              capitalize_words(tx.transaction_type)}
                          </p>
                          <p className="text-xs mt-0.5 text-txt-muted">
                            {format_date(tx.created_at)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded ${is_positive ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500"}`}
                          >
                            {type_label}
                          </span>
                          <p
                            className={`text-sm font-medium ${is_positive ? "text-green-500" : "text-red-500"}`}
                          >
                            {is_positive ? "+" : ""}
                            {format_price(Math.abs(tx.amount_cents))}
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
    </div>
  );
}
