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
  NONCE_LENGTH,
  decode_b64,
  open_with_any,
  seal_under_new,
  sign_under_new,
  try_open,
} from "./reseal_keys";
import {
  chunk,
  incomplete_count,
  request_with_backoff,
  require_ok,
  step_progress,
} from "./reseal_io";
import {
  classify_sealed,
  decode_text,
  parse_json_object,
  pause_between_batches,
  post_storage_rekey,
  send_items_splitting,
  text_field,
  walk_id_pages,
} from "./step_helpers";
import { zero_uint8_array } from "../secure_memory";

import { parse_group_payload } from "@/services/api/contacts";
import { normalize_email } from "@/services/api/sender_utils";

export const CONTACTS_HMAC_INFO = "contacts-hmac-v2";
export const CONTACTS_SEARCH_INFO = "contacts-search-v2";
export const BLOCKED_SENDERS_INFO = "blocked-senders-hmac-v1";
export const ALLOWED_SENDERS_INFO = "allowed-senders-hmac-v1";
export const RECENT_RECIPIENTS_INFO = "recent-recipients-hmac-v1";
export const RECENT_RECIPIENTS_PATH = "/contacts/v1/recent_recipients";
export const EXTERNAL_ACCOUNTS_INFO = "external-accounts-hmac-v1";

const CONTACT_PAGE_SIZE = 100;
const CONTACT_BATCH_SIZE = 50;
const LIST_BATCH_SIZE = 100;
const ALLOWED_PAGE_SIZE = 500;
const RECENT_RECIPIENT_LIMIT = 100;
const MAX_PAGES_PER_RUN = 1000;
const GCM_TAG_LENGTH = 16;

export interface ContactRow {
  id: string;
  encrypted_data: string;
  data_nonce: string;
  integrity_hash?: string | null;
  data_version?: number | null;
}

export interface ContactPage {
  items: ContactRow[];
  next_cursor: string | null;
  has_more: boolean;
}

interface GroupRow {
  id: string;
  encrypted_name: string;
  name_nonce: string;
}

export interface SenderRow {
  id: string;
  encrypted_sender_data: string;
  sender_data_nonce: string;
  is_domain?: boolean;
}

export interface RecentRecipientRow {
  id: string;
  encrypted_email: string;
  email_nonce: string;
}

interface ExternalAccountRow {
  id: string;
  encrypted_account_data: string;
  account_data_nonce: string;
}

function search_value(value: string): string {
  return value.toLowerCase().trim();
}

async function build_contact_item(
  ctx: ResealStepContext,
  row: ContactRow,
): Promise<Record<string, unknown> | null> {
  const { keys, counts } = ctx;
  const sealed = await classify_sealed(keys, row.encrypted_data, row.data_nonce);

  if (sealed.state === "current") {
    counts.current += 1;

    return null;
  }
  if (sealed.state === "unreadable") {
    counts.unreadable += 1;

    return null;
  }

  try {
    const record = parse_json_object(sealed.plaintext);

    if (!record) {
      counts.unreadable += 1;

      return null;
    }

    const emails = Array.isArray(record.emails)
      ? record.emails.filter((email): email is string => typeof email === "string")
      : [];
    const first_name = String(record.first_name ?? "");
    const last_name = String(record.last_name ?? "");
    const company = text_field(record, "company");
    const resealed = await seal_under_new(keys, sealed.plaintext);
    const contact_token = await sign_under_new(
      keys,
      CONTACTS_HMAC_INFO,
      `${first_name} ${last_name} ${emails.join(" ")}`.toLowerCase(),
    );
    const full_name = `${first_name} ${last_name}`.trim();
    const item: Record<string, unknown> = {
      id: row.id,
      encrypted_contact_data: resealed.ciphertext,
      contact_nonce: resealed.nonce,
      contact_token,
    };

    if (full_name) {
      item.name_search_token = await sign_under_new(
        keys,
        CONTACTS_SEARCH_INFO,
        search_value(full_name),
      );
    }
    if (emails[0]) {
      item.email_search_token = await sign_under_new(
        keys,
        CONTACTS_SEARCH_INFO,
        search_value(emails[0]),
      );
    }
    if (company) {
      item.company_search_token = await sign_under_new(
        keys,
        CONTACTS_SEARCH_INFO,
        search_value(company),
      );
    }
    if (row.data_version) {
      item.integrity_hash = await sign_under_new(
        keys,
        CONTACTS_HMAC_INFO,
        `${resealed.ciphertext}:${resealed.nonce}:${row.data_version}`,
      );
    }

    return item;
  } finally {
    zero_uint8_array(sealed.plaintext);
  }
}

export const contacts_step: ResealStep = {
  name: "contacts",
  async run(ctx) {
    const progress = step_progress(ctx, "contacts");

    if (progress.done) return "done";

    let cursor = typeof progress.cursor === "string" ? progress.cursor : null;

    for (let page = 0; page < MAX_PAGES_PER_RUN; page++) {
      const query = new URLSearchParams({ limit: String(CONTACT_PAGE_SIZE) });

      if (cursor) query.set("cursor", cursor);

      const data = require_ok(
        await request_with_backoff(ctx, () =>
          ctx.api.get<ContactPage>(`/contacts/v1?${query.toString()}`),
        ),
        "contacts_list",
      );
      const items: Record<string, unknown>[] = [];

      for (const row of data.items ?? []) {
        const item = await build_contact_item(ctx, row);

        if (item) items.push(item);
      }
      for (const batch of chunk(items, CONTACT_BATCH_SIZE)) {
        await post_storage_rekey(ctx, "contacts", batch);
        await pause_between_batches(ctx);
      }

      cursor = data.next_cursor ?? null;
      if (!data.has_more || !cursor) {
        progress.done = true;
        progress.cursor = null;
        ctx.persist();

        return "done";
      }
      progress.cursor = cursor;
      ctx.persist();
    }

    return "interrupted";
  },
};

export const contact_groups_step: ResealStep = {
  name: "contact_groups",
  async run(ctx) {
    const progress = step_progress(ctx, "contact_groups");

    if (progress.done) return "done";

    const data = require_ok(
      await request_with_backoff(ctx, () =>
        ctx.api.get<{ groups: GroupRow[] }>("/contacts/v1/groups"),
      ),
      "groups_list",
    );

    for (const group of data.groups ?? []) {
      const sealed = await classify_sealed(
        ctx.keys,
        group.encrypted_name,
        group.name_nonce,
      );

      if (sealed.state === "current") {
        ctx.counts.current += 1;
        continue;
      }
      if (sealed.state === "unreadable") {
        ctx.counts.unreadable += 1;
        continue;
      }

      try {
        const { name } = parse_group_payload(decode_text(sealed.plaintext));
        const resealed = await seal_under_new(ctx.keys, sealed.plaintext);
        const body = {
          group_token: await sign_under_new(
            ctx.keys,
            CONTACTS_SEARCH_INFO,
            search_value(name),
          ),
          encrypted_name: resealed.ciphertext,
          name_nonce: resealed.nonce,
        };

        await send_items_splitting(
          ctx,
          [body],
          ([entry]) =>
            ctx.api.put(
              `/contacts/v1/groups/${encodeURIComponent(group.id)}`,
              entry,
            ),
          "groups_update",
        );
      } finally {
        zero_uint8_array(sealed.plaintext);
      }
      await pause_between_batches(ctx);
    }

    progress.done = true;
    ctx.persist();

    return "done";
  },
};

async function build_sender_item(
  ctx: ResealStepContext,
  row: SenderRow,
  info: string,
  email_prefix: string,
  integrity_suffix: string,
): Promise<Record<string, unknown> | null> {
  const sealed = await classify_sealed(
    ctx.keys,
    row.encrypted_sender_data,
    row.sender_data_nonce,
  );

  if (sealed.state === "current") {
    ctx.counts.current += 1;

    return null;
  }
  if (sealed.state === "unreadable") {
    ctx.counts.unreadable += 1;

    return null;
  }

  try {
    const record = parse_json_object(sealed.plaintext);
    const email = record ? text_field(record, "email") : undefined;

    if (!record || !email) {
      ctx.counts.unreadable += 1;

      return null;
    }

    const is_domain =
      typeof row.is_domain === "boolean"
        ? row.is_domain
        : record.is_domain === true;
    const token_input = is_domain
      ? `domain:${email.toLowerCase().trim()}`
      : `${email_prefix}${normalize_email(email)}`;
    const resealed = await seal_under_new(ctx.keys, sealed.plaintext);

    return {
      id: row.id,
      sender_token: await sign_under_new(ctx.keys, info, token_input),
      encrypted_sender_data: resealed.ciphertext,
      sender_data_nonce: resealed.nonce,
      integrity_hash: await sign_under_new(
        ctx.keys,
        info,
        `${resealed.ciphertext}:${resealed.nonce}:${integrity_suffix}`,
      ),
    };
  } finally {
    zero_uint8_array(sealed.plaintext);
  }
}

async function reseal_sender_rows(
  ctx: ResealStepContext,
  rows: SenderRow[],
  category: "blocked_senders" | "allowed_senders",
): Promise<void> {
  const blocked = category === "blocked_senders";
  const items: Record<string, unknown>[] = [];

  for (const row of rows) {
    const item = await build_sender_item(
      ctx,
      row,
      blocked ? BLOCKED_SENDERS_INFO : ALLOWED_SENDERS_INFO,
      blocked ? "" : "email:",
      blocked ? "blocked-senders-v1" : "allowed-senders-v1",
    );

    if (item) items.push(item);
  }
  for (const batch of chunk(items, LIST_BATCH_SIZE)) {
    await post_storage_rekey(ctx, category, batch);
    await pause_between_batches(ctx);
  }
}

export const blocked_senders_step: ResealStep = {
  name: "blocked_senders",
  async run(ctx) {
    const progress = step_progress(ctx, "blocked_senders");

    if (progress.done) return "done";

    const data = require_ok(
      await request_with_backoff(ctx, () =>
        ctx.api.get<{ blocked_senders: SenderRow[] }>(
          "/contacts/v1/blocked_senders",
        ),
      ),
      "blocked_list",
    );

    await reseal_sender_rows(ctx, data.blocked_senders ?? [], "blocked_senders");
    progress.done = true;
    ctx.persist();

    return "done";
  },
};

export const allowed_senders_step: ResealStep = {
  name: "allowed_senders",
  async run(ctx) {
    const progress = step_progress(ctx, "allowed_senders");

    if (progress.done) return "done";

    let offset = typeof progress.cursor === "number" ? progress.cursor : 0;

    for (let page = 0; page < MAX_PAGES_PER_RUN; page++) {
      const data = require_ok(
        await request_with_backoff(ctx, () =>
          ctx.api.get<{ allowed_senders: SenderRow[] }>(
            `/contacts/v1/allowed_senders?limit=${ALLOWED_PAGE_SIZE}&offset=${offset}`,
          ),
        ),
        "allowed_list",
      );
      const rows = data.allowed_senders ?? [];

      await reseal_sender_rows(ctx, rows, "allowed_senders");
      if (rows.length < ALLOWED_PAGE_SIZE) {
        progress.done = true;
        progress.cursor = null;
        ctx.persist();

        return "done";
      }
      offset += rows.length;
      progress.cursor = offset;
      ctx.persist();
    }

    return "interrupted";
  },
};

async function build_recent_recipient_item(
  ctx: ResealStepContext,
  row: RecentRecipientRow,
): Promise<Record<string, unknown> | null> {
  const sealed = await classify_sealed(
    ctx.keys,
    row.encrypted_email,
    row.email_nonce,
  );

  if (sealed.state === "current") {
    ctx.counts.current += 1;

    return null;
  }
  if (sealed.state === "unreadable") {
    ctx.counts.unreadable += 1;

    return null;
  }

  try {
    const email = decode_text(sealed.plaintext);
    const resealed = await seal_under_new(ctx.keys, sealed.plaintext);

    return {
      id: row.id,
      email_token: await sign_under_new(
        ctx.keys,
        RECENT_RECIPIENTS_INFO,
        email.toLowerCase().trim(),
      ),
      encrypted_email: resealed.ciphertext,
      email_nonce: resealed.nonce,
    };
  } finally {
    zero_uint8_array(sealed.plaintext);
  }
}

export async function list_recent_recipients(
  ctx: ResealStepContext,
): Promise<RecentRecipientRow[]> {
  const seen = new Map<string, RecentRecipientRow>();
  const walk = await walk_id_pages<{
    items?: RecentRecipientRow[];
    has_more?: boolean;
    next_cursor?: string | null;
  }>(ctx, RECENT_RECIPIENTS_PATH, "recent_list", null, async (data) => {
    for (const row of data.items ?? []) seen.set(row.id, row);
  });

  if (walk === "done") return [...seen.values()];
  seen.clear();

  for (let page = 0; page < MAX_PAGES_PER_RUN; page++) {
    const data = require_ok(
      await request_with_backoff(ctx, () =>
        ctx.api.get<{ items: RecentRecipientRow[] }>(
          `${RECENT_RECIPIENTS_PATH}?limit=${RECENT_RECIPIENT_LIMIT}&offset=${seen.size}`,
        ),
      ),
      "recent_list",
    );
    const rows = data.items ?? [];
    const before = seen.size;

    for (const row of rows) seen.set(row.id, row);
    if (rows.length < RECENT_RECIPIENT_LIMIT || seen.size === before) break;
  }

  return [...seen.values()];
}

export const recent_recipients_step: ResealStep = {
  name: "recent_recipients",
  async run(ctx) {
    const progress = step_progress(ctx, "recent_recipients");

    if (progress.done) return "done";

    const before = incomplete_count(ctx);
    const items: Record<string, unknown>[] = [];

    for (const row of await list_recent_recipients(ctx)) {
      const item = await build_recent_recipient_item(ctx, row);

      if (item) items.push(item);
    }
    for (const batch of chunk(items, LIST_BATCH_SIZE)) {
      await post_storage_rekey(ctx, "recent_recipients", batch);
      await pause_between_batches(ctx);
    }
    if (incomplete_count(ctx) > before) return "incomplete";

    progress.done = true;
    ctx.persist();

    return "done";
  },
};

export type ExternalAccountOpen =
  | { state: "current" }
  | { state: "stale"; plaintext: Uint8Array }
  | { state: "unreadable" };

function split_combined(
  ciphertext: Uint8Array,
  nonce: Uint8Array | null,
): { ciphertext: Uint8Array; nonce: Uint8Array } | null {
  if (ciphertext.length <= NONCE_LENGTH + GCM_TAG_LENGTH) return null;

  const embedded = ciphertext.slice(0, NONCE_LENGTH);

  if (nonce && nonce.length > 0) {
    if (nonce.length !== NONCE_LENGTH) return null;
    for (let i = 0; i < NONCE_LENGTH; i++) {
      if (nonce[i] !== embedded[i]) return null;
    }
  }

  return { ciphertext: ciphertext.slice(NONCE_LENGTH), nonce: embedded };
}

export async function open_external_account(
  keys: ResealKeys,
  ciphertext_b64: string,
  nonce_b64: string,
): Promise<ExternalAccountOpen> {
  const ciphertext = decode_b64(ciphertext_b64);
  const nonce = decode_b64(nonce_b64);

  if (!ciphertext) return { state: "unreadable" };

  if (nonce && nonce.length > 0) {
    const current = await try_open(keys.new_aes, ciphertext, nonce);

    if (current) {
      zero_uint8_array(current);

      return { state: "current" };
    }

    const stale = await open_with_any(keys.old_aes, ciphertext, nonce);

    if (stale) return { state: "stale", plaintext: stale };
  }

  const combined = split_combined(ciphertext, nonce);

  if (!combined) return { state: "unreadable" };

  const opened =
    (await try_open(keys.new_aes, combined.ciphertext, combined.nonce)) ??
    (await open_with_any(keys.old_aes, combined.ciphertext, combined.nonce));

  return opened ? { state: "stale", plaintext: opened } : { state: "unreadable" };
}

export const external_accounts_step: ResealStep = {
  name: "external_accounts",
  async run(ctx) {
    const progress = step_progress(ctx, "external_accounts");

    if (progress.done) return "done";

    const data = require_ok(
      await request_with_backoff(ctx, () =>
        ctx.api.get<{ accounts: ExternalAccountRow[] }>(
          "/mail/v1/external_accounts",
        ),
      ),
      "external_list",
    );
    const items: Record<string, unknown>[] = [];

    for (const row of data.accounts ?? []) {
      const opened = await open_external_account(
        ctx.keys,
        row.encrypted_account_data,
        row.account_data_nonce,
      );

      if (opened.state === "current") {
        ctx.counts.current += 1;
        continue;
      }
      if (opened.state === "unreadable") {
        ctx.counts.unreadable += 1;
        continue;
      }

      try {
        const record = parse_json_object(opened.plaintext);
        const email = record ? text_field(record, "email") : undefined;

        if (!email) {
          ctx.counts.unreadable += 1;
          continue;
        }

        const resealed = await seal_under_new(ctx.keys, opened.plaintext);

        items.push({
          id: row.id,
          account_token: await sign_under_new(
            ctx.keys,
            EXTERNAL_ACCOUNTS_INFO,
            email.toLowerCase().trim(),
          ),
          encrypted_account_data: resealed.ciphertext,
          account_data_nonce: resealed.nonce,
          integrity_hash: await sign_under_new(
            ctx.keys,
            EXTERNAL_ACCOUNTS_INFO,
            `${resealed.ciphertext}:${resealed.nonce}:external-accounts-v1`,
          ),
        });
      } finally {
        zero_uint8_array(opened.plaintext);
      }
    }
    for (const batch of chunk(items, LIST_BATCH_SIZE)) {
      await post_storage_rekey(ctx, "external_accounts", batch);
      await pause_between_batches(ctx);
    }

    progress.done = true;
    ctx.persist();

    return "done";
  },
};
