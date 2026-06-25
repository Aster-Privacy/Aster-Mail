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

const put_calls: { url: string; body: unknown }[] = [];

vi.mock("./client", () => ({
  api_client: {
    get: vi.fn(async () => ({
      data: { encrypted_preferences: "ZW5j", preferences_nonce: "bm9u" },
      error: undefined,
    })),
    put: vi.fn(async (url: string, body: unknown) => {
      put_calls.push({ url, body });

      return { data: { success: true }, error: undefined };
    }),
  },
}));

vi.mock("@/services/crypto/legacy_keks", () => ({
  decrypt_aes_gcm_with_fallback: vi.fn(async () => {
    throw new Error("undecryptable: key rotated");
  }),
}));

import {
  get_preferences,
  DEFAULT_PREFERENCES,
  cache_preferences_locally,
  clear_preferences_cache,
  type UserPreferences,
} from "./preferences";

const vault = { identity_key: "rotated-identity-key" } as unknown as Parameters<
  typeof get_preferences
>[0];

describe("get_preferences recovery when the server blob cannot be decrypted", () => {
  beforeEach(() => {
    put_calls.length = 0;
    clear_preferences_cache();
    localStorage.clear();
  });

  it("re-initializes under the current key and unblocks saving", async () => {
    const result = await get_preferences(vault);

    expect(result.loaded_from_server).toBe(true);
    expect(put_calls.length).toBeGreaterThan(0);
  });

  it("preserves the user's cached settings instead of resetting to defaults", async () => {
    const desired: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      inbox_categories_enabled: false,
      conversation_grouping: false,
      time_format: "24h",
      theme: "dark",
    };

    cache_preferences_locally(desired);

    const result = await get_preferences(vault);

    expect(result.loaded_from_server).toBe(true);
    expect(result.data.inbox_categories_enabled).toBe(false);
    expect(result.data.conversation_grouping).toBe(false);
    expect(result.data.time_format).toBe("24h");
  });
});
