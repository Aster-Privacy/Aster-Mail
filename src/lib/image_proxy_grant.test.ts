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
//
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetch_proxied_image,
  get_image_proxy_grant,
  reset_image_proxy_grant_state,
  should_defer_proxied_images,
} from "./image_proxy_grant";

const post = vi.hoisted(() => vi.fn());
const routed_fetch = vi.hoisted(() => vi.fn());
const shell = vi.hoisted(() => ({
  native: false,
  method: "direct",
  token: null as string | null,
}));

vi.mock("@/services/api/client", () => ({
  api_client: { post, get_access_token: () => shell.token },
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => shell.native },
}));

vi.mock("@/services/routing/connection_store", () => ({
  connection_store: {
    get_method: () => shell.method,
    subscribe: () => () => {},
  },
}));

vi.mock("@/services/routing/routing_provider", () => ({ routed_fetch }));

const proxied =
  "/api/images/v1/proxy?url=https%3A%2F%2Fimages.example.test%2Fa.png";

function grant_reply(grant: string) {
  return { data: { grant, expires_in: 330 }, status: 200 };
}

function image_reply(status: number): Response {
  return new Response(status === 200 ? new Uint8Array([1, 2, 3]) : null, {
    status,
    headers: { "content-type": "image/PNG; charset=binary" },
  });
}

describe("image proxy grants", () => {
  beforeEach(() => {
    post.mockReset();
    routed_fetch.mockReset();
    shell.native = false;
    shell.method = "direct";
    shell.token = null;
    reset_image_proxy_grant_state();
  });

  it("requests one grant for concurrent callers and reuses it", async () => {
    post.mockResolvedValue(grant_reply("grant-one"));

    const [first, second] = await Promise.all([
      get_image_proxy_grant(),
      get_image_proxy_grant(),
    ]);
    const third = await get_image_proxy_grant();

    expect([first, second, third]).toEqual([
      "grant-one",
      "grant-one",
      "grant-one",
    ]);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/images/v1/grant", {});
  });

  it("fetches without credentials and presents only the grant", async () => {
    post.mockResolvedValue(grant_reply("grant-one"));
    const fetcher = vi.fn().mockResolvedValue(image_reply(200));

    const result = await fetch_proxied_image(proxied, { fetcher });

    expect(result.kind).toBe("image");
    if (result.kind !== "image") return;
    expect(Array.from(result.bytes)).toEqual([1, 2, 3]);
    expect(result.content_type).toBe("image/png");
    expect(fetcher).toHaveBeenCalledTimes(1);

    const [url, init] = fetcher.mock.calls[0];

    expect(url).toBe(proxied);
    expect(init.credentials).toBe("omit");
    expect(init.referrerPolicy).toBe("no-referrer");
    expect(init.headers).toEqual({
      Authorization: "AsterImageGrant grant-one",
    });
  });

  it("asks for a fresh grant once when the proxy refuses the current one", async () => {
    post
      .mockResolvedValueOnce(grant_reply("grant-one"))
      .mockResolvedValueOnce(grant_reply("grant-two"));
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(image_reply(401))
      .mockResolvedValueOnce(image_reply(200));

    const result = await fetch_proxied_image(proxied, { fetcher });

    expect(result.kind).toBe("image");
    expect(post).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][1].headers).toEqual({
      Authorization: "AsterImageGrant grant-two",
    });
    expect(fetcher.mock.calls[1][1].credentials).toBe("omit");
    expect(await get_image_proxy_grant()).toBe("grant-two");
  });

  it("reports no usable grant when a fresh one is refused too", async () => {
    post
      .mockResolvedValueOnce(grant_reply("grant-one"))
      .mockResolvedValueOnce(grant_reply("grant-two"));
    const fetcher = vi.fn().mockResolvedValue(image_reply(401));

    expect(await fetch_proxied_image(proxied, { fetcher })).toEqual({
      kind: "fallback",
    });
    expect(post).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("reports no usable grant when a refused one cannot be replaced", async () => {
    post
      .mockResolvedValueOnce(grant_reply("grant-one"))
      .mockResolvedValueOnce({ error: "Too many requests", status: 429 });
    const fetcher = vi.fn().mockResolvedValue(image_reply(401));

    expect(await fetch_proxied_image(proxied, { fetcher })).toEqual({
      kind: "fallback",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps the current grant when the proxy answers 403", async () => {
    post.mockResolvedValue(grant_reply("grant-one"));
    const fetcher = vi.fn().mockResolvedValue(image_reply(403));

    expect(await fetch_proxied_image(proxied, { fetcher })).toEqual({
      kind: "fallback",
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await get_image_proxy_grant()).toBe("grant-one");
  });

  it("asks for a grant again soon after a short failure", async () => {
    vi.useFakeTimers();

    try {
      post
        .mockResolvedValueOnce({ error: "Unavailable", status: 503 })
        .mockResolvedValueOnce(grant_reply("grant-one"));

      expect(await get_image_proxy_grant()).toBeNull();
      expect(await get_image_proxy_grant()).toBeNull();
      expect(post).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1_500);

      expect(await get_image_proxy_grant()).toBe("grant-one");
      expect(post).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("waits a minute before asking again when grants are unsupported", async () => {
    vi.useFakeTimers();

    try {
      post
        .mockResolvedValueOnce({ error: "Not found", status: 404 })
        .mockResolvedValueOnce(grant_reply("grant-one"));

      expect(await get_image_proxy_grant()).toBeNull();

      vi.advanceTimersByTime(59_000);

      expect(await get_image_proxy_grant()).toBeNull();
      expect(post).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(2_000);

      expect(await get_image_proxy_grant()).toBe("grant-one");
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports no usable grant without asking again when grants are unsupported", async () => {
    post.mockResolvedValue({ error: "Not found", status: 404 });
    const fetcher = vi.fn();

    expect(await fetch_proxied_image(proxied, { fetcher })).toEqual({
      kind: "fallback",
    });
    expect(await fetch_proxied_image(proxied, { fetcher })).toEqual({
      kind: "fallback",
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports no usable grant when the grant request throws", async () => {
    post.mockRejectedValue(new Error("offline"));

    expect(await fetch_proxied_image(proxied, { fetcher: vi.fn() })).toEqual({
      kind: "fallback",
    });
  });

  it("reports a failed image instead of falling back on other errors", async () => {
    post.mockResolvedValue(grant_reply("grant-one"));

    expect(
      await fetch_proxied_image(proxied, {
        fetcher: vi.fn().mockResolvedValue(image_reply(404)),
      }),
    ).toEqual({ kind: "failed", retryable: false });
    expect(
      await fetch_proxied_image(proxied, {
        fetcher: vi.fn().mockResolvedValue(image_reply(502)),
      }),
    ).toEqual({ kind: "failed", retryable: true });
  });

  it("asks for a fresh grant once when the current one is rate limited", async () => {
    post
      .mockResolvedValueOnce(grant_reply("grant-one"))
      .mockResolvedValueOnce(grant_reply("grant-two"));
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(image_reply(429))
      .mockResolvedValueOnce(image_reply(200));

    const result = await fetch_proxied_image(proxied, { fetcher });

    expect(result.kind).toBe("image");
    expect(post).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][1].headers).toEqual({
      Authorization: "AsterImageGrant grant-two",
    });
  });
});

const native_proxied =
  "https://app.astermail.org/api/images/v1/proxy?url=https%3A%2F%2Fimages.example.test%2Fa.png";

function set_tauri(present: boolean): void {
  const target = window as unknown as Record<string, unknown>;

  if (present) target.__TAURI_INTERNALS__ = {};
  else delete target.__TAURI_INTERNALS__;
}

describe("image proxy surfaces", () => {
  const start_href = window.location.href;

  beforeEach(() => {
    post.mockReset();
    routed_fetch.mockReset();
    shell.native = false;
    shell.method = "direct";
    shell.token = null;
    set_tauri(false);
    reset_image_proxy_grant_state();
  });

  afterEach(() => {
    set_tauri(false);
    (
      window as unknown as { happyDOM?: { setURL(url: string): void } }
    ).happyDOM?.setURL(start_href);
  });

  it("defers proxied images in the browser, the desktop app and the mobile app", () => {
    expect(should_defer_proxied_images()).toBe(true);

    set_tauri(true);
    expect(should_defer_proxied_images()).toBe(true);

    set_tauri(false);
    shell.native = true;
    expect(should_defer_proxied_images()).toBe(true);
  });

  it("leaves in-app Tor routing out of the deferred path", () => {
    shell.method = "tor";
    expect(should_defer_proxied_images()).toBe(false);
    shell.method = "tor_snowflake";
    expect(should_defer_proxied_images()).toBe(false);
  });

  it("sends the onion site's image requests to the onion origin with only the grant", async () => {
    (
      window as unknown as { happyDOM: { setURL(url: string): void } }
    ).happyDOM.setURL("http://asterexampleonionhost.onion/inbox");
    post.mockResolvedValue(grant_reply("grant-one"));
    routed_fetch.mockResolvedValue(image_reply(200));

    expect(should_defer_proxied_images()).toBe(true);

    const result = await fetch_proxied_image(proxied);

    expect(result.kind).toBe("image");
    expect(routed_fetch).toHaveBeenCalledTimes(1);

    const [url, init] = routed_fetch.mock.calls[0];

    expect(url).toBe(`http://asterexampleonionhost.onion${proxied}`);
    expect(init.credentials).toBe("omit");
    expect(init.headers).toEqual({
      Authorization: "AsterImageGrant grant-one",
    });
  });

  it("routes desktop image requests through the app transport with only the grant", async () => {
    set_tauri(true);
    shell.token = "account-token";
    post.mockResolvedValue(grant_reply("grant-one"));
    routed_fetch.mockResolvedValue(image_reply(200));

    const result = await fetch_proxied_image(native_proxied);

    expect(result.kind).toBe("image");
    expect(routed_fetch).toHaveBeenCalledTimes(1);
    expect(routed_fetch.mock.calls[0][0]).toBe(native_proxied);
    expect(routed_fetch.mock.calls[0][1].credentials).toBe("omit");
    expect(routed_fetch.mock.calls[0][1].headers).toEqual({
      Authorization: "AsterImageGrant grant-one",
    });
  });

  it("uses the account token header in the mobile app when grants are unsupported", async () => {
    shell.native = true;
    shell.token = "account-token";
    post.mockResolvedValue({ error: "Not found", status: 404 });
    const fetcher = vi.fn().mockResolvedValue(image_reply(200));

    const result = await fetch_proxied_image(native_proxied, { fetcher });

    expect(result.kind).toBe("image");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1].credentials).toBe("omit");
    expect(fetcher.mock.calls[0][1].headers).toEqual({
      Authorization: "Bearer account-token",
    });
  });

  it("uses the account token header on the desktop when the grant is refused", async () => {
    set_tauri(true);
    shell.token = "account-token";
    post
      .mockResolvedValueOnce(grant_reply("grant-one"))
      .mockResolvedValueOnce(grant_reply("grant-two"));
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(image_reply(401))
      .mockResolvedValueOnce(image_reply(401))
      .mockResolvedValueOnce(image_reply(200));

    const result = await fetch_proxied_image(native_proxied, { fetcher });

    expect(result.kind).toBe("image");
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[2][1].headers).toEqual({
      Authorization: "Bearer account-token",
    });
    for (const call of fetcher.mock.calls) {
      expect(call[1].credentials).toBe("omit");
    }
  });

  it("loads nothing in the mobile app without a grant or an account token", async () => {
    shell.native = true;
    post.mockResolvedValue({ error: "Not found", status: 404 });
    const fetcher = vi.fn();

    expect(await fetch_proxied_image(native_proxied, { fetcher })).toEqual({
      kind: "fallback",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("never sends the account token from the browser", async () => {
    shell.token = "account-token";
    post.mockResolvedValue({ error: "Not found", status: 404 });
    const fetcher = vi.fn();

    expect(await fetch_proxied_image(proxied, { fetcher })).toEqual({
      kind: "fallback",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
