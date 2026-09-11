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
import { randomBytes } from "@noble/hashes/utils";

import {
  request_device_code,
  poll_device_code_status,
  device_challenge,
  device_login,
} from "@/native/desktop_device_auth";
import {
  open_vault_key_envelope,
  base64url_encode,
  base64url_decode,
} from "@/lib/crypto/device_envelope";
import {
  confirm_hub_link,
  HubAccountError,
} from "@/services/account_hub_link";

const POLL_ATTEMPTS = 40;
const POLL_DELAY_MS = 500;

export interface hub_login_response {
  user_id: string;
  username: string;
  email: string;
  encrypted_vault: string;
  vault_nonce: string;
}

export interface hub_login_result {
  login_response: hub_login_response;
  passphrase: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function machine_name(app_name: string): string {
  const platform = navigator.platform?.trim();

  return platform ? `${app_name} on ${platform}` : app_name;
}

function is_login_response(value: unknown): value is hub_login_response {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.user_id === "string" &&
    typeof candidate.username === "string" &&
    typeof candidate.email === "string" &&
    typeof candidate.encrypted_vault === "string" &&
    typeof candidate.vault_nonce === "string"
  );
}

async function await_confirmation(code: string) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const status = await poll_device_code_status(code);

    if (
      status.status === "confirmed" &&
      status.device_id &&
      status.sealed_envelope
    ) {
      return {
        device_id: status.device_id,
        sealed_envelope: status.sealed_envelope,
      };
    }
    if (status.status !== "pending") {
      throw new HubAccountError("code_not_found");
    }
    await sleep(POLL_DELAY_MS);
  }

  throw new HubAccountError("unavailable");
}

export async function sign_in_with_hub_account(
  account_id: string,
  app_name: string,
): Promise<hub_login_result> {
  const ed25519_sk = randomBytes(32);
  const x25519_sk = randomBytes(32);
  const mlkem = ml_kem768.keygen();

  try {
    const code = await request_device_code({
      device_id: null,
      ed25519_pk: base64url_encode(ed25519.getPublicKey(ed25519_sk)),
      mlkem_pk: base64url_encode(mlkem.publicKey),
      x25519_pk: base64url_encode(x25519.getPublicKey(x25519_sk)),
      machine_name: machine_name(app_name),
    });

    await confirm_hub_link(code.code, account_id);

    const confirmed = await await_confirmation(code.code);
    const passphrase_bytes = open_vault_key_envelope(
      base64url_decode(confirmed.sealed_envelope),
      mlkem.secretKey,
      x25519_sk,
    );

    try {
      const challenge = await device_challenge(confirmed.device_id);
      const signature = ed25519.sign(
        base64url_decode(challenge.nonce),
        ed25519_sk,
      );
      const login_response = await device_login(
        challenge.challenge_id,
        base64url_encode(signature),
      );

      if (
        !is_login_response(login_response) ||
        login_response.user_id !== account_id
      ) {
        throw new HubAccountError("session");
      }

      return {
        login_response,
        passphrase: new TextDecoder().decode(passphrase_bytes),
      };
    } finally {
      passphrase_bytes.fill(0);
    }
  } finally {
    ed25519_sk.fill(0);
    x25519_sk.fill(0);
    mlkem.secretKey.fill(0);
  }
}
