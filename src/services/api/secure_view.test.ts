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
  secure_view_credential_for_unlock,
  secure_view_unlock_mode,
} from "./secure_view";

const fetch_mock = vi.fn();

function sent_body(): Record<string, unknown> {
  const [, init] = fetch_mock.mock.calls[0];

  return JSON.parse(init.body as string);
}

beforeEach(() => {
  fetch_mock.mockReset();
  fetch_mock.mockImplementation(
    async () =>
      new Response(JSON.stringify({ success: true }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetch_mock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const SALT = btoa(String.fromCharCode(...new Uint8Array(16).fill(9)));

describe("secure view unlock mode", () => {
  it("uses zero knowledge when the server sends a valid salt", () => {
    expect(
      secure_view_unlock_mode({ is_zero_knowledge: true, kdf_salt: SALT }),
    ).toEqual({ kind: "zero_knowledge", kdf_salt: SALT });
  });

  it("keeps the legacy password mode for legacy messages", () => {
    expect(secure_view_unlock_mode({ is_zero_knowledge: false })).toEqual({
      kind: "password",
    });
  });

  it("refuses a zero-knowledge message that arrives without a salt", () => {
    expect(secure_view_unlock_mode({ is_zero_knowledge: true })).toEqual({
      kind: "refused",
    });
    expect(
      secure_view_unlock_mode({ is_zero_knowledge: true, kdf_salt: "" }),
    ).toEqual({ kind: "refused" });
  });

  it("refuses a salt that is not 16 bytes", () => {
    for (const kdf_salt of [
      btoa("short"),
      btoa(String.fromCharCode(...new Uint8Array(32))),
      "not base64 !!",
    ]) {
      expect(
        secure_view_unlock_mode({ is_zero_knowledge: true, kdf_salt }),
      ).toEqual({ kind: "refused" });
    }
  });

  it("refuses a message that carries a salt but claims to be legacy", () => {
    expect(
      secure_view_unlock_mode({ is_zero_knowledge: false, kdf_salt: SALT }),
    ).toEqual({ kind: "refused" });
  });
});

describe("secure view credentials", () => {
  it("a zero-knowledge unlock keeps only the proof", () => {
    expect(
      secure_view_credential_for_unlock(true, "proof-1", "hunter2"),
    ).toEqual({ kind: "proof", auth_proof: "proof-1" });
  });

  it("a legacy unlock keeps the password", () => {
    expect(secure_view_credential_for_unlock(false, null, "hunter2")).toEqual({
      kind: "password",
      password: "hunter2",
    });
  });

  it("a zero-knowledge unlock without a proof keeps nothing", () => {
    expect(secure_view_credential_for_unlock(true, null, "hunter2")).toEqual({
      kind: "none",
    });
  });

  it("a reply after a zero-knowledge unlock never sends the password", async () => {
    await reply_to_secure_view("tok", "hello", {
      kind: "proof",
      auth_proof: "proof-1",
    });

    const body = sent_body();

    expect(body).toEqual({ body: "hello", auth_proof: "proof-1" });
    expect(JSON.stringify(body)).not.toContain("hunter2");
  });

  it("a delete after a zero-knowledge unlock never sends the password", async () => {
    await delete_secure_view("tok", { kind: "proof", auth_proof: "proof-1" });

    expect(sent_body()).toEqual({ auth_proof: "proof-1" });
  });

  it("a legacy reply sends only the password", async () => {
    await reply_to_secure_view("tok", "hello", {
      kind: "password",
      password: "hunter2",
    });

    expect(sent_body()).toEqual({ body: "hello", password: "hunter2" });
  });

  it("a legacy delete sends only the password", async () => {
    await delete_secure_view("tok", { kind: "password", password: "hunter2" });

    expect(sent_body()).toEqual({ password: "hunter2" });
  });

  it("an open view sends no credential", async () => {
    await delete_secure_view("tok", { kind: "none" });

    expect(sent_body()).toEqual({});
  });
});
