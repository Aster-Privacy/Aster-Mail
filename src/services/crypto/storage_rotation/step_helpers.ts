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
import type { ApiResponse } from "@/services/api/client";
import type { ResealKeys, SealedValue } from "./reseal_keys";
import type { ResealStepContext } from "./reseal_io";

import {
  open_under_old,
  opens_under_new,
  seal_under_new,
} from "./reseal_keys";
import {
  BATCH_PAUSE_MS,
  ResealInterrupted,
  is_conflict_response,
  request_with_backoff,
} from "./reseal_io";
import { zero_uint8_array } from "../secure_memory";

export const STORAGE_REKEY_PATH = "/core/v1/auth/me/storage-rekey";
export const USER_REKEY_PATH = "/core/v1/auth/me/rekey";
export const MAIL_TOKENS_PATH = "/core/v1/auth/me/storage-rekey/mail-tokens";
export const MAX_FULL_LIST_PASSES = 3;

export type SealedState =
  | { state: "current" }
  | { state: "stale"; plaintext: Uint8Array }
  | { state: "unreadable" };

export async function classify_sealed(
  keys: ResealKeys,
  ciphertext: string | null | undefined,
  nonce: string | null | undefined,
): Promise<SealedState> {
  if (await opens_under_new(keys, ciphertext, nonce)) {
    return { state: "current" };
  }

  const plaintext = await open_under_old(keys, ciphertext, nonce);

  return plaintext ? { state: "stale", plaintext } : { state: "unreadable" };
}

export async function reseal_field(
  keys: ResealKeys,
  ciphertext: string | null | undefined,
  nonce: string | null | undefined,
): Promise<SealedValue | "current" | "unreadable" | "absent"> {
  if (!ciphertext || !nonce) return "absent";

  const sealed = await classify_sealed(keys, ciphertext, nonce);

  if (sealed.state !== "stale") return sealed.state;

  try {
    return await seal_under_new(keys, sealed.plaintext);
  } finally {
    zero_uint8_array(sealed.plaintext);
  }
}

export function decode_text(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function parse_json_object(
  bytes: Uint8Array,
): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(decode_text(bytes));

    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function text_field(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];

  return typeof value === "string" ? value : undefined;
}

export async function pause_between_batches(
  ctx: ResealStepContext,
): Promise<void> {
  await ctx.sleep(BATCH_PAUSE_MS);
  if (ctx.is_cancelled()) throw new ResealInterrupted("cancelled");
}

export type BatchOutcome = "ok" | "conflict" | "rejected";

export async function send_batch(
  ctx: ResealStepContext,
  send: () => Promise<ApiResponse<unknown>>,
  what: string,
): Promise<BatchOutcome> {
  const response = await request_with_backoff(ctx, send);

  if (!response.error) return "ok";
  if (is_conflict_response(response)) return "conflict";
  if (
    response.status === undefined ||
    response.status === 429 ||
    response.status >= 500 ||
    response.status === 401 ||
    response.status === 403
  ) {
    throw new ResealInterrupted(`${what}:${response.status ?? "network"}`);
  }

  return "rejected";
}

export async function send_items_splitting<T>(
  ctx: ResealStepContext,
  items: T[],
  send: (batch: T[]) => Promise<ApiResponse<unknown>>,
  what: string,
  on_failed_item?: (item: T, outcome: BatchOutcome) => void,
): Promise<T[]> {
  if (items.length === 0) return [];

  const outcome = await send_batch(ctx, () => send(items), what);

  if (outcome === "ok") {
    ctx.counts.resealed += items.length;

    return items;
  }

  if (items.length === 1) {
    if (outcome === "conflict") ctx.counts.conflicts += 1;
    else ctx.counts.rejected += 1;
    on_failed_item?.(items[0], outcome);

    return [];
  }

  const written: T[] = [];

  for (const item of items) {
    written.push(
      ...(await send_items_splitting(ctx, [item], send, what, on_failed_item)),
    );
  }

  return written;
}

export function post_storage_rekey<T>(
  ctx: ResealStepContext,
  category: string,
  items: T[],
): Promise<T[]> {
  return send_items_splitting(
    ctx,
    items,
    (batch) => ctx.api.post(STORAGE_REKEY_PATH, { [category]: batch }),
    `storage_rekey:${category}`,
  );
}
