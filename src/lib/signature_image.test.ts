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
import { describe, it, expect, vi } from "vitest";

import {
  SIGNATURE_CONTENT_LIMIT_BYTES,
  choose_signature_encoding,
  encrypted_signature_size,
  fit_signature_dimensions,
  prepare_signature_image,
  signature_content_fits,
  signature_image_budget,
  signature_image_html,
  type SignatureImageEncoder,
} from "./signature_image";

describe("signature_content_fits", () => {
  it("accepts content whose ciphertext is at the limit", () => {
    const content = "a".repeat(SIGNATURE_CONTENT_LIMIT_BYTES - 16);

    expect(encrypted_signature_size(content)).toBe(
      SIGNATURE_CONTENT_LIMIT_BYTES,
    );
    expect(signature_content_fits(content)).toBe(true);
  });

  it("rejects content one byte over the limit", () => {
    const content = "a".repeat(SIGNATURE_CONTENT_LIMIT_BYTES - 15);

    expect(signature_content_fits(content)).toBe(false);
  });

  it("counts multibyte characters by their encoded size", () => {
    const content = "é".repeat((SIGNATURE_CONTENT_LIMIT_BYTES - 16) / 2);

    expect(signature_content_fits(content)).toBe(true);
    expect(signature_content_fits(content + "é")).toBe(false);
  });
});

describe("signature_image_budget", () => {
  it("leaves room for the existing content and the image markup", () => {
    const existing = "<p>Best regards</p>";
    const budget = signature_image_budget(existing);
    const image = "x".repeat(budget);

    expect(signature_content_fits(existing + signature_image_html(image))).toBe(
      true,
    );
    expect(
      signature_content_fits(existing + signature_image_html(image + "x")),
    ).toBe(false);
  });

  it("never goes below zero", () => {
    expect(
      signature_image_budget("a".repeat(SIGNATURE_CONTENT_LIMIT_BYTES)),
    ).toBe(0);
  });
});

describe("fit_signature_dimensions", () => {
  it("keeps images within the maximum dimension", () => {
    expect(fit_signature_dimensions(400, 200)).toEqual({
      width: 400,
      height: 200,
    });
  });

  it("scales the longest side down and keeps the aspect ratio", () => {
    expect(fit_signature_dimensions(1200, 300)).toEqual({
      width: 600,
      height: 150,
    });
    expect(fit_signature_dimensions(1000, 4000)).toEqual({
      width: 150,
      height: 600,
    });
  });

  it("never returns a zero dimension", () => {
    expect(fit_signature_dimensions(6000, 1)).toEqual({
      width: 600,
      height: 1,
    });
  });
});

describe("choose_signature_encoding", () => {
  it("returns the first encoding that fits the budget", async () => {
    const encode = vi.fn<SignatureImageEncoder>(
      (width, _height, type, quality) =>
        `data:${type};base64,` + "x".repeat(Math.round(width * quality)),
    );

    const result = await choose_signature_encoding(encode, 600, 200, 500);

    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThanOrEqual(500);
    expect(encode).toHaveBeenCalledWith(600, 200, "image/webp", 0.9);
  });

  it("falls back to JPEG when WebP is not supported", async () => {
    const encode = vi.fn<SignatureImageEncoder>((_w, _h, type) =>
      type === "image/webp" ? null : "data:image/jpeg;base64,abc",
    );

    const result = await choose_signature_encoding(encode, 600, 200, 100);

    expect(result).toBe("data:image/jpeg;base64,abc");
    expect(
      encode.mock.calls.filter(([, , type]) => type === "image/webp"),
    ).toHaveLength(1);
  });

  it("scales the image down when quality alone is not enough", async () => {
    const encode = vi.fn<SignatureImageEncoder>(
      (width, height, type) =>
        `data:${type};base64,` + "x".repeat(width * height),
    );

    const result = await choose_signature_encoding(encode, 100, 100, 3000);

    expect(result).not.toBeNull();
    const last_call = encode.mock.calls[encode.mock.calls.length - 1];

    expect(last_call[0]).toBe(50);
    expect(last_call[1]).toBe(50);
  });

  it("returns null when nothing fits", async () => {
    const encode: SignatureImageEncoder = (_w, _h, type) =>
      `data:${type};base64,` + "x".repeat(1000);

    expect(await choose_signature_encoding(encode, 600, 600, 10)).toBeNull();
  });
});

describe("prepare_signature_image", () => {
  it("rejects files above the source size limit without reading them", async () => {
    const file = new File(["x"], "big.png", { type: "image/png" });

    Object.defineProperty(file, "size", { value: 21 * 1024 * 1024 });

    expect(await prepare_signature_image(file, 1000)).toEqual({
      ok: false,
      reason: "too_large",
    });
  });
});
