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
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

const h = vi.hoisted(() => ({
  vault: null as unknown,
  bundle: null as unknown,
  store: new Map<string, unknown>(),
  verification: {
    verdict: "verified" as const,
    format: "v2" as "v1" | "v2",
    strict: true,
  },
}));

vi.mock("@/services/crypto/key_manager_pgp", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/crypto/key_manager_pgp")
  >()),
  verify_ratchet_prekey_bundle_detailed: async () => ({ ...h.verification }),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  on_vault_cleared: () => () => {},
  on_vault_stored: () => () => {},
  get_vault_account_epoch: () => 0,
  get_vault_from_memory: () =>
    h.vault
      ? {
          data_kek: Buffer.from(new Uint8Array(32).fill(7)).toString("base64"),
          ...(h.vault as object),
        }
      : null,
  get_passphrase_from_memory: () => null,
  get_passphrase_bytes: () => null,
  get_derived_encryption_key: () => new Uint8Array(32).fill(7),
  has_vault_in_memory: () => h.vault !== null,
  store_vault_in_memory: vi.fn(async (vault: unknown) => {
    h.vault = vault;
  }),
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

vi.mock("@/services/crypto/message_escrow", () => ({
  upload_to_escrow: vi.fn(async () => {}),
  fetch_from_escrow: vi.fn(async () => null),
  fetch_verified_from_escrow: vi.fn(async () => null),
}));

vi.mock(
  "@/services/crypto/sender_identity_authentication",
  async (import_original) => {
    const actual =
      await import_original<
        typeof import("@/services/crypto/sender_identity_authentication")
      >();

    return {
      ...actual,
      note_message_sender_identity: vi.fn(actual.note_message_sender_identity),
    };
  },
);

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async (url: string) =>
      url.includes("prekey-bundle")
        ? { data: h.bundle }
        : { code: "NOT_FOUND" },
    ),
    put: vi.fn(async () => ({ data: { state_version: 1 } })),
    post: vi.fn(async () => ({ data: { state_version: 1 } })),
    delete: vi.fn(async () => ({})),
  },
}));

vi.mock("@/services/account_manager", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  get_current_account: vi.fn(async () => ({ user: { id: "user-1" } })),
}));

import {
  generate_ratchet_keys,
  encrypt_for_ratchet_recipient,
  build_ratchet_envelope,
  parse_ratchet_envelope,
  decrypt_ratchet_message,
} from "@/services/crypto/ratchet_manager";

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
    ratchet_pq_identity_key: keys.pq_identity_secret,
    ratchet_pq_identity_public: keys.pq_identity_public,
    ratchet_pq_identity_seed: keys.pq_identity_seed,
  } as unknown as EncryptedVault;
}

function bundle_for(vault: EncryptedVault, post_quantum = true) {
  return {
    kem_identity_key: vault.ratchet_identity_public,
    signed_prekey: vault.ratchet_signed_prekey_public,
    signed_prekey_signature: "",
    one_time_prekey: null,
    pq_prekey: null,
    pq_kem_public_key: post_quantum ? vault.ratchet_pq_identity_public : null,
  };
}

async function send(body: string, sender_vault: EncryptedVault) {
  h.vault = sender_vault;

  return encrypt_for_ratchet_recipient(
    SENDER,
    RECIPIENT,
    "recipient",
    body,
    sender_vault,
  );
}

async function receive(
  data: NonNullable<Awaited<ReturnType<typeof send>>>,
  sender_vault: EncryptedVault,
  receiver_vault: EncryptedVault,
) {
  const sender_store = new Map(h.store);

  h.store.clear();
  h.vault = receiver_vault;

  const parsed = parse_ratchet_envelope(
    build_ratchet_envelope(sender_vault.ratchet_identity_public!, {
      [RECIPIENT]: data,
    }),
  )!;

  try {
    return await decrypt_ratchet_message(
      RECIPIENT,
      SENDER,
      parsed,
      receiver_vault,
    );
  } finally {
    h.store.clear();
    for (const [key, value] of sender_store) h.store.set(key, value);
  }
}

function strip_field(value: unknown, field: string): void {
  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    if (key === field) delete (value as Record<string, unknown>)[key];
    else strip_field(child, field);
  }
}

function claims_post_quantum_with_classical_lane(
  data: Awaited<ReturnType<typeof send>>,
): boolean {
  return Boolean(data?.pq_ciphertext) && !data?.recovery?.kem_ct;
}

const SIGNED_V2 = { verdict: "verified", format: "v2", strict: true } as const;
const UNSIGNED_V1 = { verdict: "verified", format: "v1", strict: false } as const;

function reset_harness(): void {
  h.vault = null;
  h.bundle = null;
  h.store.clear();
  h.verification = { ...SIGNED_V2 };
  localStorage.clear();
}

function bundle_with_onetime_prekey(vault: EncryptedVault) {
  return {
    ...bundle_for(vault),
    pq_prekey: {
      key_id: 77,
      public_key: Buffer.from(ml_kem768.keygen().publicKey).toString("base64"),
    },
  };
}

describe("post-quantum session signature", () => {
  beforeEach(reset_harness);

  it("restarts a session built on an unsigned one-time prekey once the owner signs the post-quantum key", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const receiver_vault = make_vault((await generate_ratchet_keys())!);

    h.verification = { ...UNSIGNED_V1 };
    h.bundle = bundle_with_onetime_prekey(receiver_vault);

    const first = await send("one", sender_vault);

    expect(first?.pq_key_id).toBe(77);

    h.verification = { ...SIGNED_V2 };

    const second = await send("two", sender_vault);
    const third = await send("three", sender_vault);

    expect(second?.pq_key_id).toBe(-1);
    expect(second?.ephemeral_key).not.toBe(first?.ephemeral_key);
    expect(third?.ephemeral_key).toBe(second?.ephemeral_key);
    expect(await receive(second!, sender_vault, receiver_vault)).toBe("two");
  });

  it("keeps a one-time prekey session while the owner signature does not cover the post-quantum key", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const receiver_vault = make_vault((await generate_ratchet_keys())!);

    h.verification = { ...UNSIGNED_V1 };
    h.bundle = bundle_with_onetime_prekey(receiver_vault);

    const first = await send("one", sender_vault);
    const second = await send("two", sender_vault);

    expect(second?.ephemeral_key).toBe(first?.ephemeral_key);
  });
});

describe("recovery lane post-quantum parity", () => {
  beforeEach(reset_harness);

  it("seals the first message lane with the post-quantum identity", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const receiver_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for(receiver_vault);

    const first = await send("one", sender_vault);

    expect(first?.pq_ciphertext).toBeTruthy();
    expect(first?.recovery?.kem_ct).toBeTruthy();
  });

  it("keeps a post-quantum lane when a later bundle omits the post-quantum key", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const receiver_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for(receiver_vault);
    await send("one", sender_vault);

    h.bundle = bundle_for(receiver_vault, false);

    const second = await send("two", sender_vault);

    expect(claims_post_quantum_with_classical_lane(second)).toBe(false);
    expect(second?.recovery?.kem_ct).toBeTruthy();
  });

  it("never pairs a post-quantum body with a classical lane when the session lost its lane key", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const receiver_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for(receiver_vault);
    await send("one", sender_vault);

    for (const value of h.store.values()) {
      strip_field(value, "recipient_pq_identity_key");
    }
    h.bundle = bundle_for(receiver_vault, false);

    const second = await send("two", sender_vault);

    expect(claims_post_quantum_with_classical_lane(second)).toBe(false);
  });

  it("restarts a classical session once the recipient advertises a post-quantum key", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const receiver_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for(receiver_vault, false);

    const first = await send("one", sender_vault);

    expect(first?.pq_ciphertext).toBeFalsy();

    h.bundle = bundle_for(receiver_vault);

    const second = await send("two", sender_vault);

    expect(second?.pq_ciphertext).toBeTruthy();
    expect(second?.recovery?.kem_ct).toBeTruthy();

    const third = await send("three", sender_vault);

    expect(third?.ephemeral_key).toBe(second?.ephemeral_key);
    expect(third?.recovery?.kem_ct).toBeTruthy();
  });

  it("delivers the restarted post-quantum session to the recipient", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const receiver_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for(receiver_vault, false);
    await send("one", sender_vault);

    h.bundle = bundle_for(receiver_vault);

    const second = await send("two", sender_vault);

    expect(second).not.toBeNull();
    expect(await receive(second!, sender_vault, receiver_vault)).toBe("two");
  });
});
