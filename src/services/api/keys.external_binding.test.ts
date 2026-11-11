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
import * as openpgp from "openpgp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  post: vi.fn(),
}));

vi.mock("./client", () => ({
  api_client: { get: vi.fn(), post: h.post },
}));

import {
  clear_external_key_cache,
  discover_external_key,
  discover_external_keys_batch,
} from "./keys";

const ADDRESS = "person@example.com";

let bound_key = "";
let bound_fingerprint = "";
let other_address_key = "";
let sign_only_key = "";
let revoked_key = "";

async function generate(email: string, encryption = true) {
  return openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ email }],
    subkeys: encryption ? [{}] : [],
    format: "armored",
  });
}

function discovered(public_key: string, fingerprint: string | null) {
  return {
    email: ADDRESS,
    found: true,
    public_key,
    fingerprint,
    source: "wkd",
    expires_at: null,
    will_encrypt: true,
    fingerprint_change: null,
  };
}

async function discover_batch(public_key: string, fingerprint: string | null) {
  h.post.mockResolvedValue({
    data: { keys: [discovered(public_key, fingerprint)] },
  });

  const response = await discover_external_keys_batch([ADDRESS]);

  return response.data![0];
}

describe("external key binding", () => {
  beforeAll(async () => {
    const bound = await generate("Person@Example.com");

    bound_key = bound.publicKey;
    bound_fingerprint = (await openpgp.readKey({ armoredKey: bound_key }))
      .getFingerprint()
      .toUpperCase();
    other_address_key = (await generate("someone.else@example.com")).publicKey;
    sign_only_key = (await generate(ADDRESS, false)).publicKey;

    const revocable = await generate(ADDRESS);
    const revoked = await openpgp.revokeKey({
      key: await openpgp.readPrivateKey({ armoredKey: revocable.privateKey }),
      format: "armored",
    });

    revoked_key = revoked.publicKey;
  });

  beforeEach(() => {
    clear_external_key_cache();
    h.post.mockReset();
  });

  it("keeps a key whose user ID matches the address", async () => {
    const info = await discover_batch(bound_key, bound_fingerprint);

    expect(info.found).toBe(true);
    expect(info.public_key).toBe(bound_key);
    expect(info.will_encrypt).toBe(true);
  });

  it("keeps a binary key sent as base64 and returns it armored", async () => {
    const parsed = await openpgp.readKey({ armoredKey: bound_key });
    const encoded = btoa(String.fromCharCode(...parsed.write()));
    const info = await discover_batch(encoded, bound_fingerprint);

    expect(info.found).toBe(true);
    expect(info.will_encrypt).toBe(true);
    expect(info.public_key).toContain("-----BEGIN PGP PUBLIC KEY BLOCK-----");

    const reread = await openpgp.readKey({ armoredKey: info.public_key! });

    expect(reread.getFingerprint().toUpperCase()).toBe(bound_fingerprint);
  });

  it("drops a base64 binary key issued for a different address", async () => {
    const parsed = await openpgp.readKey({ armoredKey: other_address_key });
    const encoded = btoa(String.fromCharCode(...parsed.write()));
    const info = await discover_batch(encoded, null);

    expect(info.found).toBe(false);
    expect(info.public_key).toBeNull();
  });

  it("accepts a fingerprint written with spaces and lowercase", async () => {
    const spaced = bound_fingerprint.toLowerCase().replace(/(.{4})/g, "$1 ");
    const info = await discover_batch(bound_key, spaced);

    expect(info.found).toBe(true);
  });

  it("keeps a bound key when the server sends no fingerprint", async () => {
    const info = await discover_batch(bound_key, null);

    expect(info.found).toBe(true);
  });

  it("drops a key issued for a different address", async () => {
    const info = await discover_batch(other_address_key, null);

    expect(info).toMatchObject({
      email: ADDRESS,
      found: false,
      public_key: null,
      fingerprint: null,
      will_encrypt: false,
      fingerprint_change: null,
    });
  });

  it("drops a key whose fingerprint does not match the server's", async () => {
    const info = await discover_batch(bound_key, "AB".repeat(20));

    expect(info.found).toBe(false);
    expect(info.will_encrypt).toBe(false);
  });

  it("drops a key with no encryption subkey", async () => {
    const info = await discover_batch(sign_only_key, null);

    expect(info.found).toBe(false);
  });

  it("drops a revoked key", async () => {
    const info = await discover_batch(revoked_key, null);

    expect(info.found).toBe(false);
  });

  it("drops a key that cannot be parsed", async () => {
    const info = await discover_batch("not a key", null);

    expect(info.found).toBe(false);
  });

  it("vets single-address discovery the same way", async () => {
    h.post.mockResolvedValue({ data: discovered(other_address_key, null) });

    const response = await discover_external_key(ADDRESS);

    expect(response.data?.found).toBe(false);
    expect(response.data?.public_key).toBeNull();
  });

  it("leaves a not-found result unchanged", async () => {
    h.post.mockResolvedValue({
      data: {
        keys: [
          {
            ...discovered(bound_key, null),
            found: false,
            public_key: null,
            will_encrypt: false,
          },
        ],
      },
    });

    const response = await discover_external_keys_batch([ADDRESS]);

    expect(response.data![0].found).toBe(false);
  });
});
