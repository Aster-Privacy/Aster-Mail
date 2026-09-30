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
const SESSION_EXPIRED = "astermail:session-expired";

type Handler = (url: string, body: Record<string, unknown>) => Response;

function json_response(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

function unauthorized(): Response {
  return json_response(401, { error: "unauthorized", code: "UNAUTHORIZED" });
}

function serve(handler: Handler): void {
  vi.mocked(routed_fetch).mockImplementation(
    async (url: string, init?: RequestInit) =>
      handler(url, init?.body ? JSON.parse(String(init.body)) : {}),
  );
}

function calls_to(path: string): number {
  return vi
    .mocked(routed_fetch)
    .mock.calls.filter(([url]) => String(url).includes(path)).length;
}

function inbox(client: InstanceType<typeof ApiClient>) {
  return client.get<{ ok: boolean }>("/mail/v1/inbox", {
    skip_cache: true,
    skip_dedup: true,
  });
}

async function sign_in(client: InstanceType<typeof ApiClient>) {
  client.set_expected_user_id(OWNER);
  client.set_authenticated(true);
  client.set_dev_token("access_valid", "refresh_1", OWNER);
  await vi.advanceTimersByTimeAsync(0);
}

describe("a denied refresh never slows down or loops the inbox", () => {
  let client: InstanceType<typeof ApiClient>;
  let expired_events = 0;
  const on_expired = () => {
    expired_events += 1;
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.mocked(routed_fetch).mockReset();
    stored_tokens.clear();
    token_write_gate = Promise.resolve();
    expired_events = 0;
    window.addEventListener(SESSION_EXPIRED, on_expired);
    client = new ApiClient();
    await sign_in(client);
  });

  afterEach(() => {
    window.removeEventListener(SESSION_EXPIRED, on_expired);
    client.set_authenticated(false);
    vi.useRealTimers();
  });

  it("answers requests without waiting for a slow proactive refresh", async () => {
    vi.mocked(routed_fetch).mockImplementation(async (url: string) => {
      if (url.includes("/auth/refresh")) {
        return new Promise<Response>(() => {});
      }

      return json_response(200, { ok: true });
    });
    await vi.advanceTimersByTimeAsync(26 * 60_000);

    let settled = false;
    const pending = inbox(client).then((result) => {
      settled = true;

      return result;
    });

    await vi.advanceTimersByTimeAsync(10);

    expect(settled).toBe(true);
    expect((await pending).data).toEqual({ ok: true });
    expect(calls_to("/auth/refresh")).toBeGreaterThan(0);
  });

  it("backs off a dead refresh token instead of retrying on every request", async () => {
    serve((url) => {
      if (url.includes("/auth/refresh")) return unauthorized();
      if (url.includes("/auth/me")) {
        return json_response(200, { user_id: OWNER });
      }

      return json_response(200, { ok: true });
    });

    for (let second = 0; second < 2 * 60 * 60; second += 5) {
      await vi.advanceTimersByTimeAsync(5_000);
      const result = await inbox(client);

      expect(result.data).toEqual({ ok: true });
    }

    expect(calls_to("/auth/refresh")).toBeLessThanOrEqual(16);
    expect(expired_events).toBe(0);
    expect(client.is_authenticated()).toBe(true);
  });

  it("signs out once the server rejects the access token as well", async () => {
    serve(() => unauthorized());

    await client.refresh_session();

    expect(expired_events).toBe(1);
    expect(client.is_authenticated()).toBe(false);
  });

  it("still refreshes for a rejected request while backing off", async () => {
    let refresh_works = false;
    let inbox_calls = 0;
    const sent: unknown[] = [];

    serve((url, body) => {
      if (url.includes("/auth/refresh")) {
        sent.push(body.refresh_token);
        if (!refresh_works) return unauthorized();

        return json_response(200, {
          csrf_token: "csrf_2",
          access_token: "access_2",
          refresh_token: "refresh_2",
        });
      }
      if (url.includes("/auth/me")) {
        return json_response(200, { user_id: OWNER });
      }

      inbox_calls += 1;

      return inbox_calls === 1
        ? unauthorized()
        : json_response(200, { ok: true });
    });

    await client.refresh_session();
    await vi.advanceTimersByTimeAsync(6_000);
    refresh_works = true;

    const result = await inbox(client);

    expect(result.data).toEqual({ ok: true });
    expect(sent).toEqual(["refresh_1", "refresh_1"]);
    expect(client.get_access_token()).toBe("access_2");
  });

  it("does not hold every other request when refresh is rate limited", async () => {
    serve((url) => {
      if (url.includes("/auth/refresh")) {
        return json_response(
          429,
          { error: "slow down", code: "RATE_LIMITED" },
          { "retry-after": "15" },
        );
      }

      return json_response(200, { ok: true });
    });

    await vi.advanceTimersByTimeAsync(6_000);
    await client.refresh_session();

    expect(calls_to("/auth/refresh")).toBeGreaterThan(0);

    let settled = false;
    const pending = inbox(client).then((result) => {
      settled = true;

      return result;
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(settled).toBe(true);
    expect((await pending).data).toEqual({ ok: true });
  });

  it("sends the refresh token another tab stored instead of its own stale copy", async () => {
    stored_tokens.set(OWNER, {
      access_token: "access_valid",
      refresh_token: "refresh_from_other_tab",
    });

    const sent: unknown[] = [];

    serve((url, body) => {
      if (url.includes("/auth/refresh")) {
        sent.push(body.refresh_token);

        return json_response(200, {
          csrf_token: "csrf_2",
          access_token: "access_2",
          refresh_token: "refresh_3",
        });
      }

      return json_response(200, { user_id: OWNER });
    });

    await vi.advanceTimersByTimeAsync(6_000);
    await client.refresh_session();

    expect(sent).toEqual(["refresh_from_other_tab"]);
    expect(stored_tokens.get(OWNER)?.refresh_token).toBe("refresh_3");
  });

  it("finishes storing a rotated token before the refresh settles", async () => {
    let open_gate: () => void = () => {};

    token_write_gate = new Promise((resolve) => {
      open_gate = resolve;
    });

    serve((url) =>
      url.includes("/auth/refresh")
        ? json_response(200, {
            csrf_token: "csrf_2",
            access_token: "access_2",
            refresh_token: "refresh_2",
          })
        : json_response(200, { user_id: OWNER }),
    );

    await vi.advanceTimersByTimeAsync(6_000);

    let settled = false;
    const refresh = client.refresh_session().then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(settled).toBe(false);

    open_gate();
    await refresh;

    expect(settled).toBe(true);
    expect(stored_tokens.get(OWNER)?.refresh_token).toBe("refresh_2");
  });
});

describe("two tabs refreshing the same account", () => {
  const original_locks = Object.getOwnPropertyDescriptor(navigator, "locks");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(routed_fetch).mockReset();
    stored_tokens.clear();
    token_write_gate = Promise.resolve();

    const held = new Map<string, Promise<unknown>>();

    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: (
          name: string,
          _options: unknown,
          callback: () => Promise<unknown>,
        ) => {
          const previous = held.get(name) ?? Promise.resolve();
          const run = previous.then(callback, callback);

          held.set(
            name,
            run.catch(() => undefined),
          );

          return run;
        },
      },
    });
  });

  afterEach(() => {
    if (original_locks) {
      Object.defineProperty(navigator, "locks", original_locks);
    } else {
      delete (navigator as { locks?: unknown }).locks;
    }
    vi.useRealTimers();
  });

  it("rotates once per tab without either tab replaying a spent token", async () => {
    let current = "refresh_1";
    let generation = 1;
    const replays: string[] = [];

    serve((url, body) => {
      if (url.includes("/auth/refresh")) {
        if (body.refresh_token !== current) {
          replays.push(String(body.refresh_token));

          return unauthorized();
        }
        generation += 1;
        current = `refresh_${generation}`;

        return json_response(200, {
          csrf_token: `csrf_${generation}`,
          access_token: `access_${generation}`,
          refresh_token: current,
        });
      }

      return json_response(200, { user_id: OWNER });
    });

    const tab_a = new ApiClient();
    const tab_b = new ApiClient();

    await sign_in(tab_a);
    await sign_in(tab_b);
    await vi.advanceTimersByTimeAsync(6_000);

    await Promise.all([tab_a.refresh_session(), tab_b.refresh_session()]);

    expect(replays).toEqual([]);
    expect(generation).toBe(3);
    expect(stored_tokens.get(OWNER)?.refresh_token).toBe(current);
    expect(tab_b.get_active_refresh_token()).toBe(current);

    tab_a.set_authenticated(false);
    tab_b.set_authenticated(false);
  });
});
