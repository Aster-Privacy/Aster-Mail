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
type WhitespaceMode = "collapse" | "preserve" | "preserve_breaks";

type MarkerKind = "start" | "end" | "break" | "content";

interface MarkerToken {
  kind: MarkerKind;
  text?: string;
}

interface WordToken {
  kind: "word";
  text: string;
}

interface SpaceToken {
  kind: "space";
  pieces: string[];
  index: number;
  has_line_break: boolean;
  plain_breaks: number;
}

export interface SourceWhitespaceOptions {
  plain_text?: string;
}

interface CollectState {
  tokens: Token[];
  piece_owners: Map<Text, string[]>;
  break_nodes: Set<Text>;
}

type Token = MarkerToken | WordToken | SpaceToken;

const ASCII_WHITESPACE_RUN = /[\t\n\f\r ]+/;
const ASCII_WHITESPACE_SPLIT = /([\t\n\f\r ]+)/;
const LINE_BREAK_CHAR = /[\n\r]/;
const LINE_BREAK_SEQUENCE = /\r\n?|\n/g;
const ANY_WHITESPACE = /\s/;
const MIN_PLAIN_SKIP_BUDGET = 24;
const PRESERVE_BREAKS_VALUE = /\b(?:pre-line|preserve-breaks)\b/;
const COLLAPSE_VALUE = /\b(?:normal|nowrap|collapse)\b/;
const PRESERVE_VALUE =
  /\b(?:pre|pre-wrap|break-spaces|preserve|preserve-spaces)\b/;

const PRESERVING_TAGS = new Set([
  "PRE",
  "TEXTAREA",
  "LISTING",
  "XMP",
  "PLAINTEXT",
]);

const BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "BODY",
  "CAPTION",
  "CENTER",
  "COL",
  "COLGROUP",
  "DD",
  "DETAILS",
  "DIALOG",
  "DIV",
  "DL",
  "DT",
  "FIELDSET",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "LI",
  "LISTING",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PLAINTEXT",
  "PRE",
  "SECTION",
  "SUMMARY",
  "TABLE",
  "TBODY",
  "TD",
  "TFOOT",
  "TH",
  "THEAD",
  "TR",
  "UL",
  "XMP",
]);

const ATOMIC_INLINE_TAGS = new Set([
  "AUDIO",
  "BUTTON",
  "CANVAS",
  "EMBED",
  "IFRAME",
  "IMG",
  "INPUT",
  "OBJECT",
  "SELECT",
  "SVG",
  "TEXTAREA",
  "VIDEO",
]);

const FRAGMENT_START_MARKER = "StartFragment";
const FRAGMENT_END_MARKER = "EndFragment";

const SKIPPED_TAGS = new Set(["SCRIPT", "STYLE", "TEMPLATE", "HEAD", "TITLE"]);

function last_declaration_value(
  style: string,
  property_pattern: string,
): string | null {
  const pattern = new RegExp(
    `(?:^|;)\\s*(${property_pattern})\\s*:\\s*([^;]*)`,
    "gi",
  );
  let value: string | null = null;

  for (const match of style.matchAll(pattern)) {
    value = match[2]
      .replace(/!\s*important/i, "")
      .trim()
      .toLowerCase();
  }

  return value;
}

function mode_from_style(style: string): WhitespaceMode | null {
  const value = last_declaration_value(
    style,
    "white-space|white-space-collapse",
  );

  if (!value) return null;
  if (PRESERVE_BREAKS_VALUE.test(value)) return "preserve_breaks";
  if (PRESERVE_VALUE.test(value)) return "preserve";
  if (COLLAPSE_VALUE.test(value)) return "collapse";

  return null;
}

function element_mode(el: Element, inherited: WhitespaceMode): WhitespaceMode {
  const from_style = mode_from_style(el.getAttribute("style") || "");

  if (from_style) return from_style;
  if (PRESERVING_TAGS.has(el.tagName.toUpperCase())) return "preserve";

  return inherited;
}

function element_is_block(el: Element): boolean {
  const display = last_declaration_value(
    el.getAttribute("style") || "",
    "display",
  );
  const tag = el.tagName.toUpperCase();

  if (display) {
    if (display.startsWith("inline") || display === "contents") return false;
    if (display === "none") return false;
    if (/^(?:block|flex|grid|flow-root|list-item|table)/.test(display)) {
      return true;
    }
  }

  return BLOCK_TAGS.has(tag);
}

function collapse_pre_line(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f ]+/g, " ")
    .replace(/ ?\n ?/g, "\n");
}

function push_marker(tokens: Token[], kind: MarkerKind): void {
  const previous = tokens[tokens.length - 1];

  if (kind === "break" && previous?.kind === "break") return;
  tokens.push({ kind });
}

function tokenize_text(node: Text, state: CollectState): void {
  const { tokens, piece_owners } = state;
  const data = node.data;

  if (!ASCII_WHITESPACE_RUN.test(data)) {
    if (data) tokens.push({ kind: "word", text: data });

    return;
  }

  const pieces = data.split(ASCII_WHITESPACE_SPLIT);

  piece_owners.set(node, pieces);

  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];

    if (!piece) continue;

    if (i % 2 === 1) {
      tokens.push({
        kind: "space",
        pieces,
        index: i,
        has_line_break: LINE_BREAK_CHAR.test(piece),
        plain_breaks: 0,
      });
    } else {
      tokens.push({ kind: "word", text: piece });
    }
  }
}

function collect_tokens(
  node: Node,
  mode: WhitespaceMode,
  in_preformatted_tag: boolean,
  state: CollectState,
): void {
  const { tokens } = state;

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node as Text;

    if (mode === "collapse") {
      tokenize_text(text, state);
    } else if (text.data) {
      if (mode === "preserve_breaks") {
        text.data = collapse_pre_line(text.data);
      } else if (!in_preformatted_tag) {
        text.data = keep_preserved_spaces(text.data);
      }
      if (
        !in_preformatted_tag &&
        LINE_BREAK_CHAR.test(text.data) &&
        !(!text.data.trim() && sits_beside_block(text))
      ) {
        state.break_nodes.add(text);
      }
      tokens.push({ kind: "content", text: text.data });
    }

    return;
  }

  if (node.nodeType === Node.COMMENT_NODE) {
    const marker = (node as Comment).data.trim();

    if (marker === FRAGMENT_START_MARKER) tokens.push({ kind: "start" });
    if (marker === FRAGMENT_END_MARKER) tokens.push({ kind: "end" });

    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const el = node as Element;
  const tag = el.tagName.toUpperCase();

  if (SKIPPED_TAGS.has(tag)) return;

  if (tag === "BR") {
    push_marker(tokens, "break");

    return;
  }

  const is_block = element_is_block(el);

  if (ATOMIC_INLINE_TAGS.has(tag) && !is_block) {
    tokens.push({ kind: "content" });

    return;
  }

  if (is_block) push_marker(tokens, "break");

  const child_mode = element_mode(el, mode);
  const child_in_preformatted =
    in_preformatted_tag || PRESERVING_TAGS.has(tag);

  for (const child of Array.from(el.childNodes)) {
    collect_tokens(child, child_mode, child_in_preformatted, state);
  }

  if (tag === "HR" || ATOMIC_INLINE_TAGS.has(tag)) {
    tokens.push({ kind: "content" });
  }

  if (is_block) push_marker(tokens, "break");
}

function resolve_space_runs(tokens: Token[]): void {
  let i = 0;

  while (i < tokens.length) {
    if (tokens[i].kind !== "space") {
      i++;
      continue;
    }

    const run_start = i;

    while (i < tokens.length && tokens[i].kind === "space") i++;

    const run = tokens.slice(run_start, i) as SpaceToken[];
    const before = tokens[run_start - 1]?.kind ?? "start";
    const after = tokens[i]?.kind ?? "end";
    const has_line_break = run.some((token) => token.has_line_break);
    const plain_breaks = Math.min(
      Math.max(...run.map((token) => token.plain_breaks)),
      run.reduce(
        (total, token) => total + count_line_breaks(token.pieces[token.index]),
        0,
      ),
    );
    const at_line_boundary = before === "break" || after === "break";
    const before_edge = before === "start" || before === "end";
    const after_edge = after === "start" || after === "end";
    const outside_fragment = before_edge && after_edge;
    const at_fragment_edge = before_edge || after_edge;
    const keep_one =
      !at_line_boundary &&
      !outside_fragment &&
      !(at_fragment_edge && has_line_break);

    const keep_breaks =
      has_line_break &&
      plain_breaks > 0 &&
      !at_line_boundary &&
      !at_fragment_edge;
    const first_piece = keep_breaks
      ? "\n".repeat(plain_breaks)
      : keep_one
        ? " "
        : "";

    run.forEach((token, position) => {
      token.pieces[token.index] = position === 0 ? first_piece : "";
    });
  }
}

function keep_preserved_spaces(text: string): string {
  return text
    .replace(/(^|[\r\n]) /g, "$1\u00A0")
    .replace(/ {2}/g, " \u00A0");
}

function count_line_breaks(text: string): number {
  return text.match(LINE_BREAK_SEQUENCE)?.length ?? 0;
}

function apply_plain_text_breaks(tokens: Token[], plain_text: string): void {
  const normalized = plain_text.replace(LINE_BREAK_SEQUENCE, "\n");
  const plain_chars: string[] = [];
  const breaks_before: number[] = [];
  let pending_breaks = 0;

  for (const char of normalized) {
    if (char === "\n") {
      pending_breaks += 1;
    } else if (!ANY_WHITESPACE.test(char)) {
      plain_chars.push(char);
      breaks_before.push(pending_breaks);
      pending_breaks = 0;
    }
  }

  const matches: { spaces: SpaceToken[]; plain_index: number }[] = [];
  let html_char_count = 0;
  let skipped = 0;
  let cursor = 0;
  let pending_spaces: SpaceToken[] = [];

  for (const token of tokens) {
    if (token.kind === "space") {
      pending_spaces.push(token);
      continue;
    }

    if (!token.text) continue;

    for (const char of token.text) {
      if (ANY_WHITESPACE.test(char)) continue;

      html_char_count += 1;

      while (cursor < plain_chars.length && plain_chars[cursor] !== char) {
        cursor += 1;
        skipped += 1;
      }

      if (cursor >= plain_chars.length) return;

      if (pending_spaces.length > 0) {
        matches.push({ spaces: pending_spaces, plain_index: cursor });
        pending_spaces = [];
      }
      cursor += 1;
    }
  }

  const budget = Math.max(
    MIN_PLAIN_SKIP_BUDGET,
    Math.ceil(html_char_count * 0.1),
  );

  if (html_char_count === 0 || skipped > budget) return;

  for (const { spaces, plain_index } of matches) {
    for (const space of spaces) {
      space.plain_breaks = breaks_before[plain_index];
    }
  }
}

function replace_line_breaks_with_elements(node: Text): void {
  const parent = node.parentNode;

  if (!parent) return;

  const doc = node.ownerDocument;
  const fragment = doc.createDocumentFragment();
  const lines = node.data.replace(LINE_BREAK_SEQUENCE, "\n").split("\n");

  lines.forEach((line, index) => {
    if (index > 0) fragment.appendChild(doc.createElement("br"));
    if (line) fragment.appendChild(doc.createTextNode(line));
  });

  parent.replaceChild(fragment, node);
}

export function collapse_source_whitespace(
  root: HTMLElement,
  options: SourceWhitespaceOptions = {},
): void {
  const state: CollectState = {
    tokens: [{ kind: "start" }],
    piece_owners: new Map<Text, string[]>(),
    break_nodes: new Set<Text>(),
  };

  const root_mode = element_mode(root, "collapse");

  for (const child of Array.from(root.childNodes)) {
    collect_tokens(
      child,
      root_mode,
      PRESERVING_TAGS.has(root.tagName.toUpperCase()),
      state,
    );
  }
  state.tokens.push({ kind: "end" });

  if (options.plain_text) {
    apply_plain_text_breaks(state.tokens, options.plain_text);
  }

  resolve_space_runs(state.tokens);

  for (const [node, pieces] of state.piece_owners) {
    const next = pieces.join("");

    if (next) {
      if (next !== node.data) node.data = next;
      if (LINE_BREAK_CHAR.test(next)) state.break_nodes.add(node);
    } else {
      node.parentNode?.removeChild(node);
    }
  }

  for (const node of state.break_nodes) {
    if (node.parentNode) replace_line_breaks_with_elements(node);
  }
}

function remove_fragment_markers(root: HTMLElement): void {
  const walker = root.ownerDocument.createTreeWalker(
    root,
    NodeFilter.SHOW_COMMENT,
  );
  const markers: Comment[] = [];

  while (walker.nextNode()) {
    const comment = walker.currentNode as Comment;
    const marker = comment.data.trim();

    if (marker === FRAGMENT_START_MARKER || marker === FRAGMENT_END_MARKER) {
      markers.push(comment);
    }
  }

  for (const marker of markers) marker.parentNode?.removeChild(marker);
}

export function collapse_source_whitespace_html(
  html: string,
  options: SourceWhitespaceOptions = {},
): string {
  if (!html || typeof html !== "string") return "";

  const doc = new DOMParser().parseFromString(html, "text/html");

  collapse_source_whitespace(doc.body, options);
  remove_fragment_markers(doc.body);

  return doc.body.innerHTML;
}

const EDITOR_QUOTE_CLASS = "aster_quote";

function sits_beside_block(node: Node): boolean {
  const neighbors = [node.previousSibling, node.nextSibling];

  return neighbors.some(
    (neighbor) =>
      neighbor?.nodeType === Node.ELEMENT_NODE &&
      element_is_block(neighbor as Element),
  );
}

function collect_editor_break_nodes(
  node: Node,
  mode: WhitespaceMode,
  nodes: Text[],
): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const data = (node as Text).data;

    if (
      mode !== "collapse" &&
      LINE_BREAK_CHAR.test(data) &&
      !(!data.trim() && sits_beside_block(node))
    ) {
      nodes.push(node as Text);
    }

    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const el = node as Element;
  const tag = el.tagName.toUpperCase();

  if (
    SKIPPED_TAGS.has(tag) ||
    PRESERVING_TAGS.has(tag) ||
    tag === "BLOCKQUOTE" ||
    el.classList.contains(EDITOR_QUOTE_CLASS)
  ) {
    return;
  }

  const child_mode = element_mode(el, mode);

  for (const child of Array.from(el.childNodes)) {
    collect_editor_break_nodes(child, child_mode, nodes);
  }
}

export function editor_text_breaks_to_elements(html: string): string {
  if (!html || !LINE_BREAK_CHAR.test(html)) return html;

  const template = document.createElement("template");

  template.innerHTML = html;

  const nodes: Text[] = [];

  for (const child of Array.from(template.content.childNodes)) {
    collect_editor_break_nodes(child, "preserve", nodes);
  }

  if (nodes.length === 0) return html;

  for (const node of nodes) replace_line_breaks_with_elements(node);

  return template.innerHTML;
}
