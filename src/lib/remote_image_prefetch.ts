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
import type { ProxiedImageLoader } from "@/lib/deferred_proxy_images";
import type { RemoteImageMode } from "@/lib/remote_content_policy";

import { sanitize_html } from "@/lib/html_sanitizer";
import {
  DEFERRED_BACKGROUND_ATTRIBUTE,
  DEFERRED_SRC_ATTRIBUTE,
  defer_proxied_images,
  proxied_image_target,
} from "@/lib/deferred_proxy_images";

export const MAX_PREFETCH_QUEUE = 20;
export const MAX_PREFETCH_TARGETS = 30;
export const PREFETCH_INTERVAL_MS = 2_000;
export const MAX_PREFETCH_FAILURES = 3;
export const MAX_PREFETCH_SEEN = 500;

export interface PrefetchGateInput {
  prefetch_enabled: boolean;
  cache_enabled: boolean;
  image_mode: RemoteImageMode;
  lockdown_active: boolean;
  can_defer: boolean;
  html_blocked: boolean;
}

export function may_prefetch_images(input: PrefetchGateInput): boolean {
  return (
    input.prefetch_enabled &&
    input.cache_enabled &&
    input.image_mode === "always" &&
    !input.lockdown_active &&
    !input.html_blocked &&
    input.can_defer
  );
}

export function collect_prefetch_targets(
  html: string,
  proxy_url: string,
): string[] {
  if (!html || typeof document === "undefined") return [];

  const sanitized = sanitize_html(html, {
    external_content_mode: "always",
    image_proxy_url: proxy_url,
    sandbox_mode: true,
    content_blocking: {
      block_remote_images: false,
      block_remote_fonts: true,
      block_remote_css: true,
      block_tracking_pixels: true,
    },
  });
  const deferred = defer_proxied_images(sanitized.html, proxy_url);
  const template = document.createElement("template");

  template.innerHTML = deferred;

  const targets = new Set<string>();
  const selector = `[${DEFERRED_SRC_ATTRIBUTE}], [${DEFERRED_BACKGROUND_ATTRIBUTE}]`;

  template.content.querySelectorAll(selector).forEach((el) => {
    if (targets.size >= MAX_PREFETCH_TARGETS) return;
    if (el.getAttribute("data-tracking-pixel") === "true") return;

    const value =
      el.getAttribute(DEFERRED_SRC_ATTRIBUTE) ??
      el.getAttribute(DEFERRED_BACKGROUND_ATTRIBUTE);
    const target = proxied_image_target(value, proxy_url);

    if (target) targets.add(target);
  });

  return Array.from(targets);
}

export interface ImagePrefetcherOptions {
  load_html(email_id: string): Promise<string | null>;
  load_image: ProxiedImageLoader;
  proxy_url(): string;
  allowed(): boolean;
  wait?(ms: number, signal: AbortSignal): Promise<void>;
}

export interface ImagePrefetcher {
  enqueue(email_id: string): void;
  idle(): Promise<void>;
  dispose(): void;
}

function default_wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();

      return;
    }

    const timer = setTimeout(done, ms);

    function done(): void {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }

    signal.addEventListener("abort", done);
  });
}

export function create_image_prefetcher(
  options: ImagePrefetcherOptions,
): ImagePrefetcher {
  const queue: string[] = [];
  const seen = new Set<string>();
  const controller = new AbortController();
  const wait = options.wait ?? default_wait;
  let running: Promise<void> | null = null;
  let disposed = false;
  let failures = 0;
  let fetched_any = false;

  function stopped(): boolean {
    return (
      disposed ||
      failures >= MAX_PREFETCH_FAILURES ||
      !options.allowed()
    );
  }

  function remember(email_id: string): void {
    seen.add(email_id);
    if (seen.size <= MAX_PREFETCH_SEEN) return;

    const oldest = seen.values().next().value;

    if (oldest !== undefined) seen.delete(oldest);
  }

  async function prefetch_one(email_id: string): Promise<void> {
    if (stopped()) return;

    const html = await options.load_html(email_id);

    if (!html || stopped()) return;

    const proxy_url = options.proxy_url();

    for (const target of collect_prefetch_targets(html, proxy_url)) {
      if (stopped()) return;
      if (fetched_any) await wait(PREFETCH_INTERVAL_MS, controller.signal);
      if (stopped()) return;
      fetched_any = true;

      try {
        const result = await options.load_image(target, {
          signal: controller.signal,
        });

        failures = result.kind === "failed" ? failures + 1 : 0;
      } catch {
        failures += 1;
      }
    }
  }

  async function drain(): Promise<void> {
    failures = 0;
    while (!disposed && queue.length > 0) {
      const next = queue.shift() as string;

      try {
        await prefetch_one(next);
      } catch {
        continue;
      }
    }
    running = null;
  }

  return {
    enqueue(email_id) {
      if (disposed || !email_id || seen.has(email_id)) return;
      if (!options.allowed()) return;
      if (queue.length >= MAX_PREFETCH_QUEUE) return;

      remember(email_id);
      queue.push(email_id);
      if (!running) running = drain();
    },
    async idle() {
      while (running) await running;
    },
    dispose() {
      disposed = true;
      queue.length = 0;
      controller.abort();
    },
  };
}
