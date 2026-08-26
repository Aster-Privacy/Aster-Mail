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
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  vault: null as unknown,
  refreshed_vault: null as unknown,
  vault_fetches: 0,
  passphrase: "correct horse battery staple" as string | null,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => h.vault,
  get_passphrase_from_memory: () => h.passphrase,
  get_passphrase_bytes: () => new Uint8Array(32).fill(1),
  has_vault_in_memory: () => h.vault !== null,
  wait_for_keys_ready: vi.fn(async () => {}),
  store_vault_in_memory: vi.fn(async (vault: unknown) => {
    h.vault = vault;
  }),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async (url: string) => {
      if (url === "/core/v1/auth/vault") {
        h.vault_fetches++;

        return h.refreshed_vault
          ? { data: { encrypted_vault: "server_vault", vault_nonce: "n1" } }
          : { code: "NOT_FOUND" };
      }

      return { code: "NOT_FOUND" };
    }),
    put: vi.fn(async () => ({ data: {} })),
    post: vi.fn(async () => ({ data: {} })),
    delete: vi.fn(async () => ({})),
  },
}));

vi.mock("@/services/account_manager", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  get_current_account: vi.fn(async () => ({ user: { id: "user-1" } })),
}));

vi.mock("@/services/crypto/key_manager", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  decrypt_vault: vi.fn(async () => h.refreshed_vault),
}));

import { decrypt_envelope } from "@/hooks/email_list_helpers/decrypt";
import { reset_vault_refresh_state } from "@/services/crypto/vault_refresh";
import { encrypt_envelope_with_identity_key } from "@/services/crypto/envelope";

describe("email list legacy envelope decrypt heals with a refreshed vault", () => {
  beforeEach(() => {
    h.vault = null;
    h.refreshed_vault = null;
    h.vault_fetches = 0;
    h.passphrase = "correct horse battery staple";
    reset_vault_refresh_state();
    localStorage.clear();
  });

  it("recovers an envelope sealed to a rotated identity key after a vault refresh", async () => {
    h.vault = { identity_key: "stale-identity-key" };
    h.refreshed_vault = { identity_key: "rotated-identity-key" };

    const sealed = await encrypt_envelope_with_identity_key(
      {
        subject: "healed by refresh",
        from: { name: "A", email: "a@example.com" },
      },
      "rotated-identity-key",
    );

    const result = await decrypt_envelope(sealed.encrypted, sealed.nonce);

    expect(result?.subject).toBe("healed by refresh");
    expect(h.vault_fetches).toBe(1);
  });

  it("decrypts follow-up envelopes without refetching the vault", async () => {
    h.vault = { identity_key: "stale-identity-key" };
    h.refreshed_vault = { identity_key: "rotated-identity-key" };

    const first = await encrypt_envelope_with_identity_key(
      { subject: "first" },
      "rotated-identity-key",
    );
    const second = await encrypt_envelope_with_identity_key(
      { subject: "second" },
      "rotated-identity-key",
    );

    const first_result = await decrypt_envelope(first.encrypted, first.nonce);
    const second_result = await decrypt_envelope(
      second.encrypted,
      second.nonce,
    );

    expect(first_result?.subject).toBe("first");
    expect(second_result?.subject).toBe("second");
    expect(h.vault_fetches).toBe(1);
  });

  it("still decrypts with the in-memory identity key without any fetch", async () => {
    h.vault = { identity_key: "current-identity-key" };

    const sealed = await encrypt_envelope_with_identity_key(
      { subject: "no heal needed" },
      "current-identity-key",
    );

    const result = await decrypt_envelope(sealed.encrypted, sealed.nonce);

    expect(result?.subject).toBe("no heal needed");
    expect(h.vault_fetches).toBe(0);
  });

  it("returns null when the refreshed vault cannot decrypt either", async () => {
    h.vault = { identity_key: "stale-identity-key" };
    h.refreshed_vault = { identity_key: "still-wrong-key" };

    const sealed = await encrypt_envelope_with_identity_key(
      { subject: "unreachable" },
      "unrelated-key",
    );

    expect(await decrypt_envelope(sealed.encrypted, sealed.nonce)).toBeNull();
    expect(h.vault_fetches).toBe(1);
  });
});
