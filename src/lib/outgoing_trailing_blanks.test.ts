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
  prepare_outgoing_html,
  trim_outgoing_trailing_blanks,
} from "./outgoing_trailing_blanks";
import { assemble_reply_with_placement } from "./signature_placement";

const SIGNATURE =
  '<div data-aster-signature="1">Best regards,<br>Aster Support</div>';

describe("trim_outgoing_trailing_blanks", () => {
  it("removes empty blocks after the signature", () => {
    expect(
      trim_outgoing_trailing_blanks(
        `<div>Hi,</div><div><br></div>${SIGNATURE}<div><br></div><div><br></div>`,
      ),
    ).toBe(`<div>Hi,</div><div><br></div>${SIGNATURE}`);
  });

  it("removes empty blocks inside the last block", () => {
    expect(
      trim_outgoing_trailing_blanks(
        '<div>Hi,</div><div data-aster-signature="1">Best regards,<br>Aster Support<div><br></div><p>&nbsp;</p></div>',
      ),
    ).toBe(
      '<div>Hi,</div><div data-aster-signature="1">Best regards,<br>Aster Support</div>',
    );
  });

  it("removes trailing line breaks and whitespace", () => {
    expect(
      trim_outgoing_trailing_blanks(
        "Best regards,<br>Aster Support<br><br>&nbsp; \n",
      ),
    ).toBe("Best regards,<br>Aster Support");
  });

  it("keeps blank lines inside the message and the signature", () => {
    const html = `<div>Hi,</div><div><br></div><div><br></div><div>Thanks.</div><div data-aster-signature="1">Best regards,<br><br>Aster Support</div>`;

    expect(trim_outgoing_trailing_blanks(html)).toBe(html);
  });

  it("returns the input unchanged when nothing trails", () => {
    const html = `<div>Hi,</div>${SIGNATURE}`;

    expect(trim_outgoing_trailing_blanks(html)).toBe(html);
  });

  it("keeps a quote that has content", () => {
    const html = `<div>Hi,</div>${SIGNATURE}<br><br><div class="aster_quote"><div class="aster_quote_attr">On Mon, Bob wrote:</div><blockquote class="aster_quote_body"><div>Original</div><div><br></div></blockquote></div>`;

    expect(trim_outgoing_trailing_blanks(html)).toBe(html);
  });

  it("drops an empty quote and the breaks before it", () => {
    expect(
      trim_outgoing_trailing_blanks(
        `<div>Hi,</div>${SIGNATURE}<br><br><div class="aster_quote"><div class="aster_quote_attr">On Mon, Bob wrote:</div><blockquote class="aster_quote_body"><div><br></div></blockquote></div>`,
      ),
    ).toBe(`<div>Hi,</div>${SIGNATURE}`);
  });

  it("keeps trailing images and styled spacers", () => {
    const image = `${SIGNATURE}<div><img src="cid:logo"></div>`;
    const spacer = `${SIGNATURE}<div style="height:20px"></div>`;

    expect(trim_outgoing_trailing_blanks(image)).toBe(image);
    expect(trim_outgoing_trailing_blanks(spacer)).toBe(spacer);
  });

  it("returns an empty body unchanged", () => {
    expect(trim_outgoing_trailing_blanks("")).toBe("");
  });
});

describe("prepare_outgoing_html", () => {
  it("strips signature ids and trailing blanks together", () => {
    expect(
      prepare_outgoing_html(
        '<div>Hi,</div><div data-aster-signature="1" data-aster-signature-id="sig_1">Aster Support</div><div><br></div><div><br></div>',
      ),
    ).toBe('<div>Hi,</div><div data-aster-signature="1">Aster Support</div>');
  });

  it("keeps the trimmed body stable when sent twice", () => {
    const once = prepare_outgoing_html(
      `<div>Hi,</div>${SIGNATURE}<div><br></div>`,
    );

    expect(prepare_outgoing_html(once)).toBe(once);
  });

  it("leaves no blank lines between the signature and the quoted reply", () => {
    const quote =
      '<div class="aster_quote"><div>On Monday, you wrote:</div><blockquote>Original</blockquote></div>';
    const body = trim_outgoing_trailing_blanks(
      `<div>Thanks,</div>${SIGNATURE}<div><br></div><p>&nbsp;</p><div><br></div>`,
    );
    const assembled = assemble_reply_with_placement(body, quote, () => "above");

    expect(assembled).toBe(`<div>Thanks,</div>${SIGNATURE}${quote}`);
  });
});
