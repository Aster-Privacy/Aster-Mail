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
  pgp_decrypt_worker_request,
  pgp_decrypt_worker_response,
} from "./pgp_decrypt_worker";

import type { decrypted_message_result } from "@/services/crypto/key_manager_pgp_messages";

import {
  decrypt_message_verifiable_with_any_key,
  decrypt_message_with_any_key,
  type verifiable_decrypted_message,
} from "@/services/crypto/key_manager_pgp";
import { on_vault_cleared } from "@/services/crypto/memory_key_store";
import {
  get_external_decryption_keys,
  get_external_unlocked_armored_keys,
  is_external_pgp_key_loading,
  settle_external_pgp_key_load,
} from "@/services/crypto/external_pgp_key";

const POOL_SIZE = Math.min(
  Math.max(
    typeof navigator !== "undefined" && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 4,
    2,
  ),
  6,
);

const REQUEST_TIMEOUT_MS = 60_000;

class worker_decrypt_error extends Error {
  constructor(message: string) {
    super(message);
    this.name = "worker_decrypt_error";
  }
}

class worker_reported_error extends Error {
  constructor(name: string, message: string) {
    super(message);
    this.name = name;
  }
}

const MAIN_THREAD_RETRY_ERROR_NAMES = new Set([
  "CryptoModuleLoadError",
  "verify_handle_missing",
]);

class vault_cleared_error extends Error {
  constructor() {
    super("pgp decrypt cancelled because the vault was cleared");
    this.name = "vault_cleared_error";
  }
}

interface pending_request {
  resolve: (response: pgp_decrypt_worker_response) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

let workers: Worker[] | null = null;
let next_worker_index = 0;
let next_request_id = 0;
const pending_requests = new Map<number, pending_request>();
let pool_init_failed = false;

function handle_worker_message(
  event: MessageEvent<pgp_decrypt_worker_response>,
): void {
  const response = event.data;
  const pending = pending_requests.get(response.id);

  if (!pending) return;

  pending_requests.delete(response.id);
  clearTimeout(pending.timer);

  if (response.error_name) {
    pending.reject(
      new worker_reported_error(
        response.error_name,
        response.error_message ?? response.error ?? "",
      ),
    );
  } else if (response.error) {
    pending.reject(new worker_decrypt_error(response.error));
  } else {
    pending.resolve(response);
  }
}

function reject_all_pending(error: Error): void {
  const entries = Array.from(pending_requests.values());

  pending_requests.clear();

  for (const pending of entries) {
    clearTimeout(pending.timer);
    pending.reject(error);
  }
}

function terminate_workers(): void {
  const active = workers;

  workers = null;
  next_worker_index = 0;

  if (!active) return;

  for (const worker of active) {
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    worker.terminate();
  }
}

function shutdown_pool(reason: string): void {
  pool_init_failed = true;
  terminate_workers();
  reject_all_pending(new Error(reason));
}

export function reset_pgp_decrypt_pool(): void {
  terminate_workers();
  reject_all_pending(new vault_cleared_error());
}

let vault_reset_armed = false;

function arm_vault_reset(): void {
  if (vault_reset_armed) return;
  on_vault_cleared(reset_pgp_decrypt_pool);
  vault_reset_armed = true;
}

function handle_worker_failure(event: Event | ErrorEvent | MessageEvent): void {
  const message =
    "message" in event && typeof event.message === "string"
      ? event.message
      : "pgp decrypt worker failed";

  shutdown_pool(message);
}

function fail_request(id: number, reason: string): void {
  const pending = pending_requests.get(id);

  if (!pending) return;

  pending_requests.delete(id);
  clearTimeout(pending.timer);
  pending.reject(new Error(reason));
}

function get_pool(): Worker[] | null {
  if (pool_init_failed) return null;
  if (workers) return workers;

  if (typeof Worker === "undefined") {
    pool_init_failed = true;

    return null;
  }

  try {
    arm_vault_reset();
    workers = Array.from({ length: POOL_SIZE }, () => {
      const worker = new Worker(
        new URL("./pgp_decrypt_worker.ts", import.meta.url),
        { type: "module" },
      );

      worker.onmessage = handle_worker_message;
      worker.onerror = handle_worker_failure;
      worker.onmessageerror = handle_worker_failure;

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
  if (is_external_pgp_key_loading()) await settle_external_pgp_key_load();

  const pool = get_pool();
  const run_in_thread = () =>
    decrypt_message_with_any_key(
      ciphertext,
      secret_keys,
      passphrase,
      get_external_decryption_keys(),
    );

  if (!pool || pool.length === 0) {
    return run_in_thread();
  }

  const unlocked_armored_keys = get_external_unlocked_armored_keys();

  return send_request(pick_worker(pool), (id) => ({
    id,
    ciphertext,
    secret_keys,
    passphrase,
    ...(unlocked_armored_keys.length > 0 ? { unlocked_armored_keys } : {}),
  }))
    .then((response) => response.plaintext ?? "")
    .catch(async (error: unknown) => {
      if (error instanceof worker_decrypt_error) throw error;
      if (error instanceof vault_cleared_error) throw error;

      return run_in_thread();
    });
}

function pick_worker(pool: Worker[]): Worker {
  const worker = pool[next_worker_index % pool.length];

  next_worker_index++;

  return worker;
}

function send_request(
  worker: Worker,
  build: (id: number) => pgp_decrypt_worker_request,
): Promise<pgp_decrypt_worker_response> {
  const id = next_request_id++;

  return new Promise<pgp_decrypt_worker_response>((resolve, reject) => {
    const timer = setTimeout(
      () => fail_request(id, "pgp decrypt worker timed out"),
      REQUEST_TIMEOUT_MS,
    );

    pending_requests.set(id, { resolve, reject, timer });

    try {
      worker.postMessage(build(id));
    } catch (error) {
      fail_request(
        id,
        error instanceof Error ? error.message : "pgp decrypt worker failed",
      );
    }
  });
}

function is_worker_alive(worker: Worker): boolean {
  return workers !== null && workers.includes(worker);
}

function should_throw_worker_error(error: unknown): boolean {
  if (error instanceof vault_cleared_error) return true;
  if (error instanceof worker_decrypt_error) return true;

  return (
    error instanceof worker_reported_error &&
    !MAIN_THREAD_RETRY_ERROR_NAMES.has(error.name)
  );
}

export interface pooled_verifiable_message extends verifiable_decrypted_message {
  release: () => void;
}

function with_release(
  message: verifiable_decrypted_message,
): pooled_verifiable_message {
  return { ...message, release: () => undefined };
}

export async function decrypt_pgp_verifiable_parallel(
  ciphertext: string,
  secret_keys: (string | null | undefined)[],
  passphrase: string,
  use_external_keys: boolean,
): Promise<pooled_verifiable_message> {
  if (use_external_keys && is_external_pgp_key_loading()) {
    await settle_external_pgp_key_load();
  }

  let in_thread: Promise<verifiable_decrypted_message> | null = null;
  const run_in_thread = () => {
    if (!in_thread) {
      in_thread = decrypt_message_verifiable_with_any_key(
        ciphertext,
        secret_keys,
        passphrase,
        use_external_keys ? get_external_decryption_keys() : [],
      );
    }

    return in_thread;
  };

  const pool = get_pool();

  if (!pool || pool.length === 0) return with_release(await run_in_thread());

  const unlocked_armored_keys = use_external_keys
    ? get_external_unlocked_armored_keys()
    : [];
  const worker = pick_worker(pool);

  let response: pgp_decrypt_worker_response;

  try {
    response = await send_request(worker, (id) => ({
      id,
      kind: "verifiable",
      ciphertext,
      secret_keys,
      passphrase,
      ...(unlocked_armored_keys.length > 0 ? { unlocked_armored_keys } : {}),
    }));
  } catch (error) {
    if (should_throw_worker_error(error)) throw error;

    return with_release(await run_in_thread());
  }

  const handle = response.handle ?? -1;
  let released = false;

  const release = () => {
    if (released) return;
    released = true;
    if (!is_worker_alive(worker)) return;
    void send_request(worker, (id) => ({ id, kind: "release", handle })).catch(
      () => undefined,
    );
  };

  const verify = async (
    verification_keys: string[],
  ): Promise<decrypted_message_result> => {
    if (!released && is_worker_alive(worker)) {
      try {
        const result = await send_request(worker, (id) => ({
          id,
          kind: "verify",
          handle,
          verification_keys,
        }));

        return {
          plaintext: response.plaintext ?? "",
          verification: result.verification ?? "unknown",
          has_signature: result.has_signature ?? false,
        };
      } catch (error) {
        if (error instanceof vault_cleared_error) throw error;
        if (
          error instanceof worker_reported_error &&
          !MAIN_THREAD_RETRY_ERROR_NAMES.has(error.name)
        ) {
          throw error;
        }
      }
    }

    return (await run_in_thread()).verify(verification_keys);
  };

  return {
    plaintext: response.plaintext ?? "",
    verification: response.verification ?? "unknown",
    has_signature: response.has_signature ?? false,
    verify,
    release,
  };
}
