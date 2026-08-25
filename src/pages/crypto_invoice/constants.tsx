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

export type LoadState = "loading" | "ready" | "not_found" | "unavailable";

export const POLL_INTERVAL_MS = 6_000;
export const MAX_POLL_INTERVAL_MS = 60_000;
export const MAX_CONSECUTIVE_FAILURES = 5;
export const TERMINAL_STATUSES = new Set([
  "paid",
  "expired",
  "cancelled",
  "manual_review",
]);
export const DEFINITIVE_ERROR_CODES = new Set(["NOT_FOUND", "FORBIDDEN"]);
export const KNOWN_STATUSES = new Set([
  "pending",
  "detected",
  "confirming",
  "underpaid",
  "paid",
  "expired",
  "cancelled",
  "manual_review",
]);
export const WALLET_SCHEME_BY_CHAIN: Record<string, string> = {
  bitcoin: "bitcoin:",
  litecoin: "litecoin:",
  dogecoin: "dogecoin:",
  bitcoincash: "bitcoincash:",
  monero: "monero:",
  solana: "solana:",
  ethereum: "ethereum:",
  base: "ethereum:",
  polygon: "ethereum:",
  arbitrum: "ethereum:",
  optimism: "ethereum:",
};
export const UNSAFE_WALLET_SCHEMES = new Set([
  "javascript:",
  "data:",
  "vbscript:",
  "file:",
  "blob:",
  "intent:",
  "android-app:",
  "http:",
  "https:",
  "about:",
  "chrome:",
  "ws:",
  "wss:",
]);
export const WALLET_SCHEME_SHAPE = /^[a-z][a-z0-9+.-]{1,20}:$/;
export const CANCEL_HAS_PAYMENT_MARKER = "payment has already been received";
export const BILLING_ROUTE = "/settings/billing";
export const WARNING_BG = "var(--color-warning)";
export const WARNING_FG = "#1c1400";
export const WARNING_TEXT = "var(--color-warning)";
export const EXPIRING_SOON_MS = 5 * 60 * 1000;
