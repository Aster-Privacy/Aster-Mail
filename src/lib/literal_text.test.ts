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
  CLEARSIGNED_BODY,
  FORMAT_PATCH_BODY,
  PUBLIC_KEY_BLOCK,
  SEND_EMAIL_PATCH_BODY,
  TEXT_WITH_PUBLIC_KEY_BODY,
} from "./literal_text_fixtures";
import {
  find_armor_ranges,
  LITERAL_TEXT_SELECTOR,
  looks_like_patch,
  split_literal_segments,
} from "./literal_text";
import {
  as_quotable_html,
  is_html_content,
  plain_text_to_html,
} from "./html_text";

function render_text(html: string): {
  literal: string[];
  text: string;
} {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const literal = Array.from(doc.querySelectorAll(LITERAL_TEXT_SELECTOR)).map(
    (el) => el.textContent ?? "",
  );

  return { literal, text: doc.body.textContent ?? "" };
}

describe("looks_like_patch", () => {
  it("detects a git format-patch body", () => {
    expect(looks_like_patch(FORMAT_PATCH_BODY)).toBe(true);
  });

  it("detects a send-email body that starts with the diffstat separator", () => {
    expect(looks_like_patch(SEND_EMAIL_PATCH_BODY)).toBe(true);
  });

  it("detects a unified diff without a git header", () => {
    const diff =
      "--- a/readme.txt\n+++ b/readme.txt\n@@ -1 +1 @@\n-old\n+new\n";

    expect(looks_like_patch(diff)).toBe(true);
  });

  it("ignores ordinary prose and html", () => {
    expect(looks_like_patch("Hi,\n\n--- \nsee you\n")).toBe(false);
    expect(looks_like_patch("<p>diff --git a/x b/x</p>")).toBe(false);
  });
});

describe("split_literal_segments", () => {
  it("keeps prose around a public key block apart from the block", () => {
    const segments = split_literal_segments(TEXT_WITH_PUBLIC_KEY_BODY);

    expect(segments.map((s) => s.literal)).toEqual([false, true, false]);
    expect(segments[1].text).toBe(PUBLIC_KEY_BLOCK);
    expect(segments.map((s) => s.text).join("")).toBe(
      TEXT_WITH_PUBLIC_KEY_BODY,
    );
  });

  it("treats a clearsigned message as one literal block", () => {
    expect(split_literal_segments(CLEARSIGNED_BODY)).toEqual([
      { text: CLEARSIGNED_BODY, literal: true },
    ]);
  });

  it("leaves plain prose as a single prose segment", () => {
    expect(split_literal_segments("Hello\n\nWorld")).toEqual([
      { text: "Hello\n\nWorld", literal: false },
    ]);
  });
});

describe("plain_text_to_html with patches and armor", () => {
  it("keeps every character of a format-patch body", () => {
    const { literal } = render_text(plain_text_to_html(FORMAT_PATCH_BODY));

    expect(literal).toEqual([FORMAT_PATCH_BODY]);
    expect(literal[0]).toContain("\n #include <stdio.h>\n");
    expect(literal[0]).toContain("\n \n int main(void)\n");
    expect(literal[0]).toContain("\n-    return 0;\n");
    expect(literal[0]).toContain('\n+\tputs("ready");\n');
    expect(literal[0]).toContain("\n-- \n2.43.0\n");
  });

  it("does not treat a patch that edits html as html", () => {
    expect(is_html_content(SEND_EMAIL_PATCH_BODY)).toBe(false);

    const { literal } = render_text(plain_text_to_html(SEND_EMAIL_PATCH_BODY));

    expect(literal).toEqual([SEND_EMAIL_PATCH_BODY]);
  });

  it("keeps a clearsigned message readable line by line", () => {
    const { literal } = render_text(plain_text_to_html(CLEARSIGNED_BODY));

    expect(literal).toEqual([CLEARSIGNED_BODY]);
  });

  it("shows the prose and the public key block verbatim", () => {
    const html = plain_text_to_html(TEXT_WITH_PUBLIC_KEY_BODY);
    const { literal, text } = render_text(html);

    expect(literal).toEqual([PUBLIC_KEY_BLOCK]);
    expect(text).toContain("Here is my key, please import it:");
    expect(text).toContain("Alice");
    expect(html).toContain('<p dir="auto">Thanks,<br>Alice</p>');
  });

  it("keeps the existing paragraph output for ordinary text", () => {
    expect(plain_text_to_html("Hi Sam,\n\nSee you\nsoon")).toBe(
      '<p dir="auto">Hi Sam,</p>\n<p dir="auto">See you<br>soon</p>',
    );
  });

  it("escapes markup inside literal blocks", () => {
    const html = plain_text_to_html(SEND_EMAIL_PATCH_BODY);

    expect(html).not.toContain('<div class="hero">');
    expect(html).toContain("&lt;div class=&quot;hero&quot;&gt;");
  });
});

describe("as_quotable_html", () => {
  it("converts plain text so quoting keeps its lines", () => {
    const { literal } = render_text(as_quotable_html(FORMAT_PATCH_BODY));

    expect(literal).toEqual([FORMAT_PATCH_BODY]);
  });

  it("returns html bodies unchanged", () => {
    expect(as_quotable_html("<p>Hello</p>")).toBe("<p>Hello</p>");
  });
});

const REFERENCE_ARMOR_RE =
  /^-----BEGIN PGP (?:SIGNED MESSAGE-----[ \t]*\n[\s\S]*?^-----END PGP SIGNATURE|(MESSAGE|SIGNATURE|PUBLIC KEY BLOCK|PRIVATE KEY BLOCK)-----[ \t]*\n[\s\S]*?^-----END PGP \1)-----[ \t]*$/gm;

const ARMOR_PIECES = [
  "-----BEGIN PGP MESSAGE-----",
  "-----BEGIN PGP SIGNATURE-----",
  "-----BEGIN PGP SIGNED MESSAGE-----",
  "-----BEGIN PGP PUBLIC KEY BLOCK-----",
  "-----END PGP MESSAGE-----",
  "-----END PGP SIGNATURE-----",
  "-----END PGP PUBLIC KEY BLOCK-----",
  "-----END PGP PRIVATE KEY BLOCK-----",
  "-----BEGIN PGP ",
  "-----END PGP ",
  "\n",
  "\n",
  "\r",
  " ",
  " ",
  "\t",
  "data",
  "Hash: SHA256",
  "-----",
];

function reference_armor_ranges(text: string) {
  return Array.from(text.matchAll(REFERENCE_ARMOR_RE), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function random_armor_text(next: () => number): string {
  const length = 1 + (next() % 24);
  let text = "";

  for (let i = 0; i < length; i += 1) {
    text += ARMOR_PIECES[next() % ARMOR_PIECES.length];
  }

  return text;
}

describe("armor block detection", () => {
  it("matches the original pattern on every generated input", () => {
    let seed = 20261017;
    const next = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;

      return seed;
    };

    for (let i = 0; i < 20000; i += 1) {
      const text = random_armor_text(next);

      expect(find_armor_ranges(text)).toEqual(reference_armor_ranges(text));
    }
  });

  it("matches the original pattern on the shaped cases", () => {
    const cases = [
      "-----BEGIN PGP MESSAGE-----\nabc\n-----END PGP MESSAGE-----",
      "-----BEGIN PGP MESSAGE-----  \nabc\n-----END PGP MESSAGE-----\t ",
      "x\n-----BEGIN PGP MESSAGE-----\na\n-----END PGP MESSAGE-----\ny\n-----BEGIN PGP SIGNATURE-----\nb\n-----END PGP SIGNATURE-----\n",
      "-----BEGIN PGP SIGNED MESSAGE-----\nHash: SHA256\n\nhi\n-----BEGIN PGP SIGNATURE-----\nsig\n-----END PGP SIGNATURE-----",
      "-----BEGIN PGP MESSAGE-----\n-----BEGIN PGP MESSAGE-----\na\n-----END PGP MESSAGE-----",
      "-----BEGIN PGP MESSAGE-----\nabc\n-----END PGP SIGNATURE-----",
      "-----BEGIN PGP MESSAGE-----\nabc",
      "-----BEGIN PGP MESSAGE-----\nabc -----END PGP MESSAGE-----",
      "-----BEGIN PGP MESSAGE-----\nabc\n-----END PGP MESSAGE----- tail",
      "-----BEGIN PGP MESSAGE-----\r\nabc\n-----END PGP MESSAGE-----",
    ];

    for (const text of cases) {
      expect(find_armor_ranges(text)).toEqual(reference_armor_ranges(text));
    }
  });

  it("renders many unclosed armor headers quickly", () => {
    const text = "-----BEGIN PGP MESSAGE-----\n".repeat(20000);
    const started = performance.now();
    const html = plain_text_to_html(text);

    expect(performance.now() - started).toBeLessThan(500);
    expect(html).toContain("BEGIN PGP MESSAGE");
  });

  it("renders many unmatched end lines quickly", () => {
    const text =
      "-----BEGIN PGP MESSAGE-----\n" +
      "-----END PGP SIGNATURE-----\n".repeat(20000);
    const started = performance.now();

    split_literal_segments(text);

    expect(performance.now() - started).toBeLessThan(500);
  });
});
