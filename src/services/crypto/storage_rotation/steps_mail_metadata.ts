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
import type { ResealStep, ResealStepContext } from "./reseal_io";

import { decode_b64, open_with_any, seal_under_new, try_open } from "./reseal_keys";
import {
  chunk,
  incomplete_count,
  mark_incomplete,
  step_progress,
} from "./reseal_io";
import {
  pause_between_batches,
  send_items_splitting,
  walk_id_pages,
} from "./step_helpers";
import { zero_uint8_array } from "../secure_memory";

export const MAIL_METADATA_PATH = "/core/v1/auth/me/storage-rekey/mail-metadata";
export const MAIL_METADATA_CONTEXT = "mail-item-metadata";

const MAIL_METADATA_BATCH_SIZE = 250;

export interface MailMetadataRow {
  id: string;
  encrypted_metadata?: string | null;
  metadata_nonce?: string | null;
  metadata_version?: number | null;
  metadata_hash?: string | null;
}

interface MailMetadataPage {
  items?: MailMetadataRow[];
  next_cursor?: string | null;
  has_more?: boolean;
}

interface MailMetadataItem {
  id: string;
  encrypted_metadata: string;
  metadata_nonce: string;
  expected_hash: string;
}

async function build_metadata_item(
  ctx: ResealStepContext,
  row: MailMetadataRow,
): Promise<MailMetadataItem | null> {
  const ciphertext = decode_b64(row.encrypted_metadata);
  const nonce = decode_b64(row.metadata_nonce);

  if (!ciphertext || !nonce || !row.metadata_hash) {
    if (row.encrypted_metadata) ctx.counts.unreadable += 1;

    return null;
  }

  const new_key = await ctx.keys.metadata_key(MAIL_METADATA_CONTEXT);
  const current = await try_open(new_key, ciphertext, nonce);

  if (current) {
    zero_uint8_array(current);
    ctx.counts.current += 1;

    return null;
  }

  const candidates = [
    ...(await ctx.keys.old_metadata_keys(MAIL_METADATA_CONTEXT)),
    ...ctx.keys.old_aes,
  ];
  const plaintext = await open_with_any(candidates, ciphertext, nonce);

  if (!plaintext) {
    ctx.counts.unreadable += 1;

    return null;
  }

  try {
    const sealed = await seal_under_new(ctx.keys, plaintext, undefined, new_key);

    return {
      id: row.id,
      encrypted_metadata: sealed.ciphertext,
      metadata_nonce: sealed.nonce,
      expected_hash: row.metadata_hash,
    };
  } finally {
    zero_uint8_array(plaintext);
  }
}

export const mail_metadata_step: ResealStep = {
  name: "mail_metadata",
  async run(ctx) {
    const progress = step_progress(ctx, "mail_metadata");

    if (progress.done) return "done";

    const before = incomplete_count(ctx);
    const start = typeof progress.cursor === "string" ? progress.cursor : null;

    const walk = await walk_id_pages<MailMetadataPage>(
      ctx,
      MAIL_METADATA_PATH,
      "mail_metadata_list",
      start,
      async (page, next_cursor) => {
        const items: MailMetadataItem[] = [];

        for (const row of page.items ?? []) {
          const item = await build_metadata_item(ctx, row);

          if (item) items.push(item);
        }
        for (const batch of chunk(items, MAIL_METADATA_BATCH_SIZE)) {
          await send_items_splitting(
            ctx,
            batch,
            (entries) => ctx.api.post(MAIL_METADATA_PATH, { items: entries }),
            "storage_rekey:mail_metadata",
          );
          await pause_between_batches(ctx);
        }
        if (next_cursor) {
          progress.cursor = next_cursor;
          ctx.persist();
        }
      },
      true,
    );

    if (walk === "missing") mark_incomplete(ctx, "mail_metadata_list");
    if (incomplete_count(ctx) > before) {
      progress.cursor = null;
      ctx.persist();

      return "incomplete";
    }
    progress.done = true;
    progress.cursor = null;
    ctx.persist();

    return "done";
  },
};
