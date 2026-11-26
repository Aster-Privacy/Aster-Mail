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
import { describe, expect, it, vi } from "vitest";

import {
  collect_prefetch_targets,
  create_image_prefetcher,
  MAX_PREFETCH_QUEUE,
  MAX_PREFETCH_TARGETS,
  may_prefetch_images,
  MAX_PREFETCH_FAILURES,
  PREFETCH_INTERVAL_MS,
} from "./remote_image_prefetch";

vi.mock("@/lib/image_proxy_grant", () => ({
  fetch_proxied_image: vi.fn(),
  should_defer_proxied_images: () => true,
}));

const proxy = "/api/images/v1/proxy";

function remote_target(target: string): string {
  return new URL(target).searchParams.get("url") ?? "";
}

const gate = {
  prefetch_enabled: true,
  cache_enabled: true,
  image_mode: "always" as const,
  lockdown_active: false,
  can_defer: true,
  html_blocked: false,
};

const no_wait = vi.fn(async () => undefined);

function image_loader() {
  return vi.fn(async (_target: string) => ({
    kind: "image" as const,
    bytes: new Uint8Array([1]),
    content_type: "image/png",
  }));
}

describe("may_prefetch_images", () => {
  it("only allows prefetch when every condition holds", () => {
    expect(may_prefetch_images(gate)).toBe(true);
    expect(may_prefetch_images({ ...gate, prefetch_enabled: false })).toBe(
      false,
    );
    expect(may_prefetch_images({ ...gate, cache_enabled: false })).toBe(false);
    expect(may_prefetch_images({ ...gate, image_mode: "ask" })).toBe(false);
    expect(may_prefetch_images({ ...gate, image_mode: "never" })).toBe(false);
    expect(may_prefetch_images({ ...gate, lockdown_active: true })).toBe(false);
    expect(may_prefetch_images({ ...gate, can_defer: false })).toBe(false);
    expect(may_prefetch_images({ ...gate, html_blocked: true })).toBe(false);
  });
});

describe("collect_prefetch_targets", () => {
  it("collects content images and skips tracking pixels", () => {
    const html =
      '<p>Hi</p><img src="https://cdn.example.com/hero.png" alt="Hero" width="600">' +
      '<img src="https://track.example.com/open.gif" width="1" height="1">' +
      '<img src="https://track.example.com/beacon.gif" style="display:none;width:1px;height:1px">';

    const targets = collect_prefetch_targets(html, proxy).map(remote_target);

    expect(targets).toEqual(["https://cdn.example.com/hero.png"]);
  });

  it("never returns more than the per-message cap", () => {
    const html = Array.from(
      { length: MAX_PREFETCH_TARGETS + 15 },
      (_, index) =>
        `<img src="https://cdn.example.com/${index}.png" alt="${index}" width="100">`,
    ).join("");

    expect(collect_prefetch_targets(html, proxy)).toHaveLength(
      MAX_PREFETCH_TARGETS,
    );
  });

  it("returns nothing for plain text", () => {
    expect(collect_prefetch_targets("", proxy)).toEqual([]);
    expect(collect_prefetch_targets("hello there", proxy)).toEqual([]);
  });
});

describe("create_image_prefetcher", () => {
  const message =
    '<img src="https://cdn.example.com/a.png" alt="A" width="200">' +
    '<img src="https://cdn.example.com/b.png" alt="B" width="200">' +
    '<img src="https://track.example.com/p.gif" width="1" height="1">';

  it("loads each message image once through the loader", async () => {
    const load_image = image_loader();
    const load_html = vi.fn(async () => message);
    const prefetcher = create_image_prefetcher({
      allowed: () => true,
      proxy_url: () => proxy,
      wait: no_wait,
      load_image,
      load_html,
    });

    prefetcher.enqueue("m1");
    prefetcher.enqueue("m1");
    await prefetcher.idle();

    expect(load_html).toHaveBeenCalledTimes(1);
    expect(load_image.mock.calls.map(([url]) => remote_target(url))).toEqual([
      "https://cdn.example.com/a.png",
      "https://cdn.example.com/b.png",
    ]);
    prefetcher.dispose();
  });

  it("does nothing while prefetch is not allowed", async () => {
    const load_image = image_loader();
    const load_html = vi.fn(async () => message);
    const prefetcher = create_image_prefetcher({
      allowed: () => false,
      proxy_url: () => proxy,
      wait: no_wait,
      load_image,
      load_html,
    });

    prefetcher.enqueue("m1");
    await prefetcher.idle();

    expect(load_html).not.toHaveBeenCalled();
    expect(load_image).not.toHaveBeenCalled();
  });

  it("stops fetching when prefetch is turned off mid message", async () => {
    let allowed = true;
    const load_image = vi.fn(async () => {
      allowed = false;

      return {
        kind: "image" as const,
        bytes: new Uint8Array([1]),
        content_type: "image/png",
      };
    });
    const prefetcher = create_image_prefetcher({
      allowed: () => allowed,
      proxy_url: () => proxy,
      wait: no_wait,
      load_image,
      load_html: async () => message,
    });

    prefetcher.enqueue("m1");
    await prefetcher.idle();

    expect(load_image).toHaveBeenCalledTimes(1);
  });

  it("bounds the queue", async () => {
    const load_html = vi.fn(async () => null);
    const prefetcher = create_image_prefetcher({
      allowed: () => true,
      proxy_url: () => proxy,
      wait: no_wait,
      load_image: image_loader(),
      load_html,
    });

    for (let index = 0; index < MAX_PREFETCH_QUEUE + 10; index += 1) {
      prefetcher.enqueue(`m${index}`);
    }
    await prefetcher.idle();

    expect(load_html.mock.calls.length).toBeLessThanOrEqual(
      MAX_PREFETCH_QUEUE + 1,
    );
  });

  it("aborts work after dispose", async () => {
    const load_image = image_loader();
    const prefetcher = create_image_prefetcher({
      allowed: () => true,
      proxy_url: () => proxy,
      wait: no_wait,
      load_image,
      load_html: async () => message,
    });

    prefetcher.enqueue("m1");
    prefetcher.dispose();
    await prefetcher.idle();

    expect(load_image).not.toHaveBeenCalled();
  });

  it("spaces image requests to stay under the proxy rate limit", async () => {
    const wait = vi.fn(async (_ms: number) => undefined);
    const prefetcher = create_image_prefetcher({
      allowed: () => true,
      proxy_url: () => proxy,
      wait,
      load_image: image_loader(),
      load_html: async () => message,
    });

    prefetcher.enqueue("m1");
    prefetcher.enqueue("m2");
    await prefetcher.idle();

    expect(wait).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls.every(([ms]) => ms === PREFETCH_INTERVAL_MS)).toBe(
      true,
    );
  });

  it("stops the batch after repeated failed image requests", async () => {
    const load_image = vi.fn(async () => ({
      kind: "failed" as const,
      retryable: false,
    }));
    const prefetcher = create_image_prefetcher({
      allowed: () => true,
      proxy_url: () => proxy,
      wait: no_wait,
      load_image,
      load_html: async () => message,
    });

    for (let index = 0; index < 4; index += 1) prefetcher.enqueue(`m${index}`);
    await prefetcher.idle();

    expect(load_image).toHaveBeenCalledTimes(MAX_PREFETCH_FAILURES);
  });

  it("keeps going after a message fails to load", async () => {
    const load_image = image_loader();
    const load_html = vi
      .fn<(id: string) => Promise<string | null>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(message);
    const prefetcher = create_image_prefetcher({
      allowed: () => true,
      proxy_url: () => proxy,
      wait: no_wait,
      load_image,
      load_html,
    });

    prefetcher.enqueue("m1");
    prefetcher.enqueue("m2");
    await prefetcher.idle();

    expect(load_image).toHaveBeenCalledTimes(2);
  });
});
