//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
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
  SUBJECT_THREAD_MAX_MESSAGES,
  SUBJECT_THREAD_WINDOW_MS,
  has_reply_prefix,
  hash_message_id,
  is_usable_msgid,
  normalize_account_address,
  normalize_sender,
  normalize_subject,
  strip_angle_brackets,
  thread_token_from_item,
  thread_token_from_root,
} from "./threading_rules";

const PAGE_SIZE = 200;
const MAX_PAGES = 600;
const SUBMIT_BATCH_SIZE = 200;
const MAX_DECRYPT_FAILURE_RATE = 0.25;
const MIN_DECRYPT_SAMPLE = 40;

export interface RethreadProgress {
  scanned: number;
  threads_examined: number;
  threads_split: number;
  items_moved: number;
}

export type RethreadOutcome =
  | "completed"
  | "locked"
  | "aborted"
  | "unavailable"
  | "already_running";

export interface RethreadResult extends RethreadProgress {
  outcome: RethreadOutcome;
}

interface HeaderEntry {
  name: string;
  value: string;
}

interface ThreadingEnvelope {
  subject?: string;
  from?: { email?: string };
  to?: { email?: string }[];
  sent_at?: string;
  raw_headers?: HeaderEntry[];
}

export interface ThreadRecord {
  id: string;
  thread_token: string;
  ts: number;
  message_id: string | null;
  ref_ids: string[];
  subject: string;
  normalized_subject: string;
  sender: string;
  account: string;
}

interface RecordGroup {
  members: ThreadRecord[];
  normalized_subject: string;
  sender: string;
  account: string;
  last_ts: number;
}

let running = false;

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

function collect_bracketed_ids(value: string | null, into: string[]): void {
  if (!value) return;

  const matches = value.match(/<[^<>]+>/g);

  if (!matches) return;

  for (const match of matches) {
    if (into.length >= 200) return;
    if (!is_usable_msgid(match)) continue;
    into.push(match);
  }
}

function extract_reference_ids(headers: HeaderEntry[] | undefined): string[] {
  const raw: string[] = [];

  collect_bracketed_ids(read_header(headers, "references"), raw);

  const in_reply_to = read_header(headers, "in-reply-to");
  const first: string[] = [];

  collect_bracketed_ids(in_reply_to, first);
  if (first.length > 0) raw.push(first[0]);

  const seen = new Set<string>();
  const ids: string[] = [];

  for (const id of raw) {
    const key = id.toLowerCase();

    if (seen.has(key)) continue;
    seen.add(key);
    ids.push(id);
  }

  return ids;
}

function resolve_account_address(envelope: ThreadingEnvelope): string {
  const headers = envelope.raw_headers;
  const delivered = read_header(headers, "delivered-to");

  if (delivered) {
    const token = delivered
      .split(/[\s,;]+/)
      .map((part) => strip_angle_brackets(part))
      .find((part) => part.includes("@"));

    if (token) return normalize_account_address(token);
  }

  const first_to = envelope.to?.find((entry) => entry.email)?.email;

  return first_to ? normalize_account_address(first_to) : "";
}

function envelope_timestamp(envelope: ThreadingEnvelope, item: MailItem): number {
  const candidates = [envelope.sent_at, item.message_ts, item.created_at];

  for (const candidate of candidates) {
    if (!candidate) continue;

    const parsed = Date.parse(candidate);

    if (!Number.isNaN(parsed)) return parsed;
  }

  return 0;
}

async function build_record(item: MailItem): Promise<ThreadRecord | null> {
  if (!item.thread_token || !item.encrypted_envelope) return null;

  const envelope = await decrypt_mail_envelope<ThreadingEnvelope>(
    item.encrypted_envelope,
    item.envelope_nonce,
    item.id,
  );

  if (!envelope) return null;

  const subject = envelope.subject ?? "";
  const headers = envelope.raw_headers;
  const message_id = read_header(headers, "message-id");

  return {
    id: item.id,
    thread_token: item.thread_token,
    ts: envelope_timestamp(envelope, item),
    message_id: is_usable_msgid(message_id) ? message_id : null,
    ref_ids: extract_reference_ids(headers),
    subject,
    normalized_subject: normalize_subject(subject),
    sender: normalize_sender(envelope.from?.email ?? ""),
    account: resolve_account_address(envelope),
  };
}

function reference_join_allowed(
  group: RecordGroup,
  record: ThreadRecord,
): boolean {
  if (group.members.length >= SUBJECT_THREAD_MAX_MESSAGES) return false;

  return group.normalized_subject === record.normalized_subject;
}

function subject_join_allowed(
  group: RecordGroup,
  record: ThreadRecord,
): boolean {
  if (group.members.length >= SUBJECT_THREAD_MAX_MESSAGES) return false;
  if (group.normalized_subject !== record.normalized_subject) return false;
  if (group.sender !== record.sender) return false;
  if (group.account !== record.account) return false;

  return record.ts - group.last_ts <= SUBJECT_THREAD_WINDOW_MS;
}

export function split_thread_records(records: ThreadRecord[]): ThreadRecord[][] {
  const sorted = [...records].sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1));
  const groups: RecordGroup[] = [];
  const msgid_owner = new Map<string, number>();

  for (const record of sorted) {
    let target: number | null = null;

    if (record.ref_ids.length > 0) {
      for (const ref of record.ref_ids) {
        const owner = msgid_owner.get(strip_angle_brackets(ref).toLowerCase());

        if (owner === undefined) continue;
        if (reference_join_allowed(groups[owner], record)) target = owner;
        break;
      }
    } else if (
      record.normalized_subject.length > 0 &&
      has_reply_prefix(record.subject)
    ) {
      for (let index = groups.length - 1; index >= 0; index--) {
        if (subject_join_allowed(groups[index], record)) {
          target = index;
          break;
        }
      }
    }

    if (target === null) {
      groups.push({
        members: [record],
        normalized_subject: record.normalized_subject,
        sender: record.sender,
        account: record.account,
        last_ts: record.ts,
      });
      target = groups.length - 1;
    } else {
      const group = groups[target];

      group.members.push(record);
      group.last_ts = Math.max(group.last_ts, record.ts);
    }

    if (record.message_id) {
      msgid_owner.set(
        strip_angle_brackets(record.message_id).toLowerCase(),
        target,
      );
    }
  }

  return groups.map((group) => group.members);
}

function group_token(user_id: string, members: ThreadRecord[]): string {
  for (const member of members) {
    if (member.message_id) {
      return thread_token_from_root(user_id, member.message_id);
    }
  }

  return thread_token_from_item(user_id, members[0].id);
}

function build_updates(
  user_id: string,
  original_token: string,
  groups: ThreadRecord[][],
): RethreadItem[] {
  const updates: RethreadItem[] = [];

  for (let index = 1; index < groups.length; index++) {
    const members = groups[index];
    const token = group_token(user_id, members);

    if (token === original_token) continue;

    for (const member of members) {
      updates.push({
        item_id: member.id,
        thread_token: token,
        msgid_hashes: member.message_id
          ? [hash_message_id(user_id, member.message_id)]
          : [],
      });
    }
  }

  return updates;
}

async function fetch_all_items(
  signal: AbortSignal | undefined,
  on_page: (count: number) => void,
): Promise<MailItem[] | null> {
  const items: MailItem[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    if (signal?.aborted) return null;

    const response = await list_mail_items({
      item_type: "all",
      include_spam: true,
      include_trash: true,
      limit: PAGE_SIZE,
      cursor,
      skip_total: true,
    });

    if (response.error || !response.data) return null;

    items.push(...response.data.items);
    on_page(items.length);

    if (!response.data.has_more || !response.data.next_cursor) break;
    cursor = response.data.next_cursor;
  }

  return items;
}

export async function run_rethread_migration(options?: {
  on_progress?: (progress: RethreadProgress) => void;
  signal?: AbortSignal;
}): Promise<RethreadResult> {
  const progress: RethreadProgress = {
    scanned: 0,
    threads_examined: 0,
    threads_split: 0,
    items_moved: 0,
  };
  const finish = (outcome: RethreadOutcome): RethreadResult => ({
    ...progress,
    outcome,
  });

  if (running) return finish("already_running");

  const user_id = api_client.get_cached_user_info()?.user_id;

  if (!user_id) return finish("unavailable");

  const passphrase_bytes = get_passphrase_bytes();

  if (!passphrase_bytes) return finish("locked");

  if (!get_vault_from_memory()) {
    zero_uint8_array(passphrase_bytes);

    return finish("locked");
  }

  running = true;

  const report = () => options?.on_progress?.({ ...progress });

  try {
    const items = await fetch_all_items(options?.signal, (count) => {
      progress.scanned = count;
      report();
    });

    if (!items) return finish("aborted");

    const by_token = new Map<string, MailItem[]>();

    for (const item of items) {
      if (!item.thread_token) continue;

      const existing = by_token.get(item.thread_token);

      if (existing) {
        existing.push(item);
      } else {
        by_token.set(item.thread_token, [item]);
      }
    }

    let decrypt_attempts = 0;
    let decrypt_failures = 0;
    const pending: RethreadItem[] = [];

    const flush = async (force: boolean): Promise<boolean> => {
      while (pending.length >= SUBMIT_BATCH_SIZE || (force && pending.length > 0)) {
        const batch = pending.splice(0, SUBMIT_BATCH_SIZE);
        const response = await rethread_items(batch);

        if (response.error || !response.data) return false;

        progress.items_moved += response.data.updated;
        report();
      }

      return true;
    };

    for (const [token, token_items] of by_token) {
      if (options?.signal?.aborted) return finish("aborted");
      if (token_items.length < 2) continue;

      progress.threads_examined++;

      const records: ThreadRecord[] = [];

      for (const item of token_items) {
        decrypt_attempts++;

        const record = await build_record(item);

        if (record) {
          records.push(record);
        } else {
          decrypt_failures++;
        }
      }

      if (
        decrypt_attempts >= MIN_DECRYPT_SAMPLE &&
        decrypt_failures / decrypt_attempts > MAX_DECRYPT_FAILURE_RATE
      ) {
        await flush(true);

        return finish("aborted");
      }

      if (records.length < 2) continue;

      const groups = split_thread_records(records);

      if (groups.length < 2) continue;

      const updates = build_updates(user_id, token, groups);

      if (updates.length === 0) continue;

      progress.threads_split++;
      pending.push(...updates);
      report();

      if (!(await flush(false))) return finish("aborted");
    }

    if (!(await flush(true))) return finish("aborted");

    return finish("completed");
  } finally {
    zero_uint8_array(passphrase_bytes);
    running = false;
  }
}
