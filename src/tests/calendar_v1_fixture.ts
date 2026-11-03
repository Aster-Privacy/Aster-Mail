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
import type { EncryptedVault } from "@/services/crypto/key_manager";

import { array_to_base64 } from "@/services/crypto/key_manager_core";

export const CALENDAR_LEGACY_DOMAIN = "astermail-calendar-v1";
export const CALENDAR_BLOB_FORMAT_V1 = 1;

export async function encrypt_calendar_payload_v1<T>(
  payload: T,
  vault: EncryptedVault,
): Promise<{ ciphertext: string; nonce: string; format: number }> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(vault.identity_key + CALENDAR_LEGACY_DOMAIN),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      new TextEncoder().encode(JSON.stringify(payload)),
    ),
  );

  return {
    ciphertext: array_to_base64(ciphertext),
    nonce: array_to_base64(nonce),
    format: CALENDAR_BLOB_FORMAT_V1,
  };
}
