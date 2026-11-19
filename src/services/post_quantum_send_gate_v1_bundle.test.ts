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

import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  vault: null as unknown,
  bundle: null as unknown,
  store: new Map<string, unknown>(),
  trust: null as null | "entry",
  bundle_verification: {
    verdict: "verified" as "verified" | "legacy",
    format: "v2" as "v1" | "v2" | "hash",
    strict: true,
  },
}));

vi.mock("@/services/crypto/key_manager_pgp", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/crypto/key_manager_pgp")
  >()),
  verify_ratchet_prekey_bundle_detailed: async () => h.bundle_verification,
}));

vi.mock("@/services/api/keys", async (import_original) => ({
  ...(await import_original<typeof import("@/services/api/keys")>()),
  get_recipient_public_key: async () => ({
    data: { public_key: "owner-public-key" },
  }),
}));

vi.mock("@/services/crypto/ratchet_identity_pin", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/crypto/ratchet_identity_pin")
  >()),
  check_owner_key_pin: async () => "ok" as const,
}));

vi.mock(
  "@/services/crypto/address_identity_directory",
  async (import_original) => {
    const actual =
      await import_original<
        typeof import("@/services/crypto/address_identity_directory")
      >();

    return {
      ...actual,
      resolve_recipient_identity: async (
        ...args: Parameters<typeof actual.resolve_recipient_identity>
      ) => (h.trust ? null : actual.resolve_recipient_identity(...args)),
      resolve_recipient_bundle: async (
        ...args: Parameters<typeof actual.resolve_recipient_bundle>
      ) =>
        h.trust
          ? { entry: h.bundle, scoped: true, trust: h.trust }
          : actual.resolve_recipient_bundle(...args),
    };
  },
);

vi.mock("@/services/crypto/memory_key_store", () => ({
  on_vault_cleared: () => () => {},
  on_vault_stored: () => () => {},
  get_vault_account_epoch: () => 0,
  get_vault_from_memory: () =>
    h.vault && {
      data_kek: btoa(String.fromCharCode(...new Uint8Array(32).fill(7))),
      ...(h.vault as object),
    },
  get_passphrase_from_memory: () => null,
  get_passphrase_bytes: () => null,
  get_derived_encryption_key: () => new Uint8Array(32).fill(7),
  has_vault_in_memory: () => h.vault !== null,
}));

vi.mock("@/services/crypto/encrypted_storage", async () => ({
  ...(
    await import("@/tests/fixtures/storage_name_support")
  ).storage_name_support(h.store),
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

vi.mock("@/services/crypto/ratchet_plaintext_cache", () => ({
  get_cached_ratchet_plaintext: vi.fn(async () => null),
  get_cached_ratchet_sender_key: vi.fn(async () => null),
  set_cached_ratchet_plaintext: vi.fn(async () => {}),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async (url: string) =>
      url.includes("prekey-bundle") && h.bundle
        ? { data: h.bundle }
        : { code: "NOT_FOUND" },
    ),
    put: vi.fn(async () => ({ data: { state_version: 1 } })),
    post: vi.fn(async () => ({ data: { state_version: 1 } })),
    delete: vi.fn(async () => ({})),
  },
}));

vi.mock("@/services/crypto/ensure_ratchet_keys", () => ({
  ensure_ratchet_keys: vi.fn(async () => {}),
}));

vi.mock("@/services/account_manager", async (import_original) => ({
  ...(await import_original<typeof import("@/services/account_manager")>()),
  get_current_account: vi.fn(async () => ({
    user: { id: "user-1", username: "sender", email: "sender@astermail.org" },
  })),
  get_current_account_id: vi.fn(async () => "user-1"),
}));

vi.mock("@/services/send_queue_recipients", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/send_queue_recipients")
  >()),
  resolve_username_for_key_lookup: vi.fn(async () => "recipient"),
  resolve_own_username_for_key_lookup: vi.fn(async () => null),
}));

import { generate_ratchet_keys } from "@/services/crypto/ratchet_manager";
import { encrypt_for_recipients } from "@/services/send_queue_encryption";

const SENDER = "sender@astermail.org";
const RECIPIENT = "recipient@astermail.org";

function to_base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

async function make_vault(): Promise<EncryptedVault> {
  const keys = (await generate_ratchet_keys())!;

  return {
    identity_key: "",
    ratchet_identity_key: keys.identity_jwk,
    ratchet_identity_public: keys.identity_public,
    ratchet_signed_prekey: keys.signed_prekey_jwk,
    ratchet_signed_prekey_public: keys.signed_prekey_public,
  } as unknown as EncryptedVault;
}

function pq_bundle_for(vault: EncryptedVault) {
  return {
    kem_identity_key: vault.ratchet_identity_public,
    signed_prekey: vault.ratchet_signed_prekey_public,
    signed_prekey_signature: "",
    one_time_prekey: null,
    pq_prekey: null,
    pq_kem_public_key: to_base64(ml_kem768.keygen().publicKey),
  };
}

describe("post-quantum send gate for v1-signed recipient bundles", () => {
  beforeEach(() => {
    h.vault = null;
    h.bundle = null;
    h.trust = null;
    h.store.clear();
    h.bundle_verification = { verdict: "verified", format: "v1", strict: false };
  });

  it("sends to a v1-signed bundle with a post-quantum key without an override", async () => {
    h.vault = await make_vault();
    h.bundle = pq_bundle_for(await make_vault());

    const result = await encrypt_for_recipients("body", [RECIPIENT], SENDER);

    expect(result.is_encrypted).toBe(true);

    const envelope = JSON.parse(result.encrypted_body) as {
      type: string;
      recipients: Record<string, { pq_ciphertext?: string }>;
    };

    expect(envelope.type).toBe("double_ratchet_v2");
    expect(envelope.recipients[RECIPIENT]?.pq_ciphertext).toBeDefined();
  });
});
