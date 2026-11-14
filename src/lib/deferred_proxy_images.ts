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
import {
  fetch_proxied_image,
  type ProxiedImageResult,
} from "@/lib/image_proxy_grant";
import { parse_srcset_candidates, type SrcsetCandidate } from "@/lib/url_value";

export const DEFERRED_SRC_ATTRIBUTE = "data-deferred-src";
export const DEFERRED_BACKGROUND_ATTRIBUTE = "data-deferred-background";
export const DEFERRED_IMAGE_PLACEHOLDER =
  "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

const SRCSET_REFERENCE_WIDTH = 640;
const MAX_CONCURRENT_LOADS = 6;
const RETRY_DELAY_MS = 1500;
const BLOB_IMAGE_TYPES = new Set([
  "image/png",
  "image/apng",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "image/tiff",
  "image/heic",
]);
const INLINE_IMAGE_TYPES = new Set(["image/svg+xml"]);
const CSS_URL_PATTERN = /url\("([^"\\\s]+)"\)/g;

function create_marker_token(): string {
  const bytes = new Uint8Array(16);

  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

const MARKER_PREFIX = `#aster-deferred-${create_marker_token()}:`;
const MARKER_SELECTOR_FRAGMENT = MARKER_PREFIX.slice(0, -1);

export const DEFERRED_CSS_MARKER_FRAGMENT = MARKER_SELECTOR_FRAGMENT;
const MARKER_PATTERN = new RegExp(
  `${MARKER_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^"')\\s]+)`,
  "g",
);

export type ProxiedImageLoader = (
  url: string,
  options: { signal?: AbortSignal },
) => Promise<ProxiedImageResult>;

export interface DeferredImageSession {
  hydrate(root: ParentNode): void;
  resolve(target: string): Promise<string | null>;
  settled(): Promise<void>;
  dispose(): void;
}

export function proxied_image_target(
  value: string | null,
  proxy_url: string,
): string | null {
  if (!value) return null;

  try {
    const base = window.location.href;
    const parsed = new URL(value, base);
    const expected = new URL(proxy_url, base);

    if (
      parsed.origin !== expected.origin ||
      parsed.pathname !== expected.pathname
    ) {
      return null;
    }
    if (!parsed.searchParams.get("url")) return null;

    return parsed.href;
  } catch {
    return null;
  }
}

function css_marker(target: string): string {
  return `${DEFERRED_IMAGE_PLACEHOLDER}${MARKER_PREFIX}${encodeURIComponent(target)}`;
}

export function defer_css_urls(css: string, proxy_url: string): string {
  if (!css.includes("url(")) return css;

  return css.replace(CSS_URL_PATTERN, (match, value: string) => {
    const target = proxied_image_target(value, proxy_url);

    return target ? `url("${css_marker(target)}")` : match;
  });
}

function candidate_density(candidate: SrcsetCandidate): number {
  const parsed = /^(\d+(?:\.\d+)?)(x|w)$/.exec(candidate.descriptor.trim());

  if (!parsed) return 1;

  const amount = parseFloat(parsed[1]);

  return parsed[2] === "x" ? amount : amount / SRCSET_REFERENCE_WIDTH;
}

function pick_srcset_candidate(
  candidates: SrcsetCandidate[],
): SrcsetCandidate | null {
  if (candidates.length === 0) return null;

  const wanted = window.devicePixelRatio || 1;
  const ordered = candidates
    .map((candidate) => ({ candidate, density: candidate_density(candidate) }))
    .sort((left, right) => left.density - right.density);
  const match = ordered.find((entry) => entry.density >= wanted);

  return (match ?? ordered[ordered.length - 1]).candidate;
}

export function defer_proxied_images(html: string, proxy_url: string): string {
  if (!html || typeof document === "undefined") return html;

  let proxy_path: string;

  try {
    proxy_path = new URL(proxy_url, window.location.href).pathname;
  } catch {
    return html;
  }

  if (!html.includes(proxy_path) && !html.includes("data-deferred-")) {
    return html;
  }

  const template = document.createElement("template");

  template.innerHTML = html;

  const root = template.content;

  root
    .querySelectorAll(
      `[${DEFERRED_SRC_ATTRIBUTE}],[${DEFERRED_BACKGROUND_ATTRIBUTE}]`,
    )
    .forEach((el) => {
      el.removeAttribute(DEFERRED_SRC_ATTRIBUTE);
      el.removeAttribute(DEFERRED_BACKGROUND_ATTRIBUTE);
    });

  root.querySelectorAll("[srcset]").forEach((el) => {
    const candidates = parse_srcset_candidates(el.getAttribute("srcset") || "");
    const has_proxied = candidates.some(
      (candidate) => proxied_image_target(candidate.url, proxy_url) !== null,
    );

    if (!has_proxied) return;

    if (el.tagName === "SOURCE") {
      el.remove();

      return;
    }

    const picked = pick_srcset_candidate(candidates);
    const target = picked ? proxied_image_target(picked.url, proxy_url) : null;

    el.removeAttribute("srcset");
    el.removeAttribute("sizes");

    if (target) {
      el.setAttribute(DEFERRED_SRC_ATTRIBUTE, target);
      el.setAttribute("src", DEFERRED_IMAGE_PLACEHOLDER);
    }
  });

  root.querySelectorAll("[src]").forEach((el) => {
    const target = proxied_image_target(el.getAttribute("src"), proxy_url);

    if (!target) return;

    if (!el.hasAttribute(DEFERRED_SRC_ATTRIBUTE)) {
      el.setAttribute(DEFERRED_SRC_ATTRIBUTE, target);
    }
    el.setAttribute("src", DEFERRED_IMAGE_PLACEHOLDER);
  });

  root.querySelectorAll("[background]").forEach((el) => {
    const target = proxied_image_target(
      el.getAttribute("background"),
      proxy_url,
    );

    if (!target) return;

    el.setAttribute(DEFERRED_BACKGROUND_ATTRIBUTE, target);
    el.removeAttribute("background");
  });

  root.querySelectorAll("[poster]").forEach((el) => {
    if (proxied_image_target(el.getAttribute("poster"), proxy_url)) {
      el.removeAttribute("poster");
    }
  });

  root.querySelectorAll("[style]").forEach((el) => {
    const css = el.getAttribute("style") || "";
    const deferred = defer_css_urls(css, proxy_url);

    if (deferred !== css) el.setAttribute("style", deferred);
  });

  root.querySelectorAll("style").forEach((el) => {
    const css = el.textContent || "";
    const deferred = defer_css_urls(css, proxy_url);

    if (deferred !== css) el.textContent = deferred;
  });

  return template.innerHTML;
}

export function set_deferred_image_source(el: Element, target: string): void {
  el.setAttribute(DEFERRED_SRC_ATTRIBUTE, target);
  el.setAttribute("src", DEFERRED_IMAGE_PLACEHOLDER);
}

function bytes_to_base64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 8192;

  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(offset, offset + chunk) as unknown as number[],
    );
  }

  return btoa(binary);
}

function mark_image_failed(el: Element): void {
  el.removeAttribute("src");
  el.setAttribute("data-load-failed", "true");

  if ((el.getAttribute("alt") || "").trim().length > 0) return;

  (el as HTMLElement).style.display = "none";
}

function collect_css_targets(css: string, into: Set<string>): void {
  if (!css.includes(MARKER_SELECTOR_FRAGMENT)) return;

  for (const found of css.matchAll(MARKER_PATTERN)) {
    try {
      into.add(decodeURIComponent(found[1]));
    } catch {
      continue;
    }
  }
}

export function deferred_css_targets(css: string): string[] {
  const found = new Set<string>();

  collect_css_targets(css, found);

  return Array.from(found);
}

export function replace_deferred_css_target(
  css: string,
  target: string,
  replacement: string,
): string {
  const marker = css_marker(target);

  return css.includes(marker) ? css.split(marker).join(replacement) : css;
}

function replace_css_markers(
  root: ParentNode,
  target: string,
  replacement: string,
): void {
  const marker = css_marker(target);

  root
    .querySelectorAll(`[style*="${MARKER_SELECTOR_FRAGMENT}"]`)
    .forEach((el) => {
      const css = el.getAttribute("style") || "";

      if (css.includes(marker)) {
        el.setAttribute("style", css.split(marker).join(replacement));
      }
    });

  root.querySelectorAll("style").forEach((el) => {
    const css = el.textContent || "";

    if (css.includes(marker)) {
      el.textContent = css.split(marker).join(replacement);
    }
  });
}

export function create_deferred_image_session(
  proxy_url: string,
  options: { load?: ProxiedImageLoader; retry_delay_ms?: number } = {},
): DeferredImageSession {
  const load: ProxiedImageLoader = options.load ?? fetch_proxied_image;
  const retry_delay_ms = options.retry_delay_ms ?? RETRY_DELAY_MS;
  const controller = new AbortController();
  const object_urls: string[] = [];
  const resolved = new Map<string, Promise<string | null>>();
  const css_targets = new Set<string>();
  const waiting: Array<() => void> = [];
  const applying = new Set<Promise<void>>();
  let active = 0;
  let disposed = false;

  function release(): void {
    active -= 1;
    waiting.shift()?.();
  }

  async function acquire(): Promise<void> {
    if (active >= MAX_CONCURRENT_LOADS) {
      await new Promise<void>((resume) => waiting.push(resume));
    }
    active += 1;
  }

  function display_url(
    result: Extract<ProxiedImageResult, { kind: "image" }>,
  ): string | null {
    if (INLINE_IMAGE_TYPES.has(result.content_type)) {
      return `data:${result.content_type};base64,${bytes_to_base64(result.bytes)}`;
    }
    if (!BLOB_IMAGE_TYPES.has(result.content_type)) return null;

    const object_url = URL.createObjectURL(
      new Blob([result.bytes as BlobPart], { type: result.content_type }),
    );

    object_urls.push(object_url);

    return object_url;
  }

  async function load_target(target: string): Promise<string | null> {
    await acquire();

    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (disposed) return null;

        const result = await load(target, { signal: controller.signal });

        if (disposed) return null;
        if (result.kind === "image") return display_url(result);
        if (attempt === 1) return null;
        if (result.kind === "failed" && !result.retryable) return null;

        await new Promise<void>((resume) => setTimeout(resume, retry_delay_ms));
      }

      return null;
    } catch {
      return null;
    } finally {
      release();
    }
  }

  function resolve(target: string): Promise<string | null> {
    let pending = resolved.get(target);

    if (!pending) {
      const started = load_target(target).then((url) => {
        if (url === null && resolved.get(target) === started) {
          resolved.delete(target);
        }

        return url;
      });

      pending = started;
      resolved.set(target, pending);
    }

    return pending;
  }

  function resolve_target(value: string): Promise<string | null> {
    const target = disposed ? null : proxied_image_target(value, proxy_url);

    return target ? resolve(target) : Promise.resolve(null);
  }

  function track(work: Promise<void>): void {
    const finish = () => {
      applying.delete(work);
    };

    applying.add(work);
    work.then(finish, finish);
  }

  async function settled(): Promise<void> {
    while (applying.size > 0) {
      await Promise.allSettled(Array.from(applying));
    }
  }

  function hydrate(root: ParentNode): void {
    if (disposed) return;

    root.querySelectorAll(`[${DEFERRED_SRC_ATTRIBUTE}]`).forEach((el) => {
      const target = proxied_image_target(
        el.getAttribute(DEFERRED_SRC_ATTRIBUTE),
        proxy_url,
      );

      el.removeAttribute(DEFERRED_SRC_ATTRIBUTE);

      if (!target) return;

      track(
        resolve(target).then((url) => {
          if (disposed) return;
          if (url) el.setAttribute("src", url);
          else mark_image_failed(el);
        }),
      );
    });

    root.querySelectorAll(`[${DEFERRED_BACKGROUND_ATTRIBUTE}]`).forEach((el) => {
      const target = proxied_image_target(
        el.getAttribute(DEFERRED_BACKGROUND_ATTRIBUTE),
        proxy_url,
      );

      el.removeAttribute(DEFERRED_BACKGROUND_ATTRIBUTE);

      if (!target) return;

      track(
        resolve(target).then((url) => {
          if (disposed || !url) return;
          el.setAttribute("background", url);
        }),
      );
    });

    const found = new Set<string>();

    root
      .querySelectorAll(`[style*="${MARKER_SELECTOR_FRAGMENT}"]`)
      .forEach((el) =>
        collect_css_targets(el.getAttribute("style") || "", found),
      );
    root
      .querySelectorAll("style")
      .forEach((el) => collect_css_targets(el.textContent || "", found));

    found.forEach((raw_target) => {
      const target = proxied_image_target(raw_target, proxy_url);

      if (!target || target !== raw_target || css_targets.has(target)) return;

      css_targets.add(target);

      track(
        resolve(target).then((url) => {
          if (disposed) return;
          replace_css_markers(root, target, url ?? DEFERRED_IMAGE_PLACEHOLDER);
        }),
      );
    });
  }

  function dispose(): void {
    if (disposed) return;

    disposed = true;
    controller.abort();
    waiting.splice(0).forEach((resume) => resume());
    object_urls
      .splice(0)
      .forEach((object_url) => URL.revokeObjectURL(object_url));
    resolved.clear();
    css_targets.clear();
  }

  return { hydrate, resolve: resolve_target, settled, dispose };
}
