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
import { useEffect, useSyncExternalStore } from "react";

import { get_recipient_public_key, is_internal_email } from "./api/keys";

export type RecipientClassification = "internal" | "external";

interface ClassificationEntry {
  classification: RecipientClassification;
  session: number;
}

const ADDRESS_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOOKUP_USERNAME_SHAPE = /^[A-Za-z0-9_.-]{1,64}$/;
const MAX_ADDRESS_LENGTH = 254;

const entries = new Map<string, ClassificationEntry>();
const in_flight = new Map<
  string,
  { session: number; promise: Promise<RecipientClassification> }
>();
const listeners = new Set<() => void>();

let current_session = 0;
let version = 0;

function notify(): void {
  version += 1;
  for (const listener of listeners) {
    listener();
  }
}

export function normalize_recipient_address(email: string): string {
  return email.trim().toLowerCase().replace(/\.+$/, "");
}

function lookup_username(address: string): string | null {
  const at = address.lastIndexOf("@");

  if (at <= 0) return null;

  const local = address.slice(0, at).split("+")[0];

  return LOOKUP_USERNAME_SHAPE.test(local) ? local : null;
}

function is_lookup_candidate(address: string): boolean {
  return (
    address.length > 0 &&
    address.length <= MAX_ADDRESS_LENGTH &&
    ADDRESS_SHAPE.test(address) &&
    lookup_username(address) !== null
  );
}

export function is_internal_recipient(email: string): boolean {
  if (is_internal_email(email)) return true;

  const entry = entries.get(normalize_recipient_address(email));

  return entry?.classification === "internal";
}

export function get_cached_recipient_classification(
  email: string,
): RecipientClassification | undefined {
  if (is_internal_email(email)) return "internal";

  return entries.get(normalize_recipient_address(email))?.classification;
}

async function lookup_classification(
  address: string,
): Promise<RecipientClassification | null> {
  const username = lookup_username(address);

  if (!username) return "external";

  try {
    const response = await get_recipient_public_key(username, address);

    if (response.data && !response.error) {
      return response.data.internal === true ? "internal" : "external";
    }

    if (response.code === "NOT_FOUND" || response.status === 404) {
      return "external";
    }

    return null;
  } catch {
    return null;
  }
}

export async function classify_recipient(
  email: string,
): Promise<RecipientClassification> {
  if (is_internal_email(email)) return "internal";

  const address = normalize_recipient_address(email);

  if (!is_lookup_candidate(address)) return "external";

  const cached = entries.get(address);

  if (cached && cached.session === current_session) {
    return cached.classification;
  }

  const pending = in_flight.get(address);

  if (pending && pending.session === current_session) {
    return pending.promise;
  }

  const session = current_session;
  const promise = lookup_classification(address).then((result) => {
    if (in_flight.get(address)?.session === session) {
      in_flight.delete(address);
    }

    const classification: RecipientClassification = result ?? "external";

    if (session !== current_session) return classification;

    const previous = entries.get(address)?.classification;

    if (result === null) {
      entries.delete(address);
    } else {
      entries.set(address, { classification: result, session });
    }

    if (previous !== (result ?? undefined)) {
      notify();
    }

    return classification;
  });

  in_flight.set(address, { session, promise });

  return promise;
}

export async function classify_recipients(
  emails: readonly string[],
): Promise<Map<string, RecipientClassification>> {
  const unique = [
    ...new Set(
      emails
        .map((email) => normalize_recipient_address(email))
        .filter((email) => email.length > 0),
    ),
  ];
  const results = await Promise.all(
    unique.map(
      async (email) => [email, await classify_recipient(email)] as const,
    ),
  );

  return new Map(results);
}

export function begin_recipient_classification_session(): void {
  current_session += 1;
}

export function clear_recipient_classification_cache(): void {
  current_session += 1;
  in_flight.clear();
  if (entries.size === 0) return;
  entries.clear();
  notify();
}

export function subscribe_recipient_classification(
  listener: () => void,
): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function get_recipient_classification_version(): number {
  return version;
}

export function use_recipient_classification(
  recipients: readonly string[],
): number {
  const current_version = useSyncExternalStore(
    subscribe_recipient_classification,
    get_recipient_classification_version,
    get_recipient_classification_version,
  );
  const recipients_key = recipients
    .map((email) => normalize_recipient_address(email))
    .filter((email) => email.length > 0 && !is_internal_email(email))
    .sort()
    .join(",");

  useEffect(() => {
    if (!recipients_key) return;

    classify_recipients(recipients_key.split(",")).catch(() => undefined);
  }, [recipients_key]);

  return current_version;
}
