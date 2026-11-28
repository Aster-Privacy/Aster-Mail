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
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("@/services/api/client", () => ({
  api_client: { get: h.get, post: vi.fn() },
}));

import { fetch_prekey_bundle } from "./ratchet_prekey_bundle";

import {
  extract_username_from_email,
  get_recipient_public_key,
} from "@/services/api/keys";

function requested_path(): string {
  return h.get.mock.calls[0][0] as string;
}

describe("key lookups for tagged addresses", () => {
  beforeEach(() => {
    h.get.mockReset();
    h.get.mockResolvedValue({ data: null, status: 404, code: "NOT_FOUND" });
  });

  it("looks up a tagged address under the account it delivers to", () => {
    expect(extract_username_from_email("Me+News@AsterMail.org")).toBe("me");
    expect(extract_username_from_email("me+a+b@astermail.org")).toBe("me");
  });

  it("keeps the username of an untagged address", () => {
    expect(extract_username_from_email("alice@astermail.org")).toBe("alice");
    expect(extract_username_from_email("first.last@aster.cx")).toBe(
      "first.last",
    );
    expect(extract_username_from_email("no-at-sign")).toBeNull();
    expect(extract_username_from_email("a@b@astermail.org")).toBeNull();
  });

  it("asks for the primary's owner key when sending to a tagged address", async () => {
    await get_recipient_public_key("me", "Me+News@astermail.org");

    expect(requested_path()).toBe(
      "/crypto/v1/keys/public/me?email=me%40astermail.org",
    );
  });

  it("asks for an untagged owner key unchanged", async () => {
    await get_recipient_public_key("alice", "alice@astermail.org");
    await get_recipient_public_key("alice");

    expect(h.get.mock.calls.map((call) => call[0])).toEqual([
      "/crypto/v1/keys/public/alice?email=alice%40astermail.org",
      "/crypto/v1/keys/public/alice",
    ]);
  });

  it("asks for the primary's prekey bundle when sending to a tagged address", async () => {
    await fetch_prekey_bundle("me", "me+news@astermail.org", true);

    expect(requested_path()).toBe(
      "/crypto/v1/ratchet/prekey-bundle/me?email=me%40astermail.org&scope=address",
    );
  });

  it("asks for an untagged prekey bundle unchanged", async () => {
    await fetch_prekey_bundle("alice", "alice@astermail.org");

    expect(requested_path()).toBe(
      "/crypto/v1/ratchet/prekey-bundle/alice?email=alice%40astermail.org",
    );
  });
});
