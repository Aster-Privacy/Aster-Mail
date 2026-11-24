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
import type {
  GuardDeviceKeys,
  GuardSetupResponse,
  StepUpProof,
} from "@/services/api/guard";
import type {
  GuardDevice,
  GuardDevicePublic,
} from "@/services/guard/guard_device";

import {
  base64url_decode,
  base64url_encode,
} from "@/lib/crypto/device_envelope";
import {
  build_action_message,
  GUARD_ACTION,
  keys_digest,
} from "@/lib/crypto/guard_action";
import { code_secret_aad } from "@/lib/crypto/guard_seal";
import { guard_setup, guard_setup_nonce } from "@/services/api/guard";
import {
  create_guard_device,
  forget_guard_device,
  get_guard_device,
  rekey_guard_device,
} from "@/services/guard/guard_device";
import { default_guard_device_name } from "@/services/guard/guard_device_label";

export function device_keys_body(pub: GuardDevicePublic): GuardDeviceKeys {
  return {
    ed25519_pk: base64url_encode(pub.ed25519_pk),
    mlkem_pk: base64url_encode(pub.mlkem_pk),
    x25519_pk: base64url_encode(pub.x25519_pk),
    action_pk: base64url_encode(pub.action_pk),
    device_type: pub.device_type,
    name: pub.name,
  };
}

export function device_keys_digest(pub: GuardDevicePublic): Uint8Array {
  return keys_digest(pub.ed25519_pk, pub.mlkem_pk, pub.x25519_pk, pub.action_pk);
}

export async function store_sealed_code_secret(
  device: GuardDevice,
  device_id: string,
  sealed: string,
): Promise<boolean> {
  try {
    const secret = await device.open_seal(
      base64url_decode(sealed),
      code_secret_aad(device_id),
    );

    try {
      await device.store_code_secret(secret);
    } finally {
      secret.fill(0);
    }

    return true;
  } catch {
    return false;
  }
}

export async function sign_possession(
  device: GuardDevice,
  user_id: string,
  code: number,
  nonce: string,
): Promise<string> {
  const pub = await device.public_keys();
  const message = build_action_message(
    code,
    user_id,
    base64url_decode(nonce),
    device_keys_digest(pub),
  );

  return base64url_encode(await device.sign(message));
}

export interface GuardEnrollInput {
  user_id: string;
  switches: number;
  hold_scopes: number;
  rescue_code: string;
  proof: StepUpProof;
  on_step?: (step: GuardEnrollStep) => void;
}

export type GuardEnrollStep = "keys" | "server" | "device";

export interface GuardEnrollDeps {
  create_device: (key: string, name: string) => Promise<GuardDevice>;
  get_device: (key: string) => Promise<GuardDevice | null>;
  rekey_device: (from: string, to: string) => Promise<void>;
  forget_device: (key: string) => Promise<void>;
  device_name: () => string;
}

export const GUARD_SETUP_KEY_PREFIX = "guard_setup:";

export type GuardEnrollOutcome =
  | { kind: "enabled"; device: GuardDevice; setup: GuardSetupResponse }
  | { kind: "already_on" }
  | { kind: "wrong_credentials" }
  | { kind: "code_used" }
  | { kind: "locked" }
  | { kind: "error"; server_code?: string; status?: number; code?: string };

const SETUP_FAILURES: Record<string, GuardEnrollOutcome> = {
  GUARD_ALREADY_ON: { kind: "already_on" },
  INVALID_CREDENTIALS: { kind: "wrong_credentials" },
  TOTP_CODE_REPLAYED: { kind: "code_used" },
  ACCOUNT_LOCKED: { kind: "locked" },
};

export function setup_failure(
  server_code?: string | null,
  status?: number,
  code?: string,
): GuardEnrollOutcome {
  return (
    (server_code && SETUP_FAILURES[server_code]) || {
      kind: "error",
      server_code: server_code ?? undefined,
      status,
      code,
    }
  );
}

const default_enroll_deps: GuardEnrollDeps = {
  create_device: create_guard_device,
  get_device: get_guard_device,
  rekey_device: rekey_guard_device,
  forget_device: forget_guard_device,
  device_name: default_guard_device_name,
};

export async function enroll_guard(
  input: GuardEnrollInput,
  deps: GuardEnrollDeps = default_enroll_deps,
): Promise<GuardEnrollOutcome> {
  const setup_key = `${GUARD_SETUP_KEY_PREFIX}${input.user_id}`;
  const discard = () => deps.forget_device(setup_key).catch(() => undefined);
  let device: GuardDevice;

  input.on_step?.("keys");
  try {
    await discard();
    device = await deps.create_device(setup_key, deps.device_name());
  } catch {
    return { kind: "error" };
  }

  const nonce = await guard_setup_nonce();

  if (nonce.error || !nonce.data) {
    await discard();

    return setup_failure(nonce.server_code, nonce.status, nonce.code);
  }

  let body;

  try {
    const pub = await device.public_keys();

    body = {
      device: device_keys_body(pub),
      nonce: nonce.data.nonce,
      possession_signature: await sign_possession(
        device,
        input.user_id,
        GUARD_ACTION.enroll,
        nonce.data.nonce,
      ),
      rescue_code: input.rescue_code,
      switches: input.switches,
      hold_scopes: input.hold_scopes,
      proof: input.proof,
    };
  } catch {
    await discard();

    return { kind: "error" };
  }

  input.on_step?.("server");
  const response = await guard_setup(body);

  if (response.error || !response.data) {
    await discard();

    return setup_failure(response.server_code, response.status, response.code);
  }

  input.on_step?.("device");
  try {
    await deps.rekey_device(setup_key, input.user_id);
    const enrolled = await deps.get_device(input.user_id);

    if (!enrolled) return { kind: "error" };
    await enrolled.set_device_id(response.data.device_id);
    await store_sealed_code_secret(
      enrolled,
      response.data.device_id,
      response.data.code_secret_sealed,
    );

    return { kind: "enabled", device: enrolled, setup: response.data };
  } catch {
    return { kind: "error" };
  }
}
