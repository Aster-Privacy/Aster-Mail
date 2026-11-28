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
import type { LearnGateSource } from "@/services/learned_sender_gate";

import {
  BUILTIN_CATEGORY_IDS,
  is_custom_category_id,
} from "@/data/category_catalog";
import { is_learning_blocked } from "@/services/learned_sender_gate";

export interface LearnedCategorySender {
  sender: string;
  category: string;
  updated_at: number;
}

export type LearnSource = LearnGateSource;

export const MAX_LEARNED_SENDERS = 500;
export const MAX_LEARNED_PER_MOVE = 200;
const MAX_SENDER_LENGTH = 320;
const MAX_CUSTOM_ID_LENGTH = 128;

const BUILTIN_ID_SET = new Set(BUILTIN_CATEGORY_IDS);

export function normalize_learned_sender(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const sender = value.trim().toLowerCase();

  if (sender.length === 0 || sender.length > MAX_SENDER_LENGTH) return null;
  if (/\s/.test(sender)) return null;

  const at = sender.indexOf("@");

  if (at <= 0 || at !== sender.lastIndexOf("@")) return null;
  if (at === sender.length - 1) return null;

  return sender;
}

export function is_learnable_category(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (BUILTIN_ID_SET.has(value)) return true;

  return (
    is_custom_category_id(value) &&
    value.length <= MAX_CUSTOM_ID_LENGTH &&
    !/\s/.test(value)
  );
}

function sanitize_entry(raw: unknown): LearnedCategorySender | null {
  if (!raw || typeof raw !== "object") return null;

  const record = raw as Record<string, unknown>;
  const sender = normalize_learned_sender(record.sender);

  if (!sender) return null;
  if (!is_learnable_category(record.category)) return null;

  const updated_at = record.updated_at;

  if (
    typeof updated_at !== "number" ||
    !Number.isFinite(updated_at) ||
    updated_at < 0
  ) {
    return null;
  }

  return {
    sender,
    category: record.category,
    updated_at: Math.floor(updated_at),
  };
}

function finish(
  by_sender: Map<string, LearnedCategorySender>,
): LearnedCategorySender[] {
  return Array.from(by_sender.values())
    .sort(
      (a, b) =>
        b.updated_at - a.updated_at ||
        (a.sender < b.sender ? -1 : a.sender > b.sender ? 1 : 0),
    )
    .slice(0, MAX_LEARNED_SENDERS);
}

function newer_entry(
  a: LearnedCategorySender,
  b: LearnedCategorySender,
): LearnedCategorySender {
  if (a.updated_at !== b.updated_at) {
    return a.updated_at > b.updated_at ? a : b;
  }

  return a.category <= b.category ? a : b;
}

function absorb(
  by_sender: Map<string, LearnedCategorySender>,
  entry: LearnedCategorySender,
): void {
  const existing = by_sender.get(entry.sender);

  by_sender.set(entry.sender, existing ? newer_entry(existing, entry) : entry);
}

export function sanitize_learned_senders(
  raw: unknown,
): LearnedCategorySender[] {
  if (!Array.isArray(raw)) return [];

  const by_sender = new Map<string, LearnedCategorySender>();

  for (const item of raw) {
    const entry = sanitize_entry(item);

    if (entry) absorb(by_sender, entry);
  }

  return finish(by_sender);
}

export function merge_learned_senders(
  ...lists: unknown[]
): LearnedCategorySender[] {
  const by_sender = new Map<string, LearnedCategorySender>();

  for (const list of lists) {
    for (const entry of sanitize_learned_senders(list)) {
      absorb(by_sender, entry);
    }
  }

  return finish(by_sender);
}

function by_sender_map(raw: unknown): Map<string, LearnedCategorySender> {
  return new Map(
    sanitize_learned_senders(raw).map((entry) => [entry.sender, entry]),
  );
}

function same_entry(
  a: LearnedCategorySender | undefined,
  b: LearnedCategorySender | undefined,
): boolean {
  if (!a || !b) return a === b;

  return a.category === b.category && a.updated_at === b.updated_at;
}

function three_way_entry(
  base: LearnedCategorySender | undefined,
  current: LearnedCategorySender | undefined,
  server: LearnedCategorySender | undefined,
): LearnedCategorySender | undefined {
  if (!base) {
    if (current && server) return newer_entry(current, server);

    return current ?? server;
  }

  if (current && server) {
    if (same_entry(current, base)) return server;
    if (same_entry(server, base)) return current;

    return newer_entry(current, server);
  }

  const survivor = current ?? server;

  if (!survivor || same_entry(survivor, base)) return undefined;

  return survivor;
}

export function reconcile_learned_senders(
  base: unknown,
  current: unknown,
  server: unknown,
): LearnedCategorySender[] {
  if (base === undefined || base === null) {
    return merge_learned_senders(current, server);
  }

  const base_map = by_sender_map(base);
  const current_map = by_sender_map(current);
  const server_map = by_sender_map(server);
  const senders = new Set([
    ...base_map.keys(),
    ...current_map.keys(),
    ...server_map.keys(),
  ]);
  const result = new Map<string, LearnedCategorySender>();

  for (const sender of senders) {
    const winner = three_way_entry(
      base_map.get(sender),
      current_map.get(sender),
      server_map.get(sender),
    );

    if (winner) result.set(sender, winner);
  }

  return finish(result);
}

export function learned_sender_map(
  list: readonly LearnedCategorySender[],
): Map<string, string> {
  const map = new Map<string, string>();

  for (const entry of list) map.set(entry.sender, entry.category);

  return map;
}

export function can_learn_from(source: LearnSource): string | null {
  const sender = normalize_learned_sender(source.sender_email);

  if (!sender) return null;

  return is_learning_blocked(sender, source) ? null : sender;
}

export function learnable_senders(
  sources: readonly LearnSource[],
): string[] {
  const senders: string[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    if (senders.length >= MAX_LEARNED_PER_MOVE) break;

    const sender = can_learn_from(source);

    if (!sender || seen.has(sender)) continue;
    seen.add(sender);
    senders.push(sender);
  }

  return senders;
}

export function apply_learned_move(
  list: readonly LearnedCategorySender[],
  senders: readonly string[],
  category: string,
  now_seconds: number,
): LearnedCategorySender[] | null {
  if (!is_learnable_category(category)) return null;
  if (senders.length === 0) return null;

  const by_sender = new Map(list.map((entry) => [entry.sender, entry]));
  const updated_at = Math.floor(now_seconds);

  for (const sender of senders) {
    by_sender.delete(sender);
    by_sender.set(sender, { sender, category, updated_at });
  }

  return finish(by_sender);
}

export function restore_learned_senders(
  list: readonly LearnedCategorySender[],
  before: readonly LearnedCategorySender[],
  after: readonly LearnedCategorySender[],
  senders: readonly string[],
): LearnedCategorySender[] {
  const previous = new Map(before.map((entry) => [entry.sender, entry]));
  const kept = new Set(after.map((entry) => entry.sender));
  const by_sender = new Map(list.map((entry) => [entry.sender, entry]));

  for (const sender of senders) {
    const prior = previous.get(sender);

    if (prior) by_sender.set(sender, prior);
    else by_sender.delete(sender);
  }

  for (const prior of before) {
    if (!kept.has(prior.sender) && !by_sender.has(prior.sender)) {
      by_sender.set(prior.sender, prior);
    }
  }

  return finish(by_sender);
}

type PersistLearned = (list: LearnedCategorySender[]) => void;

type LearnedListener = (list: readonly LearnedCategorySender[] | null) => void;

let learning_enabled = false;
let learned_loaded = false;
let current_list: LearnedCategorySender[] = [];
let persist_learned: PersistLearned | null = null;
const learned_listeners = new Set<LearnedListener>();

function notify_learned_listeners(): void {
  const snapshot = learned_loaded ? current_list : null;

  for (const listener of learned_listeners) listener(snapshot);
}

export function subscribe_learned_senders(
  listener: LearnedListener,
): () => void {
  learned_listeners.add(listener);
  if (learned_loaded) listener(current_list);

  return () => {
    learned_listeners.delete(listener);
  };
}

export function configure_learned_senders(config: {
  loaded: boolean;
  enabled: boolean;
  list: readonly LearnedCategorySender[];
  persist: PersistLearned | null;
}): void {
  learned_loaded = config.loaded;
  learning_enabled = config.loaded && config.enabled;
  current_list = config.loaded ? [...config.list] : [];
  persist_learned = config.loaded ? config.persist : null;
  notify_learned_listeners();
}

export function reset_learned_senders_store(): void {
  learning_enabled = false;
  learned_loaded = false;
  current_list = [];
  persist_learned = null;
}

export function is_learning_enabled(): boolean {
  return learned_loaded && learning_enabled;
}

export function are_learned_senders_loaded(): boolean {
  return learned_loaded;
}

export function get_learned_senders(): readonly LearnedCategorySender[] {
  return current_list;
}

export function pending_learned_senders(
  sources: readonly LearnSource[],
  category: string,
): string[] {
  if (!is_learning_enabled() || !persist_learned) return [];
  if (!is_learnable_category(category)) return [];

  const known = learned_sender_map(current_list);

  return learnable_senders(sources).filter(
    (sender) => known.get(sender) !== category,
  );
}

export function record_category_move(
  sources: readonly LearnSource[],
  category: string,
  now_seconds = Math.floor(Date.now() / 1000),
): (() => void) | null {
  if (!is_learning_enabled() || !persist_learned) return null;

  const before = current_list;
  const senders = pending_learned_senders(sources, category);
  const next = apply_learned_move(before, senders, category, now_seconds);

  if (!next) return null;

  current_list = next;
  persist_learned(next);
  notify_learned_listeners();

  let undone = false;

  return () => {
    if (undone || !persist_learned) return;
    undone = true;

    const restored = restore_learned_senders(
      current_list,
      before,
      next,
      senders,
    );

    current_list = restored;
    persist_learned(restored);
    notify_learned_listeners();
  };
}
