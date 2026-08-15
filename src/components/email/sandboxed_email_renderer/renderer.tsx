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

import * as dom_cleanup from "./dom_cleanup";

import { build_measurement_controls } from "./measurement_controls";
import { attach_iframe_interactions } from "./iframe_interactions";
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
  derive_rail_color,
  derive_visited_ink,
  normalize_hex,
} from "@/lib/email_ink";
import {
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
import { use_attachment_keys_version } from "@/hooks/use_attachment_keys_version";
import { useTheme } from "@/contexts/theme_context";
import { use_preferences, FONT_SIZE_DEFAULT, normalize_font_size_scale } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import { connection_store } from "@/services/routing/connection_store";
import { is_any_lockdown_active } from "@/services/lockdown_store";
import { reveal_on_fonts_ready } from "@/components/email/reveal_on_fonts_ready";
import { BODY_PADDING, CONTENT_READY_FALLBACK_MS, SETTLE_REMEASURE_DELAYS_MS, SKELETON_DELAY_MEASURED_MS, SKELETON_DELAY_MS, get_cached_iframe_height, link_hover_ink_for, link_ink_for, needs_settle_remeasure, resolve_native_images, safe_hex } from "./helpers";

import { ignore_error } from "@/lib/ignore_error";

export interface SandboxedEmailRendererProps {
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
  const attachment_keys_version = use_attachment_keys_version(email_id);
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
        revoke_cid_blob_urls(pending_revoke_ref.current);
        pending_revoke_ref.current = internal_cid_blob_urls_ref.current;
        internal_cid_blob_urls_ref.current = result.blob_urls;
        stable_cid_html_ref.current = result.html;
        set_internal_cid_html(result.html);
      })
      .catch((caught) => ignore_error("components/email/sandboxed_email_renderer/renderer:email_zoom", caught));

    return () => {
      cancelled = true;
    };
  }, [sanitized_html, email_id, attachment_keys_version]);

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
<style>img:not([data-blocked='true']) { cursor: zoom-in !important; } a img { cursor: pointer !important; } img[data-blocked='true'] { cursor: default !important; pointer-events: none !important; } a img[data-blocked='true'] { cursor: pointer !important; pointer-events: auto !important; }</style>
</head>
<body style="${is_html_email ? html_body_style : plain_body_style}">${strip_unresolved_cid_references(resolved_html)}${email_font_override_css ? `<style>${email_font_override_css}</style>` : ""}</body>
</html>`;

  const collapse_forwarded_content = useCallback(
    (doc: Document) => dom_cleanup.collapse_forwarded_content(doc, t),
    [t],
  );

  const collapse_empty_block_runs = useCallback(
    (doc: Document) => dom_cleanup.collapse_empty_block_runs(doc),
    [],
  );

  const trim_trailing_empty_blocks = useCallback(
    (doc: Document) => dom_cleanup.trim_trailing_empty_blocks(doc),
    [],
  );

  const collapse_quoted_replies = useCallback(
    (doc: Document) => dom_cleanup.collapse_quoted_replies(doc, t),
    [t],
  );

  const unblock_remote_content = useCallback(
    (doc: Document) => dom_cleanup.unblock_remote_content(doc),
    [],
  );

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
      } catch (caught) {
        ignore_error("components/email/sandboxed_email_renderer/renderer:tor_csp", caught);
      }
    }
    set_contrast_ready(true);

    const {
      measure_and_apply,
      update_height,
      reveal_content,
      attach_observer,
      notify_document_ready,
    } = build_measurement_controls({
      iframe,
      email_id,
      base_zoom_ref,
      document_ready_cleanup_ref,
      has_fired_ready_ref,
      mutation_observer_ref,
      observer_ref,
      raf_ref,
      remeasure_ref,
      stable_timer_ref,
      on_document_ready_ref,
      set_height_ready,
      set_iframe_height,
    });

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
    settle_timers_ref.current = needs_settle_remeasure(doc_body)
      ? SETTLE_REMEASURE_DELAYS_MS.map((delay) =>
          setTimeout(() => {
            if (iframe.contentDocument !== doc_for_settle) return;
            measure_and_apply();
          }, delay),
        )
      : [];

    const doc_at_load = iframe.contentDocument;
    const doc_fonts = doc_at_load.fonts;

    if (doc_fonts) {
      const remeasure_if_current_doc = () => {
        if (iframe.contentDocument === doc_at_load) update_height();
      };

      Promise.resolve(doc_fonts.ready)
        .then(remeasure_if_current_doc)
        .catch((caught) => ignore_error("components/email/sandboxed_email_renderer/renderer:remeasure_if_current_doc", caught));
      doc_fonts.addEventListener?.("loadingdone", remeasure_if_current_doc);
    }

    attach_iframe_interactions(
      iframe,
      iframe.contentDocument,
      iframe.contentDocument.body,
      update_height,
      zoom_fn_ref,
    );
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

  const is_settling = !height_ready || !contrast_ready;
  const [show_skeleton, set_show_skeleton] = useState(false);

  useEffect(() => {
    if (!is_settling) {
      set_show_skeleton(false);

      return;
    }

    const timer = setTimeout(
      () => set_show_skeleton(true),
      height_ready ? SKELETON_DELAY_MEASURED_MS : SKELETON_DELAY_MS,
    );

    return () => clearTimeout(timer);
  }, [height_ready, is_settling, srcdoc_html]);

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
        <div style={{ cursor: "default" }} onClick={(e) => e.stopPropagation()}>
          <img
            alt=""
            src={zoomed_image}
            style={{
              maxWidth: "90vw",
              maxHeight: "90vh",
              objectFit: "contain",
              borderRadius: 4,
              display: "block",
            }}
          />
        </div>
      </div>
    )}
    <div
      className={`email-frame-container ${class_name || ""}`}
      style={{
        backgroundColor: effective_bg,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {show_skeleton && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
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
          transition: "opacity 110ms ease-out",
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
