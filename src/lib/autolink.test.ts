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

import { find_autolinks, split_autolinks } from "./autolink";
import { plain_text_to_html } from "./html_text";
import { sanitize_html } from "./html_sanitizer";

const links = (text: string) => find_autolinks(text).map((m) => m.text);
const hrefs = (text: string) => find_autolinks(text).map((m) => m.href);

describe("find_autolinks", () => {
  it("leaves a closing paren and comma outside a parenthesised url", () => {
    expect(
      links(
        "RFC 6530 (https://www.rfc-editor.org/rfc/rfc6530), which explains",
      ),
    ).toEqual(["https://www.rfc-editor.org/rfc/rfc6530"]);
  });

  it("leaves a closing paren and period outside a parenthesised url", () => {
    expect(links("the group (https://uasg.tech).")).toEqual([
      "https://uasg.tech",
    ]);
  });

  it("keeps a balanced paren that is part of the url", () => {
    expect(
      links("see https://en.wikipedia.org/wiki/Pikachu_(Electric) today"),
    ).toEqual(["https://en.wikipedia.org/wiki/Pikachu_(Electric)"]);
    expect(links("(https://en.wikipedia.org/wiki/Foo_(bar))")).toEqual([
      "https://en.wikipedia.org/wiki/Foo_(bar)",
    ]);
  });

  it("strips sentence punctuation from the end of a url", () => {
    expect(links("Go to https://astermail.org/help.")).toEqual([
      "https://astermail.org/help",
    ]);
    expect(links("Go to https://astermail.org/help?")).toEqual([
      "https://astermail.org/help",
    ]);
    expect(links("Go to https://astermail.org/help!")).toEqual([
      "https://astermail.org/help",
    ]);
    expect(links("Go to https://astermail.org/help:")).toEqual([
      "https://astermail.org/help",
    ]);
    expect(links("Go to https://astermail.org/help;")).toEqual([
      "https://astermail.org/help",
    ]);
    expect(links('"https://astermail.org/help"')).toEqual([
      "https://astermail.org/help",
    ]);
    expect(links("'https://astermail.org/help'")).toEqual([
      "https://astermail.org/help",
    ]);
    expect(links("[https://astermail.org/help]")).toEqual([
      "https://astermail.org/help",
    ]);
  });

  it("keeps query strings, fragments and trailing slashes", () => {
    expect(links("https://a.example/p?x=1&y=2#frag/")).toEqual([
      "https://a.example/p?x=1&y=2#frag/",
    ]);
    expect(links("https://a.example/p?x=1&y=2, then")).toEqual([
      "https://a.example/p?x=1&y=2",
    ]);
  });

  it("links www addresses with an http href", () => {
    expect(hrefs("visit www.example.com.")).toEqual(["http://www.example.com"]);
    expect(links("visit www.example.com.")).toEqual(["www.example.com"]);
  });

  it("does not link a bare www without a domain", () => {
    expect(links("www. is not a link")).toEqual([]);
    expect(links("https:// alone")).toEqual([]);
  });

  it("links email addresses with mailto", () => {
    expect(hrefs("Write to support@astermail.org.")).toEqual([
      "mailto:support@astermail.org",
    ]);
    expect(links("Write to support@astermail.org, thanks")).toEqual([
      "support@astermail.org",
    ]);
    expect(links("(support@astermail.org)")).toEqual(["support@astermail.org"]);
  });

  it("does not turn a url containing an at sign into an email", () => {
    expect(hrefs("https://user@host.example/path")).toEqual([
      "https://user@host.example/path",
    ]);
  });

  it("trims a run-on word from an email top level domain", () => {
    expect(links("support@astermail.orgThanks")).toEqual([
      "support@astermail.org",
    ]);
  });

  it("does not link an address glued to a word", () => {
    expect(links("xhttps://astermail.org")).toEqual([]);
  });

  it("returns offsets that split the text cleanly", () => {
    const text = "a (https://x.example/y), b@c.org.";
    const segments = split_autolinks(text);

    expect(segments.map((s) => s.text).join("")).toBe(text);
    expect(segments.filter((s) => s.href).map((s) => s.text)).toEqual([
      "https://x.example/y",
      "b@c.org",
    ]);
  });
});

describe("plain_text_to_html autolinks", () => {
  it("wraps only the url and escapes the surrounding text", () => {
    const html = plain_text_to_html(
      "RFC (https://www.rfc-editor.org/rfc/rfc6530), <b> & more",
    );

    expect(html).toContain(
      '<a href="https://www.rfc-editor.org/rfc/rfc6530" target="_blank" rel="noopener noreferrer">https://www.rfc-editor.org/rfc/rfc6530</a>), &lt;b&gt; &amp; more',
    );
  });

  it("escapes ampersands inside the href and text", () => {
    const html = plain_text_to_html("https://a.example/p?x=1&y=2.");

    expect(html).toContain(
      '<a href="https://a.example/p?x=1&amp;y=2" target="_blank" rel="noopener noreferrer">https://a.example/p?x=1&amp;y=2</a>.',
    );
  });

  it("does not swallow an escaped angle bracket after a url", () => {
    const html = plain_text_to_html("<https://a.example/p>");

    expect(html).toContain(
      '&lt;<a href="https://a.example/p" target="_blank" rel="noopener noreferrer">https://a.example/p</a>&gt;',
    );
  });

  it("links email addresses", () => {
    expect(plain_text_to_html("mail me@x.org.")).toContain(
      '<a href="mailto:me@x.org" target="_blank" rel="noopener noreferrer">me@x.org</a>.',
    );
  });
});

describe("sanitize_html autolinks", () => {
  it("leaves trailing punctuation outside links in html text nodes", () => {
    const html = sanitize_html(
      "<p>The standard (https://www.rfc-editor.org/rfc/rfc6530), which</p>",
    ).html;

    expect(html).toContain('href="https://www.rfc-editor.org/rfc/rfc6530"');
    expect(html).toContain(
      ">https://www.rfc-editor.org/rfc/rfc6530</a>), which",
    );
  });

  it("does not relink text that is already inside an anchor", () => {
    const html = sanitize_html(
      '<p><a href="https://x.example/">https://x.example/</a></p>',
    ).html;

    expect(html.match(/<a /g)?.length).toBe(1);
  });

  it("links email addresses in html text nodes", () => {
    const html = sanitize_html("<p>Reach hello@astermail.org.</p>").html;

    expect(html).toContain('href="mailto:hello@astermail.org"');
    expect(html).toContain(">hello@astermail.org</a>.");
  });
});
