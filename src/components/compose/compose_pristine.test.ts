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
  compose_body_text,
  is_body_pristine,
  is_compose_pristine,
  type PristineComposeInput,
} from "@/components/compose/compose_pristine";

const SIGNATURE_HTML =
  '<div class="aster-signature" data-aster-signature="sig_a"><p>Best Regards,</p><p>The Aster Team</p></div>';

const OTHER_SIGNATURE_HTML =
  '<div class="aster-signature" data-aster-signature="sig_b"><p>Thanks,</p><p>Support</p></div>';

const INSERTED_BODY = `<div><br></div><div><br></div>${SIGNATURE_HTML}`;

function input(overrides: Partial<PristineComposeInput>): PristineComposeInput {
  return {
    recipients: { to: [], cc: [], bcc: [] },
    subject: "",
    attachment_count: 0,
    message: INSERTED_BODY,
    auto_inserted_bodies: [INSERTED_BODY],
    ...overrides,
  };
}

describe("is_compose_pristine", () => {
  it("treats an empty compose as pristine", () => {
    expect(
      is_compose_pristine(input({ message: "", auto_inserted_bodies: [] })),
    ).toBe(true);
  });

  it("treats a body that holds only the inserted signature as pristine", () => {
    expect(is_compose_pristine(input({}))).toBe(true);
  });

  it("is not pristine once one character is added to the signature body", () => {
    const message = `<div>a</div><div><br></div>${SIGNATURE_HTML}`;

    expect(is_compose_pristine(input({ message }))).toBe(false);
  });

  it("ignores whitespace, nbsp, zero-width, and line break variants", () => {
    const variants = [
      `<div>&nbsp;</div>${SIGNATURE_HTML}`,
      `\n  <div><br><br></div>\u200b${SIGNATURE_HTML}\n\t`,
      `<p> </p>${SIGNATURE_HTML.replace("<p>The", "<p>  The ")}`,
      `${SIGNATURE_HTML}<div>\ufeff</div>`,
      "Best Regards,\nThe Aster Team",
      "   Best   Regards,<br><br>The Aster Team  ",
    ];

    for (const message of variants) {
      expect(is_compose_pristine(input({ message }))).toBe(true);
    }
  });

  it("matches an HTML signature with formatting, links, and images", () => {
    const html_signature =
      '<div data-aster-signature="sig_html"><table><tr><td><img src="https://example.com/logo.png" alt="logo"></td><td><strong>Jordan</strong><br><a href="https://example.com">example.com</a></td></tr></table><style>.x{color:red}</style></div>';
    const inserted = `<div><br></div>${html_signature}`;

    expect(
      is_compose_pristine(
        input({ message: inserted, auto_inserted_bodies: [inserted] }),
      ),
    ).toBe(true);

    const with_extra_image = `<div><img src="blob:local"></div>${html_signature}`;

    expect(
      is_compose_pristine(
        input({ message: with_extra_image, auto_inserted_bodies: [inserted] }),
      ),
    ).toBe(false);
  });

  it("follows the signature for the identity selected after a switch", () => {
    const switched_body = `<div><br></div><div><br></div>${OTHER_SIGNATURE_HTML}`;
    const baselines = [INSERTED_BODY, OTHER_SIGNATURE_HTML];

    expect(
      is_compose_pristine(
        input({ message: switched_body, auto_inserted_bodies: baselines }),
      ),
    ).toBe(true);

    expect(
      is_compose_pristine(
        input({
          message: `<div>Hi</div>${OTHER_SIGNATURE_HTML}`,
          auto_inserted_bodies: baselines,
        }),
      ),
    ).toBe(false);

    expect(
      is_compose_pristine(
        input({
          message: switched_body,
          auto_inserted_bodies: [INSERTED_BODY],
        }),
      ),
    ).toBe(false);
  });

  it("is not pristine with only an attachment", () => {
    expect(
      is_compose_pristine(
        input({ message: "", auto_inserted_bodies: [], attachment_count: 1 }),
      ),
    ).toBe(false);
    expect(is_compose_pristine(input({ attachment_count: 1 }))).toBe(false);
  });

  it("is not pristine with only a subject", () => {
    expect(
      is_compose_pristine(
        input({ message: "", auto_inserted_bodies: [], subject: "Plans" }),
      ),
    ).toBe(false);
    expect(is_compose_pristine(input({ subject: "Plans" }))).toBe(false);
  });

  it("treats a whitespace-only subject as empty", () => {
    expect(is_compose_pristine(input({ subject: "   " }))).toBe(true);
  });

  it("is not pristine with any recipient", () => {
    expect(
      is_compose_pristine(
        input({ recipients: { to: ["a@example.com"], cc: [], bcc: [] } }),
      ),
    ).toBe(false);
    expect(
      is_compose_pristine(
        input({ recipients: { to: [], cc: ["a@example.com"], bcc: [] } }),
      ),
    ).toBe(false);
    expect(
      is_compose_pristine(
        input({ recipients: { to: [], cc: [], bcc: ["a@example.com"] } }),
      ),
    ).toBe(false);
  });

  it("does not treat a signature-only body as pristine without a baseline", () => {
    expect(is_compose_pristine(input({ auto_inserted_bodies: [] }))).toBe(
      false,
    );
  });
});

describe("compose_body_text", () => {
  it("separates block elements so words never merge", () => {
    expect(compose_body_text("<p>Best</p><p>Regards</p>")).toBe("Best Regards");
  });

  it("decodes entities in escaped plain text", () => {
    expect(compose_body_text("a &amp; b<br>c")).toBe("a & b c");
  });

  it("returns an empty string for markup with no visible content", () => {
    expect(compose_body_text("<div><br></div><div>&nbsp;</div>")).toBe("");
    expect(is_body_pristine("<div><br></div>", [])).toBe(true);
  });
});
