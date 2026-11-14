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

import { judge_signatures } from "./pgp_signature_verdict";

const sender_key = {
  getKeys: (key_id?: never) => ((key_id as unknown) === "sender" ? [{}] : []),
};
const good = (key_id: string) => ({
  verified: Promise.resolve(true),
  keyID: key_id,
});
const bad = (key_id: string) => {
  const verified = Promise.reject(new Error("bad signature"));

  verified.catch(() => undefined);

  return { verified, keyID: key_id };
};

describe("judge_signatures", () => {
  it("reports an unsigned message", async () => {
    expect(await judge_signatures([], [sender_key])).toEqual({
      status: "unsigned",
      has_signature: false,
    });
  });

  it("reports missing keys when nothing can be checked", async () => {
    expect((await judge_signatures([good("sender")], [])).status).toBe(
      "no_keys",
    );
  });

  it("accepts a single valid signature from the sender", async () => {
    expect(
      (await judge_signatures([good("sender")], [sender_key])).status,
    ).toBe("verified");
  });

  it("refuses a valid signature paired with a failing one from the sender's key", async () => {
    expect(
      (await judge_signatures([good("sender"), bad("sender")], [sender_key]))
        .status,
    ).toBe("invalid");
    expect(
      (await judge_signatures([bad("sender"), good("sender")], [sender_key]))
        .status,
    ).toBe("invalid");
  });

  it("still accepts a valid sender signature next to one from a key it does not hold", async () => {
    expect(
      (await judge_signatures([good("sender"), bad("other")], [sender_key]))
        .status,
    ).toBe("verified");
  });

  it("reports invalid when only an unknown key signed", async () => {
    expect((await judge_signatures([bad("other")], [sender_key])).status).toBe(
      "invalid",
    );
  });

  it("treats a false result as a failure", async () => {
    expect(
      (
        await judge_signatures(
          [{ verified: Promise.resolve(false), keyID: "sender" }],
          [sender_key],
        )
      ).status,
    ).toBe("invalid");
  });
});
