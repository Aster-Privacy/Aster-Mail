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
  evaluate_sender_trust,
  type SenderTrustContact,
} from "@/lib/sender_trust";

export interface SenderTrustContext {
  own_addresses: string[];
  contacts: SenderTrustContact[];
}

const MAX_OWN_ADDRESSES = 2000;
const MAX_CONTACTS = 10000;

let primary_address = "";
let extra_addresses: string[] = [];
let snapshot: SenderTrustContext = { own_addresses: [], contacts: [] };

const listeners = new Set<() => void>();

function normalize(values: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();

  for (const value of values) {
    if (typeof value !== "string") continue;
    const address = value.trim().toLowerCase();

    if (!address || !address.includes("@")) continue;
    seen.add(address);
    if (seen.size >= MAX_OWN_ADDRESSES) break;
  }

  return [...seen].sort();
}

function same_list(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;

  return left.every((value, position) => value === right[position]);
}

function same_emails(left: unknown, right: unknown): boolean {
  if (!Array.isArray(left) || !Array.isArray(right)) return left === right;

  return same_list(left, right);
}

function same_contacts(
  left: SenderTrustContact[],
  right: SenderTrustContact[],
): boolean {
  if (left.length !== right.length) return false;

  return left.every((contact, position) => {
    const other = right[position];

    if (contact === other) return true;
    if (!contact || !other) return false;

    return (
      contact.name === other.name && same_emails(contact.emails, other.emails)
    );
  });
}

function publish(next: SenderTrustContext): void {
  snapshot = next;
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      return;
    }
  });
}

function publish_own_addresses(): void {
  const next = normalize([primary_address, ...extra_addresses]);

  if (same_list(next, snapshot.own_addresses)) return;
  publish({ own_addresses: next, contacts: snapshot.contacts });
}

export function set_trust_primary_address(
  address: string | null | undefined,
): void {
  primary_address = typeof address === "string" ? address : "";
  publish_own_addresses();
}

export function set_trust_own_addresses(
  addresses: (string | null | undefined)[],
): void {
  extra_addresses = normalize(addresses);
  publish_own_addresses();
}

export function set_trust_contacts(contacts: SenderTrustContact[]): void {
  const next = contacts.slice(0, MAX_CONTACTS);

  if (same_contacts(next, snapshot.contacts)) return;
  publish({
    own_addresses: snapshot.own_addresses,
    contacts: next,
  });
}

export function clear_sender_trust_context(): void {
  extra_addresses = [];
  const own_addresses = normalize([primary_address]);

  if (
    same_list(own_addresses, snapshot.own_addresses) &&
    snapshot.contacts.length === 0
  ) {
    return;
  }
  publish({ own_addresses, contacts: [] });
}

export function get_sender_trust_context(): SenderTrustContext {
  return snapshot;
}

export function safe_sender_name(
  name: string | null | undefined,
  email: string | null | undefined,
): string {
  if (typeof name !== "string" || !name) return "";

  const trust = evaluate_sender_trust({
    name,
    email,
    own_addresses: snapshot.own_addresses,
    contacts: snapshot.contacts,
  });

  return trust.name;
}

export function subscribe_sender_trust_context(
  listener: () => void,
): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
