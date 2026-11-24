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
  escape_mailto_body,
  is_mailto_link,
  parse_mailto_link,
  keep_safe_mailto_fields,
} from "./mailto_link";

describe("parse_mailto_link", () => {
  it("reads a single recipient", () => {
    expect(parse_mailto_link("mailto:ada@example.com")).toEqual({
      to: ["ada@example.com"],
      cc: [],
      bcc: [],
      subject: "",
      body: "",
    });
  });

  it("reads every supported field", () => {
    expect(
      parse_mailto_link(
        "mailto:ada@example.com,grace@example.com?cc=linus@example.com&bcc=ken@example.com&subject=Hello%20there&body=Line%20one%0D%0ALine%20two",
      ),
    ).toEqual({
      to: ["ada@example.com", "grace@example.com"],
      cc: ["linus@example.com"],
      bcc: ["ken@example.com"],
      subject: "Hello there",
      body: "Line one\r\nLine two",
    });
  });

  it("merges recipients from the path and the to field without duplicates", () => {
    const draft = parse_mailto_link(
      "MAILTO:ada@example.com?to=grace@example.com%2CADA@example.com&To=ken@example.com",
    );

    expect(draft?.to).toEqual([
      "ada@example.com",
      "grace@example.com",
      "ken@example.com",
    ]);
  });

  it("accepts a link with no recipient", () => {
    expect(parse_mailto_link("mailto:?subject=Feedback")).toEqual({
      to: [],
      cc: [],
      bcc: [],
      subject: "Feedback",
      body: "",
    });
  });

  it("keeps a plus sign literal and decodes percent escapes", () => {
    const draft = parse_mailto_link(
      "mailto:ada+news@example.com?subject=1+1%3D2%20%26%20more",
    );

    expect(draft?.to).toEqual(["ada+news@example.com"]);
    expect(draft?.subject).toBe("1+1=2 & more");
  });

  it("extracts the address from a display name form", () => {
    const draft = parse_mailto_link(
      "mailto:Ada%20Lovelace%20%3Cada@example.com%3E",
    );

    expect(draft?.to).toEqual(["ada@example.com"]);
  });

  it("drops values that are not addresses", () => {
    const draft = parse_mailto_link(
      "mailto:not-an-address,ada@example.com?cc=%3Cscript%3E",
    );

    expect(draft?.to).toEqual(["ada@example.com"]);
    expect(draft?.cc).toEqual([]);
  });

  it("ignores attachment and unknown fields", () => {
    const draft = parse_mailto_link(
      "mailto:ada@example.com?attach=C:%5Csecret.txt&attachment=/etc/passwd&x-custom=1&subject=Hi",
    );

    expect(draft).toEqual({
      to: ["ada@example.com"],
      cc: [],
      bcc: [],
      subject: "Hi",
      body: "",
    });
  });

  it("removes line breaks from the subject", () => {
    const draft = parse_mailto_link(
      "mailto:ada@example.com?subject=Hi%0D%0ABcc:%20eve@example.com",
    );

    expect(draft?.subject).toBe("Hi  Bcc: eve@example.com");
    expect(draft?.bcc).toEqual([]);
  });

  it("survives a malformed percent escape", () => {
    const draft = parse_mailto_link("mailto:ada@example.com?subject=100%");

    expect(draft?.subject).toBe("100%");
  });

  it("drops the fragment", () => {
    const draft = parse_mailto_link("mailto:ada@example.com?subject=Hi#frag");

    expect(draft?.subject).toBe("Hi");
  });

  it("caps the number of recipients", () => {
    const many = Array.from(
      { length: 150 },
      (_, index) => `user${index}@example.com`,
    ).join(",");

    expect(parse_mailto_link(`mailto:${many}`)?.to).toHaveLength(100);
  });

  it("rejects other schemes and oversized links", () => {
    expect(parse_mailto_link("https://example.com")).toBeNull();
    expect(parse_mailto_link("mailto:")).toBeNull();
    expect(parse_mailto_link("")).toBeNull();
    expect(parse_mailto_link(`mailto:${"a".repeat(20000)}`)).toBeNull();
  });
});

describe("escape_mailto_body", () => {
  it("escapes markup and converts line breaks", () => {
    expect(
      escape_mailto_body(
        '<img src=x onerror=alert(1)>\r\nTom & "Jerry\'s"\nend',
      ),
    ).toBe(
      "&lt;img src=x onerror=alert(1)&gt;<br>Tom &amp; &quot;Jerry&#39;s&quot;<br>end",
    );
  });
});

describe("keep_safe_mailto_fields", () => {
  it("keeps only recipients, subject, and body", () => {
    expect(
      keep_safe_mailto_fields(
        "mailto:ada@example.com?to=bob@example.com&cc=grace@example.com&subject=Hi&body=Text&attach=/etc/passwd&attachment=C:%5Ckey.pem&X-Header=1&in-reply-to=x",
      ),
    ).toBe(
      "mailto:ada@example.com?to=bob@example.com&cc=grace@example.com&subject=Hi&body=Text",
    );
  });

  it("treats semicolons as field separators", () => {
    expect(
      keep_safe_mailto_fields(
        "mailto:ada@example.com?subject=Hi;attach=/etc/passwd;bcc=ken@example.com&body=Text",
      ),
    ).toBe("mailto:ada@example.com?subject=Hi&body=Text");
  });

  it("drops encoded attachment field names", () => {
    expect(
      keep_safe_mailto_fields(
        "mailto:ada@example.com?%61ttach=/etc/passwd&%41TTACHMENT=x&subject=Hi",
      ),
    ).toBe("mailto:ada@example.com?subject=Hi");
  });

  it("drops every blind copy field and keeps the rest", () => {
    expect(
      keep_safe_mailto_fields(
        "mailto:ada@example.com?BCC=ken@example.com&subject=Hi&%62cc=x@example.com&body=Text",
      ),
    ).toBe("mailto:ada@example.com?subject=Hi&body=Text");
  });

  it("leaves a link without a query unchanged", () => {
    expect(keep_safe_mailto_fields("mailto:ada@example.com")).toBe(
      "mailto:ada@example.com",
    );
  });

  it("removes the query when only a blind copy was present", () => {
    const link = keep_safe_mailto_fields(
      "mailto:ada@example.com?bcc=ken@example.com#top",
    );

    expect(link).toBe("mailto:ada@example.com");
    expect(parse_mailto_link(link)?.bcc).toEqual([]);
  });
});

describe("is_mailto_link", () => {
  it("matches the scheme in any case", () => {
    expect(is_mailto_link(" MailTo:ada@example.com")).toBe(true);
    expect(is_mailto_link("https://example.com/mailto:")).toBe(false);
  });
});
