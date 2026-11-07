//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
type WhitespaceMode = "collapse" | "preserve" | "preserve_breaks";

type MarkerKind = "start" | "end" | "break" | "content";

interface MarkerToken {
  kind: MarkerKind;
}

interface WordToken {
  kind: "word";
}

interface SpaceToken {
  kind: "space";
  pieces: string[];
  index: number;
  has_line_break: boolean;
}

type Token = MarkerToken | WordToken | SpaceToken;

const ASCII_WHITESPACE_RUN = /[\t\n\f\r ]+/;
const ASCII_WHITESPACE_SPLIT = /([\t\n\f\r ]+)/;
const LINE_BREAK_CHAR = /[\n\r]/;
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

function tokenize_text(
  node: Text,
  tokens: Token[],
  piece_owners: Map<Text, string[]>,
): void {
  const data = node.data;

  if (!ASCII_WHITESPACE_RUN.test(data)) {
    if (data) tokens.push({ kind: "word" });

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
      });
    } else {
      tokens.push({ kind: "word" });
    }
  }
}

function collect_tokens(
  node: Node,
  mode: WhitespaceMode,
  tokens: Token[],
  piece_owners: Map<Text, string[]>,
): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node as Text;

    if (mode === "collapse") {
      tokenize_text(text, tokens, piece_owners);
    } else if (text.data) {
      if (mode === "preserve_breaks") {
        text.data = collapse_pre_line(text.data);
      }
      tokens.push({ kind: "content" });
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

  for (const child of Array.from(el.childNodes)) {
    collect_tokens(child, child_mode, tokens, piece_owners);
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
    const at_line_boundary = before === "break" || after === "break";
    const before_edge = before === "start" || before === "end";
    const after_edge = after === "start" || after === "end";
    const outside_fragment = before_edge && after_edge;
    const at_fragment_edge = before_edge || after_edge;
    const keep_one =
      !at_line_boundary &&
      !outside_fragment &&
      !(at_fragment_edge && has_line_break);

    run.forEach((token, position) => {
      token.pieces[token.index] = keep_one && position === 0 ? " " : "";
    });
  }
}

export function collapse_source_whitespace(root: HTMLElement): void {
  const tokens: Token[] = [{ kind: "start" }];
  const piece_owners = new Map<Text, string[]>();

  const root_mode = element_mode(root, "collapse");

  for (const child of Array.from(root.childNodes)) {
    collect_tokens(child, root_mode, tokens, piece_owners);
  }
  tokens.push({ kind: "end" });

  resolve_space_runs(tokens);

  for (const [node, pieces] of piece_owners) {
    const next = pieces.join("");

    if (next) {
      if (next !== node.data) node.data = next;
    } else {
      node.parentNode?.removeChild(node);
    }
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

export function collapse_source_whitespace_html(html: string): string {
  if (!html || typeof html !== "string") return "";

  const doc = new DOMParser().parseFromString(html, "text/html");

  collapse_source_whitespace(doc.body);
  remove_fragment_markers(doc.body);

  return doc.body.innerHTML;
}
