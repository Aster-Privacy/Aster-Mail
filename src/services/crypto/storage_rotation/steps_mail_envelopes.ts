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
import { mark_legacy_unverified_plaintext } from "../sent_encryption_evidence";

import {
  decode_b64,
  open_with_any,
  seal_under_new,
  try_open,
} from "./reseal_keys";
import {
  ResealInterrupted,
  incomplete_count,
  is_conflict_response,
  mark_incomplete,
  request_with_backoff,
  require_ok,
  step_progress,
} from "./reseal_io";
import { pause_between_batches } from "./step_helpers";

export const MAIL_ENVELOPES_PATH = "/mail/v1/messages/encrypted";
export const MAIL_ENVELOPE_ITEM_PATH = "/mail/v1/messages";
export const MAIL_ENVELOPE_ITEM_TYPES = ["sent", "draft"] as const;
export const MAIL_ENVELOPE_PAGE_LIMIT = 50;

const STORAGE_ENVELOPE_NONCE_LENGTH = 12;
const MAX_ENVELOPE_PAGES = 10_000;

type EnvelopeItemType = (typeof MAIL_ENVELOPE_ITEM_TYPES)[number];

interface MailEnvelopeRow {
  id: string;
  encrypted_envelope?: string | null;
  envelope_nonce?: string | null;
}

interface MailEnvelopePage {
  items?: MailEnvelopeRow[];
  next_cursor?: string | null;
  has_more?: boolean;
}

interface MailEnvelopeWrite {
  updated_count?: number;
}

function envelope_page_path(
  item_type: EnvelopeItemType,
  cursor: string | null,
): string {
  const query = new URLSearchParams({
    item_type,
    limit: String(MAIL_ENVELOPE_PAGE_LIMIT),
  });

  if (cursor) query.set("cursor", cursor);

  return `${MAIL_ENVELOPES_PATH}?${query.toString()}`;
}

async function sha256_hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));

  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

async function write_envelope(
  ctx: ResealStepContext,
  row: MailEnvelopeRow,
  ciphertext: Uint8Array,
  plaintext: Uint8Array,
): Promise<void> {
  const sealed = await seal_under_new(ctx.keys, plaintext);
  const expected_envelope_sha256 = await sha256_hex(ciphertext);
  const response = await request_with_backoff(ctx, () =>
    ctx.api.put<MailEnvelopeWrite>(
      `${MAIL_ENVELOPE_ITEM_PATH}/${encodeURIComponent(row.id)}`,
      {
        encrypted_envelope: sealed.ciphertext,
        envelope_nonce: sealed.nonce,
        expected_envelope_sha256,
      },
    ),
  );

  if (!response.error) {
    if (response.data?.updated_count === 0) {
      ctx.counts.skipped += 1;
    } else {
      ctx.counts.resealed += 1;
    }

    return;
  }
  if (response.status === 404) {
    ctx.counts.skipped += 1;

    return;
  }
  if (is_conflict_response(response)) {
    ctx.counts.conflicts += 1;
    mark_incomplete(ctx, "mail_envelopes_changed");

    return;
  }
  if (response.status === 400 || response.status === 422) {
    ctx.counts.rejected += 1;
    mark_incomplete(ctx, "mail_envelopes_rejected");

    return;
  }

  throw new ResealInterrupted(
    `mail_envelopes_write:${response.status ?? "network"}`,
  );
}

interface OpenedEnvelope {
  row: MailEnvelopeRow;
  ciphertext: Uint8Array;
  plaintext: Uint8Array;
}

async function open_envelope(
  ctx: ResealStepContext,
  row: MailEnvelopeRow,
): Promise<OpenedEnvelope | null> {
  const nonce = decode_b64(row.envelope_nonce);

  if (!nonce || nonce.length !== STORAGE_ENVELOPE_NONCE_LENGTH) return null;

  const ciphertext = decode_b64(row.encrypted_envelope);

  if (!ciphertext || ciphertext.length === 0) return null;

  const current = await try_open(ctx.keys.new_aes, ciphertext, nonce);

  if (current) {
    zero_uint8_array(current);
    ctx.counts.current += 1;

    return null;
  }

  const trusted = await open_with_any(ctx.keys.old_aes, ciphertext, nonce);

  if (trusted) return { row, ciphertext, plaintext: trusted };

  const untrusted = await open_with_any(
    ctx.keys.untrusted_envelope,
    ciphertext,
    nonce,
  );
  const plaintext = untrusted
    ? mark_legacy_unverified_plaintext(untrusted)
    : null;

  if (untrusted) zero_uint8_array(untrusted);
  if (!plaintext) {
    ctx.counts.unreadable += 1;

    return null;
  }

  return { row, ciphertext, plaintext };
}

async function reseal_page(
  ctx: ResealStepContext,
  rows: MailEnvelopeRow[],
): Promise<void> {
  const opened: OpenedEnvelope[] = [];

  try {
    for (const row of rows) {
      if (typeof row?.id !== "string") continue;

      const envelope = await open_envelope(ctx, row);

      if (envelope) opened.push(envelope);
    }
    if (opened.length === 0) return;
    if (ctx.still_current && !(await ctx.still_current())) {
      throw new ResealInterrupted("mail_envelopes:superseded");
    }
    for (const envelope of opened) {
      await write_envelope(
        ctx,
        envelope.row,
        envelope.ciphertext,
        envelope.plaintext,
      );
    }
  } finally {
    opened.forEach((envelope) => zero_uint8_array(envelope.plaintext));
  }
}

async function walk_item_type(
  ctx: ResealStepContext,
  item_type: EnvelopeItemType,
): Promise<void> {
  const progress = step_progress(ctx, `mail_envelopes:${item_type}`);

  if (progress.done) return;

  let cursor = typeof progress.cursor === "string" ? progress.cursor : null;

  for (let page = 0; page < MAX_ENVELOPE_PAGES; page++) {
    const target = envelope_page_path(item_type, cursor);
    const data = require_ok(
      await request_with_backoff(ctx, () =>
        ctx.api.get<MailEnvelopePage>(target),
      ),
      `mail_envelopes_list:${item_type}`,
    );

    await reseal_page(ctx, data.items ?? []);

    const next =
      data.has_more === true && typeof data.next_cursor === "string"
        ? data.next_cursor
        : null;

    if (data.has_more === true && (next === null || next === cursor)) {
      mark_incomplete(ctx, `mail_envelopes_list:${item_type}`);

      return;
    }
    if (!next) {
      progress.done = true;
      progress.cursor = null;
      ctx.persist();

      return;
    }

    cursor = next;
    progress.cursor = next;
    ctx.persist();
    await pause_between_batches(ctx);
  }

  throw new ResealInterrupted(`mail_envelopes_list:${item_type}:page_limit`);
}

export const mail_envelopes_step: ResealStep = {
  name: "mail_envelopes",
  async run(ctx) {
    const before = incomplete_count(ctx);

    for (const item_type of MAIL_ENVELOPE_ITEM_TYPES) {
      await walk_item_type(ctx, item_type);
    }

    if (incomplete_count(ctx) > before) {
      for (const item_type of MAIL_ENVELOPE_ITEM_TYPES) {
        const progress = step_progress(ctx, `mail_envelopes:${item_type}`);

        progress.done = false;
        progress.cursor = null;
      }
      ctx.persist();

      return "incomplete";
    }

    return "done";
  },
};
