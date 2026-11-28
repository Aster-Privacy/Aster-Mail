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
import {
  extract_username_from_email,
  get_recipient_public_key,
} from "../api/keys";

import { array_to_base64, base64_to_array } from "./base64";
import { type RatchetKeySet } from "./key_manager_core";
import {
  fingerprint_to_hex,
  own_owner_fingerprint,
  owner_fingerprint_bytes,
} from "./handshake_keys/bundle_signing";
import { get_vault_from_memory } from "./memory_key_store";
import { type RatchetRecipientData } from "./ratchet_types";
import { X3DH_VERSION_ONE_TIME_BOUND, type HandshakeBinding } from "./x3dh";

import { ignore_error } from "@/lib/ignore_error";

export async function published_owner_fingerprint(
  peer: string,
): Promise<string | null> {
  const username = extract_username_from_email(peer);
  const published = username
    ? (await get_recipient_public_key(username, peer)).data?.public_key
    : null;

  return published
    ? fingerprint_to_hex(await owner_fingerprint_bytes(published))
    : null;
}

export async function responder_binding(
  initiator_fingerprint: Uint8Array,
  keys: RatchetKeySet,
): Promise<HandshakeBinding> {
  const vault = get_vault_from_memory();

  if (!vault) throw new Error("Vault unavailable for the handshake");

  return {
    initiator_fingerprint,
    responder_fingerprint: await own_owner_fingerprint(vault),
    responder_pq_identity: keys.ratchet_pq_identity_public
      ? base64_to_array(keys.ratchet_pq_identity_public)
      : null,
  };
}

async function discard_used_pq_one_time_prekey(
  data: RatchetRecipientData,
): Promise<void> {
  const key_id: unknown = data.pq_key_id;

  if (
    !data.pq_ciphertext ||
    typeof key_id !== "number" ||
    !Number.isSafeInteger(key_id) ||
    key_id < 0
  ) {
    return;
  }

  try {
    const { consume_pq_prekey } = await import("./pq_prekey_store");

    await consume_pq_prekey(
      key_id,
      array_to_base64(base64_to_array(data.ephemeral_key)),
    );
  } catch (caught) {
    ignore_error(
      "services/crypto/ratchet_decrypt:discard_used_pq_one_time_prekey",
      caught,
    );
  }
}

export async function discard_used_one_time_prekey(
  data: RatchetRecipientData,
): Promise<void> {
  await discard_used_pq_one_time_prekey(data);

  if (
    (data.x3dh_v ?? 0) < X3DH_VERSION_ONE_TIME_BOUND ||
    data.opk_id === undefined
  ) {
    return;
  }

  try {
    const { delete_ec_one_time_secret } = await import("./ec_prekey_store");

    await delete_ec_one_time_secret(data.opk_id);
  } catch (caught) {
    ignore_error(
      "services/crypto/ratchet_decrypt:discard_used_one_time_prekey",
      caught,
    );
  }
}
