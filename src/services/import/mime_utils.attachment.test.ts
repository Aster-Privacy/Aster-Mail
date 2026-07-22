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

import { parse_multipart } from "./mime_utils";

describe("parse_multipart attachment extraction", () => {
  it("decodes real base64 attachment bytes instead of returning an empty buffer", () => {
    const original = "hello attachment world";
    const encoded = btoa(original);
    const body = [
      "--BOUNDARY",
      'Content-Type: text/plain; charset="utf-8"',
      "",
      "hi there",
      "--BOUNDARY",
      'Content-Type: text/plain; name="notes.txt"',
      'Content-Disposition: attachment; filename="notes.txt"',
      "Content-Transfer-Encoding: base64",
      "",
      encoded,
      "--BOUNDARY--",
    ].join("\r\n");

    const result = parse_multipart(body, "BOUNDARY");

    expect(result.attachments).toHaveLength(1);
    const attachment = result.attachments[0];

    expect(attachment.filename).toBe("notes.txt");
    expect(attachment.size).toBe(original.length);
    expect(attachment.content.byteLength).toBe(original.length);

    const decoded = new TextDecoder().decode(attachment.content);

    expect(decoded).toBe(original);
  });

  it("decodes quoted-printable attachment bytes", () => {
    const body = [
      "--BOUNDARY",
      'Content-Type: application/octet-stream; name="qp.bin"',
      'Content-Disposition: attachment; filename="qp.bin"',
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "line=20one",
      "--BOUNDARY--",
    ].join("\r\n");

    const result = parse_multipart(body, "BOUNDARY");

    expect(result.attachments).toHaveLength(1);
    const decoded = new TextDecoder().decode(result.attachments[0].content);

    expect(decoded.trimEnd()).toBe("line one");
  });

  it("preserves raw bytes for an unencoded binary-ish attachment", () => {
    const body = [
      "--BOUNDARY",
      'Content-Type: application/octet-stream; name="raw.bin"',
      'Content-Disposition: attachment; filename="raw.bin"',
      "",
      "\x00\x01\x02raw",
      "--BOUNDARY--",
    ].join("\r\n");

    const result = parse_multipart(body, "BOUNDARY");

    expect(result.attachments).toHaveLength(1);
    const attachment = result.attachments[0];

    expect(Array.from(attachment.content.subarray(0, 3))).toEqual([0, 1, 2]);
    expect(attachment.size).toBe(attachment.content.byteLength);
  });
});
