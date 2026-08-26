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
import { describe, expect, it } from "vitest";

import {
  collapse_empty_block_runs,
  collapse_forwarded_content,
  collapse_quoted_replies,
} from "./dom_cleanup";

import { sanitize_html } from "@/lib/html_sanitizer";

type translate_fn = Parameters<typeof collapse_forwarded_content>[1];

const t = ((key: string) =>
  key === "common.forwarded_message"
    ? "Forwarded message"
    : "Show trimmed content") as unknown as translate_fn;

function run(html: string, passes = 1): Document {
  const doc = document.implementation.createHTMLDocument("");

  doc.body.innerHTML = sanitize_html(html, {
    external_content_mode: "never",
    sandbox_mode: true,
  }).html;

  for (let i = 0; i < passes; i++) {
    collapse_forwarded_content(doc, t);
    collapse_quoted_replies(doc, t);
    collapse_empty_block_runs(doc);
  }

  return doc;
}

function visible_text(doc: Document): string {
  const clone = doc.body.cloneNode(true) as HTMLElement;

  clone
    .querySelectorAll("details.aster-forwarded-collapse, .aster-quoted-wrapper")
    .forEach((el) => el.remove());

  return (clone.textContent || "").replace(/\s+/g, " ").trim();
}

function collapsed_text(doc: Document): string {
  const el = doc.body.querySelector(
    ".aster-forwarded-content, .aster-quoted-content",
  );

  return (el?.textContent || "").replace(/\s+/g, " ").trim();
}

describe("quoted original stays out of the visible body", () => {
  it("collapses a reply whose quote carries no wrapper div", () => {
    const doc = run(
      `<div>Acknowledged.</div><div>-------- Original Message --------</div><div>On Tue, mrx@astermail.org wrote:</div><blockquote class="protonmail_quote" type="cite">Testing for reference.</blockquote>`,
    );

    expect(visible_text(doc)).toBe("Acknowledged.");
    expect(collapsed_text(doc)).toContain("Testing for reference.");
  });

  it("collapses a reply that uses only an attribution line and a blockquote", () => {
    const doc = run(
      `<div>Sounds good.</div><div>On 12 Aug 2026, at 08:50, Mr Yes &lt;mryes@gmail.com&gt; wrote:</div><blockquote type="cite">The original body.</blockquote>`,
    );

    expect(visible_text(doc)).toBe("Sounds good.");
    expect(collapsed_text(doc)).toContain("The original body.");
  });

  it("collapses when the sender's own message is an inline image and no text", () => {
    const doc = run(
      `<div><img src="cid:note@aster" alt=""></div><div class="protonmail_quote">-------- Original Message --------<br><blockquote class="protonmail_quote">Quoted original.</blockquote></div>`,
    );

    expect(
      doc.body.querySelector("details.aster-forwarded-collapse"),
    ).not.toBeNull();
    expect(visible_text(doc)).not.toContain("Quoted original.");
    expect(collapsed_text(doc)).toContain("Quoted original.");
  });

  it("produces the same result when the cleanup runs more than once", () => {
    const html = `<div>FYI.</div><div class="protonmail_signature_block">Sent from a phone.</div><div class="protonmail_quote">-------- Original Message --------<br><blockquote class="protonmail_quote">Test</blockquote></div>`;

    expect(run(html, 3).body.innerHTML).toBe(run(html, 1).body.innerHTML);
    expect(
      run(html, 3).body.querySelectorAll("details.aster-forwarded-collapse")
        .length,
    ).toBe(1);
  });
});
