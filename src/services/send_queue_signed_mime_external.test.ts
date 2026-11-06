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
import type { PrivateKey } from "openpgp";

import * as openpgp from "openpgp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { build_signed_mime_payload } from "./send_queue_signed_mime";

const PASSPHRASE = "external-signing-test";

const state = vi.hoisted(() => ({
  identity_key: undefined as string | undefined,
  external_key: null as PrivateKey | null,
  select_calls: 0,
}));

vi.mock("./crypto/memory_key_store", () => ({
  get_vault_from_memory: () => ({ identity_key: state.identity_key }),
  get_passphrase_from_memory: () => PASSPHRASE,
}));

vi.mock("./crypto/external_pgp_key", () => ({
  get_external_signing_key: () => state.external_key,
}));

vi.mock("./crypto/published_signing_key", () => ({
  select_published_signing_key: async () => {
    state.select_calls += 1;

    return state.identity_key ?? null;
  },
}));

let internal_public: string;
let external_private: PrivateKey;
let external_public: string;

async function verifies_with(
  armored_public: string,
  entity_b64: string,
  signature: string,
): Promise<boolean> {
  const bytes = Uint8Array.from(atob(entity_b64), (char) => char.charCodeAt(0));
  const result = await openpgp.verify({
    message: await openpgp.createMessage({ binary: bytes }),
    signature: await openpgp.readSignature({ armoredSignature: signature }),
    verificationKeys: await openpgp.readKey({ armoredKey: armored_public }),
    expectSigned: false,
  });

  try {
    return await result.signatures[0].verified;
  } catch {
    return false;
  }
}

function send() {
  return build_signed_mime_payload({
    subject: "Hello",
    body: "<p>Hello</p>",
    from: "owner@astermail.org",
    to: ["friend@example.org"],
    cc: [],
  });
}

beforeAll(async () => {
  const internal = await openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ email: "owner@astermail.org" }],
    passphrase: PASSPHRASE,
    format: "armored",
  });
  const external = await openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ email: "owner@astermail.org" }],
    format: "object",
  });

  state.identity_key = internal.privateKey;
  internal_public = internal.publicKey;
  external_private = external.privateKey;
  external_public = external.publicKey.armor();
}, 60_000);

beforeEach(() => {
  state.external_key = null;
  state.select_calls = 0;
});

describe("outbound signing key selection", () => {
  it("signs with the published external key and skips the internal lookup", async () => {
    state.external_key = external_private;

    const payload = await send();

    expect(payload).toBeDefined();
    expect(state.select_calls).toBe(0);
    expect(
      await verifies_with(
        external_public,
        payload!.signed_mime,
        payload!.signed_mime_signature,
      ),
    ).toBe(true);
    expect(
      await verifies_with(
        internal_public,
        payload!.signed_mime,
        payload!.signed_mime_signature,
      ),
    ).toBe(false);
  });

  it("signs with the internal key when no external key is published", async () => {
    const payload = await send();

    expect(payload).toBeDefined();
    expect(state.select_calls).toBe(1);
    expect(
      await verifies_with(
        internal_public,
        payload!.signed_mime,
        payload!.signed_mime_signature,
      ),
    ).toBe(true);
  });
});
