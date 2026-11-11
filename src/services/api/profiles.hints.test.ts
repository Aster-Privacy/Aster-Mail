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

vi.mock("./client", () => ({
  api_client: {
    post: vi.fn(async () => ({
      data: {
        profiles: { "peer@astermail.org": { display_name: "Real Name" } },
      },
    })),
  },
}));

describe("peer profile hints", () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  async function fetch_then_reload() {
    const first = await import("./profiles");

    await first.fetch_peer_profile("peer@astermail.org");
    await vi.waitFor(() => {
      expect(
        window.localStorage.getItem("aster_peer_profile_hints_v1"),
      ).toBeTruthy();
    });

    vi.resetModules();

    const client = await import("./client");

    vi.mocked(client.api_client.post).mockClear();
  }

  it("does not look a profile up again right after a reload", async () => {
    await fetch_then_reload();

    const client = await import("./client");
    const reloaded = await import("./profiles");
    const profile = await reloaded.fetch_peer_profile("peer@astermail.org");

    expect(profile?.display_name).toBe("Real Name");
    expect(client.api_client.post).not.toHaveBeenCalled();
  });

  it("looks a profile up again once the stored copy is older", async () => {
    await fetch_then_reload();

    const later = Date.now() + 6 * 60 * 1000;

    vi.spyOn(Date, "now").mockReturnValue(later);

    const client = await import("./client");
    const reloaded = await import("./profiles");

    await reloaded.fetch_peer_profile("peer@astermail.org");

    expect(client.api_client.post).toHaveBeenCalledTimes(1);
  });

  it("remembers a fetched profile across a reload", async () => {
    const first = await import("./profiles");

    expect(first.get_peer_profile_hint("peer@astermail.org")).toBeNull();
    await first.fetch_peer_profile("peer@astermail.org");
    await vi.waitFor(() => {
      expect(
        window.localStorage.getItem("aster_peer_profile_hints_v1"),
      ).toBeTruthy();
    });

    vi.resetModules();

    const reloaded = await import("./profiles");

    expect(
      reloaded.get_cached_peer_profile("peer@astermail.org"),
    ).toBeUndefined();
    expect(
      reloaded.get_peer_profile_hint("peer@astermail.org")?.display_name,
    ).toBe("Real Name");
  });

  it("drops every hint when the cache is cleared", async () => {
    const mod = await import("./profiles");

    await mod.fetch_peer_profile("peer@astermail.org");
    await vi.waitFor(() => {
      expect(
        window.localStorage.getItem("aster_peer_profile_hints_v1"),
      ).toBeTruthy();
    });
    mod.clear_profiles_cache();
    expect(mod.get_peer_profile_hint("peer@astermail.org")).toBeNull();
    expect(
      window.localStorage.getItem("aster_peer_profile_hints_v1"),
    ).toBeNull();
  });
});
