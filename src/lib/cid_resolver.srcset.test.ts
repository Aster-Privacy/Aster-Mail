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

vi.mock("@/services/api/attachments", () => ({
  list_attachments: vi.fn(),
}));

vi.mock("@/services/crypto/attachment_crypto", () => ({
  decrypt_attachment_meta: vi.fn(),
  decrypt_attachment_data: vi.fn(),
}));

import {
  extract_cid_references,
  replace_cid_reference,
  strip_unresolved_cid_references,
} from "./cid_resolver";

const TRANSPARENT_GIF =
  "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

describe("srcset content-id references", () => {
  it("extracts every candidate from a multi-density srcset", () => {
    const html =
      '<img src="cid:logo@a" srcset="cid:logo@a 1x, cid:logo2x@a 2x" alt="logo">';

    expect(extract_cid_references(html)).toEqual([
      "logo@a",
      "logo@a",
      "logo2x@a",
    ]);
  });

  it("extracts a lone candidate that carries a density descriptor", () => {
    const html = '<img srcset="cid:banner@a 2x" alt="banner">';

    expect(extract_cid_references(html)).toEqual(["banner@a"]);
  });

  it("replaces one candidate and keeps the descriptor and the siblings", () => {
    const html = '<img srcset="cid:logo@a 1x, cid:logo2x@a 2x" alt="logo">';

    const replaced = replace_cid_reference(html, "logo2x@a", "blob:resolved");

    expect(replaced).toBe(
      '<img srcset="cid:logo@a 1x, blob:resolved 2x" alt="logo">',
    );
  });

  it("leaves a srcset alone when no candidate matches the content id", () => {
    const html = '<img srcset="cid:logo@a 1x" alt="logo">';

    expect(replace_cid_reference(html, "other@a", "blob:resolved")).toBe(html);
  });

  it("drops only the unresolved candidates when stripping", () => {
    const html = '<img srcset="blob:kept 1x, cid:missing@a 2x" alt="logo">';

    expect(strip_unresolved_cid_references(html)).toBe(
      '<img srcset="blob:kept 1x" alt="logo">',
    );
  });

  it("falls back to a transparent pixel when every candidate is unresolved", () => {
    const html = '<img srcset="cid:missing@a 1x, cid:missing2x@a 2x" alt="x">';

    expect(strip_unresolved_cid_references(html)).toBe(
      `<img srcset="${TRANSPARENT_GIF}" alt="x">`,
    );
  });

  it("keeps a plain srcset with no content ids untouched", () => {
    const html = '<img srcset="https://example.test/a.png 1x" alt="x">';

    expect(strip_unresolved_cid_references(html)).toBe(html);
  });
});

describe("srcset candidates that contain commas", () => {
  const png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  it("keeps a resolved data url intact when a later pass strips the rest", () => {
    const html = `<img srcset="cid:one 1x, cid:two 2x">`;
    const resolved = replace_cid_reference(html, "one", png);
    const stripped = strip_unresolved_cid_references(resolved);

    expect(stripped).toContain(`${png} 1x`);
    expect(stripped).not.toContain("cid:two");
  });

  it("resolves both candidates without corrupting the first data url", () => {
    const html = `<img srcset="cid:one 1x, cid:two 2x">`;
    const once = replace_cid_reference(html, "one", png);
    const twice = replace_cid_reference(once, "two", png);

    expect(twice).toBe(`<img srcset="${png} 1x, ${png} 2x">`);
  });

  it("treats a trailing comma on a url as the end of the candidate", () => {
    const html = `<img srcset="cid:one, cid:two 2x">`;

    expect(extract_cid_references(html)).toEqual(["one", "two"]);
  });

  it("keeps a data url that carries no descriptor", () => {
    const html = `<img srcset="cid:one">`;
    const resolved = replace_cid_reference(html, "one", png);

    expect(resolved).toBe(`<img srcset="${png}">`);
  });
});
