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
import type { GuardDevice } from "@/services/guard/guard_device";
import type { StepUpCredentials } from "@/services/api/step_up";
import type { SignedAction, StepUpProof } from "@/services/api/guard";

import {
  base64url_decode,
  base64url_encode,
} from "@/lib/crypto/device_envelope";
import { build_action_message } from "@/lib/crypto/guard_action";
import {
  guard_challenge,
  guard_step_up_passkey_options,
} from "@/services/api/guard";
import { perform_webauthn_assertion_with_options } from "@/services/api/webauthn";

export class GuardActionError extends Error {
  server_code: string | undefined;
  status: number | undefined;

  constructor(message: string, server_code?: string, status?: number) {
    super(message);
    this.name = "GuardActionError";
    this.server_code = server_code;
    this.status = status;
  }
}

export async function sign_guard_action(
  device: GuardDevice,
  user_id: string,
  code: number,
  subject: Uint8Array,
  proof: StepUpProof | null = null,
): Promise<SignedAction> {
  const challenge = await guard_challenge();

  if (challenge.error || !challenge.data) {
    throw new GuardActionError(
      challenge.error ?? "challenge failed",
      challenge.server_code,
      challenge.status,
    );
  }

  const nonce = base64url_decode(challenge.data.nonce);
  const message = build_action_message(code, user_id, nonce, subject);
  const signature = await device.sign(message);

  return {
    nonce: challenge.data.nonce,
    signature: base64url_encode(signature),
    proof: proof ?? null,
  };
}

export function build_step_up_proof(credentials: StepUpCredentials): StepUpProof {
  if (credentials.hardware_key_assertion) {
    return { type: "hardware_key", assertion: credentials.hardware_key_assertion };
  }

  return {
    type: "password",
    password_hash: credentials.password_hash,
    totp_code: credentials.totp_code ?? null,
  };
}

export async function passkey_step_up_proof(): Promise<StepUpProof> {
  const options = await guard_step_up_passkey_options();

  if (options.error || !options.data) {
    throw new GuardActionError(
      options.error ?? "passkey options failed",
      options.server_code,
      options.status,
    );
  }

  const assertion = await perform_webauthn_assertion_with_options(options.data);

  return { type: "passkey", assertion };
}
