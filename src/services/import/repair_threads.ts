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
import { blake3 } from "@noble/hashes/blake3";

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
  has_reply_prefix,
  hash_message_id,
  is_usable_msgid,
  normalize_subject,
  strip_angle_brackets,
  thread_token_from_root,
  uint8_to_base64,
  SUBJECT_THREAD_MAX_MESSAGES,
  SUBJECT_THREAD_WINDOW_MS,
  THREAD_TOKEN_BYTES,
} from "@/services/threading/threading_rules";

const FETCH_LIMIT = 100;
const MAX_PAGES = 300;
const COOLDOWN_MS = 10_000;
const SUBMIT_BATCH_SIZE = 200;
const FINGERPRINT_KEY_PREFIX = "aster_thread_relink_v3:";
const LAST_RUN_KEY_PREFIX = "aster_thread_relink_last_run:";

export const AUTO_FIRST_DELAY_MS = 120_000;
export const AUTO_FIRST_JITTER_MS = 600_000;
export const AUTO_ACTIVE_INTERVAL_MS = 600_000;
export const AUTO_IDLE_INTERVAL_MS = 21_600_000;
export const AUTO_MAX_FOLLOW_UPS = 3;
export const AUTO_LOCKED_RETRY_MS = 15_000;
const AUTO_LOCKED_MAX_RETRIES = 8;

interface HeaderEntry {
  name: string;
  value: string;
}

interface AddressEntry {
  email?: string;
}

interface RepairEnvelope {
  subject?: string;
  sent_at?: string;
  raw_headers?: HeaderEntry[];
  from?: AddressEntry;
  to?: AddressEntry[];
  cc?: AddressEntry[];
}

export interface RepairRecord {
  id: string;
  ts: number;
  thread_token: string | null;
  message_id: string | null;
  ref_ids: string[];
  normalized_subject: string;
  reply_shaped?: boolean;
  participants?: string[];
}

type CachedFields = Omit<RepairRecord, "id" | "thread_token">;

export type RunStatus = "linked" | "unchanged" | "skipped" | "locked";

export interface RunResult {
  status: RunStatus;
  linked: number;
}

interface StoredFingerprints {
  seen: string;
  settled: string;
}

interface FetchResult {
  items: MailItem[];
  complete: boolean;
}

let last_run_at = 0;
let last_run_linked = true;
let linked_streak = 0;
let current_run: Promise<RunResult> | null = null;
let scheduled_timer: ReturnType<typeof setTimeout> | null = null;
let locked_retries = 0;
let cache_user_id: string | null = null;
const record_cache = new Map<string, CachedFields>();

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

function envelope_participants(envelope: RepairEnvelope): string[] {
  const addresses = new Set<string>();

  for (const entry of [
    envelope.from,
    ...(envelope.to ?? []),
    ...(envelope.cc ?? []),
  ]) {
    const address = entry?.email?.trim().toLowerCase();

    if (address) addresses.add(address);
  }

  return [...addresses];
}

async function read_fields(item: MailItem): Promise<CachedFields | null> {
  const cached = record_cache.get(item.id);

  if (cached) return cached;
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
  const subject = envelope.subject ?? "";
  const fields: CachedFields = {
    ts: Number.isNaN(parsed) ? 0 : parsed,
    message_id: is_usable_msgid(message_id) ? message_id : null,
    ref_ids: extract_reference_ids(headers),
    normalized_subject: normalize_subject(subject),
    reply_shaped: has_reply_prefix(subject),
    participants: envelope_participants(envelope),
  };

  record_cache.set(item.id, fields);

  return fields;
}

async function build_record(item: MailItem): Promise<RepairRecord | null> {
  const fields = await read_fields(item);

  if (!fields) return null;

  return { ...fields, id: item.id, thread_token: item.thread_token ?? null };
}

function read_fingerprints(user_id: string): StoredFingerprints | null {
  try {
    const raw = localStorage.getItem(FINGERPRINT_KEY_PREFIX + user_id);

    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredFingerprints>;

    if (typeof parsed.seen !== "string" || typeof parsed.settled !== "string") {
      return null;
    }

    return { seen: parsed.seen, settled: parsed.settled };
  } catch {
    return null;
  }
}

function current_user_id(): string | null {
  return api_client.get_cached_user_info()?.user_id ?? null;
}

function read_last_run(user_id: string | null): number {
  if (!user_id) return last_run_at;

  try {
    const stored = Number(localStorage.getItem(LAST_RUN_KEY_PREFIX + user_id));

    return Number.isFinite(stored) && stored > last_run_at
      ? stored
      : last_run_at;
  } catch {
    return last_run_at;
  }
}

function write_last_run(user_id: string, at: number): void {
  try {
    localStorage.setItem(LAST_RUN_KEY_PREFIX + user_id, String(at));
  } catch {
    return;
  }
}

function write_fingerprints(user_id: string, value: StoredFingerprints): void {
  try {
    localStorage.setItem(
      FINGERPRINT_KEY_PREFIX + user_id,
      JSON.stringify(value),
    );
  } catch {
    return;
  }
}

export function fingerprint_items(
  items: { id: string; thread_token?: string | null }[],
  overrides: Map<string, string> = new Map(),
): string {
  const entries = items
    .map(
      (item) =>
        `${item.id}:${overrides.get(item.id) ?? item.thread_token ?? ""}`,
    )
    .sort();

  return uint8_to_base64(
    blake3(new TextEncoder().encode(entries.join("\n"))).slice(0, 16),
  );
}

async function fetch_all_items(): Promise<FetchResult> {
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

    if (response.error || !response.data) return { items, complete: false };

    for (const item of response.data.items) {
      if (item.item_type !== "received" && item.item_type !== "sent") continue;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }

    if (!response.data.has_more || !response.data.next_cursor) {
      return { items, complete: true };
    }
    cursor = response.data.next_cursor;
  }

  return { items, complete: false };
}

function msgid_key(message_id: string): string {
  return strip_angle_brackets(message_id).toLowerCase();
}

function subject_core(normalized: string): string {
  let current = normalized;

  for (;;) {
    const next = normalize_subject(current.replace(/^\[[^\]]*\]\s*/, ""));

    if (next === current) break;
    current = next;
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

function shares_participant(a: RepairRecord, b: RepairRecord): boolean {
  if (!a.participants?.length || !b.participants?.length) return false;

  const left = new Set(a.participants);

  return b.participants.some((address) => left.has(address));
}

export function group_records(records: RepairRecord[]): RepairRecord[][] {
  const parent = new Map<string, string>();
  const root_subject = new Map<string, string | null>();
  const root_size = new Map<string, number>();
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

  const union = (a: string, b: string, max_size?: number): void => {
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

    const size = (root_size.get(root_a) ?? 0) + (root_size.get(root_b) ?? 0);

    if (max_size !== undefined && size > max_size) return;

    parent.set(root_b, root_a);
    root_subject.set(root_a, subject_a ?? subject_b);
    root_size.set(root_a, size);
  };

  for (const record of records) {
    parent.set(record.id, record.id);
    root_subject.set(record.id, record.normalized_subject);
    root_size.set(record.id, 1);
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
        root_size.set(phantom, 0);
      }
      union(phantom, record.id);
    }
  }

  const by_subject = new Map<string, RepairRecord[]>();

  for (const record of records) {
    const core = subject_core(record.normalized_subject);

    if (!core) continue;

    const list = by_subject.get(core);

    if (list) list.push(record);
    else by_subject.set(core, [record]);
  }

  for (const list of by_subject.values()) {
    if (list.length < 2) continue;

    const ordered = [...list].sort(
      (a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1),
    );

    for (let i = 1; i < ordered.length; i++) {
      const later = ordered[i];

      if (!later.reply_shaped || later.ref_ids.length > 0) continue;

      for (let j = i - 1; j >= 0; j--) {
        const earlier = ordered[j];

        if (later.ts - earlier.ts > SUBJECT_THREAD_WINDOW_MS) break;
        if (!shares_participant(earlier, later)) continue;

        union(earlier.id, later.id, SUBJECT_THREAD_MAX_MESSAGES);
        break;
      }
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

async function run_repair(force: boolean): Promise<RunResult> {
  if (!force && Date.now() - last_run_at < COOLDOWN_MS) {
    return { status: "skipped", linked: 0 };
  }

  const user_id = api_client.get_cached_user_info()?.user_id;

  if (!user_id) return { status: "locked", linked: 0 };

  const passphrase_bytes = get_passphrase_bytes();

  if (!passphrase_bytes) return { status: "locked", linked: 0 };

  if (!get_vault_from_memory()) {
    zero_uint8_array(passphrase_bytes);

    return { status: "locked", linked: 0 };
  }

  if (cache_user_id !== user_id) {
    record_cache.clear();
    cache_user_id = user_id;
  }

  let linked_count = 0;

  try {
    const { items, complete } = await fetch_all_items();
    const fingerprint = fingerprint_items(items);
    const stored = read_fingerprints(user_id);

    if (
      !force &&
      stored &&
      (stored.seen === fingerprint || stored.settled === fingerprint)
    ) {
      return { status: "unchanged", linked: 0 };
    }

    const records: RepairRecord[] = [];

    for (const item of items) {
      const record = await build_record(item);

      if (record) records.push(record);
    }

    records.sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1));

    const updates = plan_updates(user_id, records);
    let submitted_all = true;

    for (let index = 0; index < updates.length; index += SUBMIT_BATCH_SIZE) {
      const batch = updates.slice(index, index + SUBMIT_BATCH_SIZE);
      const response = await rethread_items(batch);

      if (response.error || !response.data) {
        submitted_all = false;
        break;
      }

      linked_count += response.data.updated;
    }

    if (complete && submitted_all) {
      const applied = new Map(
        updates.map((update) => [update.item_id, update.thread_token]),
      );

      write_fingerprints(user_id, {
        seen: fingerprint,
        settled: fingerprint_items(items, applied),
      });
    }

    return {
      status: linked_count > 0 ? "linked" : "unchanged",
      linked: linked_count,
    };
  } finally {
    zero_uint8_array(passphrase_bytes);
    last_run_at = Date.now();
    last_run_linked = linked_count > 0;
    linked_streak = last_run_linked ? linked_streak + 1 : 0;
    write_last_run(user_id, last_run_at);
  }
}

async function start_run(force: boolean): Promise<RunResult> {
  while (current_run) {
    if (!force) return { status: "skipped", linked: 0 };

    await current_run.catch(() => undefined);
  }

  const run = run_repair(force);

  current_run = run;

  try {
    return await run;
  } finally {
    if (current_run === run) current_run = null;
  }
}

export async function thread_imported_emails(
  options: { relink_all?: boolean } = {},
): Promise<number> {
  const result = await start_run(options.relink_all === true);

  return result.linked;
}

export function regroup_conversations(): Promise<RunResult> {
  return start_run(true);
}

function auto_due_in(now: number): number | null {
  const last = read_last_run(current_user_id());

  if (last === 0) return null;

  const follow_up =
    last_run_at === last &&
    last_run_linked &&
    linked_streak <= AUTO_MAX_FOLLOW_UPS;
  const interval = follow_up ? AUTO_ACTIVE_INTERVAL_MS : AUTO_IDLE_INTERVAL_MS;

  return last + interval - now;
}

export function next_auto_delay(now: number = Date.now()): number {
  const due_in = auto_due_in(now);

  if (due_in === null) {
    return (
      AUTO_FIRST_DELAY_MS + Math.floor(Math.random() * AUTO_FIRST_JITTER_MS)
    );
  }

  return Math.max(AUTO_FIRST_DELAY_MS, due_in);
}

export function schedule_thread_repair(
  on_linked: (count: number) => void,
  delay_ms?: number,
): void {
  if (scheduled_timer !== null) return;

  scheduled_timer = setTimeout(() => {
    scheduled_timer = null;

    if (current_run) {
      schedule_thread_repair(on_linked);

      return;
    }

    const due_in = auto_due_in(Date.now());

    if (delay_ms === undefined && due_in !== null && due_in > 0) {
      schedule_thread_repair(on_linked);

      return;
    }

    start_run(false)
      .then((result) => {
        if (result.status === "locked") {
          if (locked_retries < AUTO_LOCKED_MAX_RETRIES) {
            locked_retries += 1;
            schedule_thread_repair(on_linked, AUTO_LOCKED_RETRY_MS);
          }

          return;
        }

        locked_retries = 0;
        if (result.linked > 0) on_linked(result.linked);
      })
      .catch(() => undefined);
  }, delay_ms ?? next_auto_delay());
}

export function cancel_thread_repair(): void {
  if (scheduled_timer === null) return;

  clearTimeout(scheduled_timer);
  scheduled_timer = null;
}
