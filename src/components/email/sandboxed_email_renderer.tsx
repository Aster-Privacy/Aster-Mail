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
import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { Capacitor } from "@capacitor/core";

import { start_iframe_autoscroll } from "@/components/email/iframe_autoscroll";
import {
  build_email_body_css,
  build_auto_dark_mode_css,
  build_email_body_ink,
  build_forced_dark_mode_css,
  LINK_BUTTON_EXCLUDE,
  LINK_BUTTON_HOVER_SELECTOR,
} from "@/lib/email_body_styles";
import {
  LINK_HOVER_VAR,
  repair_email_contrast,
} from "@/lib/email_contrast_repair";
import { hex_to_rgba } from "@/lib/material_theme";
import {
  derive_link_hover_ink,
  derive_link_ink,
  derive_rail_color,
  derive_visited_ink,
  normalize_hex,
} from "@/lib/email_ink";
import {
  DEFAULT_ACCENT_COLOR,
  use_resolved_accent,
} from "@/lib/resolved_accent";
import { is_transparent_color_value } from "@/lib/html_sanitizer";
import {
  build_font_face_css,
  get_email_font_stack,
  is_email_font_override,
  EMAIL_FONT_MATCH_APP_ID,
} from "@/lib/font_options";
import {
  extract_cid_references,
  resolve_cid_references,
  revoke_cid_blob_urls,
  strip_unresolved_cid_references,
} from "@/lib/cid_resolver";
import { useTheme } from "@/contexts/theme_context";
import { use_preferences, FONT_SIZE_DEFAULT, normalize_font_size_scale } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import { get_image_proxy_url } from "@/lib/image_proxy";
import { forward_iframe_outside_interaction } from "@/lib/iframe_outside_interaction";
import { api_client } from "@/services/api/client";
import { routed_fetch } from "@/services/routing/routing_provider";
import { connection_store } from "@/services/routing/connection_store";
import { is_any_lockdown_active } from "@/services/lockdown_store";
import { reveal_on_fonts_ready } from "@/components/email/reveal_on_fonts_ready";
import { translated_language } from "@/services/translation/dom_translate";

const IMAGE_PROXY_URL = get_image_proxy_url();

function sniff_image_type(bytes: Uint8Array): string | null {
  if (bytes.length >= 4) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
      return "image/png";
    if (bytes[0] === 0xff && bytes[1] === 0xd8)
      return "image/jpeg";
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46)
      return "image/gif";
    if (
      bytes.length >= 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    )
      return "image/webp";
  }
  try {
    const prefix = new TextDecoder().decode(bytes.subarray(0, Math.min(64, bytes.length)));
    const trimmed = prefix.trimStart().replace(/^﻿/, "");
    if (trimmed.startsWith("<svg") || trimmed.startsWith("<?xml"))
      return "image/svg+xml";
  } catch {}
  return null;
}

async function resolve_native_images(doc: Document): Promise<void> {
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
      const expected_proxy = new URL(IMAGE_PROXY_URL, "https://app.astermail.org");
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

const BODY_PADDING = "8px 16px 16px 16px";

const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const FALLBACK_ACCENT = DEFAULT_ACCENT_COLOR;

function safe_hex(value: string | undefined, fallback = FALLBACK_ACCENT): string {
  return value && HEX_COLOR_PATTERN.test(value.trim()) ? value.trim() : fallback;
}

function expand_hex(value: string): string {
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
const MIN_FIT_ZOOM = 0.35;

export function fit_zoom_for(
  natural_width: number,
  available_width: number,
  base_zoom: number,
): number {
  if (!(natural_width > 0) || !(available_width > 0)) return base_zoom;
  if (natural_width <= available_width + FIT_SLACK_PX) return base_zoom;

  const needed = available_width / natural_width;

  return Math.round(Math.max(MIN_FIT_ZOOM, Math.min(base_zoom, needed)) * 1000) / 1000;
}

const IFRAME_HEIGHT_CACHE_LIMIT = 300;
const iframe_height_cache = new Map<string, number>();

let last_viewer_width = 0;
let cache_measure_width = 0;

export function email_viewer_measure_width(): number {
  if (typeof document === "undefined") return 0;

  const container = document.querySelector(".email-frame-container");
  const width = container?.clientWidth ?? 0;

  if (width > 0) last_viewer_width = width;
  if (last_viewer_width > 0) return last_viewer_width;

  return Math.max(400, window.innerWidth - 320);
}

let width_checked_at = 0;

function sync_cache_measure_width(): void {
  const now = typeof performance !== "undefined" ? performance.now() : 0;

  if (cache_measure_width > 0 && now - width_checked_at < 250) return;
  width_checked_at = now;

  const width = email_viewer_measure_width();

  if (width <= 0) return;
  if (cache_measure_width === 0) {
    cache_measure_width = width;

    return;
  }
  if (Math.abs(width - cache_measure_width) > 8) {
    iframe_height_cache.clear();
    cache_measure_width = width;
  }
}

function store_height(email_id: string, height: number): void {
  sync_cache_measure_width();
  if (iframe_height_cache.has(email_id)) {
    iframe_height_cache.delete(email_id);
  } else if (iframe_height_cache.size >= IFRAME_HEIGHT_CACHE_LIMIT) {
    const oldest = iframe_height_cache.keys().next();

    if (!oldest.done) iframe_height_cache.delete(oldest.value);
  }

  iframe_height_cache.set(email_id, height);
}

function remember_measured_height(
  email_id: string,
  body: HTMLElement | null | undefined,
  height: number,
): void {
  if (body && translated_language(body)) return;

  store_height(email_id, height);
}

export const CONTENT_READY_FALLBACK_MS = 1500;

export const SETTLE_REMEASURE_DELAYS_MS = [250, 700, 1400];

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

interface SandboxedEmailRendererProps {
  sanitized_html: string;
  class_name?: string;
  is_plain_text?: boolean;
  is_literal_plain_text?: boolean;
  load_remote_content?: boolean;
  variant?: "desktop" | "mobile";
  force_dark_mode?: boolean;
  disable_auto_dark_mode?: boolean;
  body_background?: string;
  email_id?: string;
  preserve_formatting?: boolean;
  on_document_ready?: (
    body: HTMLElement,
    request_remeasure: () => void,
  ) => (() => void) | void;
}

export function SandboxedEmailRenderer({
  sanitized_html,
  class_name,
  is_plain_text = false,
  is_literal_plain_text,
  load_remote_content = false,
  variant: _variant = "desktop",
  force_dark_mode = false,
  disable_auto_dark_mode = false,
  body_background,
  email_id,
  preserve_formatting = false,
  on_document_ready,
}: SandboxedEmailRendererProps) {
  const { t } = use_i18n();
  const { preferences } = use_preferences();
  const email_zoom = (normalize_font_size_scale(preferences.font_size_scale) / FONT_SIZE_DEFAULT).toFixed(3);
  const [zoomed_image, set_zoomed_image] = useState<string | null>(null);
  const zoom_fn_ref = useRef<((src: string | null) => void) | null>(null);
  const base_zoom_ref = useRef(1);

  zoom_fn_ref.current = set_zoomed_image;
  base_zoom_ref.current = parseFloat(email_zoom) || 1;
  const cached_height = email_id
    ? get_cached_iframe_height(email_id)
    : undefined;
  const [iframe_height, set_iframe_height] = useState(
    cached_height ? `${cached_height}px` : "0px",
  );
  const [height_ready, set_height_ready] = useState(!!cached_height);
  const contrast_repair_ref = useRef({ enabled: false, surface: "#121212" });
  const prev_html_ref = useRef(sanitized_html);
  const iframe_ref = useRef<HTMLIFrameElement | null>(null);
  const doc_nonce_ref = useRef(0);
  const observer_ref = useRef<ResizeObserver | null>(null);
  const mutation_observer_ref = useRef<MutationObserver | null>(null);
  const raf_ref = useRef<number>(0);
  const stable_timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reveal_cleanup_ref = useRef<(() => void) | null>(null);
  const has_fired_ready_ref = useRef(!!cached_height);
  const load_remote_ref = useRef(load_remote_content);
  const document_ready_cleanup_ref = useRef<(() => void) | null>(null);
  const remeasure_ref = useRef<(() => void) | null>(null);
  const settle_timers_ref = useRef<ReturnType<typeof setTimeout>[]>([]);
  const on_document_ready_ref = useRef(on_document_ready);

  on_document_ready_ref.current = on_document_ready;

  load_remote_ref.current = load_remote_content;
  const [internal_cid_html, set_internal_cid_html] = useState<string | null>(
    null,
  );
  const internal_cid_blob_urls_ref = useRef<string[]>([]);
  const stable_cid_html_ref = useRef<string | null>(null);
  const pending_revoke_ref = useRef<string[]>([]);
  const prev_email_id_ref = useRef(email_id);

  if (prev_email_id_ref.current !== email_id) {
    prev_email_id_ref.current = email_id;
    if (internal_cid_html !== null) set_internal_cid_html(null);
    stable_cid_html_ref.current = null;
    if (zoomed_image !== null) set_zoomed_image(null);
  }

  useEffect(() => {
    if (pending_revoke_ref.current.length > 0) {
      revoke_cid_blob_urls(pending_revoke_ref.current);
      pending_revoke_ref.current = [];
    }
  }, [internal_cid_html]);

  useEffect(() => {
    let cancelled = false;

    if (!email_id) {
      set_internal_cid_html(null);
      stable_cid_html_ref.current = null;

      return;
    }
    if (extract_cid_references(sanitized_html).length === 0) {
      set_internal_cid_html(null);
      stable_cid_html_ref.current = null;

      return;
    }

    resolve_cid_references(sanitized_html, email_id)
      .then((result) => {
        if (cancelled) {
          revoke_cid_blob_urls(result.blob_urls);

          return;
        }
        pending_revoke_ref.current = internal_cid_blob_urls_ref.current;
        internal_cid_blob_urls_ref.current = result.blob_urls;
        stable_cid_html_ref.current = result.html;
        set_internal_cid_html(result.html);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [sanitized_html, email_id]);

  useEffect(() => {
    return () => {
      revoke_cid_blob_urls(internal_cid_blob_urls_ref.current);
      revoke_cid_blob_urls(pending_revoke_ref.current);
      internal_cid_blob_urls_ref.current = [];
      pending_revoke_ref.current = [];
    };
  }, []);

  const has_pending_cids =
    !!email_id &&
    internal_cid_html === null &&
    extract_cid_references(sanitized_html).length > 0;
  const resolved_html =
    internal_cid_html ??
    (has_pending_cids && stable_cid_html_ref.current
      ? stable_cid_html_ref.current
      : has_pending_cids
        ? strip_unresolved_cid_references(sanitized_html, true)
        : sanitized_html);

  const { theme } = useTheme();
  const resolved_accent = use_resolved_accent();
  const app_is_dark = theme === "dark";
  const is_dark_theme = app_is_dark && !disable_auto_dark_mode;
  const is_html_email = !is_plain_text;
  const layout_probe =
    sanitized_html.length > 65536
      ? sanitized_html.slice(0, 65536)
      : sanitized_html;
  const has_block_html =
    /<(div|p|table|tr|td|h[1-6]|ul|ol|li|blockquote)\b/i.test(layout_probe);
  const literal_plain_text =
    (is_literal_plain_text ?? is_plain_text) && !has_block_html;
  const has_table_layout = /<table\b/i.test(layout_probe);
  const has_designed_bg = (
    layout_probe.match(/background(?:-color)?\s*:\s*[^;"'}]+/gi) ?? []
  ).some((declaration) => {
    const value_match = declaration.match(
      /background(?:-color)?\s*:\s*([^;"'}]+)$/i,
    );
    const value = value_match ? value_match[1].trim() : "";

    return (
      /^(?:#[0-9a-f]|rgba?\(|hsla?\(|white\b|black\b|[a-z]+gr[ae]y\b)/i.test(value) &&
      !is_transparent_color_value(value)
    );
  });
  const has_style_block = /<style\b[^>]*>[\s\S]*?background/i.test(layout_probe);
  const has_centered_card = /max-width\s*:\s*[3456789]\d{2}px[^;}"']*;[^"']*margin\s*:[^;}"']*auto/i.test(layout_probe);
  const has_newsletter_layout = (has_table_layout && (
    /style\s*=\s*["'][^"']*width\s*:\s*[456789]\d{2}px/i.test(layout_probe) ||
    /<table[^>]*(?:width|bgcolor|background)\s*=/i.test(layout_probe) ||
    (layout_probe.match(/<table\b/gi)?.length ?? 0) > 2
  )) || has_designed_bg || has_style_block || has_centered_card;
  const declares_light_scheme = /color-scheme\s*:\s*light\s+only/i.test(layout_probe);
  const light_override_bg = disable_auto_dark_mode && app_is_dark ? "#ffffff" : "transparent";
  const plain_bg = light_override_bg;
  const plain_text_color = force_dark_mode
    ? "#e5e5e5"
    : is_dark_theme
      ? "#e5e5e5"
      : "#111827";
  const simple_dark_html = is_dark_theme && !force_dark_mode && is_html_email && !has_newsletter_layout && !declares_light_scheme;
  const auto_dark_active =
    is_dark_theme && !force_dark_mode && (!is_html_email || simple_dark_html);
  const html_text_color = force_dark_mode || simple_dark_html ? "#e5e5e5" : "#111827";
  const html_bg = force_dark_mode || simple_dark_html
    ? "transparent"
    : body_background || light_override_bg;
  const dyslexia_font_stack =
    "'OpenDyslexic','Google Sans Flex',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
  const email_font_id = preferences.email_font_choice ?? EMAIL_FONT_MATCH_APP_ID;
  const resolved_email_font_id =
    email_font_id === EMAIL_FONT_MATCH_APP_ID
      ? (preferences.font_choice ?? "default")
      : email_font_id;
  const base_font = preferences.dyslexia_font
    ? dyslexia_font_stack
    : get_email_font_stack(preferences.email_font_choice, preferences.font_choice);
  const email_font_face_css = preferences.dyslexia_font
    ? ""
    : build_font_face_css(resolved_email_font_id);
  const email_font_override_css =
    !preferences.dyslexia_font && is_email_font_override(preferences.email_font_choice)
      ? `html body, html body *:not(code):not(pre):not(kbd):not(samp) { font-family: ${base_font} !important; }`
      : "";

  const accent_hex = safe_hex(resolved_accent.accent);
  const body_ink_surface =
    force_dark_mode || simple_dark_html || (!is_html_email && is_dark_theme)
      ? (normalize_hex(resolved_accent.surface) ?? "#121212")
      : "#ffffff";
  const link_ink = link_ink_for(accent_hex, body_ink_surface);
  const link_hover_paint = link_hover_ink_for(link_ink, body_ink_surface);
  const link_visited_ink = derive_visited_ink(link_ink, body_ink_surface);
  const quote_rail_ink = derive_rail_color(accent_hex, body_ink_surface);

  const contrast_repair_active = force_dark_mode || auto_dark_active;

  contrast_repair_ref.current = {
    enabled: contrast_repair_active,
    surface: body_ink_surface,
  };

  const [contrast_ready, set_contrast_ready] = useState(!contrast_repair_active);
  const prev_contrast_repair_ref = useRef(contrast_repair_active);

  if (prev_contrast_repair_ref.current !== contrast_repair_active) {
    prev_contrast_repair_ref.current = contrast_repair_active;
    set_contrast_ready(!contrast_repair_active);
  }

  if (prev_html_ref.current !== sanitized_html) {
    prev_html_ref.current = sanitized_html;
    const new_cached = email_id ? get_cached_iframe_height(email_id) : undefined;

    set_iframe_height(new_cached ? `${new_cached}px` : "0px");
    set_height_ready(!!new_cached);
    set_contrast_ready(!contrast_repair_active);
    has_fired_ready_ref.current = !!new_cached;
    if (stable_timer_ref.current) {
      clearTimeout(stable_timer_ref.current);
      stable_timer_ref.current = null;
    }
  }

  const email_body_ink = build_email_body_ink(accent_hex, body_ink_surface);

  const link_underline_css = preferences.link_underlines
    ? `a${LINK_BUTTON_EXCLUDE}, a${LINK_BUTTON_EXCLUDE} * { text-decoration: underline !important; text-decoration-color: ${link_ink} !important; text-underline-offset: 2px; }`
    : "";

  const LINK_MEDIA_EXCLUDE = ":not(img):not(picture):not(svg):not(video):not(canvas)";
  const hover_paint = `var(${LINK_HOVER_VAR}, ${link_hover_paint})`;
  const link_hover_css = `a { transition: none; }
a${LINK_BUTTON_EXCLUDE}:hover, a${LINK_BUTTON_EXCLUDE}:hover *${LINK_MEDIA_EXCLUDE} {
  color: ${hover_paint} !important;
  text-decoration: underline !important;
  text-decoration-color: ${hover_paint} !important;
}
${LINK_BUTTON_HOVER_SELECTOR} {
  filter: brightness(1.08);
}
a:focus-visible {
  outline: 2px solid ${link_ink} !important;
  outline-offset: 1px;
}`;

  const quote_toggle_css = `.aster-quote-toggle { display: inline-block !important; padding: 0 3px !important; font-size: 6px !important; line-height: 12px !important; letter-spacing: 1px !important; background: rgba(128, 128, 128, 0.1) !important; border: 1px solid rgba(128, 128, 128, 0.15) !important; border-radius: 99px !important; color: rgba(100, 100, 100, 0.55) !important; cursor: pointer !important; vertical-align: middle !important; }
.aster-quote-toggle:hover { background: rgba(128, 128, 128, 0.2) !important; border-color: rgba(128, 128, 128, 0.3) !important; }
.aster-quoted-content { border-left-color: ${quote_rail_ink} !important; }`;

  const plain_dark_css = auto_dark_active
    ? build_auto_dark_mode_css(plain_text_color, link_ink, link_visited_ink)
    : "";
  const dark_mode_css = force_dark_mode
    ? build_forced_dark_mode_css(quote_rail_ink, link_ink, link_visited_ink)
    : plain_dark_css;

  const force_light_scheme = is_html_email && !force_dark_mode && !simple_dark_html;

  const simple_html = is_html_email && !has_table_layout;
  const html_body_style = simple_html
    ? `background-color:${html_bg};${auto_dark_active ? "" : `color:${html_text_color};`}padding:${BODY_PADDING};font-family:${base_font};font-size:14px;line-height:1.6;word-wrap:break-word`
    : `background-color:${html_bg};padding:${BODY_PADDING}`;
  const plain_body_style = `background-color:${plain_bg};color:${plain_text_color};padding:${BODY_PADDING};font-family:${base_font};font-size:14px;line-height:1.6;${literal_plain_text ? "white-space:pre-wrap;" : ""}word-wrap:break-word`;

  const iframe_css = build_email_body_css(accent_hex, base_font, email_body_ink);

  const html_el_style =
    is_html_email && !force_dark_mode && !simple_dark_html
      ? ` style="background-color:${html_bg}"`
      : "";

  const is_tor_mode = (() => {
    const m = connection_store.get_method();

    return m === "tor" || m === "tor_snowflake";
  })();
  const is_lockdown_mode = is_any_lockdown_active();
  const tor_csp = (is_tor_mode || is_lockdown_mode)
    ? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data: blob:; style-src 'unsafe-inline'; font-src 'self' data:; media-src 'none'; object-src 'none'; frame-src 'none'; connect-src 'none'; script-src 'none'; base-uri 'self'; form-action 'none';">`
    : `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data: blob: https: http:; style-src 'unsafe-inline'; font-src 'self' data: https: http:; media-src 'none'; object-src 'none'; frame-src 'none'; connect-src 'none'; script-src 'none'; base-uri https: http:; form-action 'none';">`;

  const doc_nonce = useMemo(() => {
    doc_nonce_ref.current += 1;

    return doc_nonce_ref.current;
  }, [resolved_html, email_id, is_html_email]);

  const srcdoc_html = `<!DOCTYPE html>
<html${html_el_style} data-aster-doc-nonce="${doc_nonce}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta http-equiv="x-dns-prefetch-control" content="off">
${tor_csp}
${force_light_scheme ? `<meta name="color-scheme" content="light only">` : ""}
<base href="${(() => {
    if (is_tor_mode) {
      const onion = connection_store.get_api_onion_url();

      if (!onion) return "about:blank";
      const host = onion.replace(/^https?:\/\//, "").replace(/\/+$/, "");

      return `http://${host}`;
    }

    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
      ? "https://app.astermail.org"
      : window.location.origin;
  })()}/">
<style>${iframe_css}</style>
<style>body{zoom:${email_zoom}}</style>
${preferences.dyslexia_font ? `<style>@font-face{font-family:'OpenDyslexic';font-style:normal;font-weight:400;font-display:swap;src:url('/fonts/OpenDyslexic-Regular.woff2') format('woff2');}@font-face{font-family:'OpenDyslexic';font-style:normal;font-weight:700;font-display:swap;src:url('/fonts/OpenDyslexic-Bold.woff2') format('woff2');}body, body *:not(code):not(pre):not(kbd):not(samp):not([style*="font-family"]):not(font){font-family:${dyslexia_font_stack};}</style>` : ""}
${force_light_scheme ? `<style>:root, html { color-scheme: light only !important; }</style>` : ""}
<style>${quote_toggle_css}</style>
<style>::selection { background: ${hex_to_rgba(link_ink, 0.35)}; }
.aster-quote-toggle, .aster-forwarded-collapse > summary, .remote-content-banner { -webkit-user-select: none !important; user-select: none !important; }</style>
${email_font_face_css ? `<style>${email_font_face_css}</style>` : ""}
${email_font_override_css ? `<style>${email_font_override_css}</style>` : ""}
${dark_mode_css ? `<style>${dark_mode_css}</style>` : ""}
${link_underline_css ? `<style>${link_underline_css}</style>` : ""}
<style>${link_hover_css}</style>
<style>img:not([data-blocked='true']) { cursor: zoom-in !important; } a img { cursor: pointer !important; } img[data-blocked='true'] { cursor: default !important; pointer-events: none !important; }</style>
</head>
<body style="${is_html_email ? html_body_style : plain_body_style}">${strip_unresolved_cid_references(resolved_html)}${email_font_override_css ? `<style>${email_font_override_css}</style>` : ""}</body>
</html>`;

  const collapse_forwarded_content = useCallback(
    (doc: Document) => {
      const body = doc.body;

      if (!body) return;

      const proton_wrapper = body.querySelector("div.protonmail_quote");

      if (proton_wrapper) {
        const content_bq = proton_wrapper.querySelector(":scope > blockquote");

        if (!content_bq) return;

        const metadata_nodes: Node[] = [];
        let prev: Node | null = proton_wrapper.previousSibling;

        while (prev) {
          const el =
            prev.nodeType === Node.ELEMENT_NODE ? (prev as Element) : null;
          const text = prev.textContent?.trim() || "";
          const is_sig = el?.classList?.contains("protonmail_signature_block");
          const is_spacer = !text;

          if (is_sig || is_spacer) {
            metadata_nodes.unshift(prev);
            prev = prev.previousSibling;
          } else {
            break;
          }
        }

        const parent = proton_wrapper.parentNode!;

        while (content_bq.firstChild) {
          parent.insertBefore(content_bq.firstChild, proton_wrapper);
        }

        metadata_nodes.push(proton_wrapper);

        const details = doc.createElement("details");

        details.className = "aster-forwarded-collapse";
        const summary = doc.createElement("summary");

        summary.textContent = t("common.forwarded_message");
        details.appendChild(summary);
        const content_div = doc.createElement("div");

        content_div.className = "aster-forwarded-content";
        for (const n of metadata_nodes) {
          content_div.appendChild(n);
        }
        details.appendChild(content_div);
        body.appendChild(details);

        return;
      }

      const gmail_wrapper =
        body.querySelector("div.aster_quote") ||
        body.querySelector("div.gmail_quote") ||
        body.querySelector("div.yahoo_quoted");

      if (gmail_wrapper) {
        const has_content_outside = (() => {
          const text_walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);

          while (text_walker.nextNode()) {
            const node = text_walker.currentNode;

            if (gmail_wrapper.contains(node)) continue;
            if ((node.textContent || "").trim().length > 0) return true;
          }

          return false;
        })();

        if (!has_content_outside) {
          (gmail_wrapper as HTMLElement).style.display = "block";

          return;
        }

        const wrapper = doc.createElement("div");

        wrapper.className = "aster-quoted-wrapper";

        const toggle_btn = doc.createElement("button");

        toggle_btn.className = "aster-quote-toggle";
        toggle_btn.type = "button";
        toggle_btn.textContent = "\u2022\u2022\u2022";
        toggle_btn.title = t("mail.show_trimmed_content");

        const content_div = doc.createElement("div");

        content_div.className = "aster-quoted-content";
        content_div.style.display = "none";

        gmail_wrapper.parentNode!.insertBefore(wrapper, gmail_wrapper);
        content_div.appendChild(gmail_wrapper);

        toggle_btn.addEventListener("click", () => {
          const is_hidden = content_div.style.display === "none";

          content_div.style.display = is_hidden ? "" : "none";
          toggle_btn.classList.toggle("aster-quote-expanded", is_hidden);
        });

        wrapper.appendChild(toggle_btn);
        wrapper.appendChild(content_div);

        return;
      }

      const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      const fw_patterns = [
        /-{3,}\s*Forwarded\s+[Mm]essage\s*-{3,}/,
        /Begin forwarded message:/i,
        /-{3,}\s*Original\s+[Mm]essage\s*-{3,}/i,
      ];

      let marker_text: Text | null = null;

      while (walker.nextNode()) {
        const text = (walker.currentNode.textContent || "").trim();

        if (text && fw_patterns.some((p) => p.test(text))) {
          marker_text = walker.currentNode as Text;
          break;
        }
      }

      if (!marker_text) return;

      let marker_block: Element | null = null;
      let n: Node | null = marker_text.parentNode;

      while (n && n !== body) {
        if (n.nodeType === Node.ELEMENT_NODE) {
          const tag = (n as Element).tagName.toUpperCase();

          if (["DIV", "P", "SECTION"].includes(tag)) {
            marker_block = n as Element;
            break;
          }
        }
        n = n.parentNode;
      }
      if (!marker_block) return;

      const has_content_before_marker = (() => {
        const before_walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);

        while (before_walker.nextNode()) {
          const node = before_walker.currentNode;

          if (marker_block.contains(node)) return false;
          if ((node.textContent || "").trim().length > 0) return true;
        }

        return false;
      })();

      const to_collapse: Node[] = [marker_block];
      let sib = marker_block.nextSibling;
      const meta_re = /^\s*(From|Date|Subject|To|Cc|Bcc)\s*:/i;

      while (sib) {
        const text = sib.textContent?.trim() || "";

        if (!text || meta_re.test(text)) {
          to_collapse.push(sib);
          sib = sib.nextSibling;
        } else {
          break;
        }
      }

      const details = doc.createElement("details");

      details.className = "aster-forwarded-collapse";
      if (!has_content_before_marker) {
        details.setAttribute("open", "");
      }
      const summary = doc.createElement("summary");

      summary.textContent = t("common.forwarded_message");
      details.appendChild(summary);
      const content_div = doc.createElement("div");

      content_div.className = "aster-forwarded-content";
      for (const node of to_collapse) {
        content_div.appendChild(node);
      }
      details.appendChild(content_div);
      body.appendChild(details);
    },
    [t],
  );

  const collapse_empty_block_runs = useCallback((doc: Document) => {
    const body = doc.body;

    if (!body) return;

    body
      .querySelectorAll(".protonmail_signature_block-empty")
      .forEach((el) => el.remove());

    body.querySelectorAll(".protonmail_signature_block").forEach((sig) => {
      const has_content = (sig.textContent || "").trim().length > 0;

      if (!has_content) {
        sig.remove();

        return;
      }
      let prev = sig.previousSibling;

      while (prev) {
        const el =
          prev.nodeType === Node.ELEMENT_NODE ? (prev as Element) : null;
        const text = (prev.textContent || "").trim();
        const is_empty_block =
          el &&
          ["DIV", "P", "BR"].includes(el.tagName) &&
          text.length === 0 &&
          !el.querySelector("img,hr,table");

        if (is_empty_block || (!el && text.length === 0)) {
          const to_remove = prev;

          prev = prev.previousSibling;
          to_remove.parentNode?.removeChild(to_remove);
        } else {
          break;
        }
      }
    });
  }, []);

  const trim_trailing_empty_blocks = useCallback((doc: Document) => {
    const body = doc.body;

    if (!body) return;

    const is_removable = (node: Node): boolean => {
      if (node.nodeType === Node.TEXT_NODE) {
        return !(node.textContent || "").trim();
      }
      if (node.nodeType === Node.COMMENT_NODE) return true;
      if (node.nodeType !== Node.ELEMENT_NODE) return false;
      const el = node as Element;

      if (el.tagName === "BR") return true;
      if (!["DIV", "P", "SECTION", "SPAN"].includes(el.tagName)) return false;
      if ((el.textContent || "").trim()) return false;
      if (el.querySelector("img,hr,table,iframe,svg,video,object,embed,input,button")) {
        return false;
      }

      return !/background|height|border|padding/i.test(el.getAttribute("style") || "");
    };

    let container: Element = body;

    for (;;) {
      let last: Node | null = container.lastChild;

      for (;;) {
        while (last && is_removable(last)) {
          const removed = last;

          last = last.previousSibling;
          removed.parentNode?.removeChild(removed);
        }
        if (
          last &&
          last.nodeType === Node.ELEMENT_NODE &&
          (last as Element).matches(
            ".aster-quoted-wrapper, details.aster-forwarded-collapse",
          )
        ) {
          last = last.previousSibling;
          continue;
        }
        break;
      }
      if (
        last &&
        last.nodeType === Node.ELEMENT_NODE &&
        ["DIV", "P"].includes((last as Element).tagName) &&
        !(last as Element).matches("[class*='quote'], [class*='cite']")
      ) {
        container = last as Element;
        continue;
      }
      break;
    }
  }, []);

  const collapse_quoted_replies = useCallback((doc: Document) => {
    const body = doc.body;

    if (!body) return;
    if (body.querySelector("details.aster-forwarded-collapse")) return;
    if (body.querySelector(".aster-quote-toggle")) return;

    const wrote_re = /^On\s.+wrote:\s*$/;
    const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    let marker_text: Text | null = null;

    while (walker.nextNode()) {
      const text = (walker.currentNode.textContent || "").trim();

      if (text && wrote_re.test(text)) {
        marker_text = walker.currentNode as Text;
        break;
      }
    }

    if (!marker_text) return;

    let marker_block: Element | null = null;
    let n: Node | null = marker_text.parentNode;

    while (n && n !== body) {
      if (n.nodeType === Node.ELEMENT_NODE) {
        const tag = (n as Element).tagName.toUpperCase();

        if (["DIV", "P", "SPAN", "SECTION", "BR"].includes(tag)) {
          marker_block = n as Element;
          break;
        }
      }
      n = n.parentNode;
    }

    if (!marker_block) {
      marker_block = marker_text.parentElement;
    }
    if (!marker_block || marker_block === body) return;

    const has_content_before = (() => {
      let prev: Node | null = marker_block!.previousSibling;
      while (prev) {
        if ((prev.textContent || "").trim().length > 0) return true;
        prev = prev.previousSibling;
      }
      return false;
    })();

    const to_collapse: Node[] = [];

    if (has_content_before) {
      let sib: Node | null = marker_block;
      while (sib) {
        const next: ChildNode | null = sib.nextSibling;
        to_collapse.push(sib);
        sib = next;
      }
    } else {
      to_collapse.push(marker_block!);
      let sib: Node | null = marker_block!.nextSibling;
      while (sib) {
        const tag = sib.nodeType === Node.ELEMENT_NODE
          ? (sib as Element).tagName.toUpperCase()
          : null;
        const text = (sib.textContent || "").trim();
        const is_quoted_block = tag === "BLOCKQUOTE" || !text;
        if (is_quoted_block) {
          to_collapse.push(sib);
          sib = sib.nextSibling;
        } else {
          break;
        }
      }
    }

    if (to_collapse.length === 0) return;

    const collapse_contains = (node: Node): boolean =>
      to_collapse.some(
        (c) =>
          c === node ||
          (c.nodeType === Node.ELEMENT_NODE && (c as Element).contains(node)),
      );
    const has_visible_outside = (() => {
      const outside_walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);

      while (outside_walker.nextNode()) {
        const node = outside_walker.currentNode;

        if (collapse_contains(node)) continue;
        if ((node.textContent || "").trim().length > 0) return true;
      }

      return false;
    })();

    const hidden_by_default_selector =
      ".aster_quote, .gmail_quote, .protonmail_quote, .yahoo_quoted, .moz-cite-prefix";

    if (!has_visible_outside) {
      for (const node of to_collapse) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        const el = node as Element;

        if (el.matches(hidden_by_default_selector)) {
          (el as HTMLElement).style.display = "block";
        }
        el.querySelectorAll(hidden_by_default_selector).forEach((child) => {
          (child as HTMLElement).style.display = "block";
        });
      }

      return;
    }

    const wrapper = doc.createElement("div");

    wrapper.className = "aster-quoted-wrapper";

    const toggle_btn = doc.createElement("button");

    toggle_btn.className = "aster-quote-toggle";
    toggle_btn.type = "button";
    toggle_btn.textContent = "\u2022\u2022\u2022";
    toggle_btn.title = t("mail.show_trimmed_content");

    const content_div = doc.createElement("div");

    content_div.className = "aster-quoted-content";
    content_div.style.display = "none";

    for (const node of to_collapse) {
      content_div.appendChild(node);
    }

    const strip_walker = doc.createTreeWalker(
      content_div,
      NodeFilter.SHOW_TEXT,
    );

    while (strip_walker.nextNode()) {
      const text_node = strip_walker.currentNode;

      if (!text_node.textContent) continue;

      const prev = text_node.previousSibling;
      const is_line_start =
        !prev ||
        (prev.nodeType === Node.ELEMENT_NODE &&
          (prev as Element).tagName === "BR");

      if (is_line_start && /^(>\s?)+/.test(text_node.textContent)) {
        text_node.textContent = text_node.textContent.replace(/^(>\s?)+/, "");
      }
    }

    toggle_btn.addEventListener("click", () => {
      const is_hidden = content_div.style.display === "none";

      content_div.style.display = is_hidden ? "" : "none";
      toggle_btn.classList.toggle("aster-quote-expanded", is_hidden);
    });

    wrapper.appendChild(toggle_btn);
    wrapper.appendChild(content_div);
    body.appendChild(wrapper);
  }, [t]);

  const unblock_remote_content = useCallback((doc: Document) => {
    const m = connection_store.get_method();

    if (m === "tor" || m === "tor_snowflake") return;
    doc.querySelectorAll("img[data-blocked='true']").forEach((el) => {
      const proxy_src = el.getAttribute("data-proxy-src");
      const original_src = el.getAttribute("data-original-src");
      const src =
        proxy_src ||
        (original_src && IMAGE_PROXY_URL
          ? `${IMAGE_PROXY_URL}?url=${encodeURIComponent(original_src)}`
          : null);

      if (src) {
        try {
          const safe_url = new URL(src, window.location.href);
          if (safe_url.protocol === "https:" || safe_url.protocol === "http:") {
            el.setAttribute("src", safe_url.href);
          }
        } catch {}
      }
      el.removeAttribute("data-blocked");
      el.classList.remove("blocked-remote-image");
      const alt = el.getAttribute("alt");

      if (alt === "[Click to load image]") {
        el.setAttribute("alt", "");
      }
      const img_el = el as HTMLImageElement;

      img_el.addEventListener(
        "error",
        () => {
          img_el.style.display = "none";
        },
        { once: true },
      );
    });

    doc.querySelectorAll("img[alt='[Click to load image]']").forEach((el) => {
      el.setAttribute("alt", "");
    });

    doc
      .querySelectorAll("span.blocked-image[data-original-src]")
      .forEach((span) => {
        const original_src = span.getAttribute("data-original-src") || "";
        const img = doc.createElement("img");

        img.src = `${IMAGE_PROXY_URL}?url=${encodeURIComponent(original_src)}`;

        const w = span.getAttribute("data-width");
        const h = span.getAttribute("data-height");
        const s = span.getAttribute("data-style");

        if (w) img.setAttribute("width", w);
        if (h) img.setAttribute("height", h);
        if (s) img.setAttribute("style", s);

        span.parentNode?.replaceChild(img, span);
      });
  }, []);

  const handle_load = useCallback(() => {
    const iframe = iframe_ref.current;

    if (!iframe?.contentDocument?.body) return;
    if (iframe.contentDocument.body.hasAttribute("data-aster-processed")) {
      set_contrast_ready(true);
      remeasure_ref.current?.();

      return;
    }
    iframe.contentDocument.body.setAttribute("data-aster-processed", "1");

    if (observer_ref.current) {
      observer_ref.current.disconnect();
    }

    if (load_remote_ref.current) {
      unblock_remote_content(iframe.contentDocument);
    }

    resolve_native_images(iframe.contentDocument);

    const doc_body = iframe.contentDocument.body;
    const has_rich_layout =
      doc_body.querySelector(
        "table[width], table[bgcolor], table[background], center, [class]:not(img)",
      ) !== null ||
      (doc_body.querySelector("table") !== null &&
        doc_body.querySelectorAll("table").length > 1);

    const forces_light = Array.from(
      iframe.contentDocument.querySelectorAll("style"),
    ).some(
      (s) =>
        s.textContent?.includes("color-scheme") &&
        s.textContent?.includes("light only"),
    );

    if (is_html_email && (!doc_body.style.backgroundColor || doc_body.style.backgroundColor === "transparent")) {
      const first_el = doc_body.firstElementChild as HTMLElement | null;
      const detected_bg =
        first_el?.getAttribute("bgcolor") ||
        first_el?.style.backgroundColor ||
        (first_el?.tagName === "TABLE" || first_el?.tagName === "DIV"
          ? iframe.contentWindow?.getComputedStyle(first_el).backgroundColor
          : undefined);

      if (detected_bg && detected_bg !== "transparent" && detected_bg !== "rgba(0, 0, 0, 0)") {
        doc_body.style.backgroundColor = detected_bg;
        iframe.contentDocument.documentElement.style.backgroundColor = detected_bg;
      }
    }

    if (!has_rich_layout && !is_plain_text && !forces_light) {
      doc_body.classList.add("aster-simple");
    }

    collapse_forwarded_content(iframe.contentDocument);
    collapse_quoted_replies(iframe.contentDocument);
    if (!preserve_formatting) {
      collapse_empty_block_runs(iframe.contentDocument);
      if (is_plain_text || !has_rich_layout) {
        trim_trailing_empty_blocks(iframe.contentDocument);
      }
    }

    if (contrast_repair_ref.current.enabled) {
      try {
        repair_email_contrast(iframe.contentDocument, {
          surface: contrast_repair_ref.current.surface,
          view: iframe.contentWindow,
        });
      } catch {}
    }
    set_contrast_ready(true);

    const MAX_IFRAME_HEIGHT = 12000;

    const schedule_ready = () => {
      if (has_fired_ready_ref.current || !email_id) return;
      if (stable_timer_ref.current) clearTimeout(stable_timer_ref.current);
      stable_timer_ref.current = setTimeout(() => {
        if (!has_fired_ready_ref.current) {
          has_fired_ready_ref.current = true;
          window.dispatchEvent(
            new CustomEvent("astermail:iframe-ready", { detail: email_id }),
          );
        }
      }, 100);
    };

    let last_height = 0;

    const capture_ancestor_scroll = (): { node: Element; top: number }[] => {
      const captured: { node: Element; top: number }[] = [];
      let node: Element | null = iframe.parentElement;

      while (node) {
        if (node.scrollTop > 0) captured.push({ node, top: node.scrollTop });
        node = node.parentElement;
      }

      return captured;
    };

    const restore_ancestor_scroll = (
      captured: { node: Element; top: number }[],
    ) => {
      captured.forEach(({ node, top }) => {
        if (node.scrollTop !== top) node.scrollTop = top;
      });
    };

    const sync_fit_zoom = (doc: Document, body: HTMLElement) => {
      const available = iframe.clientWidth;

      if (available <= 0) return;

      body.style.setProperty("zoom", "1");
      const natural = Math.max(
        body.scrollWidth,
        doc.documentElement.scrollWidth,
      );
      const fitted = fit_zoom_for(natural, available, base_zoom_ref.current);

      body.style.setProperty("zoom", String(fitted));
      if (natural * fitted > available + FIT_SLACK_PX) {
        body.style.setProperty("overflow-x", "auto");
      } else {
        body.style.removeProperty("overflow-x");
      }
    };

    const measure_decoupled_height = (): number => {
      const doc = iframe.contentDocument;
      const body = doc?.body;
      const html = doc?.documentElement;

      if (!body || !doc || !html) return 0;

      const scroller = doc.scrollingElement;
      const saved_scroll_top = scroller ? scroller.scrollTop : 0;
      const saved_ancestor_scroll = capture_ancestor_scroll();
      const saved_window_scroll = window.scrollY;
      const saved_iframe_height = iframe.style.height;
      const saved_html_h = html.style.getPropertyValue("height");
      const saved_html_h_pri = html.style.getPropertyPriority("height");
      const saved_html_minh = html.style.getPropertyValue("min-height");
      const saved_html_minh_pri = html.style.getPropertyPriority("min-height");
      const saved_body_h = body.style.getPropertyValue("height");
      const saved_body_h_pri = body.style.getPropertyPriority("height");
      const saved_body_minh = body.style.getPropertyValue("min-height");
      const saved_body_minh_pri = body.style.getPropertyPriority("min-height");

      iframe.style.height = "0px";
      html.style.setProperty("height", "auto", "important");
      html.style.setProperty("min-height", "0px", "important");
      body.style.setProperty("height", "auto", "important");
      body.style.setProperty("min-height", "0px", "important");

      sync_fit_zoom(doc, body);

      const rect = body.getBoundingClientRect();
      const body_zoom =
        parseFloat(iframe.contentWindow?.getComputedStyle(body).zoom || "1") ||
        1;
      const scroll_height = Math.min(
        body.scrollHeight,
        body.scrollHeight * body_zoom,
      );
      const measured = Math.max(rect.bottom, scroll_height);

      if (saved_html_h) html.style.setProperty("height", saved_html_h, saved_html_h_pri);
      else html.style.removeProperty("height");
      if (saved_html_minh) html.style.setProperty("min-height", saved_html_minh, saved_html_minh_pri);
      else html.style.removeProperty("min-height");
      if (saved_body_h) body.style.setProperty("height", saved_body_h, saved_body_h_pri);
      else body.style.removeProperty("height");
      if (saved_body_minh) body.style.setProperty("min-height", saved_body_minh, saved_body_minh_pri);
      else body.style.removeProperty("min-height");
      iframe.style.height = saved_iframe_height;
      if (
        scroller &&
        saved_scroll_top > 0 &&
        scroller.scrollTop !== saved_scroll_top
      ) {
        scroller.scrollTop = saved_scroll_top;
      }
      restore_ancestor_scroll(saved_ancestor_scroll);
      if (saved_window_scroll > 0 && window.scrollY !== saved_window_scroll) {
        window.scrollTo(window.scrollX, saved_window_scroll);
      }

      return measured;
    };

    const sync_clip_overflow = (doc: Document, clipped: boolean) => {
      const body = doc.body;

      if (!body) return;
      if (clipped) {
        if (body.style.getPropertyValue("overflow-y") !== "auto") {
          body.style.setProperty("overflow-y", "auto");
        }
      } else if (body.style.getPropertyValue("overflow-y")) {
        body.style.removeProperty("overflow-y");
      }
    };

    const measure_and_apply = (force = false) => {
      const doc = iframe.contentDocument;
      const body = doc?.body;

      if (!body || !doc) return;

      const active_selection = doc.getSelection();

      if (!force && active_selection && !active_selection.isCollapsed) return;

      const measured = measure_decoupled_height();

      if (measured <= 0) return;

      const height = Math.min(measured + 8, MAX_IFRAME_HEIGHT);

      sync_clip_overflow(doc, measured + 8 > MAX_IFRAME_HEIGHT);

      if (Math.abs(height - last_height) < 2) return;
      last_height = height;

      set_iframe_height(`${height}px`);
      set_height_ready(true);
      if (email_id) {
        remember_measured_height(email_id, body, height);
        schedule_ready();
      }
    };

    const update_height = () => {
      if (raf_ref.current) cancelAnimationFrame(raf_ref.current);
      raf_ref.current = requestAnimationFrame(() => measure_and_apply());
    };

    const force_remeasure = () => {
      if (raf_ref.current) cancelAnimationFrame(raf_ref.current);
      raf_ref.current = requestAnimationFrame(() => measure_and_apply(true));
    };

    remeasure_ref.current = update_height;

    const reveal_content = () => {
      const content_doc = iframe.contentDocument;

      if (!content_doc?.body) return;

      const immediate_height = measure_decoupled_height();

      if (immediate_height > 0) {
        const clamped = Math.min(immediate_height + 8, MAX_IFRAME_HEIGHT);

        sync_clip_overflow(content_doc, immediate_height + 8 > MAX_IFRAME_HEIGHT);
        last_height = clamped;
        set_iframe_height(`${clamped}px`);
        set_height_ready(true);
        if (email_id) {
          remember_measured_height(email_id, content_doc.body, clamped);
          schedule_ready();
        }
      }
    };

    const listen_to_images = (root: Element | Document) => {
      const images = root.querySelectorAll("img");

      images.forEach((img) => {
        if (!img.complete) {
          img.addEventListener("load", update_height, { once: true });
          img.addEventListener("error", update_height, { once: true });
        }
      });
    };

    const apply_fast_height = (entry: ResizeObserverEntry) => {
      const body = iframe.contentDocument?.body;
      const box_height =
        entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
      const content_height = body
        ? Math.max(
            box_height,
            body.scrollHeight,
            body.getBoundingClientRect().bottom,
          )
        : box_height;

      if (!content_height || content_height <= 0) return;

      const candidate = Math.min(content_height + 8, MAX_IFRAME_HEIGHT);

      if (Math.abs(candidate - last_height) < 2) return;
      if (last_height > 0 && candidate > last_height) return;

      last_height = candidate;
      set_iframe_height(`${candidate}px`);
      set_height_ready(true);
      if (email_id) {
        remember_measured_height(email_id, body, candidate);
        schedule_ready();
      }
    };

    const attach_observer = () => {
      if (!iframe.contentDocument?.body) return;
      const resize_observer_ctor =
        (iframe.contentWindow as (Window & typeof globalThis) | null)
          ?.ResizeObserver ?? ResizeObserver;

      observer_ref.current = new resize_observer_ctor((entries) => {
        const entry = entries[0];
        const doc = iframe.contentDocument;
        const active_selection = doc?.getSelection();

        if (active_selection && !active_selection.isCollapsed) return;
        if (entry) apply_fast_height(entry);

        update_height();
      });
      observer_ref.current.observe(iframe.contentDocument.body);
      update_height();

      listen_to_images(iframe.contentDocument);

      if (mutation_observer_ref.current) {
        mutation_observer_ref.current.disconnect();
      }

      mutation_observer_ref.current = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node instanceof HTMLImageElement) {
              if (!node.complete) {
                node.addEventListener("load", update_height, { once: true });
                node.addEventListener("error", update_height, { once: true });
              } else {
                update_height();
              }
            } else if (node instanceof HTMLElement) {
              listen_to_images(node);
              update_height();
            }
          }
        }
      });

      mutation_observer_ref.current.observe(iframe.contentDocument.body, {
        childList: true,
        subtree: true,
      });
    };

    const notify_document_ready = () => {
      const body = iframe.contentDocument?.body;
      const handler = on_document_ready_ref.current;

      document_ready_cleanup_ref.current?.();
      document_ready_cleanup_ref.current = null;

      if (!body || !handler) return;

      const cleanup = handler(body, force_remeasure);

      if (typeof cleanup === "function") {
        document_ready_cleanup_ref.current = cleanup;
      }
    };

    reveal_cleanup_ref.current?.();
    reveal_cleanup_ref.current = reveal_on_fonts_ready(
      iframe.contentDocument.fonts,
      () => {
        reveal_content();
        attach_observer();
        notify_document_ready();
      },
      update_height,
    );

    const doc_for_settle = iframe.contentDocument;

    settle_timers_ref.current.forEach(clearTimeout);
    settle_timers_ref.current = SETTLE_REMEASURE_DELAYS_MS.map((delay) =>
      setTimeout(() => {
        if (iframe.contentDocument !== doc_for_settle) return;
        measure_and_apply();
      }, delay),
    );

    const doc_at_load = iframe.contentDocument;
    const doc_fonts = doc_at_load.fonts;

    if (doc_fonts) {
      const remeasure_if_current_doc = () => {
        if (iframe.contentDocument === doc_at_load) update_height();
      };

      Promise.resolve(doc_fonts.ready)
        .then(remeasure_if_current_doc)
        .catch(() => {});
      doc_fonts.addEventListener?.("loadingdone", remeasure_if_current_doc);
    }

    forward_iframe_outside_interaction(iframe.contentDocument);

    iframe.contentDocument.addEventListener(
      "wheel",
      (e) => {
        const container = iframe.parentElement;

        if (!container) return;

        const scroller = iframe.contentDocument?.scrollingElement;

        if (scroller && scroller.scrollHeight > scroller.clientHeight + 1) {
          const at_top = scroller.scrollTop <= 0;
          const at_bottom =
            scroller.scrollTop + scroller.clientHeight >=
            scroller.scrollHeight - 1;

          if ((e.deltaY < 0 && !at_top) || (e.deltaY > 0 && !at_bottom)) return;
        }

        container.dispatchEvent(
          new WheelEvent("wheel", {
            deltaX: e.deltaX,
            deltaY: e.deltaY,
            deltaMode: e.deltaMode,
            bubbles: true,
            cancelable: true,
          }),
        );
      },
      { passive: true },
    );

    const find_outer_scroller = (): HTMLElement | null => {
      let node = iframe.parentElement;

      while (node) {
        const overflow_y = window.getComputedStyle(node).overflowY;

        if (
          (overflow_y === "auto" || overflow_y === "scroll") &&
          node.scrollHeight > node.clientHeight + 1
        ) {
          return node;
        }
        node = node.parentElement;
      }

      return null;
    };

    iframe.contentDocument.addEventListener("mousedown", (e) => {
      const event = e as MouseEvent;

      if (event.button !== 1) return;

      event.preventDefault();

      if (start_iframe_autoscroll(iframe, event.clientX, event.clientY)) return;

      const outer = find_outer_scroller();

      if (!outer) return;

      const restore_top = outer.scrollTop;
      let frames = 0;
      const restore_scroll = () => {
        if (outer.scrollTop !== restore_top) outer.scrollTop = restore_top;
        frames += 1;
        if (frames < 8) requestAnimationFrame(restore_scroll);
      };

      requestAnimationFrame(restore_scroll);
    });

    const forward_touch = (name: string) => (e: TouchEvent) => {
      const touch = e.touches[0] || e.changedTouches[0];

      if (!touch) return;

      iframe.dispatchEvent(
        new TouchEvent(name, {
          bubbles: true,
          cancelable: true,
          touches: Array.from(e.touches),
          targetTouches: Array.from(e.targetTouches),
          changedTouches: Array.from(e.changedTouches),
        }),
      );
    };

    iframe.contentDocument.addEventListener(
      "touchstart",
      forward_touch("touchstart"),
      { passive: true },
    );
    iframe.contentDocument.addEventListener(
      "touchmove",
      forward_touch("touchmove"),
      { passive: true },
    );
    iframe.contentDocument.addEventListener(
      "touchend",
      forward_touch("touchend"),
      { passive: true },
    );

    iframe.contentDocument.body.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;

      if (target.tagName === "IMG" && !target.closest("a")) {
        if (target.getAttribute("data-blocked") !== "true") {
          const img_el = target as HTMLImageElement;

          if (img_el.naturalWidth >= 16 && img_el.naturalHeight >= 16) {
            e.preventDefault();
            const src = img_el.currentSrc || img_el.src;

            if (src) zoom_fn_ref.current?.(src);

            return;
          }
        }
      }

      const link = target.closest("a");

      if (!link) return;
      const href = link.getAttribute("href") || "";

      if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;

      e.preventDefault();
      e.stopPropagation();

      if (href.startsWith("aster:")) {
        const path = href.slice("aster:".length);
        const ASTER_PATH_ALLOWLIST = /^(?:settings(?:\/[a-z0-9_-]{1,32})?)$/i;

        if (ASTER_PATH_ALLOWLIST.test(path)) {
          window.dispatchEvent(
            new CustomEvent("aster-internal-link", { detail: { path } }),
          );
        }
      } else {
        window.dispatchEvent(
          new CustomEvent("aster-external-link", {
            detail: { url: href },
          }),
        );
      }
    });

    iframe.contentDocument.body.addEventListener("auxclick", (e) => {
      if ((e as MouseEvent).button !== 1) return;

      const target = e.target as HTMLElement;
      const link = target.closest("a");

      if (!link) return;
      const href = link.getAttribute("href") || "";

      if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;

      e.preventDefault();
      e.stopPropagation();

      if (href.startsWith("aster:")) {
        const path = href.slice("aster:".length);
        const ASTER_PATH_ALLOWLIST = /^(?:settings(?:\/[a-z0-9_-]{1,32})?)$/i;

        if (ASTER_PATH_ALLOWLIST.test(path)) {
          window.dispatchEvent(
            new CustomEvent("aster-internal-link", { detail: { path } }),
          );
        }
      } else {
        window.dispatchEvent(
          new CustomEvent("aster-external-link", {
            detail: { url: href },
          }),
        );
      }
    });

    iframe.contentDocument.addEventListener("keydown", (e) => {
      const is_select_all =
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        (e.key === "a" || e.key === "A");

      if (!is_select_all) return;

      const doc = iframe.contentDocument;
      const body = doc?.body;
      const selection = doc?.getSelection();

      if (!doc || !body || !selection) return;

      e.preventDefault();
      const range = doc.createRange();

      range.selectNodeContents(body);
      selection.removeAllRanges();
      selection.addRange(range);
    });

    iframe.contentDocument.addEventListener("selectionchange", () => {
      const selection = iframe.contentDocument?.getSelection();

      if (selection && selection.isCollapsed) update_height();
    });
  }, [
    collapse_forwarded_content,
    collapse_quoted_replies,
    collapse_empty_block_runs,
    trim_trailing_empty_blocks,
    unblock_remote_content,
    preserve_formatting,
    is_plain_text,
  ]);

  useEffect(() => {
    if (!load_remote_content) return;
    const iframe = iframe_ref.current;
    const doc = iframe?.contentDocument;

    if (!doc?.body) return;

    unblock_remote_content(doc);
    resolve_native_images(doc);
  }, [load_remote_content, unblock_remote_content]);

  useEffect(() => {
    return () => {
      observer_ref.current?.disconnect();
      mutation_observer_ref.current?.disconnect();
      if (raf_ref.current) cancelAnimationFrame(raf_ref.current);
      if (stable_timer_ref.current) clearTimeout(stable_timer_ref.current);
      settle_timers_ref.current.forEach(clearTimeout);
      settle_timers_ref.current = [];
      reveal_cleanup_ref.current?.();
      document_ready_cleanup_ref.current?.();
      document_ready_cleanup_ref.current = null;
    };
  }, []);

  useEffect(() => {
    if (!zoomed_image) return;
    const handle_key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        set_zoomed_image(null);
      }
    };

    window.addEventListener("keydown", handle_key, true);

    return () => window.removeEventListener("keydown", handle_key, true);
  }, [zoomed_image]);

  const effective_bg = is_html_email ? html_bg : plain_bg;

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const expected_nonce = String(doc_nonce);

    const poll = () => {
      if (cancelled) return;
      const doc = iframe_ref.current?.contentDocument;
      const body = doc?.body;
      const doc_matches =
        doc?.documentElement?.getAttribute("data-aster-doc-nonce") ===
        expected_nonce;

      if (doc_matches) {
        if (body?.hasAttribute("data-aster-processed")) return;
        if (doc && body && doc.readyState !== "loading" && body.childNodes.length > 0) {
          handle_load();

          return;
        }
      }
      attempts += 1;
      if (attempts < 100) {
        setTimeout(poll, 50);

        return;
      }
      if (body && body.childNodes.length > 0) handle_load();
    };

    poll();

    return () => {
      cancelled = true;
    };
  }, [srcdoc_html, doc_nonce, handle_load]);

  useEffect(() => {
    if (contrast_ready) return;

    const timer = setTimeout(
      () => set_contrast_ready(true),
      CONTENT_READY_FALLBACK_MS,
    );

    return () => clearTimeout(timer);
  }, [contrast_ready, srcdoc_html]);

  const show_skeleton = !height_ready || !contrast_ready;

  return (
    <>
    {zoomed_image && (
      <div
        aria-label={t("common.close")}
        role="button"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          backgroundColor: "rgba(0,0,0,0.88)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "zoom-out",
        }}
        tabIndex={0}
        onClick={() => set_zoomed_image(null)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") set_zoomed_image(null); }}
      >
        <button
          aria-label={t("common.close")}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            background: "rgba(255,255,255,0.12)",
            border: "none",
            borderRadius: "50%",
            width: 36,
            height: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "#fff",
            fontSize: 20,
            lineHeight: 1,
          }}
          onClick={() => set_zoomed_image(null)}
        >
          &#x2715;
        </button>
        <img
          alt=""
          src={zoomed_image}
          style={{
            maxWidth: "90vw",
            maxHeight: "90vh",
            objectFit: "contain",
            borderRadius: 4,
            cursor: "default",
          }}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    )}
    <div
      className={`email-frame-container ${class_name || ""}`}
      style={{
        backgroundColor: effective_bg,
        position: "relative",
      }}
    >
      {show_skeleton && (
        <div
          style={{
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <div
            className="animate-pulse"
            style={{
              height: "14px",
              width: "85%",
              borderRadius: "4px",
              backgroundColor: app_is_dark
                ? "rgba(255,255,255,0.06)"
                : "rgba(0,0,0,0.06)",
            }}
          />
          <div
            className="animate-pulse"
            style={{
              height: "14px",
              width: "70%",
              borderRadius: "4px",
              backgroundColor: app_is_dark
                ? "rgba(255,255,255,0.06)"
                : "rgba(0,0,0,0.06)",
            }}
          />
          <div
            className="animate-pulse"
            style={{
              height: "14px",
              width: "60%",
              borderRadius: "4px",
              backgroundColor: app_is_dark
                ? "rgba(255,255,255,0.06)"
                : "rgba(0,0,0,0.06)",
            }}
          />
          <div
            className="animate-pulse"
            style={{
              height: "14px",
              width: "40%",
              borderRadius: "4px",
              backgroundColor: app_is_dark
                ? "rgba(255,255,255,0.06)"
                : "rgba(0,0,0,0.06)",
            }}
          />
        </div>
      )}
      <iframe
        ref={(el) => {
          iframe_ref.current = el;
        }}
        referrerPolicy="no-referrer"
        sandbox="allow-same-origin allow-popups"
        srcDoc={srcdoc_html}
        style={{
          border: "none",
          width: "100%",
          height: height_ready ? iframe_height : "0px",
          maxHeight: "12000px",
          overflow: "hidden",
          display: "block",
          opacity: height_ready && contrast_ready ? 1 : 0,
          backgroundColor: effective_bg,
          touchAction: "pan-y",
        }}
        title={t("mail.email_content")}
        onLoad={handle_load}
      />
    </div>
    </>
  );
}
