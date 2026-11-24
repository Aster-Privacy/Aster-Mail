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
export interface DecryptReadiness {
  keys_settled: boolean;
  key_epoch: number;
  transient_epoch: number;
}

export type DecryptFailureKind = "failed" | "pending";

type RetryListener = (ids: ReadonlySet<string>) => void;

const RETRY_BACKOFF_MS = [400, 2000, 6000, 15000, 30000, 60000];

const TRANSIENT_ERROR_NAMES = new Set([
  "AbortError",
  "TimeoutError",
  "NetworkError",
  "EscrowUnavailableError",
  "vault_cleared_error",
]);

const NETWORK_ERROR_PATTERN =
  /failed to fetch|networkerror|network error|load failed|network request failed|timed out|timeout/i;

const ANONYMOUS_PENDING_ID = "";

let keys_settled_probe: (() => boolean) | null = null;
let key_epoch = 0;
let transient_epoch = 0;
let backoff_step = 0;
let retry_timer: ReturnType<typeof setTimeout> | null = null;
const pending_ids = new Set<string>();
const retry_listeners = new Set<RetryListener>();

export function register_keys_settled_probe(probe: () => boolean): void {
  keys_settled_probe = probe;
}

function are_keys_settled(): boolean {
  if (!keys_settled_probe) return true;

  try {
    return keys_settled_probe();
  } catch {
    return false;
  }
}

export function capture_decrypt_readiness(): DecryptReadiness {
  return {
    keys_settled: are_keys_settled(),
    key_epoch,
    transient_epoch,
  };
}

export function note_transient_failure(): void {
  transient_epoch += 1;
}

export function note_decrypt_key_change(): void {
  key_epoch += 1;
  backoff_step = 0;
  cancel_retry_timer();
  if (pending_ids.size > 0 && are_keys_settled()) schedule_retry(0);
}

export function is_definitive_failure(
  before: DecryptReadiness,
  after: DecryptReadiness = capture_decrypt_readiness(),
): boolean {
  return (
    before.keys_settled &&
    after.keys_settled &&
    before.key_epoch === after.key_epoch &&
    before.transient_epoch === after.transient_epoch
  );
}

export function is_transient_decrypt_error(caught: unknown): boolean {
  if (!caught || typeof caught !== "object") return false;

  const { name, message } = caught as { name?: unknown; message?: unknown };

  if (typeof name === "string" && TRANSIENT_ERROR_NAMES.has(name)) return true;

  return (
    name === "TypeError" &&
    typeof message === "string" &&
    NETWORK_ERROR_PATTERN.test(message)
  );
}

export function note_if_transient_error(caught: unknown): void {
  if (is_transient_decrypt_error(caught)) note_transient_failure();
}

export function settle_decrypt_failure(
  id: string | undefined,
  before: DecryptReadiness,
  caught?: unknown,
): DecryptFailureKind {
  if (caught !== undefined) note_if_transient_error(caught);

  const after = capture_decrypt_readiness();
  const pending_id = id ?? ANONYMOUS_PENDING_ID;

  if (is_definitive_failure(before, after)) {
    pending_ids.delete(pending_id);
    settle_retry_state();

    return "failed";
  }

  pending_ids.add(pending_id);
  if (after.keys_settled) schedule_backoff_retry();

  return "pending";
}

export function settle_decrypt_success(id: string | undefined): void {
  pending_ids.delete(id ?? ANONYMOUS_PENDING_ID);
  settle_retry_state();
}

export function is_decrypt_pending(id: string | undefined): boolean {
  return pending_ids.has(id ?? ANONYMOUS_PENDING_ID);
}

export function on_pending_decrypt_retry(listener: RetryListener): () => void {
  retry_listeners.add(listener);

  return () => {
    retry_listeners.delete(listener);
  };
}

function settle_retry_state(): void {
  if (pending_ids.size > 0) return;
  backoff_step = 0;
  cancel_retry_timer();
}

function cancel_retry_timer(): void {
  if (retry_timer === null) return;
  clearTimeout(retry_timer);
  retry_timer = null;
}

function schedule_backoff_retry(): void {
  if (retry_timer !== null) return;

  const delay =
    RETRY_BACKOFF_MS[Math.min(backoff_step, RETRY_BACKOFF_MS.length - 1)];

  backoff_step += 1;
  schedule_retry(delay);
}

function schedule_retry(delay: number): void {
  if (retry_timer !== null) return;
  retry_timer = setTimeout(emit_retry, delay);
}

function emit_retry(): void {
  retry_timer = null;
  if (pending_ids.size === 0) return;

  const ids: ReadonlySet<string> = new Set(pending_ids);

  pending_ids.clear();
  retry_listeners.forEach((listener) => {
    try {
      listener(ids);
    } catch {
      return;
    }
  });
}
