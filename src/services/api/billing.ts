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
  referral_bonus_bytes: number;
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

export interface StripeConfigResponse {
  publishable_key: string | null;
  is_enabled: boolean;
}

export async function get_subscription() {
  return api_client.get<SubscriptionResponse>("/billing/subscription");
}

export async function get_available_plans() {
  return api_client.get<AvailablePlansResponse>("/billing/plans");
}

export async function create_checkout_session(
  plan_code: string,
  billing_interval: string = "month",
) {
  return api_client.post<CheckoutSessionResponse>("/billing/checkout-session", {
    plan_code,
    billing_interval,
  });
}

export async function create_portal_session() {
  return api_client.post<PortalSessionResponse>("/billing/portal-session", {});
}

export async function get_billing_history(
  page: number = 1,
  per_page: number = 20,
) {
  return api_client.get<BillingHistoryResponse>(
    `/billing/history?page=${page}&per_page=${per_page}`,
  );
}

export async function cancel_subscription() {
  return api_client.post<CancelSubscriptionResponse>("/billing/cancel", {});
}

export async function reactivate_subscription() {
  return api_client.post<ReactivateResponse>("/billing/reactivate", {});
}

export async function get_stripe_config() {
  return api_client.get<StripeConfigResponse>("/billing/config");
}

export { format_bytes as format_storage };

export function format_price(cents: number, currency: string = "usd"): string {
  const amount = cents / 100;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);
}

export function format_date(date_string: string | null): string {
  if (!date_string) return "-";

  return new Date(date_string).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
