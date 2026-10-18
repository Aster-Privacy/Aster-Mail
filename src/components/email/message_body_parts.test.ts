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
import { describe, it, expect } from "vitest";

import {
  extract_preview_html,
  move_leading_footer_to_end,
} from "@/components/email/message_body_parts";
import { strip_reply_quotes } from "@/lib/strip_reply_quotes";

const FOOTER = 'Secured by <a href="https://astermail.org">Aster Mail</a>';

describe("move_leading_footer_to_end", () => {
  it("moves a leading footer after the body", () => {
    const result = move_leading_footer_to_end(
      `<br><br>${FOOTER}Are we still on?`,
    );

    expect(result.indexOf("Are we still on?")).toBeLessThan(
      result.indexOf("Secured by"),
    );
  });

  it("keeps the quoted section after the moved footer", () => {
    const result = move_leading_footer_to_end(
      `${FOOTER}Sounds good<blockquote>old text</blockquote>`,
    );

    expect(result.indexOf("Sounds good")).toBeLessThan(
      result.indexOf("Secured by"),
    );
    expect(result.indexOf("Secured by")).toBeLessThan(
      result.indexOf("<blockquote>"),
    );
  });

  it("leaves a body that already ends with the footer untouched", () => {
    const html = `<div>Hello</div><br><br>${FOOTER}`;

    expect(move_leading_footer_to_end(html)).toBe(html);
  });
});

describe("extract_preview_html", () => {
  it("drops the footer and the quoted reply", () => {
    const result = extract_preview_html(
      `<div>8 is perfect.</div><br><br>${FOOTER}<blockquote>On Fri someone wrote</blockquote>`,
    );

    expect(result).toContain("8 is perfect.");
    expect(result).not.toContain("Secured by");
    expect(result).not.toContain("On Fri");
  });

  it("strips a trailing footer from plain text", () => {
    expect(extract_preview_html("See you there\n\nSecured by Aster Mail")).toBe(
      "See you there",
    );
  });
});

const REFERENCE_FOOTER_LINK = String.raw`<a\b[^>]*\bhref\s*=\s*["']https:\/\/astermail\.org\/?["'][^>]*>\s*Aster Mail\s*<\/a>`;

const REFERENCE_LEADING_FOOTER_RE = new RegExp(
  String.raw`^\s*(?:<br\s*\/?>\s*)*([^<>]{0,60}?\s*${REFERENCE_FOOTER_LINK})`,
  "i",
);

const REFERENCE_ANY_FOOTER_RE = new RegExp(
  String.raw`(?:<br\s*\/?>\s*)+[^<>]{0,60}?\s*${REFERENCE_FOOTER_LINK}`,
  "gi",
);

const REFERENCE_QUOTE_START_RE =
  /<(?:blockquote\b|div\b[^>]*\bclass\s*=\s*["'][^"']*\b(?:aster_quote|gmail_quote|protonmail_quote|yahoo_quoted|moz-cite-prefix)\b)/i;

const REFERENCE_BLOCK_BREAK_RE =
  /<br\s*\/?>|<\/(?:div|p|li|h[1-6]|tr|table|blockquote|pre)>/gi;

function reference_has_visible_text(html: string): boolean {
  return html
    .split(/<[^>]*>/)
    .some((part) => part.replace(/&nbsp;/gi, " ").trim().length > 0);
}

function reference_split_at_quote(html: string): [string, string] {
  const match = REFERENCE_QUOTE_START_RE.exec(html);

  if (!match) return [html, ""];

  return [html.slice(0, match.index), html.slice(match.index)];
}

function reference_move_leading_footer_to_end(html: string): string {
  if (!html) return html;

  const match = REFERENCE_LEADING_FOOTER_RE.exec(html);

  if (!match) return html;

  const [head, quoted] = reference_split_at_quote(html.slice(match[0].length));

  if (!reference_has_visible_text(head)) return html;

  const body = head.replace(/^(?:\s|<br\s*\/?>)+/i, "");

  return `${body}<br><br>${match[1].trim()}${quoted}`;
}

function reference_preview_head(html: string): string {
  const [head] = reference_split_at_quote(html);
  const without_footer = head.replace(REFERENCE_ANY_FOOTER_RE, "");

  if (!reference_has_visible_text(without_footer)) {
    return html
      .replace(REFERENCE_ANY_FOOTER_RE, "")
      .replace(REFERENCE_BLOCK_BREAK_RE, (tag) => `${tag} `);
  }

  return strip_reply_quotes(
    without_footer.replace(REFERENCE_BLOCK_BREAK_RE, (tag) => `${tag} `),
  );
}

const FUZZ_TOKENS = [
  "<br>",
  "<BR />",
  "<br/>",
  "<br",
  " ",
  "  ",
  "\n",
  " ",
  "&nbsp;",
  "x",
  "Hi there",
  "a".repeat(30),
  "<",
  ">",
  '"',
  "'",
  '<a href="https://astermail.org">',
  "<a class='z' href='https://astermail.org/' id=1>",
  '<a href="https://example.org">',
  '<A HREF="https://astermail.org">',
  "Aster Mail",
  "aster mail",
  "</a>",
  "</A>",
  "Secured by ",
  '<div class="',
  "<div class='x ",
  '<div id=a class="',
  "<DIV CLASS='",
  "aster_quote",
  "gmail_quote",
  "moz-cite-prefix",
  "aster_quotex",
  "<blockquote>",
  "<blockquotex>",
  "<div>",
  "</div>",
  "<p>",
  "</p>",
];

function fuzz_html(next: () => number): string {
  const count = next() % 24;
  let html = "";

  for (let index = 0; index < count; index += 1) {
    html += FUZZ_TOKENS[next() % FUZZ_TOKENS.length];
  }

  return html;
}

function fuzz_generator(): () => number {
  let seed = 20261017;

  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;

    return seed >>> 4;
  };
}

describe("footer and quote scanning", () => {
  it("matches the original patterns on random markup", () => {
    const next = fuzz_generator();

    for (let round = 0; round < 40_000; round += 1) {
      const html = fuzz_html(next);

      expect(move_leading_footer_to_end(html)).toBe(
        reference_move_leading_footer_to_end(html),
      );
    }
  });

  it("matches the original preview on random markup", () => {
    const next = fuzz_generator();

    for (let round = 0; round < 40_000; round += 1) {
      const html = `<p>${fuzz_html(next)}`;

      expect(extract_preview_html(html)).toBe(reference_preview_head(html));
    }
  });

  it("stays fast on hostile markup", () => {
    const inputs = [
      " ".repeat(200_000),
      `<br>${" ".repeat(200_000)}`,
      `<br>${"\r".repeat(200_000)}`,
      `${"<br>".repeat(50_000)}x`,
      "<".repeat(200_000),
      "<div ".repeat(40_000),
      `<div class='${" a".repeat(100_000)}`,
      `<a href="https://astermail.org">${" ".repeat(200_000)}`,
      `<br><a ${'href="https://astermail.org/" '.repeat(7_000)}>`,
      `<br>${"x".repeat(60)}${" ".repeat(200_000)}<a href="https://astermail.org">`,
    ];

    for (const input of inputs) {
      const started = performance.now();

      move_leading_footer_to_end(input);
      extract_preview_html(input);

      expect(performance.now() - started).toBeLessThan(1_000);
    }
  });
});

describe("quote class scanning", () => {
  it("stays fast with many classed divs and one quote style", () => {
    const input = '<div class="x">a</div>'.repeat(40_000);
    const started = performance.now();

    extract_preview_html(input);
    move_leading_footer_to_end(
      `<a href="https://astermail.org">Aster Mail</a>x${input}`,
    );

    expect(performance.now() - started).toBeLessThan(1_000);
  });
});
