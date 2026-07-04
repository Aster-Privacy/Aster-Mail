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
import { describe, it, expect, vi, beforeEach } from "vitest";

import { resolve_is_family_plan, refresh_family_plan_flag } from "./family";
import { api_client } from "./client";

vi.mock("./client", () => ({
  api_client: {
    get: vi.fn(),
  },
}));

const mocked_get = vi.mocked(api_client.get);

const family_group_payload = {
  id: "fg-1",
  plan_code: "family",
  plan_name: "Family",
  storage_pool_bytes: 0,
  storage_used_bytes: 0,
  status: "active",
  grace_period_end: null,
  members: [],
  pending_invites: [],
  max_members: 6,
  viewer_role: "owner",
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("resolve_is_family_plan", () => {
  it("returns true when the family group loads", async () => {
    mocked_get.mockResolvedValue({ data: family_group_payload });

    await expect(resolve_is_family_plan()).resolves.toBe(true);
  });

  it("returns false only on a definitive not-found", async () => {
    mocked_get.mockResolvedValue({ error: "not found", code: "NOT_FOUND" });

    await expect(resolve_is_family_plan()).resolves.toBe(false);
  });

  it("returns null on a fingerprint-mismatch unauthorized error", async () => {
    mocked_get.mockResolvedValue({
      error: "Fingerprint mismatch on sensitive endpoint",
      code: "UNAUTHORIZED",
    });

    await expect(resolve_is_family_plan()).resolves.toBeNull();
  });

  it("returns null on forbidden, network, timeout, and server errors", async () => {
    for (const code of [
      "FORBIDDEN",
      "NETWORK_ERROR",
      "TIMEOUT_ERROR",
      "SERVER_ERROR",
      "RATE_LIMIT_EXCEEDED",
    ] as const) {
      mocked_get.mockResolvedValue({ error: "failed", code });

      await expect(resolve_is_family_plan()).resolves.toBeNull();
    }
  });

  it("returns null when the request rejects", async () => {
    mocked_get.mockRejectedValue(new Error("boom"));

    await expect(resolve_is_family_plan()).resolves.toBeNull();
  });
});

describe("refresh_family_plan_flag", () => {
  it("persists and reports true on success", async () => {
    mocked_get.mockResolvedValue({ data: family_group_payload });
    const on_resolved = vi.fn();

    refresh_family_plan_flag(on_resolved);
    await vi.waitFor(() => expect(on_resolved).toHaveBeenCalledWith(true));

    expect(localStorage.getItem("aster_is_family_plan")).toBe("1");
  });

  it("persists and reports false on not-found", async () => {
    localStorage.setItem("aster_is_family_plan", "1");
    mocked_get.mockResolvedValue({ error: "not found", code: "NOT_FOUND" });
    const on_resolved = vi.fn();

    refresh_family_plan_flag(on_resolved);
    await vi.waitFor(() => expect(on_resolved).toHaveBeenCalledWith(false));

    expect(localStorage.getItem("aster_is_family_plan")).toBe("0");
  });

  it("keeps the cached flag untouched on transient errors", async () => {
    localStorage.setItem("aster_is_family_plan", "1");
    mocked_get.mockResolvedValue({
      error: "Fingerprint mismatch on sensitive endpoint",
      code: "UNAUTHORIZED",
    });
    const on_resolved = vi.fn();

    refresh_family_plan_flag(on_resolved);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(on_resolved).not.toHaveBeenCalled();
    expect(localStorage.getItem("aster_is_family_plan")).toBe("1");
  });
});
