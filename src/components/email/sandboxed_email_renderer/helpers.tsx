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
import { Capacitor } from "@capacitor/core";

import {
  derive_link_hover_ink,
  derive_link_ink,
  normalize_hex,
} from "@/lib/email_ink";
import { DEFAULT_ACCENT_COLOR } from "@/lib/resolved_accent";
import { get_image_proxy_url } from "@/lib/image_proxy";
import { api_client } from "@/services/api/client";
import { routed_fetch } from "@/services/routing/routing_provider";
import { connection_store } from "@/services/routing/connection_store";
import { translated_language } from "@/services/translation/dom_translate";
import { ignore_error } from "@/lib/ignore_error";

export const IMAGE_PROXY_URL = get_image_proxy_url();

export function sniff_image_type(bytes: Uint8Array): string | null {
  if (bytes.length >= 4) {
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    )
      return "image/png";
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46)
      return "image/gif";
    if (
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    )
      return "image/webp";
  }
  try {
    const prefix = new TextDecoder().decode(
      bytes.subarray(0, Math.min(64, bytes.length)),
    );
    const trimmed = prefix.trimStart().replace(/^﻿/, "");

    if (trimmed.startsWith("<svg") || trimmed.startsWith("<?xml"))
      return "image/svg+xml";
  } catch (caught) {
    ignore_error(
      "components/email/sandboxed_email_renderer/helpers:sniff_image_type",
      caught,
    );
  }

  return null;
}

export async function resolve_native_images(doc: Document): Promise<void> {
  const is_native =
    Capacitor.isNativePlatform() ||
    (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window);

  if (!is_native) return;

  const token = api_client.get_access_token();

  if (!token) return;

  const imgs = Array.from(doc.querySelectorAll("img")).filter((img) => {
    const src = img.getAttribute("src") || "";

    return (
      src.includes("/api/images/v1/proxy") || src.startsWith(IMAGE_PROXY_URL)
    );
  });

  await Promise.allSettled(
    imgs.map(async (img) => {
      const src = img.getAttribute("src");

      if (!src) return;

      const method = connection_store.get_method();

      if (method === "tor" || method === "tor_snowflake") {
        return;
      }

      const url = src.startsWith("http")
        ? src
        : `https://app.astermail.org${src}`;

      let parsed_url: URL;

      try {
        parsed_url = new URL(url);
      } catch {
        return;
      }
      const expected_proxy = new URL(
        IMAGE_PROXY_URL,
        "https://app.astermail.org",
      );

      if (
        parsed_url.origin !== expected_proxy.origin ||
        parsed_url.pathname !== expected_proxy.pathname
      ) {
        return;
      }

      const response = await routed_fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) return;

      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      const chunk = 8192;

      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(
          null,
          bytes.subarray(i, i + chunk) as unknown as number[],
        );
      }

      const content_type =
        sniff_image_type(bytes) || response.headers.get("content-type");

      if (!content_type) return;

      img.src = `data:${content_type};base64,${btoa(binary)}`;
    }),
  );
}

export const BODY_PADDING = "8px 16px 16px 16px";

export const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
export const FALLBACK_ACCENT = DEFAULT_ACCENT_COLOR;

export function safe_hex(
  value: string | undefined,
  fallback = FALLBACK_ACCENT,
): string {
  return value && HEX_COLOR_PATTERN.test(value.trim())
    ? value.trim()
    : fallback;
}

export function expand_hex(value: string): string {
  const raw = value.replace("#", "");

  return raw.length === 3
    ? `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`
    : `#${raw}`;
}

export function link_ink_for(value: string, background = "#ffffff"): string {
  const hex = expand_hex(safe_hex(value, DEFAULT_ACCENT_COLOR));
  const surface = normalize_hex(background) ?? "#ffffff";

  return derive_link_ink(hex, surface);
}

export function link_hover_ink_for(
  value: string,
  background: string | boolean = "#ffffff",
): string {
  const hex = expand_hex(safe_hex(value, DEFAULT_ACCENT_COLOR));
  const surface =
    typeof background === "boolean"
      ? background
        ? "#121212"
        : "#ffffff"
      : (normalize_hex(background) ?? "#ffffff");

  return derive_link_hover_ink(hex, surface);
}

export const FIT_SLACK_PX = 4;
export const MIN_FIT_ZOOM = 0.35;

export function fit_zoom_for(
  natural_width: number,
  available_width: number,
  base_zoom: number,
): number {
  if (!(natural_width > 0) || !(available_width > 0)) return base_zoom;
  if (natural_width <= available_width + FIT_SLACK_PX) return base_zoom;

  const needed = available_width / natural_width;

  return (
    Math.round(Math.max(MIN_FIT_ZOOM, Math.min(base_zoom, needed)) * 1000) /
    1000
  );
}

export const COLLAPSED_CONTENT_HEIGHT_PX = 8;
export const CONTENT_BOUNDS_NODE_LIMIT = 3000;

export function should_recover_collapsed_height(
  measured: number,
  has_content: boolean,
): boolean {
  return has_content && measured < COLLAPSED_CONTENT_HEIGHT_PX;
}

export function body_has_renderable_content(body: HTMLElement): boolean {
  if ((body.textContent ?? "").trim().length > 0) return true;

  return body.querySelector("img,table,svg,video,canvas") !== null;
}

export function measure_content_bounds(body: HTMLElement): number {
  let deepest = 0;
  let visited = 0;

  const walk = (el: Element) => {
    if (visited >= CONTENT_BOUNDS_NODE_LIMIT) return;
    visited += 1;

    const rect = el.getBoundingClientRect();

    deepest = Math.max(deepest, rect.bottom, rect.top + el.scrollHeight);
    Array.from(el.children).forEach(walk);
  };

  Array.from(body.children).forEach(walk);

  return deepest;
}

export const IFRAME_HEIGHT_CACHE_LIMIT = 300;
export const iframe_height_cache = new Map<string, number>();

export let last_viewer_width = 0;
export let cache_measure_width = 0;

export function live_viewer_measure_width(): number {
  if (typeof document === "undefined") return 0;

  const container = document.querySelector(".email-frame-container");
  const width = container?.clientWidth ?? 0;

  if (width > 0) last_viewer_width = width;

  return width;
}

export function email_viewer_measure_width(): number {
  if (typeof document === "undefined") return 0;

  const width = live_viewer_measure_width();

  if (width > 0) return width;
  if (last_viewer_width > 0) return last_viewer_width;

  return Math.max(400, window.innerWidth - 320);
}

export let width_checked_at = 0;

export function sync_cache_measure_width(): void {
  const now = typeof performance !== "undefined" ? performance.now() : 0;

  if (cache_measure_width > 0 && now - width_checked_at < 250) return;

  const width = live_viewer_measure_width();

  if (width <= 0) return;
  width_checked_at = now;
  if (cache_measure_width === 0) {
    cache_measure_width = width;

    return;
  }
  if (Math.abs(width - cache_measure_width) > 8) {
    iframe_height_cache.clear();
    cache_measure_width = width;
  }
}

export function store_height(email_id: string, height: number): void {
  sync_cache_measure_width();
  if (iframe_height_cache.has(email_id)) {
    iframe_height_cache.delete(email_id);
  } else if (iframe_height_cache.size >= IFRAME_HEIGHT_CACHE_LIMIT) {
    const oldest = iframe_height_cache.keys().next();

    if (!oldest.done) iframe_height_cache.delete(oldest.value);
  }

  iframe_height_cache.set(email_id, height);
}

export function remember_measured_height(
  email_id: string,
  body: HTMLElement | null | undefined,
  height: number,
): void {
  if (body && translated_language(body)) return;

  store_height(email_id, height);
}

export const CONTENT_READY_FALLBACK_MS = 1500;

export const SETTLE_REMEASURE_DELAYS_MS = [250, 700, 1400];

export const SKELETON_DELAY_MS = 180;

export const SKELETON_DELAY_MEASURED_MS = 90;

export function needs_settle_remeasure(body: HTMLElement): boolean {
  return (
    body.querySelector("img,video,canvas,svg,iframe,object,embed") !== null
  );
}

export function dispatch_iframe_ready(email_id: string): void {
  window.dispatchEvent(
    new CustomEvent("astermail:iframe-ready", { detail: email_id }),
  );
}

export function get_cached_iframe_height(email_id: string): number | undefined {
  sync_cache_measure_width();

  return iframe_height_cache.get(email_id);
}

export function set_cached_iframe_height(
  email_id: string,
  height: number,
): void {
  store_height(email_id, height);
}

export function clear_iframe_height_cache(): void {
  iframe_height_cache.clear();
}
