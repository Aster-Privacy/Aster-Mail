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
  LANE_SEEN_PREFIX,
  LANE_SENDER_PIN_PREFIX,
} from "./storage_key_names";
import {
  open_contact,
  read_contact_entry,
  with_contact_lock,
  write_contact_entry,
  type ContactRead,
} from "./contact_entries";
import {
  claim_lane_replay,
  lane_replay_key,
  lane_replay_message,
  merge_lane_replay,
} from "./lane_replay";
import { queue_lane_replay, vault_lane_replay } from "./lane_replay_sync";

export type LaneSenderPin = "pinned" | "unpinned" | "unreadable";

export type LaneFreshness = "fresh" | "replayed" | "unknown";

interface StoredLaneSenderPin {
  pinned_at: number;
}

function normalize_pin(stored: unknown): StoredLaneSenderPin | null {
  if (!stored || typeof stored !== "object") return null;

  const pinned_at = (stored as Record<string, unknown>).pinned_at;

  return typeof pinned_at === "number" ? { pinned_at } : null;
}

function merge_pins(left: unknown, right: unknown): StoredLaneSenderPin {
  const first = normalize_pin(left);
  const second = normalize_pin(right);

  return {
    pinned_at: Math.min(
      first?.pinned_at ?? Number.MAX_SAFE_INTEGER,
      second?.pinned_at ?? Number.MAX_SAFE_INTEGER,
    ),
  };
}

function settled<T>(read: ContactRead<T>): T | null | "unreadable" {
  if (read.state === "found") return read.value;
  if (read.state === "absent") return null;

  return "unreadable";
}

export async function lookup_lane_sender_pin(
  sender_email: string,
): Promise<LaneSenderPin> {
  if (!sender_email) return "unreadable";

  try {
    const slot = await open_contact(sender_email.trim().toLowerCase());

    if (!slot) return "unreadable";

    const read = settled(
      await read_contact_entry<unknown>(
        LANE_SENDER_PIN_PREFIX,
        slot,
        () => true,
        merge_pins,
      ),
    );

    if (read === "unreadable") return "unreadable";

    return normalize_pin(read) ? "pinned" : "unpinned";
  } catch {
    return "unreadable";
  }
}

export async function pin_lane_sender(sender_email: string): Promise<void> {
  if (!sender_email) return;

  try {
    const slot = await open_contact(sender_email.trim().toLowerCase());

    if (!slot) return;

    await with_contact_lock(slot, async () => {
      const read = settled(
        await read_contact_entry<unknown>(
          LANE_SENDER_PIN_PREFIX,
          slot,
          () => true,
          merge_pins,
        ),
      );

      if (read === "unreadable" || normalize_pin(read)) return;

      await write_contact_entry(LANE_SENDER_PIN_PREFIX, slot, {
        pinned_at: Date.now(),
      } satisfies StoredLaneSenderPin);
    });
  } catch {
    return;
  }
}

export async function claim_lane_nonce(
  sender_email: string,
  conversation_id: string,
  snonce: string,
  message_id: string,
  sent_at: number,
): Promise<LaneFreshness> {
  const sender = sender_email.trim().toLowerCase();

  if (!sender || !conversation_id || !snonce || !message_id) {
    return "unknown";
  }

  try {
    const slot = await open_contact(sender);

    if (!slot) return "unknown";

    const key = await lane_replay_key(conversation_id, snonce);
    const message = await lane_replay_message(message_id);

    return await with_contact_lock(slot, async () => {
      const read = settled(
        await read_contact_entry<unknown>(
          LANE_SEEN_PREFIX,
          slot,
          () => true,
          merge_lane_replay,
        ),
      );

      if (read === "unreadable") return "unknown";

      const claim = claim_lane_replay(
        merge_lane_replay(read, vault_lane_replay(sender)),
        key,
        message,
        sent_at,
      );

      await write_contact_entry(LANE_SEEN_PREFIX, slot, claim.record);

      if (claim.changed) queue_lane_replay(sender, claim.record);

      return claim.freshness;
    });
  } catch {
    return "unknown";
  }
}
