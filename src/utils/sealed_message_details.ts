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
export interface SealedAddress {
  name: string;
  email: string;
}

export interface SealedMessageDetails {
  from_name: string;
  to: SealedAddress[];
  cc: SealedAddress[];
  sent_at: string;
}

export interface SealedDetailsSource {
  from_name?: string | null;
  to?: readonly string[];
  cc?: readonly string[];
  sent_at?: string | Date;
}

export const SEALED_DETAILS_VERSION = 1;

const MAX_SEALED_NAME_LENGTH = 256;
const MAX_SEALED_EMAIL_LENGTH = 320;
const MAX_SEALED_ADDRESSES = 1000;
const ANGLE_ADDRESS_PATTERN = /^\s*(.*?)\s*<([^<>]+)>\s*$/;

function clean_name(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .replace(/^"(.*)"$/, "$1")
    .trim()
    .slice(0, MAX_SEALED_NAME_LENGTH);
}

function to_sealed_address(entry: string): SealedAddress | null {
  const angled = ANGLE_ADDRESS_PATTERN.exec(entry);
  const email = (angled ? angled[2] : entry).trim();

  if (!email || email.length > MAX_SEALED_EMAIL_LENGTH) return null;

  return { name: angled ? clean_name(angled[1]) : "", email };
}

function to_sealed_addresses(
  entries: readonly string[] | undefined,
): SealedAddress[] {
  const addresses: SealedAddress[] = [];

  for (const entry of entries ?? []) {
    if (typeof entry !== "string") continue;
    const address = to_sealed_address(entry);

    if (address) addresses.push(address);
  }

  return addresses.slice(0, MAX_SEALED_ADDRESSES);
}

function to_iso_instant(value: string | Date | undefined): string {
  const instant = value === undefined ? new Date() : new Date(value);

  return Number.isNaN(instant.getTime())
    ? new Date().toISOString()
    : instant.toISOString();
}

export function sealed_sender_name(
  chosen_name: string | null | undefined,
  sender_alias_hash: string | null | undefined,
  account_name: string | null | undefined,
): string {
  if (chosen_name) return chosen_name;

  return sender_alias_hash ? "" : account_name || "";
}

export function build_sealed_details(
  source: SealedDetailsSource,
): SealedMessageDetails {
  return {
    from_name: clean_name(source.from_name || ""),
    to: to_sealed_addresses(source.to),
    cc: to_sealed_addresses(source.cc),
    sent_at: to_iso_instant(source.sent_at),
  };
}

export function serialize_sealed_details(
  details: SealedMessageDetails,
): Record<string, unknown> {
  return {
    v: SEALED_DETAILS_VERSION,
    from_name: details.from_name,
    to: details.to.map(({ name, email }) => ({ name, email })),
    cc: details.cc.map(({ name, email }) => ({ name, email })),
    sent_at: details.sent_at,
  };
}

function parse_sealed_addresses(value: unknown): SealedAddress[] | null {
  if (!Array.isArray(value) || value.length > MAX_SEALED_ADDRESSES) {
    return null;
  }

  const addresses: SealedAddress[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object") return null;
    const { name, email } = entry as Record<string, unknown>;

    if (typeof email !== "string" || !email.trim()) return null;
    if (email.length > MAX_SEALED_EMAIL_LENGTH) return null;
    if (name !== undefined && typeof name !== "string") return null;

    addresses.push({ name: clean_name(name ?? ""), email: email.trim() });
  }

  return addresses;
}

export function parse_sealed_details(
  value: unknown,
): SealedMessageDetails | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;

  if (record.v !== SEALED_DETAILS_VERSION) return undefined;
  if (typeof record.from_name !== "string") return undefined;
  if (typeof record.sent_at !== "string") return undefined;

  const instant = new Date(record.sent_at);

  if (Number.isNaN(instant.getTime())) return undefined;

  const to = parse_sealed_addresses(record.to);
  const cc = parse_sealed_addresses(record.cc);

  if (!to || !cc) return undefined;

  return {
    from_name: clean_name(record.from_name),
    to,
    cc,
    sent_at: instant.toISOString(),
  };
}
