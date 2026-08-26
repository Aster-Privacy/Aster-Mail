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
import type { EncryptedVault } from "@/services/crypto/key_manager";

import { describe, it, expect, vi, beforeEach } from "vitest";

import { api_client } from "./client";
import {
  get_preferences,
  cache_preferences_locally,
  clear_preferences_cache,
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "./preferences";

import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";

vi.mock("./client", () => ({
  api_client: { get: vi.fn(), put: vi.fn() },
}));

vi.mock("@/services/crypto/legacy_keks", () => ({
  decrypt_aes_gcm_with_fallback: vi.fn(),
}));

const vault = { identity_key: "integration-test-identity" } as EncryptedVault;

function server_returns(obj: Record<string, unknown>) {
  (api_client.get as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: {
      encrypted_preferences: btoa("ciphertext"),
      preferences_nonce: btoa("nonce"),
    },
    error: null,
  });
  (decrypt_aes_gcm_with_fallback as ReturnType<typeof vi.fn>).mockResolvedValue(
    new TextEncoder().encode(JSON.stringify(obj)),
  );
}

function complete_server_blob(
  overrides: Partial<UserPreferences>,
): Record<string, unknown> {
  return {
    ...DEFAULT_PREFERENCES,
    migration_haptic_v1_done: true,
    migration_tracker_blocking_v2_done: true,
    migration_toast_position_v1_done: true,
    migration_viewer_toolbar_v1_done: true,
    ...overrides,
  };
}

describe("get_preferences end-to-end with a stale-stripped server blob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clear_preferences_cache();
  });

  it("resolves show_aster_branding to the cached false when the server blob is missing the key", async () => {
    cache_preferences_locally({
      ...DEFAULT_PREFERENCES,
      show_aster_branding: false,
    });

    const stripped = complete_server_blob({});

    delete stripped.show_aster_branding;

    server_returns(stripped);

    const { data, loaded_from_server } = await get_preferences(vault);

    expect(loaded_from_server).toBe(true);
    expect(data.show_aster_branding).toBe(false);
  });

  it("recovers a non-default undo_send_period and show_aster_branding from cache when a stale client stripped both keys", async () => {
    cache_preferences_locally({
      ...DEFAULT_PREFERENCES,
      undo_send_period: "30 seconds",
      show_aster_branding: false,
    });

    const stripped = complete_server_blob({});

    delete stripped.undo_send_period;
    delete stripped.show_aster_branding;

    server_returns(stripped);

    const { data, loaded_from_server } = await get_preferences(vault);

    expect(loaded_from_server).toBe(true);
    expect(data.undo_send_period).toBe("30 seconds");
    expect(data.undo_send_period).not.toBe(
      DEFAULT_PREFERENCES.undo_send_period,
    );
    expect(data.show_aster_branding).toBe(false);
  });

  it("falls back to the default undo_send_period when neither server nor cache carry it", async () => {
    const stripped = complete_server_blob({});

    delete stripped.undo_send_period;

    server_returns(stripped);

    const { data } = await get_preferences(vault);

    expect(data.undo_send_period).toBe("10 seconds");
  });

  it("still respects an explicit server value over the cache", async () => {
    cache_preferences_locally({
      ...DEFAULT_PREFERENCES,
      show_aster_branding: false,
    });

    server_returns(complete_server_blob({ show_aster_branding: true }));

    const { data } = await get_preferences(vault);

    expect(data.show_aster_branding).toBe(true);
  });

  it("defaults to true when neither server nor cache carry the key", async () => {
    const stripped = complete_server_blob({});

    delete stripped.show_aster_branding;

    server_returns(stripped);

    const { data } = await get_preferences(vault);

    expect(data.show_aster_branding).toBe(true);
  });

  it("does not save back to the server on a normal load (no migration churn)", async () => {
    cache_preferences_locally({
      ...DEFAULT_PREFERENCES,
      show_aster_branding: false,
    });

    const stripped = complete_server_blob({});

    delete stripped.show_aster_branding;

    server_returns(stripped);

    await get_preferences(vault);

    expect(api_client.put).not.toHaveBeenCalled();
  });

  it("moves an existing account to the advanced viewer toolbar exactly once", async () => {
    const blob = complete_server_blob({
      viewer_toolbar_mode: "simple",
      migration_viewer_toolbar_v1_done: false,
    });

    server_returns(blob);

    const first = await get_preferences(vault);

    expect(first.data.viewer_toolbar_mode).toBe("advanced");
    expect(first.data.migration_viewer_toolbar_v1_done).toBe(true);
    expect(api_client.put).toHaveBeenCalled();

    vi.clearAllMocks();
    clear_preferences_cache();
    server_returns(
      complete_server_blob({
        viewer_toolbar_mode: "simple",
        migration_viewer_toolbar_v1_done: false,
      }),
    );

    const second = await get_preferences(vault);

    expect(second.data.viewer_toolbar_mode).toBe("simple");
    expect(second.data.migration_viewer_toolbar_v1_done).toBe(true);
  });
});

describe("get_preferences when the server blob is absent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clear_preferences_cache();
  });

  it("keeps the locally cached settings instead of resetting to defaults", async () => {
    cache_preferences_locally({
      ...DEFAULT_PREFERENCES,
      show_aster_branding: false,
      inbox_page_size: 75,
    });

    (api_client.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { encrypted_preferences: "", preferences_nonce: "" },
      error: null,
    });

    const result = await get_preferences(vault);

    expect(result.data.show_aster_branding).toBe(false);
    expect(result.data.inbox_page_size).toBe(75);
  });

  it("falls back to defaults when there is no local cache", async () => {
    (api_client.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { encrypted_preferences: "", preferences_nonce: "" },
      error: null,
    });

    const result = await get_preferences(vault);

    expect(result.data.show_aster_branding).toBe(
      DEFAULT_PREFERENCES.show_aster_branding,
    );
  });
});
