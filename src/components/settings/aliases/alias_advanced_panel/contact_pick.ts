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
import type { DecryptedContact, EmailEntryType } from "@/types/contacts";

import {
  collect_contact_emails,
  normalize_contact_email,
} from "@/services/contact_email_index";
import { is_contact_trashed } from "@/lib/contact_trash";

export const MAX_CONTACT_PICK = 200;
export const CONTACT_PICK_CONCURRENCY = 4;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type PickEmailStatus = "available" | "added" | "blocked";

export interface PickEmail {
  address: string;
  type?: EmailEntryType;
  label?: string;
  status: PickEmailStatus;
}

export interface PickCandidate {
  contact_id: string;
  name: string;
  avatar_url?: string;
  profile_color?: string;
  is_favorite: boolean;
  emails: PickEmail[];
}

export type PickContact = Pick<
  DecryptedContact,
  | "id"
  | "first_name"
  | "last_name"
  | "emails"
  | "email_entries"
  | "avatar_url"
  | "profile_color"
  | "is_favorite"
  | "deleted_at"
>;

export interface ExistingPin {
  sender: string;
  sender_hash?: string;
  is_blocked: boolean;
}

export type PinHasher = (address: string) => Promise<string>;

export function is_pickable_address(address: string): boolean {
  return EMAIL_PATTERN.test(address);
}

export function contact_display_name(
  contact: Pick<PickContact, "first_name" | "last_name">,
): string {
  return [contact.first_name, contact.last_name]
    .filter((part): part is string => typeof part === "string")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

function merge_status(
  map: Map<string, PickEmailStatus>,
  key: string,
  status: PickEmailStatus,
): void {
  if (map.get(key) === "blocked") return;
  map.set(key, status);
}

export async function resolve_existing_statuses(
  addresses: string[],
  pins: ExistingPin[],
  hasher: PinHasher,
): Promise<Map<string, PickEmailStatus>> {
  const statuses = new Map<string, PickEmailStatus>();
  const by_hash = new Map<string, PickEmailStatus>();

  for (const pin of pins) {
    const status: PickEmailStatus = pin.is_blocked ? "blocked" : "added";

    if (pin.sender_hash) merge_status(by_hash, pin.sender_hash, status);
    const sender = normalize_contact_email(pin.sender ?? "");

    if (sender.includes("@")) merge_status(statuses, sender, status);
  }

  if (by_hash.size === 0) return statuses;

  const unique = [...new Set(addresses.map(normalize_contact_email))];
  const hashes = await Promise.all(unique.map((address) => hasher(address)));

  unique.forEach((address, index) => {
    const status = by_hash.get(hashes[index]);

    if (status) merge_status(statuses, address, status);
  });

  return statuses;
}

export function collect_pick_addresses(contacts: PickContact[]): string[] {
  const result = new Set<string>();

  for (const contact of contacts) {
    if (is_contact_trashed(contact)) continue;
    for (const address of collect_contact_emails(contact)) {
      if (is_pickable_address(address)) result.add(address);
    }
  }

  return [...result];
}

export function has_available_email(candidate: PickCandidate): boolean {
  return candidate.emails.some((email) => email.status === "available");
}

function sort_key(candidate: PickCandidate): string {
  return (candidate.name || candidate.emails[0].address).toLocaleLowerCase();
}

function compare_candidates(a: PickCandidate, b: PickCandidate): number {
  const a_rank = has_available_email(a) ? 0 : 1;
  const b_rank = has_available_email(b) ? 0 : 1;

  if (a_rank !== b_rank) return a_rank - b_rank;

  return sort_key(a).localeCompare(sort_key(b));
}

export function build_pick_candidates(
  contacts: PickContact[],
  statuses: Map<string, PickEmailStatus>,
): PickCandidate[] {
  const candidates: PickCandidate[] = [];

  for (const contact of contacts) {
    if (is_contact_trashed(contact)) continue;
    const entry_meta = new Map<
      string,
      { type?: EmailEntryType; label?: string }
    >();

    for (const entry of contact.email_entries ?? []) {
      if (typeof entry?.value !== "string") continue;
      const key = normalize_contact_email(entry.value);

      if (!entry_meta.has(key)) {
        entry_meta.set(key, { type: entry.type, label: entry.label });
      }
    }

    const emails: PickEmail[] = collect_contact_emails(contact)
      .filter(is_pickable_address)
      .map((address) => ({
        address,
        ...entry_meta.get(address),
        status: statuses.get(address) ?? "available",
      }));

    if (emails.length === 0) continue;

    candidates.push({
      contact_id: contact.id,
      name: contact_display_name(contact),
      avatar_url: contact.avatar_url,
      profile_color: contact.profile_color,
      is_favorite: contact.is_favorite === true,
      emails,
    });
  }

  return candidates.sort(compare_candidates);
}

export function filter_pick_candidates(
  candidates: PickCandidate[],
  query: string,
): PickCandidate[] {
  const needle = query.trim().toLocaleLowerCase();

  if (!needle) return candidates;

  return candidates.filter(
    (candidate) =>
      candidate.name.toLocaleLowerCase().includes(needle) ||
      candidate.emails.some((email) => email.address.includes(needle)),
  );
}

export function toggle_pick(
  selected: ReadonlySet<string>,
  address: string,
  checked: boolean,
  limit: number = MAX_CONTACT_PICK,
): Set<string> {
  const next = new Set(selected);
  const key = normalize_contact_email(address);

  if (!checked) {
    next.delete(key);
  } else if (next.size < limit) {
    next.add(key);
  }

  return next;
}

export function select_all_visible(
  selected: ReadonlySet<string>,
  visible: PickCandidate[],
  limit: number = MAX_CONTACT_PICK,
): Set<string> {
  const next = new Set(selected);

  for (const candidate of visible) {
    if (next.size >= limit) break;
    if (candidate.emails.some((email) => next.has(email.address))) continue;
    const first = candidate.emails.find(
      (email) => email.status === "available",
    );

    if (first) next.add(first.address);
  }

  return next;
}

export function clear_visible(
  selected: ReadonlySet<string>,
  visible: PickCandidate[],
): Set<string> {
  const next = new Set(selected);

  for (const candidate of visible) {
    for (const email of candidate.emails) next.delete(email.address);
  }

  return next;
}

export function select_all_saturated(
  selected: ReadonlySet<string>,
  visible: PickCandidate[],
  limit: number = MAX_CONTACT_PICK,
): boolean {
  const touches_visible = visible.some((candidate) =>
    candidate.emails.some((email) => selected.has(email.address)),
  );

  return (
    touches_visible &&
    select_all_visible(selected, visible, limit).size === selected.size
  );
}

export function finalize_picks(
  selected: ReadonlySet<string>,
  statuses: Map<string, PickEmailStatus>,
  limit: number = MAX_CONTACT_PICK,
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const raw of selected) {
    const address = normalize_contact_email(raw);

    if (!is_pickable_address(address)) continue;
    if (statuses.has(address) || seen.has(address)) continue;
    seen.add(address);
    result.push(address);
    if (result.length >= limit) break;
  }

  return result;
}

export interface BulkAddResult {
  added: string[];
  failed: string[];
}

export async function add_senders_in_batches(
  addresses: string[],
  add: (address: string) => Promise<{ error?: unknown }>,
  concurrency: number = CONTACT_PICK_CONCURRENCY,
): Promise<BulkAddResult> {
  const outcomes = new Map<string, boolean>();
  let cursor = 0;

  const worker = async () => {
    while (cursor < addresses.length) {
      const address = addresses[cursor];

      cursor += 1;
      try {
        const response = await add(address);

        outcomes.set(address, !response?.error);
      } catch {
        outcomes.set(address, false);
      }
    }
  };

  const worker_count = Math.max(1, Math.min(concurrency, addresses.length));

  await Promise.all(Array.from({ length: worker_count }, () => worker()));

  return {
    added: addresses.filter((address) => outcomes.get(address) === true),
    failed: addresses.filter((address) => outcomes.get(address) === false),
  };
}
