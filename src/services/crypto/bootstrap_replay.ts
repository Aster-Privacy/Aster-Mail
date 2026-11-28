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
import type { RatchetRecipientData } from "./ratchet_types";

import { BOOTSTRAP_SEEN_PREFIX } from "./storage_key_names";
import {
  open_contact,
  read_contact_entry,
  with_contact_lock,
  write_contact_entry,
} from "./contact_entries";
import {
  cap_lane_replay,
  lane_replay_message,
  MAX_LANE_REPLAY_ENTRIES,
  normalize_lane_replay,
  type LaneReplayRecord,
} from "./lane_replay";
import {
  queue_bootstrap_replay,
  vault_bootstrap_replay,
} from "./bootstrap_replay_sync";
import {
  decode_evicted_filter,
  encode_evicted_filter,
  evicted_filter_add,
  evicted_filter_has,
  evicted_filter_union,
  evicted_pair,
} from "./bootstrap_evicted_filter";

export type BootstrapClaim = "first" | "same_message" | "replayed" | "unknown";

export interface BootstrapSeenRecord extends LaneReplayRecord {
  x?: string;
}

export interface BootstrapRecordClaim {
  claim: BootstrapClaim;
  record: BootstrapSeenRecord;
  changed: boolean;
}

type BootstrapRecordData = Pick<
  RatchetRecipientData,
  "ephemeral_key" | "pq_ciphertext"
> & {
  header: Pick<RatchetRecipientData["header"], "dh_public" | "message_number">;
};

export function bootstrap_record_key(
  sender_identity_key: string,
  data: BootstrapRecordData,
): Promise<string> {
  return lane_replay_message(
    [
      "bootstrap",
      sender_identity_key,
      data.ephemeral_key,
      data.pq_ciphertext ?? "",
      data.header.dh_public,
      String(data.header.message_number),
    ].join("\n"),
  );
}

function stored_filter(stored: unknown): Uint8Array {
  return decode_evicted_filter(
    stored && typeof stored === "object" && !Array.isArray(stored)
      ? (stored as Record<string, unknown>).x
      : undefined,
  );
}

function remember_evicted(
  filter: Uint8Array,
  entries: LaneReplayRecord["e"],
): void {
  for (const entry of entries) {
    evicted_filter_add(filter, entry.k);
    evicted_filter_add(filter, evicted_pair(entry.k, entry.m));
  }
}

function seen_record(
  record: LaneReplayRecord,
  filter: Uint8Array,
): BootstrapSeenRecord {
  const x = encode_evicted_filter(filter);

  return x ? { f: record.f, e: record.e, x } : { f: record.f, e: record.e };
}

function capped_seen_record(
  record: LaneReplayRecord,
  filter: Uint8Array,
): BootstrapSeenRecord {
  const capped = cap_lane_replay(record);
  const kept = new Set(capped.e.map((entry) => entry.k));

  remember_evicted(
    filter,
    record.e.filter((entry) => !kept.has(entry.k)),
  );

  return seen_record(capped, filter);
}

export function merge_bootstrap_seen(
  primary: unknown,
  secondary: unknown,
): BootstrapSeenRecord {
  const first = normalize_lane_replay(primary);
  const second = normalize_lane_replay(secondary);
  const keys = new Set(first.e.map((entry) => entry.k));

  return capped_seen_record(
    {
      f: Math.max(first.f, second.f),
      e: [...first.e, ...second.e.filter((entry) => !keys.has(entry.k))],
    },
    evicted_filter_union(stored_filter(primary), stored_filter(secondary)),
  );
}

export function claim_bootstrap_record(
  stored: unknown,
  key: string,
  message: string,
  now: number,
  may_evict = true,
): BootstrapRecordClaim {
  const normalized = normalize_lane_replay(stored);
  const filter = stored_filter(stored);
  const current = seen_record(normalized, filter);
  const prior = normalized.e.find((entry) => entry.k === key);

  if (prior) {
    return {
      claim: prior.m === message ? "same_message" : "replayed",
      record: current,
      changed: false,
    };
  }

  if (evicted_filter_has(filter, key)) {
    return {
      claim: evicted_filter_has(filter, evicted_pair(key, message))
        ? "same_message"
        : "replayed",
      record: current,
      changed: false,
    };
  }

  if (!may_evict && normalized.e.length >= MAX_LANE_REPLAY_ENTRIES) {
    return { claim: "unknown", record: current, changed: false };
  }

  return {
    claim: normalized.f > 0 ? "unknown" : "first",
    record: capped_seen_record(
      {
        f: normalized.f,
        e: [...normalized.e, { k: key, m: message, t: Math.max(now, 1) }],
      },
      filter,
    ),
    changed: true,
  };
}

export interface SyncedBootstrapClaim extends BootstrapRecordClaim {
  shared: LaneReplayRecord | null;
}

export function claim_synced_bootstrap_record(
  stored: unknown,
  synced: unknown,
  key: string,
  message: string,
  now: number,
  may_evict = true,
): SyncedBootstrapClaim {
  const prior = normalize_lane_replay(synced).e.find(
    (entry) => entry.k === key,
  );

  if (prior && prior.m !== message) {
    return {
      claim: "replayed",
      record: normalize_lane_replay(stored),
      changed: false,
      shared: null,
    };
  }

  const outcome = claim_bootstrap_record(
    stored,
    key,
    message,
    now,
    may_evict,
  );

  return {
    ...outcome,
    shared:
      !prior && outcome.claim === "first"
        ? { f: 0, e: [{ k: key, m: message, t: now }] }
        : null,
  };
}

export async function claim_bootstrap(
  sender_email: string,
  sender_identity_key: string,
  data: BootstrapRecordData,
  message_id: string,
  sender_verified = true,
): Promise<BootstrapClaim> {
  const sender = sender_email.trim().toLowerCase();

  if (
    !sender ||
    !sender_identity_key ||
    !data.ephemeral_key ||
    !data.header?.dh_public ||
    !message_id
  ) {
    return "unknown";
  }

  try {
    const slot = await open_contact(sender);

    if (!slot) return "unknown";

    const key = await bootstrap_record_key(sender_identity_key, data);
    const message = await lane_replay_message(message_id);

    return await with_contact_lock(slot, async () => {
      const read = await read_contact_entry<unknown>(
        BOOTSTRAP_SEEN_PREFIX,
        slot,
        () => true,
        merge_bootstrap_seen,
      );

      if (read.state !== "found" && read.state !== "absent") return "unknown";

      const outcome = claim_synced_bootstrap_record(
        read.state === "found" ? read.value : null,
        vault_bootstrap_replay(sender),
        key,
        message,
        Date.now(),
        sender_verified,
      );

      if (outcome.changed) {
        await write_contact_entry(BOOTSTRAP_SEEN_PREFIX, slot, outcome.record);
      }

      if (outcome.shared) queue_bootstrap_replay(sender, outcome.shared);

      return outcome.claim;
    });
  } catch {
    return "unknown";
  }
}
