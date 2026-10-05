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
import { describe, it, expect, beforeEach } from "vitest";

import {
  clear_attachment_keys,
  get_attachment_key,
  register_attachment_entry,
} from "./inbound_attachment_keys";
import { clear_vault_from_memory } from "./memory_key_store";

describe("inbound attachment keys account scope", () => {
  beforeEach(() => {
    clear_attachment_keys();
  });

  it("forgets every key when the vault is cleared", () => {
    register_attachment_entry("mail_1", 0, { key: "key_material" });

    clear_vault_from_memory();

    expect(get_attachment_key("mail_1", 0)).toBe("");
  });

  it("keeps keys when the same account stores its vault again", () => {
    register_attachment_entry("mail_1", 0, { key: "key_material" });

    clear_vault_from_memory({ keep_account_keys: true });

    expect(get_attachment_key("mail_1", 0)).toBe("key_material");
  });
});
