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
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

import { api_client } from "../api/client";

const ONE_TIME_PREKEY_BATCH_SIZE = 50;
const PQ_PREKEY_BATCH_SIZE = 20;
const REPLENISHMENT_DEBOUNCE_MS = 5000;

let last_replenishment_time = 0;
let replenishment_in_progress = false;

interface PrekeyData {
  key_id: number;
  public_key: string;
}

interface UploadPrekeysRequest {
  one_time_prekeys: PrekeyData[];
  pq_prekeys?: PrekeyData[];
}

function array_to_base64(array: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }

  return btoa(binary);
}

function generate_key_id_start(): number {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const view = new DataView(bytes.buffer);

  return (Math.abs(view.getInt32(0, true)) % 1000000) + 1;
}

function generate_ml_kem_keypairs(count: number): {
  public_keys: Uint8Array[];
  secret_keys: Uint8Array[];
} {
  const public_keys: Uint8Array[] = [];
  const secret_keys: Uint8Array[] = [];

  for (let i = 0; i < count; i++) {
    const keypair = ml_kem768.keygen();

    public_keys.push(keypair.publicKey);
    secret_keys.push(keypair.secretKey);
  }

  return { public_keys, secret_keys };
}

export function generate_one_time_prekeys(
  count: number = ONE_TIME_PREKEY_BATCH_SIZE,
): {
  prekeys: PrekeyData[];
  secret_keys: Uint8Array[];
} {
  const base_id = generate_key_id_start();
  const { public_keys, secret_keys } = generate_ml_kem_keypairs(count);

  const prekeys: PrekeyData[] = public_keys.map((pk, i) => ({
    key_id: base_id + i,
    public_key: array_to_base64(pk),
  }));

  return { prekeys, secret_keys };
}

export function generate_pq_prekeys(count: number = PQ_PREKEY_BATCH_SIZE): {
  prekeys: PrekeyData[];
  secret_keys: Uint8Array[];
} {
  const base_id = generate_key_id_start();
  const { public_keys, secret_keys } = generate_ml_kem_keypairs(count);

  const prekeys: PrekeyData[] = public_keys.map((pk, i) => ({
    key_id: base_id + i,
    public_key: array_to_base64(pk),
  }));

  return { prekeys, secret_keys };
}

export async function upload_prekeys(
  one_time_prekeys: PrekeyData[],
  pq_prekeys?: PrekeyData[],
): Promise<boolean> {
  const request: UploadPrekeysRequest = {
    one_time_prekeys,
  };

  if (pq_prekeys && pq_prekeys.length > 0) {
    request.pq_prekeys = pq_prekeys;
  }

  const response = await api_client.post("/crypto/v1/keys/prekeys", request);

  return !response.error;
}

export async function generate_and_upload_prekeys(): Promise<boolean> {
  const now = Date.now();

  if (replenishment_in_progress) {
    return false;
  }

  if (now - last_replenishment_time < REPLENISHMENT_DEBOUNCE_MS) {
    return false;
  }

  replenishment_in_progress = true;
  last_replenishment_time = now;

  try {
    const otp = generate_one_time_prekeys(ONE_TIME_PREKEY_BATCH_SIZE);
    const pq = generate_pq_prekeys(PQ_PREKEY_BATCH_SIZE);

    const success = await upload_prekeys(otp.prekeys, pq.prekeys);

    otp.secret_keys.forEach((sk) => {
      crypto.getRandomValues(sk);
      sk.fill(0);
    });
    pq.secret_keys.forEach((sk) => {
      crypto.getRandomValues(sk);
      sk.fill(0);
    });

    return success;
  } finally {
    replenishment_in_progress = false;
  }
}

export async function check_and_replenish_prekeys(): Promise<void> {
  try {
    await generate_and_upload_prekeys();
  } catch {
    /* best-effort */
  }
}
