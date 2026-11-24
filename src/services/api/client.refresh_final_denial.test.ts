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

const stored_tokens = new Map<
  string,
  { access_token: string | null; refresh_token: string | null }
>();

let token_write_gate: Promise<void> = Promise.resolve();

vi.mock("@/services/account_manager", () => ({
  update_account_tokens: async (
    account_id: string,
    access_token: string | null,
    refresh_token: string | null | undefined,
  ) => {
    await token_write_gate;
    const current = stored_tokens.get(account_id);

    stored_tokens.set(account_id, {
      access_token,
      refresh_token:
        refresh_token === undefined
          ? (current?.refresh_token ?? null)
          : refresh_token,
    });

    return true;
  },
  get_current_account_id: async () => OWNER,
  get_account_tokens: async (account_id: string) =>
    stored_tokens.get(account_id) ?? {
      access_token: null,
      refresh_token: null,
    },
  read_stored_refresh_token: async (account_id: string) =>
    stored_tokens.get(account_id)?.refresh_token ?? null,
}));

const { routed_fetch } = await import("@/services/routing/routing_provider");
const { ApiClient } = await import("./client/api_client");

const OWNER = "3c74a773-b6e8-40ed-a375-c9a26fe97d04";
const SESSION_ENDED = "astermail:session-ended";
const SESSION_EXPIRED = "astermail:session-expired";

type Handler = (url: string) => Response;

function json_response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

function serve(handler: Handler): void {
  vi.mocked(routed_fetch).mockImplementation(async (url: string) =>
    handler(url),
  );
}

function calls_to(path: string): number {
  return vi
    .mocked(routed_fetch)
    .mock.calls.filter(([url]) => String(url).includes(path)).length;
}

describe("a refresh token the server has revoked for good", () => {
  let client: InstanceType<typeof ApiClient>;
  let ended_events = 0;
  let expired_events = 0;
  const on_ended = () => {
    ended_events += 1;
  };
  const on_expired = () => {
    expired_events += 1;
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.mocked(routed_fetch).mockReset();
    stored_tokens.clear();
    ended_events = 0;
    expired_events = 0;
    window.addEventListener(SESSION_ENDED, on_ended);
    window.addEventListener(SESSION_EXPIRED, on_expired);
    client = new ApiClient();
    client.set_expected_user_id(OWNER);
    client.set_authenticated(true);
    client.set_dev_token("access_valid", "refresh_1", OWNER);
    await vi.advanceTimersByTimeAsync(6_000);
  });

  afterEach(() => {
    window.removeEventListener(SESSION_ENDED, on_ended);
    window.removeEventListener(SESSION_EXPIRED, on_expired);
    client.set_authenticated(false);
    vi.useRealTimers();
  });

  it("ends the session once and stops retrying even while the access token still works", async () => {
    serve((url) => {
      if (url.includes("/auth/refresh")) {
        return json_response(401, {
          error: "Authentication required",
          code: "REFRESH_TOKEN_REVOKED",
        });
      }

      return json_response(200, { user_id: OWNER });
    });

    await client.refresh_session();

    expect(ended_events).toBe(1);
    expect(expired_events).toBe(0);
    expect(client.is_authenticated()).toBe(false);
    expect(calls_to("/auth/me")).toBe(0);

    const refreshes = calls_to("/auth/refresh");

    await vi.advanceTimersByTimeAsync(2 * 60 * 60_000);

    expect(calls_to("/auth/refresh")).toBe(refreshes);
    expect(ended_events).toBe(1);
  });

  it("keeps the session through a server error", async () => {
    serve((url) =>
      url.includes("/auth/refresh")
        ? json_response(503, { error: "unavailable", code: "SERVER_ERROR" })
        : json_response(200, { user_id: OWNER }),
    );

    const pending = client.refresh_session();

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await pending;

    expect(calls_to("/auth/refresh")).toBeGreaterThan(0);
    expect(ended_events).toBe(0);
    expect(expired_events).toBe(0);
    expect(client.is_authenticated()).toBe(true);
  });

  it("keeps the session through a network failure", async () => {
    vi.mocked(routed_fetch).mockImplementation(async (url: string) => {
      if (url.includes("/auth/refresh")) throw new TypeError("Failed to fetch");

      return json_response(200, { user_id: OWNER });
    });

    const pending = client.refresh_session();

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await pending;

    expect(calls_to("/auth/refresh")).toBeGreaterThan(0);
    expect(ended_events).toBe(0);
    expect(expired_events).toBe(0);
    expect(client.is_authenticated()).toBe(true);
  });

  it("keeps the session for a plain rejection the access token outlives", async () => {
    serve((url) =>
      url.includes("/auth/refresh")
        ? json_response(401, { error: "unauthorized", code: "UNAUTHORIZED" })
        : json_response(200, { user_id: OWNER }),
    );

    await client.refresh_session();

    expect(ended_events).toBe(0);
    expect(client.is_authenticated()).toBe(true);
  });

  it("leaves an account being added alone", async () => {
    serve((url) =>
      url.includes("/auth/refresh")
        ? json_response(401, {
            error: "Authentication required",
            code: "REFRESH_TOKEN_REVOKED",
          })
        : json_response(200, { user_id: OWNER }),
    );

    client.begin_account_add();
    await client.refresh_session();

    expect(ended_events).toBe(0);
  });
});
