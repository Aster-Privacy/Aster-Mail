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
import type { EncryptedVault } from "./key_manager";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  server_vault: null as EncryptedVault | null,
  memory: null as EncryptedVault | null,
  stored: [] as EncryptedVault[],
  marker: undefined as number | undefined,
}));

vi.mock("../api/client", () => ({
  api_client: {
    get: vi.fn(async () => ({
      data: {
        encrypted_vault: "sealed",
        vault_nonce: "nonce",
        vault_recovered_write_count: state.marker,
      },
    })),
  },
}));

vi.mock("../account_manager", () => ({
  get_current_account: async () => ({ user: { id: "user-refresh" } }),
}));

vi.mock("./key_manager", () => ({
  decrypt_vault: vi.fn(async () => state.server_vault),
}));

vi.mock("./memory_key_store", () => ({
  get_passphrase_from_memory: () => "pass",
  get_vault_from_memory: () => state.memory,
  store_vault_in_memory: vi.fn(async (vault: EncryptedVault) => {
    state.stored.push(vault);
  }),
}));

import {
  adopt_refreshed_vault,
  fetch_refreshed_vault,
  reset_vault_refresh_state,
} from "./vault_refresh";
import {
  pin_vault_generation,
  read_vault_generation_pin,
} from "./vault_generation";

function vault_at(generation: number, identity: string): EncryptedVault {
  return {
    identity_key: "id",
    vault_generation: generation,
    ratchet_identity_public: identity,
  } as unknown as EncryptedVault;
}

beforeEach(() => {
  reset_vault_refresh_state();
  state.stored = [];
  state.marker = undefined;
  state.memory = vault_at(5, "current-identity");
  pin_vault_generation("user-refresh", state.memory);
});

afterEach(() => {
  localStorage.clear();
});

describe("vault refresh", () => {
  it("refuses an older copy of the vault", async () => {
    state.server_vault = vault_at(2, "old-identity");

    expect(await fetch_refreshed_vault()).toBeNull();
    await expect(
      adopt_refreshed_vault({
        vault: state.server_vault,
        encrypted_vault: "sealed",
        vault_nonce: "nonce",
        user_id: "user-refresh",
      }),
    ).resolves.toBe(false);
    expect(state.stored).toHaveLength(0);
  });

  it("adopts a newer copy of the vault", async () => {
    state.server_vault = vault_at(6, "new-identity");

    const refreshed = await fetch_refreshed_vault();

    expect(refreshed?.vault).toBe(state.server_vault);
    await expect(adopt_refreshed_vault(refreshed as NonNullable<typeof refreshed>)).resolves.toBe(true);
    expect(state.stored).toHaveLength(1);
  });

  it("adopts an older copy once the server reports a recovery", async () => {
    state.server_vault = vault_at(2, "old-identity");
    state.marker = 3;

    const refreshed = await fetch_refreshed_vault();

    expect(refreshed?.vault).toBe(state.server_vault);
    expect(read_vault_generation_pin("user-refresh")).toBe(2);
    await expect(adopt_refreshed_vault(refreshed as NonNullable<typeof refreshed>)).resolves.toBe(true);
    expect(state.stored).toHaveLength(1);
  });
});
