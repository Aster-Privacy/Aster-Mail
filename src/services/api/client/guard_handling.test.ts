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
const { api_client } = await import("../client");
const {
  GUARD_DEVICE_PENDING_EVENT,
  GUARD_HEADER,
  GUARD_HELD_EVENT,
  GUARD_REQUIRED_EVENT,
} = await import("./helpers");

const APPLY_AFTER = "2026-11-15T10:00:00Z";
const GUARD_TOKEN = "gt_fake_token_value_for_tests";

function reply(
  status: number,
  payload: Record<string, unknown>,
  headers: Record<string, string> = {},
): Response {
  const lower: Record<string, string> = {};

  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
    json: () => Promise.resolve(payload),
    text: () => Promise.resolve(JSON.stringify(payload)),
  } as unknown as Response;
}

function held_body(kind: string, extra: Record<string, unknown> = {}) {
  return {
    code: "GUARD_HELD",
    details: { id: "c1", kind, apply_after: APPLY_AFTER },
    ...extra,
  };
}

const seen: Record<string, unknown[]> = {};
const listeners: [string, (e: Event) => void][] = [];

function listen(name: string): void {
  seen[name] = [];
  const handler = (e: Event) => {
    seen[name].push((e as CustomEvent).detail);
  };

  listeners.push([name, handler]);
  window.addEventListener(name, handler);
}

function sent_headers(call_index = 0): Record<string, string> {
  const call = vi.mocked(routed_fetch).mock.calls[call_index];
  const init = call[1] as RequestInit;

  return init.headers as Record<string, string>;
}

describe("guard response handling", () => {
  beforeEach(() => {
    vi.mocked(routed_fetch).mockReset();
    listen(GUARD_HELD_EVENT);
    listen(GUARD_REQUIRED_EVENT);
    listen(GUARD_DEVICE_PENDING_EVENT);
  });

  afterEach(() => {
    for (const [name, handler] of listeners) {
      window.removeEventListener(name, handler);
    }
    listeners.length = 0;
    vi.restoreAllMocks();
  });

  it("sends the guard header on every request", async () => {
    vi.mocked(routed_fetch).mockResolvedValue(reply(200, { ok: true }));

    await api_client.get("/mail/v1/messages?case=guard_header", {
      skip_cache: true,
    });
    await api_client.post("/core/v1/settings?case=guard_header", {});

    expect(GUARD_HEADER).toBe("X-Aster-Guard");
    expect(sent_headers(0)[GUARD_HEADER]).toBe("1");
    expect(sent_headers(1)[GUARD_HEADER]).toBe("1");
  });

  it("turns a 202 held reply into a held result and one event", async () => {
    vi.mocked(routed_fetch).mockResolvedValue(
      reply(202, held_body("forwarding_change")),
    );

    const result = await api_client.post("/mail/v1/forwarding?case=202", {});

    expect(result.error).toBeUndefined();
    expect(result.data).toBeUndefined();
    expect(result.held).toEqual({
      id: "c1",
      kind: "forwarding_change",
      apply_after: APPLY_AFTER,
      skippable: true,
    });
    expect(seen[GUARD_HELD_EVENT]).toEqual([result.held]);
  });

  it("returns an error plus held info on a 409 held reply", async () => {
    vi.mocked(routed_fetch).mockResolvedValue(
      reply(409, held_body("password_change", { error: "held" })),
    );

    const result = await api_client.post("/core/v1/auth/password?case=409", {});

    expect(result.error).toBeTruthy();
    expect(result.server_code).toBe("GUARD_HELD");
    expect(result.held?.kind).toBe("password_change");
    expect(result.held?.skippable).toBe(true);
    expect(seen[GUARD_HELD_EVENT]).toHaveLength(1);
  });

  it.each(["rescue", "account_recovery"])(
    "marks %s as not skippable",
    async (kind) => {
      vi.mocked(routed_fetch).mockResolvedValue(reply(202, held_body(kind)));

      const result = await api_client.post(`/core/v1/x?case=${kind}`, {});

      expect(result.held?.kind).toBe(kind);
      expect(result.held?.skippable).toBe(false);
    },
  );

  it("keeps a rescue code rotation as its own kind", async () => {
    vi.mocked(routed_fetch).mockResolvedValue(
      reply(202, held_body("rescue_code_rotation")),
    );

    const result = await api_client.post("/core/v1/x?case=rotation", {});

    expect(result.held?.kind).toBe("rescue_code_rotation");
  });

  it("maps an unknown kind to unknown and not skippable", async () => {
    vi.mocked(routed_fetch).mockResolvedValue(
      reply(202, held_body("future_kind")),
    );

    const result = await api_client.post("/core/v1/x?case=unknown", {});

    expect(result.held?.kind).toBe("unknown");
    expect(result.held?.skippable).toBe(false);
  });

  it("lets the server mark a kind as not skippable", async () => {
    vi.mocked(routed_fetch).mockResolvedValue(
      reply(202, {
        code: "GUARD_HELD",
        details: {
          id: "c2",
          kind: "forwarding_change",
          apply_after: APPLY_AFTER,
          skippable: false,
        },
      }),
    );

    const result = await api_client.post("/core/v1/x?case=server_skip", {});

    expect(result.held?.skippable).toBe(false);
  });

  it("leaves a normal 202 reply alone", async () => {
    vi.mocked(routed_fetch).mockResolvedValue(reply(202, { queued: true }));

    const result = await api_client.post<{ queued: boolean }>(
      "/core/v1/x?case=plain_202",
      {},
    );

    expect(result.held).toBeUndefined();
    expect(result.data).toEqual({ queued: true });
    expect(seen[GUARD_HELD_EVENT]).toHaveLength(0);
  });

  it("dispatches device pending without a refresh", async () => {
    const details = {
      device_id: "d1",
      activates_at: APPLY_AFTER,
      change_id: "c9",
    };

    vi.mocked(routed_fetch).mockResolvedValue(
      reply(403, { error: "pending", code: "GUARD_DEVICE_PENDING", details }),
    );

    const result = await api_client.get("/mail/v1/messages?case=pending", {
      skip_cache: true,
    });

    expect(result.server_code).toBe("GUARD_DEVICE_PENDING");
    expect(result.details).toEqual(details);
    expect(seen[GUARD_DEVICE_PENDING_EVENT]).toEqual([details]);
    expect(routed_fetch).toHaveBeenCalledTimes(1);
  });

  it("exposes retry_after_secs from details on a paused reply", async () => {
    vi.mocked(routed_fetch).mockResolvedValue(
      reply(
        429,
        {
          error: "paused",
          code: "GUARD_PAUSED",
          details: { retry_after_secs: 1800 },
        },
        { "Retry-After": "5" },
      ),
    );

    const result = await api_client.get("/core/v1/guard/sign-in/status", {
      skip_cache: true,
      skip_session_refresh: true,
    });

    expect(result.server_code).toBe("GUARD_PAUSED");
    expect(result.retry_after_secs).toBe(1800);
    expect(routed_fetch).toHaveBeenCalledTimes(1);
  });

  it("dispatches guard required without a refresh or token logging", async () => {
    const spies = [
      vi.spyOn(console, "log").mockImplementation(() => {}),
      vi.spyOn(console, "warn").mockImplementation(() => {}),
      vi.spyOn(console, "error").mockImplementation(() => {}),
      vi.spyOn(console, "info").mockImplementation(() => {}),
      vi.spyOn(console, "debug").mockImplementation(() => {}),
    ];
    const details = {
      request_id: "r1",
      guard_token: GUARD_TOKEN,
      expires_at: APPLY_AFTER,
      methods: ["approve", "code", "rescue"],
    };

    vi.mocked(routed_fetch).mockResolvedValue(
      reply(403, {
        error: "Aster Guard needs to approve this sign-in.",
        code: "GUARD_REQUIRED",
        details,
      }),
    );

    const result = await api_client.post("/core/v1/auth/login?case=req", {});

    expect(result.server_code).toBe("GUARD_REQUIRED");
    expect(result.details).toEqual(details);
    expect(seen[GUARD_REQUIRED_EVENT]).toEqual([
      { ...details, user_id: null },
    ]);
    expect(routed_fetch).toHaveBeenCalledTimes(1);

    for (const spy of spies) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(GUARD_TOKEN);
    }
  });

  it.each([
    ["GUARD_DEVICE_REQUIRED", "/core/v1/guard/challenge"],
    ["STEP_UP_REQUIRED", "/core/v1/guard/setup"],
  ])("passes %s through without a refresh", async (code, endpoint) => {
    vi.mocked(routed_fetch).mockResolvedValue(
      reply(403, { error: "no", code, details: {} }),
    );

    const result = await api_client.post(endpoint, {});

    expect(result.error).toBeTruthy();
    expect(result.server_code).toBe(code);
    expect(routed_fetch).toHaveBeenCalledTimes(1);
  });
});
