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
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { p256 } from "@noble/curves/nist.js";
import { gcm } from "@noble/ciphers/aes";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, randomBytes } from "@noble/hashes/utils";

import {
  GUARD_ACTION,
  PANIC_SUBJECT,
  approve_subject,
  build_action_message,
  compress_p256,
  concat_bytes,
  id_subject,
  keys_digest,
  number_hash,
  random_number,
  switches_subject,
} from "./guard_action";
import { guard_code_at, guard_code_for_step } from "./guard_code";
import {
  GuardSealError,
  code_secret_aad,
  context_aad,
  guard_seal_key,
  open_guard_seal,
} from "./guard_seal";
import {
  format_rescue_code,
  generate_rescue_code,
  normalize_rescue_code,
} from "./guard_rescue_code";

const USER_ID = "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0";
const REQUEST_ID = "00112233-4455-6677-8899-aabbccddeeff";
const DEVICE_ID = "a1a2a3a4-b1b2-c1c2-d1d2-e1e2e3e4e5e6";
const NONCE = Uint8Array.from({ length: 32 }, (_, i) => i);
const SUBJECT = Uint8Array.from({ length: 32 }, (_, i) => 0xa0 + i);
const ED = new Uint8Array(32).fill(0x11);
const MLKEM = new Uint8Array(1184).fill(0x22);
const X25519 = new Uint8Array(32).fill(0x33);
const ACTION_PK = concat_bytes(Uint8Array.of(0x02), new Uint8Array(32).fill(0x44));
const SECRET = new TextEncoder().encode("12345678901234567890");

const hex = (b: Uint8Array) => bytesToHex(b);

function seal_for_test(
  mlkem_pk: Uint8Array,
  x25519_pk: Uint8Array,
  plaintext: Uint8Array,
  aad: Uint8Array,
  version = 0x01,
): Uint8Array {
  const eph_sk = randomBytes(32);
  const eph = x25519.getPublicKey(eph_sk);
  const x_shared = x25519.getSharedSecret(eph_sk, x25519_pk);
  const { cipherText, sharedSecret } = ml_kem768.encapsulate(mlkem_pk);
  const key = guard_seal_key(x_shared, sharedSecret, eph, cipherText, aad);
  const nonce = randomBytes(12);
  const ct = gcm(key, nonce, aad).encrypt(plaintext);

  return concat_bytes(Uint8Array.of(version), eph, cipherText, nonce, ct);
}

describe("guard code", () => {
  it.each([
    [0, "GG5F5"],
    [1, "PV9M4"],
    [59, "QTVBC"],
    [56666666, "R87JJ"],
  ])("step %i gives %s", (step, code) => {
    expect(guard_code_for_step(SECRET, step)).toBe(code);
  });

  it("uses a 30 second step from unix time", () => {
    expect(guard_code_at(SECRET, 1700000000)).toBe("R87JJ");
    expect(guard_code_at(SECRET, 29)).toBe("GG5F5");
    expect(guard_code_at(SECRET, 30)).toBe("PV9M4");
  });
});

describe("guard digests", () => {
  const kd = keys_digest(ED, MLKEM, X25519, ACTION_PK);
  const kd0 = keys_digest(ED, MLKEM, X25519, null);

  it("matches the keys digest vectors", () => {
    expect(hex(kd)).toBe(
      "c8b92c7e16a9bb2edf93c93983240c55a375fc29d50746cf6cdf6d439d41110b",
    );
    expect(hex(kd0)).toBe(
      "834f8d3bc8320d7e2a92e33f00f200de037ce2806695c27d38902e9cfb8269e3",
    );
  });

  it("matches the approve and device-code subjects", () => {
    expect(hex(approve_subject(REQUEST_ID, kd, 42))).toBe(
      "ac8e5a52e5e4d55ac8fc07619a5c7cc6be147d749a4dc5f93f943f3a1d9026bc",
    );
    expect(hex(approve_subject(null, kd0, 0))).toBe(
      "3e5170b45bb76f27bdc4fb9d9ca6c5110b000fc15558d1f75c2df11e0a7ecd3b",
    );
    expect(hex(approve_subject(null, kd, 0))).toBe(
      "374d2364cb371fda52fdf948e42c21153c3cfd338217f63f713265c3964a8151",
    );
  });

  it("matches the id and switches subjects", () => {
    expect(hex(id_subject(REQUEST_ID))).toBe(
      "16a862dba0000cddd0258465be215033594566e1c8b7eefe25c8106f48072484",
    );
    expect(hex(switches_subject(9, 5))).toBe(
      "0868cdee63b96db6e43215df13b03e4dafe3d69747fcfec3640fe3a2024599a2",
    );
    expect(hex(switches_subject(0, 0))).toBe(
      "fd4b2ece22272e8146d498ef0ddd8ca36fc19a0d990f3b963124e044ea2a2937",
    );
  });

  it("matches the number hash vectors", () => {
    expect(hex(number_hash(REQUEST_ID, 42))).toBe(
      "7d633c75e8df5c05c248e56bf09b4b596b0260a9ac609b993f3d7a2959f69d77",
    );
    expect(hex(number_hash(REQUEST_ID, 43))).toBe(
      "c3ef3cf2523deccb046c661829841da962a6a7f9f3094d728381f37aa4c7d354",
    );
    expect(hex(number_hash(REQUEST_ID, 10))).not.toBe(
      hex(number_hash(REQUEST_ID, 11)),
    );
  });

  it("rejects numbers outside 10 to 99", () => {
    expect(() => number_hash(REQUEST_ID, 9)).toThrow();
    expect(() => number_hash(REQUEST_ID, 100)).toThrow();
  });

  it("draws random numbers from 10 to 99", () => {
    for (let i = 0; i < 500; i++) {
      const n = random_number();

      expect(n).toBeGreaterThanOrEqual(10);
      expect(n).toBeLessThanOrEqual(99);
    }
  });

  it("uses 32 zero bytes for the panic subject", () => {
    expect(PANIC_SUBJECT).toEqual(new Uint8Array(32));
  });
});

describe("guard action messages", () => {
  const expected: Record<number, string> = {
    1: "9c3e758429f0a2b53fbca00e281d9ff1c2ae43a3c180963a34fda347a6770073",
    2: "da02e9769a6ca4363bb3f4caa2c01a01d3ad1db8782bbc4cddfde9bfa1e4a605",
    3: "5b387eaa2b15a32b9b34694c93aa42095940f982c7cb948ac0d1bd029d04ef07",
    4: "f66d62e35a19499f547b6684975985e2e75d2591c5cbffb81e3941e625ce9708",
    5: "d1947e8e3d8e669af8ac94a0434ba3c2d19f16ca1f35ad99b6cc551e084f54f0",
    6: "56eaf57e429231612860a3a65d20af0cf05b1f9a55dc7a24044a053aedb0c1ef",
    7: "7fb2d5d79cac706addcb119ab80d0b2846f1677f933c37d75f77560acc97d334",
    8: "7cbd1f37de6fd39223117aee9ba1ed785bff00687f26e59ffa7a183d4a1a6048",
    9: "145d3ac91b28bb6d3b84994acb8de784bbe28b7a73ddd34f57b044329af4a1ea",
    10: "302d82406e44010289df1573d6ff620f67dc3144d5c472ec82e9d9ef6083b084",
    11: "e0875eea1b941c547e40cec50c6f092809f157c8722ddc2c58c80d53c21ab016",
  };

  it("numbers the actions as the wire contract does", () => {
    expect(Object.values(GUARD_ACTION)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it.each(Object.entries(expected))("action %s matches", (code, digest) => {
    const message = build_action_message(Number(code), USER_ID, NONCE, SUBJECT);

    expect(message.length).toBe(21 + 1 + 16 + 32 + 32);
    expect(new TextDecoder().decode(message.subarray(0, 21))).toBe(
      "aster-guard-action-v1",
    );
    expect(hex(sha256(message))).toBe(digest);
  });

  it("rejects a short nonce", () => {
    expect(() =>
      build_action_message(1, USER_ID, new Uint8Array(31), SUBJECT),
    ).toThrow();
  });
});

describe("p256 compression", () => {
  it("compresses a raw point to the sec1 form", () => {
    const sk = p256.utils.randomSecretKey();
    const raw = p256.getPublicKey(sk, false);

    expect(hex(compress_p256(raw))).toBe(hex(p256.getPublicKey(sk, true)));
  });
});

describe("guard seal", () => {
  const mlkem = ml_kem768.keygen();
  const x_sk = randomBytes(32);
  const x_pk = x25519.getPublicKey(x_sk);
  const plaintext = new TextEncoder().encode('{"city":"Berlin"}');

  it("matches the aad vectors", () => {
    expect(hex(context_aad(REQUEST_ID, DEVICE_ID))).toBe(
      "61737465722d67756172642d636f6e746578742d763100112233445566778899aabbccddeeffa1a2a3a4b1b2c1c2d1d2e1e2e3e4e5e6",
    );
    expect(hex(code_secret_aad(DEVICE_ID))).toBe(
      "61737465722d67756172642d636f64652d7365637265742d7631a1a2a3a4b1b2c1c2d1d2e1e2e3e4e5e6",
    );
  });

  it("opens a seal", () => {
    const aad = context_aad(REQUEST_ID, DEVICE_ID);
    const sealed = seal_for_test(mlkem.publicKey, x_pk, plaintext, aad);

    expect(sealed.length).toBe(1 + 32 + 1088 + 12 + plaintext.length + 16);
    expect(open_guard_seal(sealed, aad, mlkem.secretKey, x_sk)).toEqual(plaintext);
  });

  it("refuses a changed aad", () => {
    const aad = context_aad(REQUEST_ID, DEVICE_ID);
    const sealed = seal_for_test(mlkem.publicKey, x_pk, plaintext, aad);
    const other = aad.slice();

    other[other.length - 1] ^= 1;
    expect(() => open_guard_seal(sealed, other, mlkem.secretKey, x_sk)).toThrow(
      GuardSealError,
    );
  });

  it("refuses another version byte", () => {
    const aad = code_secret_aad(DEVICE_ID);
    const sealed = seal_for_test(mlkem.publicKey, x_pk, plaintext, aad, 0x02);

    expect(() => open_guard_seal(sealed, aad, mlkem.secretKey, x_sk)).toThrow(
      GuardSealError,
    );
  });

  it("refuses a short seal", () => {
    expect(() =>
      open_guard_seal(new Uint8Array(10), new Uint8Array(0), mlkem.secretKey, x_sk),
    ).toThrow(GuardSealError);
  });
});

describe("rescue code", () => {
  it("normalizes the vector", () => {
    expect(normalize_rescue_code("bcdfg-hjkmn 23456-789bc-dfghj")).toBe(
      "BCDFGHJKMN23456789BCDFGHJ",
    );
  });

  it("rejects letters outside the alphabet and wrong lengths", () => {
    expect(normalize_rescue_code("OCDFG-HJKMN-23456-789BC-DFGHJ")).toBeNull();
    expect(normalize_rescue_code("BCDFG-HJKMN-23456-789BC-DFGH")).toBeNull();
  });

  it("generates 25 alphabet characters in five groups", () => {
    const code = generate_rescue_code();

    expect(normalize_rescue_code(code)).toBe(code);
    expect(format_rescue_code(code)).toMatch(/^([2-9B-Y]{5}-){4}[2-9B-Y]{5}$/);
  });
});
