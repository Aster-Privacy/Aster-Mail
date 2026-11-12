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
    user: { id: "user-1", email: "windy@astermail.org", username: "windy" },
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
import {
  derive_address_sender_identity,
  is_own_address_identity_key,
} from "@/services/crypto/address_sender_identity";
import { import_ke_private_key } from "@/services/crypto/key_manager_ke";
import { reset_vault_refresh_state } from "@/services/crypto/vault_refresh";

const MAIN_EMAIL = "windy@astermail.org";
const SHOP_ALIAS = "shop@astermail.org";
const OTHER_ALIAS = "travel@astermail.org";
const PEER_EMAIL = "peer@astermail.org";

type Keys = NonNullable<Awaited<ReturnType<typeof generate_ratchet_keys>>>;

function make_vault(keys: Keys): EncryptedVault {
  return {
    identity_key: "",
    ratchet_identity_key: keys.identity_jwk,
    ratchet_identity_public: keys.identity_public,
    ratchet_signed_prekey: keys.signed_prekey_jwk,
    ratchet_signed_prekey_public: keys.signed_prekey_public,
    data_kek: btoa(String.fromCharCode(...new Uint8Array(32).fill(7))),
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

describe("address sender identity", () => {
  beforeEach(() => {
    h.vault = null;
    h.bundle = null;
    h.store.clear();
    reset_vault_refresh_state();
    localStorage.clear();
  });

  it("derives the same key for an address every time", async () => {
    const keys = (await generate_ratchet_keys())!;
    const first = derive_address_sender_identity(keys.identity_jwk, SHOP_ALIAS);
    const second = derive_address_sender_identity(
      keys.identity_jwk,
      "  " + SHOP_ALIAS.toUpperCase() + " ",
    );

    expect(first).not.toBeNull();
    expect(second?.identity_public).toBe(first!.identity_public);
    expect(second?.identity_jwk).toBe(first!.identity_jwk);
  });

  it("gives each address a key distinct from the account key and from other addresses", async () => {
    const keys = (await generate_ratchet_keys())!;
    const shop = derive_address_sender_identity(keys.identity_jwk, SHOP_ALIAS)!;
    const travel = derive_address_sender_identity(
      keys.identity_jwk,
      OTHER_ALIAS,
    )!;

    expect(shop.identity_public).not.toBe(keys.identity_public);
    expect(travel.identity_public).not.toBe(keys.identity_public);
    expect(shop.identity_public).not.toBe(travel.identity_public);
  });

  it("gives different accounts different keys for the same address", async () => {
    const first = (await generate_ratchet_keys())!;
    const second = (await generate_ratchet_keys())!;

    expect(
      derive_address_sender_identity(first.identity_jwk, SHOP_ALIAS)!
        .identity_public,
    ).not.toBe(
      derive_address_sender_identity(second.identity_jwk, SHOP_ALIAS)!
        .identity_public,
    );
  });

  it("produces a usable private key", async () => {
    const keys = (await generate_ratchet_keys())!;
    const shop = derive_address_sender_identity(keys.identity_jwk, SHOP_ALIAS)!;
    const imported = await import_ke_private_key(JSON.parse(shop.identity_jwk));

    expect(imported.type).toBe("private");
    expect(atob(shop.identity_public).length).toBe(65);
  });

  it("returns nothing without an account key or an address", async () => {
    const keys = (await generate_ratchet_keys())!;

    expect(derive_address_sender_identity(undefined, SHOP_ALIAS)).toBeNull();
    expect(derive_address_sender_identity(keys.identity_jwk, "  ")).toBeNull();
    expect(derive_address_sender_identity("not json", SHOP_ALIAS)).toBeNull();
  });

  it("recognizes own address keys from current and earlier account keys", async () => {
    const current = (await generate_ratchet_keys())!;
    const earlier = (await generate_ratchet_keys())!;
    const stranger = (await generate_ratchet_keys())!;
    const vault = {
      ...make_vault(current),
      ratchet_previous_keys: [
        {
          ratchet_identity_key: earlier.identity_jwk,
          ratchet_identity_public: earlier.identity_public,
          ratchet_signed_prekey: earlier.signed_prekey_jwk,
          ratchet_signed_prekey_public: earlier.signed_prekey_public,
        },
      ],
    } as EncryptedVault;

    for (const keys of [current, earlier]) {
      expect(
        is_own_address_identity_key(
          vault,
          [SHOP_ALIAS],
          derive_address_sender_identity(keys.identity_jwk, SHOP_ALIAS)!
            .identity_public,
        ),
      ).toBe(true);
    }

    expect(
      is_own_address_identity_key(
        vault,
        [SHOP_ALIAS],
        derive_address_sender_identity(stranger.identity_jwk, SHOP_ALIAS)!
          .identity_public,
      ),
    ).toBe(false);
    expect(
      is_own_address_identity_key(
        vault,
        [OTHER_ALIAS],
        derive_address_sender_identity(current.identity_jwk, SHOP_ALIAS)!
          .identity_public,
      ),
    ).toBe(false);
  });

  it("delivers mail sent with an address key to another account", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const peer_vault = make_vault((await generate_ratchet_keys())!);
    const shop = derive_address_sender_identity(
      sender_vault.ratchet_identity_key,
      SHOP_ALIAS,
    )!;

    h.vault = sender_vault;
    h.bundle = bundle_for(peer_vault);

    const data = await encrypt_for_ratchet_recipient(
      SHOP_ALIAS,
      PEER_EMAIL,
      "peer",
      "hello from the shop",
      sender_vault,
      shop,
    );

    expect(data).not.toBeNull();

    const serialized = build_ratchet_envelope(shop.identity_public, {
      [PEER_EMAIL]: data!,
    });

    expect(serialized).not.toContain(sender_vault.ratchet_identity_public!);

    const envelope = parse_ratchet_envelope(serialized)!;

    expect(envelope.sender_identity_key).toBe(shop.identity_public);

    h.store.clear();
    h.vault = peer_vault;
    h.bundle = null;

    const result = await decrypt_ratchet_message(
      PEER_EMAIL,
      SHOP_ALIAS,
      envelope,
      peer_vault,
      "received-1",
    );

    expect(result).toBe("hello from the shop");
  });

  it("keeps one session for later mail from the same address", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const peer_vault = make_vault((await generate_ratchet_keys())!);
    const shop = derive_address_sender_identity(
      sender_vault.ratchet_identity_key,
      SHOP_ALIAS,
    )!;

    h.vault = sender_vault;
    h.bundle = bundle_for(peer_vault);

    const first = await encrypt_for_ratchet_recipient(
      SHOP_ALIAS,
      PEER_EMAIL,
      "peer",
      "first",
      sender_vault,
      shop,
    );
    const second = await encrypt_for_ratchet_recipient(
      SHOP_ALIAS,
      PEER_EMAIL,
      "peer",
      "second",
      sender_vault,
      shop,
    );

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();

    h.store.clear();
    h.vault = peer_vault;
    h.bundle = null;

    const bodies: Array<string | null> = [];

    for (const [index, data] of [first!, second!].entries()) {
      const envelope = parse_ratchet_envelope(
        build_ratchet_envelope(shop.identity_public, { [PEER_EMAIL]: data }),
      )!;

      bodies.push(
        await decrypt_ratchet_message(
          PEER_EMAIL,
          SHOP_ALIAS,
          envelope,
          peer_vault,
          "received-later-" + index,
        ),
      );
    }

    expect(bodies).toEqual(["first", "second"]);
  });

  it("reads the own copy of mail sent with an address key", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const shop = derive_address_sender_identity(
      sender_vault.ratchet_identity_key,
      SHOP_ALIAS,
    )!;

    h.vault = sender_vault;
    h.bundle = bundle_for(sender_vault);

    const self_copy = await encrypt_for_ratchet_recipient(
      SHOP_ALIAS,
      SHOP_ALIAS,
      "windy",
      "own copy body",
      sender_vault,
      shop,
    );

    expect(self_copy).not.toBeNull();

    const envelope = parse_ratchet_envelope(
      build_ratchet_envelope(shop.identity_public, {
        [SHOP_ALIAS]: self_copy!,
      }),
    )!;

    expect(
      await decrypt_ratchet_message(
        MAIN_EMAIL,
        SHOP_ALIAS,
        envelope,
        sender_vault,
        "sent-1",
      ),
    ).toBe("own copy body");
  });

  it("keeps the account key when no address key is given", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const peer_vault = make_vault((await generate_ratchet_keys())!);

    h.vault = sender_vault;
    h.bundle = bundle_for(peer_vault);

    const data = await encrypt_for_ratchet_recipient(
      MAIN_EMAIL,
      PEER_EMAIL,
      "peer",
      "from the primary",
      sender_vault,
    );
    const envelope = parse_ratchet_envelope(
      build_ratchet_envelope(sender_vault.ratchet_identity_public!, {
        [PEER_EMAIL]: data!,
      }),
    )!;

    h.store.clear();
    h.vault = peer_vault;
    h.bundle = null;

    expect(
      await decrypt_ratchet_message(
        PEER_EMAIL,
        MAIN_EMAIL,
        envelope,
        peer_vault,
        "received-2",
      ),
    ).toBe("from the primary");
  });
});

describe("address sender identity vectors", () => {
  const account_jwk = JSON.stringify({
    kty: "EC",
    crv: "P-256",
    d: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE",
  });

  it("derives the keys every client agrees on", () => {
    const alias = derive_address_sender_identity(
      account_jwk,
      "shop@astermail.org",
    );
    const custom = derive_address_sender_identity(
      account_jwk,
      "me@my-domain.example",
    );

    expect(JSON.parse(alias!.identity_jwk).d).toBe(
      "4duYxbOvvRRcxvekWSpFbEShkOeroOgmYlMHjoAVfhE",
    );
    expect(alias!.identity_public).toBe(
      "BJOsUxR6RC6w1IZrJE1GLztOgrU92mUlJeLgIDBmxzpT9RjmAf0UBp10+mqQflnS9CTawHNdA7VO9oGwmyZF5zM=",
    );
    expect(JSON.parse(custom!.identity_jwk).d).toBe(
      "qcV01slvXsiYJNEGbEfh1Viym6PuREXAV1DhoR4n1y8",
    );
    expect(custom!.identity_public).toBe(
      "BIhgLU/Vm9ETcb4S5ITrI953K1Qim92xu6ZFO8QppjALcwRAkPlFRj06j20gJsKZ4tWEVH6CCJbNs7lihqZ6o6U=",
    );
  });
});
