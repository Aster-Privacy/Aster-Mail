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
import type { ResealStep, ResealStepContext } from "./reseal_io";
import type { ContactPage, SenderRow } from "./steps_lists";

import { array_to_base64 } from "../base64";
import {
  decode_ratchet_state_container,
  ratchet_state_bound_aad,
} from "../ratchet_state_container";
import { zero_uint8_array } from "../secure_memory";

import {
  decode_b64,
  open_with_any,
  seal_under_new,
  sign_under_new,
  try_open,
} from "./reseal_keys";
import {
  ResealInterrupted,
  incomplete_count,
  request_with_backoff,
  require_ok,
  step_progress,
} from "./reseal_io";
import {
  classify_sealed,
  collect_id_pages,
  decode_text,
  get_optional,
  parse_json_object,
  pause_between_batches,
  post_storage_rekey,
  reseal_field,
  send_batch,
  send_items_splitting,
  STORAGE_REKEY_PATH,
  text_field,
} from "./step_helpers";
import { list_all_aliases, list_ghost_alias_ids } from "./steps_addresses";
import { list_recent_recipients } from "./steps_lists";

export const PROFILE_NOTES_HMAC_INFO = "profile-notes-hmac-v1";
export const RATCHET_STATES_PATH = "/crypto/v1/ratchet/states";
export const PROFILE_NOTES_PATH = "/settings/v1/profile_notes/all";
export const SYNC_SOURCES_PATH = "/contacts/v1/sync/sources";
export const DELETED_DIRECTORIES_PATH =
  "/addresses/v1/aliases/directories/deleted";

const PROFILE_NOTES_INTEGRITY_SUFFIX = "profile-notes-v1";
const SEALED_BATCH_SIZE = 100;
const PROFILE_NOTE_BATCH_SIZE = 100;
const RATCHET_BATCH_SIZE = 20;
const ATTACHMENT_BATCH_SIZE = 4;
const MAX_BATCH_CHARS = 4 * 1024 * 1024;
const CONTACT_PAGE_SIZE = 100;
const ALLOWED_PAGE_SIZE = 500;
const MAX_PAGES_PER_RUN = 1000;

type ResealResult = SealedValue | "current" | "unreadable" | "absent";

interface SealedItem {
  id: string;
  ciphertext: string;
  nonce: string;
}

interface RatchetRow {
  id: string;
  conversation_id: string;
  encrypted_state: string;
  state_nonce: string;
  state_version: number;
}

interface RatchetConflict {
  id: string;
  state_version: number;
}

interface RatchetOpened {
  plaintext: Uint8Array;
  bound: boolean;
  derived: boolean;
}

interface ProfileNoteRow {
  id: string;
  email_token: string;
  encrypted_note: string;
  note_nonce: string;
  integrity_hash?: string | null;
}

interface PinRow {
  id: string;
  encrypted_sender?: string | null;
  sender_nonce?: string | null;
}

interface AliasContactRow {
  id: string;
  encrypted_contact?: string | null;
  contact_nonce?: string | null;
}

interface DestinationRow {
  id: string;
  encrypted_destination?: string | null;
  destination_nonce?: string | null;
}

interface DirectoryRow {
  id: string;
  encrypted_label?: string | null;
  label_nonce?: string | null;
}

interface FieldDefinitionRow {
  id: string;
  encrypted_name?: string | null;
  name_nonce?: string | null;
}

interface FieldValueRow {
  id: string;
  field_definition_id: string;
  encrypted_value: string;
  value_nonce: string;
}

interface AttachmentListRow {
  id: string;
  encrypted_meta: string;
  meta_nonce: string;
}

interface AttachmentRow extends AttachmentListRow {
  encrypted_data: string;
  data_nonce: string;
}

interface PhotoRow {
  encrypted_data: string;
  data_nonce: string;
  encrypted_meta: string;
  meta_nonce: string;
  size_bytes: number;
}

interface SignatureRow {
  id: string;
  encrypted_name?: string | null;
  name_nonce?: string | null;
  encrypted_content?: string | null;
  content_nonce?: string | null;
}

interface TemplateRow extends SignatureRow {
  encrypted_category?: string | null;
  category_nonce?: string | null;
}

interface SyncSourceRow {
  id: string;
  source_type: string;
  encrypted_config: string;
  config_nonce: string;
}

interface AddressOwner {
  key: string;
  base: string;
}

interface SealedPair {
  ciphertext_field: string;
  nonce_field: string;
}

function finish_step(
  ctx: ResealStepContext,
  progress: { done?: boolean; cursor?: string | number | null },
  incomplete_before: number,
): "done" | "incomplete" {
  if (incomplete_count(ctx) > incomplete_before) {
    progress.cursor = null;
    ctx.persist();

    return "incomplete";
  }
  progress.done = true;
  progress.cursor = null;
  ctx.persist();

  return "done";
}

function is_sealed(result: ResealResult): result is SealedValue {
  return typeof result === "object";
}

function tally_untouched(
  ctx: ResealStepContext,
  results: ResealResult[],
): void {
  if (results.includes("unreadable")) ctx.counts.unreadable += 1;
  else if (!results.some(is_sealed)) ctx.counts.current += 1;
}

function chunk_by_chars<T>(
  items: T[],
  max_items: number,
  size: (item: T) => number,
): T[][] {
  const out: T[][] = [];
  let current: T[] = [];
  let chars = 0;

  for (const item of items) {
    const item_chars = size(item);

    if (
      current.length > 0 &&
      (current.length >= max_items || chars + item_chars > MAX_BATCH_CHARS)
    ) {
      out.push(current);
      current = [];
      chars = 0;
    }
    current.push(item);
    chars += item_chars;
  }
  if (current.length > 0) out.push(current);

  return out;
}

async function sealed_item(
  ctx: ResealStepContext,
  id: string,
  ciphertext: string | null | undefined,
  nonce: string | null | undefined,
): Promise<SealedItem | null> {
  const result = await reseal_field(ctx.keys, ciphertext, nonce);

  if (!is_sealed(result)) {
    if (result !== "absent") tally_untouched(ctx, [result]);

    return null;
  }

  return { id, ciphertext: result.ciphertext, nonce: result.nonce };
}

async function post_sealed_items(
  ctx: ResealStepContext,
  category: string,
  items: SealedItem[],
): Promise<void> {
  for (let i = 0; i < items.length; i += SEALED_BATCH_SIZE) {
    await post_storage_rekey(
      ctx,
      category,
      items.slice(i, i + SEALED_BATCH_SIZE),
    );
    await pause_between_batches(ctx);
  }
}

async function write_if_unchanged(
  ctx: ResealStepContext,
  still_same: () => Promise<boolean>,
  send: () => Promise<ApiResponse<unknown>>,
  what: string,
): Promise<void> {
  if (!(await still_same())) {
    ctx.counts.conflicts += 1;

    return;
  }

  const outcome = await send_batch(ctx, send, what);

  if (outcome === "ok") ctx.counts.resealed += 1;
  else if (outcome === "conflict") ctx.counts.conflicts += 1;
  else ctx.counts.rejected += 1;
}

async function open_new_or_old(
  keys: ResealKeys,
  ciphertext: string | null | undefined,
  nonce: string | null | undefined,
): Promise<Uint8Array | null> {
  const ct = decode_b64(ciphertext);
  const iv = decode_b64(nonce);

  if (!ct || !iv) return null;

  return (
    (await try_open(keys.new_aes, ct, iv)) ??
    (await open_with_any(keys.old_aes, ct, iv))
  );
}

function conversation_text(value: string): string | null {
  const bytes = decode_b64(value);

  if (!bytes) return null;

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

async function open_ratchet_under_old(
  keys: ResealKeys,
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  bound_aad: Uint8Array,
): Promise<RatchetOpened | null> {
  const bound = await open_with_any(
    keys.old_ratchet,
    ciphertext,
    nonce,
    bound_aad,
  );

  if (bound) return { plaintext: bound, bound: true, derived: false };

  const legacy = await open_with_any(keys.old_aes, ciphertext, nonce);

  if (legacy) return { plaintext: legacy, bound: false, derived: false };

  const derived = await open_with_any(keys.old_ratchet, ciphertext, nonce);

  return derived ? { plaintext: derived, bound: false, derived: true } : null;
}

function ratchet_state_accepted(
  opened: RatchetOpened,
  conversation_id: string,
): boolean {
  const text = decode_text(opened.plaintext);
  const decoded = opened.derived
    ? decode_ratchet_state_container(
        text,
        conversation_id,
        0,
        false,
        true,
        false,
      )
    : decode_ratchet_state_container(text, conversation_id, 0, opened.bound);

  return decoded.kind === "accepted";
}

async function build_ratchet_item(
  ctx: ResealStepContext,
  row: RatchetRow,
): Promise<Record<string, unknown> | null> {
  const conversation_id = conversation_text(row.conversation_id);
  const ciphertext = decode_b64(row.encrypted_state);
  const nonce = decode_b64(row.state_nonce);

  if (!conversation_id || !ciphertext || !nonce) {
    ctx.counts.unreadable += 1;

    return null;
  }

  const bound_aad = ratchet_state_bound_aad(conversation_id);

  for (const aad of [bound_aad, undefined]) {
    const current = await try_open(
      ctx.keys.new_ratchet,
      ciphertext,
      nonce,
      aad,
    );

    if (current) {
      zero_uint8_array(current);
      ctx.counts.current += 1;

      return null;
    }
  }

  const opened = await open_ratchet_under_old(
    ctx.keys,
    ciphertext,
    nonce,
    bound_aad,
  );

  if (!opened) {
    ctx.counts.unreadable += 1;

    return null;
  }

  try {
    if (!ratchet_state_accepted(opened, conversation_id)) {
      ctx.counts.unreadable += 1;

      return null;
    }

    const sealed = await seal_under_new(
      ctx.keys,
      opened.plaintext,
      opened.bound ? bound_aad : undefined,
      ctx.keys.new_ratchet,
    );

    return {
      id: row.id,
      encrypted_state: sealed.ciphertext,
      state_nonce: sealed.nonce,
      expected_version: row.state_version,
    };
  } finally {
    zero_uint8_array(opened.plaintext);
  }
}

function ratchet_conflicts_of(data: unknown): RatchetConflict[] {
  if (!data || typeof data !== "object") return [];

  const list = (data as Record<string, unknown>).ratchet_conflicts;

  if (!Array.isArray(list)) return [];

  return list.filter(
    (entry): entry is RatchetConflict =>
      !!entry &&
      typeof entry === "object" &&
      typeof (entry as RatchetConflict).id === "string" &&
      typeof (entry as RatchetConflict).state_version === "number",
  );
}

async function list_ratchet_rows(ctx: ResealStepContext): Promise<RatchetRow[]> {
  const rows = require_ok(
    await request_with_backoff(ctx, () =>
      ctx.api.get<RatchetRow[]>(RATCHET_STATES_PATH),
    ),
    "ratchet_states_list",
  );

  return Array.isArray(rows) ? rows : [];
}

async function post_ratchet_items(
  ctx: ResealStepContext,
  items: Record<string, unknown>[],
): Promise<RatchetConflict[]> {
  const conflicts: RatchetConflict[] = [];

  for (const batch of chunk_by_chars(
    items,
    RATCHET_BATCH_SIZE,
    (item) => String(item.encrypted_state).length,
  )) {
    await send_items_splitting(
      ctx,
      batch,
      async (entries) => {
        const response = await ctx.api.post(STORAGE_REKEY_PATH, {
          ratchet_states: entries,
        });

        if (!response.error) {
          conflicts.push(...ratchet_conflicts_of(response.data));
        }

        return response;
      },
      "storage_rekey:ratchet_states",
    );
    await pause_between_batches(ctx);
  }

  return conflicts;
}

async function retry_ratchet_conflicts(
  ctx: ResealStepContext,
  conflicts: RatchetConflict[],
): Promise<void> {
  if (conflicts.length === 0) return;

  const wanted = new Map(conflicts.map((entry) => [entry.id, entry]));
  const retry: Record<string, unknown>[] = [];

  ctx.counts.skipped -= wanted.size;
  for (const row of await list_ratchet_rows(ctx)) {
    const conflict = wanted.get(row.id);

    if (!conflict) continue;
    wanted.delete(row.id);
    if (row.state_version !== conflict.state_version) {
      ctx.counts.conflicts += 1;
      continue;
    }

    const item = await build_ratchet_item(ctx, row);

    if (item) retry.push(item);
  }
  ctx.counts.skipped += wanted.size;
  if (retry.length === 0) return;

  const again = await post_ratchet_items(ctx, retry);

  ctx.counts.skipped -= again.length;
  ctx.counts.conflicts += again.length;
}

export const ratchet_states_step: ResealStep = {
  name: "ratchet_states",
  async run(ctx) {
    const progress = step_progress(ctx, "ratchet_states");

    if (progress.done) return "done";

    const items: Record<string, unknown>[] = [];

    for (const row of await list_ratchet_rows(ctx)) {
      const item = await build_ratchet_item(ctx, row);

      if (item) items.push(item);
    }
    await retry_ratchet_conflicts(ctx, await post_ratchet_items(ctx, items));

    progress.done = true;
    ctx.persist();

    return "done";
  },
};

async function each_contact_page(
  ctx: ResealStepContext,
  start_cursor: string | null,
  visit: (page: ContactPage, next_cursor: string | null) => Promise<void>,
): Promise<boolean> {
  let cursor = start_cursor;

  for (let page = 0; page < MAX_PAGES_PER_RUN; page++) {
    const query = new URLSearchParams({ limit: String(CONTACT_PAGE_SIZE) });

    if (cursor) query.set("cursor", cursor);

    const data = require_ok(
      await request_with_backoff(ctx, () =>
        ctx.api.get<ContactPage>(`/contacts/v1?${query.toString()}`),
      ),
      "contacts_list",
    );
    const next = data.has_more && data.next_cursor ? data.next_cursor : null;

    await visit(data, next);
    if (!next) return true;
    cursor = next;
  }

  return false;
}

async function collect_candidate_emails(
  ctx: ResealStepContext,
): Promise<Set<string>> {
  const emails = new Set<string>();
  const add = (value: unknown): void => {
    if (typeof value === "string" && value.trim()) {
      emails.add(value.toLowerCase().trim());
    }
  };
  const add_sender = async (row: SenderRow): Promise<void> => {
    const plain = await open_new_or_old(
      ctx.keys,
      row.encrypted_sender_data,
      row.sender_data_nonce,
    );

    if (!plain) return;
    try {
      const record = parse_json_object(plain);

      if (record) add(text_field(record, "email"));
    } finally {
      zero_uint8_array(plain);
    }
  };

  await each_contact_page(ctx, null, async (page) => {
    for (const row of page.items ?? []) {
      const plain = await open_new_or_old(
        ctx.keys,
        row.encrypted_data,
        row.data_nonce,
      );

      if (!plain) continue;
      try {
        const record = parse_json_object(plain);

        if (record && Array.isArray(record.emails)) record.emails.forEach(add);
      } finally {
        zero_uint8_array(plain);
      }
    }
  });

  const blocked = await get_optional<{ blocked_senders: SenderRow[] }>(
    ctx,
    "/contacts/v1/blocked_senders",
    "blocked_list",
  );

  for (const row of blocked?.blocked_senders ?? []) await add_sender(row);

  for (let page = 0; page < MAX_PAGES_PER_RUN; page++) {
    const allowed = await get_optional<{ allowed_senders: SenderRow[] }>(
      ctx,
      `/contacts/v1/allowed_senders?limit=${ALLOWED_PAGE_SIZE}&offset=${page * ALLOWED_PAGE_SIZE}`,
      "allowed_list",
    );
    const rows = allowed?.allowed_senders ?? [];

    for (const row of rows) await add_sender(row);
    if (rows.length < ALLOWED_PAGE_SIZE) break;
  }

  for (const row of await list_recent_recipients(ctx)) {
    const plain = await open_new_or_old(
      ctx.keys,
      row.encrypted_email,
      row.email_nonce,
    );

    if (!plain) continue;
    add(decode_text(plain));
    zero_uint8_array(plain);
  }

  return emails;
}

async function hmac_b64(key: CryptoKey, value: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );

  return array_to_base64(new Uint8Array(signature));
}

async function profile_note_tokens(
  ctx: ResealStepContext,
): Promise<Map<string, string>> {
  const tokens = new Map<string, string>();
  const new_key = await ctx.keys.hmac(PROFILE_NOTES_HMAC_INFO);
  const old_keys = await ctx.keys.old_hmacs(PROFILE_NOTES_HMAC_INFO);

  for (const email of await collect_candidate_emails(ctx)) {
    const new_token = await hmac_b64(new_key, email);

    tokens.set(new_token, new_token);
    for (const old_key of old_keys) {
      const old_token = await hmac_b64(old_key, email);

      if (!tokens.has(old_token)) tokens.set(old_token, new_token);
    }
  }

  return tokens;
}

async function build_profile_note_item(
  ctx: ResealStepContext,
  row: ProfileNoteRow,
  tokens: Map<string, string>,
): Promise<Record<string, unknown> | null> {
  const body = await reseal_field(ctx.keys, row.encrypted_note, row.note_nonce);
  const email_token = tokens.get(row.email_token) ?? row.email_token;
  const token_changed = email_token !== row.email_token;

  if (body === "unreadable" || body === "absent") {
    ctx.counts.unreadable += 1;

    return null;
  }
  if (body === "current" && !token_changed) {
    ctx.counts.current += 1;

    return null;
  }

  const sealed =
    body === "current"
      ? { ciphertext: row.encrypted_note, nonce: row.note_nonce }
      : body;

  return {
    id: row.id,
    email_token,
    encrypted_note: sealed.ciphertext,
    note_nonce: sealed.nonce,
    integrity_hash: await sign_under_new(
      ctx.keys,
      PROFILE_NOTES_HMAC_INFO,
      `${sealed.ciphertext}:${sealed.nonce}:${PROFILE_NOTES_INTEGRITY_SUFFIX}`,
    ),
  };
}

export const profile_notes_step: ResealStep = {
  name: "profile_notes",
  async run(ctx) {
    const progress = step_progress(ctx, "profile_notes");

    if (progress.done) return "done";

    const before = incomplete_count(ctx);
    const notes = await collect_id_pages<ProfileNoteRow>(
      ctx,
      PROFILE_NOTES_PATH,
      "notes",
      "profile_notes_list",
    );

    if (notes.length > 0) {
      const tokens = await profile_note_tokens(ctx);
      const originals = new Map(
        notes.map((note) => [note.id, note.email_token]),
      );
      const items: Record<string, unknown>[] = [];
      const retry: Record<string, unknown>[] = [];

      for (const note of notes) {
        const item = await build_profile_note_item(ctx, note, tokens);

        if (item) items.push(item);
      }
      for (let i = 0; i < items.length; i += PROFILE_NOTE_BATCH_SIZE) {
        await send_items_splitting(
          ctx,
          items.slice(i, i + PROFILE_NOTE_BATCH_SIZE),
          (batch) => ctx.api.post(STORAGE_REKEY_PATH, { profile_notes: batch }),
          "storage_rekey:profile_notes",
          (item, outcome) => {
            const original = originals.get(String(item.id));

            if (
              outcome === "conflict" &&
              original &&
              original !== item.email_token
            ) {
              ctx.counts.conflicts -= 1;
              retry.push({ ...item, email_token: original });
            }
          },
        );
        await pause_between_batches(ctx);
      }
      if (retry.length > 0) {
        await post_storage_rekey(ctx, "profile_notes", retry);
      }
    }

    return finish_step(ctx, progress, before);
  },
};

async function list_address_owners(
  ctx: ResealStepContext,
): Promise<AddressOwner[]> {
  const owners = new Map<string, AddressOwner>();
  const add = (kind: string, id: string, base: string): void => {
    owners.set(`${kind}:${id}`, { key: `${kind}:${id}`, base });
  };

  for (const alias of await list_all_aliases(ctx)) {
    add("a", alias.id, `/addresses/v1/aliases/${encodeURIComponent(alias.id)}`);
  }
  for (const id of await list_ghost_alias_ids(ctx)) {
    if (owners.has(`a:${id}`)) continue;
    add("g", id, `/addresses/v1/aliases/${encodeURIComponent(id)}`);
  }

  const domains = require_ok(
    await request_with_backoff(ctx, () =>
      ctx.api.get<{ domains: { id: string }[] }>("/addresses/v1/domains"),
    ),
    "domains_list",
  );

  for (const domain of domains.domains ?? []) {
    const data = require_ok(
      await request_with_backoff(ctx, () =>
        ctx.api.get<{ addresses: { id: string }[] }>(
          `/addresses/v1/domains/${encodeURIComponent(domain.id)}/addresses`,
        ),
      ),
      "domain_addresses_list",
    );

    for (const address of data.addresses ?? []) {
      add(
        "d",
        address.id,
        `/addresses/v1/aliases/domain-addresses/${encodeURIComponent(address.id)}`,
      );
    }
  }

  return [...owners.values()].sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
  );
}

async function reseal_owner_items(
  ctx: ResealStepContext,
  owner: AddressOwner,
): Promise<void> {
  const pins = await get_optional<{ pins: PinRow[] }>(
    ctx,
    `${owner.base}/pins`,
    "alias_pins_list",
  );
  const contacts = await collect_id_pages<AliasContactRow>(
    ctx,
    `${owner.base}/contacts`,
    "contacts",
    "alias_contacts_list",
    true,
  );
  const destinations = await get_optional<{ destinations: DestinationRow[] }>(
    ctx,
    `${owner.base}/destinations`,
    "alias_destinations_list",
  );
  const pin_items: SealedItem[] = [];
  const contact_items: SealedItem[] = [];
  const destination_items: SealedItem[] = [];

  for (const row of pins?.pins ?? []) {
    const item = await sealed_item(
      ctx,
      row.id,
      row.encrypted_sender,
      row.sender_nonce,
    );

    if (item) pin_items.push(item);
  }
  for (const row of contacts) {
    const item = await sealed_item(
      ctx,
      row.id,
      row.encrypted_contact,
      row.contact_nonce,
    );

    if (item) contact_items.push(item);
  }
  for (const row of destinations?.destinations ?? []) {
    const item = await sealed_item(
      ctx,
      row.id,
      row.encrypted_destination,
      row.destination_nonce,
    );

    if (item) destination_items.push(item);
  }

  await post_sealed_items(ctx, "alias_pins", pin_items);
  await post_sealed_items(ctx, "alias_contacts", contact_items);
  await post_sealed_items(ctx, "alias_destinations", destination_items);
}

export const alias_items_step: ResealStep = {
  name: "alias_items",
  async run(ctx) {
    const progress = step_progress(ctx, "alias_items");

    if (progress.done) return "done";

    const before = incomplete_count(ctx);
    const after = typeof progress.cursor === "string" ? progress.cursor : null;

    for (const owner of await list_address_owners(ctx)) {
      if (after && owner.key <= after) continue;
      await reseal_owner_items(ctx, owner);
      progress.cursor = owner.key;
      ctx.persist();
      if (ctx.is_cancelled()) throw new ResealInterrupted("cancelled");
    }

    return finish_step(ctx, progress, before);
  },
};

async function list_rows<T>(
  ctx: ResealStepContext,
  path: string,
  list_key: string,
  what: string,
  paged: boolean,
): Promise<T[]> {
  if (paged) return collect_id_pages<T>(ctx, path, list_key, what, true);

  const data = await get_optional<Record<string, T[]>>(ctx, path, what);
  const rows = data?.[list_key];

  return Array.isArray(rows) ? rows : [];
}

function sealed_list_step<T extends { id: string }>(
  name: string,
  path: string,
  list_key: string,
  ciphertext_field: keyof T,
  nonce_field: keyof T,
  paged = false,
): ResealStep {
  return {
    name,
    async run(ctx) {
      const progress = step_progress(ctx, name);

      if (progress.done) return "done";

      const before = incomplete_count(ctx);
      const rows = await list_rows<T>(
        ctx,
        path,
        list_key,
        `${name}_list`,
        paged,
      );
      const items: SealedItem[] = [];

      for (const row of rows) {
        const ciphertext = row[ciphertext_field];
        const nonce = row[nonce_field];
        const item = await sealed_item(
          ctx,
          row.id,
          typeof ciphertext === "string" ? ciphertext : null,
          typeof nonce === "string" ? nonce : null,
        );

        if (item) items.push(item);
      }
      await post_sealed_items(ctx, name, items);

      return finish_step(ctx, progress, before);
    },
  };
}

export const alias_directories_step = sealed_list_step<DirectoryRow>(
  "alias_directories",
  "/addresses/v1/aliases/directories",
  "directories",
  "encrypted_label",
  "label_nonce",
);

export const deleted_alias_directories_step = sealed_list_step<DirectoryRow>(
  "deleted_alias_directories",
  DELETED_DIRECTORIES_PATH,
  "directories",
  "encrypted_label",
  "label_nonce",
  true,
);

export const contact_field_definitions_step =
  sealed_list_step<FieldDefinitionRow>(
    "contact_field_definitions",
    "/contacts/v1/fields",
    "items",
    "encrypted_name",
    "name_nonce",
  );

async function reseal_field_values(
  ctx: ResealStepContext,
  contact_id: string,
): Promise<void> {
  const path = `/contacts/v1/${encodeURIComponent(contact_id)}/fields`;
  const data = await get_optional<{ items: FieldValueRow[] }>(
    ctx,
    path,
    "contact_field_values_list",
  );
  const stale: { row: FieldValueRow; sealed: SealedValue }[] = [];

  for (const row of data?.items ?? []) {
    const result = await reseal_field(
      ctx.keys,
      row.encrypted_value,
      row.value_nonce,
    );

    if (is_sealed(result)) stale.push({ row, sealed: result });
    else if (result !== "absent") tally_untouched(ctx, [result]);
  }
  if (stale.length === 0) return;

  const fresh = await get_optional<{ items: FieldValueRow[] }>(
    ctx,
    path,
    "contact_field_values_list",
  );
  const latest = new Map(
    (fresh?.items ?? []).map((row) => [row.id, row.encrypted_value]),
  );

  for (const { row, sealed } of stale) {
    await write_if_unchanged(
      ctx,
      async () => latest.get(row.id) === row.encrypted_value,
      () =>
        ctx.api.put(
          `${path}/${encodeURIComponent(row.field_definition_id)}`,
          {
            encrypted_value: sealed.ciphertext,
            value_nonce: sealed.nonce,
          },
        ),
      "contact_field_value",
    );
  }
  await pause_between_batches(ctx);
}

async function reseal_contact_attachments(
  ctx: ResealStepContext,
  contact_id: string,
): Promise<void> {
  const base = `/contacts/v1/${encodeURIComponent(contact_id)}/attachments`;
  const list = await get_optional<{ items: AttachmentListRow[] }>(
    ctx,
    base,
    "contact_attachments_list",
  );
  const items: Record<string, unknown>[] = [];

  for (const entry of list?.items ?? []) {
    const meta_state = await classify_sealed(
      ctx.keys,
      entry.encrypted_meta,
      entry.meta_nonce,
    );

    if (meta_state.state === "current") {
      ctx.counts.current += 1;
      continue;
    }
    if (meta_state.state === "stale") zero_uint8_array(meta_state.plaintext);

    const row = await get_optional<AttachmentRow>(
      ctx,
      `${base}/${encodeURIComponent(entry.id)}`,
      "contact_attachment_get",
    );

    if (!row) continue;

    const data = await reseal_field(
      ctx.keys,
      row.encrypted_data,
      row.data_nonce,
    );
    const meta = await reseal_field(
      ctx.keys,
      row.encrypted_meta,
      row.meta_nonce,
    );

    tally_untouched(ctx, [data, meta]);
    if (!is_sealed(data) && !is_sealed(meta)) continue;
    items.push({
      id: row.id,
      encrypted_data: is_sealed(data) ? data.ciphertext : row.encrypted_data,
      data_nonce: is_sealed(data) ? data.nonce : row.data_nonce,
      encrypted_meta: is_sealed(meta) ? meta.ciphertext : row.encrypted_meta,
      meta_nonce: is_sealed(meta) ? meta.nonce : row.meta_nonce,
    });
  }

  for (const batch of chunk_by_chars(
    items,
    ATTACHMENT_BATCH_SIZE,
    (item) => String(item.encrypted_data).length,
  )) {
    await post_storage_rekey(ctx, "contact_attachments", batch);
    await pause_between_batches(ctx);
  }
}

async function reseal_contact_photo(
  ctx: ResealStepContext,
  contact_id: string,
): Promise<void> {
  const path = `/contacts/v1/${encodeURIComponent(contact_id)}/photo`;
  const photo = await get_optional<PhotoRow>(ctx, path, "contact_photo_get");

  if (!photo) return;

  const data = await reseal_field(
    ctx.keys,
    photo.encrypted_data,
    photo.data_nonce,
  );
  const meta = await reseal_field(
    ctx.keys,
    photo.encrypted_meta,
    photo.meta_nonce,
  );

  tally_untouched(ctx, [data, meta]);
  if (!is_sealed(data) && !is_sealed(meta)) return;

  await write_if_unchanged(
    ctx,
    async () => {
      const fresh = await get_optional<PhotoRow>(
        ctx,
        path,
        "contact_photo_get",
      );

      return (
        !!fresh &&
        fresh.data_nonce === photo.data_nonce &&
        fresh.meta_nonce === photo.meta_nonce
      );
    },
    () =>
      ctx.api.post(path, {
        encrypted_data: is_sealed(data) ? data.ciphertext : photo.encrypted_data,
        data_nonce: is_sealed(data) ? data.nonce : photo.data_nonce,
        encrypted_meta: is_sealed(meta) ? meta.ciphertext : photo.encrypted_meta,
        meta_nonce: is_sealed(meta) ? meta.nonce : photo.meta_nonce,
        size_bytes: photo.size_bytes,
      }),
    "contact_photo",
  );
  await pause_between_batches(ctx);
}

export const contact_extras_step: ResealStep = {
  name: "contact_extras",
  async run(ctx) {
    const progress = step_progress(ctx, "contact_extras");

    if (progress.done) return "done";

    const definitions = await get_optional<{ items: FieldDefinitionRow[] }>(
      ctx,
      "/contacts/v1/fields",
      "contact_fields_list",
    );
    const has_fields = (definitions?.items ?? []).length > 0;
    const start = typeof progress.cursor === "string" ? progress.cursor : null;
    const finished = await each_contact_page(
      ctx,
      start,
      async (page, next) => {
        for (const row of page.items ?? []) {
          if (has_fields) await reseal_field_values(ctx, row.id);
          await reseal_contact_attachments(ctx, row.id);
          await reseal_contact_photo(ctx, row.id);
        }
        progress.cursor = next;
        ctx.persist();
        await pause_between_batches(ctx);
      },
    );

    if (!finished) return "interrupted";

    progress.done = true;
    progress.cursor = null;
    ctx.persist();

    return "done";
  },
};

async function plan_pairs(
  ctx: ResealStepContext,
  row: Record<string, unknown>,
  pairs: SealedPair[],
): Promise<Record<string, string>> {
  const body: Record<string, string> = {};
  const results: ResealResult[] = [];

  for (const pair of pairs) {
    const ciphertext = row[pair.ciphertext_field];
    const nonce = row[pair.nonce_field];
    const result = await reseal_field(
      ctx.keys,
      typeof ciphertext === "string" ? ciphertext : null,
      typeof nonce === "string" ? nonce : null,
    );

    results.push(result);
    if (is_sealed(result)) {
      body[pair.ciphertext_field] = result.ciphertext;
      body[pair.nonce_field] = result.nonce;
    }
  }
  tally_untouched(ctx, results);

  return body;
}

function same_pairs(
  a: Record<string, unknown> | null,
  b: Record<string, unknown>,
  pairs: SealedPair[],
): boolean {
  return (
    !!a &&
    pairs.every(
      (pair) =>
        (a[pair.ciphertext_field] ?? null) ===
          (b[pair.ciphertext_field] ?? null) &&
        (a[pair.nonce_field] ?? null) === (b[pair.nonce_field] ?? null),
    )
  );
}

const NAME_PAIR: SealedPair = {
  ciphertext_field: "encrypted_name",
  nonce_field: "name_nonce",
};
const CONTENT_PAIR: SealedPair = {
  ciphertext_field: "encrypted_content",
  nonce_field: "content_nonce",
};
const CATEGORY_PAIR: SealedPair = {
  ciphertext_field: "encrypted_category",
  nonce_field: "category_nonce",
};

function editable_rows_step<T extends SignatureRow>(
  name: string,
  list_path: string,
  list_key: string,
  pairs: SealedPair[],
): ResealStep {
  return {
    name,
    async run(ctx) {
      const progress = step_progress(ctx, name);

      if (progress.done) return "done";

      const before = incomplete_count(ctx);
      const rows = await collect_id_pages<T>(
        ctx,
        list_path,
        list_key,
        `${name}_list`,
        true,
      );

      for (const row of rows) {
        const record = row as unknown as Record<string, unknown>;
        const body = await plan_pairs(ctx, record, pairs);

        if (Object.keys(body).length === 0) continue;

        const item_path = `${list_path}/${encodeURIComponent(row.id)}`;

        await write_if_unchanged(
          ctx,
          async () =>
            same_pairs(
              await get_optional<Record<string, unknown>>(
                ctx,
                item_path,
                `${name}_get`,
              ),
              record,
              pairs,
            ),
          () => ctx.api.put(item_path, body),
          name,
        );
        await pause_between_batches(ctx);
      }

      return finish_step(ctx, progress, before);
    },
  };
}

export const signatures_step = editable_rows_step<SignatureRow>(
  "signatures",
  "/mail/v1/signatures",
  "signatures",
  [NAME_PAIR, CONTENT_PAIR],
);

export const templates_step = editable_rows_step<TemplateRow>(
  "templates",
  "/mail/v1/templates",
  "templates",
  [NAME_PAIR, CATEGORY_PAIR, CONTENT_PAIR],
);

export const sync_sources_step: ResealStep = {
  name: "sync_sources",
  async run(ctx) {
    const progress = step_progress(ctx, "sync_sources");

    if (progress.done) return "done";

    const data = await get_optional<{ items: SyncSourceRow[] }>(
      ctx,
      SYNC_SOURCES_PATH,
      "sync_sources_list",
    );

    for (const row of data?.items ?? []) {
      const result = await reseal_field(
        ctx.keys,
        row.encrypted_config,
        row.config_nonce,
      );

      if (!is_sealed(result)) {
        if (result !== "absent") tally_untouched(ctx, [result]);
        continue;
      }

      await write_if_unchanged(
        ctx,
        async () => {
          const fresh = await get_optional<{ items: SyncSourceRow[] }>(
            ctx,
            SYNC_SOURCES_PATH,
            "sync_sources_list",
          );
          const match = (fresh?.items ?? []).find((item) => item.id === row.id);

          return !!match && match.encrypted_config === row.encrypted_config;
        },
        () =>
          ctx.api.put(`${SYNC_SOURCES_PATH}/${encodeURIComponent(row.id)}`, {
            source_type: row.source_type,
            encrypted_config: result.ciphertext,
            config_nonce: result.nonce,
          }),
        "sync_sources",
      );
      await pause_between_batches(ctx);
    }

    progress.done = true;
    ctx.persist();

    return "done";
  },
};
