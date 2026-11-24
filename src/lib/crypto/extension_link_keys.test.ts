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
import { describe, expect, it, vi } from "vitest";

import { encode_extension_link_keys } from "./extension_link_keys";

import { array_to_base64 } from "@/services/crypto/base64";

const key = (fill: number) => array_to_base64(new Uint8Array(32).fill(fill));
const RETIRED = key(7);
const PUBLIC_MAIL = key(8);
const PUBLIC_CONSTANT = key(9);

vi.mock("@/services/crypto/retired_identity_keks", () => ({
  retired_kek_context: (value: string) =>
    value === RETIRED ? "astermail-tags-v1" : null,
  is_public_constant_kek_raw: (raw: Uint8Array) => raw[0] === 9,
}));

vi.mock("@/services/crypto/server_known_keys", () => ({
  is_public_mail_kek: (value: string) => value === PUBLIC_MAIL,
}));

vi.mock("@/services/crypto/legacy_keks", () => ({ MAX_LEGACY_KEKS: 3 }));

const entry = (k: string) => ({ k, added_at: "2026-01-01T00:00:00Z" });

function decode(bytes: Uint8Array) {
  return JSON.parse(new TextDecoder().decode(bytes)) as {
    v: number;
    data_kek: string;
    legacy: string[];
  };
}

describe("encode_extension_link_keys", () => {
  it("sends the alias key and the keys older aliases need", () => {
    const payload = decode(
      encode_extension_link_keys({
        data_kek: key(1),
        legacy_keks: [entry(key(2)), entry(key(3))],
      }),
    );

    expect(payload).toEqual({
      v: 1,
      data_kek: key(1),
      legacy: [key(2), key(3)],
    });
  });

  it("leaves out retired, public, repeated, and malformed keys", () => {
    const payload = decode(
      encode_extension_link_keys({
        data_kek: key(1),
        legacy_keks: [
          entry(key(1)),
          entry(RETIRED),
          entry(PUBLIC_MAIL),
          entry(PUBLIC_CONSTANT),
          entry("AAAA"),
          entry("not base64!"),
          entry(key(2)),
          entry(key(2)),
        ],
      }),
    );

    expect(payload.legacy).toEqual([key(2)]);
  });

  it("sends older keys in padded form", () => {
    const unpadded = key(2).replace(/=+$/, "");
    const payload = decode(
      encode_extension_link_keys({
        data_kek: key(1),
        legacy_keks: [entry(unpadded), entry(key(2)), entry(` ${key(3)}`)],
      }),
    );

    expect(payload.legacy).toEqual([key(2), key(3)]);
  });

  it("caps the number of older keys", () => {
    const payload = decode(
      encode_extension_link_keys({
        data_kek: key(1),
        legacy_keks: [2, 3, 4, 5, 6].map((fill) => entry(key(fill))),
      }),
    );

    expect(payload.legacy).toEqual([key(2), key(3), key(4)]);
  });

  it("works for a vault with no older keys", () => {
    expect(
      decode(encode_extension_link_keys({ data_kek: key(1) })).legacy,
    ).toEqual([]);
  });

  it("refuses when the vault is locked or has no usable alias key", () => {
    expect(() => encode_extension_link_keys(null)).toThrow("vault_locked");
    expect(() => encode_extension_link_keys({})).toThrow("vault_locked");
    expect(() => encode_extension_link_keys({ data_kek: "AAAA" })).toThrow(
      "vault_locked",
    );
  });
});
