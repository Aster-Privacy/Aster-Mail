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
const { clear_csrf_cache, get_csrf_token_from_cookie } = await import(
  "./csrf"
);

const META_BATCH = "/mail/v1/attachments/meta/batch";

type ClientInternals = {
  last_refresh_attempt_at: number;
  last_completed_refresh_at: number;
  delay: (ms: number) => Promise<void>;
};

const internals = api_client as unknown as ClientInternals;

function json_response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

function csrf_rejection(message: string): Response {
  return json_response(403, { error: message, code: "CSRF_INVALID" });
}

let cookie_value = "";

function set_document_cookie(value: string): void {
  cookie_value = value;
}

function sent_token(init: RequestInit | undefined): string | undefined {
  return (init?.headers as Record<string, string>)["X-CSRF-Token"];
}

function calls_to(fragment: string): number {
  return vi
    .mocked(routed_fetch)
    .mock.calls.filter((c) => String(c[0]).includes(fragment)).length;
}

describe("csrf cookie expiry", () => {
  let session_expired_events = 0;
  const on_session_expired = (): void => {
    session_expired_events += 1;
  };

  beforeEach(() => {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => cookie_value,
    });
    vi.mocked(routed_fetch).mockReset();
    clear_csrf_cache();
    set_document_cookie("");
    internals.last_refresh_attempt_at = 0;
    internals.last_completed_refresh_at = 0;
    vi.spyOn(internals, "delay").mockImplementation(async (ms: number) => {
      internals.last_refresh_attempt_at -= ms;
    });
    session_expired_events = 0;
    window.addEventListener("astermail:session-expired", on_session_expired);
    api_client.set_authenticated(true);
  });

  afterEach(() => {
    window.removeEventListener("astermail:session-expired", on_session_expired);
    vi.restoreAllMocks();
    clear_csrf_cache();
    set_document_cookie("");
    api_client.set_authenticated(false);
  });

  it("renews the session before a write once the csrf cookie expired", async () => {
    const sent: (string | undefined)[] = [];

    set_document_cookie("csrf_token=session-a:1000.old");
    get_csrf_token_from_cookie();
    set_document_cookie("");

    vi.mocked(routed_fetch).mockImplementation(async (url, init) => {
      if (String(url).includes("/auth/refresh")) {
        set_document_cookie("csrf_token=session-a:2000.renewed");

        return json_response(200, { csrf_token: "session-a:2000.renewed" });
      }
      sent.push(sent_token(init));

      return sent_token(init) === "session-a:2000.renewed"
        ? json_response(200, { items: {} })
        : csrf_rejection("CSRF token required");
    });

    const result = await api_client.post(META_BATCH, { mail_ids: ["m1"] });

    expect(result.error).toBeUndefined();
    expect(sent).toEqual(["session-a:2000.renewed"]);
    expect(calls_to("/auth/refresh")).toBe(1);
  });

  it("still refreshes after a rejection that lands inside the refresh gap", async () => {
    set_document_cookie("csrf_token=session-a:1000.same");
    internals.last_refresh_attempt_at = Date.now();

    vi.mocked(routed_fetch).mockImplementation(async (url, init) => {
      if (String(url).includes("/auth/refresh")) {
        set_document_cookie("csrf_token=session-a:3000.refreshed");

        return json_response(200, { csrf_token: "session-a:3000.refreshed" });
      }

      return sent_token(init) === "session-a:3000.refreshed"
        ? json_response(200, { items: {} })
        : csrf_rejection("CSRF token mismatch");
    });

    const result = await api_client.post(META_BATCH, { mail_ids: ["m1"] });

    expect(result.error).toBeUndefined();
    expect(calls_to("/auth/refresh")).toBe(1);
    expect(calls_to(META_BATCH)).toBe(2);
  });

  it("gives up after one refresh without ending the session", async () => {
    set_document_cookie("csrf_token=session-a:1000.same");

    vi.mocked(routed_fetch).mockImplementation(async (url) => {
      if (String(url).includes("/auth/refresh")) {
        return json_response(200, { csrf_token: "session-a:4000.unused" });
      }

      return csrf_rejection("CSRF token mismatch");
    });

    const result = await api_client.post(META_BATCH, { mail_ids: ["m1"] });

    expect(result.code).toBe("FORBIDDEN");
    expect(calls_to(META_BATCH)).toBe(2);
    expect(calls_to("/auth/refresh")).toBe(1);
    expect(session_expired_events).toBe(0);
  });
});
