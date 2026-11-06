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
import type { SealedValue } from "./reseal_keys";
import type { HashMove, ResealStep, ResealStepContext } from "./reseal_io";

import {
  decode_b64,
  seal_under_new,
  sign_under_new,
  try_open,
} from "./reseal_keys";
import {
  ResealInterrupted,
  chunk,
  request_with_backoff,
  require_ok,
  step_progress,
} from "./reseal_io";
import {
  MAIL_TOKENS_PATH,
  USER_REKEY_PATH,
  classify_sealed,
  decode_text,
  pause_between_batches,
  reseal_field,
  send_items_splitting,
} from "./step_helpers";
import { zero_uint8_array } from "../secure_memory";

export const ALIAS_HMAC_INFO = "astermail-alias-hmac-v1";
export const DOMAIN_ADDRESS_HMAC_INFO = "astermail-domain-address-hmac-v1";

const ALIAS_PAGE_SIZE = 1000;
const ALIAS_MAX_PAGES = 100;
const ADDRESS_BATCH_SIZE = 25;
const MAX_MAIL_TOKEN_PAGES = 10_000;

interface AliasRow {
  id: string;
  encrypted_local_part: string;
  local_part_nonce: string;
  encrypted_display_name?: string | null;
  display_name_nonce?: string | null;
  encrypted_note?: string | null;
  note_nonce?: string | null;
  encrypted_websites?: string | null;
  websites_nonce?: string | null;
  alias_address_hash: string;
  domain: string;
  is_random: boolean;
  is_retained_primary?: boolean;
}

interface DomainRow {
  id: string;
  domain_name: string;
}

interface DomainAddressRow {
  id: string;
  encrypted_local_part: string;
  local_part_nonce: string;
  local_part_hash?: string | null;
  encrypted_display_name?: string | null;
  display_name_nonce?: string | null;
  encrypted_note?: string | null;
  note_nonce?: string | null;
}

interface MailTokenResponse {
  next_cursor?: string | null;
  done?: boolean;
}

interface AddressEntry {
  item: Record<string, unknown>;
  move: HashMove | null;
}

interface FieldPlan {
  send: SealedValue | null;
  changed: boolean;
}

interface OpenedLocalPart {
  local_part: string;
  sealed: SealedValue;
  changed: boolean;
}

export function normalize_address(local_part: string): string {
  return local_part.toLowerCase().replace(/\./g, "");
}

async function plan_optional_field(
  ctx: ResealStepContext,
  ciphertext: string | null | undefined,
  nonce: string | null | undefined,
): Promise<FieldPlan> {
  if (!ciphertext || !nonce) return { send: null, changed: false };

  const result = await reseal_field(ctx.keys, ciphertext, nonce);

  if (result === "absent") return { send: null, changed: false };
  if (result === "current" || result === "unreadable") {
    if (result === "unreadable") ctx.counts.unreadable += 1;

    return { send: { ciphertext, nonce }, changed: false };
  }

  return { send: result, changed: true };
}

function same_hash(a: string | null | undefined, b: string): boolean {
  const left = decode_b64(a);
  const right = decode_b64(b);

  if (!left || !right || left.length !== right.length) return false;

  let diff = 0;

  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];

  return diff === 0;
}

async function open_local_part(
  ctx: ResealStepContext,
  ciphertext: string,
  nonce: string,
): Promise<OpenedLocalPart | null> {
  const ct = decode_b64(ciphertext);
  const iv = decode_b64(nonce);

  if (ct && iv) {
    const current = await try_open(ctx.keys.new_aes, ct, iv);

    if (current) {
      const local_part = decode_text(current);

      zero_uint8_array(current);

      return { local_part, sealed: { ciphertext, nonce }, changed: false };
    }
  }

  const sealed = await classify_sealed(ctx.keys, ciphertext, nonce);

  if (sealed.state !== "stale") {
    ctx.counts.unreadable += 1;

    return null;
  }

  try {
    return {
      local_part: decode_text(sealed.plaintext),
      sealed: await seal_under_new(ctx.keys, sealed.plaintext),
      changed: true,
    };
  } finally {
    zero_uint8_array(sealed.plaintext);
  }
}

async function build_alias_entry(
  ctx: ResealStepContext,
  alias: AliasRow,
): Promise<AddressEntry | null> {
  let opened: OpenedLocalPart | null;

  if (alias.is_random) {
    const raw = decode_b64(alias.encrypted_local_part);

    opened = raw
      ? {
          local_part: decode_text(raw),
          sealed: {
            ciphertext: alias.encrypted_local_part,
            nonce: alias.local_part_nonce,
          },
          changed: false,
        }
      : null;
    if (!opened) ctx.counts.unreadable += 1;
  } else {
    opened = await open_local_part(
      ctx,
      alias.encrypted_local_part,
      alias.local_part_nonce,
    );
  }

  if (!opened) return null;

  const display = await plan_optional_field(
    ctx,
    alias.encrypted_display_name,
    alias.display_name_nonce,
  );
  const note = await plan_optional_field(
    ctx,
    alias.encrypted_note,
    alias.note_nonce,
  );
  const websites = await plan_optional_field(
    ctx,
    alias.encrypted_websites,
    alias.websites_nonce,
  );
  const new_hash = alias.is_retained_primary
    ? alias.alias_address_hash
    : await sign_under_new(
        ctx.keys,
        ALIAS_HMAC_INFO,
        `${normalize_address(opened.local_part)}@${alias.domain}`,
      );
  const hash_changed = !same_hash(alias.alias_address_hash, new_hash);

  if (
    !opened.changed &&
    !display.changed &&
    !note.changed &&
    !websites.changed &&
    !hash_changed
  ) {
    ctx.counts.current += 1;

    return null;
  }

  const item: Record<string, unknown> = {
    id: alias.id,
    encrypted_local_part: opened.sealed.ciphertext,
    local_part_nonce: opened.sealed.nonce,
    alias_address_hash: new_hash,
  };

  if (display.changed && display.send) {
    item.encrypted_display_name = display.send.ciphertext;
    item.display_name_nonce = display.send.nonce;
  }
  if (note.changed && note.send) {
    item.encrypted_note = note.send.ciphertext;
    item.note_nonce = note.send.nonce;
  }
  if (websites.changed && websites.send) {
    item.encrypted_websites = websites.send.ciphertext;
    item.websites_nonce = websites.send.nonce;
  }

  return {
    item,
    move: hash_changed
      ? { from_hash: alias.alias_address_hash, to_hash: new_hash, cursor: null }
      : null,
  };
}

async function build_domain_address_entry(
  ctx: ResealStepContext,
  address: DomainAddressRow,
  domain_name: string,
): Promise<AddressEntry | null> {
  const opened = await open_local_part(
    ctx,
    address.encrypted_local_part,
    address.local_part_nonce,
  );

  if (!opened) return null;

  const display = await plan_optional_field(
    ctx,
    address.encrypted_display_name,
    address.display_name_nonce,
  );
  const note = await plan_optional_field(
    ctx,
    address.encrypted_note,
    address.note_nonce,
  );
  const new_hash = await sign_under_new(
    ctx.keys,
    DOMAIN_ADDRESS_HMAC_INFO,
    `${normalize_address(opened.local_part)}@${domain_name.toLowerCase()}`,
  );
  const hash_changed = !same_hash(address.local_part_hash, new_hash);

  if (!opened.changed && !display.changed && !note.changed && !hash_changed) {
    ctx.counts.current += 1;

    return null;
  }

  const item: Record<string, unknown> = {
    id: address.id,
    encrypted_local_part: opened.sealed.ciphertext,
    local_part_nonce: opened.sealed.nonce,
    local_part_hash: new_hash,
  };

  if (display.send) {
    item.encrypted_display_name = display.send.ciphertext;
    item.display_name_nonce = display.send.nonce;
  }
  if (note.changed && note.send) {
    item.encrypted_note = note.send.ciphertext;
    item.note_nonce = note.send.nonce;
  }

  return {
    item,
    move:
      hash_changed && address.local_part_hash
        ? {
            from_hash: address.local_part_hash,
            to_hash: new_hash,
            cursor: null,
          }
        : null,
  };
}

function same_move(a: HashMove, b: HashMove): boolean {
  return a.from_hash === b.from_hash && a.to_hash === b.to_hash;
}

function drop_move(ctx: ResealStepContext, move: HashMove): void {
  ctx.progress.hash_moves = ctx.progress.hash_moves.filter(
    (entry) => !same_move(entry, move),
  );
  ctx.persist();
}

function is_permanent_rejection(status: number | undefined): boolean {
  return (
    status !== undefined &&
    status >= 400 &&
    status < 500 &&
    status !== 401 &&
    status !== 403 &&
    status !== 429
  );
}

export async function drain_hash_moves(ctx: ResealStepContext): Promise<void> {
  while (ctx.progress.hash_moves.length > 0) {
    const move = ctx.progress.hash_moves[0];
    let finished = false;

    for (let page = 0; page < MAX_MAIL_TOKEN_PAGES; page++) {
      const response = await request_with_backoff(ctx, () =>
        ctx.api.post<MailTokenResponse>(MAIL_TOKENS_PATH, {
          from_hash: move.from_hash,
          to_hash: move.to_hash,
          ...(move.cursor ? { cursor: move.cursor } : {}),
        }),
      );

      if (response.error) {
        if (is_permanent_rejection(response.status)) {
          finished = true;
          break;
        }
        throw new ResealInterrupted(
          `mail_tokens:${response.status ?? "network"}`,
        );
      }

      const data = response.data ?? {};

      if (data.done || !data.next_cursor) {
        finished = true;
        break;
      }
      move.cursor = data.next_cursor;
      ctx.persist();
      await pause_between_batches(ctx);
    }

    if (!finished) throw new ResealInterrupted("mail_tokens:page_limit");
    drop_move(ctx, move);
  }
}

async function send_address_entries(
  ctx: ResealStepContext,
  entries: AddressEntry[],
  field: "re_encrypted_aliases" | "re_encrypted_domain_addresses",
): Promise<void> {
  for (const batch of chunk(entries, ADDRESS_BATCH_SIZE)) {
    for (const entry of batch) {
      if (
        entry.move &&
        !ctx.progress.hash_moves.some((move) => same_move(move, entry.move!))
      ) {
        ctx.progress.hash_moves.push(entry.move);
      }
    }
    ctx.persist();

    await send_items_splitting(
      ctx,
      batch,
      (items) =>
        ctx.api.post(USER_REKEY_PATH, {
          [field]: items.map((entry) => entry.item),
        }),
      `rekey:${field}`,
      (entry) => {
        if (entry.move) drop_move(ctx, entry.move);
      },
    );
    await drain_hash_moves(ctx);
    await pause_between_batches(ctx);
  }
}

async function list_all_aliases(ctx: ResealStepContext): Promise<AliasRow[]> {
  const seen = new Map<string, AliasRow>();

  for (let page = 0; page < ALIAS_MAX_PAGES; page++) {
    const data = require_ok(
      await request_with_backoff(ctx, () =>
        ctx.api.get<{ aliases: AliasRow[]; has_more?: boolean }>(
          `/addresses/v1/aliases?limit=${ALIAS_PAGE_SIZE}&offset=${page * ALIAS_PAGE_SIZE}`,
        ),
      ),
      "aliases_list",
    );
    const rows = data.aliases ?? [];

    for (const row of rows) seen.set(row.id, row);
    if (!data.has_more || rows.length < ALIAS_PAGE_SIZE) break;
  }

  return [...seen.values()];
}

export const aliases_step: ResealStep = {
  name: "aliases",
  async run(ctx) {
    const progress = step_progress(ctx, "aliases");

    await drain_hash_moves(ctx);
    if (progress.done) return "done";

    const entries: AddressEntry[] = [];

    for (const alias of await list_all_aliases(ctx)) {
      const entry = await build_alias_entry(ctx, alias);

      if (entry) entries.push(entry);
    }
    await send_address_entries(ctx, entries, "re_encrypted_aliases");

    progress.done = true;
    ctx.persist();

    return "done";
  },
};

export const domain_addresses_step: ResealStep = {
  name: "domain_addresses",
  async run(ctx) {
    const progress = step_progress(ctx, "domain_addresses");

    await drain_hash_moves(ctx);
    if (progress.done) return "done";

    const domains = require_ok(
      await request_with_backoff(ctx, () =>
        ctx.api.get<{ domains: DomainRow[] }>("/addresses/v1/domains"),
      ),
      "domains_list",
    );

    for (const domain of domains.domains ?? []) {
      const data = require_ok(
        await request_with_backoff(ctx, () =>
          ctx.api.get<{ addresses: DomainAddressRow[] }>(
            `/addresses/v1/domains/${encodeURIComponent(domain.id)}/addresses`,
          ),
        ),
        "domain_addresses_list",
      );
      const entries: AddressEntry[] = [];

      for (const address of data.addresses ?? []) {
        const entry = await build_domain_address_entry(
          ctx,
          address,
          domain.domain_name,
        );

        if (entry) entries.push(entry);
      }
      await send_address_entries(
        ctx,
        entries,
        "re_encrypted_domain_addresses",
      );
    }

    progress.done = true;
    ctx.persist();

    return "done";
  },
};
