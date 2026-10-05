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
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  guard_body_step,
  readable_fallback_html,
  readable_fallback_text,
} from "./message_body_fallback";
import {
  RECEIPT_STYLE_MARKERS,
  build_receipt_style_html,
} from "./receipt_style_message_fixture";

import { sanitize_html } from "@/lib/html_sanitizer";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("guard_body_step", () => {
  it("returns the computed value when nothing throws", () => {
    expect(
      guard_body_step(
        "test:ok",
        () => "computed",
        () => "fallback",
      ),
    ).toBe("computed");
  });

  it("returns the fallback when the step throws", () => {
    expect(
      guard_body_step(
        "test:throws",
        (): string => {
          throw new RangeError("Maximum call stack size exceeded");
        },
        () => "fallback",
      ),
    ).toBe("fallback");
  });
});

describe("readable fallback for a receipt-style HTML message", () => {
  const html = build_receipt_style_html();

  it("uses a fixture of realistic size", () => {
    expect(html.length).toBeGreaterThan(45000);
    expect(html.length).toBeLessThan(60000);
  });

  it("extracts the visible text and drops markup and styles", () => {
    const text = readable_fallback_text(html);

    for (const marker of RECEIPT_STYLE_MARKERS) {
      expect(text).toContain(marker);
    }
    expect(text).not.toContain("<td");
    expect(text).not.toContain("mso-table-lspace");
  });

  it("still extracts text when the HTML parser is unavailable", () => {
    vi.stubGlobal(
      "DOMParser",
      class {
        parseFromString(): never {
          throw new Error("parser unavailable");
        }
      },
    );

    const text = readable_fallback_text(html);

    for (const marker of RECEIPT_STYLE_MARKERS) {
      expect(text).toContain(marker);
    }
    expect(text).not.toContain("mso-table-lspace");
  });

  it("falls back to the text part when there is no HTML", () => {
    expect(readable_fallback_text(undefined, "Amount paid $84.00")).toBe(
      "Amount paid $84.00",
    );
    expect(readable_fallback_text("", "")).toBe("");
  });

  it("builds inert HTML that carries no markup from the message", () => {
    const fallback = readable_fallback_html(
      '<table><tr><td onclick="x()">Amount paid</td></tr></table><script>x()</script>',
    );

    expect(fallback).toContain("Amount paid");
    expect(fallback).not.toContain("<table");
    expect(fallback).not.toContain("<script");
    expect(fallback).not.toContain("onclick");
  });
});

describe("receipt-style HTML message through the sanitizer", () => {
  it("sanitizes without throwing and keeps the visible content", () => {
    const result = sanitize_html(build_receipt_style_html(), {
      external_content_mode: "never",
      sandbox_mode: true,
    });

    for (const marker of RECEIPT_STYLE_MARKERS) {
      expect(result.html).toContain(marker);
    }
  });
});
