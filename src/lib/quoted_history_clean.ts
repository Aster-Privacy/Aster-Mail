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
const PROVIDER_MARKUP_RE = /protonmail_/i;
const PROVIDER_CLASS_RE = /^protonmail_/i;
const BLANK_BLOCK_TAGS = new Set(["DIV", "P", "SPAN", "FONT"]);
const KEEP_CONTENT_SELECTOR =
  "img,video,picture,svg,hr,table,iframe,object,embed,input,button";
const INLINE_TAGS = new Set([
  "A",
  "B",
  "I",
  "U",
  "S",
  "EM",
  "STRONG",
  "SPAN",
  "FONT",
  "CODE",
  "SMALL",
  "SUB",
  "SUP",
  "MARK",
]);
const INVISIBLE_CHARS_RE = /[\u200b\u200c\u200d\u2060\ufeff\u00a0]/g;

function has_visible_text(node: Node): boolean {
  return (
    (node.textContent || "").replace(INVISIBLE_CHARS_RE, "").trim().length > 0
  );
}

function is_element(node: Node, tag?: string): node is Element {
  return (
    node.nodeType === Node.ELEMENT_NODE &&
    (!tag || (node as Element).tagName === tag)
  );
}

function is_blank_node(node: Node): boolean {
  if (node.nodeType === Node.COMMENT_NODE) return true;
  if (node.nodeType === Node.TEXT_NODE) return !has_visible_text(node);
  if (!is_element(node)) return false;
  if (node.tagName === "BR") return true;
  if (!BLANK_BLOCK_TAGS.has(node.tagName)) return false;
  if (has_visible_text(node)) return false;

  return !node.querySelector(KEEP_CONTENT_SELECTOR);
}

function is_hidden_element(el: Element): boolean {
  const style = (el.getAttribute("style") || "").toLowerCase();

  return (
    el.hasAttribute("hidden") ||
    /display\s*:\s*none/.test(style) ||
    /visibility\s*:\s*hidden/.test(style)
  );
}

function remove_with_leading_blanks(el: Element): void {
  let prev: Node | null = el.previousSibling;

  while (prev && (is_blank_node(prev) || is_element(prev, "HR"))) {
    const next_prev: Node | null = prev.previousSibling;

    prev.parentNode?.removeChild(prev);
    prev = next_prev;
  }
  el.parentNode?.removeChild(el);
}

function strip_provider_classes(root: Element): void {
  root.querySelectorAll("[class]").forEach((el) => {
    const kept = Array.from(el.classList).filter(
      (name) => !PROVIDER_CLASS_RE.test(name),
    );

    if (kept.length === el.classList.length) return;
    if (kept.length) {
      el.setAttribute("class", kept.join(" "));
    } else {
      el.removeAttribute("class");
    }
  });
}

function is_inline_content(node: Node | null): boolean {
  if (!node) return false;
  if (node.nodeType === Node.TEXT_NODE) return has_visible_text(node);

  return is_element(node) && INLINE_TAGS.has(node.tagName);
}

function collapse_blank_runs(container: Element): void {
  const children = Array.from(container.childNodes);
  let index = 0;

  while (index < children.length) {
    if (!is_blank_node(children[index])) {
      index++;
      continue;
    }
    const run_start = index;

    while (index < children.length && is_blank_node(children[index])) {
      index++;
    }
    const run = children.slice(run_start, index);
    const before = run_start > 0 ? children[run_start - 1] : null;
    const at_edge = run_start === 0 || index === children.length;
    const visual = run.filter(
      (node) => is_element(node) || node.nodeType === Node.COMMENT_NODE,
    );
    const only_breaks = visual.every((node) => is_element(node, "BR"));
    const allowed = at_edge
      ? 0
      : only_breaks && is_inline_content(before)
        ? 2
        : 1;
    let kept = 0;

    for (const node of visual) {
      if (node.nodeType !== Node.COMMENT_NODE && kept < allowed) {
        kept++;
        continue;
      }
      node.parentNode?.removeChild(node);
    }
  }

  Array.from(container.children)
    .filter((child) => !["PRE", "TEXTAREA", "TABLE"].includes(child.tagName))
    .forEach((child) => collapse_blank_runs(child));
}

export function clean_quoted_history_html(html: string): string {
  if (!html) return html;
  if (!PROVIDER_MARKUP_RE.test(html)) return convert_plain_quote_html(html);

  const doc = new DOMParser().parseFromString(
    `<!DOCTYPE html><html><body>${html}</body></html>`,
    "text/html",
  );
  const body = doc.body;

  if (!body) return html;

  body
    .querySelectorAll(".protonmail_signature_block-empty")
    .forEach((el) => el.remove());
  body.querySelectorAll(".protonmail_quote").forEach((el) => {
    if (el.isConnected) remove_with_leading_blanks(el);
  });
  body.querySelectorAll("*").forEach((el) => {
    if (el.isConnected && is_hidden_element(el)) el.remove();
  });
  strip_provider_classes(body);
  collapse_blank_runs(body);
  convert_plain_quote_markup(body);

  return body.innerHTML;
}

export const MAX_PLAIN_QUOTE_DEPTH = 8;

const PLAIN_QUOTE_STYLE =
  "margin:0 0 0 0.8ex;border-left:1px solid #ccc;padding-left:1ex";

const LINE_BREAK_RE = /\r\n|\r|\n/;

const INVISIBLE_CHAR_RE = /[​‌‍⁠﻿ ]/;

const QUOTE_INLINE_TAGS = new Set([
  ...INLINE_TAGS,
  "ABBR",
  "BDI",
  "BDO",
  "BIG",
  "CITE",
  "DEL",
  "DFN",
  "IMG",
  "INS",
  "KBD",
  "LABEL",
  "Q",
  "SAMP",
  "STRIKE",
  "TIME",
  "TT",
  "VAR",
  "WBR",
]);

const QUOTE_CONTAINER_SELECTOR =
  "p,div,blockquote,td,th,li,section,article,header,footer,main,center";

const QUOTE_SKIP_SELECTOR = "pre,code,textarea,script,style,template";

export interface PlainQuoteMarker {
  depth: number;
  strict: boolean;
  content_start: number;
}

export function read_plain_quote_marker(
  line: string,
  start = 0,
): PlainQuoteMarker | null {
  let index = start;
  let depth = 0;

  while (index < line.length && line.charCodeAt(index) === 62) {
    depth += 1;
    index += 1;
    if (line.charCodeAt(index) === 32 && line.charCodeAt(index + 1) === 62) {
      index += 1;
    }
  }

  if (depth === 0) return null;

  const next = line.charCodeAt(index);
  const spaced = next === 32 || next === 9;

  return {
    depth: Math.min(depth, MAX_PLAIN_QUOTE_DEPTH),
    strict: index >= line.length || spaced || depth > 1,
    content_start: spaced ? index + 1 : index,
  };
}

export interface QuoteLine<T> {
  marker: PlainQuoteMarker | null;
  blank: boolean;
  content: T;
}

export interface QuoteParagraph<T> {
  kind: "paragraph";
  lines: T[];
}

export interface QuoteBlock<T> {
  kind: "block";
  children: QuoteNode<T>[];
}

export type QuoteNode<T> = QuoteParagraph<T> | QuoteBlock<T>;

export type QuoteSegment<T> =
  | { kind: "text"; lines: T[] }
  | { kind: "quote"; block: QuoteBlock<T>; source: T[] };

function prune_empty_blocks<T>(block: QuoteBlock<T>): void {
  block.children = block.children.filter((child) => {
    if (child.kind === "paragraph") return child.lines.length > 0;
    prune_empty_blocks(child);

    return child.children.length > 0;
  });
}

export function build_quote_tree<T>(lines: QuoteLine<T>[]): QuoteBlock<T> {
  const root: QuoteBlock<T> = { kind: "block", children: [] };
  const stack: QuoteBlock<T>[] = [root];
  let paragraph: QuoteParagraph<T> | null = null;
  let pending_break = false;

  for (const line of lines) {
    if (line.blank) {
      pending_break = true;
      continue;
    }

    const depth = line.marker ? line.marker.depth : 1;

    if (depth !== stack.length) {
      while (stack.length > depth) stack.pop();
      while (stack.length < depth) {
        const nested: QuoteBlock<T> = { kind: "block", children: [] };

        stack[stack.length - 1].children.push(nested);
        stack.push(nested);
      }
      paragraph = null;
      pending_break = false;
    }

    const current = stack[stack.length - 1];
    const last = current.children[current.children.length - 1];

    if (pending_break || !paragraph || last !== paragraph) {
      paragraph = { kind: "paragraph", lines: [] };
      current.children.push(paragraph);
    }
    pending_break = false;
    paragraph.lines.push(line.content);
  }

  prune_empty_blocks(root);

  return root;
}

function run_qualifies<T>(run: QuoteLine<T>[]): boolean {
  return run.length > 1 || run.some((line) => line.marker?.strict);
}

export function segment_quote_lines<T>(
  lines: QuoteLine<T>[],
  strip: (line: QuoteLine<T>) => T,
): QuoteSegment<T>[] {
  const segments: QuoteSegment<T>[] = [];
  let text_lines: T[] = [];
  let index = 0;

  const flush_text = () => {
    if (text_lines.length) segments.push({ kind: "text", lines: text_lines });
    text_lines = [];
  };

  while (index < lines.length) {
    if (!lines[index].marker) {
      text_lines.push(lines[index].content);
      index += 1;
      continue;
    }

    const run_start = index;

    while (index < lines.length && lines[index].marker) index += 1;

    const run = lines.slice(run_start, index);

    if (!run_qualifies(run)) {
      run.forEach((line) => text_lines.push(line.content));
      continue;
    }

    flush_text();

    const source = run.map((line) => line.content);
    const tree = build_quote_tree(
      run.map((line) => ({
        marker: line.marker,
        blank: line.blank,
        content: line.blank ? line.content : strip(line),
      })),
    );

    segments.push({ kind: "quote", block: tree, source });
  }

  flush_text();

  return segments;
}

function read_text_quote_line(line: string): QuoteLine<string> {
  const marker = read_plain_quote_marker(line);

  if (!marker) return { marker: null, blank: false, content: line };

  return {
    marker,
    blank:
      line
        .slice(marker.content_start)
        .replace(INVISIBLE_CHARS_RE, "")
        .trim().length === 0,
    content: line,
  };
}

function strip_text_marker(line: QuoteLine<string>): string {
  return line.marker
    ? line.content.slice(line.marker.content_start)
    : line.content;
}

export function segment_plain_quote_text(
  text: string,
): QuoteSegment<string>[] {
  return segment_quote_lines(
    text.split(LINE_BREAK_RE).map(read_text_quote_line),
    strip_text_marker,
  );
}

function has_quote_segment<T>(segments: QuoteSegment<T>[]): boolean {
  return segments.some((segment) => segment.kind === "quote");
}

export function has_plain_quote_lines(text: string): boolean {
  if (!text || text.indexOf(">") < 0) return false;

  return has_quote_segment(segment_plain_quote_text(text));
}

function flatten_quote_lines<T>(block: QuoteBlock<T>): T[] {
  return block.children.flatMap((child) =>
    child.kind === "block" ? flatten_quote_lines(child) : child.lines,
  );
}

export function strip_plain_quote_markers(text: string): string {
  if (!text || text.indexOf(">") < 0) return text;

  const segments = segment_plain_quote_text(text);

  if (!has_quote_segment(segments)) return text;

  return segments
    .flatMap((segment) =>
      segment.kind === "quote"
        ? flatten_quote_lines(segment.block)
        : segment.lines,
    )
    .join("\n");
}

interface DomLine {
  nodes: Node[];
  terminator: Element | null;
}

type DomItem = { line: DomLine } | { block: Node };

interface DomQuoteContent {
  line: DomLine;
  text: Text | null;
  offset: number;
}

function is_quote_inline(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) return true;
  if (node.nodeType === Node.COMMENT_NODE) return true;

  return is_element(node) && QUOTE_INLINE_TAGS.has(node.tagName);
}

function split_dom_items(container: ParentNode): DomItem[] {
  const items: DomItem[] = [];
  let current: DomLine = { nodes: [], terminator: null };

  const flush = (terminator: Element | null) => {
    if (current.nodes.length || terminator) {
      current.terminator = terminator;
      items.push({ line: current });
    }
    current = { nodes: [], terminator: null };
  };

  Array.from(container.childNodes).forEach((node) => {
    if (is_element(node, "BR")) {
      flush(node);
    } else if (is_quote_inline(node)) {
      current.nodes.push(node);
    } else {
      flush(null);
      items.push({ block: node });
    }
  });
  flush(null);

  return items;
}

function first_text_node(nodes: Node[]): Text | null {
  const pending: Node[] = [...nodes].reverse();

  while (pending.length) {
    const node = pending.pop() as Node;

    if (node.nodeType === Node.TEXT_NODE) {
      if (has_visible_text(node)) return node as Text;
      continue;
    }
    if (!is_element(node)) continue;
    if (node.tagName === "IMG" || node.matches(QUOTE_SKIP_SELECTOR)) {
      return null;
    }
    for (let i = node.childNodes.length - 1; i >= 0; i--) {
      pending.push(node.childNodes[i]);
    }
  }

  return null;
}

function leading_space_length(value: string): number {
  let index = 0;

  while (index < value.length) {
    const char = value[index];

    if (
      char !== " " &&
      char !== "\t" &&
      char !== "\n" &&
      char !== "\r" &&
      !INVISIBLE_CHAR_RE.test(char)
    ) {
      break;
    }
    index += 1;
  }

  return index;
}

function line_has_media(nodes: Node[]): boolean {
  return nodes.some(
    (node) =>
      is_element(node) &&
      (node.matches(KEEP_CONTENT_SELECTOR) ||
        !!node.querySelector(KEEP_CONTENT_SELECTOR)),
  );
}

function plain_dom_line(line: DomLine): QuoteLine<DomQuoteContent> {
  return { marker: null, blank: false, content: { line, text: null, offset: 0 } };
}

function read_dom_quote_line(line: DomLine): QuoteLine<DomQuoteContent> {
  const text = first_text_node(line.nodes);

  if (!text) return plain_dom_line(line);

  const start = leading_space_length(text.data);
  const marker = read_plain_quote_marker(text.data, start);

  if (!marker) return plain_dom_line(line);

  const full = line.nodes.map((node) => node.textContent || "").join("");
  const full_start = leading_space_length(full);
  const full_marker = read_plain_quote_marker(full, full_start);
  const rest = full_marker ? full.slice(full_marker.content_start) : "";
  const blank =
    rest.replace(INVISIBLE_CHARS_RE, "").trim().length === 0 &&
    !line_has_media(line.nodes);

  return {
    marker,
    blank,
    content: { line, text, offset: marker.content_start },
  };
}

function strip_dom_marker(line: QuoteLine<DomQuoteContent>): DomQuoteContent {
  const { text, offset } = line.content;

  if (text) text.data = text.data.slice(offset);

  return { ...line.content, text: null, offset: 0 };
}

function build_dom_block(
  doc: Document,
  block: QuoteBlock<DomQuoteContent>,
): HTMLElement {
  const quote = doc.createElement("blockquote");

  quote.setAttribute("type", "cite");
  quote.setAttribute("style", PLAIN_QUOTE_STYLE);
  block.children.forEach((child) => {
    if (child.kind === "block") {
      quote.appendChild(build_dom_block(doc, child));

      return;
    }
    const paragraph = doc.createElement("p");

    paragraph.setAttribute("dir", "auto");
    child.lines.forEach((content, index) => {
      if (index > 0) paragraph.appendChild(doc.createElement("br"));
      content.line.nodes.forEach((node) => paragraph.appendChild(node));
    });
    quote.appendChild(paragraph);
  });

  return quote;
}

function replace_quote_run(
  doc: Document,
  segment: QuoteSegment<DomQuoteContent>,
): boolean {
  if (segment.kind !== "quote") return false;

  const anchor = segment.source[0].line;
  const first = anchor.nodes[0] ?? anchor.terminator;
  const parent = first?.parentNode;

  if (!first || !parent) return false;

  const marker = doc.createComment("");

  parent.insertBefore(marker, first);
  const quote = segment.block.children.length
    ? build_dom_block(doc, segment.block)
    : null;

  segment.source.forEach((content) => {
    content.line.terminator?.remove();
    content.line.nodes.forEach((node) => {
      if (node.parentNode === parent) parent.removeChild(node);
    });
  });
  if (quote) {
    parent.replaceChild(quote, marker);
  } else {
    parent.removeChild(marker);
  }

  return true;
}

function convert_container(container: ParentNode, doc: Document): boolean {
  const lines: QuoteLine<DomQuoteContent>[] = [];
  let changed = false;

  const process_lines = () => {
    const batch = lines.splice(0, lines.length);

    if (!batch.some((line) => line.marker)) return;
    segment_quote_lines(batch, strip_dom_marker).forEach((segment) => {
      if (replace_quote_run(doc, segment)) changed = true;
    });
  };

  split_dom_items(container).forEach((item) => {
    if ("block" in item) {
      process_lines();

      return;
    }
    const has_marker_char = item.line.nodes.some((node) =>
      (node.textContent || "").includes(">"),
    );

    lines.push(
      has_marker_char ? read_dom_quote_line(item.line) : plain_dom_line(item.line),
    );
  });
  process_lines();

  return changed;
}

function split_paragraph_around_quotes(paragraph: Element): void {
  const parent = paragraph.parentNode;

  if (!parent) return;

  const replacements: Node[] = [];
  let group: Element | null = null;

  Array.from(paragraph.childNodes).forEach((node) => {
    if (is_element(node, "BLOCKQUOTE")) {
      group = null;
      replacements.push(node);

      return;
    }
    if (!group) {
      group = paragraph.cloneNode(false) as Element;
      replacements.push(group);
    }
    group.appendChild(node);
  });

  replacements
    .filter(
      (node) =>
        is_element(node, "BLOCKQUOTE") ||
        !Array.from(node.childNodes).every((child) => is_blank_node(child)),
    )
    .forEach((node) => parent.insertBefore(node, paragraph));
  parent.removeChild(paragraph);
}

const PLAIN_TEXT_WRAPPER_CLASSES = [
  "moz-text-plain",
  "moz-text-flowed",
  "plain-text",
  "plaintext",
  "text-plain",
];

const PRESERVED_WHITE_SPACE_RE = /^(pre|pre-wrap|pre-line|break-spaces)$/;

const WHITE_SPACE_DECLARATION_RE =
  /(?:^|;)\s*white-space\s*:\s*([a-z-]+)/i;

function inline_white_space(el: Element): string | null {
  const style = el.getAttribute("style");

  if (!style) return null;

  const match = WHITE_SPACE_DECLARATION_RE.exec(style);

  return match ? match[1].toLowerCase() : null;
}

function is_plain_text_wrapper(el: Element): boolean {
  const list = el.classList;

  return !!list && PLAIN_TEXT_WRAPPER_CLASSES.some((name) => list.contains(name));
}

function computed_white_space(el: Element): string | null {
  const view = el.ownerDocument?.defaultView;

  if (!view || !el.isConnected || typeof view.getComputedStyle !== "function") {
    return null;
  }
  try {
    return view.getComputedStyle(el).whiteSpace || null;
  } catch {
    return null;
  }
}

function preserves_newlines(
  node: ParentNode,
  root: Element | DocumentFragment,
  cache: Map<ParentNode, boolean>,
): boolean {
  const cached = cache.get(node);

  if (cached !== undefined) return cached;

  let result = false;

  if (is_element(node as Node)) {
    const el = node as Element;
    const own = inline_white_space(el);

    if (own) {
      result = PRESERVED_WHITE_SPACE_RE.test(own);
    } else if (is_plain_text_wrapper(el)) {
      result = true;
    } else {
      const computed = computed_white_space(el);
      const parent = el.parentNode;

      result =
        (!!computed && PRESERVED_WHITE_SPACE_RE.test(computed)) ||
        (node !== root && !!parent && preserves_newlines(parent, root, cache));
    }
  }
  cache.set(node, result);

  return result;
}

function split_bare_newlines(container: ParentNode, doc: Document): void {
  Array.from(container.childNodes).forEach((node) => {
    if (node.nodeType !== Node.TEXT_NODE) return;

    const data = (node as Text).data;

    if (data.indexOf("\n") < 0 || data.indexOf(">") < 0) return;

    const parts = data.replace(/\r\n?/g, "\n").split("\n");
    const fragment = doc.createDocumentFragment();

    parts.forEach((part, index) => {
      if (index > 0) fragment.appendChild(doc.createElement("br"));
      if (part) fragment.appendChild(doc.createTextNode(part));
    });
    container.replaceChild(fragment, node);
  });
}

export function convert_plain_quote_markup(
  root: Element | DocumentFragment,
): boolean {
  if (!(root.textContent || "").includes(">")) return false;

  const doc = root.ownerDocument;

  if (!doc) return false;

  const containers: ParentNode[] = [root];

  root.querySelectorAll(QUOTE_CONTAINER_SELECTOR).forEach((el) => {
    if (!el.closest(QUOTE_SKIP_SELECTOR)) containers.push(el);
  });

  const white_space_cache = new Map<ParentNode, boolean>();

  containers.forEach((container) => {
    if (preserves_newlines(container, root, white_space_cache)) {
      split_bare_newlines(container, doc);
    }
  });

  let changed = false;

  containers.forEach((container) => {
    if (!convert_container(container, doc)) return;
    changed = true;
    if (
      container !== root &&
      is_element(container as Node, "P") &&
      (container as Element).parentNode
    ) {
      split_paragraph_around_quotes(container as Element);
    }
  });

  return changed;
}

export function convert_plain_quote_html(html: string): string {
  if (!html || html.indexOf("&gt;") < 0 || typeof document === "undefined") {
    return html;
  }

  const template = document.createElement("template");

  template.innerHTML = html;

  return convert_plain_quote_markup(template.content)
    ? template.innerHTML
    : html;
}
