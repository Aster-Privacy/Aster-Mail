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
import { useEffect, useState, useSyncExternalStore } from "react";

export type RecipientLockStatus =
  | "encrypted"
  | "available"
  | "transit"
  | "checking"
  | "key_invalid"
  | "unknown";

export interface RecipientLockEntry {
  status: RecipientLockStatus;
  internal: boolean;
}

export interface RecipientLockScope {
  readonly fields: Map<string, Map<string, RecipientLockEntry>>;
}

const live_scopes = new Set<RecipientLockScope>();
const epoch_listeners = new Set<() => void>();
let lock_epoch = 0;

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

export function create_recipient_lock_scope(): RecipientLockScope {
  return { fields: new Map() };
}

export function release_recipient_lock_scope(scope: RecipientLockScope): void {
  scope.fields.clear();
  live_scopes.delete(scope);
}

export function record_field_lock_statuses(
  scope: RecipientLockScope,
  field_id: string,
  statuses: Iterable<readonly [string, RecipientLockEntry]>,
): void {
  const next = new Map<string, RecipientLockEntry>();

  for (const [email, entry] of statuses) {
    const key = normalize(email);

    if (key.length === 0) continue;
    next.set(key, entry);
  }

  live_scopes.add(scope);

  if (next.size === 0) {
    scope.fields.delete(field_id);
  } else {
    scope.fields.set(field_id, next);
  }
}

export function forget_field_lock_statuses(
  scope: RecipientLockScope,
  field_id: string,
): void {
  scope.fields.delete(field_id);
}

export function forget_recipient_lock_statuses(): void {
  for (const scope of live_scopes) {
    scope.fields.clear();
  }
  live_scopes.clear();
  lock_epoch += 1;
  for (const listener of epoch_listeners) {
    listener();
  }
}

function subscribe_lock_epoch(listener: () => void): () => void {
  epoch_listeners.add(listener);

  return () => {
    epoch_listeners.delete(listener);
  };
}

function get_lock_epoch(): number {
  return lock_epoch;
}

export function use_recipient_lock_epoch(): number {
  return useSyncExternalStore(
    subscribe_lock_epoch,
    get_lock_epoch,
    get_lock_epoch,
  );
}

export function use_recipient_lock_scope(): RecipientLockScope {
  const [scope] = useState(create_recipient_lock_scope);

  useEffect(() => () => release_recipient_lock_scope(scope), [scope]);

  return scope;
}

export function shows_encrypted_lock(
  status: RecipientLockStatus | undefined,
  pgp_override: boolean | null,
): boolean {
  if (pgp_override === false) return false;
  if (status === "encrypted") return true;

  return status === "available" && pgp_override === true;
}

function scope_shows_lock(
  scope: RecipientLockScope,
  key: string,
  pgp_override: boolean | null,
): boolean {
  let locked = false;

  for (const field of scope.fields.values()) {
    const entry = field.get(key);

    if (!entry) continue;
    if (entry.internal) return false;
    if (shows_encrypted_lock(entry.status, pgp_override)) locked = true;
  }

  return locked;
}

export function collect_pgp_recipients(
  scope: RecipientLockScope | null | undefined,
  outside_recipients: string[],
  pgp_override: boolean | null,
): string[] {
  if (!scope) return [];

  const listed = new Set<string>();

  for (const recipient of outside_recipients) {
    const key = normalize(recipient);

    if (key.length === 0) continue;
    if (scope_shows_lock(scope, key, pgp_override)) {
      listed.add(key);
    }
  }

  return [...listed];
}

export function is_listed_pgp_recipient(
  pgp_recipients: string[] | undefined,
  recipient: string,
): boolean {
  if (!pgp_recipients || pgp_recipients.length === 0) return false;
  const key = normalize(recipient);

  return pgp_recipients.some((listed) => normalize(listed) === key);
}
