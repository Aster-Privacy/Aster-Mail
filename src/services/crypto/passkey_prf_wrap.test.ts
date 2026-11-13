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

import {
  assertion_verified_user,
  open_passphrase_with_prf,
  seal_passphrase_with_prf,
} from "./passkey_prf_wrap";

const PRF_OUTPUT = Uint8Array.from({ length: 32 }, (_, i) => i + 1).buffer;
const CREDENTIAL_ID = Uint8Array.from({ length: 16 }, (_, i) => 0x10 + i);
const OTHER_CREDENTIAL_ID = Uint8Array.from({ length: 16 }, (_, i) => 0x40 + i);
const VECTOR_NONCE = "oKGio6Slpqeoqaqr";
const UNBOUND_VECTOR = "9PRytl50HjsZhcqIme/ZlG3gB9RbcgC8PKBdXsIFKYZP";
const BOUND_VECTOR = "4rrq0JEBoOQ3jCSzOI2h+8YyQo/vlZr+fsIWWkKjndVO";

function authenticator_data(flags: number): ArrayBuffer {
  const bytes = new Uint8Array(37);

  bytes[32] = flags;

  return bytes.buffer;
}

describe("passkey passphrase wrap", () => {
  it("opens a wrap stored before wraps were bound to a passkey", async () => {
    expect(
      await open_passphrase_with_prf(
        PRF_OUTPUT,
        UNBOUND_VECTOR,
        VECTOR_NONCE,
        CREDENTIAL_ID,
      ),
    ).toBe("vector passphrase");
    expect(
      await open_passphrase_with_prf(
        PRF_OUTPUT,
        UNBOUND_VECTOR,
        VECTOR_NONCE,
        null,
      ),
    ).toBe("vector passphrase");
  });

  it("opens the bound wrap every client writes", async () => {
    expect(
      await open_passphrase_with_prf(
        PRF_OUTPUT,
        BOUND_VECTOR,
        VECTOR_NONCE,
        CREDENTIAL_ID,
      ),
    ).toBe("vector passphrase");
  });

  it("refuses a bound wrap presented for another passkey", async () => {
    expect(
      await open_passphrase_with_prf(
        PRF_OUTPUT,
        BOUND_VECTOR,
        VECTOR_NONCE,
        OTHER_CREDENTIAL_ID,
      ),
    ).toBeNull();
    expect(
      await open_passphrase_with_prf(
        PRF_OUTPUT,
        BOUND_VECTOR,
        VECTOR_NONCE,
        null,
      ),
    ).toBeNull();
  });

  it("seals a new wrap bound to its passkey", async () => {
    const sealed = await seal_passphrase_with_prf(
      PRF_OUTPUT,
      "round trip",
      CREDENTIAL_ID,
    );

    expect(sealed).not.toBeNull();
    expect(atob(sealed!.nonce).length).toBe(12);
    expect(
      await open_passphrase_with_prf(
        PRF_OUTPUT,
        sealed!.encrypted,
        sealed!.nonce,
        CREDENTIAL_ID,
      ),
    ).toBe("round trip");
    expect(
      await open_passphrase_with_prf(
        PRF_OUTPUT,
        sealed!.encrypted,
        sealed!.nonce,
        OTHER_CREDENTIAL_ID,
      ),
    ).toBeNull();
  });

  it("never seals a wrap without a passkey to bind it to", async () => {
    expect(
      await seal_passphrase_with_prf(PRF_OUTPUT, "x", new Uint8Array(0)),
    ).toBeNull();
  });

  it("returns nothing for input that is not base64", async () => {
    expect(
      await open_passphrase_with_prf(PRF_OUTPUT, "***", VECTOR_NONCE, null),
    ).toBeNull();
  });
});

describe("assertion user verification", () => {
  it("accepts an assertion only when the user was verified", () => {
    expect(assertion_verified_user(authenticator_data(0x05))).toBe(true);
    expect(assertion_verified_user(authenticator_data(0x01))).toBe(false);
    expect(assertion_verified_user(new Uint8Array(32).buffer)).toBe(false);
  });
});
