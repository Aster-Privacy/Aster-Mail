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
import type { DecryptedEnvelope } from "@/types/email";

import { describe, it, expect } from "vitest";

import { serialize_envelope_to_bytes, type ExportAttachment } from "./rfc5322";

function make_env(): DecryptedEnvelope {
  return {
    subject: "Hello",
    body_text: "see image",
    body_html: undefined,
    from: { name: "Alice", email: "alice@example.com" },
    to: [{ name: "Bob", email: "bob@example.com" }],
    cc: [],
    bcc: [],
    sent_at: "2026-05-20T14:23:11Z",
    raw_headers: [],
  };
}

function header_lines(text: string): string[] {
  return text.split("\r\n");
}

describe("exported Content-ID header", () => {
  it("stays on one line when the id carries line breaks", async () => {
    const att: ExportAttachment = {
      filename: "logo.png",
      mime_type: "image/png",
      is_inline: true,
      content_id: "logo\r\nX-Added: yes\nmore",
      open: () => new Uint8Array([1, 2, 3]),
    };
    const out = new TextDecoder().decode(
      await serialize_envelope_to_bytes(make_env(), [att]),
    );
    const lines = header_lines(out);

    expect(lines).toContain("Content-ID: <logoX-Added: yesmore>");
    expect(lines.some((line) => line.startsWith("X-Added:"))).toBe(false);
    expect(out).not.toMatch(/[^\r]\n/);
  });

  it("keeps an ordinary id unchanged", async () => {
    const att: ExportAttachment = {
      filename: "logo.png",
      mime_type: "image/png",
      is_inline: true,
      content_id: "logo123@example.com",
      open: () => new Uint8Array([1, 2, 3]),
    };
    const out = new TextDecoder().decode(
      await serialize_envelope_to_bytes(make_env(), [att]),
    );

    expect(header_lines(out)).toContain("Content-ID: <logo123@example.com>");
  });
});
