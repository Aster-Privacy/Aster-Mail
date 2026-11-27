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

import type { DecryptedEnvelope } from "@/types/email";

export const MIN_VOCABULARY_TERM_LENGTH = 4;
export const MAX_VOCABULARY_TERM_LENGTH = 24;
export const VOCABULARY_CAP = 12000;
export const VOCABULARY_PRUNE_TRIGGER = 24000;
export const VOCABULARY_BODY_CHARS = 512;

const SUBJECT_WEIGHT = 3;
const SENDER_WEIGHT = 3;
const BODY_WEIGHT = 1;

const LATIN_TERM = /^[\p{Script=Latin}][\p{Script=Latin}']*$/u;
const TERM_SEPARATOR = /[^\p{L}\p{N}']+/u;

const term_counts = new Map<string, number>();

let deletion_index: Map<string, string[]> | null = null;

interface PendingVocabularyEntry {
  subject: string;
  sender_name: string;
  body: string;
}

const DRAIN_BUDGET_MS = 8;
const DRAIN_IDLE_TIMEOUT_MS = 2000;

let pending_entries: PendingVocabularyEntry[] = [];
let pending_start = 0;
let drain_scheduled = false;

export function is_vocabulary_term(term: string): boolean {
  return (
    term.length >= MIN_VOCABULARY_TERM_LENGTH &&
    term.length <= MAX_VOCABULARY_TERM_LENGTH &&
    LATIN_TERM.test(term)
  );
}

export function tokenize_for_vocabulary(text: string): string[] {
  if (!text) return [];

  return text.toLowerCase().split(TERM_SEPARATOR).filter(is_vocabulary_term);
}

function prune_vocabulary(): void {
  const ranked = Array.from(term_counts.entries()).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );

  term_counts.clear();

  for (const [term, count] of ranked.slice(0, VOCABULARY_CAP)) {
    term_counts.set(term, count);
  }
}

export function add_vocabulary_text(text: string, weight: number): void {
  const tokens = tokenize_for_vocabulary(text);

  if (tokens.length === 0) return;

  for (const token of tokens) {
    const previous = term_counts.get(token);

    term_counts.set(token, (previous ?? 0) + weight);

    if (previous === undefined && deletion_index) {
      link_deletion_term(deletion_index, token);
    }
  }

  if (term_counts.size > VOCABULARY_PRUNE_TRIGGER) {
    prune_vocabulary();
    deletion_index = null;
  }
}

function apply_vocabulary_entry(entry: PendingVocabularyEntry): void {
  add_vocabulary_text(entry.subject, SUBJECT_WEIGHT);
  add_vocabulary_text(entry.sender_name, SENDER_WEIGHT);
  add_vocabulary_text(entry.body, BODY_WEIGHT);
}

function take_pending_entry(): PendingVocabularyEntry | undefined {
  if (pending_start >= pending_entries.length) return undefined;

  const entry = pending_entries[pending_start];

  pending_start++;

  if (pending_start >= pending_entries.length) {
    pending_entries = [];
    pending_start = 0;
  }

  return entry;
}

function flush_pending_vocabulary(): void {
  let entry = take_pending_entry();

  while (entry) {
    apply_vocabulary_entry(entry);
    entry = take_pending_entry();
  }
}

interface IdleDeadlineLike {
  didTimeout: boolean;
  timeRemaining(): number;
}

function wait_for_idle(): Promise<number> {
  const idle = (
    globalThis as {
      requestIdleCallback?: (
        callback: (deadline: IdleDeadlineLike) => void,
        options?: { timeout: number },
      ) => number;
    }
  ).requestIdleCallback;

  if (typeof idle === "function") {
    return new Promise<number>((resolve) => {
      idle(
        (deadline) => {
          resolve(
            deadline.didTimeout
              ? DRAIN_BUDGET_MS
              : Math.min(DRAIN_BUDGET_MS, deadline.timeRemaining()),
          );
        },
        { timeout: DRAIN_IDLE_TIMEOUT_MS },
      );
    });
  }

  return new Promise<number>((resolve) =>
    setTimeout(() => resolve(DRAIN_BUDGET_MS), 0),
  );
}

async function drain_pending_vocabulary(): Promise<void> {
  try {
    while (pending_start < pending_entries.length) {
      const budget = await wait_for_idle();
      const deadline = performance.now() + budget;
      let entry = take_pending_entry();

      while (entry) {
        apply_vocabulary_entry(entry);
        if (performance.now() >= deadline) break;
        entry = take_pending_entry();
      }
    }
  } finally {
    drain_scheduled = false;
  }
}

function vocabulary_entry_of(
  envelope: DecryptedEnvelope | null,
  search_body_text: string,
): PendingVocabularyEntry {
  return {
    subject: envelope?.subject || "",
    sender_name: envelope?.from?.name || "",
    body: search_body_text
      ? search_body_text.slice(0, VOCABULARY_BODY_CHARS)
      : "",
  };
}

export function add_vocabulary_entry(
  envelope: DecryptedEnvelope | null,
  search_body_text: string,
): void {
  apply_vocabulary_entry(vocabulary_entry_of(envelope, search_body_text));
}

export function queue_vocabulary_entry(
  envelope: DecryptedEnvelope | null,
  search_body_text: string,
): void {
  if (!envelope && !search_body_text) return;

  pending_entries.push(vocabulary_entry_of(envelope, search_body_text));

  if (drain_scheduled) return;

  drain_scheduled = true;
  void drain_pending_vocabulary();
}

export function pending_vocabulary_entries(): number {
  return pending_entries.length - pending_start;
}

export function reset_vocabulary(): void {
  term_counts.clear();
  release_deletion_index();
  pending_entries = [];
  pending_start = 0;
}

export function vocabulary_size(): number {
  flush_pending_vocabulary();

  return term_counts.size;
}

export function vocabulary_count(term: string): number {
  flush_pending_vocabulary();

  return term_counts.get(term) ?? 0;
}

export function vocabulary_has_term(term: string): boolean {
  flush_pending_vocabulary();

  return term_counts.has(term);
}

export function single_deletions(term: string): string[] {
  const variants: string[] = [];

  for (let i = 0; i < term.length; i++) {
    variants.push(term.slice(0, i) + term.slice(i + 1));
  }

  return variants;
}

function link_deletion_key(
  index: Map<string, string[]>,
  key: string,
  term: string,
): void {
  const existing = index.get(key);

  if (existing) {
    existing.push(term);

    return;
  }

  index.set(key, [term]);
}

function link_deletion_term(index: Map<string, string[]>, term: string): void {
  link_deletion_key(index, term, term);

  for (const variant of single_deletions(term)) {
    link_deletion_key(index, variant, term);
  }
}

function ensure_deletion_index(): Map<string, string[]> {
  cancel_deletion_index_release();
  flush_pending_vocabulary();

  if (deletion_index) return deletion_index;

  const index = new Map<string, string[]>();

  for (const term of term_counts.keys()) {
    link_deletion_term(index, term);
  }

  deletion_index = index;

  return index;
}

export const DELETION_INDEX_IDLE_RELEASE_MS = 60_000;

let release_timer: ReturnType<typeof setTimeout> | null = null;

function cancel_deletion_index_release(): void {
  if (release_timer === null) return;

  clearTimeout(release_timer);
  release_timer = null;
}

export function release_deletion_index(): void {
  cancel_deletion_index_release();
  deletion_index = null;
}

export function schedule_deletion_index_release(): void {
  cancel_deletion_index_release();

  if (!deletion_index) return;

  release_timer = setTimeout(() => {
    release_timer = null;
    deletion_index = null;
  }, DELETION_INDEX_IDLE_RELEASE_MS);
}

export function deletion_index_size(): number {
  return deletion_index ? deletion_index.size : 0;
}

export function vocabulary_candidates(term: string): string[] {
  const index = ensure_deletion_index();
  const found = new Set<string>();

  for (const key of [term, ...single_deletions(term)]) {
    for (const candidate of index.get(key) ?? []) {
      found.add(candidate);
    }
  }

  return Array.from(found);
}
