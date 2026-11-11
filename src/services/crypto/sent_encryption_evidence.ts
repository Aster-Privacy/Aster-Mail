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

export const SENT_ENCRYPTION_FIELD = "sent_encryption";

const MAX_RECIPIENT_COUNT = 100_000;

export type SentEncryptionScope = "internal" | "outside";

export interface SentEncryptionEvidence {
  outside: number;
  outside_pgp: number;
  internal_readable: number;
}

function normalize_address(value: string): string {
  const trimmed = value.trim();
  const open = trimmed.lastIndexOf("<");
  const close = trimmed.lastIndexOf(">");
  const address =
    open !== -1 && close > open ? trimmed.slice(open + 1, close) : trimmed;

  return address.trim().toLowerCase();
}

function unique_addresses(values: string[]): string[] {
  const seen = new Set<string>();

  for (const value of values) {
    const address = normalize_address(value);

    if (address.length > 0) seen.add(address);
  }

  return Array.from(seen);
}

export function build_sent_encryption_evidence(params: {
  all_recipients: string[];
  outside_recipients: string[];
  client_copies?: Record<string, string>;
  internal_copy_is_encrypted: boolean;
}): SentEncryptionEvidence {
  const all = unique_addresses(params.all_recipients);
  const outside = unique_addresses(params.outside_recipients);
  const outside_set = new Set(outside);
  const copied = new Set(
    Object.entries(params.client_copies ?? {})
      .filter(([, armored]) => typeof armored === "string" && armored.length > 0)
      .map(([recipient]) => normalize_address(recipient)),
  );
  const internal_count = all.filter((address) => !outside_set.has(address))
    .length;

  return {
    outside: outside.length,
    outside_pgp: outside.filter((address) => copied.has(address)).length,
    internal_readable: params.internal_copy_is_encrypted ? 0 : internal_count,
  };
}

function is_count(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_RECIPIENT_COUNT
  );
}

export function read_sent_encryption_evidence(
  envelope: unknown,
): SentEncryptionEvidence | null {
  if (!envelope || typeof envelope !== "object") return null;

  const raw = (envelope as Record<string, unknown>)[SENT_ENCRYPTION_FIELD];

  if (!raw || typeof raw !== "object") return null;

  const record = raw as Record<string, unknown>;

  if (
    !is_count(record.outside) ||
    !is_count(record.outside_pgp) ||
    !is_count(record.internal_readable) ||
    record.outside_pgp > record.outside
  ) {
    return null;
  }

  return {
    outside: record.outside,
    outside_pgp: record.outside_pgp,
    internal_readable: record.internal_readable,
  };
}

export function has_sent_encryption_evidence(envelope: unknown): boolean {
  return (
    !!envelope &&
    typeof envelope === "object" &&
    SENT_ENCRYPTION_FIELD in (envelope as Record<string, unknown>)
  );
}

export function drop_sent_encryption_evidence<T>(envelope: T): T {
  if (envelope && typeof envelope === "object") {
    delete (envelope as Record<string, unknown>)[SENT_ENCRYPTION_FIELD];
  }

  return envelope;
}

export function sent_copy_encryption_scope(
  envelope: unknown,
): SentEncryptionScope | undefined {
  const evidence = read_sent_encryption_evidence(envelope);

  if (
    !evidence ||
    evidence.outside_pgp !== evidence.outside ||
    evidence.internal_readable !== 0
  ) {
    return undefined;
  }

  return evidence.outside > 0 ? "outside" : "internal";
}

export function sent_copy_pgp_verified(envelope: unknown): boolean {
  return sent_copy_encryption_scope(envelope) !== undefined;
}

export function as_sent_encryption_scope(
  value: unknown,
): SentEncryptionScope | undefined {
  return value === "internal" || value === "outside" ? value : undefined;
}

export interface EncryptionDisplayFlags {
  is_external?: boolean;
  has_recipient_key?: boolean;
  e2e_verified?: boolean;
  sent_encryption_scope?: SentEncryptionScope;
}

export function shows_end_to_end(flags: EncryptionDisplayFlags): boolean {
  if (as_sent_encryption_scope(flags.sent_encryption_scope)) return true;

  return (
    (!flags.is_external || !!flags.has_recipient_key) && !!flags.e2e_verified
  );
}

export function reaches_outside_recipients(
  flags: EncryptionDisplayFlags,
): boolean {
  const scope = as_sent_encryption_scope(flags.sent_encryption_scope);

  return scope ? scope === "outside" : !!flags.is_external;
}

export interface SenderBindingFlags {
  sent_encryption_scope?: SentEncryptionScope;
  e2e_sender_bound?: boolean;
  sender_verification?: string;
}

export function names_sender_as_reader(flags: SenderBindingFlags): boolean {
  if (as_sent_encryption_scope(flags.sent_encryption_scope)) return true;

  return (
    flags.e2e_sender_bound === true || flags.sender_verification === "verified"
  );
}
