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
  directory: new Map<string, unknown>(),
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
  get_cached_ratchet_sender_key: vi.fn(async () => null),
  set_cached_ratchet_plaintext: vi.fn(async () => {}),
}));

vi.mock("@/services/crypto/message_escrow", () => ({
  upload_to_escrow: vi.fn(async () => {}),
  fetch_from_escrow: vi.fn(async () => null),
  fetch_verified_from_escrow: vi.fn(async () => null),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async (url: string) => {
      if (url.includes("prekey-bundle") && url.includes("support")) {
        return { data: h.bundle };
      }
      if (url.includes("/ratchet/identity/") && h.directory.has(url)) {
        return { data: { kem_identity_key: h.directory.get(url) } };
      }

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
import { reset_peer_session_index } from "@/services/crypto/ratchet_peer_session_fallback";

const SUPPORT_EMAIL = "support@astermail.org";
const PRIMARY_EMAIL = "pat@astermail.org";
const CUSTOM_EMAIL = "pat@example.com";

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

function identity_url(email: string): string {
  return `/crypto/v1/ratchet/identity/pat?email=${encodeURIComponent(email)}`;
}

const sender_store = new Map<string, unknown>();
const reader_store = new Map<string, unknown>();

async function as_party<T>(
  party: Map<string, unknown>,
  task: () => Promise<T>,
): Promise<T> {
  h.store.clear();
  for (const [key, value] of party) h.store.set(key, value);

  try {
    return await task();
  } finally {
    party.clear();
    for (const [key, value] of h.store) party.set(key, value);
  }
}

async function send_under_primary(
  sender_vault: EncryptedVault,
  body: string,
  bootstrap = false,
) {
  return as_party(sender_store, async () => {
    const data = await encrypt_for_ratchet_recipient(
      PRIMARY_EMAIL,
      SUPPORT_EMAIL,
      "support",
      body,
      sender_vault,
    );

    expect(data).not.toBeNull();

    const continuation = bootstrap
      ? data!
      : {
          ...data!,
          ephemeral_key: undefined as unknown as string,
          pq_ciphertext: undefined,
          pq_key_id: undefined,
          recovery: undefined,
        };

    return parse_ratchet_envelope(
      build_ratchet_envelope(sender_vault.ratchet_identity_public!, {
        [SUPPORT_EMAIL]: continuation,
      }),
    )!;
  });
}

async function read_as(
  reader_vault: EncryptedVault,
  sender_email: string,
  envelope: NonNullable<ReturnType<typeof parse_ratchet_envelope>>,
  message_id: string,
): Promise<string | null> {
  return as_party(reader_store, async () => {
    h.vault = reader_vault;

    try {
      return await decrypt_ratchet_message(
        SUPPORT_EMAIL,
        sender_email,
        envelope,
        reader_vault,
        message_id,
      );
    } catch {
      return null;
    }
  });
}

describe("mail sent from a custom address under the primary session", () => {
  let sender_vault: EncryptedVault;
  let reader_vault: EncryptedVault;

  beforeEach(async () => {
    h.vault = null;
    h.store.clear();
    h.directory.clear();
    sender_store.clear();
    reader_store.clear();
    reset_vault_refresh_state();
    reset_peer_session_index();
    localStorage.clear();

    sender_vault = make_vault((await generate_ratchet_keys())!);
    reader_vault = make_vault((await generate_ratchet_keys())!);
    h.vault = reader_vault;
    h.bundle = bundle_for(reader_vault);
    h.directory.set(
      identity_url(PRIMARY_EMAIL),
      sender_vault.ratchet_identity_public,
    );

    const opener = await send_under_primary(sender_vault, "opener", true);

    expect(await read_as(reader_vault, PRIMARY_EMAIL, opener, "m-0")).toBe(
      "opener",
    );
  });

  it("decrypts it through the session the sender identity already has", async () => {
    h.directory.set(
      identity_url(CUSTOM_EMAIL),
      sender_vault.ratchet_identity_public,
    );

    const first = await send_under_primary(sender_vault, "first");
    const second = await send_under_primary(sender_vault, "second");

    expect(await read_as(reader_vault, CUSTOM_EMAIL, second, "m-2")).toBe(
      "second",
    );
    expect(await read_as(reader_vault, CUSTOM_EMAIL, first, "m-1")).toBe(
      "first",
    );

    const after = await send_under_primary(sender_vault, "after");

    expect(await read_as(reader_vault, PRIMARY_EMAIL, after, "m-3")).toBe(
      "after",
    );
  });

  it("still reads the primary session normally", async () => {
    const first = await send_under_primary(sender_vault, "first");
    expect(await read_as(reader_vault, PRIMARY_EMAIL, first, "c-1")).toBe("first");
  });

  it("stays unreadable without a session for the sender identity", async () => {
    h.directory.set(
      identity_url(CUSTOM_EMAIL),
      sender_vault.ratchet_identity_public,
    );
    reader_store.clear();
    reset_peer_session_index();

    const stuck = await send_under_primary(sender_vault, "stuck");

    expect(
      await read_as(reader_vault, CUSTOM_EMAIL, stuck, "m-6"),
    ).not.toBe("stuck");
  });

  it("refuses when the directory does not confirm the sender identity", async () => {
    const stuck = await send_under_primary(sender_vault, "stuck");

    expect(
      await read_as(reader_vault, CUSTOM_EMAIL, stuck, "m-4"),
    ).not.toBe("stuck");
  });

  it("refuses when the directory names a different identity", async () => {
    const other_vault = make_vault((await generate_ratchet_keys())!);

    h.directory.set(
      identity_url(CUSTOM_EMAIL),
      other_vault.ratchet_identity_public,
    );

    const stuck = await send_under_primary(sender_vault, "stuck");

    expect(
      await read_as(reader_vault, CUSTOM_EMAIL, stuck, "m-5"),
    ).not.toBe("stuck");
  });
});
