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
import type { GuardSignInStatus } from "@/services/api/guard";
import type { GuardDevice } from "@/services/guard/guard_device";

import { base64url_encode } from "@/lib/crypto/device_envelope";
import {
  GUARD_ACTION,
  number_hash,
  random_number,
} from "@/lib/crypto/guard_action";
import {
  GUARD_ENVELOPE_VERSIONS,
  get_guard_join_status,
  guard_join,
  guard_join_complete,
  guard_setup_nonce,
} from "@/services/api/guard";
import {
  create_guard_device,
  forget_guard_device,
  get_guard_device,
  rekey_guard_device,
} from "@/services/guard/guard_device";
import {
  device_keys_body,
  sign_possession,
  store_sealed_code_secret,
} from "@/services/guard/guard_enroll";
import { default_guard_device_name } from "@/services/guard/guard_device_label";

export const GUARD_JOIN_KEY_PREFIX = "guard_join:";

export interface GuardJoinDeps {
  create_device: (key: string, name: string) => Promise<GuardDevice>;
  get_device: (key: string) => Promise<GuardDevice | null>;
  rekey_device: (from: string, to: string) => Promise<void>;
  forget_device: (key: string) => Promise<void>;
  device_name: () => string;
  random_number: () => number;
  new_request_id: () => string;
}

const default_join_deps: GuardJoinDeps = {
  create_device: create_guard_device,
  get_device: get_guard_device,
  rekey_device: rekey_guard_device,
  forget_device: forget_guard_device,
  device_name: default_guard_device_name,
  random_number,
  new_request_id: () => crypto.randomUUID(),
};

export interface GuardJoinPending {
  user_id: string;
  request_id: string;
  number: number;
  expires_at: string;
}

export interface GuardJoinFailure {
  kind: "error";
  server_code?: string;
  code?: string;
  status?: number;
  retry_after_secs?: number;
  details?: unknown;
}

export type GuardJoinStart =
  | { kind: "pending"; join: GuardJoinPending }
  | GuardJoinFailure;

export type GuardJoinFinish =
  | { kind: "joined"; device: GuardDevice }
  | GuardJoinFailure;

function join_failure(response: {
  server_code?: string;
  code?: string;
  status?: number;
  retry_after_secs?: number;
  details?: unknown;
}): GuardJoinFailure {
  return {
    kind: "error",
    server_code: response.server_code,
    code: response.code,
    status: response.status,
    retry_after_secs: response.retry_after_secs,
    details: response.details,
  };
}

function join_key(user_id: string): string {
  return `${GUARD_JOIN_KEY_PREFIX}${user_id}`;
}

export async function start_guard_join(
  user_id: string,
  deps: GuardJoinDeps = default_join_deps,
): Promise<GuardJoinStart> {
  const key = join_key(user_id);
  const discard = () => deps.forget_device(key).catch(() => undefined);

  try {
    await discard();
    const device = await deps.create_device(key, deps.device_name());
    const nonce = await guard_setup_nonce();

    if (nonce.error || !nonce.data) {
      await discard();

      return join_failure(nonce);
    }

    const pub = await device.public_keys();
    const signature = await sign_possession(
      device,
      user_id,
      GUARD_ACTION.join,
      nonce.data.nonce,
    );
    const number = deps.random_number();
    const request_id = deps.new_request_id();
    const response = await guard_join({
      request_id,
      device: device_keys_body(pub),
      envelope_versions: GUARD_ENVELOPE_VERSIONS,
      number_hash: base64url_encode(number_hash(request_id, number)),
      action: { nonce: nonce.data.nonce, signature, proof: null },
    });

    if (response.error || !response.data) {
      await discard();

      return join_failure(response);
    }

    return {
      kind: "pending",
      join: {
        user_id,
        request_id: response.data.request_id,
        number,
        expires_at: response.data.expires_at,
      },
    };
  } catch {
    await discard();

    return { kind: "error" };
  }
}

export async function poll_guard_join(
  request_id: string,
): Promise<GuardSignInStatus | null> {
  const response = await get_guard_join_status(request_id);

  if (response.error || !response.data) return null;

  return response.data.status;
}

export async function finish_guard_join(
  join: GuardJoinPending,
  deps: GuardJoinDeps = default_join_deps,
): Promise<GuardJoinFinish> {
  const key = join_key(join.user_id);
  const response = await guard_join_complete({ request_id: join.request_id });

  if (response.error || !response.data) return join_failure(response);

  try {
    await deps.rekey_device(key, join.user_id);
    const device = await deps.get_device(join.user_id);

    if (!device) return { kind: "error" };
    await device.set_device_id(response.data.device_id);
    await store_sealed_code_secret(
      device,
      response.data.device_id,
      response.data.code_secret_sealed,
    );

    return { kind: "joined", device };
  } catch {
    return { kind: "error" };
  }
}

export async function abandon_guard_join(
  user_id: string,
  deps: GuardJoinDeps = default_join_deps,
): Promise<void> {
  await deps.forget_device(join_key(user_id)).catch(() => undefined);
}
