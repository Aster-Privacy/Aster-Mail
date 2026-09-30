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
import type { DecryptedEnvelope, MailItemMetadata } from "@/types/email";
import type { MailItem } from "@/services/api/mail";

import {
  expand_date_shortcut,
  parse_size_range,
  parse_size_value,
  type ParsedOperator,
} from "@/utils/search_operators";
import { resolve_forwarding_display } from "@/utils/forwarding_alias";
import {
  normalize_envelope_from,
  normalize_envelope_recipients,
} from "@/services/crypto/envelope_normalize";

export const GRAM_SIZE = 4;
export const SUMMARY_GROUP_SIZE = 64;

const GRAM_HASH_COUNT = 4;
const GRAM_BITS_PER_ENTRY = 10;
const MIN_GRAM_BITS = 1 << 13;
const MAX_GRAM_BITS = 1 << 18;
const MAX_SUMMARY_LIST = 96;

export const FLAG_READ = 1 << 0;
export const FLAG_UNREAD = 1 << 1;
export const FLAG_STARRED = 1 << 2;
export const FLAG_UNSTARRED = 1 << 3;
export const FLAG_ATTACHMENT = 1 << 4;
export const FLAG_NO_ATTACHMENT = 1 << 5;
export const FLAG_TRASHED = 1 << 6;
export const FLAG_NOT_TRASHED = 1 << 7;
export const FLAG_SPAM = 1 << 8;
export const FLAG_NOT_SPAM = 1 << 9;

export interface ChunkSummary {
  min_ts: number;
  max_ts: number;
  has_dated: boolean;
  has_undated: boolean;
  min_size: number;
  max_size: number;
  flags: number;
  item_types: string[];
  tokens: string[];
  names: string[];
  tokens_complete: boolean;
  names_complete: boolean;
}

export interface StoredGramFilter {
  bits: string;
  m: number;
}

export interface GramFilter {
  bytes: Uint8Array;
  mask: number;
}

export interface SummarizableEntry {
  envelope: DecryptedEnvelope | null;
  metadata: MailItemMetadata | null;
}

export interface ChunkSkipFilters {
  has_attachments?: boolean;
  is_starred?: boolean;
  date_from?: string;
  date_to?: string;
}

export interface ChunkSkipInput {
  terms: string[];
  operators: ParsedOperator[];
  filters?: ChunkSkipFilters;
  label_name_to_tokens?: Map<string, string[]>;
  probe_terms: boolean;
}

export interface ChunkSkipPlan {
  uses_summary: boolean;
  uses_grams: boolean;
  skip_by_summary(summary: ChunkSummary): boolean;
  skip_by_grams(filter: GramFilter): boolean;
}

type SummaryTest = (summary: ChunkSummary) => boolean;

export function date_boundary_local(
  value: string,
  end_of_day: boolean,
): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());

  if (m && +m[2] >= 1 && +m[2] <= 12) {
    return end_of_day
      ? new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999).getTime()
      : new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0, 0).getTime();
  }

  return new Date(value).getTime();
}

function is_gram_char(code: number): boolean {
  return (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
}

export function collect_grams(text: string, into: Set<string>): void {
  if (!text) return;

  const lower = text.toLowerCase();
  let start = -1;

  for (let i = 0; i <= lower.length; i++) {
    if (i < lower.length && is_gram_char(lower.charCodeAt(i))) {
      if (start < 0) start = i;
      continue;
    }

    if (start >= 0) {
      for (let j = start; j + GRAM_SIZE <= i; j++) {
        into.add(lower.slice(j, j + GRAM_SIZE));
      }
      start = -1;
    }
  }
}

function hash_a(value: string): number {
  let h = 0x811c9dc5;

  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }

  return h >>> 0;
}

function hash_b(value: string): number {
  let h = 5381;

  for (let i = 0; i < value.length; i++) {
    h = (Math.imul(h, 33) + value.charCodeAt(i)) | 0;
  }

  return h >>> 0;
}

function bytes_to_base64(bytes: Uint8Array): string {
  const step = 8192;
  let raw = "";

  for (let i = 0; i < bytes.length; i += step) {
    raw += String.fromCharCode(...bytes.subarray(i, i + step));
  }

  return btoa(raw);
}

function base64_to_bytes(value: string): Uint8Array | null {
  try {
    const raw = atob(value);
    const bytes = new Uint8Array(raw.length);

    for (let i = 0; i < raw.length; i++) {
      bytes[i] = raw.charCodeAt(i);
    }

    return bytes;
  } catch {
    return null;
  }
}

function filter_bits(gram_count: number): number {
  const target = Math.max(gram_count, 1) * GRAM_BITS_PER_ENTRY;
  let bits = MIN_GRAM_BITS;

  while (bits < target && bits < MAX_GRAM_BITS) {
    bits *= 2;
  }

  return bits;
}

export function build_gram_filter(grams: Set<string>): StoredGramFilter {
  const m = filter_bits(grams.size);
  const mask = m - 1;
  const bytes = new Uint8Array(m / 8);

  for (const gram of grams) {
    const base = hash_a(gram);
    const step = (hash_b(gram) | 1) >>> 0;

    for (let i = 0; i < GRAM_HASH_COUNT; i++) {
      const pos = (base + i * step) & mask;

      bytes[pos >>> 3] |= 1 << (pos & 7);
    }
  }

  return { bits: bytes_to_base64(bytes), m };
}

export function parse_gram_filter(
  stored: StoredGramFilter | null | undefined,
): GramFilter | null {
  if (!stored || typeof stored.bits !== "string") return null;
  if (!Number.isInteger(stored.m) || stored.m < 8) return null;
  if ((stored.m & (stored.m - 1)) !== 0) return null;

  const bytes = base64_to_bytes(stored.bits);

  if (!bytes || bytes.length !== stored.m / 8) return null;

  return { bytes, mask: stored.m - 1 };
}

export function gram_present(filter: GramFilter, gram: string): boolean {
  const base = hash_a(gram);
  const step = (hash_b(gram) | 1) >>> 0;

  for (let i = 0; i < GRAM_HASH_COUNT; i++) {
    const pos = (base + i * step) & filter.mask;

    if ((filter.bytes[pos >>> 3] & (1 << (pos & 7))) === 0) return false;
  }

  return true;
}

function has_flag(flags: number, flag: number): boolean {
  return (flags & flag) !== 0;
}

function capped_list(values: Set<string>): {
  list: string[];
  complete: boolean;
} {
  if (values.size > MAX_SUMMARY_LIST) return { list: [], complete: false };

  return { list: [...values], complete: true };
}

export function summarize_chunk(
  items: MailItem[],
  entries: SummarizableEntry[],
): { summary: ChunkSummary; grams: StoredGramFilter } {
  let min_ts = 0;
  let max_ts = 0;
  let has_dated = false;
  let has_undated = false;
  let min_size = Number.MAX_SAFE_INTEGER;
  let max_size = 0;
  let flags = 0;

  const item_types = new Set<string>();
  const tokens = new Set<string>();
  const names = new Set<string>();
  const grams = new Set<string>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const entry = entries[i] ?? null;
    const metadata = entry?.metadata ?? null;
    const envelope = entry?.envelope ?? null;
    const ts = new Date(item.message_ts || item.created_at).getTime();

    if (Number.isFinite(ts)) {
      if (!has_dated) {
        min_ts = ts;
        max_ts = ts;
        has_dated = true;
      } else {
        if (ts < min_ts) min_ts = ts;
        if (ts > max_ts) max_ts = ts;
      }
    } else {
      has_undated = true;
    }

    const size = metadata?.size_bytes ?? 0;

    if (size < min_size) min_size = size;
    if (size > max_size) max_size = size;

    flags |= metadata?.is_read ? FLAG_READ : FLAG_UNREAD;
    flags |= metadata?.is_starred ? FLAG_STARRED : FLAG_UNSTARRED;
    flags |= metadata?.has_attachments ? FLAG_ATTACHMENT : FLAG_NO_ATTACHMENT;
    flags |= item.is_trashed ? FLAG_TRASHED : FLAG_NOT_TRASHED;
    flags |= item.is_spam ? FLAG_SPAM : FLAG_NOT_SPAM;

    if (item.item_type) item_types.add(item.item_type);

    for (const label of item.labels ?? []) {
      tokens.add(label.token);
      names.add((label.name || "").toLowerCase());
    }
    for (const folder of item.folders ?? []) {
      tokens.add(folder.token);
      names.add((folder.name || "").toLowerCase());
    }
    for (const tag of item.tag_tokens ?? []) {
      tokens.add(tag);
    }

    if (!envelope) continue;

    const from = normalize_envelope_from(envelope.from);

    collect_grams(envelope.subject || "", grams);
    collect_grams(from?.name || "", grams);
    collect_grams(from?.email || "", grams);

    const forwarding = resolve_forwarding_display(
      envelope.from,
      envelope.raw_headers,
    );

    if (forwarding) {
      collect_grams(forwarding.display_sender_name, grams);
      collect_grams(forwarding.display_sender_email, grams);
    }

    for (const recipient of [
      ...normalize_envelope_recipients(envelope.to),
      ...normalize_envelope_recipients(envelope.cc),
      ...normalize_envelope_recipients(envelope.bcc),
    ]) {
      collect_grams(recipient.name || "", grams);
      collect_grams(recipient.email, grams);
    }
  }

  const token_list = capped_list(tokens);
  const name_list = capped_list(names);

  return {
    summary: {
      min_ts,
      max_ts,
      has_dated,
      has_undated,
      min_size: min_size === Number.MAX_SAFE_INTEGER ? 0 : min_size,
      max_size,
      flags,
      item_types: [...item_types],
      tokens: token_list.list,
      names: name_list.list,
      tokens_complete: token_list.complete,
      names_complete: name_list.complete,
    },
    grams: build_gram_filter(grams),
  };
}

export function normalize_chunk_summary(raw: unknown): ChunkSummary | null {
  if (!raw || typeof raw !== "object") return null;

  const value = raw as Record<string, unknown>;
  const numbers = ["min_ts", "max_ts", "min_size", "max_size", "flags"];

  for (const field of numbers) {
    if (typeof value[field] !== "number") return null;
  }
  if (
    !Array.isArray(value.item_types) ||
    !Array.isArray(value.tokens) ||
    !Array.isArray(value.names)
  ) {
    return null;
  }

  return {
    min_ts: value.min_ts as number,
    max_ts: value.max_ts as number,
    has_dated: !!value.has_dated,
    has_undated: !!value.has_undated,
    min_size: value.min_size as number,
    max_size: value.max_size as number,
    flags: value.flags as number,
    item_types: (value.item_types as unknown[]).filter(
      (v): v is string => typeof v === "string",
    ),
    tokens: (value.tokens as unknown[]).filter(
      (v): v is string => typeof v === "string",
    ),
    names: (value.names as unknown[]).filter(
      (v): v is string => typeof v === "string",
    ),
    tokens_complete: !!value.tokens_complete,
    names_complete: !!value.names_complete,
  };
}

const IN_UNPRUNABLE_VALUES = new Set([
  "all",
  "anywhere",
  "archive",
  "archived",
]);

function in_operator_test(val: string): SummaryTest {
  return (summary) => {
    if (IN_UNPRUNABLE_VALUES.has(val)) return false;
    if (!summary.names_complete) return false;
    if (summary.names.some((name) => name.includes(val))) return false;

    if (val === "sent") return !summary.item_types.includes("sent");
    if (val === "drafts" || val === "draft") {
      return !summary.item_types.includes("draft");
    }
    if (val === "trash") return !has_flag(summary.flags, FLAG_TRASHED);
    if (val === "spam") return !has_flag(summary.flags, FLAG_SPAM);
    if (val === "starred") return !has_flag(summary.flags, FLAG_STARRED);
    if (val === "inbox") {
      return !(
        summary.item_types.includes("received") &&
        has_flag(summary.flags, FLAG_NOT_TRASHED) &&
        has_flag(summary.flags, FLAG_NOT_SPAM)
      );
    }

    return true;
  };
}

function label_operator_test(
  val: string,
  label_name_to_tokens?: Map<string, string[]>,
): SummaryTest {
  const matching: string[] = [];

  if (label_name_to_tokens) {
    for (const [name, tokens] of label_name_to_tokens) {
      if (name.includes(val)) matching.push(...tokens);
    }
  }

  if (matching.length > 0) {
    const wanted = new Set(matching);

    return (summary) =>
      summary.tokens_complete &&
      !summary.tokens.some((token) => wanted.has(token));
  }

  return (summary) =>
    summary.names_complete &&
    !summary.names.some((name) => name.length > 0 && name.includes(val));
}

function date_range_test(val: string): SummaryTest | null {
  const range = expand_date_shortcut(val);

  if (!range) return null;

  const [fy, fm, fd] = range.date_from.split("-").map(Number);
  const [ty, tm, td] = range.date_to.split("-").map(Number);
  const from_ts = new Date(fy, fm - 1, fd, 0, 0, 0, 0).getTime();
  const to_ts = new Date(ty, tm - 1, td, 23, 59, 59, 999).getTime();

  return (summary) =>
    !summary.has_dated || summary.max_ts < from_ts || summary.min_ts > to_ts;
}

function operator_summary_test(
  op: ParsedOperator,
  label_name_to_tokens?: Map<string, string[]>,
): SummaryTest | null {
  const val = op.value.toLowerCase();

  switch (op.type) {
    case "has":
    case "filename":
    case "attachment":
      return (summary) => !has_flag(summary.flags, FLAG_ATTACHMENT);
    case "is":
      if (val === "unread")
        return (summary) => !has_flag(summary.flags, FLAG_UNREAD);
      if (val === "read")
        return (summary) => !has_flag(summary.flags, FLAG_READ);
      if (val === "starred")
        return (summary) => !has_flag(summary.flags, FLAG_STARRED);
      if (val === "unstarred")
        return (summary) => !has_flag(summary.flags, FLAG_UNSTARRED);

      return null;
    case "in":
      return in_operator_test(val);
    case "before": {
      const target = date_boundary_local(op.value, false);

      if (!Number.isFinite(target)) return () => true;

      return (summary) => !summary.has_dated || summary.min_ts >= target;
    }
    case "after": {
      const target = date_boundary_local(op.value, false);

      if (!Number.isFinite(target)) return () => true;

      return (summary) => !summary.has_dated || summary.max_ts <= target;
    }
    case "date":
      return date_range_test(val);
    case "larger": {
      const threshold = parse_size_value(op.value);

      if (threshold === null) return null;

      return (summary) => summary.max_size <= threshold;
    }
    case "smaller": {
      const threshold = parse_size_value(op.value);

      if (threshold === null) return null;

      return (summary) => summary.min_size >= threshold;
    }
    case "size": {
      const range = parse_size_range(op.value);

      if (!range) return null;

      return (summary) =>
        summary.max_size < range.min || summary.min_size > range.max;
    }
    case "label":
    case "folder":
      return label_operator_test(val, label_name_to_tokens);
    default:
      return null;
  }
}

function filter_summary_tests(filters: ChunkSkipFilters): SummaryTest[] {
  const tests: SummaryTest[] = [];

  if (filters.has_attachments === true) {
    tests.push((summary) => !has_flag(summary.flags, FLAG_ATTACHMENT));
  }
  if (filters.has_attachments === false) {
    tests.push((summary) => !has_flag(summary.flags, FLAG_NO_ATTACHMENT));
  }
  if (filters.is_starred === true) {
    tests.push((summary) => !has_flag(summary.flags, FLAG_STARRED));
  }
  if (filters.is_starred === false) {
    tests.push((summary) => !has_flag(summary.flags, FLAG_UNSTARRED));
  }
  if (filters.date_from) {
    const boundary = date_boundary_local(filters.date_from, false);

    if (Number.isFinite(boundary)) {
      tests.push(
        (summary) =>
          !summary.has_undated &&
          summary.has_dated &&
          summary.max_ts < boundary,
      );
    }
  }
  if (filters.date_to) {
    const boundary = date_boundary_local(filters.date_to, true);

    if (Number.isFinite(boundary)) {
      tests.push(
        (summary) =>
          !summary.has_undated &&
          summary.has_dated &&
          summary.min_ts > boundary,
      );
    }
  }

  return tests;
}

const GRAM_PROBE_OPERATOR_TYPES = new Set(["from", "to", "subject"]);

export function build_chunk_skip_plan(input: ChunkSkipInput): ChunkSkipPlan {
  const tests: SummaryTest[] = [];
  const required = new Set<string>();

  if (input.probe_terms) {
    for (const term of input.terms) {
      collect_grams(term, required);
    }
  }

  for (const op of input.operators) {
    if (op.negated) continue;

    if (GRAM_PROBE_OPERATOR_TYPES.has(op.type)) {
      collect_grams(op.value, required);
      continue;
    }

    const test = operator_summary_test(op, input.label_name_to_tokens);

    if (test) tests.push(test);
  }

  if (input.filters) {
    tests.push(...filter_summary_tests(input.filters));
  }

  const required_grams = [...required];

  return {
    uses_summary: tests.length > 0,
    uses_grams: required_grams.length > 0,
    skip_by_summary: (summary) => tests.some((test) => test(summary)),
    skip_by_grams: (filter) =>
      required_grams.some((gram) => !gram_present(filter, gram)),
  };
}
