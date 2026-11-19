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
import { describe, it, expect, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  key_cache_clears: 0,
}));

vi.mock("@/services/api/keys", () => ({
  clear_external_key_cache: () => {
    hoisted.key_cache_clears++;
  },
}));

vi.mock("@/hooks/use_search", () => ({
  clear_search_index: async () => undefined,
}));

vi.mock("@/hooks/use_email_list", () => ({
  clear_mail_cache: async () => undefined,
}));

vi.mock("@/services/crypto/ratchet_state_store", () => ({
  clear_all_ratchet_states: async () => undefined,
}));

import { clear_account_scoped_caches } from "./auth_helpers";

describe("clear_account_scoped_caches and recipient key lookups", () => {
  beforeEach(() => {
    hoisted.key_cache_clears = 0;
  });

  it("drops cached recipient keys when the account changes", async () => {
    await clear_account_scoped_caches();

    expect(hoisted.key_cache_clears).toBe(1);
  });
});
