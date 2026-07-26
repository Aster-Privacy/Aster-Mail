// SPDX-FileCopyrightText: 2026 Aster Communications Inc.
// SPDX-License-Identifier: AGPL-3.0-or-later
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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { strip_metadata } from "@/lib/strip_image_metadata";

function ascii_bytes(text: string): number[] {
  return Array.from(text).map((c) => c.charCodeAt(0));
}

function jpeg_segment(marker: number, payload: number[]): number[] {
  const length = payload.length + 2;

  return [0xff, marker, (length >> 8) & 0xff, length & 0xff, ...payload];
}

function build_jpeg(options: {
  exif?: boolean;
  icc?: boolean;
  comment?: boolean;
}) {
  const scan_data = [0x11, 0x22, 0x33, 0x44, 0x55, 0x66];

  return new Uint8Array([
    0xff,
    0xd8,
    ...jpeg_segment(0xe0, [
      ...ascii_bytes("JFIF\0"),
      0x01,
      0x01,
      0x00,
      0x00,
      0x01,
    ]),
    ...(options.exif
      ? jpeg_segment(0xe1, [
          ...ascii_bytes("Exif\0\0"),
          0x49,
          0x49,
          0x2a,
          0x00,
          0xde,
          0xad,
        ])
      : []),
    ...(options.icc
      ? jpeg_segment(0xe2, [...ascii_bytes("ICC_PROFILE\0"), 0x01, 0x02, 0x03])
      : []),
    ...(options.comment
      ? jpeg_segment(0xfe, ascii_bytes("secret camera note"))
      : []),
    ...jpeg_segment(0xdb, [0x00, 0x01, 0x02, 0x03]),
    ...jpeg_segment(0xda, [0x01, 0x01, 0x00]),
    ...scan_data,
    0xff,
    0xd9,
  ]);
}

function png_chunk(type: string, payload: number[]): number[] {
  const length = payload.length;

  return [
    (length >>> 24) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
    ...ascii_bytes(type),
    ...payload,
    0x00,
    0x00,
    0x00,
    0x00,
  ];
}

function build_png(options: { text?: boolean; exif?: boolean }) {
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...png_chunk(
      "IHDR",
      [0, 0, 0, 1, 0, 0, 0, 1, 0x08, 0x06, 0x00, 0x00, 0x00],
    ),
    ...(options.text ? png_chunk("tEXt", ascii_bytes("Author\0Jane Doe")) : []),
    ...(options.exif
      ? png_chunk("eXIf", [0x49, 0x49, 0x2a, 0x00, 0xbe, 0xef])
      : []),
    ...png_chunk("gAMA", [0x00, 0x00, 0xb1, 0x8f]),
    ...png_chunk(
      "IDAT",
      [0x78, 0x9c, 0x62, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01],
    ),
    ...png_chunk("IEND", []),
  ]);
}

function riff_chunk(fourcc: string, payload: number[]): number[] {
  const size = payload.length;
  const padded = size % 2 === 1 ? [...payload, 0x00] : payload;

  return [
    ...ascii_bytes(fourcc),
    size & 0xff,
    (size >>> 8) & 0xff,
    (size >>> 16) & 0xff,
    (size >>> 24) & 0xff,
    ...padded,
  ];
}

function build_webp(options: { exif?: boolean; xmp?: boolean }) {
  const body = [
    ...riff_chunk(
      "VP8X",
      [0x1c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    ),
    ...riff_chunk("VP8 ", [0x01, 0x02, 0x03, 0x04]),
    ...(options.exif
      ? riff_chunk("EXIF", [0x49, 0x49, 0x2a, 0x00, 0xaa, 0xbb])
      : []),
    ...(options.xmp ? riff_chunk("XMP ", ascii_bytes("<x:xmpmeta/>")) : []),
  ];
  const riff_size = 4 + body.length;

  return new Uint8Array([
    ...ascii_bytes("RIFF"),
    riff_size & 0xff,
    (riff_size >>> 8) & 0xff,
    (riff_size >>> 16) & 0xff,
    (riff_size >>> 24) & 0xff,
    ...ascii_bytes("WEBP"),
    ...body,
  ]);
}

function to_buffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function contains_ascii(bytes: Uint8Array, needle: string): boolean {
  const target = ascii_bytes(needle);

  for (let i = 0; i + target.length <= bytes.length; i++) {
    let matched = true;

    for (let j = 0; j < target.length; j++) {
      if (bytes[i + j] !== target[j]) {
        matched = false;
        break;
      }
    }

    if (matched) return true;
  }

  return false;
}

describe("jpeg", () => {
  it("removes exif and comment segments", async () => {
    const source = build_jpeg({ exif: true, comment: true });
    const result = await strip_metadata(to_buffer(source), "image/jpeg");
    const out = new Uint8Array(result.data);

    expect(result.status).toBe("stripped");
    expect(contains_ascii(source, "Exif")).toBe(true);
    expect(contains_ascii(out, "Exif")).toBe(false);
    expect(contains_ascii(out, "secret camera note")).toBe(false);
  });

  it("preserves the icc profile and jfif header", async () => {
    const source = build_jpeg({ exif: true, icc: true });
    const result = await strip_metadata(to_buffer(source), "image/jpeg");
    const out = new Uint8Array(result.data);

    expect(contains_ascii(out, "ICC_PROFILE")).toBe(true);
    expect(contains_ascii(out, "JFIF")).toBe(true);
    expect(contains_ascii(out, "Exif")).toBe(false);
  });

  it("keeps scan data byte identical", async () => {
    const source = build_jpeg({ exif: true, comment: true });
    const result = await strip_metadata(to_buffer(source), "image/jpeg");
    const out = new Uint8Array(result.data);
    const scan_marker = [0xff, 0xda];

    const find_sos = (bytes: Uint8Array) => {
      for (let i = 0; i + 1 < bytes.length; i++) {
        if (bytes[i] === scan_marker[0] && bytes[i + 1] === scan_marker[1])
          return i;
      }

      return -1;
    };

    const source_tail = source.subarray(find_sos(source));
    const out_tail = out.subarray(find_sos(out));

    expect(find_sos(out)).toBeGreaterThan(-1);
    expect(Array.from(out_tail)).toEqual(Array.from(source_tail));
  });

  it("is a no-op on a clean file", async () => {
    const source = build_jpeg({});
    const result = await strip_metadata(to_buffer(source), "image/jpeg");

    expect(result.status).toBe("stripped");
    expect(Array.from(new Uint8Array(result.data))).toEqual(Array.from(source));
  });
});

describe("png", () => {
  it("removes text and exif chunks while keeping image data", async () => {
    const source = build_png({ text: true, exif: true });
    const result = await strip_metadata(to_buffer(source), "image/png");
    const out = new Uint8Array(result.data);

    expect(result.status).toBe("stripped");
    expect(contains_ascii(out, "tEXt")).toBe(false);
    expect(contains_ascii(out, "Jane Doe")).toBe(false);
    expect(contains_ascii(out, "eXIf")).toBe(false);
    expect(contains_ascii(out, "IHDR")).toBe(true);
    expect(contains_ascii(out, "IDAT")).toBe(true);
    expect(contains_ascii(out, "IEND")).toBe(true);
    expect(contains_ascii(out, "gAMA")).toBe(true);
  });

  it("is a no-op on a clean file", async () => {
    const source = build_png({});
    const result = await strip_metadata(to_buffer(source), "image/png");

    expect(Array.from(new Uint8Array(result.data))).toEqual(Array.from(source));
  });
});

describe("webp", () => {
  it("removes exif and xmp chunks and clears the vp8x flags", async () => {
    const source = build_webp({ exif: true, xmp: true });
    const result = await strip_metadata(to_buffer(source), "image/webp");
    const out = new Uint8Array(result.data);

    expect(result.status).toBe("stripped");
    expect(contains_ascii(out, "EXIF")).toBe(false);
    expect(contains_ascii(out, "XMP ")).toBe(false);
    expect(contains_ascii(out, "VP8X")).toBe(true);

    const vp8x_flags = out[20];

    expect(vp8x_flags & 0x0c).toBe(0);
    expect(vp8x_flags & 0x10).toBe(0x10);
  });

  it("rewrites the riff size to match the new body", async () => {
    const source = build_webp({ exif: true, xmp: true });
    const result = await strip_metadata(to_buffer(source), "image/webp");
    const out = new Uint8Array(result.data);
    const declared =
      out[4] | (out[5] << 8) | (out[6] << 16) | ((out[7] << 24) >>> 0);

    expect(declared).toBe(out.length - 8);
  });
});

describe("failure handling", () => {
  beforeEach(() => {
    class undecodable_image {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 0;
      naturalHeight = 0;

      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }

    vi.stubGlobal("Image", undecodable_image);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: () => "blob:stub",
      revokeObjectURL: () => undefined,
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reports unsupported for a non image payload", async () => {
    const pdf = new Uint8Array(ascii_bytes("%PDF-1.7\nnot an image"));
    const result = await strip_metadata(to_buffer(pdf), "application/pdf");

    expect(result.status).toBe("unsupported");
    expect(Array.from(new Uint8Array(result.data))).toEqual(Array.from(pdf));
  });

  it("reports failed for a truncated jpeg instead of throwing", async () => {
    const source = build_jpeg({ exif: true }).subarray(0, 12);
    const result = await strip_metadata(to_buffer(source), "image/jpeg");

    expect(result.status).toBe("failed");
    expect(Array.from(new Uint8Array(result.data))).toEqual(Array.from(source));
  });

  it("reports failed for a png with a bogus chunk length", async () => {
    const source = build_png({ text: true });

    source[8] = 0x7f;
    source[9] = 0xff;

    const result = await strip_metadata(to_buffer(source), "image/png");

    expect(result.status).toBe("failed");
  });

  it("never returns more data than it was given for valid input", async () => {
    for (const source of [
      build_jpeg({ exif: true, icc: true, comment: true }),
      build_png({ text: true, exif: true }),
      build_webp({ exif: true, xmp: true }),
    ]) {
      const result = await strip_metadata(to_buffer(source), "image/jpeg");

      expect(result.data.byteLength).toBeLessThanOrEqual(source.length);
    }
  });
});
