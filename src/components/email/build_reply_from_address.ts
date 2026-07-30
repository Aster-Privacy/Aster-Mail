//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
export interface ReplyFromSource {
  sender_email: string;
  to_emails?: string[];
  cc_emails?: string[];
  received_on_alias?: string;
}

export function build_reply_from_address(
  source: ReplyFromSource,
  is_own_message: boolean,
): string | undefined {
  if (is_own_message) {
    const trimmed = source.sender_email?.trim();

    return trimmed ? trimmed : undefined;
  }

  const alias = source.received_on_alias?.trim();

  return alias ? alias : undefined;
}

export function resolve_received_on_alias(
  routing_token: string | undefined,
  aliases: { alias_address_hash: string; full_address: string }[],
): string | undefined {
  if (!routing_token) return undefined;

  const match = aliases.find((a) => a.alias_address_hash === routing_token);

  return match?.full_address;
}

export function resolve_own_recipient_address(
  recipient_emails: string[] | undefined,
  own_addresses: string[],
): string | undefined {
  if (!recipient_emails) return undefined;
  const own = new Set(
    own_addresses
      .map((a) => (a ? normalize_address_ignoring_dots(a) : a))
      .filter((a): a is string => !!a),
  );

  for (const raw of recipient_emails) {
    const email = raw?.trim();

    if (email && own.has(normalize_address_ignoring_dots(email))) return email;
  }

  return undefined;
}

export function is_reply_from_mismatch(
  received_on_alias: string | undefined,
  selected_sender_email: string | undefined,
): boolean {
  const received = received_on_alias?.trim().toLowerCase();

  if (!received) return false;
  const selected = selected_sender_email?.trim().toLowerCase();

  if (!selected) return false;

  return selected !== received;
}

export function collect_recipient_emails(
  to_emails?: string[],
  cc_emails?: string[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const list of [to_emails, cc_emails]) {
    if (!list) continue;
    for (const raw of list) {
      const email = raw?.trim();

      if (!email) continue;
      const key = email.toLowerCase();

      if (seen.has(key)) continue;
      seen.add(key);
      out.push(email);
    }
  }

  return out;
}

import { normalize_address_ignoring_dots } from "@/utils/address_dots";
