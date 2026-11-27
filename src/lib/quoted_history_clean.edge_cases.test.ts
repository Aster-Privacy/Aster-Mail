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
import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/lockdown_store", async (import_original) => ({
  ...(await import_original<typeof import("@/services/lockdown_store")>()),
  is_any_lockdown_active: () => false,
}));

vi.mock("@/lib/image_proxy", () => ({
  get_image_proxy_url: () => undefined,
}));

import { format_body } from "@/utils/print_email";
import { convert_plain_quote_markup } from "@/lib/quoted_history_clean";
import { convert_plain_quotes } from "@/components/email/sandboxed_email_renderer/dom_cleanup";
import {
  pre_process_email_html,
  type PreProcessOptions,
} from "@/components/email/email_pre_process";

function parse(html: string): HTMLElement {
  const container = document.createElement("div");

  container.innerHTML = html;

  return container;
}

function reader_doc(html: string): Document {
  return new DOMParser().parseFromString(
    `<!doctype html><html><body>${html}</body></html>`,
    "text/html",
  );
}

const options: PreProcessOptions = {
  forwarded_label: "Forwarded message",
  show_trimmed_label: "Show trimmed content",
  preserve_formatting: false,
  load_remote_content: false,
  proxy_base: "https://proxy.example/img",
};

describe("print view", () => {
  it("prints plain text quotes as blockquotes", () => {
    const root = parse(
      format_body("Thanks.\n\n> first line\n> second line\n>> older", "never"),
    );
    const outer = root.querySelector("blockquote")!;

    expect(outer).not.toBeNull();
    expect(outer.querySelector("blockquote")!.textContent).toBe("older");
    expect(root.textContent).not.toContain(">");
    expect(root.textContent).toContain("Thanks.");
  });

  it("prints escaped quote lines in html bodies as blockquotes", () => {
    const root = parse(
      format_body(
        "<div>Reply<br>&gt; quoted one<br>&gt; quoted two</div>",
        "never",
      ),
    );

    expect(root.querySelectorAll("blockquote").length).toBe(1);
    expect(root.querySelector("blockquote")!.textContent).toContain(
      "quoted one",
    );
    expect(root.textContent).not.toContain(">");
  });

  it("leaves non-quote markers in print alone", () => {
    const root = parse(format_body(">_< oops\nplain", "never"));

    expect(root.querySelector("blockquote")).toBeNull();
    expect(root.textContent).toContain(">_<");
  });
});

describe("html with a table", () => {
  it("converts quote lines inside a table cell within that cell", () => {
    const doc = reader_doc(
      "<table><tbody><tr><td>Reply<br>&gt; quoted one<br>&gt; quoted two</td><td>side</td></tr></tbody></table>",
    );

    expect(convert_plain_quotes(doc)).toBe(true);

    const cells = doc.querySelectorAll("td");

    expect(cells.length).toBe(2);
    expect(cells[0].querySelector("blockquote")!.textContent).toContain(
      "quoted two",
    );
    expect(cells[0].textContent).not.toContain(">");
    expect(cells[1].textContent).toBe("side");
    expect(doc.querySelector("tr")!.children.length).toBe(2);
  });

  it("converts quote lines outside the table and keeps the table intact", () => {
    const doc = reader_doc(
      "<p>Reply<br>&gt; quoted</p><table><tbody><tr><td>cell</td></tr></tbody></table>",
    );

    expect(convert_plain_quotes(doc)).toBe(true);
    expect(doc.body.querySelector(":scope > blockquote")).not.toBeNull();
    expect(doc.querySelector("table td")!.textContent).toBe("cell");
  });

  it("never moves table structure into a blockquote", () => {
    const doc = reader_doc(
      "&gt; before<table><tbody><tr><td>&gt; in cell</td></tr></tbody></table>&gt; after",
    );

    convert_plain_quotes(doc);

    doc.querySelectorAll("blockquote").forEach((quote) => {
      expect(quote.querySelector("table,tr,td")).toBeNull();
    });
    expect(doc.querySelector("table td blockquote")!.textContent).toBe(
      "in cell",
    );
    expect(doc.body.textContent).not.toContain(">");
  });

  it("converts table bodies in the message reader", () => {
    const root = parse(
      pre_process_email_html(
        "<table><tbody><tr><td><p>Reply</p><p>&gt; quoted</p></td></tr></tbody></table>",
        options,
      ),
    );

    expect(root.querySelector("td blockquote")).not.toBeNull();
    expect(root.textContent).not.toContain(">");
  });

  it("stays linear on large tables", () => {
    const rows = Array.from(
      { length: 2000 },
      (_, index) => `<tr><td>row ${index}<br>&gt; quoted ${index}</td></tr>`,
    ).join("");
    const doc = reader_doc(`<table><tbody>${rows}</tbody></table>`);
    const started = performance.now();

    convert_plain_quotes(doc);

    expect(performance.now() - started).toBeLessThan(3000);
    expect(doc.querySelectorAll("td blockquote").length).toBe(2000);
  });
});

describe("bare newlines", () => {
  it("treats newline separated lines as quote lines under pre-wrap", () => {
    const root = parse(
      '<div style="white-space: pre-wrap">Reply\n&gt; first\n&gt; second\n&gt;&gt; older</div>',
    );

    expect(convert_plain_quote_markup(root)).toBe(true);

    const outer = root.querySelector("blockquote")!;

    expect(outer.textContent).toContain("first");
    expect(outer.textContent).toContain("second");
    expect(outer.querySelector("blockquote")!.textContent).toBe("older");
    expect(root.textContent).not.toContain(">");
    expect(root.textContent).toContain("Reply");
  });

  it("handles carriage return line endings under pre", () => {
    const root = parse('<p style="white-space:pre">&gt; a\r\n&gt; b</p>');

    convert_plain_quote_markup(root);

    const quote = root.querySelector("blockquote")!;

    expect(quote.textContent).toBe("ab");
    expect(quote.querySelectorAll("br").length).toBe(1);
  });

  it("inherits pre-wrap from an ancestor", () => {
    const root = parse(
      '<div style="white-space:pre-wrap"><div>&gt; one\n&gt; two</div></div>',
    );

    convert_plain_quote_markup(root);

    expect(root.querySelectorAll("blockquote").length).toBe(1);
    expect(root.textContent).not.toContain(">");
  });

  it("treats plain text wrappers as preformatted", () => {
    const root = parse(
      '<div class="moz-text-plain">Reply\n&gt; quoted\n&gt; more</div>',
    );

    convert_plain_quote_markup(root);

    expect(root.querySelector("blockquote")!.textContent).toBe("quotedmore");
  });

  it("leaves newlines alone in normal white space", () => {
    const root = parse("<div>Reply\n&gt; not a quote line</div>");

    expect(convert_plain_quote_markup(root)).toBe(false);
    expect(root.querySelector("br")).toBeNull();
  });

  it("leaves pre and code alone", () => {
    const root = parse(
      '<div style="white-space:pre-wrap"><pre>&gt; a\n&gt; b</pre><code>&gt; c\n&gt; d</code></div>',
    );

    convert_plain_quote_markup(root);

    expect(root.querySelector("blockquote")).toBeNull();
    expect(root.querySelector("pre")!.textContent).toBe("> a\n> b");
    expect(root.querySelector("code")!.textContent).toBe("> c\n> d");
  });

  it("respects an explicit normal reset", () => {
    const root = parse(
      '<div style="white-space:pre-wrap"><div style="white-space:normal">&gt; a\n&gt; b</div></div>',
    );

    convert_plain_quote_markup(root);

    expect(root.querySelectorAll("br").length).toBe(0);
  });

  it("costs about the same as line breaks on long preformatted bodies", () => {
    const lines = Array.from({ length: 4000 }, (_, index) =>
      index % 2 ? `&gt; line ${index}` : `line ${index}`,
    );
    const time = (html: string): number => {
      const root = parse(html);
      const started = performance.now();

      convert_plain_quote_markup(root);
      expect(root.querySelectorAll("blockquote").length).toBe(2000);

      return performance.now() - started;
    };
    const with_breaks = time(`<div>${lines.join("<br>")}</div>`);
    const with_newlines = time(
      `<div style="white-space:pre-wrap">${lines.join("\n")}</div>`,
    );

    expect(with_newlines).toBeLessThan(with_breaks * 3 + 250);
    expect(with_newlines).toBeLessThan(3000);
  });
});
