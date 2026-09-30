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

const h = vi.hoisted(() => ({
  account: null as { id: string; user: { email: string } } | null,
  cached_info: null as Record<string, unknown> | null,
  authenticated: true,
  me_response: null as Record<string, unknown> | null,
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account: vi.fn(async () => h.account),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get_cached_user_info: () => h.cached_info,
    adopt_user_info: vi.fn(),
    is_authenticated: () => h.authenticated,
  },
}));

vi.mock("@/services/api/auth", () => ({
  get_user_info: vi.fn(async () => ({ data: h.me_response })),
}));

async function load_module() {
  vi.resetModules();

  return import("./current_identity");
}

beforeEach(() => {
  h.account = null;
  h.cached_info = null;
  h.authenticated = true;
  h.me_response = null;
});

describe("resolve_current_user", () => {
  it("prefers the stored account", async () => {
    h.account = { id: "a", user: { email: "stored@x.test" } };
    h.cached_info = { user_id: "b", email: "cached@x.test" };

    const module = await load_module();

    expect((await module.resolve_current_user())?.email).toBe("stored@x.test");
  });

  it("falls back to the cached profile when the roster is empty", async () => {
    h.cached_info = {
      user_id: "b",
      username: "cached",
      email: "cached@x.test",
    };

    const module = await load_module();

    expect((await module.resolve_current_user())?.email).toBe("cached@x.test");
  });

  it("asks the server when nothing local knows the account", async () => {
    h.me_response = {
      user_id: "c",
      username: "served",
      email: "served@x.test",
    };

    const module = await load_module();

    expect((await module.resolve_current_user())?.email).toBe("served@x.test");
  });

  it("reuses the remembered sign-in without a network call", async () => {
    const module = await load_module();

    module.remember_current_user({
      id: "d",
      username: "signed",
      email: "signed@x.test",
    });

    const { get_user_info } = await import("@/services/api/auth");

    expect((await module.resolve_current_user())?.email).toBe("signed@x.test");
    expect(vi.mocked(get_user_info)).not.toHaveBeenCalled();
  });

  it("returns nothing when the session is not authenticated", async () => {
    h.authenticated = false;

    const module = await load_module();

    expect(await module.resolve_current_user()).toBeNull();
  });
});
