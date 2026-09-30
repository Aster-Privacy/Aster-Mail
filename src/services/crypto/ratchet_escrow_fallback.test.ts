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

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/services/crypto/key_manager_pgp", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/crypto/key_manager_pgp")
  >()),
  verify_ratchet_prekey_bundle_detailed: async () => ({
    verdict: "verified" as const,
    format: "v2" as const,
    strict: true,
  }),
}));

const h = vi.hoisted(() => ({
  vault: null as unknown,
  bundle: null as unknown,
  escrow: new Map<string, string>(),
  escrow_fetches: 0,
  store: new Map<string, unknown>(),
}));

vi.mock("@/services/account_manager", () => ({
  accounts_storage_unreadable: vi.fn(() => false),
  get_current_account: vi.fn(async () => ({
    user: {
      id: "user-1",
      email: "recipient@astermail.org",
      username: "recipient",
    },
  })),
  get_current_account_id: vi.fn(async () => "user-1"),
}));

vi.mock("@/services/crypto/encrypted_storage", () => ({
  encrypted_get: vi.fn(async (key: string) =>
    h.store.has(key) ? JSON.parse(JSON.stringify(h.store.get(key))) : undefined,
  ),
  encrypted_set: vi.fn(async (key: string, value: unknown) => {
    h.store.set(key, JSON.parse(JSON.stringify(value)));
  }),
  encrypted_delete: vi.fn(async (key: string) => {
    h.store.delete(key);
  }),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => h.vault,
  get_passphrase_from_memory: () => null,
  get_passphrase_bytes: () => null,
  get_derived_encryption_key: () => new Uint8Array(32).fill(7),
  has_vault_in_memory: () => h.vault !== null,
  store_vault_in_memory: vi.fn(async (vault: unknown) => {
    h.vault = vault;
  }),
}));

vi.mock("@/services/crypto/ratchet_plaintext_cache", () => ({
  get_cached_ratchet_plaintext: vi.fn(async () => null),
  set_cached_ratchet_plaintext: vi.fn(async () => {}),
}));

vi.mock("@/services/crypto/message_escrow", () => ({
  upload_to_escrow: vi.fn(async () => {}),
  fetch_from_escrow: vi.fn(async (dedupe_key: string) => {
    h.escrow_fetches++;

    return h.escrow.get(dedupe_key) ?? null;
  }),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async (url: string) => {
      if (url.includes("prekey-bundle")) return { data: h.bundle };

      return { code: "NOT_FOUND" };
    }),
    put: vi.fn(async () => ({ data: { state_version: 1 } })),
    post: vi.fn(async () => ({ data: { state_version: 1 } })),
    delete: vi.fn(async () => ({})),
  },
}));

import {
  generate_ratchet_keys,
  encrypt_for_ratchet_recipient,
  build_ratchet_envelope,
  parse_ratchet_envelope,
  decrypt_ratchet_message,
} from "@/services/crypto/ratchet_manager";
import { reset_vault_refresh_state } from "@/services/crypto/vault_refresh";
import { fetch_from_escrow } from "@/services/crypto/message_escrow";

const SENDER = "sender@astermail.org";
const RECIPIENT = "recipient@astermail.org";

type Keys = NonNullable<Awaited<ReturnType<typeof generate_ratchet_keys>>>;

function make_vault(keys: Keys): EncryptedVault {
  return {
    identity_key: "",
    ratchet_identity_key: keys.identity_jwk,
    ratchet_identity_public: keys.identity_public,
    ratchet_signed_prekey: keys.signed_prekey_jwk,
    ratchet_signed_prekey_public: keys.signed_prekey_public,
  } as unknown as EncryptedVault;
}

function bundle_for(vault: EncryptedVault) {
  return {
    kem_identity_key: vault.ratchet_identity_public,
    signed_prekey: vault.ratchet_signed_prekey_public,
    signed_prekey_signature: "",
    one_time_prekey: null,
    pq_prekey: null,
  };
}

describe("escrow fallback when live ratchet decryption throws", () => {
  beforeEach(() => {
    h.vault = null;
    h.bundle = null;
    h.escrow.clear();
    h.escrow_fetches = 0;
    h.store.clear();
    reset_vault_refresh_state();
    localStorage.clear();
  });

  it("recovers the plaintext from escrow when every local key set throws", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const target_vault = make_vault((await generate_ratchet_keys())!);
    const wrong_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for(target_vault);
    h.vault = sender_vault;

    const data = await encrypt_for_ratchet_recipient(
      SENDER,
      RECIPIENT,
      "recipient",
      "escrowed content",
      sender_vault,
    );

    expect(data).not.toBeNull();

    const envelope = parse_ratchet_envelope(
      build_ratchet_envelope(sender_vault.ratchet_identity_public!, {
        [RECIPIENT]: data!,
      }),
    )!;

    const dedupe_key = `m1:${data!.header.dh_public}:${data!.header.message_number}`;

    h.escrow.set(dedupe_key, "escrowed content");
    h.vault = wrong_vault;

    const result = await decrypt_ratchet_message(
      RECIPIENT,
      SENDER,
      envelope,
      wrong_vault,
      "m1",
    );

    expect(result).toBe("escrowed content");
    expect(h.escrow_fetches).toBe(1);
  });

  it("still surfaces the decrypt error when escrow has nothing", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const target_vault = make_vault((await generate_ratchet_keys())!);
    const wrong_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for(target_vault);
    h.vault = sender_vault;

    const data = await encrypt_for_ratchet_recipient(
      SENDER,
      RECIPIENT,
      "recipient",
      "lost content",
      sender_vault,
    );

    const envelope = parse_ratchet_envelope(
      build_ratchet_envelope(sender_vault.ratchet_identity_public!, {
        [RECIPIENT]: data!,
      }),
    )!;

    h.vault = wrong_vault;

    await expect(
      decrypt_ratchet_message(RECIPIENT, SENDER, envelope, wrong_vault, "m2"),
    ).rejects.toThrow();

    expect(vi.mocked(fetch_from_escrow)).toHaveBeenCalled();
  });
});
