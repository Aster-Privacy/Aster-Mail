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
  is_current: boolean;
}

export interface AvailablePlansResponse {
  plans: AvailablePlan[];
  current_plan_id: string | null;
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

export async function create_checkout_session(
  plan_code: string,
  billing_interval: string = "month",
  currency?: string,
) {
  return api_client.post<CheckoutSessionResponse>(
    "/payments/v1/checkout-session",
    {
      plan_code,
      billing_interval,
      ...(currency ? { currency } : {}),
    },
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

export async function cancel_subscription(password_hash: string) {
  return api_client.post<CancelSubscriptionResponse>("/payments/v1/cancel", {
    password_hash,
  });
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
}

export interface PurchaseAddonResponse {
  url: string;
}

export async function get_storage_addons() {
  return api_client.get<StorageAddonsResponse>("/sync/v1/storage/addons");
}

export async function purchase_storage_addon(addon_id: string) {
  return api_client.post<PurchaseAddonResponse>(
    "/sync/v1/storage/addons/purchase",
    { addon_id },
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

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);
}

export function format_date(date_string: string | null): string {
  if (!date_string) return "-";

  return new Date(date_string).toLocaleDateString(undefined, {
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

export interface CreateSubscriptionResponse {
  client_secret: string;
  subscription_id: string;
}

export async function create_subscription_intent(
  plan_code: string,
  billing_interval: string,
  currency?: string,
  promo_code?: string,
) {
  const payload: Record<string, string> = { plan_code, billing_interval };

  if (currency) payload.currency = currency;
  if (promo_code) payload.promo_code = promo_code;

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

export async function set_default_payment_method(payment_method_id: string) {
  return api_client.post<{ success: boolean }>(
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
}

export interface ReferralHistoryItem {
  id: string;
  referee_email_masked: string;
  status: string;
  referrer_credit_cents: number;
  created_at: string;
  completed_at: string | null;
}

export interface ReferralHistoryResponse {
  referrals: ReferralHistoryItem[];
  total: number;
}

export async function get_referral_info() {
  return api_client.get<ReferralInfo>("/payments/v1/referrals");
}

export async function get_referral_history() {
  return api_client.get<ReferralHistoryResponse>(
    "/payments/v1/referrals/history",
  );
}

export interface BillingAddressInfo {
  company_name: string | null;
  vat_number: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
}

export async function get_billing_address() {
  return api_client.get<BillingAddressInfo>("/payments/v1/billing-address");
}

export async function update_billing_address(address: BillingAddressInfo) {
  return api_client.post<{ success: boolean }>(
    "/payments/v1/billing-address",
    address,
  );
}

export interface DataExportResponse {
  export_id: string;
  status: string;
  download_url: string | null;
  created_at: string;
  expires_at: string | null;
}

export async function request_data_export() {
  return api_client.post<DataExportResponse>("/api/v1/account/export", {});
}

export async function get_data_export_status() {
  return api_client.get<DataExportResponse>("/api/v1/account/export");
}
