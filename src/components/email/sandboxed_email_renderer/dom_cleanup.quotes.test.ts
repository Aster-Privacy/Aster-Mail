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

type translate_fn = Parameters<typeof collapse_forwarded_content>[1];

const t = ((key: string) =>
  key === "common.forwarded_message"
    ? "Forwarded message"
    : "Show trimmed content") as unknown as translate_fn;

function render(body_html: string): { html: string; doc: Document } {
  const doc = document.implementation.createHTMLDocument("");

  doc.body.innerHTML = body_html;

  collapse_forwarded_content(doc, t);
  collapse_quoted_replies(doc, t);
  collapse_empty_block_runs(doc);

  return { html: doc.body.innerHTML, doc };
}

function visible_text(doc: Document): string {
  const clone = doc.body.cloneNode(true) as HTMLElement;

  clone
    .querySelectorAll("details.aster-forwarded-collapse, .aster-quoted-wrapper")
    .forEach((el) => el.remove());

  return (clone.textContent || "").replace(/\s+/g, " ").trim();
}

function collapsed_text(doc: Document): string {
  const collapsed = doc.body.querySelector(
    ".aster-forwarded-content, .aster-quoted-content",
  );

  return ((collapsed?.textContent || "") as string).replace(/\s+/g, " ").trim();
}

describe("collapse_forwarded_content protonmail_quote", () => {
  it("keeps the forwarded original body inside the collapsed section", () => {
    const { doc } = render(
      `<div>FYI.</div><div>Sent from Proton Mail for iOS.</div><div class="protonmail_quote">-------- Original Message --------<br>On Wednesday, 08/12/26 at 08:50, Mr Yes &lt;mryes@gmail.com&gt; wrote:<br><br><blockquote class="protonmail_quote">Test</blockquote></div>`,
    );

    expect(visible_text(doc)).toBe("FYI.Sent from Proton Mail for iOS.");
    expect(visible_text(doc)).not.toContain("Test");
    expect(collapsed_text(doc)).toContain("-------- Original Message --------");
    expect(collapsed_text(doc)).toContain("Test");
  });

  it("keeps the replied-to original body inside the collapsed section", () => {
    const { doc } = render(
      `<div>Acknowledged.</div><div class="protonmail_signature_block">Sent from Proton Mail for iOS.</div><div class="protonmail_quote">-------- Original Message --------<br>On Tuesday, 08/11/26 at 15:12, mrx@astermail.org wrote:<br><br><blockquote class="protonmail_quote">Hello<br><br>Testing for reference.<br><br>Regards.</blockquote></div>`,
    );

    expect(visible_text(doc)).toBe("Acknowledged.");
    expect(visible_text(doc)).not.toContain("Testing for reference.");
    expect(collapsed_text(doc)).toContain("Testing for reference.");
    expect(collapsed_text(doc)).toContain("Regards.");
  });

  it("keeps the quoted message inside the collapse instead of hoisting it to the visible reply", () => {
    const { html, doc } = render(
      `<div>Hello!</div><div class="protonmail_quote">Sent with <a href="https://proton.me">Proton Mail</a> secure email.<br><br>On Wednesday, July 22nd, 2026 at 1:14 PM, findley@aster.cx &lt;findley@aster.cx&gt; wrote:<br><br><blockquote class="protonmail_quote">Hello from Aster!<br><br>Thanks,<br>Findley</blockquote></div>`,
    );

    expect(html).toContain("aster-forwarded-collapse");
    expect(visible_text(doc)).toBe("Hello!");
    expect(collapsed_text(doc)).toContain("Sent with");
    expect(collapsed_text(doc)).toContain("Hello from Aster!");
  });

  it("shows the forwarded body when the proton quote is the entire message", () => {
    const { html, doc } = render(
      `<div class="protonmail_quote">-------- Original Message --------<br>On Wednesday, 08/12/26 at 08:50, Mr Yes &lt;mryes@gmail.com&gt; wrote:<br><blockquote class="protonmail_quote">The forwarded body that must stay visible.</blockquote></div>`,
    );

    expect(html).not.toContain("aster-forwarded-collapse");
    expect(visible_text(doc)).toContain(
      "The forwarded body that must stay visible.",
    );
    expect(
      doc.body.querySelector<HTMLElement>("div.protonmail_quote")?.style
        .display,
    ).toBe("block");
    expect(
      doc.body.querySelector<HTMLElement>("blockquote.protonmail_quote")?.style
        .display,
    ).toBe("block");
  });

  it("collapses a proton quote that has no direct blockquote child", () => {
    const { html, doc } = render(
      `<div>Here you go.</div><div class="protonmail_quote">-------- Original Message --------<div>Nested original body.</div></div>`,
    );

    expect(html).toContain("aster-forwarded-collapse");
    expect(visible_text(doc)).toBe("Here you go.");
    expect(collapsed_text(doc)).toContain("Nested original body.");
  });
});

describe("collapse_forwarded_content plain-text markers", () => {
  it("collapses the quoted body under the forwarded marker", () => {
    const { html, doc } = render(
      `<div>See the message below.</div><div>---------- Forwarded message ---------</div><div>From: Someone &lt;a@b.com&gt;</div><div>Subject: Hi</div><div>The quoted original body.</div>`,
    );

    expect(html).toContain("aster-forwarded-collapse");
    expect(visible_text(doc)).toBe("See the message below.");
    expect(collapsed_text(doc)).toContain("The quoted original body.");
  });

  it("auto-expands a plain-text forward that is the entire message", () => {
    const { html } = render(
      `<div>---------- Forwarded message ---------<br>From: Someone &lt;a@b.com&gt;<br>Subject: Hi<br>The plain forwarded body.</div>`,
    );

    expect(html).toContain("aster-forwarded-collapse");
    expect(html).toMatch(/<details[^>]*\bopen\b/);
    expect(html).toContain("The plain forwarded body.");
  });

  it("keeps a plain-text forward collapsed when the user wrote a note above it", () => {
    const { html } = render(
      `<div>See the message below.</div><div>---------- Forwarded message ---------<br>From: Someone &lt;a@b.com&gt;<br>Subject: Hi</div>`,
    );

    expect(html).toContain("See the message below.");
    expect(html).toContain("aster-forwarded-collapse");
    expect(html).not.toMatch(/<details[^>]*\bopen\b/);
  });
});

describe("collapse_forwarded_content wrapper quotes", () => {
  it("does not collapse the body when the gmail_quote is the entire message", () => {
    const { html } = render(
      `<div dir="ltr"><br></div><div class="gmail_quote">---------- Forwarded message ---------<br>From: Someone &lt;a@b.com&gt;<br><br><div>The actual forwarded text that must stay visible.</div></div>`,
    );

    expect(html).toContain("The actual forwarded text that must stay visible.");
    expect(html).not.toContain("aster-quote-toggle");
    expect(html).toMatch(/class="gmail_quote"[^>]*style="display:\s*block;?"/);
  });

  it("does not collapse when an aster_quote forward is the entire message", () => {
    const { html } = render(
      `<div class="aster_quote">---------- Forwarded message ---------<br><div>In-app forwarded body that must stay visible.</div></div>`,
    );

    expect(html).toContain("In-app forwarded body that must stay visible.");
    expect(html).not.toContain("aster-quote-toggle");
    expect(html).not.toContain("display: none");
  });

  it("still collapses the gmail_quote when the user added a note above it", () => {
    const { html, doc } = render(
      `<div dir="ltr">Here you go, see below.</div><div class="gmail_quote">---------- Forwarded message ---------<br><div>Quoted history.</div></div>`,
    );

    expect(html).toContain("aster-quote-toggle");
    expect(visible_text(doc)).toBe("Here you go, see below.");
    expect(collapsed_text(doc)).toContain("Quoted history.");
  });

  it("does not blank the body for a reply that is only a quoted history", () => {
    const { html, doc } = render(
      `<div>On Mon, Jan 1, 2026 at 9:00 AM Someone &lt;a@b.com&gt; wrote:</div><blockquote>The entire prior conversation lives here.</blockquote>`,
    );

    expect(html).toContain("The entire prior conversation lives here.");
    expect(visible_text(doc)).toContain(
      "The entire prior conversation lives here.",
    );
  });

  it("does not leave the moz-cite-prefix attribution hidden when it is the entire message", () => {
    const { html } = render(
      `<div class="moz-cite-prefix">On 01/01/2026 9:00 AM, John wrote:<br></div><blockquote type="cite">Original Thunderbird message content.</blockquote>`,
    );

    expect(html).toContain("Original Thunderbird message content.");
    expect(html).toMatch(
      /class="moz-cite-prefix"[^>]*style="display:\s*block;?"/,
    );
  });

  it("still collapses quoted history when there is a real reply above it", () => {
    const { doc } = render(
      `<div>Thanks, that works for me.</div><div>On Mon, Jan 1, 2026 at 9:00 AM Someone &lt;a@b.com&gt; wrote:</div><blockquote>Old thread content.</blockquote>`,
    );

    expect(visible_text(doc)).toBe("Thanks, that works for me.");
    expect(collapsed_text(doc)).toContain("Old thread content.");
  });
});
