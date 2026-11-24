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
import { ed25519, x25519 } from "@noble/curves/ed25519";
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

import { open_vault_key_envelope } from "@/lib/crypto/device_envelope";
import { compress_p256, concat_bytes } from "@/lib/crypto/guard_action";
import { open_guard_seal } from "@/lib/crypto/guard_seal";
import { is_tauri } from "@/native/desktop_device_auth";
import { get_device_wrap_key } from "@/services/crypto/device_key_store";
import {
  delete_guard_record,
  read_guard_hint,
  read_guard_record,
  rekey_guard_record,
  write_guard_hint,
  write_guard_record,
  type GuardKeyRecord,
  type GuardWrappedSecrets,
} from "@/services/crypto/guard_key_store";

export type GuardDeviceKind = "web" | "desktop";

export interface GuardDevicePublic {
  ed25519_pk: Uint8Array;
  mlkem_pk: Uint8Array;
  x25519_pk: Uint8Array;
  action_pk: Uint8Array;
  device_type: GuardDeviceKind;
  name: string;
}

export interface GuardDevice {
  public_keys(): Promise<GuardDevicePublic>;
  device_id(): Promise<string | null>;
  set_device_id(id: string): Promise<void>;
  sign(message: Uint8Array): Promise<Uint8Array>;
  open_seal(sealed: Uint8Array, aad: Uint8Array): Promise<Uint8Array>;
  open_envelope(sealed: Uint8Array, device_id: string): Promise<Uint8Array>;
  store_code_secret(secret: Uint8Array): Promise<void>;
  code_secret(): Promise<Uint8Array | null>;
  forget(): Promise<void>;
}

const ED25519_SK_LEN = 32;
const MLKEM_SK_LEN = 2400;
const X25519_SK_LEN = 32;
const SECRETS_LEN = ED25519_SK_LEN + MLKEM_SK_LEN + X25519_SK_LEN;
const ECDSA_PARAMS = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN_PARAMS = { name: "ECDSA", hash: "SHA-256" } as const;

export interface GuardActionKey {
  action_key: CryptoKey;
  action_pk: Uint8Array;
}

export async function generate_action_key(): Promise<GuardActionKey> {
  const pair = (await crypto.subtle.generateKey(ECDSA_PARAMS, false, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const raw = new Uint8Array(
    await crypto.subtle.exportKey("raw", pair.publicKey),
  );

  return { action_key: pair.privateKey, action_pk: compress_p256(raw) };
}

export async function sign_with_action_key(
  key: CryptoKey,
  message: Uint8Array,
): Promise<Uint8Array> {
  const signature = await crypto.subtle.sign(SIGN_PARAMS, key, message);

  return new Uint8Array(signature);
}

async function load_wrap_key(): Promise<CryptoKey | null> {
  try {
    return await get_device_wrap_key();
  } catch {
    return null;
  }
}

export interface GuardRecordDeviceOptions {
  device_type: GuardDeviceKind;
  open_seal: (sealed: Uint8Array, aad: Uint8Array) => Promise<Uint8Array>;
  open_envelope: (
    sealed: Uint8Array,
    device_id: string,
  ) => Promise<Uint8Array>;
}

async function wrap_bytes(
  wrap_key: CryptoKey,
  plain: Uint8Array,
): Promise<GuardWrappedSecrets> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrap_key, plain),
  );

  return { iv, ct };
}

async function unwrap_bytes(
  wrap_key: CryptoKey,
  wrapped: GuardWrappedSecrets,
): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: wrapped.iv },
      wrap_key,
      wrapped.ct,
    ),
  );
}

export function device_from_record(
  initial: GuardKeyRecord,
  options: GuardRecordDeviceOptions,
): GuardDevice {
  let record = initial;

  return {
    async public_keys() {
      return {
        ed25519_pk: record.ed25519_pk,
        mlkem_pk: record.mlkem_pk,
        x25519_pk: record.x25519_pk,
        action_pk: record.action_pk,
        device_type: options.device_type,
        name: record.name,
      };
    },
    async device_id() {
      return record.device_id;
    },
    async set_device_id(id: string) {
      record = { ...record, device_id: id };
      await write_guard_record(record);
    },
    sign(message: Uint8Array) {
      return sign_with_action_key(record.action_key, message);
    },
    open_seal: options.open_seal,
    open_envelope: options.open_envelope,
    async store_code_secret(secret: Uint8Array) {
      const wrap_key = await load_wrap_key();

      if (!wrap_key) throw new Error("guard_device: wrap key unavailable");
      const wrapped = await wrap_bytes(wrap_key, secret);

      record = { ...record, wrapped_code_secret: wrapped };
      await write_guard_record(record);
    },
    async code_secret() {
      if (!record.wrapped_code_secret) return null;
      const wrap_key = await load_wrap_key();

      if (!wrap_key) return null;
      try {
        return await unwrap_bytes(wrap_key, record.wrapped_code_secret);
      } catch {
        return null;
      }
    },
    async forget() {
      await delete_guard_record(record.user_id);
    },
  };
}

async function unwrap_secrets(
  record: GuardKeyRecord,
  wrap_key: CryptoKey,
): Promise<Uint8Array> {
  if (!record.wrapped_secrets) throw new Error("guard_device: no secrets");
  const plain = await unwrap_bytes(wrap_key, record.wrapped_secrets);

  if (plain.length !== SECRETS_LEN) {
    plain.fill(0);
    throw new Error("guard_device: bad secrets");
  }

  return plain;
}

async function with_kem_secrets<T>(
  record: GuardKeyRecord,
  wrap_key: CryptoKey,
  run: (mlkem_sk: Uint8Array, x25519_sk: Uint8Array) => T,
): Promise<T> {
  const secrets = await unwrap_secrets(record, wrap_key);

  try {
    return run(
      secrets.subarray(ED25519_SK_LEN, ED25519_SK_LEN + MLKEM_SK_LEN),
      secrets.subarray(ED25519_SK_LEN + MLKEM_SK_LEN),
    );
  } finally {
    secrets.fill(0);
  }
}

function web_device(record: GuardKeyRecord, wrap_key: CryptoKey): GuardDevice {
  return device_from_record(record, {
    device_type: "web",
    open_seal(sealed, aad) {
      return with_kem_secrets(record, wrap_key, (mlkem_sk, x25519_sk) =>
        open_guard_seal(sealed, aad, mlkem_sk, x25519_sk),
      );
    },
    open_envelope(sealed) {
      return with_kem_secrets(record, wrap_key, (mlkem_sk, x25519_sk) =>
        open_vault_key_envelope(
          sealed,
          {
            ed25519_pk: record.ed25519_pk,
            mlkem_pk: record.mlkem_pk,
            x25519_pk: record.x25519_pk,
          },
          mlkem_sk,
          x25519_sk,
        ),
      );
    },
  });
}

async function get_web_guard_device(
  user_id: string,
): Promise<GuardDevice | null> {
  try {
    const record = await read_guard_record(user_id);

    if (!record || !record.wrapped_secrets) return null;
    const wrap_key = await load_wrap_key();

    if (!wrap_key) return null;

    return web_device(record, wrap_key);
  } catch {
    return null;
  }
}

async function create_web_guard_device(
  user_id: string,
  name: string,
): Promise<GuardDevice> {
  const wrap_key = await load_wrap_key();

  if (!wrap_key) throw new Error("guard_device: wrap key unavailable");

  const ed25519_sk = ed25519.utils.randomPrivateKey();
  const x25519_sk = x25519.utils.randomPrivateKey();
  const mlkem = ml_kem768.keygen();
  const secrets = concat_bytes(ed25519_sk, mlkem.secretKey, x25519_sk);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  try {
    const ct = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrap_key, secrets),
    );
    const action = await generate_action_key();
    const record: GuardKeyRecord = {
      user_id,
      name,
      action_key: action.action_key,
      action_pk: action.action_pk,
      ed25519_pk: ed25519.getPublicKey(ed25519_sk),
      mlkem_pk: mlkem.publicKey,
      x25519_pk: x25519.getPublicKey(x25519_sk),
      wrapped_secrets: { iv, ct },
      device_id: null,
    };

    await write_guard_record(record);

    return web_device(record, wrap_key);
  } finally {
    secrets.fill(0);
    ed25519_sk.fill(0);
    x25519_sk.fill(0);
    mlkem.secretKey.fill(0);
  }
}

export async function get_guard_device(
  user_id: string,
): Promise<GuardDevice | null> {
  if (is_tauri()) {
    const desktop = await import("@/native/desktop_guard_keys");

    return desktop.get_desktop_guard_device(user_id);
  }

  return get_web_guard_device(user_id);
}

export async function create_guard_device(
  user_id: string,
  name: string,
): Promise<GuardDevice> {
  if (is_tauri()) {
    const desktop = await import("@/native/desktop_guard_keys");

    return desktop.create_desktop_guard_device(user_id, name);
  }

  return create_web_guard_device(user_id, name);
}

export async function forget_guard_device(user_id: string): Promise<void> {
  await delete_guard_record(user_id);
}

export async function rekey_guard_device(
  from: string,
  to: string,
): Promise<void> {
  await rekey_guard_record(from, to);
}

export { read_guard_hint, write_guard_hint };
