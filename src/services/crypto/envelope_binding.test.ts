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
  decrypt_envelope_v2,
  encrypt_envelope_v2,
} from "./envelope_v2";

const OWNER = "11111111-2222-4333-8444-555555555555";
const OTHER_OWNER = "99999999-2222-4333-8444-555555555555";

function kek(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

describe("stored envelopes are bound to their account and item", () => {
  it("does not open under another item id", async () => {
    const key = kek();
    const sealed = await encrypt_envelope_v2({ subject: "a" }, key, {
      owner_id: OWNER,
      item_id: "item-a",
    });

    expect(
      await decrypt_envelope_v2(sealed.encrypted, [key], {
        owner_id: OWNER,
        item_id: "item-b",
      }),
    ).toBeNull();
  });

  it("does not open under another account", async () => {
    const key = kek();
    const sealed = await encrypt_envelope_v2({ subject: "a" }, key, {
      owner_id: OWNER,
      item_id: "item-a",
    });

    expect(
      await decrypt_envelope_v2(sealed.encrypted, [key], {
        owner_id: OTHER_OWNER,
        item_id: "item-a",
      }),
    ).toBeNull();
  });

  it("does not open as an unbound envelope", async () => {
    const key = kek();
    const sealed = await encrypt_envelope_v2({ subject: "a" }, key, {
      owner_id: OWNER,
      item_id: "item-a",
    });

    expect(await decrypt_envelope_v2(sealed.encrypted, [key])).toBeNull();
  });

  it("marks bound envelopes with their own nonce", async () => {
    const key = kek();
    const bound = await encrypt_envelope_v2({ subject: "a" }, key, {
      owner_id: OWNER,
      item_id: "item-a",
    });
    const unbound = await encrypt_envelope_v2({ subject: "a" }, key);

    expect(bound.nonce).toBe("Aw==");
    expect(unbound.nonce).toBe("Ag==");
  });

  it("opens with the matching binding", async () => {
    const key = kek();
    const binding = { owner_id: OWNER, item_id: "item-a" };
    const sealed = await encrypt_envelope_v2({ subject: "a" }, key, binding);

    expect(await decrypt_envelope_v2(sealed.encrypted, [key], binding)).toEqual(
      { subject: "a" },
    );
  });

  it("still opens unbound envelopes written by older clients", async () => {
    const key = kek();
    const sealed = await encrypt_envelope_v2({ subject: "old" }, key);

    expect(await decrypt_envelope_v2(sealed.encrypted, [key])).toEqual({
      subject: "old",
    });
  });
});
