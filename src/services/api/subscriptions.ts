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
import { api_client, type ApiResponse } from "./client";

export type SubscriptionCategory =
  "newsletter" | "marketing" | "social" | "transactional" | "unknown";

export type SubscriptionStatus =
  "active" | "unsubscribed" | "pending" | "failed";

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

export interface ProxyUnsubscribeParams {
  method: "one-click" | "link" | "mailto";
  url?: string;
  mailto_address?: string;
  list_unsubscribe_post?: string;
  from_address?: string;
  from_address_hash?: string;
}

interface ProxyUnsubscribeResponse {
  success: boolean;
  method: string;
  message?: string;
  code?: string;
}

export async function proxy_unsubscribe(
  params: ProxyUnsubscribeParams,
): Promise<ApiResponse<ProxyUnsubscribeResponse>> {
  return api_client.post<ProxyUnsubscribeResponse>(
    "/mail/v1/subscriptions/proxy-unsubscribe",
    params,
  );
}

export async function delete_subscription(
  subscription_id: string,
): Promise<ApiResponse<UnsubscribeResponse>> {
  return api_client.delete<UnsubscribeResponse>(
    `/mail/v1/subscriptions/${subscription_id}`,
  );
}

export interface DeleteSubscriptionsResponse {
  success: boolean;
  deleted: number;
}

export async function delete_subscriptions_by_sender(
  sender_emails: string[],
): Promise<{ data?: DeleteSubscriptionsResponse; error?: string }> {
  return api_client.post<DeleteSubscriptionsResponse>(
    "/mail/v1/subscriptions/delete",
    { sender_emails },
  );
}
