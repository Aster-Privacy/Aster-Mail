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

const get_responses: unknown[] = [];
const get_calls: unknown[] = [];

vi.mock("./client", () => ({
  api_client: {
    get: vi.fn(async (_url: string, config?: unknown) => {
      get_calls.push(config);

      return (
        get_responses.shift() ?? {
          data: { encrypted_preferences: null, preferences_nonce: null },
          error: undefined,
        }
      );
    }),
    put: vi.fn(async () => ({ data: { success: true }, error: undefined })),
  },
}));

vi.mock("@/services/crypto/legacy_keks", () => ({
  decrypt_aes_gcm_with_fallback: vi.fn(async () =>
    new TextEncoder().encode(JSON.stringify({ font_size_scale: 20 })),
  ),
}));

import {
  get_preferences,
  reconcile_preferences,
  clear_preferences_cache,
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "./preferences";

const vault = { identity_key: "identity" } as unknown as Parameters<
  typeof get_preferences
>[0];

describe("preferences reconciliation and null-blob confirmation", () => {
  beforeEach(() => {
    get_responses.length = 0;
    get_calls.length = 0;
    clear_preferences_cache();
  });

  it("keeps the server value when a list is structurally unchanged", () => {
    const base = {
      ...DEFAULT_PREFERENCES,
      enabled_categories: ["primary", "social"],
    } as UserPreferences;
    const current = {
      ...DEFAULT_PREFERENCES,
      enabled_categories: ["primary", "social"],
    } as UserPreferences;
    const server = {
      ...DEFAULT_PREFERENCES,
      enabled_categories: ["primary", "social", "promotions"],
    } as UserPreferences;

    const result = reconcile_preferences(base, current, server);

    expect(result.enabled_categories).toEqual([
      "primary",
      "social",
      "promotions",
    ]);
  });

  it("still adopts a genuinely changed list from this device", () => {
    const base = {
      ...DEFAULT_PREFERENCES,
      enabled_categories: ["primary"],
    } as UserPreferences;
    const current = {
      ...DEFAULT_PREFERENCES,
      enabled_categories: ["primary", "updates"],
    } as UserPreferences;
    const server = {
      ...DEFAULT_PREFERENCES,
      enabled_categories: ["primary", "social"],
    } as UserPreferences;

    const result = reconcile_preferences(base, current, server);

    expect(result.enabled_categories).toEqual(["primary", "updates"]);
  });

  it("re-reads uncached before treating a null blob as a new account", async () => {
    get_responses.push({
      data: { encrypted_preferences: null, preferences_nonce: null },
      error: undefined,
    });
    get_responses.push({
      data: { encrypted_preferences: "ZW5j", preferences_nonce: "bm9u" },
      error: undefined,
    });

    const result = await get_preferences(vault);

    expect(get_calls.length).toBe(2);
    expect(result.server_blob_unusable).toBeFalsy();
    expect(result.data.font_size_scale).toBe(20);
  });
});
