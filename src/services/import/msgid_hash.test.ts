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
import { describe, expect, it } from "vitest";

import { import_msgid_hash } from "./msgid_hash";

import { hash_message_id } from "@/services/threading/threading_rules";

const USER_ID = "11111111-2222-3333-4444-555555555555";

describe("import_msgid_hash", () => {
  it("matches the hash the server keeps for live and synced mail", () => {
    expect(
      import_msgid_hash(USER_ID, { "Message-ID": "<Abc@Example.com>" }),
    ).toBe(hash_message_id(USER_ID, "<Abc@Example.com>"));
  });

  it("ignores brackets and case so every source agrees", () => {
    expect(
      import_msgid_hash(USER_ID, { "message-id": "abc@example.com" }),
    ).toBe(import_msgid_hash(USER_ID, { "Message-Id": "<ABC@EXAMPLE.COM>" }));
  });

  it("decodes to sixteen bytes", () => {
    const hash = import_msgid_hash(USER_ID, { "message-id": "<a@b.c>" });

    expect(hash && atob(hash).length).toBe(16);
  });

  it("returns nothing without a usable id or a user", () => {
    expect(import_msgid_hash(USER_ID, {})).toBeUndefined();
    expect(
      import_msgid_hash(USER_ID, { "message-id": "<nope>" }),
    ).toBeUndefined();
    expect(
      import_msgid_hash(null, { "message-id": "<a@b.c>" }),
    ).toBeUndefined();
  });
});
