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
  require_signed: false,
  bundle_verification: {
    verdict: "verified" as "verified" | "legacy",
    format: "v2" as "v1" | "v2" | "hash",
    strict: true,
  },
}));

vi.mock("@/services/crypto/crypto_enforcement_policy", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/crypto/crypto_enforcement_policy")
  >()),
  is_signed_ratchet_keys_required: () => h.require_signed,
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

import {
  generate_ratchet_keys,
  encrypt_for_ratchet_recipient,
  is_post_quantum_recipient_data,
} from "@/services/crypto/ratchet_manager";
import { get_peer_identity_event } from "@/services/crypto/ratchet_verification_status";

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

async function send(sender_vault: EncryptedVault) {
  h.vault = sender_vault;

  return encrypt_for_ratchet_recipient(
    SENDER,
    RECIPIENT,
    "recipient",
    "hello",
    sender_vault,
  );
}

function reset() {
  h.vault = null;
  h.bundle = null;
  h.trust = null;
  h.store.clear();
  h.require_signed = false;
  h.bundle_verification = { verdict: "verified", format: "v2", strict: true };
}

describe("recipient bundles that worked before keep working", () => {
  beforeEach(reset);

  it("delivers to a v1-signed bundle that carries a post-quantum key without flagging a downgrade", async () => {
    const sender_vault = await make_vault();

    h.bundle = pq_bundle_for(await make_vault());
    h.bundle_verification = { verdict: "verified", format: "v1", strict: false };

    const data = await send(sender_vault);

    expect(data).not.toBeNull();
    expect(get_peer_identity_event(RECIPIENT)?.event).not.toBe("downgraded");
  });

  it("encapsulates to the post-quantum key of a v1-signed bundle so the send gate passes", async () => {
    const sender_vault = await make_vault();

    h.bundle = pq_bundle_for(await make_vault());
    h.bundle_verification = { verdict: "verified", format: "v1", strict: false };

    const data = await send(sender_vault);

    expect(data?.pq_ciphertext).toBeDefined();
    expect(is_post_quantum_recipient_data(data)).toBe(true);
  });

  it("handles a hash-signed bundle from an older account the same way as before", async () => {
    const sender_vault = await make_vault();

    h.bundle = pq_bundle_for(await make_vault());
    h.bundle_verification = { verdict: "legacy", format: "hash", strict: false };

    const data = await send(sender_vault);

    expect(data).toBeNull();
    expect(get_peer_identity_event(RECIPIENT)?.event).not.toBe("downgraded");
  });

  it("falls back to the existing path for a recipient that publishes no bundle", async () => {
    const sender_vault = await make_vault();

    h.bundle = null;

    expect(await send(sender_vault)).toBeNull();
    expect(get_peer_identity_event(RECIPIENT)).toBeNull();
  });
});

describe("the switch that requires signed keys everywhere", () => {
  beforeEach(reset);

  it("routes a v1-signed bundle with an uncovered post-quantum key away from the ratchet", async () => {
    const sender_vault = await make_vault();

    h.require_signed = true;
    h.bundle = pq_bundle_for(await make_vault());
    h.bundle_verification = { verdict: "verified", format: "v1", strict: false };

    expect(await send(sender_vault)).toBeNull();
  });

  it("still sends to a bundle whose signature covers the post-quantum key", async () => {
    const sender_vault = await make_vault();

    h.require_signed = true;
    h.bundle = pq_bundle_for(await make_vault());

    const data = await send(sender_vault);

    expect(data?.pq_ciphertext).toBeDefined();
    expect(data?.pq_key_id).toBe(-1);
    expect(data?.x3dh_v).toBeGreaterThanOrEqual(3);
  });
});
