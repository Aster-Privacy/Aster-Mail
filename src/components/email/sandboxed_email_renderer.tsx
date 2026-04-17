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
import { useRef, useEffect, useState, useCallback } from "react";
import { Capacitor } from "@capacitor/core";

import { EMAIL_BODY_CSS, FORCED_DARK_MODE_CSS } from "@/lib/email_body_styles";
import { useTheme } from "@/contexts/theme_context";
import { use_i18n } from "@/lib/i18n/context";
import { get_image_proxy_url } from "@/lib/image_proxy";
import { api_client } from "@/services/api/client";

const IMAGE_PROXY_URL = get_image_proxy_url();

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

      const url = src.startsWith("http")
        ? src
        : `https://app.astermail.org${src}`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) return;

      const blob = await response.blob();

      img.src = URL.createObjectURL(blob);
    }),
  );
}

const iframe_height_cache = new Map<string, number>();

export function get_cached_iframe_height(email_id: string): number | undefined {
  return iframe_height_cache.get(email_id);
}

export function set_cached_iframe_height(
  email_id: string,
  height: number,
): void {
  iframe_height_cache.set(email_id, height);
}

interface SandboxedEmailRendererProps {
  sanitized_html: string;
  class_name?: string;
  is_plain_text?: boolean;
  is_literal_plain_text?: boolean;
  load_remote_content?: boolean;
  variant?: "desktop" | "mobile";
  force_dark_mode?: boolean;
  body_background?: string;
  email_id?: string;
}

export function SandboxedEmailRenderer({
  sanitized_html,
  class_name,
  is_plain_text = false,
  is_literal_plain_text,
  load_remote_content = false,
  variant: _variant = "desktop",
  force_dark_mode = false,
  body_background,
  email_id,
}: SandboxedEmailRendererProps) {
  const { t } = use_i18n();
  const cached_height = email_id
    ? iframe_height_cache.get(email_id)
    : undefined;
  const [iframe_height, set_iframe_height] = useState(
    cached_height ? `${cached_height}px` : "0px",
  );
  const [height_ready, set_height_ready] = useState(!!cached_height);
  const prev_html_ref = useRef(sanitized_html);
  const iframe_ref = useRef<HTMLIFrameElement | null>(null);
  const observer_ref = useRef<ResizeObserver | null>(null);
  const mutation_observer_ref = useRef<MutationObserver | null>(null);
  const raf_ref = useRef<number>(0);
  const stable_timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const has_fired_ready_ref = useRef(!!cached_height);
  const load_remote_ref = useRef(load_remote_content);

  if (prev_html_ref.current !== sanitized_html) {
    prev_html_ref.current = sanitized_html;
    const new_cached = email_id ? iframe_height_cache.get(email_id) : undefined;

    set_iframe_height(new_cached ? `${new_cached}px` : "0px");
    set_height_ready(!!new_cached);
    has_fired_ready_ref.current = !!new_cached;
    if (stable_timer_ref.current) {
      clearTimeout(stable_timer_ref.current);
      stable_timer_ref.current = null;
    }
  }

  load_remote_ref.current = load_remote_content;
  const { theme } = useTheme();
  const is_dark_theme = theme === "dark";
  const is_html_email = !is_plain_text;
  const has_block_html =
    /<(div|p|table|tr|td|h[1-6]|ul|ol|li|blockquote)\b/i.test(sanitized_html);
  const literal_plain_text =
    (is_literal_plain_text ?? is_plain_text) && !has_block_html;
  const has_table_layout = /<table\b/i.test(sanitized_html);
  const plain_bg = "transparent";
  const plain_text_color = force_dark_mode
    ? "#e5e5e5"
    : is_dark_theme
      ? "#e5e5e5"
      : "#111827";
  const html_text_color = force_dark_mode ? "#e5e5e5" : "#111827";
  const html_bg = force_dark_mode
    ? "transparent"
    : body_background || "#ffffff";
  const base_font =
    "'Google Sans Flex',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

  const quote_toggle_css = `.aster-quote-toggle { background: rgba(128, 128, 128, 0.12) !important; border-color: rgba(128, 128, 128, 0.25) !important; color: rgba(100, 100, 100, 0.8) !important; }
.aster-quote-toggle:hover { background: rgba(128, 128, 128, 0.2) !important; border-color: rgba(128, 128, 128, 0.4) !important; }
.aster-quoted-content { border-left-color: #60a5fa !important; }`;

  const plain_dark_css =
    is_dark_theme && !force_dark_mode && !is_html_email
      ? `html { color-scheme: dark !important; }
html, body { background-color: transparent !important; color: ${plain_text_color} !important; }
body * { color: inherit !important; }
a, a * { color: #60a5fa !important; }`
      : "";
  const dark_mode_css = force_dark_mode ? FORCED_DARK_MODE_CSS : plain_dark_css;

  const force_light_scheme = is_html_email && !force_dark_mode;

  const simple_html = is_html_email && !has_table_layout;
  const html_body_style = simple_html
    ? `background-color:${html_bg};color:${html_text_color};padding:16px 20px;font-family:${base_font};font-size:14px;line-height:1.6;word-wrap:break-word`
    : `background-color:${html_bg}`;
  const plain_body_style = `background-color:${plain_bg};color:${plain_text_color};padding:16px 20px;font-family:${base_font};font-size:14px;line-height:1.6;${literal_plain_text ? "white-space:pre-wrap;" : ""}word-wrap:break-word`;

  const iframe_css = EMAIL_BODY_CSS;

  const html_el_style =
    is_html_email && !force_dark_mode
      ? ` style="background-color:${html_bg}"`
      : "";

  const srcdoc_html = `<!DOCTYPE html>
<html${html_el_style}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${force_light_scheme ? `<meta name="color-scheme" content="light only">` : ""}
<base href="${typeof window !== "undefined" && "__TAURI_INTERNALS__" in window ? "https://app.astermail.org" : window.location.origin}/">
<style>${iframe_css}</style>
${force_light_scheme ? `<style>:root, html { color-scheme: light only !important; }</style>` : ""}
<style>${quote_toggle_css}</style>
${dark_mode_css ? `<style>${dark_mode_css}</style>` : ""}
</head>
<body style="${is_html_email ? html_body_style : plain_body_style}">${sanitized_html}</body>
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
        body.querySelector("div.gmail_quote");

      if (gmail_wrapper) {
        const wrapper = doc.createElement("div");

        wrapper.className = "aster-quoted-wrapper";

        const toggle_btn = doc.createElement("button");

        toggle_btn.className = "aster-quote-toggle";
        toggle_btn.type = "button";
        toggle_btn.textContent = "\u2022\u2006\u2022\u2006\u2022";

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

    const is_empty_block = (n: Node): boolean => {
      if (n.nodeType !== Node.ELEMENT_NODE) {
        return (n.textContent || "").trim().length === 0;
      }
      const el = n as Element;
      const tag = el.tagName.toUpperCase();

      if (!["DIV", "P"].includes(tag)) return false;
      if ((el.textContent || "").trim().length !== 0) return false;
      if (el.querySelector("img,hr,table,iframe,video,audio,svg")) return false;

      return true;
    };

    const walk = (parent: Element) => {
      const children = Array.from(parent.children);
      let run_start = -1;

      for (let i = 0; i <= children.length; i++) {
        const child = children[i];
        const empty = child ? is_empty_block(child) : false;

        if (empty) {
          if (run_start === -1) run_start = i;
        } else {
          if (run_start !== -1 && i - run_start > 1) {
            for (let j = run_start + 1; j < i; j++) {
              children[j].remove();
            }
          }
          run_start = -1;
        }
      }

      for (const child of Array.from(parent.children)) {
        if (["DIV", "BLOCKQUOTE", "SECTION"].includes(child.tagName)) {
          walk(child as Element);
        }
      }
    };

    walk(body);
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

    const to_collapse: Node[] = [];
    let sib: Node | null = marker_block;

    while (sib) {
      const next: ChildNode | null = sib.nextSibling;

      to_collapse.push(sib);
      sib = next;
    }

    if (to_collapse.length === 0) return;

    const wrapper = doc.createElement("div");

    wrapper.className = "aster-quoted-wrapper";

    const toggle_btn = doc.createElement("button");

    toggle_btn.className = "aster-quote-toggle";
    toggle_btn.type = "button";
    toggle_btn.textContent = "\u2022\u2006\u2022\u2006\u2022";

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
  }, []);

  const unblock_remote_content = useCallback((doc: Document) => {
    doc.querySelectorAll("img[data-blocked='true']").forEach((el) => {
      const src =
        el.getAttribute("data-proxy-src") ||
        el.getAttribute("data-original-src");

      if (src) el.setAttribute("src", src);
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

    if (!has_rich_layout) {
      doc_body.style.padding = "8px 16px 16px 16px";
      if (!is_plain_text && !forces_light) {
        doc_body.classList.add("aster-simple");
      }
    }

    collapse_forwarded_content(iframe.contentDocument);
    collapse_quoted_replies(iframe.contentDocument);
    collapse_empty_block_runs(iframe.contentDocument);

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

    const update_height = () => {
      if (raf_ref.current) cancelAnimationFrame(raf_ref.current);
      raf_ref.current = requestAnimationFrame(() => {
        const body = iframe.contentDocument?.body;

        if (!body) return;

        iframe.style.height = "0px";
        const height = Math.min(body.scrollHeight + 24, MAX_IFRAME_HEIGHT);

        iframe.style.height = `${height}px`;

        if (height === last_height) return;
        last_height = height;

        set_iframe_height(`${height}px`);
        set_height_ready(true);
        if (email_id) {
          iframe_height_cache.set(email_id, height);
          schedule_ready();
        }
      });
    };

    const immediate_height = iframe.contentDocument.body.scrollHeight;

    if (immediate_height > 0) {
      const clamped = Math.min(immediate_height + 24, MAX_IFRAME_HEIGHT);

      set_iframe_height(`${clamped}px`);
      set_height_ready(true);
      if (email_id) {
        iframe_height_cache.set(email_id, clamped);
        schedule_ready();
      }
    }

    const listen_to_images = (root: Element | Document) => {
      const images = root.querySelectorAll("img");

      images.forEach((img) => {
        if (!img.complete) {
          img.addEventListener("load", update_height, { once: true });
          img.addEventListener("error", update_height, { once: true });
        }
      });
    };

    const attach_observer = () => {
      if (!iframe.contentDocument?.body) return;
      observer_ref.current = new ResizeObserver(update_height);
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

    attach_observer();

    const doc = iframe.contentDocument;

    if (doc.fonts?.ready) {
      doc.fonts.ready.then(update_height);
    }

    iframe.contentDocument.addEventListener(
      "wheel",
      (e) => {
        const container = iframe.parentElement;

        if (!container) return;
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
      const link = (e.target as HTMLElement).closest("a");

      if (!link) return;
      const href = link.getAttribute("href") || "";

      if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;

      e.preventDefault();
      e.stopPropagation();

      if (href.startsWith("aster:")) {
        const path = href.replace("aster:", "");

        window.dispatchEvent(
          new CustomEvent("aster-internal-link", { detail: { path } }),
        );
      } else {
        let resolved_url = href;

        if (!href.startsWith("http://") && !href.startsWith("https://")) {
          resolved_url = "https://" + href;
        }
        window.dispatchEvent(
          new CustomEvent("aster-external-link", {
            detail: { url: resolved_url },
          }),
        );
      }
    });
  }, [
    collapse_forwarded_content,
    collapse_quoted_replies,
    collapse_empty_block_runs,
    unblock_remote_content,
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
    };
  }, []);

  const effective_bg = is_html_email ? html_bg : plain_bg;

  const preview_ref = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el || !height_ready) return;

      if (el.shadowRoot) return;

      const shadow = el.attachShadow({ mode: "open" });

      const body_style = is_html_email
        ? `margin:0;background-color:${html_bg}`
        : `margin:0;background-color:${plain_bg};color:${plain_text_color};padding:16px 20px;font-family:'Google Sans Flex',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.6;${literal_plain_text ? "white-space:pre-wrap;" : ""}word-wrap:break-word`;

      shadow.innerHTML =
        `<style>${EMAIL_BODY_CSS}` +
        (dark_mode_css ? dark_mode_css : "") +
        `a{pointer-events:none}</style>` +
        `<div style="${body_style}">${sanitized_html}</div>`;
    },
    [
      sanitized_html,
      height_ready,
      is_html_email,
      html_bg,
      plain_bg,
      plain_text_color,
      dark_mode_css,
      literal_plain_text,
    ],
  );

  const [iframe_loaded, set_iframe_loaded] = useState(false);
  const prev_email_id_ref = useRef(email_id);

  if (prev_email_id_ref.current !== email_id) {
    prev_email_id_ref.current = email_id;
    set_iframe_loaded(false);
  }

  const handle_load_with_swap = useCallback(() => {
    set_iframe_loaded(true);
    handle_load();
  }, [handle_load]);

  const show_preview = height_ready && !iframe_loaded;

  return (
    <div
      className={`email-frame-container ${class_name || ""}`}
      style={{
        backgroundColor: effective_bg,
        position: "relative",
      }}
    >
      {show_preview && (
        <div
          ref={preview_ref}
          style={{
            width: "100%",
            height: iframe_height,
            maxHeight: "12000px",
            overflow: "clip",
            backgroundColor: effective_bg,
          }}
        />
      )}
      <iframe
        key={
          force_dark_mode
            ? "forced-dark"
            : is_dark_theme && !is_html_email
              ? "plain-dark"
              : "light"
        }
        ref={(el) => {
          iframe_ref.current = el;
        }}
        sandbox="allow-same-origin allow-popups"
        srcDoc={srcdoc_html}
        style={{
          border: "none",
          width: "100%",
          height: height_ready ? iframe_height : "auto",
          minHeight: height_ready ? undefined : "200px",
          maxHeight: "12000px",
          overflow: "hidden",
          display: show_preview ? "none" : "block",
          backgroundColor: effective_bg,
          touchAction: "pan-y",
        }}
        title={t("mail.email_content")}
        onLoad={handle_load_with_swap}
      />
    </div>
  );
}
