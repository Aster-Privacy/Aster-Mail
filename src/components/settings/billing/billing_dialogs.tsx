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
import {
  EyeIcon,
  EyeSlashIcon,
  CreditCardIcon,
  ArrowsRightLeftIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";

import { Input } from "@/components/ui/input";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
} from "@/components/ui/modal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert_dialog";
import { CheckoutModal } from "@/components/settings/checkout_modal";
import { PaymentMethodsModal } from "@/components/settings/payment_methods_modal";
import {
  format_price,
  get_subscription,
  cancel_storage_addon,
  type SubscriptionResponse,
  type AvailablePlan,
  type StorageAddonItem,
  type UserActiveAddon,
} from "@/services/api/billing";
import { request_cache } from "@/services/api/request_cache";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import { show_toast } from "@/components/toast/simple_toast";
import { PLAN_TIERS } from "@/components/settings/billing/billing_constants";
import { use_i18n } from "@/lib/i18n/context";

interface BillingDialogsProps {
  subscription: SubscriptionResponse | null;
  set_subscription: React.Dispatch<
    React.SetStateAction<SubscriptionResponse | null>
  >;
  is_action_loading: boolean;
  set_is_action_loading: React.Dispatch<React.SetStateAction<boolean>>;
  show_cancel_dialog: boolean;
  set_show_cancel_dialog: React.Dispatch<React.SetStateAction<boolean>>;
  cancel_password: string;
  set_cancel_password: React.Dispatch<React.SetStateAction<string>>;
  cancel_password_error: string;
  set_cancel_password_error: React.Dispatch<React.SetStateAction<string>>;
  show_cancel_password: boolean;
  set_show_cancel_password: React.Dispatch<React.SetStateAction<boolean>>;
  handle_cancel: () => void;
  show_checkout_modal: boolean;
  set_show_checkout_modal: React.Dispatch<React.SetStateAction<boolean>>;
  selected_plan: AvailablePlan | null;
  set_selected_plan: React.Dispatch<React.SetStateAction<AvailablePlan | null>>;
  billing_period: "monthly" | "yearly" | "biennial";
  preferred_currency: string;
  show_payment_methods: boolean;
  set_show_payment_methods: React.Dispatch<React.SetStateAction<boolean>>;
  show_manage_plan: boolean;
  set_show_manage_plan: React.Dispatch<React.SetStateAction<boolean>>;
  show_switch_billing_dialog: boolean;
  set_show_switch_billing_dialog: React.Dispatch<React.SetStateAction<boolean>>;
  target_billing_interval: "month" | "year";
  yearly_savings: string | null;
  handle_switch_billing: () => void;
  show_addon_checkout: boolean;
  set_show_addon_checkout: React.Dispatch<React.SetStateAction<boolean>>;
  checkout_addon: StorageAddonItem | null;
  set_checkout_addon: React.Dispatch<
    React.SetStateAction<StorageAddonItem | null>
  >;
  show_cancel_addon_dialog: boolean;
  set_show_cancel_addon_dialog: React.Dispatch<React.SetStateAction<boolean>>;
  addon_to_cancel: UserActiveAddon | null;
  set_addon_to_cancel: React.Dispatch<
    React.SetStateAction<UserActiveAddon | null>
  >;
  load_data: () => Promise<void>;
}

export function BillingDialogs({
  subscription,
  set_subscription,
  is_action_loading,
  set_is_action_loading,
  show_cancel_dialog,
  set_show_cancel_dialog,
  cancel_password,
  set_cancel_password,
  cancel_password_error,
  set_cancel_password_error,
  show_cancel_password,
  set_show_cancel_password,
  handle_cancel,
  show_checkout_modal,
  set_show_checkout_modal,
  selected_plan,
  set_selected_plan,
  billing_period,
  preferred_currency,
  show_payment_methods,
  set_show_payment_methods,
  show_manage_plan,
  set_show_manage_plan,
  show_switch_billing_dialog,
  set_show_switch_billing_dialog,
  target_billing_interval,
  yearly_savings,
  handle_switch_billing,
  show_addon_checkout,
  set_show_addon_checkout,
  checkout_addon,
  set_checkout_addon,
  show_cancel_addon_dialog,
  set_show_cancel_addon_dialog,
  addon_to_cancel,
  set_addon_to_cancel,
  load_data,
}: BillingDialogsProps) {
  const { t } = use_i18n();

  return (
    <>
      <AlertDialog
        open={show_cancel_dialog}
        onOpenChange={(open) => {
          set_show_cancel_dialog(open);
          if (!open) {
            set_cancel_password("");
            set_cancel_password_error("");
            set_show_cancel_password(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.cancel_confirm_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.cancel_confirm_description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <label className="block text-sm font-medium text-txt-secondary mb-2">
              {t("settings.cancel_enter_password")}
            </label>
            <div className="relative">
              <Input
                className="w-full pr-10"
                placeholder={t("settings.cancel_password_placeholder")}
                status={cancel_password_error ? "error" : "default"}
                type={show_cancel_password ? "text" : "password"}
                value={cancel_password}
                onChange={(e) => {
                  set_cancel_password(e.target.value);
                  set_cancel_password_error("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handle_cancel();
                }}
              />
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-txt-muted hover:text-txt-secondary"
                tabIndex={-1}
                type="button"
                onClick={() => set_show_cancel_password(!show_cancel_password)}
              >
                {show_cancel_password ? (
                  <EyeSlashIcon className="w-4 h-4" />
                ) : (
                  <EyeIcon className="w-4 h-4" />
                )}
              </button>
            </div>
            {cancel_password_error && (
              <p
                className="text-xs mt-1.5"
                style={{ color: "var(--destructive)" }}
              >
                {cancel_password_error}
              </p>
            )}
          </div>
          <AlertDialogFooter className="max-sm:flex-row max-sm:gap-3">
            <AlertDialogCancel className="max-sm:flex-1">
              {t("settings.keep_plan")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="aster_btn_destructive max-sm:flex-1"
              disabled={!cancel_password.trim()}
              onClick={(e) => {
                e.preventDefault();
                handle_cancel();
              }}
            >
              {is_action_loading
                ? t("settings.cancelling")
                : t("settings.cancel_confirm_button")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {selected_plan && (
        <CheckoutModal
          billing_interval={
            billing_period === "yearly"
              ? "year"
              : billing_period === "biennial"
                ? "biennial"
                : "month"
          }
          currency={preferred_currency}
          on_close={() => {
            set_show_checkout_modal(false);
            set_selected_plan(null);
          }}
          on_success={async () => {
            set_show_checkout_modal(false);
            const upgraded_plan_code = selected_plan?.code;

            set_selected_plan(null);
            request_cache.invalidate("/payments/v1");
            invalidate_mail_stats();
            for (let attempt = 0; attempt < 6; attempt++) {
              await new Promise((r) =>
                setTimeout(r, attempt === 0 ? 1000 : 2000),
              );
              request_cache.invalidate("/payments/v1");
              const sub_response = await get_subscription();

              if (sub_response.data) {
                set_subscription(sub_response.data);
                if (
                  upgraded_plan_code &&
                  sub_response.data.plan.code === upgraded_plan_code
                ) {
                  invalidate_mail_stats();
                  load_data();
                  break;
                }
              }
              if (attempt === 5) {
                invalidate_mail_stats();
                load_data();
              }
            }
          }}
          open={show_checkout_modal}
          plan_code={selected_plan.code}
          plan_name={selected_plan.name}
          price_cents={
            billing_period === "yearly"
              ? PLAN_TIERS.find((t) => t.id === selected_plan.code)
                  ?.yearly_cents || selected_plan.price_cents
              : billing_period === "biennial"
                ? PLAN_TIERS.find((t) => t.id === selected_plan.code)
                    ?.biennial_cents || selected_plan.price_cents
                : PLAN_TIERS.find((t) => t.id === selected_plan.code)
                    ?.monthly_cents || selected_plan.price_cents
          }
          price_display={format_price(
            billing_period === "yearly"
              ? PLAN_TIERS.find((t) => t.id === selected_plan.code)
                  ?.yearly_cents || selected_plan.price_cents
              : billing_period === "biennial"
                ? PLAN_TIERS.find((t) => t.id === selected_plan.code)
                    ?.biennial_cents || selected_plan.price_cents
                : PLAN_TIERS.find((t) => t.id === selected_plan.code)
                    ?.monthly_cents || selected_plan.price_cents,
          )}
        />
      )}

      <PaymentMethodsModal
        on_close={() => set_show_payment_methods(false)}
        open={show_payment_methods}
      />

      <Modal
        show_close_button
        is_open={show_manage_plan}
        on_close={() => set_show_manage_plan(false)}
        size="md"
      >
        <ModalHeader>
          <ModalTitle>{t("settings.manage_plan")}</ModalTitle>
          <ModalDescription>
            {t("settings.manage_plan_description")}
          </ModalDescription>
        </ModalHeader>
        <ModalBody>
          <div className="space-y-2">
            <button
              className="w-full flex items-center gap-3 rounded-lg border p-3.5 text-left transition-colors hover:opacity-80"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                borderColor: "var(--border-secondary)",
              }}
              onClick={() => {
                set_show_manage_plan(false);
                setTimeout(() => set_show_payment_methods(true), 200);
              }}
            >
              <CreditCardIcon
                className="w-5 h-5 flex-shrink-0"
                style={{ color: "var(--text-tertiary)" }}
              />
              <div>
                <div
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {t("settings.manage_payment_methods")}
                </div>
                <div
                  className="text-xs mt-0.5"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {t("settings.manage_payment")}
                </div>
              </div>
            </button>

            {subscription && !subscription.cancel_at_period_end && (
              <button
                className="w-full flex items-center gap-3 rounded-lg border p-3.5 text-left transition-colors hover:opacity-80"
                style={{
                  backgroundColor: "var(--bg-tertiary)",
                  borderColor: "var(--border-secondary)",
                }}
                onClick={() => {
                  set_show_manage_plan(false);
                  setTimeout(() => set_show_switch_billing_dialog(true), 200);
                }}
              >
                <ArrowsRightLeftIcon
                  className="w-5 h-5 flex-shrink-0"
                  style={{ color: "var(--text-tertiary)" }}
                />
                <div>
                  <div
                    className="text-sm font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {target_billing_interval === "year"
                      ? t("settings.switch_to_yearly")
                      : t("settings.switch_to_monthly")}
                  </div>
                  {yearly_savings && (
                    <div
                      className="text-xs mt-0.5"
                      style={{
                        color:
                          target_billing_interval === "year"
                            ? "var(--color-success)"
                            : "var(--color-warning)",
                      }}
                    >
                      {target_billing_interval === "year"
                        ? t("settings.switch_billing_savings", {
                            amount: yearly_savings,
                          })
                        : t("settings.switch_billing_loss", {
                            amount: yearly_savings,
                          })}
                    </div>
                  )}
                </div>
              </button>
            )}

            <button
              className="w-full flex items-center gap-3 rounded-lg p-3.5 text-left transition-colors hover:opacity-80"
              onClick={() => {
                set_show_manage_plan(false);
                setTimeout(() => {
                  set_cancel_password("");
                  set_cancel_password_error("");
                  set_show_cancel_password(false);
                  set_show_cancel_dialog(true);
                }, 200);
              }}
            >
              <XCircleIcon
                className="w-5 h-5 flex-shrink-0"
                style={{ color: "var(--text-tertiary)" }}
              />
              <div>
                <div
                  className="text-sm font-medium"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {t("settings.cancel_plan")}
                </div>
                <div
                  className="text-xs mt-0.5"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {t("settings.cancel_plan_warning")}
                </div>
              </div>
            </button>
          </div>
        </ModalBody>
      </Modal>

      {checkout_addon && (
        <CheckoutModal
          addon_id={checkout_addon.id}
          billing_interval="month"
          currency={preferred_currency}
          current_plan_price_cents={subscription?.plan.price_cents}
          on_close={() => {
            set_show_addon_checkout(false);
            set_checkout_addon(null);
          }}
          on_success={async () => {
            set_show_addon_checkout(false);
            set_checkout_addon(null);
            request_cache.invalidate("/payments/v1");
            request_cache.invalidate("/sync/v1");
            invalidate_mail_stats();
            await load_data();
            for (let attempt = 0; attempt < 5; attempt++) {
              await new Promise((r) => setTimeout(r, 2000));
              request_cache.invalidate("/sync/v1");
              invalidate_mail_stats();
              await load_data();
            }
          }}
          open={show_addon_checkout}
          plan_code="addon"
          plan_name={checkout_addon.name}
          price_cents={checkout_addon.price_cents}
          price_display={format_price(checkout_addon.price_cents)}
        />
      )}

      <AlertDialog
        open={show_switch_billing_dialog}
        onOpenChange={set_show_switch_billing_dialog}
      >
        <AlertDialogContent
          on_overlay_click={() => set_show_switch_billing_dialog(false)}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.switch_billing_confirm")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.switch_billing_description")}
              {yearly_savings && (
                <span
                  className="block mt-2 font-medium"
                  style={{
                    color:
                      target_billing_interval === "year"
                        ? "var(--color-success)"
                        : "var(--color-warning)",
                  }}
                >
                  {target_billing_interval === "year"
                    ? t("settings.switch_billing_savings", {
                        amount: yearly_savings,
                      })
                    : t("settings.switch_billing_loss", {
                        amount: yearly_savings,
                      })}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="max-sm:flex-row max-sm:gap-3">
            <AlertDialogCancel className="max-sm:flex-1">
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="max-sm:flex-1"
              onClick={handle_switch_billing}
            >
              {is_action_loading
                ? t("settings.switching_billing")
                : t("settings.switch_billing_confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={show_cancel_addon_dialog}
        onOpenChange={set_show_cancel_addon_dialog}
      >
        <AlertDialogContent
          on_overlay_click={() => set_show_cancel_addon_dialog(false)}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.confirm_cancel_addon")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.confirm_cancel_addon_description")}
              {addon_to_cancel && (
                <span className="block mt-2 font-medium text-txt-primary">
                  {addon_to_cancel.size_label} -{" "}
                  {format_price(addon_to_cancel.price_cents)}
                  {t("settings.per_month_short")}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="max-sm:flex-row max-sm:gap-3">
            <AlertDialogCancel className="max-sm:flex-1">
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="aster_btn_destructive max-sm:flex-1"
              onClick={async () => {
                if (!addon_to_cancel) return;
                set_is_action_loading(true);
                try {
                  const response = await cancel_storage_addon(
                    addon_to_cancel.user_addon_id,
                  );

                  if (response.data?.success) {
                    show_toast(t("settings.addon_cancelled"), "success");
                    request_cache.invalidate("/payments/v1");
                    request_cache.invalidate("/sync/v1");
                    invalidate_mail_stats();
                    await load_data();
                  } else {
                    show_toast(t("settings.addon_cancel_failed"), "error");
                  }
                } catch (error) {
                  if (import.meta.env.DEV) console.error(error);
                  show_toast(t("settings.addon_cancel_failed"), "error");
                } finally {
                  set_is_action_loading(false);
                  set_show_cancel_addon_dialog(false);
                  set_addon_to_cancel(null);
                }
              }}
            >
              {is_action_loading
                ? t("settings.cancelling")
                : t("settings.confirm_cancel_addon")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
