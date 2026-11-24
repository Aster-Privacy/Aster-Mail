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
import type {
  EncryptedVault,
  MailLegacyRetiredMarker,
} from "./key_manager_core";

export const MAIL_LEGACY_RETIREMENT_VERSION = 1;

const PIN_PREFIX = "astermail_mail_legacy_retired_";

type PinStore = Pick<Storage, "getItem" | "setItem">;

let retired = false;

function default_store(): PinStore | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function pin_key(owner_id: string): string {
  return `${PIN_PREFIX}${owner_id}`;
}

export function is_valid_retired_marker(
  marker: unknown,
): marker is MailLegacyRetiredMarker {
  if (!marker || typeof marker !== "object") return false;

  const record = marker as Record<string, unknown>;

  return (
    typeof record.v === "number" &&
    Number.isInteger(record.v) &&
    record.v >= MAIL_LEGACY_RETIREMENT_VERSION &&
    typeof record.at === "string"
  );
}

export function vault_marks_mail_legacy_retired(
  vault: Pick<EncryptedVault, "mail_legacy_retired"> | null | undefined,
): boolean {
  return is_valid_retired_marker(vault?.mail_legacy_retired);
}

export function read_mail_legacy_retired_pin(
  owner_id: string | null | undefined,
  store: PinStore | null = default_store(),
): boolean {
  if (!owner_id || !store) return false;

  try {
    return store.getItem(pin_key(owner_id)) === "1";
  } catch {
    return false;
  }
}

function write_pin(owner_id: string, store: PinStore | null): void {
  if (!store) return;

  try {
    store.setItem(pin_key(owner_id), "1");
  } catch {
    return;
  }
}

export function sync_mail_legacy_retirement(
  vault: Pick<EncryptedVault, "mail_legacy_retired"> | null | undefined,
  owner_id: string | null | undefined,
  store: PinStore | null = default_store(),
): boolean {
  const marked = vault_marks_mail_legacy_retired(vault);

  if (marked && owner_id) write_pin(owner_id, store);

  retired = marked || read_mail_legacy_retired_pin(owner_id, store);

  return retired;
}

export function is_mail_legacy_retired(): boolean {
  return retired;
}

export function reset_mail_legacy_retirement(): void {
  retired = false;
}

export function merge_mail_legacy_retired_marker(
  ...markers: unknown[]
): MailLegacyRetiredMarker | undefined {
  let best: MailLegacyRetiredMarker | undefined;

  for (const marker of markers) {
    if (!is_valid_retired_marker(marker)) continue;
    if (!best || marker.v > best.v) best = { v: marker.v, at: marker.at };
  }

  return best;
}

export function new_mail_legacy_retired_marker(
  now: number,
): MailLegacyRetiredMarker {
  return {
    v: MAIL_LEGACY_RETIREMENT_VERSION,
    at: new Date(now).toISOString(),
  };
}
