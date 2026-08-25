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

import {
  assemble_reply_with_placement,
  resolve_signature_placement,
} from "./signature_placement";

const signature =
  '<div data-aster-signature="1" data-aster-signature-id="sig_1">Regards</div>';
const quote = '<div class="aster_quote">quoted</div>';

describe("resolve_signature_placement", () => {
  it("prefers the per signature value", () => {
    expect(resolve_signature_placement("above", "below")).toBe("above");
  });

  it("falls back to the preference", () => {
    expect(resolve_signature_placement(null, "above")).toBe("above");
  });

  it("defaults to below", () => {
    expect(resolve_signature_placement(undefined, undefined)).toBe("below");
  });
});

describe("assemble_reply_with_placement", () => {
  it("moves the signature after the quote when placement is below", () => {
    const result = assemble_reply_with_placement(
      `Hello${signature}`,
      quote,
      () => "below",
    );

    expect(result.indexOf("aster_quote")).toBeLessThan(
      result.indexOf("aster-signature"),
    );
  });

  it("keeps the signature above the quote when placement is above", () => {
    const result = assemble_reply_with_placement(
      `Hello${signature}`,
      quote,
      () => "above",
    );

    expect(result).toBe(`Hello${signature}${quote}`);
  });

  it("resolves placement from the signature id in the body", () => {
    const seen: (string | null)[] = [];

    assemble_reply_with_placement(`Hello${signature}`, quote, (id) => {
      seen.push(id);

      return "above";
    });

    expect(seen).toEqual(["sig_1"]);
  });

  it("leaves a reply without a signature untouched", () => {
    expect(assemble_reply_with_placement("Hello", quote, () => "below")).toBe(
      `Hello${quote}`,
    );
  });

  it("leaves a reply without a quote untouched", () => {
    expect(
      assemble_reply_with_placement(`Hello${signature}`, "", () => "below"),
    ).toBe(`Hello${signature}`);
  });
});
