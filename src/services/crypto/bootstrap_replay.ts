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
  merge_lane_replay,
  normalize_lane_replay,
  type LaneReplayRecord,
} from "./lane_replay";

export type BootstrapClaim = "first" | "same_message" | "replayed" | "unknown";

export interface BootstrapRecordClaim {
  claim: BootstrapClaim;
  record: LaneReplayRecord;
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

export function claim_bootstrap_record(
  stored: unknown,
  key: string,
  message: string,
  now: number,
  may_evict = true,
): BootstrapRecordClaim {
  const normalized = normalize_lane_replay(stored);
  const prior = normalized.e.find((entry) => entry.k === key);

  if (prior) {
    return {
      claim: prior.m === message ? "same_message" : "replayed",
      record: normalized,
      changed: false,
    };
  }

  if (!may_evict && normalized.e.length >= MAX_LANE_REPLAY_ENTRIES) {
    return { claim: "unknown", record: normalized, changed: false };
  }

  return {
    claim: normalized.f > 0 ? "unknown" : "first",
    record: cap_lane_replay({
      f: normalized.f,
      e: [...normalized.e, { k: key, m: message, t: Math.max(now, 1) }],
    }),
    changed: true,
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
        merge_lane_replay,
      );

      if (read.state !== "found" && read.state !== "absent") return "unknown";

      const outcome = claim_bootstrap_record(
        read.state === "found" ? read.value : null,
        key,
        message,
        Date.now(),
        sender_verified,
      );

      if (outcome.changed) {
        await write_contact_entry(BOOTSTRAP_SEEN_PREFIX, slot, outcome.record);
      }

      return outcome.claim;
    });
  } catch {
    return "unknown";
  }
}
