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
import type { DecryptedThreadMessage } from "@/types/thread";

import { describe, expect, it } from "vitest";

import {
  include_opened_message,
  keep_readable_bodies,
} from "./thread_message_merge";

import { shows_end_to_end } from "@/services/crypto/sent_encryption_evidence";
import { RATCHET_UNDECRYPTABLE_SENTINEL } from "@/utils/email_crypto";

const at = "2026-11-17T10:00:00.000Z";

function thread_copy(id: string): DecryptedThreadMessage {
  return {
    id,
    item_type: "sent",
    sender_name: "Me",
    sender_email: "me@example.test",
    subject: "Subject",
    body: RATCHET_UNDECRYPTABLE_SENTINEL,
    timestamp: at,
    is_read: true,
    is_starred: false,
    is_deleted: false,
    is_external: true,
    e2e_verified: false,
  } as DecryptedThreadMessage;
}

function opened_copy(
  id: string,
  has_recipient_key: boolean | undefined,
  e2e_verified = true,
): DecryptedThreadMessage {
  return {
    ...thread_copy(id),
    body: "readable body",
    e2e_verified,
    has_recipient_key,
  };
}

describe("thread merge recipient key evidence", () => {
  it("keeps the opened copy's recipient key with its verdict", () => {
    const merged = include_opened_message(
      [thread_copy("a")],
      opened_copy("a", true),
    );

    expect(merged[0].has_recipient_key).toBe(true);
    expect(shows_end_to_end(merged[0])).toBe(true);
    expect(shows_end_to_end(merged[0])).toBe(
      shows_end_to_end(opened_copy("a", true)),
    );
  });

  it("keeps the recipient key from the earlier readable copy", () => {
    const merged = keep_readable_bodies(
      [opened_copy("a", true)],
      [thread_copy("a")],
    );

    expect(merged[0].has_recipient_key).toBe(true);
    expect(shows_end_to_end(merged[0])).toBe(true);
  });

  it("never claims more than the copy the verdict came from", () => {
    const incoming = { ...thread_copy("a"), has_recipient_key: true };

    for (const source of [
      opened_copy("a", false),
      opened_copy("a", undefined),
      opened_copy("a", true, false),
    ]) {
      const opened = include_opened_message([incoming], source)[0];
      const refreshed = keep_readable_bodies([source], [incoming])[0];

      expect(opened.has_recipient_key).toBe(source.has_recipient_key);
      expect(refreshed.has_recipient_key).toBe(source.has_recipient_key);
      expect(shows_end_to_end(opened)).toBe(shows_end_to_end(source));
      expect(shows_end_to_end(refreshed)).toBe(shows_end_to_end(source));
      expect(shows_end_to_end(opened)).toBe(false);
    }
  });

  it("does not add a recipient key to a readable thread copy", () => {
    const readable = { ...thread_copy("a"), body: "thread body" };
    const merged = keep_readable_bodies([opened_copy("a", true)], [readable]);

    expect(merged[0].has_recipient_key).toBeUndefined();
    expect(shows_end_to_end(merged[0])).toBe(false);
  });
});
