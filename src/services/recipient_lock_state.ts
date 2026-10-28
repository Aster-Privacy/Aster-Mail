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
export type RecipientLockStatus =
  | "encrypted"
  | "available"
  | "transit"
  | "checking"
  | "key_invalid"
  | "unknown";

const displayed_statuses = new Map<string, RecipientLockStatus>();

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

export function record_recipient_lock_status(
  email: string,
  status: RecipientLockStatus,
): void {
  displayed_statuses.set(normalize(email), status);
}

export function forget_recipient_lock_statuses(): void {
  displayed_statuses.clear();
}

export function shows_encrypted_lock(
  status: RecipientLockStatus | undefined,
  pgp_override: boolean | null,
): boolean {
  if (pgp_override === false) return false;
  if (status === "encrypted") return true;

  return status === "available" && pgp_override === true;
}

export function collect_pgp_recipients(
  outside_recipients: string[],
  pgp_override: boolean | null,
): string[] {
  const listed = new Set<string>();

  for (const recipient of outside_recipients) {
    const key = normalize(recipient);

    if (key.length === 0) continue;
    if (shows_encrypted_lock(displayed_statuses.get(key), pgp_override)) {
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
