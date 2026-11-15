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
import type { SignedAction } from "@/services/api/guard";
import type { DeviceCodeVerifyResponse } from "@/services/api/devices";

import { base64url_decode } from "@/lib/crypto/device_envelope";
import {
  approve_subject,
  GUARD_ACTION,
  keys_digest,
} from "@/lib/crypto/guard_action";
import { get_guard_status, GUARD_SWITCH } from "@/services/api/guard";
import { get_guard_device } from "@/services/guard/guard_device";
import { sign_guard_action } from "@/services/guard/sign_action";

export type DeviceCodeKeys = Pick<
  DeviceCodeVerifyResponse,
  "ed25519_pk" | "mlkem_pk" | "x25519_pk" | "action_pk" | "keys_digest"
>;

export type DeviceCodeGuardResult =
  | { kind: "off" }
  | { kind: "signed"; action: SignedAction }
  | { kind: "needs_approver" }
  | { kind: "keys_mismatch" };

export function bytes_equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;

  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];

  return diff === 0;
}

export function device_code_digest(keys: DeviceCodeKeys): Uint8Array {
  return keys_digest(
    base64url_decode(keys.ed25519_pk),
    base64url_decode(keys.mlkem_pk),
    base64url_decode(keys.x25519_pk),
    keys.action_pk ? base64url_decode(keys.action_pk) : null,
  );
}

export async function guard_device_code_action(
  user_id: string | undefined,
  keys: DeviceCodeKeys,
): Promise<DeviceCodeGuardResult> {
  const status = await get_guard_status();

  if (status.error || !status.data) return { kind: "off" };
  if ((status.data.switches & GUARD_SWITCH.new_device_approval) === 0) {
    return { kind: "off" };
  }
  if (!user_id) return { kind: "needs_approver" };

  const device = await get_guard_device(user_id);

  if (!device) return { kind: "needs_approver" };

  const digest = device_code_digest(keys);

  if (keys.keys_digest) {
    let server_digest: Uint8Array;

    try {
      server_digest = base64url_decode(keys.keys_digest);
    } catch {
      return { kind: "keys_mismatch" };
    }
    if (!bytes_equal(server_digest, digest)) return { kind: "keys_mismatch" };
  }

  const action = await sign_guard_action(
    device,
    user_id,
    GUARD_ACTION.approve,
    approve_subject(null, digest, 0),
  );

  return { kind: "signed", action };
}
