//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//

import { describe, it, expect } from "vitest";

import { strip_outgoing_markers } from "./outgoing_markers";
import { assemble_reply_with_placement } from "./signature_placement";

describe("strip_outgoing_markers", () => {
  it("removes the signature id and keeps the signature marker", () => {
    expect(
      strip_outgoing_markers(
        '<div data-aster-signature="1" data-aster-signature-id="sig_1">Regards</div>',
      ),
    ).toBe('<div data-aster-signature="1">Regards</div>');
  });

  it("removes single quoted and unquoted values in any case", () => {
    expect(
      strip_outgoing_markers("<div data-aster-signature-id='x1'>a</div>"),
    ).toBe("<div>a</div>");
    expect(
      strip_outgoing_markers("<div DATA-ASTER-SIGNATURE-ID=x1>a</div>"),
    ).toBe("<div>a</div>");
  });

  it("keeps text that mentions the attribute", () => {
    const html = '<p>data-aster-signature-id="abc" is text</p>';

    expect(strip_outgoing_markers(html)).toBe(html);
  });

  it("leaves html without the attribute unchanged", () => {
    const html = '<div class="a">x &lt; y</div><br>';

    expect(strip_outgoing_markers(html)).toBe(html);
    expect(strip_outgoing_markers("")).toBe("");
  });

  it("handles quoted angle brackets inside a tag", () => {
    expect(
      strip_outgoing_markers(
        '<div title="a > b" data-aster-signature-id="s">x</div>',
      ),
    ).toBe('<div title="a > b">x</div>');
  });

  it("strips the id after below placement was resolved", () => {
    const assembled = assemble_reply_with_placement(
      '<div>Hi</div><div data-aster-signature="1" data-aster-signature-id="sig_1">Regards</div>',
      "<blockquote>old</blockquote>",
      (id) => (id === "sig_1" ? "below" : "above"),
    );

    expect(assembled.indexOf("old")).toBeLessThan(assembled.indexOf("Regards"));
    const out = strip_outgoing_markers(assembled);

    expect(out).not.toContain("data-aster-signature-id");
    expect(out).not.toContain("sig_1");
    expect(out).toContain('data-aster-signature="1"');
  });
});
