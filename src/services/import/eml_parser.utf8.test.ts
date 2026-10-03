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
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { parse_eml_file } from "./eml_parser";
import { parse_mbox_file } from "./mbox_parser";

// Browsers decode "iso-8859-1" (and "latin1", "us-ascii") as windows-1252,
// which turns bytes 0x80-0x9F into characters such as U+20AC. Node keeps
// those bytes as-is, so without this stub the tests would not see what users
// see in the browser.
// prettier-ignore
const WINDOWS_1252_HIGH = String.fromCharCode(
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021,
  0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
);
const WINDOWS_1252_LABELS = new Set([
  "ascii",
  "cp1252",
  "iso-8859-1",
  "iso8859-1",
  "latin1",
  "us-ascii",
  "windows-1252",
]);
const NodeTextDecoder = globalThis.TextDecoder;

class BrowserTextDecoder extends NodeTextDecoder {
  private readonly windows_1252: boolean;

  constructor(label = "utf-8", options?: TextDecoderOptions) {
    super(label, options);
    this.windows_1252 = WINDOWS_1252_LABELS.has(label.trim().toLowerCase());
  }

  decode(input?: AllowSharedBufferSource, options?: TextDecodeOptions) {
    const text = super.decode(input, options);

    if (!this.windows_1252) return text;

    return text.replace(
      /[\x80-\x9f]/g,
      (c) => WINDOWS_1252_HIGH[c.charCodeAt(0) - 0x80],
    );
  }
}

function concat_bytes(...parts: (string | number[])[]): Uint8Array {
  const encoder = new TextEncoder();
  const chunks = parts.map((p) =>
    typeof p === "string" ? encoder.encode(p) : Uint8Array.from(p),
  );
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;

  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }

  return out;
}

const EIGHT_BIT_UTF8 =
  "From: João Silva <joao@example.com>\n" +
  "To: user@example.com\n" +
  "Subject: Olá João\n" +
  "Message-ID: <utf8@example.com>\n" +
  "Date: Mon, 01 Jan 2026 00:00:00 +0000\n" +
  "Content-Type: text/plain; charset=utf-8\n" +
  "Content-Transfer-Encoding: 8bit\n" +
  "\n" +
  "Olá — custa 5€ “ok” 🎉\n";

describe("importing 8-bit mail", () => {
  beforeEach(() => {
    vi.stubGlobal("TextDecoder", BrowserTextDecoder);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("decodes raw UTF-8 headers and body in an .eml", async () => {
    const file = new File([concat_bytes(EIGHT_BIT_UTF8)], "message.eml");
    const result = await parse_eml_file(file);

    expect(result.errors).toEqual([]);
    expect(result.emails[0].subject).toBe("Olá João");
    expect(result.emails[0].from).toBe("João Silva <joao@example.com>");
    expect(result.emails[0].text_body).toBe("Olá — custa 5€ “ok” 🎉\n");
  });

  it("decodes raw UTF-8 headers and body in an .mbox", async () => {
    const file = new File(
      [
        concat_bytes(
          "From joao@example.com Mon Jan 01 00:00:00 2026\n",
          EIGHT_BIT_UTF8,
          "From other@example.com Mon Jan 01 00:00:00 2026\n",
          EIGHT_BIT_UTF8.replace("utf8@", "second@"),
        ),
      ],
      "mail.mbox",
    );
    const result = await parse_mbox_file(file);

    expect(result.errors).toEqual([]);
    expect(result.emails.map((e) => e.subject)).toEqual([
      "Olá João",
      "Olá João",
    ]);
    expect(result.emails[1].text_body).toContain("custa 5€ “ok”");
  });

  it("keeps a character that straddles the 8 MB read boundary intact", async () => {
    const head =
      "From joao@example.com Mon Jan 01 00:00:00 2026\n" +
      "From: A <a@example.com>\nSubject: Big\n\n";
    const pad = 8 * 1024 * 1024 - head.length - 1;
    const file = new File(
      [concat_bytes(head, "x".repeat(pad), "€ end\n")],
      "big.mbox",
    );
    const result = await parse_mbox_file(file);

    expect(result.emails).toHaveLength(1);
    expect(result.emails[0].text_body?.endsWith("x€ end")).toBe(true);
  });

  it("still decodes parts that declare a legacy charset", async () => {
    const file = new File(
      [
        concat_bytes(
          "From: A <a@example.com>\n" +
            "Subject: Legacy\n" +
            'Content-Type: multipart/alternative; boundary="b"\n' +
            "\n" +
            "--b\n" +
            "Content-Type: text/plain; charset=iso-8859-1\n" +
            "Content-Transfer-Encoding: 8bit\n" +
            "\n" +
            "caf",
          [0xe9],
          "\n--b\n" +
            "Content-Type: text/html; charset=windows-1252\n" +
            "Content-Transfer-Encoding: 8bit\n" +
            "\n" +
            "<p>",
          [0x80, 0x20, 0x93, 0x6f, 0x6b, 0x94],
          "</p>\n--b--\n",
        ),
      ],
      "legacy.eml",
    );
    const result = await parse_eml_file(file);

    expect(result.emails[0].text_body?.trim()).toBe("café");
    expect(result.emails[0].html_body?.trim()).toBe("<p>€ “ok”</p>");
  });

  it("falls back to windows-1252 for headers that are not valid UTF-8", async () => {
    const file = new File(
      [
        concat_bytes(
          "From: Ren",
          [0xe9],
          " <rene@example.com>\nSubject: ",
          [0x93, 0x63, 0x61, 0x66, 0xe9, 0x94],
          "\n\nbody\n",
        ),
      ],
      "legacy-header.eml",
    );
    const result = await parse_eml_file(file);

    expect(result.emails[0].from).toBe("René <rene@example.com>");
    expect(result.emails[0].subject).toBe("“café”");
  });

  it("still decodes encoded-word headers next to raw UTF-8", async () => {
    const file = new File(
      [
        concat_bytes(
          "From: A <a@example.com>\n" +
            "Subject: =?UTF-8?B?w4kgdW0=?= teste — já\n\nbody\n",
        ),
      ],
      "mixed.eml",
    );
    const result = await parse_eml_file(file);

    expect(result.emails[0].subject).toBe("É um teste — já");
  });
});
