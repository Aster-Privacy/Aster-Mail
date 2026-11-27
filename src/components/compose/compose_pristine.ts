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
const BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "BR",
  "DD",
  "DIV",
  "DL",
  "DT",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "LI",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "TBODY",
  "TD",
  "TFOOT",
  "TH",
  "THEAD",
  "TR",
  "UL",
]);

const MEDIA_TAGS = new Set([
  "AUDIO",
  "CANVAS",
  "EMBED",
  "IFRAME",
  "IMG",
  "OBJECT",
  "PICTURE",
  "SVG",
  "VIDEO",
]);

const SKIPPED_TAGS = new Set(["SCRIPT", "STYLE", "TEMPLATE", "HEAD"]);

const MEDIA_TOKEN = " \u0001media\u0001 ";

const INVISIBLE_CHARACTERS = /[\u00a0\u200b\u200c\u200d\u2060\ufeff]/g;

export interface PristineComposeInput {
  recipients: { to: string[]; cc: string[]; bcc: string[] };
  subject: string;
  attachment_count: number;
  message: string;
  auto_inserted_bodies: string[];
}

export function normalize_compose_text(value: string): string {
  return value.replace(INVISIBLE_CHARACTERS, " ").replace(/\s+/g, " ").trim();
}

function collect_text(node: Node, parts: string[]): void {
  if (node.nodeType === 3) {
    parts.push(node.nodeValue ?? "");

    return;
  }

  if (node.nodeType !== 1) return;

  const tag = (node as Element).tagName.toUpperCase();

  if (SKIPPED_TAGS.has(tag)) return;

  if (MEDIA_TAGS.has(tag)) {
    parts.push(MEDIA_TOKEN);

    return;
  }

  const is_block = BLOCK_TAGS.has(tag);

  if (is_block) parts.push(" ");

  node.childNodes.forEach((child) => collect_text(child, parts));

  if (is_block) parts.push(" ");
}

export function compose_body_text(body: string): string {
  if (!body) return "";

  if (!/[<&]/.test(body)) return normalize_compose_text(body);

  if (typeof DOMParser === "undefined") {
    return normalize_compose_text(body.replace(/<[^>]*>/g, " "));
  }

  const doc = new DOMParser().parseFromString(body, "text/html");
  const parts: string[] = [];

  collect_text(doc.body, parts);

  return normalize_compose_text(parts.join(""));
}

export function is_body_pristine(
  message: string,
  auto_inserted_bodies: string[],
): boolean {
  const text = compose_body_text(message);

  if (text === "") return true;

  return auto_inserted_bodies.some(
    (auto_body) => !!auto_body && compose_body_text(auto_body) === text,
  );
}

export function is_compose_pristine(input: PristineComposeInput): boolean {
  if (
    input.recipients.to.length > 0 ||
    input.recipients.cc.length > 0 ||
    input.recipients.bcc.length > 0
  ) {
    return false;
  }

  if (input.subject.trim().length > 0) return false;

  if (input.attachment_count > 0) return false;

  return is_body_pristine(input.message, input.auto_inserted_bodies);
}
