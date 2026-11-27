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

import { plain_text_to_html } from "@/lib/html_text";
import {
  clean_quoted_history_html,
  convert_plain_quote_html,
  has_plain_quote_lines,
  read_plain_quote_marker,
  strip_plain_quote_markers,
} from "@/lib/quoted_history_clean";
import { build_editable_quoted_fragment } from "@/lib/editable_quoted_html";
import { build_body_preview } from "@/utils/preview_text";
import {
  pre_process_email_html,
  type PreProcessOptions,
} from "@/components/email/email_pre_process";

function display(text: string): string {
  return convert_plain_quote_html(plain_text_to_html(text));
}

function parse(html: string): HTMLElement {
  const container = document.createElement("div");

  container.innerHTML = html;

  return container;
}

function quote_depth(el: Element): number {
  let depth = 0;
  let node: Element | null = el;

  while (node) {
    if (node.tagName === "BLOCKQUOTE") depth += 1;
    node = node.parentElement;
  }

  return depth;
}

function marker_free(text: string): boolean {
  return !text.split("\n").some((line) => /^\s*>/.test(line));
}

describe("read_plain_quote_marker", () => {
  it("reads single and nested markers", () => {
    expect(read_plain_quote_marker("> hi")?.depth).toBe(1);
    expect(read_plain_quote_marker(">> hi")?.depth).toBe(2);
    expect(read_plain_quote_marker("> > hi")?.depth).toBe(2);
    expect(read_plain_quote_marker(">")?.depth).toBe(1);
  });

  it("ignores lines that do not start with a marker", () => {
    expect(read_plain_quote_marker("hi > there")).toBeNull();
    expect(read_plain_quote_marker("")).toBeNull();
  });

  it("caps the depth", () => {
    expect(read_plain_quote_marker(">".repeat(40) + " x")!.depth).toBe(8);
  });
});

describe("plain text quotes render as blockquotes", () => {
  it("renders a simple quote without markers", () => {
    const root = parse(display("Reply\n\n> first\n> second"));
    const quote = root.querySelector("blockquote");

    expect(quote).not.toBeNull();
    expect(quote!.getAttribute("type")).toBe("cite");
    expect(quote!.textContent).toContain("first");
    expect(quote!.textContent).toContain("second");
    expect(root.textContent).not.toContain(">");
    expect(root.firstElementChild!.textContent).toBe("Reply");
  });

  it("nests deeper quote levels", () => {
    const root = parse(
      display("> outer\n>> inner\n>>> deepest\n> outer again"),
    );
    const blocks = Array.from(root.querySelectorAll("blockquote"));

    expect(blocks.length).toBe(3);
    expect(Math.max(...blocks.map(quote_depth))).toBe(3);
    const inner = blocks.find((b) => quote_depth(b) === 3)!;

    expect(inner.textContent).toBe("deepest");
    expect(root.textContent).not.toContain(">");
  });

  it("keeps the attribution line above the block as text", () => {
    const root = parse(
      display(
        "Yes\n\nOn Thursday, Sam <sam@example.com> wrote:\n> Hello\n> there",
      ),
    );
    const quote = root.querySelector("blockquote")!;
    const before = quote.previousElementSibling!;

    expect(before.tagName).toBe("P");
    expect(before.textContent).toContain("wrote:");
    expect(quote.textContent).not.toContain("wrote:");
  });

  it("drops leading, trailing, and repeated spacer lines", () => {
    const root = parse(
      display(">\n>\n> one\n>\n>\n>\n> two\n>\n>"),
    );
    const quote = root.querySelector("blockquote")!;
    const paragraphs = quote.querySelectorAll("p");

    expect(paragraphs.length).toBe(2);
    expect(paragraphs[0].textContent).toBe("one");
    expect(paragraphs[1].textContent).toBe("two");
  });

  it("removes a quote made only of spacers", () => {
    const root = parse(display("Hello\n>\n>\n>"));

    expect(root.querySelector("blockquote")).toBeNull();
    expect(root.textContent).toBe("Hello");
  });

  it("handles CRLF line endings", () => {
    const root = parse(display("Hi\r\n\r\n> a\r\n>> b\r\n> c\r\n"));

    expect(root.querySelectorAll("blockquote").length).toBe(2);
    expect(root.textContent).not.toContain(">");
    expect(root.textContent).not.toContain("\r");
    expect(strip_plain_quote_markers("a\r\n> b\r\n>> c")).toBe("a\nb\nc");
    expect(
      parse(convert_plain_quote_html("<p>&gt; a\r\n<br>&gt; b</p>"))
        .textContent,
    ).not.toContain(">");
  });

  it("mixes text between quote runs", () => {
    const root = parse(
      display("> asked\n\nanswer one\n\n> asked again\n\nanswer two"),
    );
    const children = Array.from(root.children).map((el) => el.tagName);

    expect(children).toEqual(["BLOCKQUOTE", "P", "BLOCKQUOTE", "P"]);
  });

  it("leaves emoticons and inline arrows as text", () => {
    for (const text of [">_< oops", "a > b", ">.> sure", "->  arrow"]) {
      const root = parse(display(text));

      expect(root.querySelector("blockquote"), text).toBeNull();
      expect(root.textContent, text).toContain(">");
    }
  });

  it("escapes markup inside quoted lines", () => {
    const html = display(
      '> <script>alert(1)</script>\n> <img src=x onerror="alert(2)">\n> <a href="javascript:alert(3)">x</a>',
    );
    const root = parse(html);

    expect(root.querySelector("script")).toBeNull();
    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector("a[href^='javascript']")).toBeNull();
    expect(root.querySelector("blockquote")!.textContent).toContain(
      "<script>alert(1)</script>",
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
  });

  it("detects quote lines", () => {
    expect(has_plain_quote_lines("> a\n> b")).toBe(true);
    expect(has_plain_quote_lines(">_<")).toBe(false);
    expect(has_plain_quote_lines("no quotes")).toBe(false);
  });
});

describe("html with escaped quote markers", () => {
  it("converts br separated lines in a paragraph", () => {
    const root = parse(
      convert_plain_quote_html(
        "<p>Yes</p><p>On Thursday, Sam wrote:<br>&gt; Hello<br>&gt;<br>&gt; Sent securely.</p>",
      ),
    );
    const quote = root.querySelector("blockquote")!;

    expect(quote).not.toBeNull();
    expect(quote.textContent).toContain("Hello");
    expect(quote.textContent).toContain("Sent securely.");
    expect(root.textContent).not.toContain(">");
    expect(quote.previousElementSibling!.textContent).toContain("wrote:");
    expect(root.querySelector("p blockquote")).toBeNull();
  });

  it("converts nested markers in div lines", () => {
    const root = parse(
      convert_plain_quote_html(
        "<div>&gt; outer</div><div>&gt;&gt; inner</div><div>&gt; back</div>",
      ),
    );

    expect(root.querySelectorAll("blockquote").length).toBeGreaterThanOrEqual(
      2,
    );
    expect(root.textContent).not.toContain(">");
  });

  it("keeps inline formatting inside the quote", () => {
    const root = parse(
      convert_plain_quote_html("<p>&gt; <b>bold</b> text<br>&gt; more</p>"),
    );

    expect(root.querySelector("blockquote b")!.textContent).toBe("bold");
  });

  it("leaves code blocks alone", () => {
    const html = "<pre>&gt; literal\n&gt; text</pre>";

    expect(convert_plain_quote_html(html)).toBe(html);
  });

  it("does not revive escaped markup", () => {
    const root = parse(
      convert_plain_quote_html(
        "<p>&gt; &lt;img src=x onerror=alert(1)&gt;<br>&gt; &lt;script&gt;x&lt;/script&gt;</p>",
      ),
    );

    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector("script")).toBeNull();
    expect(root.querySelector("blockquote")!.textContent).toContain("<img");
  });

  it("runs through the quoted history cleaner", () => {
    const root = parse(
      clean_quoted_history_html("<p>&gt; Hello<br>&gt; there</p>"),
    );

    expect(root.querySelector("blockquote")).not.toBeNull();
    expect(root.textContent).not.toContain(">");
  });

  it("returns html without markers unchanged", () => {
    const html = "<p>Plain &amp; simple</p>";

    expect(clean_quoted_history_html(html)).toBe(html);
  });
});

describe("compose quoted history toggle", () => {
  it("renders the quoted history as styled blocks", () => {
    const container = document.createElement("div");

    container.replaceChildren(
      build_editable_quoted_fragment(
        "<p>On Thursday, Sam &lt;sam@example.com&gt; wrote:<br>&gt;<br>&gt; Sent with secure email.<br>&gt;<br>&gt; On Wednesday, Ana wrote:<br>&gt;&gt; Yes</p>",
        { block_remote_images: false },
      ),
    );

    expect(
      (container.textContent || "").replace("<sam@example.com>", ""),
    ).not.toContain(">");
    const blocks = container.querySelectorAll("blockquote");

    expect(blocks.length).toBe(2);
    expect(blocks[0].textContent).toContain("Sent with secure email.");
    expect(container.querySelector("blockquote blockquote")!.textContent).toBe(
      "Yes",
    );
    expect(container.textContent).toContain("Sam <sam@example.com> wrote:");
  });

  it("keeps quoted markup from a plain text draft inert", () => {
    const container = document.createElement("div");

    container.replaceChildren(
      build_editable_quoted_fragment(
        plain_text_to_html("> <img src=x onerror=alert(1)>\n> hi"),
        { block_remote_images: false },
      ),
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("blockquote")).not.toBeNull();
  });
});

describe("previews", () => {
  it("strips quote markers from preview text", () => {
    expect(strip_plain_quote_markers("Thanks\n> earlier\n>> older")).toBe(
      "Thanks\nearlier\nolder",
    );
    expect(strip_plain_quote_markers(">_< oops")).toBe(">_< oops");
    expect(marker_free(build_body_preview("> quoted line\n> more", ""))).toBe(
      true,
    );
    expect(build_body_preview("> quoted line\n> more", "")).toContain(
      "quoted line",
    );
  });
});

describe("message reader", () => {
  const options: PreProcessOptions = {
    forwarded_label: "Forwarded message",
    show_trimmed_label: "Show trimmed content",
    preserve_formatting: false,
    load_remote_content: false,
    proxy_base: "https://proxy.example/img",
  };

  function read(text: string): HTMLElement {
    return parse(pre_process_email_html(plain_text_to_html(text), options));
  }

  it("styles quotes inside the collapsed history", () => {
    const root = read(
      [
        "Sounds good.",
        "",
        "On Tue, Oct 6, 2026 at 9:00 AM Someone <a@example.com> wrote:",
        "> earlier text",
        ">> older text",
      ].join("\n"),
    );
    const hidden = root.querySelector(".aster-quoted-content")!;

    expect(hidden.querySelector("blockquote blockquote")!.textContent).toBe(
      "older text",
    );
    expect(
      (hidden.textContent || "").replace("<a@example.com>", ""),
    ).not.toContain(">");
  });

  it("styles interleaved quotes that stay visible", () => {
    const root = read(
      [
        "Answers inline.",
        "",
        "> Can you make Friday?",
        "",
        "Yes, Friday works.",
        "",
        "> And bring the slides?",
        "",
        "Will do.",
      ].join("\n"),
    );

    expect(root.querySelector(".aster-quoted-content")).toBeNull();
    expect(root.querySelectorAll("blockquote").length).toBe(2);
    expect(root.textContent).not.toContain(">");
  });
});
