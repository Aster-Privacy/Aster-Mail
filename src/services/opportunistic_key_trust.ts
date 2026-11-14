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
import type { ExternalKeyInfo } from "./api/keys";

const OPPORTUNISTIC_KEY_SOURCES: ReadonlySet<string> = new Set([
  "aster",
  "autocrypt",
  "dane",
  "manual",
  "wkd",
]);

export function is_recipient_controlled_key(
  info: ExternalKeyInfo | undefined,
  now: number = Date.now(),
): info is ExternalKeyInfo & { public_key: string } {
  if (!info?.found || !info.public_key) return false;
  if (info.expires_at !== null && !(Date.parse(info.expires_at) > now)) {
    return false;
  }

  return OPPORTUNISTIC_KEY_SOURCES.has((info.source ?? "").toLowerCase());
}

export function trusts_key_for_opportunistic(
  info: ExternalKeyInfo | undefined,
  encrypt_by_default: boolean,
  now: number = Date.now(),
): boolean {
  return encrypt_by_default && is_recipient_controlled_key(info, now);
}

export function will_encrypt_opportunistically(
  info: ExternalKeyInfo | undefined,
  encrypt_by_default: boolean,
): boolean {
  return (
    info?.will_encrypt === true ||
    trusts_key_for_opportunistic(info, encrypt_by_default)
  );
}
