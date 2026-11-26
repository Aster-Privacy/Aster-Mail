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
  refreshed_vault: null as unknown,
  vault_fetches: 0,
  passphrase: "correct horse battery staple" as string | null,
  store: new Map<string, unknown>(),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  on_vault_cleared: () => () => {},
  on_vault_stored: () => () => {},
  get_vault_account_epoch: () => 0,
  get_vault_from_memory: () =>
    h.vault && {
      data_kek: btoa(String.fromCharCode(...new Uint8Array(32).fill(7))),
      ...(h.vault as object),
    },
  get_passphrase_from_memory: () => h.passphrase,
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

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async (url: string) => {
      if (url.includes("prekey-bundle")) return { data: h.bundle };

      if (url === "/core/v1/auth/vault") {
        h.vault_fetches++;

        return h.refreshed_vault
          ? { data: { encrypted_vault: "server_vault", vault_nonce: "n1" } }
          : { code: "NOT_FOUND" };
      }

      return { code: "NOT_FOUND" };
    }),
    put: vi.fn(async () => ({ data: { state_version: 1 } })),
    post: vi.fn(async () => ({ data: { state_version: 1 } })),
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

import {
  generate_ratchet_keys,
  encrypt_for_ratchet_recipient,
  build_ratchet_envelope,
  parse_ratchet_envelope,
  decrypt_ratchet_message,
} from "@/services/crypto/ratchet_manager";
import { reset_vault_refresh_state } from "@/services/crypto/vault_refresh";
import { reset_skip_limited_messages } from "@/services/crypto/ratchet_decrypt";
import { DoubleRatchet } from "@/services/crypto/double_ratchet";

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

async function send(plaintext: string, sender_vault: EncryptedVault) {
  h.vault = sender_vault;
  const data = await encrypt_for_ratchet_recipient(
    SENDER,
    RECIPIENT,
    "recipient",
    plaintext,
    sender_vault,
  );

  expect(data).not.toBeNull();

  const envelope = build_ratchet_envelope(
    sender_vault.ratchet_identity_public!,
    { [RECIPIENT]: data! },
  );

  return envelope;
}

async function receive(
  envelope_json: string,
  receiver_vault: EncryptedVault,
  message_id?: string,
) {
  h.vault = receiver_vault;
  const parsed = parse_ratchet_envelope(envelope_json)!;

  return decrypt_ratchet_message(
    RECIPIENT,
    SENDER,
    parsed,
    receiver_vault,
    message_id,
  );
}

function forge_message_number(envelope_json: string, message_number: number) {
  const parsed = JSON.parse(envelope_json);

  parsed.recipients[RECIPIENT].header.message_number = message_number;

  return JSON.stringify(parsed);
}

describe("messages refused for too many skipped keys", () => {
  beforeEach(() => {
    h.vault = null;
    h.bundle = null;
    h.refreshed_vault = null;
    h.vault_fetches = 0;
    h.passphrase = "correct horse battery staple";
    h.store.clear();
    reset_vault_refresh_state();
    reset_skip_limited_messages();
    localStorage.clear();
  });

  it("does not repeat the session work when the same message renders again", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const recipient_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for(recipient_vault);
    h.refreshed_vault = recipient_vault;

    const first = await send("first", sender_vault);
    const second = await send("second", sender_vault);
    const forged = forge_message_number(
      await send("third", sender_vault),
      1500,
    );

    expect(await receive(first, recipient_vault, "a1")).toBe("first");

    const decrypt_spy = vi.spyOn(DoubleRatchet.prototype, "decrypt");

    await expect(receive(forged, recipient_vault, "f1")).rejects.toThrow();

    const first_attempt_calls = decrypt_spy.mock.calls.length;

    expect(first_attempt_calls).toBeGreaterThan(0);

    await expect(receive(forged, recipient_vault, "f1")).rejects.toThrow();
    await expect(receive(forged, recipient_vault, "f1")).rejects.toThrow();

    expect(decrypt_spy.mock.calls.length).toBe(first_attempt_calls);

    expect(await receive(second, recipient_vault, "a2")).toBe("second");

    const after_progress = decrypt_spy.mock.calls.length;

    await expect(receive(forged, recipient_vault, "f1")).rejects.toThrow();

    expect(decrypt_spy.mock.calls.length).toBeGreaterThan(after_progress);

    decrypt_spy.mockRestore();
  });

  it("keeps retrying a message that failed for another reason", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const recipient_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for(recipient_vault);
    h.refreshed_vault = recipient_vault;

    const first = await send("first", sender_vault);
    const broken = JSON.parse(await send("second", sender_vault));

    broken.recipients[RECIPIENT].ciphertext = btoa("not the real ciphertext");

    expect(await receive(first, recipient_vault, "b1")).toBe("first");

    const decrypt_spy = vi.spyOn(DoubleRatchet.prototype, "decrypt");

    await expect(
      receive(JSON.stringify(broken), recipient_vault, "b2"),
    ).rejects.toThrow();

    const first_attempt_calls = decrypt_spy.mock.calls.length;

    await expect(
      receive(JSON.stringify(broken), recipient_vault, "b2"),
    ).rejects.toThrow();

    expect(decrypt_spy.mock.calls.length).toBeGreaterThan(first_attempt_calls);

    decrypt_spy.mockRestore();
  });
});
