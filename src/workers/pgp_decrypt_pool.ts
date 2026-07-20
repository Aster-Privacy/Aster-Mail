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
import { decrypt_message_with_any_key } from "@/services/crypto/key_manager_pgp";

import type {
  pgp_decrypt_worker_request,
  pgp_decrypt_worker_response,
} from "./pgp_decrypt_worker";

const POOL_SIZE = Math.min(
  Math.max(
    typeof navigator !== "undefined" && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 4,
    2,
  ),
  6,
);

interface pending_request {
  resolve: (plaintext: string) => void;
  reject: (error: Error) => void;
}

let workers: Worker[] | null = null;
let next_worker_index = 0;
let next_request_id = 0;
const pending_requests = new Map<number, pending_request>();
let pool_init_failed = false;

function handle_worker_message(event: MessageEvent<pgp_decrypt_worker_response>): void {
  const { id, plaintext, error } = event.data;
  const pending = pending_requests.get(id);

  if (!pending) return;

  pending_requests.delete(id);

  if (error) {
    pending.reject(new Error(error));
  } else {
    pending.resolve(plaintext ?? "");
  }
}

function get_pool(): Worker[] | null {
  if (pool_init_failed) return null;
  if (workers) return workers;

  if (typeof Worker === "undefined") {
    pool_init_failed = true;

    return null;
  }

  try {
    workers = Array.from({ length: POOL_SIZE }, () => {
      const worker = new Worker(
        new URL("./pgp_decrypt_worker.ts", import.meta.url),
        { type: "module" },
      );

      worker.onmessage = handle_worker_message;
      worker.onerror = () => {};

      return worker;
    });

    return workers;
  } catch {
    pool_init_failed = true;
    workers = null;

    return null;
  }
}

export async function decrypt_pgp_message_parallel(
  ciphertext: string,
  secret_keys: (string | null | undefined)[],
  passphrase: string,
): Promise<string> {
  const pool = get_pool();

  if (!pool || pool.length === 0) {
    return decrypt_message_with_any_key(ciphertext, secret_keys, passphrase);
  }

  const worker = pool[next_worker_index % pool.length];

  next_worker_index++;

  const id = next_request_id++;

  return new Promise<string>((resolve, reject) => {
    pending_requests.set(id, { resolve, reject });

    const request: pgp_decrypt_worker_request = {
      id,
      ciphertext,
      secret_keys,
      passphrase,
    };

    worker.postMessage(request);
  }).catch(async () => {
    return decrypt_message_with_any_key(ciphertext, secret_keys, passphrase);
  });
}
