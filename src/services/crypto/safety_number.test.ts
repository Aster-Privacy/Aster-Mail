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
  compute_safety_number,
  encode_party,
  hex_fingerprint_bytes,
  SafetyNumberInputError,
} from "./safety_number";

function filled(length: number, value: number): Uint8Array {
  return new Uint8Array(length).fill(value);
}

const alice = filled(20, 0x11);
const bob = filled(20, 0x33);

describe("safety number", () => {
  it("is twelve groups of five digits", async () => {
    const groups = await compute_safety_number(alice, bob);

    expect(groups).toHaveLength(12);
    for (const group of groups) expect(group).toMatch(/^\d{5}$/);
  });

  it("matches the shared vector every client checks against", async () => {
    expect(await compute_safety_number(alice, bob)).toEqual([
      "12843",
      "20230",
      "68605",
      "60691",
      "72650",
      "40318",
      "91730",
      "31516",
      "89762",
      "50633",
      "89762",
      "68949",
    ]);
  });

  it("is the same on both sides", async () => {
    expect(await compute_safety_number(alice, bob)).toEqual(
      await compute_safety_number(bob, alice),
    );
  });

  it("changes when the remote account key changes", async () => {
    expect(await compute_safety_number(alice, filled(20, 0x34))).toEqual([
      "02528",
      "47745",
      "63679",
      "41282",
      "11626",
      "05197",
      "91730",
      "31516",
      "89762",
      "50633",
      "89762",
      "68949",
    ]);
  });

  it("binds the fingerprint length", () => {
    expect(encode_party(filled(20, 1))).not.toEqual(
      encode_party(filled(21, 1)).slice(0, -1),
    );
  });

  it("refuses a fingerprint that is too short or too long", async () => {
    await expect(
      compute_safety_number(alice, new Uint8Array(0)),
    ).rejects.toBeInstanceOf(SafetyNumberInputError);
    await expect(
      compute_safety_number(alice, filled(65, 1)),
    ).rejects.toBeInstanceOf(SafetyNumberInputError);
  });

  it("decodes fingerprints and rejects malformed hex", () => {
    expect(hex_fingerprint_bytes("0A ff")).toEqual(new Uint8Array([10, 255]));
    expect(hex_fingerprint_bytes("abc")).toBeNull();
    expect(hex_fingerprint_bytes("zz")).toBeNull();
    expect(hex_fingerprint_bytes(null)).toBeNull();
  });
});
