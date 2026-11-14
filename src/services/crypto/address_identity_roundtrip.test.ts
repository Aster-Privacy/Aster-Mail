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
  store: new Map<string, unknown>(),
  routes: new Map<string, unknown>(),
  uploads: [] as Array<Record<string, unknown>>,
  upload_status: 200,
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
  get_vault_from_memory: () =>
    h.vault && {
      data_kek: btoa(String.fromCharCode(...new Uint8Array(32).fill(7))),
      ...(h.vault as object),
    },
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
    get: vi.fn(async (url: string) =>
      h.routes.has(url)
        ? { data: JSON.parse(JSON.stringify(h.routes.get(url))), status: 200 }
        : { code: "NOT_FOUND", error: "not found", status: 404 },
    ),
    put: vi.fn(async (url: string, body: Record<string, unknown>) => {
      if (url === "/crypto/v1/ratchet/address-bundle") {
        h.uploads.push(body);

        return h.upload_status === 200
          ? { data: { success: true, active: true }, status: 200 }
          : { error: "not found", status: h.upload_status };
      }

      return { data: { state_version: 1 } };
    }),
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
import { clear_ratchet_lookup_misses } from "@/services/crypto/ratchet_prekey_bundle";
import {
  clear_address_identity_directory_state,
  ensure_address_entry,
  resolve_recipient_bundle,
} from "@/services/crypto/address_identity_directory";
import {
  clear_address_key_set_cache,
  sign_address_entry,
  verify_address_entry,
  type SignedAddressEntry,
} from "@/services/crypto/address_identity_entry";
import {
  derive_address_sender_identity,
  type SenderIdentity,
} from "@/services/crypto/address_sender_identity";
import {
  authenticate_sender_identity,
  clear_sender_identity_authentication_cache,
} from "@/services/crypto/sender_identity_authentication";

const PRIMARY_EMAIL = "pat@astermail.org";
const SHOP_EMAIL = "shop@astermail.org";
const NEWS_EMAIL = "news.letter@astermail.org";
const SUPPORT_EMAIL = "support@astermail.org";
const HELP_EMAIL = "help@astermail.org";
const NEWCOMER_EMAIL = "sam@astermail.org";

type Keys = NonNullable<Awaited<ReturnType<typeof generate_ratchet_keys>>>;
type Envelope = NonNullable<ReturnType<typeof parse_ratchet_envelope>>;

function make_vault(keys: Keys, with_pq = false): EncryptedVault {
  return {
    identity_key: "",
    ratchet_identity_key: keys.identity_jwk,
    ratchet_identity_public: keys.identity_public,
    ratchet_signed_prekey: keys.signed_prekey_jwk,
    ratchet_signed_prekey_public: keys.signed_prekey_public,
    ...(with_pq
      ? {
          ratchet_pq_identity_key: keys.pq_identity_secret,
          ratchet_pq_identity_public: keys.pq_identity_public,
        }
      : {}),
  } as unknown as EncryptedVault;
}

function lookup(kind: string, email: string, scoped = false): string {
  const username = email.split("@")[0];
  const scope = scoped ? "&scope=address" : "";

  return `/crypto/v1/ratchet/${kind}/${encodeURIComponent(username)}?email=${encodeURIComponent(email)}${scope}`;
}

function history_lookup(email: string): string {
  const username = email.split("@")[0];

  return `/crypto/v1/ratchet/prekey-bundle/${encodeURIComponent(username)}/history?email=${encodeURIComponent(email)}&scope=address`;
}

function account_bundle(vault: EncryptedVault) {
  return {
    kem_identity_key: vault.ratchet_identity_public,
    signed_prekey: vault.ratchet_signed_prekey_public,
    signed_prekey_signature: "",
    one_time_prekey: null,
    pq_prekey: null,
  };
}

function scoped_bundle(entry: SignedAddressEntry) {
  return {
    kem_identity_key: entry.kem_identity_key,
    signed_prekey: entry.signed_prekey,
    signed_prekey_signature: entry.signed_prekey_signature,
    pq_kem_public_key: entry.pq_kem_public_key ?? null,
    one_time_prekey: null,
    pq_prekey: null,
    address_scoped: true,
  };
}

function serve_account(email: string, vault: EncryptedVault): void {
  for (const kind of ["prekey-bundle", "identity"]) {
    h.routes.set(lookup(kind, email), account_bundle(vault));
    h.routes.set(lookup(kind, email, true), account_bundle(vault));
  }
}

function serve_entry(
  email: string,
  vault: EncryptedVault,
): SignedAddressEntry {
  const entry = sign_address_entry(vault, email);

  expect(entry).not.toBeNull();

  for (const kind of ["prekey-bundle", "identity"]) {
    h.routes.set(lookup(kind, email, true), scoped_bundle(entry!));
  }

  h.routes.set(history_lookup(email), {
    user_id: "owner",
    entries: [
      {
        kem_identity_key: entry!.kem_identity_key,
        first_published_at: "2026-11-12T00:00:00Z",
        last_published_at: "2026-11-12T00:00:00Z",
      },
    ],
    history_complete: true,
    address_scoped: true,
  });
  clear_ratchet_lookup_misses();

  return entry!;
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

async function send(
  sender_vault: EncryptedVault,
  from: string,
  to: string,
  body: string,
  bootstrap: boolean,
  identity?: SenderIdentity,
): Promise<Envelope> {
  return as_party(sender_store, async () => {
    h.vault = sender_vault;

    const data = await encrypt_for_ratchet_recipient(
      from,
      to,
      to.split("@")[0],
      body,
      sender_vault,
      identity,
    );

    expect(data).not.toBeNull();

    const sealed = bootstrap
      ? data!
      : {
          ...data!,
          ephemeral_key: undefined as unknown as string,
          pq_ciphertext: undefined,
          pq_key_id: undefined,
          recovery: undefined,
        };

    return parse_ratchet_envelope(
      build_ratchet_envelope(
        identity?.identity_public ?? sender_vault.ratchet_identity_public!,
        { [to]: sealed },
      ),
    )!;
  });
}

async function read(
  reader_vault: EncryptedVault,
  our_email: string,
  sender_email: string,
  envelope: Envelope,
  message_id: string,
): Promise<string | null> {
  return as_party(reader_store, async () => {
    h.vault = reader_vault;

    try {
      return await decrypt_ratchet_message(
        our_email,
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

describe("per-address key directory entries", () => {
  let sender_vault: EncryptedVault;
  let reader_vault: EncryptedVault;

  beforeEach(async () => {
    h.vault = null;
    h.store.clear();
    h.routes.clear();
    h.uploads.length = 0;
    h.upload_status = 200;
    sender_store.clear();
    reader_store.clear();
    reset_vault_refresh_state();
    reset_peer_session_index();
    clear_ratchet_lookup_misses();
    clear_address_identity_directory_state();
    clear_address_key_set_cache();
    clear_sender_identity_authentication_cache();
    localStorage.clear();

    sender_vault = make_vault((await generate_ratchet_keys())!);
    reader_vault = make_vault((await generate_ratchet_keys())!);
    serve_account(PRIMARY_EMAIL, sender_vault);
    serve_account(SUPPORT_EMAIL, reader_vault);
    serve_account(HELP_EMAIL, reader_vault);
  });

  it("publishes a different key for each alias of one account", async () => {
    const vault = make_vault((await generate_ratchet_keys())!, true);

    expect(await ensure_address_entry(vault, SHOP_EMAIL)).toBe(true);
    expect(await ensure_address_entry(vault, NEWS_EMAIL)).toBe(true);

    const by_address = new Map(
      h.uploads.map((upload) => [upload.address as string, upload]),
    );
    const shop = by_address.get(SHOP_EMAIL)!;
    const news = by_address.get(NEWS_EMAIL)!;
    const identities = new Set(
      h.uploads.map((upload) => upload.kem_identity_key),
    );

    expect(shop).toBeTruthy();
    expect(news).toBeTruthy();
    expect(identities.size).toBe(h.uploads.length);
    expect(identities.has(vault.ratchet_identity_public)).toBe(false);
    expect(shop.kem_identity_key).not.toBe(news.kem_identity_key);
    expect(shop.signed_prekey).not.toBe(news.signed_prekey);
    expect(shop.pq_kem_public_key).toBeTruthy();
    expect(shop.pq_kem_public_key).not.toBe(news.pq_kem_public_key);
    expect(shop.pq_kem_public_key).not.toBe(vault.ratchet_pq_identity_public);
    expect(
      verify_address_entry(SHOP_EMAIL, shop as unknown as SignedAddressEntry)
        .valid,
    ).toBe(true);
    expect(
      verify_address_entry(NEWS_EMAIL, news as unknown as SignedAddressEntry)
        .valid,
    ).toBe(true);
    expect(
      verify_address_entry(NEWS_EMAIL, shop as unknown as SignedAddressEntry)
        .valid,
    ).toBe(false);
  });

  it("stays on the account key when the server has no entry support", async () => {
    h.upload_status = 404;

    expect(await ensure_address_entry(sender_vault, SHOP_EMAIL)).toBe(false);
    expect(await ensure_address_entry(sender_vault, NEWS_EMAIL)).toBe(false);
    expect(h.uploads).toHaveLength(1);
  });

  it("verifies a message from an alias against the alias entry", async () => {
    const alias_identity = derive_address_sender_identity(
      sender_vault.ratchet_identity_key,
      SHOP_EMAIL,
    )!;

    h.routes.set(lookup("identity", SHOP_EMAIL), account_bundle(sender_vault));

    expect(
      await as_party(reader_store, () =>
        authenticate_sender_identity(
          SHOP_EMAIL,
          alias_identity.identity_public,
        ),
      ),
    ).not.toBe("verified");

    const entry = serve_entry(SHOP_EMAIL, sender_vault);

    expect(entry.kem_identity_key).toBe(alias_identity.identity_public);
    expect(entry.kem_identity_key).not.toBe(
      sender_vault.ratchet_identity_public,
    );

    clear_sender_identity_authentication_cache();

    const envelope = await send(
      sender_vault,
      SHOP_EMAIL,
      SUPPORT_EMAIL,
      "from the shop alias",
      true,
      alias_identity,
    );

    expect(envelope.sender_identity_key).toBe(alias_identity.identity_public);
    expect(
      await read(reader_vault, SUPPORT_EMAIL, SHOP_EMAIL, envelope, "a-1"),
    ).toBe("from the shop alias");
    expect(
      await as_party(reader_store, () =>
        authenticate_sender_identity(
          SHOP_EMAIL,
          alias_identity.identity_public,
        ),
      ),
    ).toBe("verified");
  });

  it("keeps a conversation that started before the address had an entry", async () => {
    const opener = await send(
      sender_vault,
      PRIMARY_EMAIL,
      HELP_EMAIL,
      "opener",
      true,
    );

    expect(
      await read(reader_vault, HELP_EMAIL, PRIMARY_EMAIL, opener, "c-0"),
    ).toBe("opener");

    serve_entry(HELP_EMAIL, reader_vault);

    const resolved = await as_party(sender_store, () =>
      resolve_recipient_bundle(
        "help",
        HELP_EMAIL,
        reader_vault.ratchet_identity_public,
      ),
    );

    expect(resolved?.scoped).toBe(false);
    expect(resolved?.trust).toBe("account");
    expect(resolved?.entry.kem_identity_key).toBe(
      reader_vault.ratchet_identity_public,
    );

    const next = await send(sender_vault, PRIMARY_EMAIL, HELP_EMAIL, "next", false);

    expect(
      await read(reader_vault, HELP_EMAIL, PRIMARY_EMAIL, next, "c-1"),
    ).toBe("next");
  });

  it("opens an old-format envelope and one sealed to the address entry", async () => {
    const legacy = await send(
      sender_vault,
      PRIMARY_EMAIL,
      HELP_EMAIL,
      "sealed to the account key",
      true,
    );

    expect(legacy.sender_identity_key).toBe(
      sender_vault.ratchet_identity_public,
    );

    const entry = serve_entry(HELP_EMAIL, reader_vault);

    expect(
      await read(reader_vault, HELP_EMAIL, PRIMARY_EMAIL, legacy, "o-1"),
    ).toBe("sealed to the account key");

    const newcomer_vault = make_vault((await generate_ratchet_keys())!);

    serve_account(NEWCOMER_EMAIL, newcomer_vault);
    sender_store.clear();

    const scoped = await send(
      newcomer_vault,
      NEWCOMER_EMAIL,
      HELP_EMAIL,
      "sealed to the address entry",
      true,
    );

    expect(entry.kem_identity_key).not.toBe(
      reader_vault.ratchet_identity_public,
    );
    expect(
      await read(reader_vault, HELP_EMAIL, NEWCOMER_EMAIL, scoped, "o-2"),
    ).toBe("sealed to the address entry");
  });
});
