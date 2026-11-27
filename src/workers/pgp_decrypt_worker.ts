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
import { user_facing_error } from "@/utils/user_facing_error";
import "@/services/crypto/openpgp_limits";
import type { PrivateKey } from "openpgp";

import type { sender_verification_status } from "@/services/crypto/key_manager_pgp_messages";

import {
  decrypt_message_verifiable_with_any_key,
  decrypt_message_with_any_key,
  type verifiable_decrypted_message,
} from "@/services/crypto/key_manager_pgp";
import { load_openpgp } from "@/services/crypto/openpgp_loader";

export type pgp_decrypt_worker_request =
  | {
      id: number;
      kind?: "decrypt";
      ciphertext: string;
      secret_keys: (string | null | undefined)[];
      passphrase: string;
      unlocked_armored_keys?: string[];
    }
  | {
      id: number;
      kind: "verifiable";
      ciphertext: string;
      secret_keys: (string | null | undefined)[];
      passphrase: string;
      unlocked_armored_keys?: string[];
    }
  | {
      id: number;
      kind: "verify";
      handle: number;
      verification_keys: string[];
    }
  | {
      id: number;
      kind: "release";
      handle: number;
    };

export interface pgp_decrypt_worker_response {
  id: number;
  plaintext?: string;
  verification?: sender_verification_status;
  has_signature?: boolean;
  handle?: number;
  error?: string;
  error_name?: string;
  error_message?: string;
}

const VERIFIABLE_HANDLE_LIMIT = 64;
const verifiable_handles = new Map<number, verifiable_decrypted_message>();
let next_handle = 0;

function store_verifiable(message: verifiable_decrypted_message): number {
  const handle = next_handle++;

  verifiable_handles.set(handle, message);

  while (verifiable_handles.size > VERIFIABLE_HANDLE_LIMIT) {
    const oldest = verifiable_handles.keys().next();

    if (oldest.done) break;
    verifiable_handles.delete(oldest.value);
  }

  return handle;
}

function describe_error(error: unknown): {
  error_name: string;
  error_message: string;
} {
  if (error instanceof Error) {
    return { error_name: error.name, error_message: error.message };
  }

  return { error_name: "Error", error_message: String(error) };
}

const UNLOCKED_KEY_CACHE_LIMIT = 4;
const unlocked_key_cache = new Map<string, Promise<PrivateKey>>();

function read_unlocked_key(armored: string): Promise<PrivateKey> {
  const cached = unlocked_key_cache.get(armored);

  if (cached) return cached;

  const parsed = load_openpgp().then((openpgp) =>
    openpgp.readPrivateKey({ armoredKey: armored }),
  );

  parsed.catch(() => unlocked_key_cache.delete(armored));

  if (unlocked_key_cache.size >= UNLOCKED_KEY_CACHE_LIMIT) {
    unlocked_key_cache.clear();
  }

  unlocked_key_cache.set(armored, parsed);

  return parsed;
}

async function read_unlocked_keys(
  armored_keys: string[],
): Promise<PrivateKey[]> {
  const keys = await Promise.all(
    armored_keys.map((armored) => read_unlocked_key(armored).catch(() => null)),
  );

  return keys.filter((key): key is PrivateKey => key !== null);
}

function post(response: pgp_decrypt_worker_response): void {
  (self as unknown as Worker).postMessage(response);
}

async function handle_request(
  request: pgp_decrypt_worker_request,
): Promise<void> {
  const { id } = request;

  if (request.kind === "release") {
    verifiable_handles.delete(request.handle);
    post({ id });

    return;
  }

  if (request.kind === "verify") {
    const message = verifiable_handles.get(request.handle);

    if (!message) {
      post({
        id,
        error: "verify_handle_missing",
        error_name: "verify_handle_missing",
      });

      return;
    }

    try {
      const result = await message.verify(request.verification_keys);

      post({
        id,
        verification: result.verification,
        has_signature: result.has_signature,
      });
    } catch (error) {
      post({ id, error: "verify_failed", ...describe_error(error) });
    }

    return;
  }

  const unlocked_keys = request.unlocked_armored_keys?.length
    ? await read_unlocked_keys(request.unlocked_armored_keys)
    : [];

  if (request.kind === "verifiable") {
    try {
      const message = await decrypt_message_verifiable_with_any_key(
        request.ciphertext,
        request.secret_keys,
        request.passphrase,
        unlocked_keys,
      );

      post({
        id,
        plaintext: message.plaintext,
        verification: message.verification,
        has_signature: message.has_signature,
        handle: store_verifiable(message),
      });
    } catch (error) {
      post({
        id,
        error: user_facing_error(error, "decrypt_failed"),
        ...describe_error(error),
      });
    }

    return;
  }

  try {
    const plaintext = await decrypt_message_with_any_key(
      request.ciphertext,
      request.secret_keys,
      request.passphrase,
      unlocked_keys,
    );

    post({ id, plaintext });
  } catch (error) {
    post({ id, error: user_facing_error(error, "decrypt_failed") });
  }
}

self.onmessage = async (event: MessageEvent<pgp_decrypt_worker_request>) => {
  if (event.origin !== "" && event.origin !== self.location.origin) {
    return;
  }

  try {
    await handle_request(event.data);
  } catch (error) {
    post({
      id: event.data.id,
      error: user_facing_error(error, "decrypt_failed"),
      ...describe_error(error),
    });
  }
};
