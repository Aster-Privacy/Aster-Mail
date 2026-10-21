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
import { describe, it, expect } from "vitest";

import {
  can_move_to_category,
  mail_item_move_item,
} from "@/components/email/inbox/category_move";

const future = new Date(Date.now() + 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();

describe("can_move_to_category", () => {
  it("allows received mail that sits in the inbox", () => {
    expect(can_move_to_category({})).toBe(true);
    expect(can_move_to_category({ item_type: "received" })).toBe(true);
    expect(can_move_to_category({ snoozed_until: past })).toBe(true);
  });

  it("rejects mail that is not received mail", () => {
    expect(can_move_to_category({ item_type: "sent" })).toBe(false);
    expect(can_move_to_category({ item_type: "draft" })).toBe(false);
    expect(can_move_to_category({ metadata: { item_type: "sent" } })).toBe(
      false,
    );
  });

  it("rejects mail that left the inbox", () => {
    expect(can_move_to_category({ is_archived: true })).toBe(false);
    expect(can_move_to_category({ is_trashed: true })).toBe(false);
    expect(can_move_to_category({ is_spam: true })).toBe(false);
    expect(can_move_to_category({ folders: [{}] })).toBe(false);
    expect(can_move_to_category({ labels: [{}] })).toBe(false);
    expect(can_move_to_category({ snoozed_until: future })).toBe(false);
  });

  it("reads the flags a stored mail item keeps in its metadata", () => {
    expect(can_move_to_category({ metadata: { is_archived: true } })).toBe(
      false,
    );
    expect(can_move_to_category({ metadata: { is_trashed: true } })).toBe(
      false,
    );
    expect(can_move_to_category({ metadata: { is_spam: true } })).toBe(false);
    expect(can_move_to_category({ metadata: { snoozed_until: future } })).toBe(
      false,
    );
    expect(can_move_to_category({ metadata: null })).toBe(true);
  });
});

describe("mail_item_move_item", () => {
  it("carries the blob and sender of an opened message", () => {
    const item = mail_item_move_item(
      {
        id: "a",
        thread_token: "t1",
        encrypted_metadata: "blob",
        metadata_nonce: "nonce",
        metadata_version: 3,
      } as unknown as Parameters<typeof mail_item_move_item>[0],
      "sender@example.com",
    );

    expect(item).toMatchObject({
      id: "a",
      thread_token: "t1",
      encrypted_metadata: "blob",
      metadata_nonce: "nonce",
      metadata_version: 3,
    });
  });
});
