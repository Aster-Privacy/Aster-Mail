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

export type SubscriptionCategory =
  | "newsletter"
  | "marketing"
  | "social"
  | "transactional"
  | "unknown";

export type SubscriptionStatus =
  | "active"
  | "unsubscribed"
  | "pending"
  | "failed";

export type RiskLevel = "safe" | "moderate" | "risky";

export interface Subscription {
  id: string;
  sender_email: string;
  sender_name: string;
  domain: string;
  email_count: number;
  last_received: string;
  unsubscribe_link?: string;
  has_list_unsubscribe: boolean;
  category: SubscriptionCategory;
  risk_level: RiskLevel;
  status: SubscriptionStatus;
}

export interface SubscriptionStats {
  total_subscriptions: number;
  active: number;
  unsubscribed: number;
  newsletters: number;
  marketing: number;
  social: number;
  total_emails_from_subscriptions: number;
}

interface ListSubscriptionsResponse {
  subscriptions: Subscription[];
  total: number;
  has_more: boolean;
}

export interface ListSubscriptionsParams {
  limit?: number;
  offset?: number;
  category?: SubscriptionCategory;
  status?: SubscriptionStatus;
  search?: string;
}

interface UnsubscribeResponse {
  success: boolean;
  subscription_id: string;
  message?: string;
}

interface BulkUnsubscribeResponse {
  success: boolean;
  processed: number;
  succeeded: number;
  failed: number;
  results: Array<{
    subscription_id: string;
    success: boolean;
    error?: string;
  }>;
}

interface ScanResponse {
  success: boolean;
  new_subscriptions: number;
  updated_subscriptions: number;
  message: string;
}

interface TrackSubscriptionParams {
  sender_email: string;
  sender_name?: string;
  unsubscribe_link?: string;
  list_unsubscribe_header?: string;
  category?: SubscriptionCategory;
}

interface TrackSubscriptionResponse {
  success: boolean;
  subscription_id: string;
  is_new: boolean;
}

export async function list_subscriptions(
  params: ListSubscriptionsParams = {},
): Promise<{ data?: ListSubscriptionsResponse; error?: string }> {
  const query_params = new URLSearchParams();

  if (params.limit) query_params.set("limit", params.limit.toString());
  if (params.offset) query_params.set("offset", params.offset.toString());
  if (params.category) query_params.set("category", params.category);
  if (params.status) query_params.set("status", params.status);
  if (params.search) query_params.set("search", params.search);

  const query_string = query_params.toString();
  const endpoint = query_string
    ? `/mail/v1/subscriptions?${query_string}`
    : "/mail/v1/subscriptions";

  return api_client.get<ListSubscriptionsResponse>(endpoint);
}

export async function get_subscription(
  subscription_id: string,
): Promise<{ data?: Subscription; error?: string }> {
  return api_client.get<Subscription>(
    `/mail/v1/subscriptions/${subscription_id}`,
  );
}

export async function get_subscription_stats(): Promise<{
  data?: SubscriptionStats;
  error?: string;
}> {
  return api_client.get<SubscriptionStats>("/mail/v1/subscriptions/stats");
}

export async function unsubscribe(
  subscription_id: string,
  method: "auto" | "list_unsubscribe" | "link" | "manual" = "auto",
): Promise<{ data?: UnsubscribeResponse; error?: string }> {
  return api_client.post<UnsubscribeResponse>(
    "/mail/v1/subscriptions/unsubscribe",
    {
      subscription_id,
      method,
    },
  );
}

export async function bulk_unsubscribe(
  subscription_ids: string[],
): Promise<{ data?: BulkUnsubscribeResponse; error?: string }> {
  return api_client.post<BulkUnsubscribeResponse>(
    "/mail/v1/subscriptions/bulk-unsubscribe",
    { subscription_ids },
  );
}

export async function reactivate_subscription(
  subscription_id: string,
): Promise<{ data?: UnsubscribeResponse; error?: string }> {
  return api_client.post<UnsubscribeResponse>(
    "/mail/v1/subscriptions/reactivate",
    {
      subscription_id,
    },
  );
}

export async function scan_subscriptions(): Promise<{
  data?: ScanResponse;
  error?: string;
}> {
  return api_client.post<ScanResponse>("/mail/v1/subscriptions/scan", {});
}

export async function track_subscription(
  params: TrackSubscriptionParams,
): Promise<{ data?: TrackSubscriptionResponse; error?: string }> {
  return api_client.post<TrackSubscriptionResponse>(
    "/mail/v1/subscriptions/track",
    params,
  );
}

interface ProxyUnsubscribeParams {
  method: "one-click" | "link" | "mailto";
  url?: string;
  mailto_address?: string;
  list_unsubscribe_post?: string;
}

interface ProxyUnsubscribeResponse {
  success: boolean;
  method: string;
  message?: string;
}

export async function proxy_unsubscribe(
  params: ProxyUnsubscribeParams,
): Promise<{ data?: ProxyUnsubscribeResponse; error?: string }> {
  return api_client.post<ProxyUnsubscribeResponse>(
    "/mail/v1/subscriptions/proxy-unsubscribe",
    params,
  );
}

export async function delete_subscription(
  subscription_id: string,
): Promise<{ data?: UnsubscribeResponse; error?: string }> {
  return api_client.delete<UnsubscribeResponse>(
    `/mail/v1/subscriptions/${subscription_id}`,
  );
}
