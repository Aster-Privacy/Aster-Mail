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
  store: new Map<string, unknown>(),
}));

vi.mock("@/services/account_manager", () => ({
  accounts_storage_unreadable: vi.fn(() => false),
  get_current_account: vi.fn(async () => ({
    user: {
      id: "user-1",
      email: "first.last@astermail.org",
      username: "first.last",
    },
  })),
  get_current_account_id: vi.fn(async () => "user-1"),
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
  fetch_from_escrow: vi.fn(async () => null),
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
  derive_conversation_id,
  generate_ratchet_keys,
  encrypt_for_ratchet_recipient,
  build_ratchet_envelope,
  parse_ratchet_envelope,
  decrypt_ratchet_message,
} from "@/services/crypto/ratchet_manager";
import { reset_vault_refresh_state } from "@/services/crypto/vault_refresh";
import { scoped_storage_name } from "@/services/crypto/storage_key_names";

const CANONICAL_EMAIL = "firstlast@astermail.org";
const DISPLAY_EMAIL = "first.last@astermail.org";
const PEER_EMAIL = "carol@astermail.org";

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

async function send_from_peer(
  peer_vault: EncryptedVault,
  recipient_key: string,
  body: string,
) {
  const data = await encrypt_for_ratchet_recipient(
    PEER_EMAIL,
    recipient_key,
    "firstlast",
    body,
    peer_vault,
  );

  expect(data).not.toBeNull();

  return parse_ratchet_envelope(
    build_ratchet_envelope(peer_vault.ratchet_identity_public!, {
      [recipient_key]: data!,
    }),
  )!;
}

function stored_state_keys(): string[] {
  return [...h.store.keys()];
}

describe("dotted primary address", () => {
  beforeEach(() => {
    h.vault = null;
    h.bundle = null;
    h.store.clear();
    reset_vault_refresh_state();
    localStorage.clear();
  });

  it("decrypts mail keyed to the dotless address while the account shows the dotted one", async () => {
    const peer_vault = make_vault((await generate_ratchet_keys())!);
    const own_vault = make_vault((await generate_ratchet_keys())!);

    h.vault = own_vault;
    h.bundle = bundle_for(own_vault);

    const first = await send_from_peer(peer_vault, CANONICAL_EMAIL, "one");

    expect(
      await decrypt_ratchet_message(
        DISPLAY_EMAIL,
        PEER_EMAIL,
        first,
        own_vault,
        "m-1",
      ),
    ).toBe("one");

    const second = await send_from_peer(peer_vault, CANONICAL_EMAIL, "two");

    expect(
      await decrypt_ratchet_message(
        DISPLAY_EMAIL,
        PEER_EMAIL,
        second,
        own_vault,
        "m-2",
      ),
    ).toBe("two");
  });

  it("keeps the conversation id the dotless address produced before", async () => {
    const peer_vault = make_vault((await generate_ratchet_keys())!);
    const own_vault = make_vault((await generate_ratchet_keys())!);

    h.vault = own_vault;
    h.bundle = bundle_for(own_vault);

    const envelope = await send_from_peer(peer_vault, CANONICAL_EMAIL, "hi");
    const peer_state_keys = stored_state_keys();

    await decrypt_ratchet_message(
      DISPLAY_EMAIL,
      PEER_EMAIL,
      envelope,
      own_vault,
      "m-3",
    );

    const canonical_id = await derive_conversation_id(
      CANONICAL_EMAIL,
      PEER_EMAIL,
    );
    const display_id = await derive_conversation_id(DISPLAY_EMAIL, PEER_EMAIL);
    const canonical_name = await scoped_storage_name(
      "ratchet_state_",
      "user-1",
      canonical_id,
    );
    const display_name = await scoped_storage_name(
      "ratchet_state_",
      "user-1",
      display_id,
    );
    const own_state_keys = stored_state_keys().filter(
      (key) => !peer_state_keys.includes(key),
    );

    expect(own_state_keys).not.toContain(display_name);
    expect(stored_state_keys()).toContain(canonical_name);
    expect(stored_state_keys().some((key) => key.includes(canonical_id))).toBe(
      false,
    );
  });
});
