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
import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import * as openpgp from "openpgp";

const h = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  unreadable: new Set<string>(),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_derived_encryption_key: () => new Uint8Array(32).fill(7),
}));

vi.mock("@/services/crypto/encrypted_storage", async () => ({
  ...(
    await import("@/tests/fixtures/storage_name_support")
  ).storage_name_support(h.store),
  encrypted_get: vi.fn(async (key: string) =>
    h.store.has(key) && !h.unreadable.has(key)
      ? JSON.parse(JSON.stringify(h.store.get(key)))
      : null,
  ),
  encrypted_set: vi.fn(async (key: string, value: unknown) => {
    h.unreadable.delete(key);
    h.store.set(key, JSON.parse(JSON.stringify(value)));
  }),
  encrypted_delete: vi.fn(async (key: string) => {
    h.unreadable.delete(key);
    h.store.delete(key);
  }),
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => "acct-1",
}));

import {
  base64_to_array,
  compute_hash,
} from "@/services/crypto/key_manager_core";
import {
  canonical_pin_id,
  resolve_pin_identity,
} from "@/services/crypto/pin_identity";
import {
  check_and_pin_identity,
  check_owner_key_pin,
  get_pinned_identity_fingerprint,
  get_pinned_owner_key_fingerprint,
  get_recipient_pin_health,
  is_recipient_flagged_untrusted,
  owner_key_fingerprint,
  trust_recipient_keys,
} from "@/services/crypto/ratchet_identity_pin";
import { KeyPinUnavailableError } from "@/services/crypto/ratchet_types";
import { clear_ratchet_verification_status } from "@/services/crypto/ratchet_verification_status";
import {
  IDENTITY_PIN_PREFIX,
  IDENTITY_UNTRUSTED_PREFIX,
  OWNER_KEY_PIN_PREFIX,
  scoped_storage_name,
} from "@/services/crypto/storage_key_names";

const KEY_A = btoa("identity-key-aaaaaaaaaaaaaaaaaaaaaaaa");
const KEY_B = btoa("identity-key-bbbbbbbbbbbbbbbbbbbbbbbb");
const PLAIN = "ab@astermail.org";
const VARIANT = " A.B+news@Astermail.org";
const LEGACY_VARIANT = "a.b+news@astermail.org";

function pin_name(prefix: string, peer: string): Promise<string> {
  return scoped_storage_name(prefix, "acct-1", peer);
}

async function seed_identity_pin(peer: string, key: string): Promise<string> {
  const name = await pin_name(IDENTITY_PIN_PREFIX, peer);

  h.store.set(name, {
    fingerprint: await compute_hash(base64_to_array(key)),
    verified: false,
    pinned_at: 1,
  });

  return name;
}

async function seed_owner_pin(peer: string, armored: string): Promise<string> {
  const name = await pin_name(OWNER_KEY_PIN_PREFIX, peer);

  h.store.set(name, {
    fingerprint: await owner_key_fingerprint(armored),
    pinned_at: 1,
  });

  return name;
}

async function make_public_key(): Promise<string> {
  const { publicKey } = await openpgp.generateKey({
    type: "ecc",
    curve: "curve25519Legacy",
    userIDs: [{ email: PLAIN }],
    format: "armored",
  });

  return publicKey;
}

beforeEach(() => {
  h.store.clear();
  h.unreadable.clear();
  clear_ratchet_verification_status();
});

describe("canonical pin id", () => {
  it("strips the tag and the dots from the local part", () => {
    expect(canonical_pin_id(VARIANT)).toBe(PLAIN);
    expect(canonical_pin_id("a.b@astermail.org")).toBe(PLAIN);
    expect(canonical_pin_id("ab+x+y@aster.cx.")).toBe("ab@aster.cx");
    expect(canonical_pin_id("A.Lice")).toBe("alice");
  });

  it("keeps an address whose base local part is empty", () => {
    expect(canonical_pin_id("+tag@astermail.org")).toBe("+tag@astermail.org");
    expect(canonical_pin_id("...@astermail.org")).toBe("...@astermail.org");
  });

  it("lists the raw spellings as legacy ids", () => {
    expect(resolve_pin_identity(VARIANT)).toEqual({
      id: PLAIN,
      legacy: [LEGACY_VARIANT, " " + LEGACY_VARIANT, "a.b@astermail.org"],
      shadow: null,
    });
    expect(resolve_pin_identity(PLAIN).legacy).toEqual([]);
  });

  it("keeps an external address as typed", () => {
    expect(resolve_pin_identity("J.Doe+x@Example.com", "external")).toEqual({
      id: "j.doe+x@example.com",
      legacy: [],
      shadow: "jdoe@example.com",
    });
  });
});

describe("identity pin across address variants", () => {
  it("resolves a dotted and tagged variant to the existing pin", async () => {
    expect(await check_and_pin_identity(PLAIN, KEY_A)).toBe("first");
    expect(await check_and_pin_identity(VARIANT, KEY_A)).toBe("ok");
    expect(await check_and_pin_identity("a.b@astermail.org", KEY_A)).toBe("ok");
  });

  it("reports a key change when a variant presents a different key", async () => {
    await check_and_pin_identity(PLAIN, KEY_A);

    const pinned = await get_pinned_identity_fingerprint(PLAIN);

    expect(await check_and_pin_identity(VARIANT, KEY_B)).toBe("drift");
    expect(await get_pinned_identity_fingerprint(VARIANT)).toBe(pinned);
  });

  it("still pins a new contact on first use", async () => {
    expect(
      await check_and_pin_identity("new.person@astermail.org", KEY_A),
    ).toBe("first");
  });

  it("finds a pin stored under the raw address and moves it", async () => {
    const legacy_name = await seed_identity_pin(LEGACY_VARIANT, KEY_A);

    expect(await check_and_pin_identity(LEGACY_VARIANT, KEY_A)).toBe("ok");
    expect(h.store.has(legacy_name)).toBe(false);
    expect(h.store.has(await pin_name(IDENTITY_PIN_PREFIX, PLAIN))).toBe(true);
    expect(await check_and_pin_identity(PLAIN, KEY_B)).toBe("drift");
  });

  it("reports a key change for a raw-address pin and a different key", async () => {
    await seed_identity_pin(LEGACY_VARIANT, KEY_A);

    expect(await check_and_pin_identity(LEGACY_VARIANT, KEY_B)).toBe("drift");
  });

  it("treats variants pinned to different keys as a key change", async () => {
    const legacy_name = await seed_identity_pin(LEGACY_VARIANT, KEY_A);
    const canonical_name = await seed_identity_pin(PLAIN, KEY_B);

    expect(await check_and_pin_identity(LEGACY_VARIANT, KEY_A)).toBe("drift");
    expect(await check_and_pin_identity(LEGACY_VARIANT, KEY_B)).toBe("drift");
    expect(h.store.has(legacy_name)).toBe(true);
    expect(h.store.has(canonical_name)).toBe(true);
    expect(await get_recipient_pin_health(LEGACY_VARIANT)).toBe("conflict");
  });

  it("settles conflicting variants once the keys are trusted", async () => {
    const legacy_name = await seed_identity_pin(LEGACY_VARIANT, KEY_A);

    await seed_identity_pin(PLAIN, KEY_B);
    await trust_recipient_keys(LEGACY_VARIANT, KEY_B, null);

    expect(h.store.has(legacy_name)).toBe(false);
    expect(await get_recipient_pin_health(LEGACY_VARIANT)).toBe("settled");
    expect(await check_and_pin_identity(PLAIN, KEY_B)).toBe("ok");
  });

  it("shares the untrusted flag across variants", async () => {
    h.store.set(await pin_name(IDENTITY_UNTRUSTED_PREFIX, LEGACY_VARIANT), {
      flagged_at: 1,
    });

    expect(await is_recipient_flagged_untrusted(PLAIN)).toBe(false);
    expect(await is_recipient_flagged_untrusted(LEGACY_VARIANT)).toBe(true);
    expect(await is_recipient_flagged_untrusted(PLAIN)).toBe(true);
  });
});

describe("unreadable pin entries", () => {
  it("does not treat an unreadable identity pin as first contact", async () => {
    const name = await seed_identity_pin(PLAIN, KEY_A);
    const stored = h.store.get(name);

    h.unreadable.add(name);

    expect(await check_and_pin_identity(PLAIN, KEY_B)).toBe("unknown");
    expect(await check_and_pin_identity(VARIANT, KEY_B)).toBe("unknown");
    expect(h.store.get(name)).toEqual(stored);
    expect(await get_recipient_pin_health(PLAIN)).toBe("unreadable");
  });

  it("does not treat an unreadable raw-address pin as first contact", async () => {
    h.unreadable.add(await seed_identity_pin(LEGACY_VARIANT, KEY_A));

    expect(await check_and_pin_identity(LEGACY_VARIANT, KEY_B)).toBe("unknown");
  });

  it("counts an unreadable untrusted flag as flagged", async () => {
    const name = await pin_name(IDENTITY_UNTRUSTED_PREFIX, PLAIN);

    h.store.set(name, { flagged_at: 1 });
    h.unreadable.add(name);

    expect(await is_recipient_flagged_untrusted(PLAIN)).toBe(true);
  });

  it("recovers once the current keys are trusted", async () => {
    h.unreadable.add(await seed_identity_pin(PLAIN, KEY_A));

    await trust_recipient_keys(PLAIN, KEY_B, null);

    expect(await get_recipient_pin_health(PLAIN)).toBe("settled");
    expect(await check_and_pin_identity(PLAIN, KEY_B)).toBe("ok");
  });
});

describe("owner key pin across address variants", () => {
  let owner_a = "";
  let owner_b = "";

  beforeAll(async () => {
    owner_a = await make_public_key();
    owner_b = await make_public_key();
  });

  it("resolves a variant to the existing owner pin", async () => {
    expect(await check_owner_key_pin(PLAIN, owner_a)).toBe("first");
    expect(await check_owner_key_pin(VARIANT, owner_a)).toBe("ok");
    expect(await check_owner_key_pin(VARIANT, owner_b)).toBe("changed");
  });

  it("finds an owner pin stored under the raw address", async () => {
    const legacy_name = await seed_owner_pin(LEGACY_VARIANT, owner_a);

    expect(await check_owner_key_pin(LEGACY_VARIANT, owner_b)).toBe("changed");
    expect(await check_owner_key_pin(LEGACY_VARIANT, owner_a)).toBe("ok");
    expect(h.store.has(legacy_name)).toBe(false);
    expect(await check_owner_key_pin(PLAIN, owner_b)).toBe("changed");
  });

  it("reports a change when variants hold different owner keys", async () => {
    await seed_owner_pin(LEGACY_VARIANT, owner_a);
    await seed_owner_pin(PLAIN, owner_b);

    expect(await check_owner_key_pin(LEGACY_VARIANT, owner_a)).toBe("changed");
    expect(await check_owner_key_pin(LEGACY_VARIANT, owner_b)).toBe("changed");
  });

  it("refuses an unreadable owner pin instead of pinning again", async () => {
    const name = await seed_owner_pin(PLAIN, owner_a);

    h.unreadable.add(name);

    await expect(check_owner_key_pin(PLAIN, owner_b)).rejects.toBeInstanceOf(
      KeyPinUnavailableError,
    );
    await expect(check_owner_key_pin(VARIANT, owner_b)).rejects.toBeInstanceOf(
      KeyPinUnavailableError,
    );
    expect(h.unreadable.has(name)).toBe(true);
  });

  it("keeps external pins on the address as typed", async () => {
    const dotted = "j.doe@example.com";

    expect(await check_owner_key_pin(dotted, owner_a, "external")).toBe(
      "first",
    );
    expect(
      await check_owner_key_pin("jdoe@example.com", owner_b, "external"),
    ).toBe("first");
    expect(await get_pinned_owner_key_fingerprint(dotted, "external")).toBe(
      await owner_key_fingerprint(owner_a),
    );
  });

  it("checks an external lookup against a hosted pin", async () => {
    await check_owner_key_pin(PLAIN, owner_a);

    expect(
      await check_owner_key_pin("a.b@astermail.org", owner_b, "external"),
    ).toBe("changed");
  });
});
