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
import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const warm = new Map<string, string>([["warm.example", "blob:warm"]]);
const slow_reads = new Map<string, Promise<string | null>[]>();
const failed = new Set<string>();

vi.mock("@/services/routing/routing_provider", () => ({
  routed_fetch: vi.fn(),
}));

vi.mock("@/services/routing/connection_store", () => ({
  connection_store: { get_method: () => "direct" },
}));

vi.mock("@/services/lockdown_store", () => ({
  is_any_lockdown_active: () => false,
}));

vi.mock("@/lib/favicon_url", () => ({
  get_favicon_url: (domain: string) => `/api/images/v1/favicon/${domain}`,
  is_valid_favicon_domain: () => true,
  same_origin_favicon_domain: (url: string) =>
    url.startsWith("/api/images/v1/favicon/")
      ? url.slice("/api/images/v1/favicon/".length)
      : null,
  PENDING_FAVICON_SRC: "data:pending",
  FAILED_FAVICON_SRC: "data:,",
}));

vi.mock("@/lib/favicon_cache_db", () => ({
  peek_favicon_object_url: (domain: string) => warm.get(domain) ?? null,
  get_favicon_object_url: (domain: string) =>
    slow_reads.get(domain)?.shift() ??
    Promise.resolve(warm.get(domain) ?? null),
  adopt_favicon_blob: (domain: string) => {
    const url = `blob:${domain}`;

    warm.set(domain, url);

    return url;
  },
  cache_favicon_blob: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/icon_cache", () => ({
  is_icon_failed: (domain: string) => failed.has(domain),
  mark_icon_failed: vi.fn((domain: string) => {
    failed.add(domain);
  }),
}));

const { use_favicon_src, store_favicon_if_api_url } =
  await import("./use_favicon_src");
const { routed_fetch } = await import("@/services/routing/routing_provider");
const { mark_icon_failed } = await import("@/lib/icon_cache");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let observed: string[] = [];

function Probe({ domain, enabled }: { domain: string; enabled?: boolean }) {
  observed.push(use_favicon_src(domain, enabled));

  return null;
}

function render(domain: string, enabled?: boolean) {
  act(() => {
    root!.render(createElement(Probe, { domain, enabled }));
  });
}

function mount(domain: string, enabled?: boolean) {
  observed = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  render(domain, enabled);
}

async function settle() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function png_response() {
  return new Response(new Blob([new Uint8Array([1, 2, 3])]), {
    status: 200,
    headers: { "content-type": "image/png" },
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("use_favicon_src", () => {
  it("starts from the cached blob url when one is already live", () => {
    mount("warm.example");

    expect(observed[0]).toBe("blob:warm");
    expect(observed).not.toContain("/api/images/v1/favicon/warm.example");
  });

  it("never hands the cookie-bearing api url to an image", async () => {
    vi.mocked(routed_fetch).mockReset();
    vi.mocked(routed_fetch).mockResolvedValue(png_response());
    mount("cold.example");
    await settle();

    expect(observed[0]).toBe("data:pending");
    expect(observed).not.toContain("/api/images/v1/favicon/cold.example");
    expect(observed[observed.length - 1]).toBe("blob:cold.example");
  });

  it("loads a cold favicon without sending cookies", async () => {
    const fetch_mock = vi.mocked(routed_fetch);

    fetch_mock.mockReset();
    fetch_mock.mockResolvedValue(png_response());
    mount("fresh.example");
    await settle();

    expect(fetch_mock).toHaveBeenCalledTimes(1);
    expect(fetch_mock.mock.calls[0][0]).toBe(
      "/api/images/v1/favicon/fresh.example",
    );
    expect(fetch_mock.mock.calls[0][1]).toMatchObject({ credentials: "omit" });
  });

  it("does not load anything while sender pictures are off", async () => {
    const fetch_mock = vi.mocked(routed_fetch);

    fetch_mock.mockReset();
    mount("off.example", false);
    await settle();

    expect(fetch_mock).not.toHaveBeenCalled();
    expect(observed[observed.length - 1]).toBe("data:pending");
  });

  it("marks a missing favicon as failed", async () => {
    const fetch_mock = vi.mocked(routed_fetch);

    fetch_mock.mockReset();
    fetch_mock.mockResolvedValue(new Response(null, { status: 404 }));
    mount("missing.example");
    await settle();

    expect(observed[observed.length - 1]).toBe("data:,");
    expect(mark_icon_failed).toHaveBeenCalledWith("missing.example");
  });

  it("does not ask again for a favicon that is already known to be missing", async () => {
    const fetch_mock = vi.mocked(routed_fetch);

    fetch_mock.mockReset();
    fetch_mock.mockResolvedValue(new Response(null, { status: 404 }));
    mount("gone.example");
    await settle();
    act(() => root!.unmount());
    container?.remove();
    mount("gone.example");
    await settle();

    expect(fetch_mock).toHaveBeenCalledTimes(1);
    expect(observed[observed.length - 1]).toBe("data:,");
  });

  it("rejects a response that is not an image", async () => {
    const fetch_mock = vi.mocked(routed_fetch);

    fetch_mock.mockReset();
    fetch_mock.mockResolvedValue(
      new Response("<svg onload=x>", {
        status: 200,
        headers: { "content-type": "image/svg+xml" },
      }),
    );
    mount("svg.example");
    await settle();

    expect(observed[observed.length - 1]).toBe("data:,");
  });

  it("fetches a favicon once when a second picture finishes its cache read after the first load", async () => {
    const fetch_mock = vi.mocked(routed_fetch);
    let finish_fetch!: (response: Response) => void;
    let finish_read!: (url: string | null) => void;

    fetch_mock.mockReset();
    fetch_mock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        finish_fetch = resolve;
      }),
    );
    mount("shared.example");
    await settle();

    slow_reads.set("shared.example", [
      new Promise<string | null>((resolve) => {
        finish_read = resolve;
      }),
    ]);
    const second_container = document.createElement("div");
    const second_root = createRoot(second_container);

    act(() => {
      second_root.render(createElement(Probe, { domain: "shared.example" }));
    });
    await settle();

    finish_fetch(png_response());
    await settle();
    finish_read(null);
    await settle();

    expect(fetch_mock).toHaveBeenCalledTimes(1);
    expect(observed[observed.length - 1]).toBe("blob:shared.example");

    act(() => second_root.unmount());
  });

  it("re-resolves synchronously when the domain changes", () => {
    mount("cold.example");
    render("warm.example");

    expect(observed[observed.length - 1]).toBe("blob:warm");
  });
});

describe("store_favicon_if_api_url", () => {
  it("fetches the favicon without sending cookies", async () => {
    vi.useFakeTimers();
    const fetch_mock = vi.mocked(routed_fetch);

    fetch_mock.mockReset();
    fetch_mock.mockResolvedValue(new Response(null, { status: 404 }));

    try {
      store_favicon_if_api_url(
        "cookie.example",
        "/api/images/v1/favicon/cookie.example",
      );
      await vi.runAllTimersAsync();
    } finally {
      vi.useRealTimers();
    }

    expect(fetch_mock).toHaveBeenCalledTimes(1);
    expect(fetch_mock.mock.calls[0][1]).toMatchObject({ credentials: "omit" });
  });
});
