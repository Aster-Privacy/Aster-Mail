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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/services/routing/routing_provider", () => ({
  routed_fetch: vi.fn(),
  get_effective_base_url: (default_base_url: string) => default_base_url,
  get_effective_timeout: (default_timeout: number) => default_timeout,
  get_effective_retry_count: () => 0,
  get_effective_retry_delay: () => 1,
}));

const account_tokens = new Map<
  string,
  { access_token: string | null; refresh_token: string | null }
>();

const update_account_tokens = vi.fn(
  async (
    account_id: string,
    access_token: string | null,
    refresh_token: string | null | undefined,
  ) => {
    const current = account_tokens.get(account_id) ?? {
      access_token: null,
      refresh_token: null,
    };

    account_tokens.set(account_id, {
      access_token,
      refresh_token:
        refresh_token === undefined ? current.refresh_token : refresh_token,
    });

    return true;
  },
);

let current_account_id: string | null = null;

vi.mock("@/services/account_manager", () => ({
  update_account_tokens: (
    account_id: string,
    access_token: string | null,
    refresh_token: string | null | undefined,
  ) => update_account_tokens(account_id, access_token, refresh_token),
  get_current_account_id: async () => current_account_id,
  get_account_tokens: async (account_id: string) =>
    account_tokens.get(account_id) ?? {
      access_token: null,
      refresh_token: null,
    },
}));

const { routed_fetch } = await import("@/services/routing/routing_provider");
const { api_client } = await import("./client");

const OWNER = "3c74a773-b6e8-40ed-a375-c9a26fe97d04";
const OTHER = "1c2eabd0-ebdf-4f68-90d9-305cab7bc69a";

function json_response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

function unauthorized(): Response {
  return json_response(401, { error: "unauthorized" });
}

describe("per account token persistence", () => {
  beforeEach(() => {
    vi.mocked(routed_fetch).mockReset();
    update_account_tokens.mockClear();
    account_tokens.clear();
    current_account_id = null;
    api_client.end_account_add();
    api_client.resume_account_persist();
    api_client.set_authenticated(false);
    api_client.set_expected_user_id(null);
    api_client.clear_dev_token();
  });

  afterEach(() => {
    api_client.end_account_add();
    api_client.resume_account_persist();
    api_client.set_authenticated(false);
    api_client.set_expected_user_id(null);
    api_client.clear_dev_token();
  });

  it("writes a rotated token to the account that owned the refresh, not the account that is active when it lands", async () => {
    vi.useFakeTimers();
    api_client.set_expected_user_id(OWNER);
    current_account_id = OWNER;
    api_client.set_authenticated(true);
    await vi.advanceTimersByTimeAsync(6000);

    vi.mocked(routed_fetch).mockImplementation(async () => {
      api_client.suspend_account_persist();
      api_client.begin_account_add();
      api_client.set_expected_user_id(OTHER);
      current_account_id = OTHER;

      return json_response(200, {
        csrf_token: "csrf_new",
        access_token: "access_rotated",
        refresh_token: "refresh_rotated",
      });
    });

    await api_client.refresh_session();

    expect(update_account_tokens).not.toHaveBeenCalled();

    api_client.end_account_add();
    api_client.resume_account_persist();
    await vi.advanceTimersByTimeAsync(1);
    vi.useRealTimers();

    expect(update_account_tokens).toHaveBeenCalledWith(
      OWNER,
      "access_rotated",
      "refresh_rotated",
    );
    expect(account_tokens.get(OTHER)).toBeUndefined();
  });

  it("recovers a session whose stored access token is stale by refreshing before giving up", async () => {
    account_tokens.set(OWNER, {
      access_token: "access_stale",
      refresh_token: "refresh_good",
    });

    let me_calls = 0;

    vi.mocked(routed_fetch).mockImplementation(async (url: string) => {
      if (url.includes("/auth/refresh")) {
        return json_response(200, {
          csrf_token: "csrf_new",
          access_token: "access_fresh",
          refresh_token: "refresh_fresh",
        });
      }

      me_calls += 1;

      if (me_calls === 1) return unauthorized();

      return json_response(200, { user_id: OWNER });
    });

    const result = await api_client.reestablish_session_for_account(OWNER);

    expect(result).toBe("ok");
    expect(update_account_tokens).not.toHaveBeenCalledWith(OWNER, null, null);
    expect(account_tokens.get(OWNER)?.refresh_token).toBe("refresh_fresh");
  });

  it("only clears stored tokens when the refresh for that account is itself denied", async () => {
    account_tokens.set(OWNER, {
      access_token: "access_stale",
      refresh_token: "refresh_dead",
    });

    vi.mocked(routed_fetch).mockImplementation(async () => unauthorized());

    const result = await api_client.reestablish_session_for_account(OWNER);

    expect(result).toBe("expired");
    expect(update_account_tokens).toHaveBeenCalledWith(OWNER, null, null);
  });

  it("keeps stored tokens when the account cannot be verified for a transient reason", async () => {
    account_tokens.set(OWNER, {
      access_token: "access_stale",
      refresh_token: "refresh_good",
    });

    vi.mocked(routed_fetch).mockImplementation(async (url: string) => {
      if (url.includes("/auth/refresh")) {
        return json_response(503, { error: "unavailable" });
      }

      return json_response(503, { error: "unavailable" });
    });

    const result = await api_client.reestablish_session_for_account(OWNER);

    expect(result).toBe("unavailable");
    expect(update_account_tokens).not.toHaveBeenCalledWith(OWNER, null, null);
    expect(account_tokens.get(OWNER)?.refresh_token).toBe("refresh_good");
  });
});
