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
import { verify_app_store_transaction } from "@/services/api/billing";

export const APP_STORE_PLAN_CODES = ["star", "nova", "supernova"] as const;

export type AppStorePlanCode = (typeof APP_STORE_PLAN_CODES)[number];

export type AppStoreInterval = "monthly" | "yearly";

const PRODUCT_PREFIX = "org.astermail.ios.";

const TRANSACTION_EVENT = "aster://storekit-transaction";

export interface AppStoreProduct {
  id: string;
  display_name: string;
  description: string;
  display_price: string;
  price: string;
  currency_code: string;
  period_value?: number;
  period_unit?: string;
}

export interface AppStoreTransaction {
  transaction_id: string;
  original_transaction_id: string;
  product_id: string;
  signed_transaction: string;
  revoked: boolean;
  expires_at?: string;
}

export type AppStorePurchaseOutcome =
  | { status: "success"; transaction: AppStoreTransaction }
  | { status: "pending" }
  | { status: "cancelled" };

export type AppStoreRedeemResult = "redeemed" | "conflict" | "failed";

export interface AppStoreRestoreResult {
  redeemed: number;
  conflict: boolean;
  failed: boolean;
}

export function app_store_product_id(
  plan_code: AppStorePlanCode,
  interval: AppStoreInterval,
): string {
  return `${PRODUCT_PREFIX}${plan_code}.${interval}`;
}

export function plan_code_for_product(
  product_id: string,
): AppStorePlanCode | null {
  if (!product_id.startsWith(PRODUCT_PREFIX)) return null;
  const code = product_id.slice(PRODUCT_PREFIX.length).split(".")[0];

  return (APP_STORE_PLAN_CODES as readonly string[]).includes(code)
    ? (code as AppStorePlanCode)
    : null;
}

export const APP_STORE_PRODUCT_IDS: string[] = APP_STORE_PLAN_CODES.flatMap(
  (code) => [
    app_store_product_id(code, "monthly"),
    app_store_product_id(code, "yearly"),
  ],
);

async function call<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");

  return invoke<T>(command, args);
}

export function load_app_store_products(): Promise<AppStoreProduct[]> {
  return call<AppStoreProduct[]>("storekit_products", {
    productIds: APP_STORE_PRODUCT_IDS,
  });
}

export function purchase_app_store_product(
  product_id: string,
): Promise<AppStorePurchaseOutcome> {
  return call<AppStorePurchaseOutcome>("storekit_purchase", {
    productId: product_id,
  });
}

async function finish_transaction(transaction_id: string): Promise<void> {
  try {
    await call<boolean>("storekit_finish", { transactionId: transaction_id });
  } catch {
    return;
  }
}

export async function redeem_app_store_transaction(
  transaction: AppStoreTransaction,
): Promise<AppStoreRedeemResult> {
  if (plan_code_for_product(transaction.product_id) === null) return "failed";

  if (transaction.revoked) {
    await finish_transaction(transaction.transaction_id);

    return "failed";
  }

  const response = await verify_app_store_transaction(
    transaction.signed_transaction,
  );

  if (response.data) {
    await finish_transaction(transaction.transaction_id);

    return "redeemed";
  }

  if (response.code === "CONFLICT") return "conflict";

  return "failed";
}

async function redeem_all(
  transactions: AppStoreTransaction[],
): Promise<AppStoreRestoreResult> {
  const result: AppStoreRestoreResult = {
    redeemed: 0,
    conflict: false,
    failed: false,
  };

  for (const transaction of transactions) {
    const outcome = await redeem_app_store_transaction(transaction);

    if (outcome === "redeemed") result.redeemed += 1;
    if (outcome === "conflict") result.conflict = true;
    if (outcome === "failed") result.failed = true;
  }

  return result;
}

export async function restore_app_store_purchases(): Promise<AppStoreRestoreResult> {
  const reply = await call<{ transactions: AppStoreTransaction[] }>(
    "storekit_restore",
  );

  return redeem_all(reply.transactions);
}

export async function sync_current_app_store_entitlements(): Promise<AppStoreRestoreResult> {
  const reply = await call<{ transactions: AppStoreTransaction[] }>(
    "storekit_current_entitlements",
  );

  return redeem_all(reply.transactions);
}

export async function sync_pending_app_store_transactions(): Promise<AppStoreRestoreResult> {
  const pending = await call<AppStoreTransaction[]>("storekit_take_pending");

  return redeem_all(pending);
}

export function open_app_store_subscriptions(): Promise<void> {
  return call<void>("storekit_manage_subscriptions");
}

export async function listen_for_app_store_transactions(
  handler: () => void,
): Promise<() => void> {
  const { listen } = await import("@tauri-apps/api/event");

  return listen(TRANSACTION_EVENT, handler);
}
