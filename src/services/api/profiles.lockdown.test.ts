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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ lockdown: false }));

const post = vi.hoisted(() =>
  vi.fn(async () => ({
    data: {
      profiles: { "peer@astermail.org": { display_name: "Real Name" } },
    },
  })),
);

vi.mock("./client", () => ({ api_client: { post } }));

vi.mock("@/services/lockdown_store", () => ({
  is_any_lockdown_active: () => state.lockdown,
}));

describe("peer profile lookups in lockdown", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    post.mockClear();
    state.lockdown = false;
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it("sends one batched lookup outside lockdown", async () => {
    const mod = await import("./profiles");
    const first = mod.fetch_peer_profile("peer@astermail.org");
    const second = mod.fetch_peer_profile("other@astermail.org");

    await vi.advanceTimersByTimeAsync(100);

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/core/v1/auth/profiles", {
      emails: ["peer@astermail.org", "other@astermail.org"],
    });
    expect(await first).toEqual({ display_name: "Real Name" });
    expect(await second).toBeNull();
  });

  it("does not repeat a lookup inside the cache window", async () => {
    const mod = await import("./profiles");
    const first = mod.fetch_peer_profile("peer@astermail.org");

    await vi.advanceTimersByTimeAsync(100);
    await first;
    await mod.fetch_peer_profile("peer@astermail.org");
    await vi.advanceTimersByTimeAsync(100);

    expect(post).toHaveBeenCalledTimes(1);
  });

  it("sends nothing while lockdown is active", async () => {
    state.lockdown = true;

    const mod = await import("./profiles");
    const result = await mod.fetch_peer_profile("peer@astermail.org");

    await vi.advanceTimersByTimeAsync(100);

    expect(result).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it("drops a queued lookup when lockdown starts before it is sent", async () => {
    const mod = await import("./profiles");
    const queued = mod.fetch_peer_profile("peer@astermail.org");

    state.lockdown = true;
    await vi.advanceTimersByTimeAsync(100);

    expect(await queued).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it("looks the address up again after lockdown ends", async () => {
    state.lockdown = true;

    const mod = await import("./profiles");

    await mod.fetch_peer_profile("peer@astermail.org");
    state.lockdown = false;

    const after = mod.fetch_peer_profile("peer@astermail.org");

    await vi.advanceTimersByTimeAsync(100);

    expect(await after).toEqual({ display_name: "Real Name" });
    expect(post).toHaveBeenCalledTimes(1);
  });
});
