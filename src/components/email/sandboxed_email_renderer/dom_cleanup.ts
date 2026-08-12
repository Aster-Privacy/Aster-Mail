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
import type { use_i18n } from "@/lib/i18n/context";

import { connection_store } from "@/services/routing/connection_store";

import { IMAGE_PROXY_URL } from "./helpers";

type translate_fn = ReturnType<typeof use_i18n>["t"];

const HIDDEN_QUOTE_SELECTOR =
  ".aster_quote, .gmail_quote, .protonmail_quote, .yahoo_quoted, .moz-cite-prefix";

function has_text_outside(doc: Document, body: Element, nodes: Node[]): boolean {
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const is_inside = nodes.some(
      (n) =>
        n === node ||
        (n.nodeType === Node.ELEMENT_NODE && (n as Element).contains(node)),
    );

    if (is_inside) continue;
    if ((node.textContent || "").trim().length > 0) return true;
  }

  return false;
}

function reveal_hidden_quote_blocks(el: Element): void {
  if (el.matches(HIDDEN_QUOTE_SELECTOR)) {
    (el as HTMLElement).style.display = "block";
  }
  el.querySelectorAll(HIDDEN_QUOTE_SELECTOR).forEach((child) => {
    (child as HTMLElement).style.display = "block";
  });
}

export function collapse_forwarded_content(doc: Document, t: translate_fn): void {
  const body = doc.body;

  if (!body) return;
  if (body.querySelector("details.aster-forwarded-collapse")) return;

  const proton_wrapper = body.querySelector("div.protonmail_quote");

  if (proton_wrapper) {
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

    metadata_nodes.push(proton_wrapper);

    if (!has_text_outside(doc, body, metadata_nodes)) {
      reveal_hidden_quote_blocks(proton_wrapper);

      return;
    }

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
  let sib: Node | null = marker_block.nextSibling;

  while (sib) {
    const next: Node | null = sib.nextSibling;

    to_collapse.push(sib);
    sib = next;
  }

  const details = doc.createElement("details");

  details.className = "aster-forwarded-collapse";
  if (!has_content_before_marker) {
    details.setAttribute("open", "");
    for (const node of to_collapse) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        reveal_hidden_quote_blocks(node as Element);
      }
    }
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
}

export function collapse_empty_block_runs(doc: Document): void {
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
}

export function trim_trailing_empty_blocks(doc: Document): void {
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
}

export function collapse_quoted_replies(doc: Document, t: translate_fn): void {
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
}

export function unblock_remote_content(doc: Document): void {
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
}