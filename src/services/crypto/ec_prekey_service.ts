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
import { api_client } from "../api/client";

import { array_to_base64 } from "./base64";
import {
  delete_local_ec_one_time_secret,
  ec_one_time_storage_available,
  encrypt_ec_one_time_secret,
  has_local_ec_one_time_secret,
  save_ec_one_time_secret,
} from "./ec_prekey_store";

const EC_PREKEY_STATUS_ROUTE = "/crypto/v1/keys/ec-prekeys/status";
const EC_PREKEY_UPLOAD_ROUTE = "/crypto/v1/keys/ec-prekeys";
const EC_KEY_ID_MAX = 0x7fffffff;
const EC_KEY_ID_ATTEMPTS = 8;

export const EC_PREKEY_BATCH_MAX = 50;
export const EC_PREKEY_RECHECK_MS = 6 * 60 * 60 * 1000;

let replenishment_in_progress = false;
let not_accepted_until = 0;

export interface EcPrekeyStatus {
  accepted?: boolean;
  available?: number;
  target?: number;
  max_upload?: number;
}

interface EcPrekeyUpload {
  key_id: number;
  public_key: string;
  encrypted_secret: string;
  secret_nonce: string;
}

function whole_number(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;

  return Math.floor(value);
}

export function planned_ec_prekey_upload_count(
  status: EcPrekeyStatus | null | undefined,
): number {
  if (!status || status.accepted !== true) return 0;

  const available = whole_number(status.available);
  const target = whole_number(status.target);
  const max_upload = whole_number(status.max_upload);

  if (available === null || target === null || max_upload === null) return 0;

  if (available < 0 || target <= 0 || max_upload <= 0) return 0;

  return Math.max(
    0,
    Math.min(target - available, max_upload, EC_PREKEY_BATCH_MAX),
  );
}

function random_key_id(): number {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const value = new DataView(bytes.buffer).getUint32(0, false) & EC_KEY_ID_MAX;

  return value === 0 ? 1 : value;
}

async function allocate_key_id(taken: Set<number>): Promise<number | null> {
  for (let attempt = 0; attempt < EC_KEY_ID_ATTEMPTS; attempt++) {
    const candidate = random_key_id();

    if (taken.has(candidate)) continue;

    if (await has_local_ec_one_time_secret(candidate)) continue;

    taken.add(candidate);

    return candidate;
  }

  return null;
}

async function generate_one_time_prekey(
  key_id: number,
): Promise<EcPrekeyUpload | null> {
  const keypair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const public_key_raw = new Uint8Array(
    await crypto.subtle.exportKey("raw", keypair.publicKey),
  );
  const private_jwk = await crypto.subtle.exportKey("jwk", keypair.privateKey);

  if (!private_jwk.d) return null;

  const encrypted = await encrypt_ec_one_time_secret(private_jwk.d);

  if (!encrypted) return null;

  await save_ec_one_time_secret(key_id, private_jwk.d);

  return {
    key_id,
    public_key: array_to_base64(public_key_raw),
    encrypted_secret: encrypted.encrypted_secret,
    secret_nonce: encrypted.secret_nonce,
  };
}

async function discard_local_secrets(key_ids: number[]): Promise<void> {
  for (const key_id of key_ids) {
    await delete_local_ec_one_time_secret(key_id);
  }
}

async function fetch_status(): Promise<EcPrekeyStatus | null> {
  const response = await api_client.get<EcPrekeyStatus>(EC_PREKEY_STATUS_ROUTE);

  if (response.error || !response.data) return null;

  return response.data;
}

export async function replenish_ec_one_time_prekeys(): Promise<number> {
  if (replenishment_in_progress) return 0;

  replenishment_in_progress = true;

  const saved_ids: number[] = [];

  try {
    if (Date.now() < not_accepted_until) return 0;

    if (!(await ec_one_time_storage_available())) return 0;

    const status = await fetch_status();
    const wanted = planned_ec_prekey_upload_count(status);

    if (status?.accepted !== true) {
      not_accepted_until = Date.now() + EC_PREKEY_RECHECK_MS;

      return 0;
    }

    if (wanted <= 0) return 0;

    const taken = new Set<number>();
    const prekeys: EcPrekeyUpload[] = [];

    for (let i = 0; i < wanted; i++) {
      const key_id = await allocate_key_id(taken);

      if (key_id === null) break;

      const prekey = await generate_one_time_prekey(key_id);

      if (!prekey) break;

      saved_ids.push(key_id);
      prekeys.push(prekey);
    }

    if (prekeys.length === 0) return 0;

    const response = await api_client.post<{ uploaded?: number }>(
      EC_PREKEY_UPLOAD_ROUTE,
      { prekeys },
    );

    if (response.error || !response.data) {
      await discard_local_secrets(saved_ids);

      return 0;
    }

    return prekeys.length;
  } catch {
    await discard_local_secrets(saved_ids).catch(() => undefined);

    return 0;
  } finally {
    replenishment_in_progress = false;
  }
}

export function reset_ec_prekey_replenishment_state(): void {
  replenishment_in_progress = false;
  not_accepted_until = 0;
}
