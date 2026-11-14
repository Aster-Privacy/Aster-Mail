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
  THREAD_TOKEN_BYTES,
} from "@/services/threading/threading_rules";

const FETCH_LIMIT = 100;
const MAX_PAGES = 300;
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

export interface RepairRecord {
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

function header_ids(value: string | null): string[] {
  if (!value) return [];

  const bracketed = value.match(/<[^<>]+>/g);

  if (bracketed && bracketed.length > 0) return bracketed;

  return value
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter((token) => token.includes("@"));
}

export function extract_reference_ids(
  headers: HeaderEntry[] | undefined,
): string[] {
  const raw = [
    ...header_ids(read_header(headers, "references")),
    ...header_ids(read_header(headers, "in-reply-to")).slice(0, 1),
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

const RELINK_DONE_KEY_PREFIX = "aster_thread_relink_v2:";

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

async function fetch_all_items(): Promise<MailItem[]> {
  const items: MailItem[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await list_mail_items({
      item_type: "all",
      limit: FETCH_LIMIT,
      cursor,
      skip_total: true,
    });

    if (response.error || !response.data) break;

    for (const item of response.data.items) {
      if (item.item_type !== "received" && item.item_type !== "sent") continue;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }

    if (!response.data.has_more || !response.data.next_cursor) break;
    cursor = response.data.next_cursor;
  }

  return items;
}

function msgid_key(message_id: string): string {
  return strip_angle_brackets(message_id).toLowerCase();
}

function subject_core(normalized: string): string {
  let current = normalized;

  for (;;) {
    const next = current
      .replace(/^\[[^\]]*\]\s*/, "")
      .replace(/^(re|aw|sv|fw|fwd)\s*(\[\d+\]|\^\d+|\(\d+\))\s*:\s*/, "")
      .trim();

    if (next === current) break;
    current = normalize_subject(next);
  }

  return current.replace(/\s+/g, " ");
}

export function subjects_compatible(a: string, b: string): boolean {
  const left = subject_core(a);
  const right = subject_core(b);

  if (!left || !right) return true;
  if (left === right) return true;

  return left.includes(right) || right.includes(left);
}

export function group_records(records: RepairRecord[]): RepairRecord[][] {
  const parent = new Map<string, string>();
  const root_subject = new Map<string, string | null>();
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

  const union = (a: string, b: string): void => {
    const root_a = find(a);
    const root_b = find(b);

    if (root_a === root_b) return;

    const subject_a = root_subject.get(root_a) ?? null;
    const subject_b = root_subject.get(root_b) ?? null;

    if (
      subject_a !== null &&
      subject_b !== null &&
      !subjects_compatible(subject_a, subject_b)
    ) {
      return;
    }

    parent.set(root_b, root_a);
    root_subject.set(root_a, subject_a ?? subject_b);
  };

  for (const record of records) {
    parent.set(record.id, record.id);
    root_subject.set(record.id, record.normalized_subject);
    if (record.message_id) {
      const key = msgid_key(record.message_id);

      if (!by_msgid.has(key)) by_msgid.set(key, record);
    }
  }

  const by_import_token = new Map<string, string>();

  for (const record of records) {
    const token = record.thread_token;

    if (!token || is_rethreadable_token(token)) continue;

    const first = by_import_token.get(token);

    if (first) union(first, record.id);
    else by_import_token.set(token, record.id);
  }

  for (const record of records) {
    for (const ref of record.ref_ids) {
      const key = msgid_key(ref);
      const target = by_msgid.get(key);

      if (target) {
        if (target.id !== record.id) union(target.id, record.id);
        continue;
      }

      const phantom = `ref:${key}`;

      if (!parent.has(phantom)) {
        parent.set(phantom, phantom);
        root_subject.set(phantom, null);
      }
      union(phantom, record.id);
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

export function is_rethreadable_token(token: string | null): boolean {
  if (!token) return false;

  try {
    return atob(token).length === THREAD_TOKEN_BYTES;
  } catch {
    return false;
  }
}

export function plan_updates(
  user_id: string,
  records: RepairRecord[],
): RethreadItem[] {
  const updates: RethreadItem[] = [];

  for (const group of group_records(records)) {
    let token: string | null = null;

    if (group.length > 1) {
      const with_token = group.find((record) =>
        is_rethreadable_token(record.thread_token),
      );
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
