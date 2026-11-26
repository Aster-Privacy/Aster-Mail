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
  has_aster_compose_markup,
  trim_trailing_empty_blocks,
} from "./dom_cleanup";

import { pre_process_email_html } from "@/components/email/email_pre_process";
import { sanitize_html } from "@/lib/html_sanitizer";

type translate_fn = Parameters<typeof collapse_forwarded_content>[1];

const t = ((key: string) => key) as unknown as translate_fn;

const SIGNATURE =
  '<div data-aster-signature="1">Best regards,<br>Aster Support</div>';

function render(html: string): Document {
  const doc = document.implementation.createHTMLDocument("");

  doc.body.innerHTML = sanitize_html(html, {
    external_content_mode: "never",
    sandbox_mode: true,
  }).html;

  collapse_forwarded_content(doc, t);
  collapse_quoted_replies(doc, t);
  collapse_empty_block_runs(doc);
  if (has_aster_compose_markup(doc)) trim_trailing_empty_blocks(doc);

  return doc;
}

describe("sent mail with trailing blank lines", () => {
  it("shows no quote toggle for a reply with an empty quote", () => {
    const doc = render(
      `<div>Hi,</div>${SIGNATURE}<div><br></div><br><br><div class="aster_quote"><div class="aster_quote_attr">On Mon, Bob wrote:</div><blockquote class="aster_quote_body"><div><br></div></blockquote></div>`,
    );

    expect(doc.body.querySelector(".aster-quote-toggle")).toBeNull();
    expect(doc.body.lastElementChild?.textContent).toBe(
      "Best regards,Aster Support",
    );
    expect(doc.body.innerHTML.endsWith("Aster Support</div>")).toBe(true);
  });

  it("trims empty blocks after the signature", () => {
    const doc = render(
      `<div>Hi,</div><div><br></div>${SIGNATURE}<div><br></div><div><br></div>`,
    );

    expect(doc.body.querySelector(".aster-quote-toggle")).toBeNull();
    expect(doc.body.innerHTML.endsWith("Aster Support</div>")).toBe(true);
  });

  it("trims empty blocks inside the signature", () => {
    const doc = render(
      '<div class="note">Hi,</div><div data-aster-signature="1">Best regards,<br>Aster Support<div><br></div><div><br></div></div>',
    );

    expect(doc.body.innerHTML.endsWith("Aster Support</div>")).toBe(true);
  });

  it("keeps the toggle for a reply with quoted content", () => {
    const doc = render(
      `<div>Hi,</div>${SIGNATURE}<br><br><div class="aster_quote"><div class="aster_quote_attr">On Mon, Bob wrote:</div><blockquote class="aster_quote_body"><div>Original text</div></blockquote></div>`,
    );

    expect(doc.body.querySelector(".aster-quote-toggle")).not.toBeNull();
    expect(
      doc.body.querySelector(".aster-quoted-content")?.textContent,
    ).toContain("Original text");
  });

  it("keeps blank lines inside the message", () => {
    const doc = render(
      `<div>Hi,</div><div><br></div><div><br></div><div>Thanks.</div>${SIGNATURE}`,
    );

    expect(
      doc.body.querySelectorAll("div:not([data-aster-signature]) > br").length,
    ).toBe(2);
    expect(doc.body.textContent).toContain("Aster Support");
  });

  it("leaves mail without Aster markup to the existing rules", () => {
    const doc = document.implementation.createHTMLDocument("");

    doc.body.innerHTML = '<div class="x">Hello</div><div><br></div>';

    expect(has_aster_compose_markup(doc)).toBe(false);
  });
});

describe("pre_process_email_html", () => {
  it("trims trailing blanks and the empty quote of Aster mail", () => {
    const html = pre_process_email_html(
      `<div>Hi,</div>${SIGNATURE}<div><br></div><br><br><div class="aster_quote"><div class="aster_quote_attr">On Mon, Bob wrote:</div><blockquote class="aster_quote_body"></blockquote></div>`,
      {
        forwarded_label: "Forwarded message",
        show_trimmed_label: "Show trimmed content",
        preserve_formatting: false,
        load_remote_content: false,
        proxy_base: "",
      },
    );

    expect(html).not.toContain("aster-quote-toggle");
    expect(html.endsWith("Aster Support</div>")).toBe(true);
  });
});
