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

import { IMAGE_PROXY_URL } from "./helpers";
import {
  collect_lines,
  find_quote_start,
  find_trailing_quote,
  has_reply_text_before,
  is_boilerplate_text,
  is_separator_text,
  resolve_quote_end,
} from "./quote_detection";

import {
  image_load_retry_delay_ms,
  parse_retry_attempt,
  should_retry_image_load,
} from "@/lib/image_load_retry";
import { connection_store } from "@/services/routing/connection_store";
import { clear_blocked_image } from "@/lib/blocked_image_placeholder";
import { ignore_error } from "@/lib/ignore_error";
import { remove_aster_footers } from "@/lib/aster_footer_strip";

type translate_fn = ReturnType<typeof use_i18n>["t"];

const HIDDEN_QUOTE_SELECTOR =
  ".aster_quote, .gmail_quote, .protonmail_quote, .yahoo_quoted, .moz-cite-prefix";

const VISIBLE_MEDIA_TAGS = ["IMG", "VIDEO", "PICTURE"];
const VISIBLE_MEDIA_SELECTOR = "img, video, picture";

function contains_media(node: Node): boolean {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  const el = node as Element;

  if (VISIBLE_MEDIA_TAGS.includes(el.tagName.toUpperCase())) return true;

  return !!el.querySelector(VISIBLE_MEDIA_SELECTOR);
}

function has_content_outside(
  doc: Document,
  body: Element,
  nodes: Node[],
): boolean {
  const walker = doc.createTreeWalker(
    body,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
  );

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const is_inside = nodes.some(
      (n) =>
        n === node ||
        (n.nodeType === Node.ELEMENT_NODE && (n as Element).contains(node)),
    );

    if (is_inside) continue;
    if (node.nodeType === Node.TEXT_NODE) {
      if ((node.textContent || "").trim().length > 0) return true;
      continue;
    }
    if (VISIBLE_MEDIA_TAGS.includes((node as Element).tagName.toUpperCase())) {
      return true;
    }
  }

  return false;
}

function quote_leads_body(quote: Element): boolean {
  if (quote.parentElement?.tagName !== "BODY") return false;

  let prev: Node | null = quote.previousSibling;

  while (prev) {
    if ((prev.textContent || "").trim().length > 0) return false;
    if (contains_media(prev)) return false;
    prev = prev.previousSibling;
  }

  return true;
}

function reveal_hidden_quote_blocks(el: Element): void {
  if (el.matches(HIDDEN_QUOTE_SELECTOR)) {
    (el as HTMLElement).style.display = "block";
  }
  el.querySelectorAll(HIDDEN_QUOTE_SELECTOR).forEach((child) => {
    (child as HTMLElement).style.display = "block";
  });
}

function fill_quote_toggle(
  doc: Document,
  toggle_btn: HTMLButtonElement,
  t: translate_fn,
  expanded: boolean,
): void {
  const label = expanded
    ? t("mail.hide_quoted_text")
    : t("mail.show_quoted_text");

  toggle_btn.textContent = "";
  toggle_btn.removeAttribute("title");
  toggle_btn.setAttribute("data-aster-tip", label);
  toggle_btn.setAttribute("aria-label", label);
  toggle_btn.setAttribute("aria-expanded", expanded ? "true" : "false");

  const dots = doc.createElement("span");

  dots.className = "aster-quote-toggle-dots";
  dots.setAttribute("aria-hidden", "true");
  toggle_btn.appendChild(dots);
}

export function collapse_forwarded_content(
  doc: Document,
  t: translate_fn,
): void {
  const body = doc.body;

  if (!body) return;
  if (body.querySelector("details.aster-forwarded-collapse")) return;

  const proton_wrapper = body.querySelector("div.protonmail_quote");

  if (proton_wrapper) {
    const metadata_nodes: Node[] = [];
    let prev: Node | null = proton_wrapper.previousSibling;

    while (prev) {
      const el = prev.nodeType === Node.ELEMENT_NODE ? (prev as Element) : null;
      const text = prev.textContent?.trim() || "";
      const is_sig = el?.classList?.contains("protonmail_signature_block");
      const is_spacer = !text && !contains_media(prev);

      if (is_sig || is_spacer) {
        metadata_nodes.unshift(prev);
        prev = prev.previousSibling;
      } else {
        break;
      }
    }

    metadata_nodes.push(proton_wrapper);

    if (!has_content_outside(doc, body, metadata_nodes)) {
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
    if (!has_content_outside(doc, body, [gmail_wrapper])) {
      (gmail_wrapper as HTMLElement).style.display = "block";

      return;
    }

    const wrapper = doc.createElement("div");

    wrapper.className = "aster-quoted-wrapper";

    const toggle_btn = doc.createElement("button");

    toggle_btn.className = "aster-quote-toggle";
    toggle_btn.type = "button";
    fill_quote_toggle(doc, toggle_btn, t, false);

    const content_div = doc.createElement("div");

    content_div.className = "aster-quoted-content";
    content_div.style.display = "none";

    if (quote_leads_body(gmail_wrapper)) {
      let blank: Node | null = gmail_wrapper.previousSibling;

      while (blank) {
        const previous: Node | null = blank.previousSibling;

        blank.parentNode?.removeChild(blank);
        blank = previous;
      }
      body.appendChild(wrapper);
    } else {
      gmail_wrapper.parentNode!.insertBefore(wrapper, gmail_wrapper);
    }
    content_div.appendChild(gmail_wrapper);

    toggle_btn.addEventListener("click", () => {
      const is_hidden = content_div.style.display === "none";

      content_div.style.display = is_hidden ? "" : "none";
      toggle_btn.classList.toggle("aster-quote-expanded", is_hidden);
      fill_quote_toggle(doc, toggle_btn, t, is_hidden);
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
      const el = prev.nodeType === Node.ELEMENT_NODE ? (prev as Element) : null;
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
    if (
      el.querySelector(
        "img,hr,table,iframe,svg,video,object,embed,input,button",
      )
    ) {
      return false;
    }

    return !/background|height|border|padding/i.test(
      el.getAttribute("style") || "",
    );
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

const INLINE_LINE_TAGS = new Set([
  "A",
  "B",
  "I",
  "U",
  "EM",
  "STRONG",
  "FONT",
  "SMALL",
  "CODE",
  "SPAN",
]);

function line_top(node: Node): Node {
  let top = node;

  while (
    top.parentNode &&
    top.parentNode.nodeType === Node.ELEMENT_NODE &&
    INLINE_LINE_TAGS.has((top.parentNode as Element).tagName.toUpperCase()) &&
    !top.previousSibling
  ) {
    top = top.parentNode;
  }

  return top;
}

function is_line_break(node: Node): boolean {
  return (
    node.nodeType === Node.ELEMENT_NODE &&
    (node as Element).tagName.toUpperCase() === "BR"
  );
}

function is_meaningful(node: Node): boolean {
  if ((node.textContent || "").trim().length > 0) return true;

  return contains_media(node);
}

function previous_meaningful_sibling(node: Node): Node | null {
  let prev = node.previousSibling;

  while (prev && !is_meaningful(prev) && !is_separator_node(prev)) {
    prev = prev.previousSibling;
  }

  return prev;
}

function is_separator_node(node: Node): boolean {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  const el = node as Element;

  if (el.tagName.toUpperCase() === "HR") return true;

  return is_separator_text((el.textContent || "").trim());
}

function quote_start_node(body: Element, first: Node): Node {
  let node = line_top(first);

  while (
    node.parentNode &&
    node.parentNode !== body &&
    !(node.parentNode as Element).matches?.("td, th") &&
    !previous_meaningful_sibling(node)
  ) {
    node = node.parentNode;
  }

  const prev = previous_meaningful_sibling(node);

  if (prev && is_separator_node(prev)) return prev;

  return node;
}

function has_media_before_node(doc: Document, body: Element, node: Node) {
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_ELEMENT);

  while (walker.nextNode()) {
    const current = walker.currentNode;

    if (current === node || node.contains(current)) return false;
    if (VISIBLE_MEDIA_TAGS.includes((current as Element).tagName)) return true;
  }

  return false;
}

function has_content_after_node(doc: Document, body: Element, node: Node) {
  const walker = doc.createTreeWalker(
    body,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
  );
  let past = false;

  while (walker.nextNode()) {
    const current = walker.currentNode;

    if (!past) {
      if (current === node) past = true;
      continue;
    }
    if (node.contains(current)) continue;
    if (current.nodeType === Node.TEXT_NODE) {
      if ((current.textContent || "").trim()) return true;
      continue;
    }
    if (VISIBLE_MEDIA_TAGS.includes((current as Element).tagName)) return true;
  }

  return false;
}

function trim_edge_breaks(node: Node | null, at_end: boolean): void {
  let el: Node | null = node;

  for (let depth = 0; el && depth < 4; depth++) {
    if (el.nodeType !== Node.ELEMENT_NODE) return;
    let edge: Node | null = at_end ? el.lastChild : el.firstChild;

    while (
      edge &&
      (is_line_break(edge) ||
        (edge.nodeType === Node.TEXT_NODE && !(edge.textContent || "").trim()))
    ) {
      const next: Node | null = at_end
        ? edge.previousSibling
        : edge.nextSibling;

      el.removeChild(edge);
      edge = next;
    }
    el = edge;
  }
}

function strip_quote_prefixes(doc: Document, content: Element): void {
  const strip_walker = doc.createTreeWalker(content, NodeFilter.SHOW_TEXT);

  while (strip_walker.nextNode()) {
    const text_node = strip_walker.currentNode;

    if (!text_node.textContent) continue;

    const prev = text_node.previousSibling;
    const is_line_start = !prev || is_line_break(prev);

    if (is_line_start && /^(>\s?)+/.test(text_node.textContent)) {
      text_node.textContent = text_node.textContent.replace(/^(>\s?)+/, "");
    }
  }
}

function build_quote_wrapper(
  doc: Document,
  t: translate_fn,
  content: Node,
): HTMLDivElement {
  const wrapper = doc.createElement("div");

  wrapper.className = "aster-quoted-wrapper";

  const toggle_btn = doc.createElement("button");

  toggle_btn.className = "aster-quote-toggle";
  toggle_btn.type = "button";
  fill_quote_toggle(doc, toggle_btn, t, false);

  const content_div = doc.createElement("div");

  content_div.className = "aster-quoted-content";
  content_div.style.display = "none";
  content_div.appendChild(content);
  strip_quote_prefixes(doc, content_div);

  toggle_btn.addEventListener("click", () => {
    const is_hidden = content_div.style.display === "none";

    content_div.style.display = is_hidden ? "" : "none";
    toggle_btn.classList.toggle("aster-quote-expanded", is_hidden);
    fill_quote_toggle(doc, toggle_btn, t, is_hidden);
  });

  wrapper.appendChild(toggle_btn);
  wrapper.appendChild(content_div);

  return wrapper;
}

function shallow_clone(el: Node): Node {
  const clone = el.cloneNode(false);

  if (clone.nodeType === Node.ELEMENT_NODE) {
    (clone as Element).removeAttribute("id");
  }

  return clone;
}

function split_before(node: Node, scope: Node): Node {
  let current = node;

  while (current.parentNode && current.parentNode !== scope) {
    const parent = current.parentNode;

    if (current.previousSibling && parent.parentNode) {
      const clone = shallow_clone(parent);
      let moving: Node | null = current;

      while (moving) {
        const next: Node | null = moving.nextSibling;

        clone.appendChild(moving);
        moving = next;
      }
      parent.parentNode.insertBefore(clone, parent.nextSibling);
      current = clone;
    } else {
      current = parent;
    }
  }

  return current;
}

function split_after(node: Node, scope: Node): Node {
  let current = node;

  while (current.parentNode && current.parentNode !== scope) {
    const parent = current.parentNode;

    if (current.nextSibling && parent.parentNode) {
      const clone = shallow_clone(parent);

      while (current.nextSibling) clone.appendChild(current.nextSibling);
      parent.parentNode.insertBefore(clone, parent.nextSibling);
    }
    current = parent;
  }

  return current;
}

function break_preformatted_lines(doc: Document, body: Element): void {
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;

    if (!node.data.includes("\n")) continue;
    if (!node.parentElement?.closest("pre")) continue;
    targets.push(node);
  }

  for (const node of targets) {
    const parts = node.data.split(/\r?\n/);
    const fragment = doc.createDocumentFragment();

    parts.forEach((part, index) => {
      if (index > 0) fragment.appendChild(doc.createElement("br"));
      if (part) fragment.appendChild(doc.createTextNode(part));
    });
    node.parentNode?.replaceChild(fragment, node);
  }
}

export function collapse_quoted_replies(doc: Document, t: translate_fn): void {
  const body = doc.body;

  if (!body) return;
  remove_aster_footers(body, true);
  if (body.querySelector("details.aster-forwarded-collapse")) return;
  if (body.querySelector(".aster-quote-toggle")) return;

  break_preformatted_lines(doc, body);

  const lines = collect_lines(body);
  const found = find_quote_start(lines) ?? find_trailing_quote(lines);

  if (!found) return;

  const quote_end = resolve_quote_end(lines, found.body_from);

  if (!quote_end) return;

  const start_node = quote_start_node(body, lines[found.start].first);
  const end_node = quote_end.to_end ? null : lines[quote_end.end].last;
  const cell = (
    start_node.nodeType === Node.ELEMENT_NODE
      ? (start_node as Element)
      : start_node.parentElement
  )?.closest("td, th");
  const end_scope: Node = cell ?? body;

  if (!end_scope.lastChild) return;

  const content_before =
    has_reply_text_before(lines, found.start) ||
    has_media_before_node(doc, body, start_node);

  if (!content_before) {
    if (end_node) {
      if (!has_content_after_node(doc, body, end_node)) return;
    } else {
      const to_collapse: Node[] = [start_node];
      let sib: Node | null = start_node.nextSibling;

      while (sib) {
        const tag =
          sib.nodeType === Node.ELEMENT_NODE
            ? (sib as Element).tagName.toUpperCase()
            : null;

        if (tag !== "BLOCKQUOTE" && (sib.textContent || "").trim()) break;
        to_collapse.push(sib);
        sib = sib.nextSibling;
      }

      const outside =
        lines.some(
          (line) =>
            !is_boilerplate_text(line.text) &&
            !to_collapse.some(
              (n) => n === line.first || n.contains(line.first),
            ),
        ) ||
        Array.from(body.querySelectorAll(VISIBLE_MEDIA_TAGS.join(","))).some(
          (media) => !to_collapse.some((n) => n.contains(media)),
        );

      if (!outside) {
        to_collapse.forEach((n) => {
          if (n.nodeType === Node.ELEMENT_NODE) {
            reveal_hidden_quote_blocks(n as Element);
          }
        });

        return;
      }

      const fragment = doc.createDocumentFragment();

      to_collapse.forEach((n) => fragment.appendChild(n));
      body.appendChild(build_quote_wrapper(doc, t, fragment));

      return;
    }
  }

  if (end_node && !end_scope.contains(end_node)) return;

  const first_top = split_before(start_node, end_scope);
  const last_top = end_node
    ? split_after(line_top_end(end_node), end_scope)
    : end_scope.lastChild!;

  if (
    first_top !== last_top &&
    !(
      first_top.compareDocumentPosition(last_top) &
      Node.DOCUMENT_POSITION_FOLLOWING
    )
  ) {
    return;
  }

  const anchor = last_top.nextSibling;
  const fragment = doc.createDocumentFragment();
  let moving: Node | null = first_top;

  while (moving) {
    const next: Node | null = moving === last_top ? null : moving.nextSibling;

    fragment.appendChild(moving);
    moving = next;
  }

  const wrapper = build_quote_wrapper(doc, t, fragment);

  end_scope.insertBefore(wrapper, anchor);
  trim_edge_breaks(wrapper.previousSibling, true);
  trim_edge_breaks(wrapper.nextSibling, false);
}

function line_top_end(node: Node): Node {
  let top = node;

  while (
    top.parentNode &&
    top.parentNode.nodeType === Node.ELEMENT_NODE &&
    INLINE_LINE_TAGS.has((top.parentNode as Element).tagName.toUpperCase()) &&
    !top.nextSibling
  ) {
    top = top.parentNode;
  }

  return top;
}

const COLLAPSE_CONTAINER_SELECTOR =
  ".aster-quoted-content, details.aster-forwarded-collapse";
const COLLAPSE_CONTROL_SELECTOR =
  ".aster-quote-toggle, details.aster-forwarded-collapse";
const RENDERABLE_MEDIA_SELECTOR =
  "img, svg, video, canvas, picture, hr, .blocked-image";
const NON_RENDERED_TAGS = ["STYLE", "SCRIPT", "TITLE", "TEMPLATE", "NOSCRIPT"];
const VISIBILITY_SCAN_LIMIT = 400;

export function reveal_orphaned_hidden_quotes(doc: Document): void {
  const body = doc.body;

  if (!body) return;

  body.querySelectorAll<HTMLElement>(HIDDEN_QUOTE_SELECTOR).forEach((el) => {
    if (el.closest(COLLAPSE_CONTAINER_SELECTOR)) return;
    if (el.style.display) return;
    el.style.display = "block";
  });
}

function is_zero_length(value: string): boolean {
  return /^0(?:\.0+)?(?:px)?$/.test(value.trim());
}

const FILLER_ONLY_TEXT =
  /^[\s\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u2060-\u2064\u3164\ufeff]*$/;

function is_filler_only(text: string): boolean {
  return FILLER_ONLY_TEXT.test(text);
}

function hides_subtree(style: CSSStyleDeclaration): boolean {
  if (style.display === "none") return true;
  if (style.opacity !== "" && parseFloat(style.opacity) === 0) return true;

  const clips = style.overflow !== "" && style.overflow !== "visible";

  return (
    clips && (is_zero_length(style.maxHeight) || is_zero_length(style.height))
  );
}

function is_invisible(style: CSSStyleDeclaration): boolean {
  return style.visibility === "hidden" || style.visibility === "collapse";
}

function collect_hiding_elements(
  node: Node,
  body: HTMLElement,
  view: Window,
): HTMLElement[] {
  const hiding: HTMLElement[] = [];
  const is_text = node.nodeType !== Node.ELEMENT_NODE;
  const nearest = is_text ? node.parentElement : (node as HTMLElement);
  const nearest_invisible =
    !!nearest && is_invisible(view.getComputedStyle(nearest));
  let el: HTMLElement | null = nearest;

  while (el) {
    const style = view.getComputedStyle(el);
    const shrinks_text =
      is_text && el === nearest && is_zero_length(style.fontSize);

    if (
      hides_subtree(style) ||
      shrinks_text ||
      (nearest_invisible && is_invisible(style))
    ) {
      hiding.push(el);
    }
    if (el === body) break;
    el = el.parentElement;
  }

  return hiding;
}

function is_tracking_pixel(el: Element): boolean {
  if (el.tagName !== "IMG") return false;

  return ["width", "height"].some((name) =>
    ["0", "1"].includes((el.getAttribute(name) ?? "").trim()),
  );
}

function force_visible(el: HTMLElement, view: Window): void {
  const style = view.getComputedStyle(el);

  if (style.display === "none") {
    el.style.setProperty(
      "display",
      el.matches(HIDDEN_QUOTE_SELECTOR) ? "block" : "revert",
      "important",
    );
  }
  if (style.visibility === "hidden" || style.visibility === "collapse") {
    el.style.setProperty("visibility", "visible", "important");
  }
  if (style.opacity !== "" && parseFloat(style.opacity) === 0) {
    el.style.setProperty("opacity", "1", "important");
  }
  if (is_zero_length(style.fontSize)) {
    el.style.setProperty("font-size", "14px", "important");
  }
  if (is_zero_length(style.maxHeight)) {
    el.style.setProperty("max-height", "none", "important");
  }
  if (is_zero_length(style.height)) {
    el.style.setProperty("height", "auto", "important");
  }
  if (is_zero_length(style.maxWidth)) {
    el.style.setProperty("max-width", "none", "important");
  }
  if (is_zero_length(style.width)) {
    el.style.setProperty("width", "auto", "important");
  }
  if (/px$/.test(style.lineHeight) && parseFloat(style.lineHeight) < 2) {
    el.style.setProperty("line-height", "normal", "important");
  }
}

export function reveal_fully_hidden_content(doc: Document): boolean {
  const body = doc.body;
  const view = doc.defaultView;

  if (!body || !view) return false;
  if (body.querySelector(COLLAPSE_CONTROL_SELECTOR)) return false;

  const hiding = new Set<HTMLElement>();
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  let scanned = 0;

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;

    if (!parent || NON_RENDERED_TAGS.includes(parent.tagName)) continue;
    if (is_filler_only(node.textContent || "")) continue;

    scanned += 1;
    if (scanned > VISIBILITY_SCAN_LIMIT) return false;

    const found = collect_hiding_elements(node, body, view);

    if (found.length === 0) return false;
    found.forEach((el) => hiding.add(el));
  }

  if (scanned === 0) return false;

  const media = Array.from(body.querySelectorAll(RENDERABLE_MEDIA_SELECTOR));

  for (const el of media) {
    if (is_tracking_pixel(el)) continue;
    if (collect_hiding_elements(el, body, view).length === 0) return false;
  }

  hiding.forEach((el) => force_visible(el, view));

  return true;
}

const IMAGE_RETRY_ATTRIBUTE = "data-load-retry";

function install_image_load_fallback(img_el: HTMLImageElement): void {
  img_el.addEventListener(
    "error",
    () => {
      const attempt = parse_retry_attempt(
        img_el.getAttribute(IMAGE_RETRY_ATTRIBUTE),
      );
      const current_src = img_el.getAttribute("src") || "";

      if (should_retry_image_load(attempt, current_src)) {
        img_el.setAttribute(IMAGE_RETRY_ATTRIBUTE, String(attempt + 1));
        img_el.removeAttribute("src");

        const owner = img_el.ownerDocument?.defaultView ?? window;

        owner.setTimeout(() => {
          install_image_load_fallback(img_el);
          img_el.setAttribute("src", current_src);
        }, image_load_retry_delay_ms(attempt));

        return;
      }

      img_el.setAttribute("data-load-failed", "true");

      if ((img_el.getAttribute("alt") || "").trim().length > 0) return;

      img_el.style.display = "none";
    },
    { once: true },
  );
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
      } catch (caught) {
        ignore_error(
          "components/email/sandboxed_email_renderer/dom_cleanup:unblock_remote_content",
          caught,
        );
      }
    }
    clear_blocked_image(el);
    el.removeAttribute("data-blocked");
    el.classList.remove("blocked-remote-image");
    const alt = el.getAttribute("alt");

    if (alt === "[Click to load image]") {
      el.setAttribute("alt", "");
    }
    const img_el = el as HTMLImageElement;

    install_image_load_fallback(img_el);
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
