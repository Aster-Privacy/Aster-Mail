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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  delete_secure_view,
  reply_to_secure_view,
  secure_view_credential,
} from "./secure_view";

const PASSWORD = "message-password";
const PROOF = "derived-auth-proof";

let sent: { url: string; method: string; raw: string }[] = [];

function sent_body(index: number): Record<string, unknown> {
  return JSON.parse(sent[index].raw) as Record<string, unknown>;
}

describe("secure view reply and delete credentials", () => {
  beforeEach(() => {
    sent = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        sent.push({
          url,
          method: String(init.method),
          raw: String(init.body),
        });

        return { ok: true, json: async () => ({ success: true }) };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("selects the proof alone for a sealed message", () => {
    expect(secure_view_credential(true, PROOF, PASSWORD)).toEqual({
      auth_proof: PROOF,
    });
  });

  it("selects nothing for a sealed message without a proof", () => {
    expect(secure_view_credential(true, null, PASSWORD)).toEqual({});
    expect(secure_view_credential(true, "", PASSWORD)).toEqual({});
  });

  it("selects the password for a server checked message", () => {
    expect(secure_view_credential(false, null, PASSWORD)).toEqual({
      password: PASSWORD,
    });
  });

  it("selects nothing for an open message", () => {
    expect(secure_view_credential(false, null, "")).toEqual({});
    expect(secure_view_credential(false, null, null)).toEqual({});
  });

  it("replies to a sealed message with the proof and no password", async () => {
    await reply_to_secure_view(
      "tok",
      "hello",
      secure_view_credential(true, PROOF, PASSWORD),
    );

    expect(sent[0].url).toBe("/api/view/tok/reply");
    expect(sent_body(0)).toEqual({ body: "hello", auth_proof: PROOF });
    expect(sent[0].raw).not.toContain(PASSWORD);
  });

  it("deletes a sealed message with the proof and no password", async () => {
    await delete_secure_view(
      "tok",
      secure_view_credential(true, PROOF, PASSWORD),
    );

    expect(sent[0].method).toBe("DELETE");
    expect(sent_body(0)).toEqual({ auth_proof: PROOF });
    expect(sent[0].raw).not.toContain(PASSWORD);
  });

  it("never sends a password next to a proof", async () => {
    await reply_to_secure_view("tok", "hello", {
      auth_proof: PROOF,
      password: PASSWORD,
    });
    await delete_secure_view("tok", { auth_proof: PROOF, password: PASSWORD });

    expect(sent_body(0)).toEqual({ body: "hello", auth_proof: PROOF });
    expect(sent_body(1)).toEqual({ auth_proof: PROOF });
  });

  it("keeps sending the password for a server checked message", async () => {
    await reply_to_secure_view(
      "tok",
      "hello",
      secure_view_credential(false, null, PASSWORD),
    );
    await delete_secure_view(
      "tok",
      secure_view_credential(false, null, PASSWORD),
    );

    expect(sent_body(0)).toEqual({ body: "hello", password: PASSWORD });
    expect(sent_body(1)).toEqual({ password: PASSWORD });
  });
});
