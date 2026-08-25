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
import { describe, it, expect } from "vitest";

import {
  MAX_ALIAS_WEBSITES,
  normalize_website_url,
  validate_website_input,
  parse_websites_payload,
} from "./aliases";

describe("normalize_website_url", () => {
  it("prepends https to bare domains", () => {
    expect(normalize_website_url("netflix.com")).toBe("https://netflix.com");
    expect(normalize_website_url("www.example.co.uk")).toBe(
      "https://www.example.co.uk",
    );
  });

  it("keeps explicit http and https urls", () => {
    expect(normalize_website_url("https://amazon.com/account")).toBe(
      "https://amazon.com/account",
    );
    expect(normalize_website_url("http://old-site.org")).toBe(
      "http://old-site.org",
    );
  });

  it("rejects non-web schemes", () => {
    expect(normalize_website_url("javascript:alert(1)")).toBeNull();
    expect(normalize_website_url("JavaScript:alert(1)")).toBeNull();
    expect(
      normalize_website_url("data:text/html,<script>1</script>"),
    ).toBeNull();
    expect(normalize_website_url("ftp://files.example.com")).toBeNull();
    expect(normalize_website_url("file:///etc/passwd")).toBeNull();
    expect(normalize_website_url("vbscript:msgbox(1)")).toBeNull();
  });

  it("rejects scheme smuggling via whitespace and control characters", () => {
    const tab = String.fromCharCode(9);
    const newline = String.fromCharCode(10);
    const nul = String.fromCharCode(0);

    expect(normalize_website_url(`java${tab}script:alert(1)`)).toBeNull();
    expect(normalize_website_url(`java${newline}script:alert(1)`)).toBeNull();
    expect(normalize_website_url(`${nul}javascript:alert(1)`)).toBeNull();
    expect(normalize_website_url(" javascript:alert(1) ")).toBeNull();
    expect(normalize_website_url(" javascript:alert(1)")).toBeNull();
  });

  it("strips whitespace inside pasted urls", () => {
    expect(normalize_website_url(" netflix .com ")).toBe("https://netflix.com");
  });

  it("rejects garbage and dotless hosts", () => {
    expect(normalize_website_url("")).toBeNull();
    expect(normalize_website_url("   ")).toBeNull();
    expect(normalize_website_url("not a url at all")).toBeNull();
    expect(normalize_website_url("localhost")).toBeNull();
    expect(normalize_website_url("http://localhost")).toBeNull();
  });

  it("rejects urls over the length cap", () => {
    const long = `https://example.com/${"a".repeat(300)}`;

    expect(normalize_website_url(long)).toBeNull();
  });
});

describe("parse_websites_payload", () => {
  it("parses a valid array payload", () => {
    expect(
      parse_websites_payload('["https://netflix.com","https://amazon.com"]'),
    ).toEqual(["https://netflix.com", "https://amazon.com"]);
  });

  it("drops invalid entries instead of failing the whole list", () => {
    expect(
      parse_websites_payload(
        '["https://ok.com","javascript:alert(1)",42,null,"still-fine.org"]',
      ),
    ).toEqual(["https://ok.com", "https://still-fine.org"]);
  });

  it("returns empty for malformed payloads", () => {
    expect(parse_websites_payload("not json")).toEqual([]);
    expect(parse_websites_payload('{"a":1}')).toEqual([]);
    expect(parse_websites_payload('"just a string"')).toEqual([]);
    expect(parse_websites_payload("")).toEqual([]);
  });

  it("caps the list length", () => {
    const many = JSON.stringify(
      Array.from({ length: 25 }, (_, i) => `https://site${i}.com`),
    );

    expect(parse_websites_payload(many)).toHaveLength(MAX_ALIAS_WEBSITES);
  });
});

describe("validate_website_input", () => {
  it("accepts real public suffixes", () => {
    expect(validate_website_input("netflix.com")).toBe("https://netflix.com");
    expect(validate_website_input("shop.co.uk")).toBe("https://shop.co.uk");
    expect(validate_website_input("my-site.io")).toBe("https://my-site.io");
    expect(validate_website_input("https://news.ycombinator.com/x")).toBe(
      "https://news.ycombinator.com/x",
    );
  });

  it("rejects typo and made up suffixes", () => {
    expect(validate_website_input("test.cpm")).toBeNull();
    expect(validate_website_input("tadads.dasdasd")).toBeNull();
    expect(validate_website_input("foo.bar-baz")).toBeNull();
    expect(validate_website_input("foo.123")).toBeNull();
  });

  it("rejects malformed hosts", () => {
    expect(validate_website_input("-bad.com")).toBeNull();
    expect(validate_website_input("bad-.com")).toBeNull();
    expect(validate_website_input("localhost")).toBeNull();
  });
});
