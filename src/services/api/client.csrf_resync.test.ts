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

vi.mock("@/services/routing/routing_provider", () => ({
  routed_fetch: vi.fn(),
  get_effective_base_url: (default_base_url: string) => default_base_url,
  get_effective_timeout: (default_timeout: number) => default_timeout,
  get_effective_retry_count: () => 0,
  get_effective_retry_delay: () => 1,
}));

vi.mock("@/services/account_manager", () => ({
  update_account_tokens: async () => true,
  get_current_account_id: async () => null,
  get_account_tokens: async () => ({ access_token: null, refresh_token: null }),
}));

const { routed_fetch } = await import("@/services/routing/routing_provider");
const { api_client } = await import("./client");
const { clear_csrf_cache, set_csrf_token } = await import("./csrf");

function json_response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

function csrf_invalid(): Response {
  return json_response(403, {
    error: "CSRF token mismatch",
    code: "CSRF_INVALID",
  });
}

function set_document_cookie(value: string): void {
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => value,
  });
}

describe("csrf cookie resync", () => {
  beforeEach(() => {
    vi.mocked(routed_fetch).mockReset();
    clear_csrf_cache();
    set_document_cookie("");
    api_client.set_authenticated(true);
  });

  afterEach(() => {
    clear_csrf_cache();
    set_document_cookie("");
    api_client.set_authenticated(false);
  });

  it("retries with the current cookie before refreshing the session", async () => {
    const sent_tokens: string[] = [];

    set_csrf_token("session-a:1000.stale");
    set_document_cookie("csrf_token=session-a:2000.current");

    vi.mocked(routed_fetch).mockImplementation(async (_url, init) => {
      const token = (init?.headers as Record<string, string>)["X-CSRF-Token"];

      sent_tokens.push(token);

      return token === "session-a:2000.current"
        ? json_response(200, { ok: true })
        : csrf_invalid();
    });

    const result = await api_client.post<{ ok: boolean }>(
      "/mail/v1/messages/batch",
      {},
    );

    const urls = vi.mocked(routed_fetch).mock.calls.map((c) => String(c[0]));

    expect(result.data).toEqual({ ok: true });
    expect(urls.some((u) => u.includes("/auth/refresh"))).toBe(false);
    expect(sent_tokens).toEqual([
      "session-a:1000.stale",
      "session-a:2000.current",
    ]);
  });

  it("falls back to a session refresh when the cookie matches what was sent", async () => {
    set_document_cookie("csrf_token=session-a:1000.same");

    vi.mocked(routed_fetch).mockImplementation(async (url, init) => {
      if (String(url).includes("/auth/refresh")) {
        set_document_cookie("csrf_token=session-a:3000.refreshed");

        return json_response(200, { csrf_token: "session-a:3000.refreshed" });
      }
      const token = (init?.headers as Record<string, string>)["X-CSRF-Token"];

      return token === "session-a:3000.refreshed"
        ? json_response(200, { ok: true })
        : csrf_invalid();
    });

    const result = await api_client.post<{ ok: boolean }>(
      "/mail/v1/messages/batch",
      {},
    );

    const urls = vi.mocked(routed_fetch).mock.calls.map((c) => String(c[0]));

    expect(result.data).toEqual({ ok: true });
    expect(urls.filter((u) => u.includes("/auth/refresh"))).toHaveLength(1);
  });

  it("resyncs only once per request", async () => {
    let cookie_turn = 0;

    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => `csrf_token=session-a:${++cookie_turn}.rotating`,
    });

    vi.mocked(routed_fetch).mockImplementation(async (url) =>
      String(url).includes("/auth/refresh")
        ? json_response(401, { error: "unauthorized" })
        : csrf_invalid(),
    );

    await api_client.post("/mail/v1/messages/batch", {});

    const posts = vi
      .mocked(routed_fetch)
      .mock.calls.filter((c) =>
        String(c[0]).includes("/mail/v1/messages/batch"),
      );

    expect(posts.length).toBeLessThanOrEqual(3);
  });
});
