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
import { api_client } from "./client";

import { format_bytes } from "@/lib/utils";
import {
  bonus_bytes_max,
  bonus_bytes_per_referral,
  referral_bytes,
  referral_count,
} from "@/lib/referral_bonus";
import { payment_url_or_throw } from "@/lib/payment_url";
import { app_locale, get_display_time_zone } from "@/utils/date_format";

export interface PlanInfo {
  id: string;
  code: string;
  name: string;
  description: string | null;
  storage_limit_bytes: number;
  price_cents: number;
  billing_period: string | null;
}

export interface StorageInfo {
  used_bytes: number;
  limit_bytes: number;
  total_limit_bytes: number;
  percentage_used: number;
  is_over_limit: boolean;
}

export interface PendingOffer {
  code: string;
  discount_label: string;
  expires_at: string;
}

export interface SubscriptionResponse {
  plan: PlanInfo;
  status: string;
  cancel_at_period_end: boolean;
  current_period_start: string | null;
  current_period_end: string | null;
  storage: StorageInfo;
  currency: string | null;
  payment_failed_at: string | null;
  grace_period_end: string | null;
  payment_provider?: string | null;
  paid_until?: string | null;
  has_stripe_subscription?: boolean;
  active_discount_description?: string | null;
  pending_offer?: PendingOffer | null;
}

export interface AvailablePlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  storage_limit_bytes: number;
  max_attachment_size_bytes: number;
  max_email_aliases: number;
  max_custom_domains: number;
  price_cents: number;
  billing_period: string | null;
  stripe_price_id: string | null;
}

export interface AvailablePlansResponse {
  plans: AvailablePlan[];
}

export interface CurrentPlanResponse {
  plan: AvailablePlan;
  subscription_state: string;
  started_at: string;
  expires_at: string | null;
}

export interface CheckoutSessionResponse {
  session_id: string;
  url: string;
}

export interface PortalSessionResponse {
  url: string;
}

export interface BillingHistoryItem {
  id: string;
  amount_cents: number;
  currency: string;
  status: string;
  description: string | null;
  plan_name: string | null;
  period_start: string | null;
  period_end: string | null;
  invoice_pdf_url: string | null;
  created_at: string;
}

export interface BillingHistoryResponse {
  items: BillingHistoryItem[];
  total: number;
  page: number;
  per_page: number;
}

export interface CancelSubscriptionResponse {
  cancel_at_period_end: boolean;
  current_period_end: string | null;
}

export interface CancelImpactResponse {
  plan_code: string;
  plan_name: string;
  effective_at: string | null;
  storage_used_bytes: number;
  storage_limit_bytes: number;
  storage_limit_after_bytes: number;
  storage_over_limit: boolean;
  aliases_to_disable: number;
  alias_grace_days: number;
  domains_to_suspend: number;
  templates_to_disable: number;
  signatures_to_disable: number;
  catch_all_to_revoke: number;
  family_members_affected: number;
  family_addresses_released: number;
  family_grace_days: number;
  features_lost: string[];
}

export interface ReactivateResponse {
  cancel_at_period_end: boolean;
}

export interface SwitchBillingResponse {
  billing_interval: string;
  new_price_cents: number;
  current_period_start: string | null;
  current_period_end: string | null;
}

export interface StripeConfigResponse {
  publishable_key: string | null;
  is_enabled: boolean;
}

export interface LimitInfo {
  limit: number;
  current: number;
  is_at_limit: boolean;
}

export interface StorageLockStatus {
  used_bytes: number;
  limit_bytes: number;
  percentage_used: number;
  is_warning: boolean;
  is_locked: boolean;
  lock_started_at: string | null;
  days_until_permanent_bounce: number | null;
}

export interface PlanLimitsResponse {
  plan_code: string;
  plan_name: string;
  limits: Record<string, LimitInfo>;
  storage: StorageLockStatus;
}

export async function get_subscription() {
  return api_client.get<SubscriptionResponse>("/payments/v1/subscription");
}

export async function get_available_plans() {
  return api_client.get<AvailablePlansResponse>("/payments/v1/plans");
}

export async function get_current_plan() {
  return api_client.get<CurrentPlanResponse>("/payments/v1/plans/current");
}

export interface CurrencyRatesResponse {
  base: string;
  rates: Record<string, number>;
  as_of: string;
  is_live: boolean;
}

export async function get_currency_rates() {
  return api_client.get<CurrencyRatesResponse>(
    "/public/v1/billing/currency-rates",
  );
}

export function billing_return_origin(): string {
  if (typeof window === "undefined") return "https://app.astermail.org";
  if ("__TAURI_INTERNALS__" in window) return "https://app.astermail.org";

  return window.location.origin;
}

export function billing_return_path(): string {
  if (typeof window === "undefined") return "/";
  if ("__TAURI_INTERNALS__" in window) return "/";

  const path = window.location.pathname;

  return path.startsWith("/") && !path.startsWith("//") ? path : "/";
}

export function billing_return_urls(): {
  success_url: string;
  cancel_url: string;
} {
  const origin = billing_return_origin();
  const path = billing_return_path();

  return {
    success_url: `${origin}${path}?billing=success`,
    cancel_url: `${origin}${path}?billing=cancelled`,
  };
}

export async function create_checkout_session(
  plan_code: string,
  billing_interval: string = "month",
  currency?: string,
  apply_credits_cents?: number,
) {
  const { success_url, cancel_url } = billing_return_urls();

  return api_client.post<CheckoutSessionResponse>(
    "/payments/v1/checkout-session",
    {
      plan_code,
      billing_interval,
      success_url,
      cancel_url,
      ...(currency ? { currency } : {}),
      ...(apply_credits_cents && apply_credits_cents > 0
        ? { apply_credits_cents }
        : {}),
    },
  );
}

export async function start_hosted_checkout(
  plan_code: string,
  billing_interval: string = "month",
  currency?: string,
  apply_credits_cents?: number,
): Promise<{ ok: boolean; error?: string; server_code?: string }> {
  const response = await create_checkout_session(
    plan_code,
    billing_interval,
    currency,
    apply_credits_cents,
  );

  const url = response.data?.url;

  if (!url) {
    return {
      ok: false,
      error: response.error || "no_checkout_url",
      server_code: response.server_code,
    };
  }

  remember_checkout_target(plan_code, billing_interval);
  await open_payment_url(url);

  return { ok: true };
}

export async function open_billing_portal(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const response = await create_portal_session();

  const url = response.data?.url;

  if (!url) {
    return { ok: false, error: response.error || "no_portal_url" };
  }

  await open_payment_url(url);

  return { ok: true };
}

export async function open_payment_url(url: string): Promise<void> {
  const safe = payment_url_or_throw(url);

  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    const core = await import("@tauri-apps/api/core");

    await core.invoke("open_external_url", { url: safe });

    return;
  }
  window.location.assign(safe);
}

export interface PlanChangePreviewResponse {
  credit_cents: number;
  amount_due_cents: number;
  currency: string;
}

export async function preview_plan_change(
  plan_code: string,
  billing_interval: string = "month",
): Promise<{ data?: PlanChangePreviewResponse; error?: string }> {
  return api_client.get<PlanChangePreviewResponse>(
    `/payments/v1/change-plan-preview?plan_code=${encodeURIComponent(plan_code)}&billing_interval=${encodeURIComponent(billing_interval)}`,
    { skip_cache: true },
  );
}

export const BILLING_TARGET_PLAN_KEY = "aster_billing_target_plan";

export interface CheckoutTarget {
  plan_code: string;
  billing_interval: string;
}

export function remember_checkout_target(
  plan_code: string,
  billing_interval: string = "month",
): void {
  try {
    sessionStorage.setItem(
      BILLING_TARGET_PLAN_KEY,
      plan_code + "|" + billing_interval,
    );
  } catch {
    return;
  }
}

export function read_checkout_target(): CheckoutTarget | null {
  let raw: string | null = null;

  try {
    raw = sessionStorage.getItem(BILLING_TARGET_PLAN_KEY);
  } catch {
    return null;
  }

  if (!raw) return null;

  const [plan_code, billing_interval] = raw.split("|");

  if (!plan_code) return null;

  return { plan_code, billing_interval: billing_interval || "month" };
}

export function clear_checkout_target(): void {
  try {
    sessionStorage.removeItem(BILLING_TARGET_PLAN_KEY);
  } catch {
    return;
  }
}

export async function change_plan(
  plan_code: string,
  billing_interval: string = "month",
  success_url?: string,
  cancel_url?: string,
): Promise<{
  ok: boolean;
  requires_checkout: boolean;
  error?: string;
  server_code?: string;
}> {
  const response = await api_client.post<{
    plan_code?: string;
    billing_interval?: string;
    checkout_url?: string;
  }>("/payments/v1/change-plan", {
    plan_code,
    billing_interval,
    success_url: success_url ?? billing_return_urls().success_url,
    cancel_url: cancel_url ?? billing_return_urls().cancel_url,
  });

  if (response.error || !response.data) {
    return {
      ok: false,
      requires_checkout: false,
      error: response.error || "change_failed",
      server_code: response.server_code,
    };
  }

  if (response.data.checkout_url) {
    remember_checkout_target(plan_code, billing_interval);
    await open_payment_url(response.data.checkout_url);

    return { ok: true, requires_checkout: true };
  }

  return { ok: true, requires_checkout: false };
}

export async function create_crypto_checkout_session(
  plan_code: string,
  term_months: number,
  success_url?: string,
  cancel_url?: string,
) {
  return api_client.post<CheckoutSessionResponse>(
    "/payments/v1/crypto/checkout-session",
    {
      plan_code,
      term_months,
      ...(success_url ? { success_url } : {}),
      ...(cancel_url ? { cancel_url } : {}),
    },
  );
}

export interface CryptoNativeCoin {
  currency: string;
  chain: string;
  display_name: string;
  decimals: number;
  recommended: boolean;
}

export interface CryptoNativeCoinsResponse {
  enabled: boolean;
  coins: CryptoNativeCoin[];
}

export type CryptoInvoiceStatus =
  | "pending"
  | "detected"
  | "confirming"
  | "paid"
  | "underpaid"
  | "expired"
  | "cancelled"
  | "manual_review";

export interface CryptoNativeInvoiceResponse {
  id: string;
  currency: string;
  chain: string;
  display_name: string;
  address: string;
  amount_atomic: string;
  amount_decimal: string;
  decimals: number;
  usd_cents: number;
  rate_locked_usd: string;
  payment_uri: string;
  min_confirmations: number;
  status: CryptoInvoiceStatus;
  expires_at: string;
  created_at: string;
}

export interface CryptoNativeInvoiceStatus {
  id: string;
  kind?: string;
  currency: string;
  chain: string;
  display_name: string;
  address: string;
  amount_atomic: string;
  amount_decimal: string;
  amount_received_atomic: string;
  amount_received_decimal: string;
  amount_due_atomic: string;
  amount_due_decimal: string;
  decimals: number;
  usd_cents: number;
  rate_locked_usd: string;
  status: CryptoInvoiceStatus;
  confirmations: number;
  min_confirmations: number;
  txids: string[];
  payment_uri: string;
  expires_at: string;
  watch_until: string;
  created_at: string;
  completed_at: string | null;
  server_time?: string;
}

export interface CryptoNativePendingInvoice {
  id: string;
  currency: string;
  chain: string;
  display_name: string;
  status: CryptoInvoiceStatus;
  usd_cents: number;
  amount_decimal: string;
  expires_at: string;
  created_at: string;
}

export interface CryptoNativePendingResponse {
  invoices: CryptoNativePendingInvoice[];
}

export interface CryptoNativeCancelResponse {
  id: string;
  status: CryptoInvoiceStatus;
}

export async function get_crypto_native_coins() {
  return api_client.get<CryptoNativeCoinsResponse>(
    "/payments/v1/crypto-native/coins",
    { cache_ttl: 300_000 },
  );
}

export async function create_crypto_native_invoice(
  plan_code: string,
  term_months: number,
  currency: string,
  chain: string,
) {
  return api_client.post<CryptoNativeInvoiceResponse>(
    "/payments/v1/crypto-native/invoice",
    { plan_code, term_months, currency, chain },
  );
}

export async function create_crypto_native_addon_invoice(
  addon_id: string,
  term_months: number,
  currency: string,
  chain: string,
) {
  return api_client.post<CryptoNativeInvoiceResponse>(
    "/payments/v1/crypto-native/invoice",
    { addon_id, term_months, currency, chain },
  );
}

export async function get_crypto_native_invoice(invoice_id: string) {
  return api_client.get<CryptoNativeInvoiceStatus>(
    `/payments/v1/crypto-native/invoice/${encodeURIComponent(invoice_id)}`,
    { cache_ttl: 0 },
  );
}

export async function cancel_crypto_native_invoice(invoice_id: string) {
  return api_client.post<CryptoNativeCancelResponse>(
    `/payments/v1/crypto-native/invoice/${encodeURIComponent(invoice_id)}/cancel`,
    {},
  );
}

export async function list_pending_crypto_invoices() {
  return api_client.get<CryptoNativePendingResponse>(
    "/payments/v1/crypto-native/invoices/pending",
    { cache_ttl: 0 },
  );
}

export async function create_portal_session() {
  return api_client.post<PortalSessionResponse>(
    "/payments/v1/portal-session",
    {},
  );
}

export async function get_billing_history(
  page: number = 1,
  per_page: number = 20,
) {
  return api_client.get<BillingHistoryResponse>(
    `/payments/v1/history?page=${page}&per_page=${per_page}`,
  );
}

export async function cancel_subscription(
  password_hash: string,
  cancel_reason?: string,
  cancel_reason_text?: string,
) {
  return api_client.post<CancelSubscriptionResponse>("/payments/v1/cancel", {
    password_hash,
    cancel_reason,
    cancel_reason_text: cancel_reason_text?.slice(0, 2000),
  });
}

export async function get_cancel_impact() {
  return api_client.get<CancelImpactResponse>("/payments/v1/cancel-impact");
}

export async function reactivate_subscription() {
  return api_client.post<ReactivateResponse>("/payments/v1/reactivate", {});
}

export async function switch_billing_interval(billing_interval: string) {
  return api_client.post<SwitchBillingResponse>("/payments/v1/switch-billing", {
    billing_interval,
  });
}

export async function get_stripe_config() {
  return api_client.get<StripeConfigResponse>("/payments/v1/config");
}

export async function get_plan_limits() {
  return api_client.get<PlanLimitsResponse>("/payments/v1/plans/limits", {
    cache_ttl: 60_000,
  });
}

export interface StorageAddonItem {
  id: string;
  name: string;
  storage_bytes: number;
  price_cents: number;
  billing_period: string;
  is_active: boolean;
}

export interface UserActiveAddon {
  user_addon_id: string;
  addon_id: string;
  size_label: string;
  size_bytes: number;
  price_cents: number;
  state: string;
  created_at: string;
  cancel_at_period_end: boolean;
  current_period_end?: string;
}

export interface StorageAddonsResponse {
  available_addons: StorageAddonItem[];
  active_addons: UserActiveAddon[];
  promo_eligible?: boolean;
  promo_percent_off?: number;
  promo_duration_months?: number;
}

export interface PurchaseAddonResponse {
  url: string;
}

export async function get_storage_addons() {
  return api_client.get<StorageAddonsResponse>("/sync/v1/storage/addons");
}

export async function purchase_storage_addon(
  addon_id: string,
  apply_credits_cents?: number,
  success_url?: string,
  cancel_url?: string,
) {
  return api_client.post<PurchaseAddonResponse>(
    "/sync/v1/storage/addons/purchase",
    {
      addon_id,
      ...(apply_credits_cents && apply_credits_cents > 0
        ? { apply_credits_cents }
        : {}),
      ...(success_url ? { success_url } : {}),
      ...(cancel_url ? { cancel_url } : {}),
    },
  );
}

export async function purchase_storage_addon_crypto(
  addon_id: string,
  term_months: number,
  success_url?: string,
  cancel_url?: string,
) {
  return api_client.post<PurchaseAddonResponse>(
    "/sync/v1/storage/addons/crypto-checkout",
    {
      addon_id,
      term_months,
      ...(success_url ? { success_url } : {}),
      ...(cancel_url ? { cancel_url } : {}),
    },
  );
}

export interface CreateAddonSubscriptionResponse {
  client_secret: string;
  subscription_id: string;
}

export async function create_addon_subscription(addon_id: string) {
  return api_client.post<CreateAddonSubscriptionResponse>(
    "/sync/v1/storage/addons/create-subscription",
    { addon_id },
  );
}

export async function cancel_storage_addon(user_addon_id: string) {
  return api_client.post<{ success: boolean }>(
    "/sync/v1/storage/addons/cancel",
    { user_addon_id },
  );
}

export { format_bytes as format_storage };

export function format_price(cents: number, currency: string = "usd"): string {
  const amount = cents / 100;

  return new Intl.NumberFormat(app_locale(), {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);
}

export function format_date(date_string: string | null): string {
  if (!date_string) return "-";

  return new Date(date_string).toLocaleDateString(app_locale(), {
    timeZone: get_display_time_zone(),
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export interface PromoValidateResponse {
  valid: boolean;
  discount_type: string | null;
  discount_value: number | null;
  duration: string | null;
  duration_in_months: number | null;
  description: string | null;
}

export interface PromoApplyResponse {
  applied: boolean;
  discount_description: string | null;
}

export async function validate_promo_code(code: string) {
  return api_client.post<PromoValidateResponse>("/payments/v1/promo/validate", {
    code,
  });
}

export async function apply_promo_code(code: string) {
  return api_client.post<PromoApplyResponse>("/payments/v1/promo/apply", {
    code,
  });
}

export interface AcademicDiscountStatusResponse {
  status: "none" | "pending" | "verified";
  promo_code: string | null;
  code_expires_at: string | null;
}

export interface AcademicDiscountResponse {
  success: boolean;
}

export async function request_academic_verification(
  academic_email: string,
  turnstile_token?: string,
) {
  return api_client.post<AcademicDiscountResponse>(
    "/payments/v1/discounts/academic/request",
    { academic_email, ...(turnstile_token ? { turnstile_token } : {}) },
  );
}

export async function resend_academic_verification(turnstile_token?: string) {
  return api_client.post<AcademicDiscountResponse>(
    "/payments/v1/discounts/academic/resend",
    { ...(turnstile_token ? { turnstile_token } : {}) },
  );
}

export async function get_academic_discount_status() {
  return api_client.get<AcademicDiscountStatusResponse>(
    "/payments/v1/discounts/academic/status",
  );
}

export interface CreateSubscriptionResponse {
  client_secret: string;
  subscription_id: string;
  applied_credits_cents?: number;
}

export async function create_subscription_intent(
  plan_code: string,
  billing_interval: string,
  currency?: string,
  promo_code?: string,
  apply_credits_cents?: number,
) {
  const payload: Record<string, string | number> = {
    plan_code,
    billing_interval,
  };

  if (currency) payload.currency = currency;
  if (promo_code) payload.promo_code = promo_code;
  if (apply_credits_cents && apply_credits_cents > 0) {
    payload.apply_credits_cents = apply_credits_cents;
  }

  return api_client.post<CreateSubscriptionResponse>(
    "/payments/v1/create-subscription",
    payload,
  );
}

export async function activate_subscription() {
  return api_client.post<{ activated: boolean }>(
    "/payments/v1/activate-subscription",
    {},
  );
}

export interface PaymentMethodItem {
  id: string;
  pm_type: string;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  display_name: string;
  is_default: boolean;
}

export interface PaymentMethodsListResponse {
  payment_methods: PaymentMethodItem[];
}

export interface SetupIntentResponse {
  client_secret: string;
}

export async function list_payment_methods() {
  return api_client.get<PaymentMethodsListResponse>(
    "/payments/v1/payment-methods",
  );
}

export async function create_setup_intent() {
  return api_client.post<SetupIntentResponse>(
    "/payments/v1/payment-methods/setup-intent",
    {},
  );
}

export interface PaymentMethodActionResponse {
  success: boolean;
  retry_attempted?: boolean;
  retry_succeeded?: boolean;
  decline_code?: string | null;
}

export async function set_default_payment_method(payment_method_id: string) {
  return api_client.post<PaymentMethodActionResponse>(
    "/payments/v1/payment-methods/default",
    { payment_method_id },
  );
}

export async function detach_payment_method(payment_method_id: string) {
  return api_client.post<{ success: boolean }>(
    "/payments/v1/payment-methods/detach",
    { payment_method_id },
  );
}

export interface CreditBalanceResponse {
  balance_cents: number;
  balance_dollars: string;
  use_credits_for_renewals: boolean;
  recent_transactions: CreditTransactionItem[];
}

export interface CreditTransactionItem {
  id: string;
  amount_cents: number;
  transaction_type: string;
  description: string | null;
  created_at: string;
}

export interface CreditTransactionsResponse {
  transactions: CreditTransactionItem[];
  total: number;
  page: number;
  per_page: number;
}

export interface CreditSettingsResponse {
  use_credits_for_renewals: boolean;
  balance_cents: number;
}

export async function get_credits() {
  return api_client.get<CreditBalanceResponse>("/payments/v1/credits");
}

export async function update_credit_settings(
  use_credits_for_renewals: boolean,
) {
  return api_client.post<CreditSettingsResponse>(
    "/payments/v1/credits/settings",
    { use_credits_for_renewals },
  );
}

export async function get_credit_transactions(
  page: number = 1,
  per_page: number = 20,
) {
  return api_client.get<CreditTransactionsResponse>(
    `/payments/v1/credits/transactions?page=${page}&per_page=${per_page}`,
  );
}

export interface CreditPackageItem {
  id: string;
  amount_cents: number;
  price_cents: number;
  bonus_cents: number;
  sort_order: number;
}

export interface CreditPackagesResponse {
  packages: CreditPackageItem[];
}

export interface PurchaseCreditsResponse {
  url: string;
}

export async function get_credit_packages() {
  return api_client.get<CreditPackagesResponse>(
    "/payments/v1/credits/packages",
  );
}

export async function purchase_credits(package_id: string, currency?: string) {
  return api_client.post<PurchaseCreditsResponse>(
    "/payments/v1/credits/purchase",
    {
      package_id,
      ...(currency ? { currency } : {}),
    },
  );
}

export async function purchase_credits_crypto(package_id: string) {
  return api_client.post<PurchaseCreditsResponse>(
    "/payments/v1/credits/crypto-purchase",
    {
      package_id,
    },
  );
}

export interface CreditPaymentIntentResponse {
  client_secret: string;
  payment_intent_id: string;
  amount_cents: number;
  currency: string;
}

export async function create_credit_payment_intent(
  package_id: string,
  currency: string,
) {
  return api_client.post<CreditPaymentIntentResponse>(
    "/payments/v1/credits/payment-intent",
    {
      package_id,
      currency,
    },
  );
}

export async function confirm_credit_purchase(payment_intent_id: string) {
  return api_client.post<{ credited: boolean; balance_cents: number }>(
    "/payments/v1/credits/confirm",
    { payment_intent_id },
  );
}

export interface ReferralInfo {
  referral_link: string;
  referral_code: string;
  total_referrals: number;
  pending_referrals: number;
  completed_referrals: number;
  credits_earned_cents: number;
  commission_earned_cents: number;
  max_credits_cents: number;
  commission_percent: number;
  is_eligible: boolean;
  is_affiliate?: boolean;
  earned_install_ios_cents?: number;
  earned_install_android_cents?: number;
  earned_install_desktop_cents?: number;
  activated_referrals: number;
  bonus_bytes_earned: number;
  bonus_bytes_per_referral: number;
  bonus_bytes_max: number;
}

export interface ReferralHistoryItem {
  id: string;
  referee_email_masked: string;
  status: string;
  referrer_credit_cents: number;
  created_at: string;
  completed_at: string | null;
  bonus_bytes: number;
  activated_at: string | null;
}

export interface ReferralHistoryResponse {
  referrals: ReferralHistoryItem[];
  total: number;
}

export interface MyReferralStatus {
  was_referred: boolean;
  status: string | null;
  discount_promo_code: string | null;
  discount_issued_at: string | null;
  discount_redeemed_at: string | null;
  discount_expires_at: string | null;
  can_claim: boolean;
  claim_window_ends_at: string | null;
  bonus_bytes: number;
}

export async function get_my_referral_status() {
  const response = await api_client.get<MyReferralStatus>(
    "/payments/v1/referrals/me",
  );

  if (!response.data) return response;

  return {
    ...response,
    data: {
      ...response.data,
      can_claim: response.data.can_claim === true,
      bonus_bytes: bonus_bytes_per_referral(response.data.bonus_bytes),
    },
  };
}

export interface MyAffiliateStatus {
  is_affiliate: boolean;
  commission_percent: number;
  total_earned_cents: number;
  earned_this_month_cents: number;
  total_paid_out_cents: number;
  outstanding_cents: number;
}

export async function get_my_affiliate_status() {
  return api_client.get<MyAffiliateStatus>("/payments/v1/referrals/affiliate");
}

export interface AffiliatePayoutRequest {
  short_code: string;
  amount_cents: number;
  created_at: string;
}

export async function request_affiliate_payout(amount_cents?: number) {
  return api_client.post<AffiliatePayoutRequest>(
    "/payments/v1/referrals/affiliate/request-payout",
    { amount_cents: amount_cents ?? null },
  );
}

export interface MyAffiliatePayoutRequestItem {
  short_code: string;
  amount_cents: number;
  status: string;
  created_at: string;
  accepted_at: string | null;
  rejected_at: string | null;
}

export async function list_my_affiliate_payout_requests() {
  return api_client.get<MyAffiliatePayoutRequestItem[]>(
    "/payments/v1/referrals/affiliate/payout-requests",
  );
}

export async function get_referral_info() {
  const response = await api_client.get<ReferralInfo>("/payments/v1/referrals");

  if (!response.data) return response;

  return {
    ...response,
    data: {
      ...response.data,
      total_referrals: referral_count(response.data.total_referrals),
      activated_referrals: referral_count(response.data.activated_referrals),
      bonus_bytes_earned: referral_bytes(response.data.bonus_bytes_earned),
      bonus_bytes_per_referral: bonus_bytes_per_referral(
        response.data.bonus_bytes_per_referral,
      ),
      bonus_bytes_max: bonus_bytes_max(response.data.bonus_bytes_max),
    },
  };
}

export function build_referral_invite_url(referral_code: string): string {
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://app.astermail.org";

  return `${origin}/invite/${referral_code}`;
}

export async function get_referral_history() {
  const response = await api_client.get<ReferralHistoryResponse>(
    "/payments/v1/referrals/history",
  );

  if (!response.data) return response;

  return {
    ...response,
    data: {
      ...response.data,
      referrals: (response.data.referrals ?? []).map((item) => ({
        ...item,
        bonus_bytes: referral_bytes(item.bonus_bytes),
      })),
    },
  };
}

export interface ClaimReferralResponse {
  accepted: boolean;
  referrer_display_name: string | null;
  bonus_bytes_per_referral: number;
}

export async function claim_referral_code(code: string) {
  return api_client.post<ClaimReferralResponse>(
    "/payments/v1/referrals/claim",
    { code },
  );
}

export async function record_referral_share() {
  return api_client.post<void>("/payments/v1/referrals/share", {});
}
