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
  describe_link,
  is_ip_host,
  LONG_CHUNK_LENGTH,
  site_in_link_text,
  site_of_host,
} from "./link_destination";

describe("site_of_host", () => {
  it("drops subdomains down to the registrable domain", () => {
    expect(site_of_host("www.forbes.com")).toBe("forbes.com");
    expect(site_of_host("a.b.c.example.org")).toBe("example.org");
  });

  it("keeps a second-level country suffix", () => {
    expect(site_of_host("news.bbc.co.uk")).toBe("bbc.co.uk");
    expect(site_of_host("shop.example.com.au")).toBe("example.com.au");
  });

  it("keeps the tenant on a shared hosting domain", () => {
    expect(site_of_host("someone.github.io")).toBe("someone.github.io");
  });

  it("returns IP addresses and single labels unchanged", () => {
    expect(site_of_host("192.168.1.10")).toBe("192.168.1.10");
    expect(site_of_host("localhost")).toBe("localhost");
  });
});

describe("is_ip_host", () => {
  it("recognizes IPv4 and bracketed IPv6 hosts", () => {
    expect(is_ip_host("10.0.0.1")).toBe(true);
    expect(is_ip_host("[2001:db8::1]")).toBe(true);
    expect(is_ip_host("example.com")).toBe(false);
    expect(is_ip_host("1.example.com")).toBe(false);
  });
});

describe("describe_link", () => {
  it("returns the exact href that opening uses", () => {
    const href =
      "https://click.example-mail.com/ls/click?upn=abc123&utm_source=news&utm_medium=email#top";
    const link = describe_link(href);

    expect(link.kind).toBe("web");
    expect(link.href).toBe(href);
    expect(link.site).toBe("example-mail.com");
    expect(link.host).toBe("click.example-mail.com");
    expect(link.signals).toEqual([]);
  });

  it("splits the address so the host can be emphasized", () => {
    const link = describe_link("https://www.forbes.com/sites/a?b=1");

    expect(link.parts).toEqual({
      lead: "https://",
      host: "www.forbes.com",
      rest: "/sites/a?b=1",
    });
    expect(link.site_display).toBe("forbes.com");
  });

  it("keeps a port with the host part", () => {
    const link = describe_link("https://example.com:8443/a");

    expect(link.parts.host).toBe("example.com:8443");
    expect(link.parts.rest).toBe("/a");
  });

  it("keeps the scheme and host together and breaks the path after separators", () => {
    const link = describe_link("https://www.forbes.com/sites/a?b=1&c=2");
    const texts = link.chunks.map((chunk) =>
      chunk.pieces.map((piece) => piece.text).join(""),
    );

    expect(texts).toEqual([
      "https://www.",
      "forbes.",
      "com",
      "/",
      "sites/",
      "a?",
      "b=",
      "1&",
      "c=",
      "2",
    ]);
    expect(texts.join("")).toBe(link.href);
    expect(
      link.chunks
        .flatMap((chunk) => chunk.pieces)
        .filter((piece) => piece.strong)
        .map((piece) => piece.text)
        .join(""),
    ).toBe("www.forbes.com");
  });

  it("keeps the port with the last host label and repeated slashes together", () => {
    const link = describe_link("https://example.com:8443//a//b");
    const texts = link.chunks.map((chunk) =>
      chunk.pieces.map((piece) => piece.text).join(""),
    );

    expect(texts).toEqual(["https://example.", "com:8443", "//", "a//", "b"]);
    expect(link.chunks[1].pieces).toEqual([
      { text: "com", strong: true },
      { text: ":8443", strong: false },
    ]);
  });

  it("marks only a segment longer than a line as breakable", () => {
    const token = "a".repeat(LONG_CHUNK_LENGTH + 1);
    const link = describe_link(`https://example.com/short/${token}`);

    expect(link.chunks.filter((chunk) => chunk.long)).toHaveLength(1);
    expect(link.chunks.at(-1)?.long).toBe(true);
    expect(link.chunks.at(-1)?.pieces[0].text).toBe(token);
  });

  it("keeps markup in an address as plain text", () => {
    const link = describe_link("javascript:<img src=x onerror=alert(1)>");

    expect(link.kind).toBe("blocked");
    expect(link.chunks.map((chunk) => chunk.pieces[0].text).join("")).toBe(
      "javascript:<img src=x onerror=alert(1)>",
    );
  });

  it("flags a plain http link as not encrypted", () => {
    expect(describe_link("http://example.com/").signals).toEqual([
      "not_encrypted",
    ]);
    expect(describe_link("https://example.com/").signals).toEqual([]);
  });

  it("shows a safe internationalized domain without a warning", () => {
    const link = describe_link("https://www.münchen.de/rathaus");

    expect(link.host).toBe("www.xn--mnchen-3ya.de");
    expect(link.site_display).toBe("münchen.de");
    expect(link.signals).toEqual([]);
  });

  it("flags a mixed-script lookalike and keeps the real address", () => {
    const link = describe_link("https://xn--pple-43d.com/login");

    expect(link.signals).toContain("lookalike");
    expect(link.site_display).toBe("xn--pple-43d.com");
    expect(link.host_unicode).toBe("аpple.com");
  });

  it("flags a lookalike written in Unicode in the href", () => {
    const link = describe_link("https://аpple.com/");

    expect(link.host).toBe("xn--pple-43d.com");
    expect(link.signals).toContain("lookalike");
  });

  it("flags IPv4, normalized IPv4 and IPv6 hosts", () => {
    expect(describe_link("https://203.0.113.9/a").signals).toEqual([
      "ip_address",
    ]);

    const decimal = describe_link("https://3405803785/a");

    expect(decimal.host).toBe("203.0.113.9");
    expect(decimal.is_ip).toBe(true);
    expect(decimal.signals).toEqual(["ip_address"]);
    expect(describe_link("http://[2001:db8::1]/").signals).toEqual([
      "ip_address",
      "not_encrypted",
    ]);
  });

  it("flags link text that names a different website", () => {
    const link = describe_link(
      "https://login.evil.example/verify",
      "https://www.paypal.com/signin",
    );

    expect(link.signals).toEqual(["text_mismatch"]);
    expect(link.shown_site).toBe("paypal.com");
    expect(link.site_display).toBe("evil.example");
  });

  it("accepts link text on the same website", () => {
    expect(
      describe_link("https://news.bbc.co.uk/a", "www.bbc.co.uk").signals,
    ).toEqual([]);
    expect(
      describe_link("https://www.forbes.com/a", "  forbes.com/a  ").signals,
    ).toEqual([]);
  });

  it("ignores link text that is not an address", () => {
    for (const text of [
      "Click here",
      "Read more.",
      "Version 2.0",
      "ada@example.com",
      "",
    ]) {
      expect(describe_link("https://example.com/", text).signals).toEqual([]);
    }
  });

  it("ignores zero-width characters hidden in link text", () => {
    const link = describe_link("https://example.com/", "pay​pal.com");

    expect(link.signals).toEqual(["text_mismatch"]);
    expect(link.shown_site).toBe("paypal.com");
  });

  it("never treats javascript or data links as openable", () => {
    for (const href of [
      "javascript:alert(1)",
      " JavaScript:alert(1)",
      "data:text/html,<p>x</p>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
    ]) {
      expect(describe_link(href).kind).toBe("blocked");
    }
  });

  it("describes a mailto link by its address", () => {
    const link = describe_link("mailto:ada@example.com?subject=Hi");

    expect(link.kind).toBe("mailto");
    expect(link.mail_address).toBe("ada@example.com");
    expect(link.signals).toEqual([]);
  });

  it("treats a protocol-relative link as https", () => {
    const link = describe_link("//example.com/a");

    expect(link.href).toBe("https://example.com/a");
    expect(link.signals).toEqual([]);
  });
});

describe("site_in_link_text", () => {
  it("reads a bare domain or a full address", () => {
    expect(site_in_link_text("forbes.com")).toBe("forbes.com");
    expect(site_in_link_text("<https://shop.example.co.uk/x>")).toBe(
      "example.co.uk",
    );
  });

  it("rejects prose and numbers", () => {
    expect(site_in_link_text("see example.com for more")).toBe("");
    expect(site_in_link_text("3.14")).toBe("");
  });
});
