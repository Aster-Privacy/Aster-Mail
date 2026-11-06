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
import type { ResealKeys } from "./reseal_keys";
import type { ResealStep, ResealStepContext } from "./reseal_io";

import {
  decode_b64,
  open_with_any,
  seal_under_new,
  try_open,
} from "./reseal_keys";
import {
  chunk,
  request_with_backoff,
  require_ok,
  step_progress,
} from "./reseal_io";
import { pause_between_batches, send_batch } from "./step_helpers";
import { zero_uint8_array } from "../secure_memory";
import { escrow_aad_v2, escrow_aad_v3 } from "../message_escrow";

export const ESCROW_LIST_PATH = "/crypto/v1/ratchet/plaintexts";
export const ESCROW_UPSERT_PATH = "/crypto/v1/ratchet/plaintext";
export const ESCROW_DELETE_PATH = "/crypto/v1/ratchet/plaintexts/delete";

const ESCROW_PAGE_SIZE = 500;
const ESCROW_WRITES_PER_PAUSE = 25;
const ESCROW_DELETE_BATCH = 500;
const MAX_ESCROW_PAGES = 10_000;
const BOUND_PREFIX = "v3:";

export interface EscrowRow {
  message_id: string;
  encrypted_plaintext: string;
  plaintext_nonce: string;
}

interface EscrowPage {
  entries: EscrowRow[];
  next_cursor?: string | null;
}

export type EscrowOpen =
  | { state: "current" }
  | { state: "stale"; plaintext: Uint8Array; aad: Uint8Array | undefined }
  | { state: "unreadable" };

export function escrow_aad_modes(
  message_id: string,
): (Uint8Array | undefined)[] {
  if (message_id.startsWith(BOUND_PREFIX)) {
    return [escrow_aad_v3(message_id.slice(BOUND_PREFIX.length))];
  }

  return [escrow_aad_v2(message_id), undefined];
}

export async function open_escrow_row(
  keys: ResealKeys,
  row: EscrowRow,
): Promise<EscrowOpen> {
  const ciphertext = decode_b64(row.encrypted_plaintext);
  const nonce = decode_b64(row.plaintext_nonce);

  if (!ciphertext || !nonce) return { state: "unreadable" };

  const modes = escrow_aad_modes(row.message_id);

  for (const aad of modes) {
    const current = await try_open(keys.new_escrow, ciphertext, nonce, aad);

    if (current) {
      zero_uint8_array(current);

      return { state: "current" };
    }
  }
  for (const aad of modes) {
    const stale = await open_with_any(keys.old_escrow, ciphertext, nonce, aad);

    if (stale) return { state: "stale", plaintext: stale, aad };
  }
  if (keys.escrow_fallback && !row.message_id.startsWith(BOUND_PREFIX)) {
    const recovered = await keys.escrow_fallback(ciphertext, nonce);

    if (recovered) {
      return {
        state: "stale",
        plaintext: new Uint8Array(recovered),
        aad: escrow_aad_v2(row.message_id),
      };
    }
  }

  return { state: "unreadable" };
}

async function delete_unreadable(
  ctx: ResealStepContext,
  message_ids: string[],
): Promise<void> {
  if (message_ids.length === 0) return;
  if (!ctx.still_current || !(await ctx.still_current())) return;

  for (const batch of chunk(message_ids, ESCROW_DELETE_BATCH)) {
    const outcome = await send_batch(
      ctx,
      () => ctx.api.post(ESCROW_DELETE_PATH, { message_ids: batch }),
      "escrow_delete",
    );

    if (outcome === "ok") ctx.counts.deleted += batch.length;
  }
}

export const escrow_step: ResealStep = {
  name: "escrow",
  async run(ctx) {
    const progress = step_progress(ctx, "escrow");

    if (progress.done) return "done";

    let cursor = typeof progress.cursor === "string" ? progress.cursor : null;

    for (let page = 0; page < MAX_ESCROW_PAGES; page++) {
      const query = new URLSearchParams({
        paged: "true",
        limit: String(ESCROW_PAGE_SIZE),
      });

      if (cursor) query.set("cursor", cursor);

      const data = require_ok(
        await request_with_backoff(ctx, () =>
          ctx.api.get<EscrowPage>(`${ESCROW_LIST_PATH}?${query.toString()}`),
        ),
        "escrow_list",
      );
      const unreadable: string[] = [];
      let writes = 0;

      for (const row of data.entries ?? []) {
        const opened = await open_escrow_row(ctx.keys, row);

        if (opened.state === "current") {
          ctx.counts.current += 1;
          continue;
        }
        if (opened.state === "unreadable") {
          ctx.counts.unreadable += 1;
          unreadable.push(row.message_id);
          continue;
        }

        try {
          const sealed = await seal_under_new(
            ctx.keys,
            opened.plaintext,
            opened.aad,
            ctx.keys.new_escrow,
          );
          const outcome = await send_batch(
            ctx,
            () =>
              ctx.api.post(ESCROW_UPSERT_PATH, {
                message_id: row.message_id,
                encrypted_plaintext: sealed.ciphertext,
                plaintext_nonce: sealed.nonce,
              }),
            "escrow_upsert",
          );

          if (outcome === "ok") ctx.counts.resealed += 1;
          else ctx.counts.rejected += 1;
        } finally {
          zero_uint8_array(opened.plaintext);
        }

        writes += 1;
        if (writes % ESCROW_WRITES_PER_PAUSE === 0) {
          await pause_between_batches(ctx);
        }
      }

      await delete_unreadable(ctx, unreadable);

      cursor = data.next_cursor ?? null;
      if (!cursor) {
        progress.done = true;
        progress.cursor = null;
        ctx.persist();

        return "done";
      }
      progress.cursor = cursor;
      ctx.persist();
      await pause_between_batches(ctx);
    }

    return "interrupted";
  },
};
