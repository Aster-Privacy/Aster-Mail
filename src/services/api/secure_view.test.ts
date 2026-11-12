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
  select_secure_view_credential,
  verify_secure_view,
} from "./secure_view";

const TYPED_SECRET = "orchard-lantern-47-quiet";
const PROOF = "cHJvb2YtdmFsdWUtZm9yLXRlc3Rz";
const DERIVED_KEY = "RHMEBJm89W5fy5dc04qOLv8f2OjzvX6xYoN36VxakqE=";
const SERVER_FIELD = JSON.stringify("password");

const fetch_mock = vi.fn();

function serialized_requests(): string {
  return fetch_mock.mock.calls
    .map(([url, init]) =>
      JSON.stringify({
        url: String(url),
        headers: (init as RequestInit | undefined)?.headers ?? null,
        body: (init as RequestInit | undefined)?.body ?? null,
      }),
    )
    .join("\n");
}

function sent_body(index: number): Record<string, unknown> {
  const init = fetch_mock.mock.calls[index][1] as RequestInit;

  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

describe("secure view credential selection", () => {
  it("uses only the derived proof for an end-to-end encrypted view", () => {
    expect(select_secure_view_credential(PROOF)).toEqual({
      kind: "auth_proof",
      auth_proof: PROOF,
    });
  });

  it("returns nothing for an end-to-end encrypted view without a proof", () => {
    expect(select_secure_view_credential(null)).toBeNull();
  });

  it("uses the derived key for a server-encrypted view", () => {
    expect(select_secure_view_credential(DERIVED_KEY)).toEqual({
      kind: "auth_proof",
      auth_proof: DERIVED_KEY,
    });
  });

  it("has no way to carry the typed value", () => {
    const credential = select_secure_view_credential(DERIVED_KEY);

    expect(Object.keys(credential ?? {}).sort()).toEqual([
      "auth_proof",
      "kind",
    ]);
    expect(JSON.stringify(credential)).not.toContain(TYPED_SECRET);
  });
});

describe("secure view requests", () => {
  beforeEach(() => {
    fetch_mock.mockReset();
    fetch_mock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    vi.stubGlobal("fetch", fetch_mock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends only the derived proof when verifying, replying, and deleting", async () => {
    const credential = select_secure_view_credential(PROOF);

    await verify_secure_view("tok", credential);
    await reply_to_secure_view("tok", "Thanks", credential);
    await delete_secure_view("tok", credential);

    expect(fetch_mock).toHaveBeenCalledTimes(3);
    expect(fetch_mock.mock.calls[0][0]).toBe("/api/view/tok/verify");
    expect(fetch_mock.mock.calls[1][0]).toBe("/api/view/tok/reply");
    expect(fetch_mock.mock.calls[2][0]).toBe("/api/view/tok");
    expect((fetch_mock.mock.calls[2][1] as RequestInit).method).toBe("DELETE");
    expect(sent_body(0)).toEqual({ auth_proof: PROOF });
    expect(sent_body(1)).toEqual({ auth_proof: PROOF, body: "Thanks" });
    expect(sent_body(2)).toEqual({ auth_proof: PROOF });
    expect(serialized_requests()).not.toContain(TYPED_SECRET);
    expect(serialized_requests()).not.toContain(SERVER_FIELD);
  });

  it("keeps the reply text separate from the credential fields", async () => {
    await reply_to_secure_view("tok", "auth_proof", {
      kind: "auth_proof",
      auth_proof: PROOF,
    });

    expect(sent_body(0)).toEqual({ auth_proof: PROOF, body: "auth_proof" });
  });

  it("sends no credential fields for a view that needs none", async () => {
    await verify_secure_view("tok", null);
    await reply_to_secure_view("tok", "Thanks", null);
    await delete_secure_view("tok", null);

    expect(sent_body(0)).toEqual({});
    expect(sent_body(1)).toEqual({ body: "Thanks" });
    expect(sent_body(2)).toEqual({});
  });

  it("sends only the derived key for a server-encrypted view", async () => {
    const credential = select_secure_view_credential(DERIVED_KEY);

    await verify_secure_view("tok", credential);
    await reply_to_secure_view("tok", "Thanks", credential);
    await delete_secure_view("tok", credential);

    expect(sent_body(0)).toEqual({ auth_proof: DERIVED_KEY });
    expect(sent_body(1)).toEqual({ auth_proof: DERIVED_KEY, body: "Thanks" });
    expect(sent_body(2)).toEqual({ auth_proof: DERIVED_KEY });
    expect(serialized_requests()).not.toContain(TYPED_SECRET);
    expect(serialized_requests()).not.toContain(SERVER_FIELD);
  });

  it("ignores extra fields on a credential", async () => {
    const credential = {
      ...select_secure_view_credential(DERIVED_KEY)!,
      password: TYPED_SECRET,
    };

    await verify_secure_view("tok", credential);
    await reply_to_secure_view("tok", "Thanks", credential);
    await delete_secure_view("tok", credential);

    for (const index of [0, 1, 2]) {
      expect(sent_body(index)).not.toHaveProperty("password");
    }
    expect(serialized_requests()).not.toContain(TYPED_SECRET);
  });
});
