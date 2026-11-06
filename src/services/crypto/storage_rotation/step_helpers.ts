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
  mark_incomplete,
  request_with_backoff,
  require_ok,
} from "./reseal_io";
import { zero_uint8_array } from "../secure_memory";

export const STORAGE_REKEY_PATH = "/core/v1/auth/me/storage-rekey";
export const USER_REKEY_PATH = "/core/v1/auth/me/rekey";
export const MAIL_TOKENS_PATH = "/core/v1/auth/me/storage-rekey/mail-tokens";
export const MAX_FULL_LIST_PASSES = 3;
export const ID_PAGE_LIMIT = 500;

const MAX_ID_PAGES = 10_000;

export interface IdPageInfo {
  next_cursor?: string | null;
  has_more?: boolean;
}

export type PageWalk = "done" | "unpaged" | "missing";

function is_missing(status: number | undefined): boolean {
  return (
    status !== undefined &&
    status >= 400 &&
    status < 500 &&
    status !== 401 &&
    status !== 403 &&
    status !== 429
  );
}

export async function get_optional<T>(
  ctx: ResealStepContext,
  path: string,
  what: string,
): Promise<T | null> {
  const response = await request_with_backoff(ctx, () => ctx.api.get<T>(path));

  if (!response.error && response.data !== undefined) return response.data;
  if (response.error && is_missing(response.status)) return null;

  throw new ResealInterrupted(`${what}:${response.status ?? "network"}`);
}

export function id_page_path(path: string, cursor: string | null): string {
  const query = new URLSearchParams({
    cursor: cursor ?? "",
    limit: String(ID_PAGE_LIMIT),
  });

  return `${path}${path.includes("?") ? "&" : "?"}${query.toString()}`;
}

export async function walk_id_pages<T extends IdPageInfo>(
  ctx: ResealStepContext,
  path: string,
  what: string,
  start_cursor: string | null,
  visit: (data: T, next_cursor: string | null) => Promise<void>,
  optional = false,
): Promise<PageWalk> {
  let cursor = start_cursor;

  for (let page = 0; page < MAX_ID_PAGES; page++) {
    const target = id_page_path(path, cursor);
    const data = optional
      ? await get_optional<T>(ctx, target, what)
      : require_ok(
          await request_with_backoff(ctx, () => ctx.api.get<T>(target)),
          what,
        );

    if (!data) return "missing";

    const next =
      data.has_more === true && typeof data.next_cursor === "string"
        ? data.next_cursor
        : null;

    if (
      typeof data.has_more !== "boolean" ||
      (data.has_more && !next) ||
      (next !== null && next === cursor)
    ) {
      await visit(data, null);
      mark_incomplete(ctx, what);

      return "unpaged";
    }

    await visit(data, next);
    if (!next) return "done";
    if (ctx.is_cancelled()) throw new ResealInterrupted("cancelled");
    cursor = next;
  }

  throw new ResealInterrupted(`${what}:page_limit`);
}

export async function collect_id_pages<R>(
  ctx: ResealStepContext,
  path: string,
  list_key: string,
  what: string,
  optional = false,
): Promise<R[]> {
  const rows: R[] = [];

  await walk_id_pages<IdPageInfo & Record<string, unknown>>(
    ctx,
    path,
    what,
    null,
    async (data) => {
      const page = data[list_key];

      if (Array.isArray(page)) rows.push(...(page as R[]));
    },
    optional,
  );

  return rows;
}

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
export type ItemOutcome = BatchOutcome | "skipped";

export interface BatchReply {
  outcome: BatchOutcome;
  data: unknown;
}

export async function send_batch(
  ctx: ResealStepContext,
  send: () => Promise<ApiResponse<unknown>>,
  what: string,
): Promise<BatchOutcome> {
  return (await send_batch_reply(ctx, send, what)).outcome;
}

export async function send_batch_reply(
  ctx: ResealStepContext,
  send: () => Promise<ApiResponse<unknown>>,
  what: string,
): Promise<BatchReply> {
  const response = await request_with_backoff(ctx, send);

  if (!response.error) return { outcome: "ok", data: response.data };
  if (is_conflict_response(response)) {
    return { outcome: "conflict", data: response.data };
  }
  if (
    response.status === undefined ||
    response.status === 429 ||
    response.status >= 500 ||
    response.status === 401 ||
    response.status === 403
  ) {
    throw new ResealInterrupted(`${what}:${response.status ?? "network"}`);
  }

  return { outcome: "rejected", data: response.data };
}

export function skipped_ids(data: unknown): Set<string> {
  const out = new Set<string>();

  if (!data || typeof data !== "object") return out;

  const record = data as Record<string, unknown>;
  const add_all = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    for (const id of value) {
      if (typeof id === "string") out.add(id);
    }
  };

  if (record.skipped && typeof record.skipped === "object") {
    Object.values(record.skipped as Record<string, unknown>).forEach(add_all);
  }
  add_all(record.skipped_ids);

  return out;
}

function default_item_id(item: unknown): string | undefined {
  if (!item || typeof item !== "object") return undefined;

  const id = (item as Record<string, unknown>).id;

  return typeof id === "string" ? id : undefined;
}

export async function send_items_splitting<T>(
  ctx: ResealStepContext,
  items: T[],
  send: (batch: T[]) => Promise<ApiResponse<unknown>>,
  what: string,
  on_failed_item?: (item: T, outcome: ItemOutcome) => void,
  id_of: (item: T) => string | undefined = default_item_id,
): Promise<T[]> {
  if (items.length === 0) return [];

  const { outcome, data } = await send_batch_reply(ctx, () => send(items), what);

  if (outcome === "ok") {
    const skipped = skipped_ids(data);
    const written: T[] = [];

    for (const item of items) {
      const id = id_of(item);

      if (id !== undefined && skipped.has(id)) {
        ctx.counts.skipped += 1;
        on_failed_item?.(item, "skipped");
      } else {
        written.push(item);
      }
    }
    ctx.counts.resealed += written.length;

    return written;
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
      ...(await send_items_splitting(
        ctx,
        [item],
        send,
        what,
        on_failed_item,
        id_of,
      )),
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
