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
  response: {} as { data?: unknown; error?: string },
  urls: [] as string[],
  throws: false,
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: async (url: string) => {
      h.urls.push(url);
      if (h.throws) throw new Error("offline");

      return h.response;
    },
  },
}));

const { get_current_identity_cutoff } =
  await import("./current_identity_published");

const entry = (key: string, first: string, last: string) => ({
  kem_identity_key: key,
  first_published_at: first,
  last_published_at: last,
});

describe("get_current_identity_cutoff", () => {
  beforeEach(() => {
    h.response = { data: { entries: [] } };
    h.urls = [];
    h.throws = false;
  });

  it("returns when the current identity was first published", async () => {
    h.response = {
      data: {
        entries: [
          entry("current", "2026-05-04T00:00:00Z", "2026-05-10T00:00:00Z"),
          entry("old", "2026-01-01T00:00:00Z", "2026-05-01T00:00:00Z"),
        ],
      },
    };

    expect(
      await get_current_identity_cutoff("user@example.org", "current"),
    ).toBe(Date.parse("2026-05-04T00:00:00Z"));
    expect(h.urls[0]).toBe(
      "/crypto/v1/ratchet/prekey-bundle/user/history?email=user%40example.org",
    );
  });

  it("extends the cutoff while an older identity was still being published", async () => {
    h.response = {
      data: {
        entries: [
          entry("current", "2026-05-04T00:00:00Z", "2026-05-10T00:00:00Z"),
          entry("old", "2026-01-01T00:00:00Z", "2026-05-07T00:00:00Z"),
        ],
      },
    };

    expect(
      await get_current_identity_cutoff("user@example.org", "current"),
    ).toBe(Date.parse("2026-05-07T00:00:00Z"));
  });

  it("returns null when the current identity is not in the history", async () => {
    h.response = {
      data: {
        entries: [entry("old", "2026-01-01T00:00:00Z", "2026-05-01T00:00:00Z")],
      },
    };

    expect(
      await get_current_identity_cutoff("user@example.org", "current"),
    ).toBeNull();
  });

  it("returns null when the history cannot be loaded", async () => {
    h.response = { error: "not found" };
    expect(
      await get_current_identity_cutoff("user@example.org", "current"),
    ).toBeNull();

    h.throws = true;
    expect(
      await get_current_identity_cutoff("user@example.org", "current"),
    ).toBeNull();
  });

  it("does not ask without an address or a current identity", async () => {
    expect(await get_current_identity_cutoff(null, "current")).toBeNull();
    expect(
      await get_current_identity_cutoff("user@example.org", null),
    ).toBeNull();
    expect(h.urls).toEqual([]);
  });
});
