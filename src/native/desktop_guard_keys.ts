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
import type { DevicePubkeys } from "@/native/desktop_device_auth";
import type { GuardDevice } from "@/services/guard/guard_device";

import {
  base64url_decode,
  base64url_encode,
} from "@/lib/crypto/device_envelope";
import {
  device_from_record,
  generate_action_key,
} from "@/services/guard/guard_device";
import {
  read_guard_record,
  rekey_guard_record,
  write_guard_record,
  type GuardKeyRecord,
} from "@/services/crypto/guard_key_store";

export function pairing_guard_key(ed25519_pk: string): string {
  return `pairing:${ed25519_pk}`;
}

async function invoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const core = await import("@tauri-apps/api/core");

  return core.invoke<T>(cmd, args);
}

async function native_pubkeys(): Promise<DevicePubkeys> {
  return invoke<DevicePubkeys>("device_get_pubkeys");
}

async function open_native_seal(
  sealed: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array> {
  const opened = await invoke<string>("device_open_guard_seal", {
    sealedB64: base64url_encode(sealed),
    aadB64: base64url_encode(aad),
  });

  return base64url_decode(opened);
}

async function open_native_envelope(
  sealed: Uint8Array,
  device_id: string,
): Promise<Uint8Array> {
  const opened = await invoke<string>("device_unseal_vault_envelope", {
    envelopeB64: base64url_encode(sealed),
    deviceId: device_id,
  });

  return base64url_decode(opened);
}

function same_bytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }

  return true;
}

function desktop_device(record: GuardKeyRecord): GuardDevice {
  return device_from_record(record, {
    device_type: "desktop",
    open_seal: open_native_seal,
    open_envelope: open_native_envelope,
  });
}

export async function get_desktop_guard_device(
  user_id: string,
): Promise<GuardDevice | null> {
  try {
    const record = await read_guard_record(user_id);

    if (!record) return null;
    const pubkeys = await native_pubkeys();

    if (
      !same_bytes(base64url_decode(pubkeys.x25519_pk), record.x25519_pk) ||
      !same_bytes(base64url_decode(pubkeys.mlkem_pk), record.mlkem_pk)
    ) {
      return null;
    }

    return desktop_device(record);
  } catch {
    return null;
  }
}

function record_matches(record: GuardKeyRecord, pubkeys: DevicePubkeys): boolean {
  return (
    same_bytes(base64url_decode(pubkeys.ed25519_pk), record.ed25519_pk) &&
    same_bytes(base64url_decode(pubkeys.x25519_pk), record.x25519_pk) &&
    same_bytes(base64url_decode(pubkeys.mlkem_pk), record.mlkem_pk)
  );
}

export async function prepare_pairing_action_pk(
  pubkeys: DevicePubkeys,
): Promise<string | null> {
  try {
    const key = pairing_guard_key(pubkeys.ed25519_pk);
    const existing = await read_guard_record(key);

    if (existing && record_matches(existing, pubkeys)) {
      return base64url_encode(existing.action_pk);
    }

    const device = await create_desktop_guard_device(
      key,
      pubkeys.machine_name,
      pubkeys,
    );

    return base64url_encode((await device.public_keys()).action_pk);
  } catch {
    return null;
  }
}

export async function adopt_pairing_guard_device(
  ed25519_pk: string,
  user_id: string,
  device_id: string,
): Promise<boolean> {
  try {
    const key = pairing_guard_key(ed25519_pk);
    const record = await read_guard_record(key);

    if (!record) return false;
    await rekey_guard_record(key, user_id);
    const device = await get_desktop_guard_device(user_id);

    if (!device) return false;
    await device.set_device_id(device_id);

    return true;
  } catch {
    return false;
  }
}

export async function create_desktop_guard_device(
  user_id: string,
  name: string,
  known_pubkeys?: DevicePubkeys,
): Promise<GuardDevice> {
  const pubkeys = known_pubkeys ?? (await native_pubkeys());
  const action = await generate_action_key();
  const record: GuardKeyRecord = {
    user_id,
    name,
    action_key: action.action_key,
    action_pk: action.action_pk,
    ed25519_pk: base64url_decode(pubkeys.ed25519_pk),
    mlkem_pk: base64url_decode(pubkeys.mlkem_pk),
    x25519_pk: base64url_decode(pubkeys.x25519_pk),
    wrapped_secrets: null,
    device_id: null,
  };

  await write_guard_record(record);

  return desktop_device(record);
}
