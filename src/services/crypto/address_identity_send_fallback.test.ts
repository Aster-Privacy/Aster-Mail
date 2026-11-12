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
  lookup_status: 200,
  gets: [] as string[],
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
    get: vi.fn(async (url: string) => {
      h.gets.push(url);

      if (h.lookup_status !== 200) {
        return { error: "unavailable", status: h.lookup_status };
      }

      return h.routes.has(url)
        ? { data: JSON.parse(JSON.stringify(h.routes.get(url))), status: 200 }
        : { code: "NOT_FOUND", error: "not found", status: 404 };
    }),
    put: vi.fn(async (url: string, body: Record<string, unknown>) => {
      if (url === "/crypto/v1/ratchet/address-bundle") {
        h.uploads.push(body);

        if (h.upload_status === 0) throw new TypeError("network down");

        return h.upload_status === 200
          ? { data: { success: true, active: true }, status: 200 }
          : { error: "upload failed", status: h.upload_status };
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
} from "@/services/crypto/ratchet_manager";
import { reset_vault_refresh_state } from "@/services/crypto/vault_refresh";
import { reset_peer_session_index } from "@/services/crypto/ratchet_peer_session_fallback";
import { clear_ratchet_lookup_misses } from "@/services/crypto/ratchet_prekey_bundle";
import {
  clear_address_identity_directory_state,
  resolve_address_send_state,
} from "@/services/crypto/address_identity_directory";
import {
  clear_address_key_set_cache,
  is_primary_address,
  local_address_bundle,
  sign_address_entry,
} from "@/services/crypto/address_identity_entry";
import { derive_address_sender_identity } from "@/services/crypto/address_sender_identity";
import { clear_sender_identity_authentication_cache } from "@/services/crypto/sender_identity_authentication";

const SHOP_EMAIL = "shop@astermail.org";
const OWNER_USERNAME = "first.last";

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
  } as unknown as EncryptedVault;
}

function self_lookup(email: string): string {
  return `/crypto/v1/ratchet/identity/${encodeURIComponent(OWNER_USERNAME)}?email=${encodeURIComponent(email)}&scope=address`;
}

function serve_self(email: string, entry: Record<string, unknown>): void {
  h.routes.set(self_lookup(email), entry);
}

function account_entry(vault: EncryptedVault): Record<string, unknown> {
  return {
    user_id: "owner",
    kem_identity_key: vault.ratchet_identity_public,
    signed_prekey: vault.ratchet_signed_prekey_public,
    signed_prekey_signature: "",
    pq_kem_public_key: vault.ratchet_pq_identity_public ?? null,
  };
}

function scoped_entry(
  vault: EncryptedVault,
  email: string,
): Record<string, unknown> {
  const entry = sign_address_entry(vault, email);

  expect(entry).not.toBeNull();

  return { user_id: "owner", ...entry!, address_scoped: true };
}

function broken_vault(vault: EncryptedVault): EncryptedVault {
  return { ...vault, ratchet_identity_key: "" } as EncryptedVault;
}

function reset_state(): void {
  h.vault = null;
  h.store.clear();
  h.routes.clear();
  h.uploads.length = 0;
  h.gets.length = 0;
  h.upload_status = 503;
  h.lookup_status = 200;
  reset_vault_refresh_state();
  reset_peer_session_index();
  clear_ratchet_lookup_misses();
  clear_address_identity_directory_state();
  clear_address_key_set_cache();
  clear_sender_identity_authentication_cache();
  localStorage.clear();
}

describe("sending from an address when the entry upload fails", () => {
  let vault: EncryptedVault;
  let other_vault: EncryptedVault;

  beforeEach(async () => {
    reset_state();
    vault = make_vault((await generate_ratchet_keys())!);
    other_vault = make_vault((await generate_ratchet_keys())!);
  });

  it("uses the account key when the server has no active entry", async () => {
    serve_self(SHOP_EMAIL, account_entry(vault));

    expect(
      await resolve_address_send_state(vault, SHOP_EMAIL, OWNER_USERNAME),
    ).toBe("inactive");
    expect(h.gets).toEqual([self_lookup(SHOP_EMAIL)]);
  });

  it("uses the derived key when the active entry matches local keys", async () => {
    serve_self(SHOP_EMAIL, scoped_entry(vault, SHOP_EMAIL));

    expect(
      await resolve_address_send_state(vault, SHOP_EMAIL, OWNER_USERNAME),
    ).toBe("active");
  });

  it("treats a network error on upload like a server error", async () => {
    h.upload_status = 0;
    serve_self(SHOP_EMAIL, scoped_entry(vault, SHOP_EMAIL));

    expect(
      await resolve_address_send_state(vault, SHOP_EMAIL, OWNER_USERNAME),
    ).toBe("active");
  });

  it("refuses an active entry whose keys differ from local keys", async () => {
    serve_self(SHOP_EMAIL, scoped_entry(other_vault, SHOP_EMAIL));

    expect(
      await resolve_address_send_state(vault, SHOP_EMAIL, OWNER_USERNAME),
    ).toBe("mismatch");
  });

  it("reports unavailable when the lookup fails as well", async () => {
    h.lookup_status = 503;

    expect(
      await resolve_address_send_state(vault, SHOP_EMAIL, OWNER_USERNAME),
    ).toBe("unavailable");
  });

  it("retries the upload on the next send instead of caching the failure", async () => {
    serve_self(SHOP_EMAIL, account_entry(vault));

    await resolve_address_send_state(vault, SHOP_EMAIL, OWNER_USERNAME);
    const first_uploads = h.uploads.length;

    h.upload_status = 200;

    expect(
      await resolve_address_send_state(vault, SHOP_EMAIL, OWNER_USERNAME),
    ).toBe("active");
    expect(h.uploads.length).toBeGreaterThan(first_uploads);
  });

  it("keeps the account key without a lookup when the server has no entry support", async () => {
    h.upload_status = 404;

    expect(
      await resolve_address_send_state(vault, SHOP_EMAIL, OWNER_USERNAME),
    ).toBe("inactive");
    expect(h.gets).toEqual([]);
  });

  it("uses the account key when local derivation fails and no entry is active", async () => {
    serve_self(SHOP_EMAIL, account_entry(vault));

    expect(
      await resolve_address_send_state(
        broken_vault(vault),
        SHOP_EMAIL,
        OWNER_USERNAME,
      ),
    ).toBe("inactive");
  });

  it("refuses when local derivation fails and an entry is active", async () => {
    serve_self(SHOP_EMAIL, scoped_entry(vault, SHOP_EMAIL));

    expect(
      await resolve_address_send_state(
        broken_vault(vault),
        SHOP_EMAIL,
        OWNER_USERNAME,
      ),
    ).toBe("mismatch");
  });
});

describe("self-copy from an alias", () => {
  beforeEach(() => {
    reset_state();
  });

  it("encrypts from the local bundle with no network", async () => {
    h.lookup_status = 503;

    const vault = make_vault((await generate_ratchet_keys())!);
    const identity = derive_address_sender_identity(
      vault.ratchet_identity_key,
      SHOP_EMAIL,
    )!;
    const bundle = local_address_bundle(vault, SHOP_EMAIL);

    h.vault = vault;

    expect(bundle?.kem_identity_key).toBe(identity.identity_public);

    const data = await encrypt_for_ratchet_recipient(
      SHOP_EMAIL,
      SHOP_EMAIL,
      "shop",
      "copy for my sent folder",
      vault,
      identity,
      identity.identity_public,
      { ...bundle!, address_scoped: true },
    );

    expect(data).not.toBeNull();
    expect(data!.recovery).toBeTruthy();
    expect(
      h.gets.filter(
        (url) =>
          url.includes("/ratchet/identity/") ||
          url.includes("/ratchet/prekey-bundle/"),
      ),
    ).toEqual([]);
  });
});

describe("is_primary_address", () => {
  it("matches dotted and tagged forms of the primary", () => {
    expect(
      is_primary_address("firstlast@astermail.org", "first.last@astermail.org"),
    ).toBe(true);
    expect(
      is_primary_address(
        "First.Last+news@AsterMail.org",
        "firstlast@astermail.org",
      ),
    ).toBe(true);
  });

  it("does not match another address or domain", () => {
    expect(
      is_primary_address("shop@astermail.org", "first.last@astermail.org"),
    ).toBe(false);
    expect(
      is_primary_address("firstlast@aster.cx", "first.last@astermail.org"),
    ).toBe(false);
    expect(is_primary_address("", "first.last@astermail.org")).toBe(false);
  });

  it("treats a blank primary as the primary", () => {
    expect(is_primary_address("shop@astermail.org", null)).toBe(true);
    expect(is_primary_address("shop@astermail.org", "")).toBe(true);
    expect(is_primary_address("shop@astermail.org", "  ")).toBe(true);
  });
});
