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
import { describe, it, expect } from "vitest";
import * as openpgp from "openpgp";

import {
  micalg_for_signature_hashes,
  sign_detached,
} from "./key_manager_pgp_messages";

const PASSPHRASE = "correct horse battery staple";

describe("signature hash label", () => {
  it("names the strong hash a signature used", () => {
    expect(micalg_for_signature_hashes([8])).toBe("pgp-sha256");
    expect(micalg_for_signature_hashes([10])).toBe("pgp-sha512");
  });

  it("lists each hash once when signatures use different hashes", () => {
    expect(micalg_for_signature_hashes([10, 8, 10])).toBe(
      "pgp-sha512,pgp-sha256",
    );
  });

  it("refuses MD5, SHA-1, and RIPEMD-160", () => {
    expect(micalg_for_signature_hashes([1])).toBeNull();
    expect(micalg_for_signature_hashes([2])).toBeNull();
    expect(micalg_for_signature_hashes([3])).toBeNull();
  });

  it("refuses a set that mixes a weak hash with a strong one", () => {
    expect(micalg_for_signature_hashes([10, 2])).toBeNull();
  });

  it("refuses an unknown, missing, or empty hash list", () => {
    expect(micalg_for_signature_hashes([99])).toBeNull();
    expect(micalg_for_signature_hashes([null])).toBeNull();
    expect(micalg_for_signature_hashes([undefined])).toBeNull();
    expect(micalg_for_signature_hashes([])).toBeNull();
  });

  it("labels a real detached signature with the hash it carries", async () => {
    const { privateKey } = await openpgp.generateKey({
      type: "ecc",
      curve: "ed25519Legacy",
      userIDs: [{ name: "test_user", email: "test_user@aster.cx" }],
      passphrase: PASSPHRASE,
      format: "armored",
    });
    const signed = await sign_detached(new Uint8Array([1, 2, 3]), {
      armored_secret_key: privateKey,
      passphrase: PASSPHRASE,
    });

    expect(signed).not.toBeNull();
    const parsed = await openpgp.readSignature({
      armoredSignature: signed!.signature,
    });

    expect(signed!.micalg).toBe(
      micalg_for_signature_hashes([parsed.packets[0].hashAlgorithm]),
    );
    expect(signed!.micalg).toMatch(/^pgp-sha(256|384|512)$/);
  });
});
