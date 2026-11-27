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
  pre_process_email_html,
  type PreProcessOptions,
} from "./email_pre_process";

import { plain_text_to_html } from "@/lib/html_text";
import { clean_quoted_history_html } from "@/lib/quoted_history_clean";

const options: PreProcessOptions = {
  forwarded_label: "Forwarded message",
  show_trimmed_label: "Show trimmed content",
  preserve_formatting: false,
  load_remote_content: false,
  proxy_base: "https://proxy.example/img",
};

const ATTRIBUTION =
  "On Thursday, November 26th, 2026 at 6:21 PM, Sam Rivera &lt;sam@example.com&gt; wrote:";

const PROVIDER_REPLY = [
  '<div style="font-family: Arial, sans-serif; font-size: 14px;">howdy</div>',
  '<div style="font-family: Arial, sans-serif; font-size: 14px;"><br></div>',
  '<div class="protonmail_signature_block" style="font-family: Arial, sans-serif; font-size: 14px;">',
  '<div class="protonmail_signature_block-user protonmail_signature_block-empty"></div>',
  '<div class="protonmail_signature_block-proton">Sent with <a target="_blank" href="https://proton.me/mail/home">Proton Mail</a> secure email.</div>',
  "</div>",
  '<div style="font-family: Arial, sans-serif; font-size: 14px;"><br></div>',
  `<div class="protonmail_quote">${ATTRIBUTION}<br><br>`,
  '<blockquote class="protonmail_quote" type="cite">',
  "<div>hello</div><div><br></div><div>Sam</div>",
  "<div>This message may contain confidential information.</div>",
  "</blockquote><br></div>",
].join("");

const PROVIDER_REPLY_WITH_GAPS = [
  '<div style="font-family: Arial, sans-serif; font-size: 14px;">howdy</div>',
  '<div style="font-family: Arial, sans-serif; font-size: 14px;"><br></div>',
  '<div style="font-family: Arial, sans-serif; font-size: 14px;"><br></div>',
  '<div style="font-family: Arial, sans-serif; font-size: 14px;"><br></div>',
  "<p></p><br><br>",
  '<div class="protonmail_signature_block" style="font-family: Arial, sans-serif; font-size: 14px;">',
  '<div class="protonmail_signature_block-user protonmail_signature_block-empty"><div><br></div></div>',
  '<div class="protonmail_signature_block-proton">Sent with <a target="_blank" href="https://proton.me/mail/home">Proton Mail</a> secure email.</div>',
  "</div>",
  '<div style="font-family: Arial, sans-serif; font-size: 14px;"><br></div>',
  '<div style="display:none">hidden preview</div>',
  "<hr>",
  `<div class="protonmail_quote">${ATTRIBUTION}<br><br>`,
  '<blockquote class="protonmail_quote" type="cite"><div>hello</div></blockquote><br></div>',
  "<div><br></div><div><br></div>",
].join("");

const PROVIDER_REPLY_TEXT = [
  "howdy",
  "",
  "Sent with Proton Mail secure email.",
  "",
  "On Thursday, November 26th, 2026 at 6:21 PM, Sam Rivera <sam@example.com> wrote:",
  "",
  "> hello",
  ">",
  "> Sam",
  ">",
  "> This message may contain confidential information.",
  "",
].join("\r\n");

const PROVIDER_FORWARD = [
  "<div>See below.</div>",
  '<div class="protonmail_signature_block"><div class="protonmail_signature_block-proton">Sent with Proton Mail secure email.</div></div>',
  "<br>",
  '<div class="protonmail_quote">------- Forwarded Message -------<br>',
  "From: Sam Rivera &lt;sam@example.com&gt;<br>",
  "Date: On Thursday, November 26th, 2026 at 6:21 PM<br>",
  "Subject: Plans<br>",
  "To: Me &lt;me@example.com&gt;<br><br>",
  '<blockquote class="protonmail_quote" type="cite"><div>The forwarded body.</div></blockquote><br></div>',
].join("");

function aster_sent_reply(quoted_html: string): string {
  return `<div>t</div><br><br><div class="aster_quote"><div class="aster_quote_attr">On Thu, Nov 26, 2026, 6:22 PM, Sam Rivera &lt;sam@example.com&gt; wrote:</div><blockquote class="aster_quote_body" style="margin:0 0 0 0.8ex;border-left:1px solid #ccc;padding-left:1ex">${quoted_html}</blockquote></div>`;
}

function render(html: string): Document {
  return new DOMParser().parseFromString(
    pre_process_email_html(html, options),
    "text/html",
  );
}

function flat(text: string | null | undefined): string {
  return (text || "").replace(/\s+/g, " ").trim();
}

function visible_text(doc: Document): string {
  const clone = doc.body.cloneNode(true) as HTMLElement;

  clone
    .querySelectorAll("details.aster-forwarded-collapse, .aster-quoted-wrapper")
    .forEach((el) => el.remove());

  return flat(clone.textContent);
}

function quoted_text(doc: Document): string {
  return flat(doc.querySelector(".aster-quoted-content")?.textContent);
}

function parse_fragment(html: string): HTMLElement {
  const doc = new DOMParser().parseFromString(
    `<!DOCTYPE html><html><body>${html}</body></html>`,
    "text/html",
  );

  return doc.body;
}

function has_blank_run(root: Element): boolean {
  const is_blank = (node: ChildNode): boolean =>
    node.nodeType === Node.ELEMENT_NODE &&
    ["DIV", "P", "BR", "SPAN"].includes((node as Element).tagName) &&
    !flat(node.textContent) &&
    !(node as Element).querySelector("img,hr,table");
  const containers = [root, ...Array.from(root.querySelectorAll("*"))];

  return containers.some((container) => {
    const elements = Array.from(container.childNodes).filter(
      (node) => node.nodeType === Node.ELEMENT_NODE,
    );

    return elements.some(
      (node, i) =>
        i > 0 &&
        is_blank(node) &&
        is_blank(elements[i - 1]) &&
        (node as Element).tagName !== "BR",
    );
  });
}

describe("reply history from a provider quote wrapper", () => {
  it("collapses the history as quoted text instead of a forward", () => {
    const doc = render(PROVIDER_REPLY);

    expect(doc.querySelector("details.aster-forwarded-collapse")).toBeNull();
    expect(doc.body.innerHTML).not.toContain("Forwarded message");
    expect(doc.querySelector(".aster-quoted-wrapper")).not.toBeNull();
    expect(
      doc.querySelector(".aster-quoted-wrapper")?.hasAttribute("open"),
    ).toBe(false);
    expect(doc.querySelector(".aster-quote-toggle")).not.toBeNull();
  });

  it("keeps the sender's reply and signature visible above the toggle", () => {
    const doc = render(PROVIDER_REPLY);

    expect(visible_text(doc)).toContain("howdy");
    expect(visible_text(doc)).toContain("Sent with Proton Mail secure email.");
    expect(visible_text(doc)).not.toContain("hello");
    expect(quoted_text(doc)).not.toContain("Sent with");
  });

  it("puts the attribution and original inside the quote with its blockquote intact", () => {
    const doc = render(PROVIDER_REPLY);

    expect(quoted_text(doc)).toContain("wrote:");
    expect(quoted_text(doc)).toContain("hello");
    expect(quoted_text(doc)).toContain("confidential information");
    expect(
      doc.querySelector(".aster-quoted-content blockquote.protonmail_quote"),
    ).not.toBeNull();
  });

  it("draws no separator rule for the reply", () => {
    const doc = render(
      PROVIDER_REPLY.replace(
        '<div class="protonmail_quote">',
        '<hr><div class="protonmail_quote">',
      ),
    );

    expect(doc.querySelectorAll("hr").length).toBe(0);
    expect(doc.querySelector("details.aster-forwarded-collapse")).toBeNull();
  });

  it("keeps a horizontal rule that belongs to the reply body", () => {
    const doc = render(
      PROVIDER_REPLY.replace("howdy</div>", "howdy</div><hr><div>Agenda</div>"),
    );

    expect(doc.querySelectorAll("hr").length).toBe(1);
    expect(visible_text(doc)).toContain("Agenda");
  });

  it("moves a signature written inside the wrapper back to the reply", () => {
    const doc = render(
      `<div>Hello!</div><div class="protonmail_quote">Sent with <a href="https://proton.me">Proton Mail</a> secure email.<br><br>${ATTRIBUTION}<br><br><blockquote class="protonmail_quote">Hello from Aster!</blockquote></div>`,
    );

    expect(doc.querySelector("details.aster-forwarded-collapse")).toBeNull();
    expect(visible_text(doc)).toContain("Sent with Proton Mail secure email.");
    expect(visible_text(doc)).not.toContain("Hello from Aster!");
    expect(quoted_text(doc)).toContain("wrote:");
    expect(quoted_text(doc)).toContain("Hello from Aster!");
  });

  it("treats an original message header followed by an attribution as a reply", () => {
    const doc = render(
      `<div>Acknowledged.</div><div class="protonmail_signature_block">Sent from my phone.</div><div class="protonmail_quote">-------- Original Message --------<br>On Tuesday, 08/11/26 at 15:12, sam@example.com wrote:<br><br><blockquote class="protonmail_quote">Testing for reference.</blockquote></div>`,
    );

    expect(doc.querySelector("details.aster-forwarded-collapse")).toBeNull();
    expect(visible_text(doc)).toContain("Acknowledged.");
    expect(visible_text(doc)).toContain("Sent from my phone.");
    expect(quoted_text(doc)).toContain("Testing for reference.");
  });

  it("collapses the plain text alternative as quoted text", () => {
    const doc = render(plain_text_to_html(PROVIDER_REPLY_TEXT));

    expect(doc.querySelector("details.aster-forwarded-collapse")).toBeNull();
    expect(visible_text(doc)).toContain("howdy");
    expect(visible_text(doc)).toContain("Sent with Proton Mail secure email.");
    expect(visible_text(doc)).not.toContain("confidential information");
    expect(quoted_text(doc)).toContain("hello");
  });
});

describe("forwards from a provider quote wrapper", () => {
  it("still labels a real forward as forwarded", () => {
    const doc = render(PROVIDER_FORWARD);
    const details = doc.querySelector("details.aster-forwarded-collapse");

    expect(details).not.toBeNull();
    expect(details?.querySelector("summary")?.textContent).toBe(
      "Forwarded message",
    );
    expect(visible_text(doc)).toBe("See below.");
    expect(details?.textContent).toContain("The forwarded body.");
  });

  it("labels an original message header with from and subject lines as forwarded", () => {
    const doc = render(
      `<div>FYI.</div><div class="protonmail_quote">-------- Original Message --------<br>From: Sam &lt;sam@example.com&gt;<br>Date: Thursday<br>Subject: Plans<br><blockquote class="protonmail_quote">Body.</blockquote></div>`,
    );

    expect(
      doc.querySelector("details.aster-forwarded-collapse"),
    ).not.toBeNull();
  });
});

describe("our sent reply that quotes a provider message", () => {
  it("collapses our own quote without a forwarded label when the quote still holds provider markup", () => {
    const doc = render(aster_sent_reply(PROVIDER_REPLY));

    expect(doc.querySelector("details.aster-forwarded-collapse")).toBeNull();
    expect(doc.body.innerHTML).not.toContain("Forwarded message");
    expect(visible_text(doc)).toBe("t");
    expect(quoted_text(doc)).toContain("howdy");
    expect(
      doc.querySelector(".aster-quoted-content > .aster_quote"),
    ).not.toBeNull();
  });

  it("collapses our own quote built from the cleaned provider body", () => {
    const doc = render(
      aster_sent_reply(clean_quoted_history_html(PROVIDER_REPLY)),
    );

    expect(doc.querySelector("details.aster-forwarded-collapse")).toBeNull();
    expect(doc.querySelectorAll("hr").length).toBe(0);
    expect(visible_text(doc)).toBe("t");
    expect(quoted_text(doc)).toContain("howdy");
  });
});

describe("clean_quoted_history_html", () => {
  it("drops the provider history, wrappers, and rule from the quoted body", () => {
    const out = parse_fragment(
      clean_quoted_history_html(PROVIDER_REPLY_WITH_GAPS),
    );

    expect(out.querySelector("[class*='protonmail_']")).toBeNull();
    expect(out.querySelector("blockquote")).toBeNull();
    expect(out.querySelector("hr")).toBeNull();
    expect(flat(out.textContent)).not.toContain("hidden preview");
    expect(flat(out.textContent)).not.toContain("wrote:");
    expect(flat(out.textContent)).not.toContain("hello");
  });

  it("keeps the visible text and the signature as plain text", () => {
    const out = parse_fragment(
      clean_quoted_history_html(PROVIDER_REPLY_WITH_GAPS),
    );

    expect(flat(out.textContent)).toBe(
      "howdySent with Proton Mail secure email.",
    );
    expect(out.querySelector("a[href]")?.textContent).toBe("Proton Mail");
  });

  it("leaves a compact body with no empty runs or trailing blanks", () => {
    const out = parse_fragment(
      clean_quoted_history_html(PROVIDER_REPLY_WITH_GAPS),
    );
    const elements = Array.from(out.children);

    expect(has_blank_run(out)).toBe(false);
    expect(flat(elements[elements.length - 1]?.textContent)).toContain(
      "Sent with",
    );
    expect(flat(elements[0]?.textContent)).toBe("howdy");
    expect(out.querySelectorAll("br").length).toBeLessThanOrEqual(1);
  });

  it("returns other providers' markup unchanged", () => {
    const html = `<div>Hi</div><div><br></div><div><br></div><div class="gmail_quote">On Mon wrote:<blockquote>x</blockquote></div>`;

    expect(clean_quoted_history_html(html)).toBe(html);
  });
});

describe("other reply formats", () => {
  it("collapses an Aster reply as quoted text", () => {
    const doc = render(
      `<div>Sounds good.</div><br><br><div class="aster_quote"><div class="aster_quote_attr">On Mon, Bob wrote:</div><blockquote class="aster_quote_body"><div>Original text</div></blockquote></div>`,
    );

    expect(doc.querySelector("details.aster-forwarded-collapse")).toBeNull();
    expect(visible_text(doc)).toBe("Sounds good.");
    expect(quoted_text(doc)).toContain("Original text");
  });

  it("collapses a gmail_quote reply as quoted text", () => {
    const doc = render(
      `<div dir="ltr">Thanks!</div><br><div class="gmail_quote"><div dir="ltr" class="gmail_attr">On Mon, Jan 5, 2026 at 9:00 AM Sam &lt;sam@example.com&gt; wrote:<br></div><blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex"><div dir="ltr">Earlier note.</div></blockquote></div>`,
    );

    expect(doc.querySelector("details.aster-forwarded-collapse")).toBeNull();
    expect(visible_text(doc)).toBe("Thanks!");
    expect(quoted_text(doc)).toContain("Earlier note.");
  });

  it("collapses an Outlook-style header block reply", () => {
    const doc = render(
      [
        "<div>Thanks, see attached.</div>",
        '<div id="appendonsend"></div>',
        '<hr style="display:inline-block;width:98%">',
        '<div id="divRplyFwdMsg" dir="ltr"><font face="Calibri"><b>From:</b> Sam &lt;sam@example.com&gt;<br>',
        "<b>Sent:</b> Wednesday, October 7, 2026 2:03 PM<br>",
        "<b>To:</b> Me &lt;me@example.com&gt;<br>",
        "<b>Subject:</b> Re: plans</font><div>&nbsp;</div></div>",
        "<div>earlier body text</div>",
      ].join(""),
    );

    expect(visible_text(doc)).toContain("Thanks, see attached.");
    expect(visible_text(doc)).not.toContain("earlier body text");
    expect(quoted_text(doc)).toContain("earlier body text");
  });
});
