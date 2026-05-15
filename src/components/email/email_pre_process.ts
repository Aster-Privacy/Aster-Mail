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
export interface PreProcessOptions {
  forwarded_label: string;
  show_trimmed_label: string;
  preserve_formatting: boolean;
  load_remote_content: boolean;
  proxy_base: string;
}

function collapse_forwarded_content(
  doc: Document,
  label: string,
  show_trimmed_label: string,
): void {
  const body = doc.body;

  if (!body) return;

  const proton_wrapper = body.querySelector("div.protonmail_quote");

  if (proton_wrapper) {
    const content_bq = proton_wrapper.querySelector(":scope > blockquote");

    if (!content_bq) return;

    const metadata_nodes: Node[] = [];
    let prev: Node | null = proton_wrapper.previousSibling;

    while (prev) {
      const el = prev.nodeType === Node.ELEMENT_NODE ? (prev as Element) : null;
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

    summary.textContent = label;
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
    toggle_btn.setAttribute("type", "button");
    toggle_btn.textContent = "•••";
    toggle_btn.setAttribute("title", show_trimmed_label);
    toggle_btn.setAttribute("aria-label", show_trimmed_label);

    const content_div = doc.createElement("div");

    content_div.className = "aster-quoted-content";
    content_div.setAttribute("style", "display:none");

    gmail_wrapper.parentNode!.insertBefore(wrapper, gmail_wrapper);
    content_div.appendChild(gmail_wrapper);

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

  summary.textContent = label;
  details.appendChild(summary);
  const content_div = doc.createElement("div");

  content_div.className = "aster-forwarded-content";
  for (const node of to_collapse) {
    content_div.appendChild(node);
  }
  details.appendChild(content_div);
  body.appendChild(details);
}

function collapse_quoted_replies(
  doc: Document,
  show_trimmed_label: string,
): void {
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
      const tag =
        sib.nodeType === Node.ELEMENT_NODE
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

  const wrapper = doc.createElement("div");

  wrapper.className = "aster-quoted-wrapper";

  const toggle_btn = doc.createElement("button");

  toggle_btn.className = "aster-quote-toggle";
  toggle_btn.setAttribute("type", "button");
  toggle_btn.textContent = "•••";
  toggle_btn.setAttribute("title", show_trimmed_label);
  toggle_btn.setAttribute("aria-label", show_trimmed_label);

  const content_div = doc.createElement("div");

  content_div.className = "aster-quoted-content";
  content_div.setAttribute("style", "display:none");

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

  wrapper.appendChild(toggle_btn);
  wrapper.appendChild(content_div);
  body.appendChild(wrapper);
}

function collapse_empty_block_runs(doc: Document): void {
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

function unblock_remote_content(doc: Document, proxy_base: string): void {
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
  });

  doc.querySelectorAll("img[alt='[Click to load image]']").forEach((el) => {
    el.setAttribute("alt", "");
  });

  doc
    .querySelectorAll("span.blocked-image[data-original-src]")
    .forEach((span) => {
      const original_src = span.getAttribute("data-original-src") || "";
      const img = doc.createElement("img");

      img.setAttribute(
        "src",
        `${proxy_base}?url=${encodeURIComponent(original_src)}`,
      );

      const w = span.getAttribute("data-width");
      const h = span.getAttribute("data-height");
      const s = span.getAttribute("data-style");

      if (w) img.setAttribute("width", w);
      if (h) img.setAttribute("height", h);
      if (s) img.setAttribute("style", s);

      span.parentNode?.replaceChild(img, span);
    });
}

export function pre_process_email_html(
  body_html: string,
  options: PreProcessOptions,
): string {
  const doc = new DOMParser().parseFromString(
    `<!DOCTYPE html><html><body>${body_html}</body></html>`,
    "text/html",
  );

  if (options.load_remote_content) {
    unblock_remote_content(doc, options.proxy_base);
  }

  collapse_forwarded_content(
    doc,
    options.forwarded_label,
    options.show_trimmed_label,
  );
  collapse_quoted_replies(doc, options.show_trimmed_label);
  if (!options.preserve_formatting) {
    collapse_empty_block_runs(doc);
  }

  return doc.body ? doc.body.innerHTML : body_html;
}
