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

import { parse_csv_file } from "./csv_parser";

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

const HEADER = "from,to,subject,body\r\n";
const ROW =
  "João Silva <joao@example.com>,user@example.com,Olá João,Custa 5€ — “ok” 習 🎉\r\n";

function utf16(text: string, big_endian: boolean): Uint8Array {
  const out = new Uint8Array(2 + text.length * 2);
  const view = new DataView(out.buffer);

  view.setUint16(0, 0xfeff, !big_endian);
  for (let i = 0; i < text.length; i++) {
    view.setUint16(2 + i * 2, text.charCodeAt(i), !big_endian);
  }

  return out;
}

function make_file(bytes: Uint8Array, name = "export.csv"): File {
  return new File([bytes], name, { type: "text/csv" });
}

async function parse_bytes(bytes: Uint8Array, name?: string) {
  const result = await parse_csv_file(make_file(bytes, name));

  expect(result.errors).toEqual([]);
  expect(result.emails).toHaveLength(1);

  return result.emails[0];
}

describe("parse_csv_file encodings", () => {
  beforeEach(() => {
    vi.stubGlobal("TextDecoder", BrowserTextDecoder);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("decodes UTF-8 without a BOM", async () => {
    const email = await parse_bytes(new TextEncoder().encode(HEADER + ROW));

    expect(email.from).toBe("João Silva <joao@example.com>");
    expect(email.subject).toBe("Olá João");
    expect(email.text_body).toBe("Custa 5€ — “ok” 習 🎉");
  });

  it("decodes UTF-8 with a BOM", async () => {
    const body = new TextEncoder().encode(HEADER + ROW);
    const bytes = new Uint8Array(3 + body.length);

    bytes.set([0xef, 0xbb, 0xbf]);
    bytes.set(body, 3);

    const email = await parse_bytes(bytes);

    expect(email.from).toBe("João Silva <joao@example.com>");
    expect(email.subject).toBe("Olá João");
    expect(email.text_body).toBe("Custa 5€ — “ok” 習 🎉");
  });

  it("falls back to windows-1252 for legacy Excel files", async () => {
    // "Olá João" and "5€ – ok" in windows-1252, which is not valid UTF-8.
    const text =
      HEADER +
      "joao@example.com,user@example.com,Ol\xe1 Jo\xe3o,5\x80 \x96 ok\r\n";
    const bytes = Uint8Array.from(text, (c) => c.charCodeAt(0));

    const email = await parse_bytes(bytes);

    expect(email.subject).toBe("Olá João");
    expect(email.text_body).toBe("5€ – ok");
  });

  it("decodes UTF-16LE with a BOM from Excel's Unicode text export", async () => {
    const tsv = (HEADER + ROW).replace(/,/g, "\t");
    const email = await parse_bytes(utf16(tsv, false), "export.tsv");

    expect(email.from).toBe("João Silva <joao@example.com>");
    expect(email.subject).toBe("Olá João");
    expect(email.text_body).toBe("Custa 5€ — “ok” 習 🎉");
  });

  it("decodes UTF-16BE with a BOM", async () => {
    const email = await parse_bytes(utf16(HEADER + ROW, true));

    expect(email.subject).toBe("Olá João");
    expect(email.text_body).toBe("Custa 5€ — “ok” 習 🎉");
  });
});
