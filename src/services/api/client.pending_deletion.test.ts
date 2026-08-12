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
  get_effective_retry_count: (default_retry: number) => default_retry,
  get_effective_retry_delay: () => 1,
}));

const { routed_fetch } = await import("@/services/routing/routing_provider");
const { api_client } = await import("./client");
const {
  PENDING_DELETION_EVENT,
  PENDING_DELETION_SERVER_CODE,
  is_pending_deletion_error,
} = await import("./client/helpers");

function forbidden(payload: Record<string, unknown>): Response {
  return {
    ok: false,
    status: 403,
    statusText: "Forbidden",
    headers: { get: () => null },
    json: () => Promise.resolve(payload),
    text: () => Promise.resolve(JSON.stringify(payload)),
  } as unknown as Response;
}

let events = 0;
const count_event = () => {
  events += 1;
};

describe("pending deletion detection", () => {
  beforeEach(() => {
    events = 0;
    vi.mocked(routed_fetch).mockReset();
    window.addEventListener(PENDING_DELETION_EVENT, count_event);
  });

  afterEach(() => {
    window.removeEventListener(PENDING_DELETION_EVENT, count_event);
  });

  it("matches the backend deletion message and the explicit server code", () => {
    expect(
      is_pending_deletion_error(
        undefined,
        "this account is scheduled for deletion",
      ),
    ).toBe(true);
    expect(
      is_pending_deletion_error(
        undefined,
        "This account is Scheduled  For Deletion",
      ),
    ).toBe(true);
    expect(
      is_pending_deletion_error(PENDING_DELETION_SERVER_CODE, undefined),
    ).toBe(true);
    expect(
      is_pending_deletion_error("ACCOUNT_SUSPENDED", "Account suspended"),
    ).toBe(false);
    expect(is_pending_deletion_error(undefined, undefined)).toBe(false);
  });

  it("dispatches the gate event on a 403 carrying the deletion message", async () => {
    vi.mocked(routed_fetch).mockResolvedValue(
      forbidden({ error: "this account is scheduled for deletion" }),
    );

    const result = await api_client.get("/mail/v1/messages?case=deletion", {
      skip_cache: true,
    });

    expect(events).toBe(1);
    expect(result.code).toBe("FORBIDDEN");
    expect(result.server_code).toBe(PENDING_DELETION_SERVER_CODE);
  });

  it("dispatches the gate event when the status endpoint is blocked", async () => {
    vi.mocked(routed_fetch).mockResolvedValue(
      forbidden({ error: "this account is scheduled for deletion" }),
    );

    const result = await api_client.get("/core/v1/account/status", {
      skip_cache: true,
    });

    expect(events).toBe(1);
    expect(result.data).toBeUndefined();
    expect(result.server_code).toBe(PENDING_DELETION_SERVER_CODE);
  });

  it("leaves unrelated forbidden responses alone", async () => {
    vi.mocked(routed_fetch).mockResolvedValue(
      forbidden({ error: "Account suspended", code: "ACCOUNT_SUSPENDED" }),
    );

    const result = await api_client.get("/mail/v1/messages?case=suspended", {
      skip_cache: true,
    });

    expect(events).toBe(0);
    expect(result.server_code).not.toBe(PENDING_DELETION_SERVER_CODE);
  });
});
