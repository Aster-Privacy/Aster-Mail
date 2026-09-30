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

import { try_extract_mime_body } from "@/utils/email_crypto";

const verify_url = "https://accounts.example.com/verify?token=abc123";

const crlf = (s: string) => s.replace(/\n/g, "\r\n");

const plain_part = `Content-Type: text/plain; charset="UTF-8"
Content-Transfer-Encoding: quoted-printable

Your verification code is 483920.
`;

const html_part = `Content-Type: text/html; charset="UTF-8"
Content-Transfer-Encoding: quoted-printable

<html><body><p>Your verification code is 483920.</p>
<a href=3D"${verify_url.replace(/=/g, "=3D")}">Verify email</a></body></html>
`;

const html_part_folded = `Content-Type: text/html;
\tcharset="UTF-8"
Content-Transfer-Encoding: 7bit

<html><body><a href="${verify_url}">Verify email</a></body></html>
`;

const samples: Record<string, string> = {
  alternative_flat: crlf(`Content-Type: multipart/alternative; boundary="ALT"

--ALT
${plain_part}
--ALT
${html_part}
--ALT--
`),

  mixed_wrapping_alternative:
    crlf(`Content-Type: multipart/mixed; boundary="OUT"

--OUT
Content-Type: multipart/alternative; boundary="ALT"

--ALT
${plain_part}
--ALT
${html_part}
--ALT--

--OUT
Content-Type: image/png; name="logo.png"
Content-Transfer-Encoding: base64

iVBORw0KGgo=
--OUT--
`),

  alternative_with_related:
    crlf(`Content-Type: multipart/alternative; boundary="ALT"

--ALT
${plain_part}
--ALT
Content-Type: multipart/related; boundary="REL"

--REL
${html_part}
--REL
Content-Type: image/png
Content-ID: <logo>
Content-Transfer-Encoding: base64

iVBORw0KGgo=
--REL--

--ALT--
`),

  folded_html_header: crlf(`Content-Type: multipart/alternative; boundary="ALT"

--ALT
${plain_part}
--ALT
${html_part_folded}
--ALT--
`),

  lf_only_line_endings: `Content-Type: multipart/alternative; boundary="ALT"

--ALT
${plain_part}
--ALT
${html_part}
--ALT--
`,

  boundary_with_special_chars:
    crlf(`Content-Type: multipart/alternative; boundary="----=_Part_0_1234.5678"

------=_Part_0_1234.5678
${plain_part}
------=_Part_0_1234.5678
${html_part}
------=_Part_0_1234.5678--
`),

  mixed_plain_first_then_html_sibling:
    crlf(`Content-Type: multipart/mixed; boundary="OUT"

--OUT
${plain_part}
--OUT
${html_part}
--OUT--
`),

  nested_plain_only_before_html_sibling:
    crlf(`Content-Type: multipart/mixed; boundary="OUT"

--OUT
Content-Type: multipart/related; boundary="REL"

--REL
${plain_part}
--REL
Content-Type: image/png
Content-ID: <logo>
Content-Transfer-Encoding: base64

iVBORw0KGgo=
--REL--

--OUT
${html_part}
--OUT--
`),

  signed_wrapping_alternative:
    crlf(`Content-Type: multipart/mixed; boundary="OUT"

--OUT
Content-Type: multipart/signed; protocol="application/pkcs7-signature"; boundary="SIG"

--SIG
Content-Type: multipart/alternative; boundary="ALT"

--ALT
${plain_part}
--ALT
${html_part}
--ALT--

--SIG
Content-Type: application/pkcs7-signature; name="smime.p7s"
Content-Transfer-Encoding: base64

MIIFaQYJKoZ=
--SIG--

--OUT--
`),

  report_wrapping_alternative:
    crlf(`Content-Type: multipart/report; report-type=delivery-status; boundary="RPT"

--RPT
Content-Type: multipart/alternative; boundary="ALT"

--ALT
${plain_part}
--ALT
${html_part}
--ALT--

--RPT--
`),

  attached_text_part_is_not_the_body:
    crlf(`Content-Type: multipart/mixed; boundary="OUT"

--OUT
Content-Type: text/plain; charset="UTF-8"
Content-Disposition: attachment; filename="notes.txt"

do not show this as the body
--OUT
${html_part}
--OUT--
`),
};

describe("mime extraction keeps the html alternative", () => {
  for (const [name, raw] of Object.entries(samples)) {
    it(name, () => {
      const extracted = try_extract_mime_body(raw);

      expect({ name, extracted }).toMatchObject({ name });
      expect(extracted).toContain(verify_url);
    });
  }

  it("falls back to plain text when there is no html part", () => {
    const raw = crlf(`Content-Type: multipart/mixed; boundary="OUT"

--OUT
${plain_part}
--OUT
Content-Type: image/png; name="logo.png"
Content-Transfer-Encoding: base64

iVBORw0KGgo=
--OUT--
`);

    expect(try_extract_mime_body(raw)).toContain("483920");
  });

  it("does not recurse past the depth limit", () => {
    let raw = `Content-Type: text/html\r\n\r\n<a href="${verify_url}">Verify email</a>\r\n`;

    for (let level = 40; level >= 0; level--) {
      raw = `Content-Type: multipart/mixed; boundary="B${level}"\r\n\r\n--B${level}\r\n${raw}--B${level}--\r\n`;
    }

    expect(() => try_extract_mime_body(raw)).not.toThrow();
  });
});
