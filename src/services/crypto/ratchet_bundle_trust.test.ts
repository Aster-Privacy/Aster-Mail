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
  trust: null as null | "entry" | "endorsed",
  pin_read_fails: false,
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
  encrypted_get: vi.fn(async (key: string) => {
    if (h.pin_read_fails && key.startsWith("ratchet_identity_pin_")) {
      throw new Error("decrypt failed");
    }

    return h.store.has(key)
      ? JSON.parse(JSON.stringify(h.store.get(key)))
      : undefined;
  }),
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
  recipient_post_quantum_status,
} from "@/services/crypto/ratchet_manager";
import { is_identity_bound_by_current_bundle } from "@/services/crypto/ratchet_encrypt";
import { RecipientPinUnreadableError } from "@/services/crypto/ratchet_types";
import {
  has_peer_signed_pq,
  lookup_identity_pin_record,
} from "@/services/crypto/ratchet_identity_pin";

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
  h.pin_read_fails = false;
  h.store.clear();
  h.bundle_verification = { verdict: "verified", format: "v2", strict: true };
}

describe("recipient bundle trust", () => {
  beforeEach(reset);

  it("never records a post-quantum key the signature does not cover as signed", async () => {
    const sender_vault = await make_vault();

    h.bundle = pq_bundle_for(await make_vault());
    h.bundle_verification = { verdict: "verified", format: "v1", strict: false };

    const data = await send(sender_vault);

    expect(data?.pq_ciphertext).toBeDefined();
    expect(await has_peer_signed_pq(RECIPIENT)).toBe(false);
    expect(
      await recipient_post_quantum_status(SENDER, RECIPIENT, "recipient"),
    ).toBe("unsupported");
  });

  it("does not pin a self-signed address entry as verified on first contact", async () => {
    const sender_vault = await make_vault();

    h.bundle = pq_bundle_for(await make_vault());
    h.trust = "entry";

    const data = await send(sender_vault);
    const pin = await lookup_identity_pin_record(RECIPIENT);

    expect(data).not.toBeNull();
    expect(pin).not.toBeNull();
    expect(pin).not.toBe("unreadable");
    expect((pin as { verified?: boolean }).verified).toBe(false);
  });

  it("refuses to call a contact without a signed post-quantum key unsupported when its pin cannot be read", async () => {
    h.vault = await make_vault();
    h.bundle = { ...pq_bundle_for(await make_vault()), pq_kem_public_key: null };
    h.pin_read_fails = true;

    await expect(
      recipient_post_quantum_status(SENDER, RECIPIENT, "recipient"),
    ).rejects.toBeInstanceOf(RecipientPinUnreadableError);
  });

  it("does not count a self-signed address entry as binding a sender identity on first contact", async () => {
    h.vault = await make_vault();
    h.bundle = pq_bundle_for(await make_vault());
    h.trust = "entry";

    const identity = (h.bundle as { kem_identity_key: string }).kem_identity_key;

    expect(await is_identity_bound_by_current_bundle(RECIPIENT, identity)).toBe(
      false,
    );
  });

  it("counts an endorsed address entry as binding a sender identity", async () => {
    h.vault = await make_vault();
    h.bundle = pq_bundle_for(await make_vault());
    h.trust = "endorsed";

    const identity = (h.bundle as { kem_identity_key: string }).kem_identity_key;

    expect(await is_identity_bound_by_current_bundle(RECIPIENT, identity)).toBe(
      true,
    );
  });

  it("keeps post-quantum sending for a self-signed address entry on first contact", async () => {
    h.vault = await make_vault();
    h.bundle = pq_bundle_for(await make_vault());
    h.trust = "entry";

    expect(
      await recipient_post_quantum_status(SENDER, RECIPIENT, "recipient"),
    ).toBe("supported");
    expect(await send(h.vault as EncryptedVault)).not.toBeNull();
  });
});
