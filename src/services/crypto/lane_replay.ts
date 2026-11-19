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
import { array_to_base64 } from "./base64";

import { HASH_ALG } from "@/services/crypto/constants";

export const MAX_LANE_REPLAY_ENTRIES = 1024;
export const MAX_LANE_REPLAY_TOTAL_ENTRIES = 4096;
export const MAX_LANE_REPLAY_SENDERS = 256;
export const LANE_REPLAY_GLOBAL_FLOOR_KEY = "*";

export interface LaneReplayEntry {
  k: string;
  m: string;
  t: number;
}

export interface LaneReplayRecord {
  f: number;
  e: LaneReplayEntry[];
}

export type LaneReplayMap = Record<string, LaneReplayRecord>;

export type LaneReplayClaim = {
  freshness: "fresh" | "replayed";
  record: LaneReplayRecord;
  changed: boolean;
};

const DIGEST_BYTES = 16;

function is_count(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0
  );
}

function is_label(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

async function short_digest(value: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest(HASH_ALG, new TextEncoder().encode(value)),
  );

  return array_to_base64(digest.slice(0, DIGEST_BYTES));
}

export function lane_replay_key(
  conversation_id: string,
  snonce: string,
): Promise<string> {
  return short_digest(`${conversation_id}\n${snonce}`);
}

export function lane_replay_message(message_id: string): Promise<string> {
  return short_digest(message_id);
}

export function empty_lane_replay(): LaneReplayRecord {
  return { f: 0, e: [] };
}

export function normalize_lane_replay(stored: unknown): LaneReplayRecord {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return empty_lane_replay();
  }

  const record = stored as Record<string, unknown>;
  const seen = new Set<string>();
  const entries: LaneReplayEntry[] = [];

  for (const entry of Array.isArray(record.e) ? record.e : []) {
    if (!entry || typeof entry !== "object") continue;

    const { k, m, t } = entry as Record<string, unknown>;

    if (!is_label(k) || !is_label(m) || !is_count(t) || seen.has(k)) continue;

    seen.add(k);
    entries.push({ k, m, t });
  }

  return { f: is_count(record.f) ? record.f : 0, e: entries };
}

function compare_entries(left: LaneReplayEntry, right: LaneReplayEntry): number {
  if (left.t !== right.t) return left.t - right.t;
  if (left.k !== right.k) return left.k < right.k ? -1 : 1;
  if (left.m !== right.m) return left.m < right.m ? -1 : 1;

  return 0;
}

export function cap_lane_replay(record: LaneReplayRecord): LaneReplayRecord {
  const sorted = [...record.e].sort(compare_entries);

  if (sorted.length <= MAX_LANE_REPLAY_ENTRIES) {
    return { f: record.f, e: sorted };
  }

  const dropped = sorted.slice(0, sorted.length - MAX_LANE_REPLAY_ENTRIES);
  const highest = dropped.reduce((max, entry) => Math.max(max, entry.t), 0);

  return {
    f: Math.max(record.f, highest, 1),
    e: sorted.slice(sorted.length - MAX_LANE_REPLAY_ENTRIES),
  };
}

export function merge_lane_replay(
  primary: unknown,
  secondary: unknown,
): LaneReplayRecord {
  const first = normalize_lane_replay(primary);
  const second = normalize_lane_replay(secondary);
  const keys = new Set(first.e.map((entry) => entry.k));

  return cap_lane_replay({
    f: Math.max(first.f, second.f),
    e: [...first.e, ...second.e.filter((entry) => !keys.has(entry.k))],
  });
}

function as_lane_replay_map(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function compare_text(left: string, right: string): number {
  if (left === right) return 0;

  return left < right ? -1 : 1;
}

export function lane_replay_global_floor(map: unknown): number {
  return normalize_lane_replay(
    as_lane_replay_map(map)[LANE_REPLAY_GLOBAL_FLOOR_KEY],
  ).f;
}

export function lane_replay_for_sender(
  map: unknown,
  sender_email: string,
): LaneReplayRecord {
  if (!sender_email || sender_email === LANE_REPLAY_GLOBAL_FLOOR_KEY) {
    return empty_lane_replay();
  }

  const stored = as_lane_replay_map(map);
  const record = normalize_lane_replay(
    Object.prototype.hasOwnProperty.call(stored, sender_email)
      ? stored[sender_email]
      : null,
  );
  const floor = lane_replay_global_floor(stored);

  return floor > record.f ? { f: floor, e: record.e } : record;
}

function recency(record: LaneReplayRecord): number {
  return record.e.reduce((max, entry) => Math.max(max, entry.t), record.f);
}

function holds_anything(record: LaneReplayRecord): boolean {
  return record.f > 0 || record.e.length > 0;
}

export function bound_lane_replay(
  records: Map<string, LaneReplayRecord>,
  floor: number,
): { kept: Map<string, LaneReplayRecord>; floor: number } {
  let global = floor;
  const ranked = [...records.entries()].sort(
    (left, right) =>
      recency(left[1]) - recency(right[1]) || compare_text(left[0], right[0]),
  );
  const excess = ranked.length - MAX_LANE_REPLAY_SENDERS;
  const kept = new Map<string, LaneReplayRecord>();

  ranked.forEach(([sender, record], index) => {
    if (index < excess) {
      if (holds_anything(record)) global = Math.max(global, recency(record), 1);
    } else {
      kept.set(sender, record);
    }
  });

  const all: [string, LaneReplayEntry][] = [];

  for (const [sender, record] of kept) {
    for (const entry of record.e) all.push([sender, entry]);
  }

  if (all.length > MAX_LANE_REPLAY_TOTAL_ENTRIES) {
    const dropped = all
      .sort(
        (left, right) =>
          left[1].t - right[1].t ||
          compare_text(left[0], right[0]) ||
          compare_text(left[1].k, right[1].k) ||
          compare_text(left[1].m, right[1].m),
      )
      .slice(0, all.length - MAX_LANE_REPLAY_TOTAL_ENTRIES);
    const raised = new Map<string, number>();
    const cut = new Map<string, Set<string>>();

    for (const [sender, entry] of dropped) {
      raised.set(sender, Math.max(raised.get(sender) ?? 0, entry.t));
      const keys = cut.get(sender) ?? new Set<string>();

      keys.add(entry.k);
      cut.set(sender, keys);
    }

    for (const [sender, keys] of cut) {
      const record = kept.get(sender) as LaneReplayRecord;

      kept.set(sender, {
        f: Math.max(record.f, raised.get(sender) ?? 0, 1),
        e: record.e.filter((entry) => !keys.has(entry.k)),
      });
    }
  }

  return { kept, floor: global };
}

export function merge_lane_replay_maps(
  primary: unknown,
  secondary: unknown,
): LaneReplayMap {
  const left = as_lane_replay_map(primary);
  const right = as_lane_replay_map(secondary);
  const records = new Map<string, LaneReplayRecord>();

  for (const sender of new Set([...Object.keys(left), ...Object.keys(right)])) {
    if (!sender || sender === LANE_REPLAY_GLOBAL_FLOOR_KEY) continue;

    records.set(sender, merge_lane_replay(left[sender], right[sender]));
  }

  const { kept, floor } = bound_lane_replay(
    records,
    Math.max(lane_replay_global_floor(left), lane_replay_global_floor(right)),
  );
  const merged: LaneReplayMap = {};

  if (floor > 0) merged[LANE_REPLAY_GLOBAL_FLOOR_KEY] = { f: floor, e: [] };

  for (const [sender, record] of kept) merged[sender] = record;

  return merged;
}

export function claim_lane_replay(
  stored: unknown,
  key: string,
  message: string,
  sent_at: number,
): LaneReplayClaim {
  const record = normalize_lane_replay(stored);
  const prior = record.e.find((entry) => entry.k === key);

  if (prior) {
    return {
      freshness: prior.m === message ? "fresh" : "replayed",
      record,
      changed: false,
    };
  }

  if (!is_count(sent_at) || (record.f > 0 && sent_at <= record.f)) {
    return { freshness: "replayed", record, changed: false };
  }

  return {
    freshness: "fresh",
    record: cap_lane_replay({
      f: record.f,
      e: [...record.e, { k: key, m: message, t: sent_at }],
    }),
    changed: true,
  };
}
