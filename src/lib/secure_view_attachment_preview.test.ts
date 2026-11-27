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
  MAX_IMAGE_PREVIEW_BYTES,
  MAX_TEXT_PREVIEW_BYTES,
  detect_secure_preview,
  display_attachment_name,
  read_text_preview,
} from "./secure_view_attachment_preview";

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);
const encoder = new TextEncoder();

function padded(prefix: Uint8Array, length: number): Uint8Array {
  const data = new Uint8Array(length);

  data.set(prefix);

  return data;
}

describe("detect_secure_preview", () => {
  it("trusts image bytes over the declared type", () => {
    expect(detect_secure_preview(PNG, "application/octet-stream", "a.bin"))
      .toEqual({ kind: "image", mime: "image/png" });
    expect(
      detect_secure_preview(
        new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
        "image/jpeg",
        "a.jpg",
      ),
    ).toEqual({ kind: "image", mime: "image/jpeg" });
  });

  it("refuses svg and html even when they claim to be images", () => {
    const svg = encoder.encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    const html = encoder.encode("<html><script>alert(1)</script></html>");

    expect(detect_secure_preview(svg, "image/svg+xml", "a.svg")).toBeNull();
    expect(detect_secure_preview(svg, "image/png", "a.png")).toBeNull();
    expect(detect_secure_preview(html, "text/html", "a.html")).toBeNull();
    expect(detect_secure_preview(html, "image/png", "a.txt")).toBeNull();
  });

  it("detects pdf, audio and video by their signatures", () => {
    expect(
      detect_secure_preview(encoder.encode("%PDF-1.7\n"), "", "doc"),
    ).toEqual({ kind: "pdf", mime: "application/pdf" });
    expect(
      detect_secure_preview(encoder.encode("ID3\u0004xxxx"), "", "song"),
    ).toEqual({ kind: "audio", mime: "audio/mpeg" });
    expect(
      detect_secure_preview(
        encoder.encode("RIFF\u0000\u0000\u0000\u0000WAVEfmt "),
        "audio/wav",
        "a.wav",
      ),
    ).toEqual({ kind: "audio", mime: "audio/wav" });
    expect(
      detect_secure_preview(
        encoder.encode("\u0000\u0000\u0000\u0018ftypisom"),
        "video/mp4",
        "a.mp4",
      ),
    ).toEqual({ kind: "video", mime: "video/mp4" });
    expect(
      detect_secure_preview(
        new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0]),
        "video/webm",
        "a.webm",
      ),
    ).toEqual({ kind: "video", mime: "video/webm" });
  });

  it("previews plain text only for allowlisted types", () => {
    const text = encoder.encode("hello, world\n");

    expect(detect_secure_preview(text, "text/plain", "notes.txt")).toEqual({
      kind: "text",
      mime: "text/plain",
    });
    expect(
      detect_secure_preview(text, "application/octet-stream", "notes.csv"),
    ).toEqual({ kind: "text", mime: "text/plain" });
    expect(detect_secure_preview(text, "application/javascript", "a.js"))
      .toBeNull();
    expect(detect_secure_preview(text, "", "a.exe")).toBeNull();
  });

  it("refuses text that is binary or not valid utf-8", () => {
    expect(
      detect_secure_preview(new Uint8Array([0x61, 0, 0x62]), "text/plain", "a.txt"),
    ).toBeNull();
    expect(
      detect_secure_preview(new Uint8Array([0xc3, 0x28]), "text/plain", "a.txt"),
    ).toBeNull();
  });

  it("skips previews above the size caps", () => {
    expect(
      detect_secure_preview(
        padded(PNG, MAX_IMAGE_PREVIEW_BYTES + 1),
        "image/png",
        "big.png",
      ),
    ).toBeNull();
  });

  it("returns nothing for empty data", () => {
    expect(detect_secure_preview(new Uint8Array(0), "image/png", "a.png"))
      .toBeNull();
  });
});

describe("read_text_preview", () => {
  it("strips a byte order mark", () => {
    expect(read_text_preview(encoder.encode("﻿hi"))).toEqual({
      text: "hi",
      truncated: false,
    });
  });

  it("truncates long text", () => {
    const data = new Uint8Array(MAX_TEXT_PREVIEW_BYTES + 10).fill(0x61);
    const result = read_text_preview(data);

    expect(result.truncated).toBe(true);
    expect(result.text.length).toBe(MAX_TEXT_PREVIEW_BYTES);
  });
});

describe("display_attachment_name", () => {
  it("removes path parts and caps the length", () => {
    expect(display_attachment_name("../../etc/passwd")).not.toContain("/");
    expect(display_attachment_name("a".repeat(400) + ".txt").length)
      .toBeLessThanOrEqual(255);
  });
});
