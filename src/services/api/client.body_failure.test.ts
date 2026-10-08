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

vi.mock("@/services/routing/routing_provider", () => ({
  routed_fetch: vi.fn(),
  get_effective_base_url: (default_base_url: string) => default_base_url,
  get_effective_timeout: (default_timeout: number) => default_timeout,
  get_effective_retry_count: (default_retry: number) => default_retry,
  get_effective_retry_delay: () => 1,
}));

const { routed_fetch } = await import("@/services/routing/routing_provider");
const { api_client } = await import("./client");

function calls_to(path: string): number {
  return vi
    .mocked(routed_fetch)
    .mock.calls.filter(([url]) => String(url).includes(path)).length;
}

function response_with_failing_body(): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: () => Promise.reject(new TypeError("body stream interrupted")),
  } as unknown as Response;
}

function response_with_json(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: () => Promise.resolve(JSON.stringify(payload)),
  } as unknown as Response;
}

describe("api client body download failure", () => {
  beforeEach(() => {
    vi.mocked(routed_fetch).mockReset();
  });

  it("returns a network error instead of a silent empty success", async () => {
    vi.mocked(routed_fetch).mockResolvedValue(response_with_failing_body());

    const result = await api_client.get("/mail/v1/messages?case=fail", {
      skip_cache: true,
    });

    expect(result.data).toBeUndefined();
    expect(result.error).toBeTruthy();
    expect(result.code).toBe("NETWORK_ERROR");
  });

  it("retries body failures on idempotent requests when retry is configured", async () => {
    vi.mocked(routed_fetch).mockResolvedValue(response_with_failing_body());

    const result = await api_client.get("/mail/v1/messages?case=retry", {
      skip_cache: true,
      retry: 2,
      retry_delay: 1,
    });

    expect(result.code).toBe("NETWORK_ERROR");
    expect(vi.mocked(routed_fetch)).toHaveBeenCalledTimes(3);
  });

  it("returns a server error and retries when the body arrives truncated", async () => {
    const truncated = {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: () => Promise.resolve('{"items":[{"id":"abc'),
    } as unknown as Response;

    vi.mocked(routed_fetch)
      .mockResolvedValueOnce(truncated)
      .mockResolvedValueOnce(response_with_json({ items: [], total: 4 }));

    const result = await api_client.get<{ items: unknown[]; total: number }>(
      "/mail/v1/messages?case=truncated",
      { skip_cache: true, retry: 2, retry_delay: 1 },
    );

    expect(result.error).toBeUndefined();
    expect(result.data?.total).toBe(4);
    expect(vi.mocked(routed_fetch)).toHaveBeenCalledTimes(2);
  });

  it("never replays a send when the response body fails to parse", async () => {
    const truncated = {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: () => Promise.resolve('{"success":tr'),
    } as unknown as Response;

    vi.mocked(routed_fetch).mockResolvedValue(truncated);

    const result = await api_client.post(
      "/mail/v1/send",
      { to: ["someone@example.com"] },
      { retry: 2, retry_delay: 1 },
    );

    expect(result.code).toBe("SERVER_ERROR");
    expect(vi.mocked(routed_fetch)).toHaveBeenCalledTimes(1);
  });

  it("recovers when a retry succeeds after an interrupted body", async () => {
    vi.mocked(routed_fetch)
      .mockResolvedValueOnce(response_with_failing_body())
      .mockResolvedValueOnce(response_with_json({ items: [], total: 7 }));

    const result = await api_client.get<{ items: unknown[]; total: number }>(
      "/mail/v1/messages?case=recover",
      { skip_cache: true, retry: 2, retry_delay: 1 },
    );

    expect(result.error).toBeUndefined();
    expect(result.data?.total).toBe(7);
  });

  it("times out when the body stalls after the headers arrive", async () => {
    const stalled = {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: () => new Promise<string>(() => undefined),
    } as unknown as Response;

    vi.mocked(routed_fetch).mockResolvedValue(stalled);

    const result = await api_client.get("/mail/v1/messages?case=stalled", {
      skip_cache: true,
      timeout: 20,
    });

    expect(result.data).toBeUndefined();
    expect(result.code).toBe("TIMEOUT_ERROR");
  });

  it("keeps reading a slow body while data keeps arriving", async () => {
    const encoder = new TextEncoder();
    const json = JSON.stringify({ items: [], total: 9 });
    const pieces = [json.slice(0, 5), json.slice(5, 12), json.slice(12)];
    const body = new ReadableStream<Uint8Array>({
      async start(stream) {
        for (const piece of pieces) {
          await new Promise((resolve) => setTimeout(resolve, 30));
          stream.enqueue(encoder.encode(piece));
        }
        stream.close();
      },
    });

    vi.mocked(routed_fetch).mockResolvedValue(
      new Response(body, { status: 200 }),
    );

    const result = await api_client.get<{ items: unknown[]; total: number }>(
      "/mail/v1/messages?case=slow_stream",
      { skip_cache: true, timeout: 60 },
    );

    expect(result.error).toBeUndefined();
    expect(result.data?.total).toBe(9);
  });

  it("times out when a streamed body stops arriving", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(stream) {
        stream.enqueue(encoder.encode('{"items":['));
      },
    });

    vi.mocked(routed_fetch).mockResolvedValue(
      new Response(body, { status: 200 }),
    );

    const result = await api_client.get("/mail/v1/messages?case=stream_stall", {
      skip_cache: true,
      timeout: 20,
    });

    expect(result.data).toBeUndefined();
    expect(result.code).toBe("TIMEOUT_ERROR");
  });

  it("times out when an error body stalls", async () => {
    const stalled_error = {
      ok: false,
      status: 500,
      statusText: "Server Error",
      headers: { get: () => null },
      text: () => new Promise<string>(() => undefined),
    } as unknown as Response;

    vi.mocked(routed_fetch).mockResolvedValue(stalled_error);

    const result = await api_client.get("/mail/v1/messages?case=stalled_err", {
      skip_cache: true,
      timeout: 20,
    });

    expect(result.code).toBe("SERVER_ERROR");
  });

  it("never replays a send whose body stalls past the timeout", async () => {
    const stalled = {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: () => new Promise<string>(() => undefined),
    } as unknown as Response;

    vi.mocked(routed_fetch).mockResolvedValue(stalled);

    const result = await api_client.post(
      "/mail/v1/send",
      { to: ["someone@example.com"] },
      { retry: 2, retry_delay: 1, timeout: 20 },
    );

    expect(result.code).toBe("TIMEOUT_ERROR");
    expect(calls_to("/mail/v1/send")).toBe(1);
  });

  it("never replays a send after the connection drops", async () => {
    vi.mocked(routed_fetch).mockRejectedValue(new TypeError("network down"));

    const result = await api_client.post(
      "/mail/v1/send",
      { to: ["someone@example.com"] },
      { retry: 2, retry_delay: 1 },
    );

    expect(result.code).toBe("NETWORK_ERROR");
    expect(calls_to("/mail/v1/send")).toBe(1);
  });

  it.each(["put", "patch", "delete"] as const)(
    "never replays a %s request after a transport failure",
    async (method) => {
      vi.mocked(routed_fetch).mockRejectedValue(new TypeError("network down"));

      const config = { retry: 2, retry_delay: 1 };
      const result =
        method === "delete"
          ? await api_client.delete("/mail/v1/messages/abc", config)
          : await api_client[method]("/mail/v1/messages/abc", {}, config);

      expect(result.code).toBe("NETWORK_ERROR");
      expect(calls_to("/mail/v1/messages/abc")).toBe(1);
    },
  );

  it("still retries a read after the connection drops", async () => {
    vi.mocked(routed_fetch)
      .mockRejectedValueOnce(new TypeError("network down"))
      .mockResolvedValueOnce(response_with_json({ items: [], total: 2 }));

    const result = await api_client.get<{ items: unknown[]; total: number }>(
      "/mail/v1/messages?case=reconnect",
      { skip_cache: true, retry: 2, retry_delay: 1 },
    );

    expect(result.data?.total).toBe(2);
    expect(calls_to("case=reconnect")).toBe(2);
  });
});
