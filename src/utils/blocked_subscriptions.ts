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
export interface BlockedSenderEntry {
  email: string;
  is_domain: boolean;
}

export interface BlockedSenderIndex {
  addresses: Set<string>;
  domains: Set<string>;
}

export const EMPTY_BLOCKED_SENDER_INDEX: BlockedSenderIndex = {
  addresses: new Set(),
  domains: new Set(),
};

function normalize_blocked_value(value: string): string {
  return value.toLowerCase().trim();
}

function address_domain(address: string): string {
  const at_index = address.lastIndexOf("@");

  return at_index === -1 ? "" : address.slice(at_index + 1);
}

export function build_blocked_sender_index(
  blocked: BlockedSenderEntry[],
): BlockedSenderIndex {
  const addresses = new Set<string>();
  const domains = new Set<string>();

  for (const entry of blocked) {
    const value = normalize_blocked_value(entry.email || "");

    if (!value) continue;

    if (entry.is_domain || !value.includes("@") || value.startsWith("@")) {
      domains.add(value.replace(/^@/, ""));
    } else {
      addresses.add(value);
    }
  }

  return { addresses, domains };
}

export function is_sender_in_blocked_index(
  sender_email: string,
  index: BlockedSenderIndex,
): boolean {
  const address = normalize_blocked_value(sender_email || "");

  if (!address) return false;
  if (index.addresses.has(address)) return true;

  const domain = address_domain(address);

  return domain !== "" && index.domains.has(domain);
}

export function without_blocked_senders<T extends { sender_email: string }>(
  subscriptions: T[],
  index: BlockedSenderIndex,
): T[] {
  if (index.addresses.size === 0 && index.domains.size === 0) {
    return subscriptions;
  }

  return subscriptions.filter(
    (subscription) =>
      !is_sender_in_blocked_index(subscription.sender_email, index),
  );
}
