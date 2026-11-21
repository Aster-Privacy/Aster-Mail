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
import { describe, expect, it } from "vitest";

import { array_to_base64, base64_to_array } from "../base64";

import {
  build_reseal_keys,
  derive_escrow_aes_key,
  seal_under_new,
} from "./reseal_keys";

const LOGIN_PROOF_V1 = new Uint8Array(32).fill(9);
const DATA_KEK = new Uint8Array(32).fill(1);
const PLAINTEXT = new TextEncoder().encode("stored item");

async function proof_reseal_keys() {
  const keys = await build_reseal_keys(
    { data_kek: array_to_base64(DATA_KEK), data_kek_random: true },
    { untrusted_old_raws: [LOGIN_PROOF_V1.slice()] },
  );

  expect(keys).not.toBeNull();

  return keys!;
}

async function opens(
  key: CryptoKey,
  sealed: { ciphertext: string; nonce: string },
): Promise<boolean> {
  try {
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64_to_array(sealed.nonce) },
      key,
      base64_to_array(sealed.ciphertext),
    );

    return true;
  } catch {
    return false;
  }
}

describe("keys from the v1 login proof", () => {
  it("open envelopes but can never seal one", async () => {
    const keys = await proof_reseal_keys();

    expect(keys.untrusted_envelope).toHaveLength(1);
    for (const key of keys.untrusted_envelope) {
      expect(key.usages).toEqual(["decrypt"]);
      await expect(
        crypto.subtle.encrypt(
          { name: "AES-GCM", iv: new Uint8Array(12) },
          key,
          PLAINTEXT,
        ),
      ).rejects.toBeDefined();
    }
    keys.dispose();
  });

  it("never key what a reseal writes", async () => {
    const keys = await proof_reseal_keys();
    const proof_aes = await crypto.subtle.importKey(
      "raw",
      LOGIN_PROOF_V1,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
    const proof_escrow = await derive_escrow_aes_key(LOGIN_PROOF_V1);
    const stored = await seal_under_new(keys, PLAINTEXT);
    const escrowed = await seal_under_new(
      keys,
      PLAINTEXT,
      undefined,
      keys.new_escrow,
    );

    expect(await opens(keys.new_aes, stored)).toBe(true);
    expect(await opens(proof_aes, stored)).toBe(false);
    expect(await opens(keys.new_escrow, escrowed)).toBe(true);
    expect(await opens(proof_escrow, escrowed)).toBe(false);
    for (const key of keys.untrusted_envelope) {
      expect(await opens(key, stored)).toBe(false);
    }
    keys.dispose();
  });
});
