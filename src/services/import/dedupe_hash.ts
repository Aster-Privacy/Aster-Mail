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
import { HASH_ALG } from "@/services/crypto/constants";

const IMPORT_DEDUPE_KEY_VERSION = "astermail-import-dedupe-v1";

export type ImportDedupeDomain = "message_id" | "content";

async function derive_import_dedupe_key(
  identity_key: string,
): Promise<CryptoKey> {
  const key_material = new TextEncoder().encode(
    identity_key + IMPORT_DEDUPE_KEY_VERSION,
  );

  let hash_buffer: ArrayBuffer;

  try {
    hash_buffer = await crypto.subtle.digest(HASH_ALG, key_material);
  } finally {
    key_material.fill(0);
  }

  return crypto.subtle.importKey(
    "raw",
    hash_buffer,
    { name: "HMAC", hash: HASH_ALG },
    false,
    ["sign"],
  );
}

export async function compute_import_dedupe_hash(
  identity_key: string,
  domain: ImportDedupeDomain,
  value: string,
): Promise<string> {
  if (!identity_key) {
    throw new Error("import dedupe key unavailable");
  }

  const key = await derive_import_dedupe_key(identity_key);
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${domain}
${value}`),
  );
  const bytes = new Uint8Array(mac);
  let binary = "";

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}
