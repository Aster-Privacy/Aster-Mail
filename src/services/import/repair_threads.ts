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
import {
  list_mail_items,
  rethread_items,
  type MailItem,
  type RethreadItem,
} from "@/services/api/mail";
import { api_client } from "@/services/api/client";
import { decrypt_mail_envelope } from "@/components/email/shared/decrypt_envelope";
import {
  get_passphrase_bytes,
  get_vault_from_memory,
} from "@/services/crypto/memory_key_store";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import {
  hash_message_id,
  is_usable_msgid,
  normalize_subject,
  strip_angle_brackets,
  thread_token_from_root,
} from "@/services/threading/threading_rules";

const FETCH_LIMIT = 50;
const MAX_PAGES = 60;
const COOLDOWN_MS = 10_000;
const SUBMIT_BATCH_SIZE = 200;

let last_run_at = 0;
let running = false;

interface HeaderEntry {
  name: string;
  value: string;
}

interface RepairEnvelope {
  subject?: string;
  sent_at?: string;
  raw_headers?: HeaderEntry[];
}

interface RepairRecord {
  id: string;
  ts: number;
  thread_token: string | null;
  message_id: string | null;
  ref_ids: string[];
  normalized_subject: string;
}

function read_header(
  headers: HeaderEntry[] | undefined,
  name: string,
): string | null {
  if (!headers) return null;

  const lowered = name.toLowerCase();

  for (const header of headers) {
    if (header.name?.toLowerCase() === lowered) {
      const value = header.value?.trim();

      if (value) return value;
    }
  }

  return null;
}

function extract_reference_ids(headers: HeaderEntry[] | undefined): string[] {
  const raw = [
    ...(read_header(headers, "references")?.match(/<[^<>]+>/g) ?? []),
    ...(read_header(headers, "in-reply-to")?.match(/<[^<>]+>/g) ?? []).slice(
      0,
      1,
    ),
  ];
  const seen = new Set<string>();
  const ids: string[] = [];

  for (const id of raw) {
    if (!is_usable_msgid(id)) continue;

    const key = strip_angle_brackets(id).toLowerCase();

    if (seen.has(key)) continue;
    seen.add(key);
    ids.push(id);
  }

  return ids;
}

async function build_record(item: MailItem): Promise<RepairRecord | null> {
  if (!item.encrypted_envelope) return null;

  const envelope = await decrypt_mail_envelope<RepairEnvelope>(
    item.encrypted_envelope,
    item.envelope_nonce,
    item.id,
  );

  if (!envelope) return null;

  const headers = envelope.raw_headers;
  const message_id = read_header(headers, "message-id");
  const parsed = Date.parse(envelope.sent_at ?? item.created_at);

  return {
    id: item.id,
    ts: Number.isNaN(parsed) ? 0 : parsed,
    thread_token: item.thread_token ?? null,
    message_id: is_usable_msgid(message_id) ? message_id : null,
    ref_ids: extract_reference_ids(headers),
    normalized_subject: normalize_subject(envelope.subject ?? ""),
  };
}

const RELINK_DONE_KEY_PREFIX = "aster_thread_relink_v1:";

function relink_done(user_id: string): boolean {
  try {
    return localStorage.getItem(RELINK_DONE_KEY_PREFIX + user_id) === "1";
  } catch {
    return false;
  }
}

function mark_relink_done(user_id: string): void {
  try {
    localStorage.setItem(RELINK_DONE_KEY_PREFIX + user_id, "1");
  } catch {
    return;
  }
}

async function fetch_items_of_type(
  item_type: "received" | "sent",
): Promise<MailItem[]> {
  const items: MailItem[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await list_mail_items({
      item_type,
      limit: FETCH_LIMIT,
      cursor,
    });

    if (response.error || !response.data) break;

    items.push(...response.data.items);

    if (!response.data.has_more || !response.data.next_cursor) break;
    cursor = response.data.next_cursor;
  }

  return items;
}

async function fetch_all_items(): Promise<MailItem[]> {
  const received = await fetch_items_of_type("received");
  const sent = await fetch_items_of_type("sent");
  const seen = new Set<string>();

  return [...received, ...sent].filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);

    return true;
  });
}

function msgid_key(message_id: string): string {
  return strip_angle_brackets(message_id).toLowerCase();
}

function group_records(records: RepairRecord[]): RepairRecord[][] {
  const parent = new Map<string, string>();
  const by_msgid = new Map<string, RepairRecord>();

  const find = (id: string): string => {
    let root = id;

    while (parent.get(root) !== root) root = parent.get(root)!;

    let node = id;

    while (parent.get(node) !== root) {
      const next = parent.get(node)!;

      parent.set(node, root);
      node = next;
    }

    return root;
  };

  for (const record of records) {
    parent.set(record.id, record.id);
    if (record.message_id) {
      const key = msgid_key(record.message_id);

      if (!by_msgid.has(key)) by_msgid.set(key, record);
    }
  }

  for (const record of records) {
    for (const ref of record.ref_ids) {
      const target = by_msgid.get(msgid_key(ref));

      if (!target || target.id === record.id) continue;
      if (target.normalized_subject !== record.normalized_subject) continue;

      const root_a = find(record.id);
      const root_b = find(target.id);

      if (root_a !== root_b) parent.set(root_b, root_a);
    }
  }

  const groups = new Map<string, RepairRecord[]>();

  for (const record of records) {
    const root = find(record.id);
    const group = groups.get(root);

    if (group) group.push(record);
    else groups.set(root, [record]);
  }

  return [...groups.values()];
}

function plan_updates(user_id: string, records: RepairRecord[]): RethreadItem[] {
  const updates: RethreadItem[] = [];

  for (const group of group_records(records)) {
    let token: string | null = null;

    if (group.length > 1) {
      const with_token = group.find((record) => record.thread_token);
      const first_with_id = group.find((record) => record.message_id);

      token =
        with_token?.thread_token ??
        (first_with_id?.message_id
          ? thread_token_from_root(user_id, first_with_id.message_id)
          : null);
    }

    for (const record of group) {
      const target =
        token ??
        record.thread_token ??
        (record.message_id
          ? thread_token_from_root(user_id, record.message_id)
          : null);

      if (!target || target === record.thread_token) continue;

      updates.push({
        item_id: record.id,
        thread_token: target,
        msgid_hashes: record.message_id
          ? [hash_message_id(user_id, record.message_id)]
          : [],
      });
    }
  }

  return updates;
}

export async function thread_imported_emails(
  options: { relink_all?: boolean } = {},
): Promise<number> {
  if (running) return 0;
  if (Date.now() - last_run_at < COOLDOWN_MS) return 0;

  const user_id = api_client.get_cached_user_info()?.user_id;

  if (!user_id) return 0;

  const passphrase_bytes = get_passphrase_bytes();

  if (!passphrase_bytes) return 0;

  if (!get_vault_from_memory()) {
    zero_uint8_array(passphrase_bytes);

    return 0;
  }

  running = true;

  try {
    const all_items = await fetch_all_items();
    const relink_all = options.relink_all === true || !relink_done(user_id);

    if (!relink_all && !all_items.some((item) => !item.thread_token)) {
      return 0;
    }

    const records: RepairRecord[] = [];

    for (const item of all_items) {
      const record = await build_record(item);

      if (record) records.push(record);
    }

    records.sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1));

    const updates = plan_updates(user_id, records);
    let linked_count = 0;
    let complete = true;

    for (let index = 0; index < updates.length; index += SUBMIT_BATCH_SIZE) {
      const batch = updates.slice(index, index + SUBMIT_BATCH_SIZE);
      const response = await rethread_items(batch);

      if (response.error || !response.data) {
        complete = false;
        break;
      }

      linked_count += response.data.updated;
    }

    if (complete) mark_relink_done(user_id);

    return linked_count;
  } finally {
    zero_uint8_array(passphrase_bytes);
    running = false;
    last_run_at = Date.now();
  }
}
