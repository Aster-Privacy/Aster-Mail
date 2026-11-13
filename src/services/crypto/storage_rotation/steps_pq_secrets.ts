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

import { zero_uint8_array } from "../secure_memory";

import {
  decode_b64,
  open_with_any,
  seal_under_new,
  try_open,
} from "./reseal_keys";
import {
  mark_incomplete,
  request_with_backoff,
  require_ok,
  step_progress,
} from "./reseal_io";
import { get_optional, pause_between_batches } from "./step_helpers";

export const PQ_SECRET_IDS_PATH = "/crypto/v1/ratchet/pq-secret/ids";
export const PQ_SECRET_BULK_PATH = "/crypto/v1/ratchet/pq-secret/bulk";
export const PQ_SECRET_BATCH_SIZE = 200;

const STEP_NAME = "pq_secrets";

interface PqSecretRow {
  encrypted_secret?: string | null;
  secret_nonce?: string | null;
}

interface PqSecretUpload {
  key_id: number;
  encrypted_secret: string;
  secret_nonce: string;
}

type PqSecretState = PqSecretUpload | "current" | "unreadable" | "missing";

export function pq_secret_path(key_id: number): string {
  return `/crypto/v1/ratchet/pq-secret/${key_id}`;
}

function parse_key_ids(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((id) => Number.isSafeInteger(id) && id >= 0)) return null;

  return [...new Set(value as number[])];
}

async function reseal_pq_secret(
  ctx: ResealStepContext,
  key_id: number,
): Promise<PqSecretState> {
  const response = await request_with_backoff(ctx, () =>
    ctx.api.get<PqSecretRow>(pq_secret_path(key_id)),
  );

  if (response.status === 404 || response.code === "NOT_FOUND") {
    return "missing";
  }

  const row = require_ok(response, STEP_NAME);
  const ciphertext = decode_b64(row.encrypted_secret);
  const nonce = decode_b64(row.secret_nonce);

  if (!ciphertext || !nonce) return "unreadable";

  const current = await try_open(ctx.keys.new_ratchet, ciphertext, nonce);

  if (current) {
    zero_uint8_array(current);

    return "current";
  }

  const opened = await open_with_any(ctx.keys.old_ratchet, ciphertext, nonce);

  if (!opened) return "unreadable";

  try {
    const sealed = await seal_under_new(
      ctx.keys,
      opened,
      undefined,
      ctx.keys.new_ratchet,
    );

    return {
      key_id,
      encrypted_secret: sealed.ciphertext,
      secret_nonce: sealed.nonce,
    };
  } finally {
    zero_uint8_array(opened);
  }
}

async function upload_batch(
  ctx: ResealStepContext,
  secrets: PqSecretUpload[],
): Promise<void> {
  if (secrets.length === 0) return;

  require_ok(
    await request_with_backoff(ctx, () =>
      ctx.api.post(PQ_SECRET_BULK_PATH, { secrets }),
    ),
    STEP_NAME,
  );
  ctx.counts.resealed += secrets.length;
  await pause_between_batches(ctx);
}

export const pq_secrets_step: ResealStep = {
  name: STEP_NAME,
  async run(ctx) {
    const progress = step_progress(ctx, STEP_NAME);

    if (progress.done) return "done";

    const listing = await get_optional<{ key_ids?: unknown }>(
      ctx,
      PQ_SECRET_IDS_PATH,
      STEP_NAME,
    );

    if (listing) {
      const key_ids = parse_key_ids(listing.key_ids);

      if (!key_ids) {
        mark_incomplete(ctx, STEP_NAME);

        return "incomplete";
      }

      let batch: PqSecretUpload[] = [];

      for (const key_id of key_ids) {
        const state = await reseal_pq_secret(ctx, key_id);

        if (state === "current") ctx.counts.current += 1;
        else if (state === "unreadable") ctx.counts.unreadable += 1;
        else if (state === "missing") ctx.counts.skipped += 1;
        else batch.push(state);

        if (batch.length >= PQ_SECRET_BATCH_SIZE) {
          await upload_batch(ctx, batch);
          batch = [];
        }
      }
      await upload_batch(ctx, batch);
    }

    progress.done = true;
    ctx.persist();

    return "done";
  },
};
