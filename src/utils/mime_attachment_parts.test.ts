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
import { describe, expect, it } from "vitest";

import {
  decode_encoded_words,
  extract_mime_attachments,
} from "./mime_attachment_parts";

import {
  file_part,
  multipart,
  pseudo_random_bytes,
  sha256_hex,
  text_part,
} from "@/tests/fixtures/pgp_mime_fixture";

const pdf_bytes = new TextEncoder().encode("%PDF-1.4\n%test fixture\n");
const png_bytes = pseudo_random_bytes(2048, 7);

describe("extract_mime_attachments", () => {
  it("returns nothing for a plain text payload", () => {
    expect(extract_mime_attachments("hello there")).toEqual([]);
    expect(
      extract_mime_attachments(text_part("plain", "only a body")),
    ).toEqual([]);
  });

  it("keeps attachments from a multipart/mixed payload", async () => {
    const raw = multipart("mixed", "b1", [
      text_part("plain", "see attached"),
      file_part({
        filename_header: 'filename="report.pdf"',
        content_type: "application/pdf",
        data: pdf_bytes,
      }),
    ]);

    const parts = extract_mime_attachments(raw);

    expect(parts).toHaveLength(1);
    expect(parts[0]?.filename).toBe("report.pdf");
    expect(parts[0]?.content_type).toBe("application/pdf");
    expect(await sha256_hex(parts[0]!.data)).toBe(await sha256_hex(pdf_bytes));
  });

  it("walks nested alternative and related parts and keeps inline cid images", async () => {
    const raw = multipart("mixed", "outer", [
      multipart("related", "rel", [
        multipart("alternative", "alt", [
          text_part("plain", "hi"),
          text_part("html", '<p>hi <img src="cid:logo@fixture"></p>'),
        ]),
        file_part({
          filename_header: 'filename="logo.png"',
          content_type: "image/png",
          data: png_bytes,
          disposition: "inline",
          content_id: "logo@fixture",
        }),
      ]),
      file_part({
        filename_header: 'filename="notes.txt"',
        content_type: "text/plain",
        data: new TextEncoder().encode("line one\r\nline two=done\r\n"),
        encoding: "quoted-printable",
      }),
    ]);

    const parts = extract_mime_attachments(raw);

    expect(parts.map((p) => p.filename)).toEqual(["logo.png", "notes.txt"]);
    expect(parts[0]?.content_id).toBe("logo@fixture");
    expect(parts[0]?.is_inline).toBe(true);
    expect(await sha256_hex(parts[0]!.data)).toBe(await sha256_hex(png_bytes));
    expect(new TextDecoder().decode(parts[1]!.data)).toBe(
      "line one\r\nline two=done\r\n",
    );
  });

  it("decodes quoted-printable binary bytes exactly", async () => {
    const data = pseudo_random_bytes(3000, 99);
    const raw = multipart("mixed", "qp", [
      text_part("plain", "body"),
      file_part({
        filename_header: 'filename="blob.bin"',
        content_type: "application/octet-stream",
        data,
        encoding: "quoted-printable",
      }),
    ]);

    const parts = extract_mime_attachments(raw);

    expect(await sha256_hex(parts[0]!.data)).toBe(await sha256_hex(data));
  });

  it("restores CRLF hard line breaks in quoted-printable text after LF normalization", () => {
    const raw = [
      'Content-Type: multipart/mixed; boundary="t"',
      "",
      "--t",
      "Content-Type: text/plain",
      "",
      "body",
      "--t",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Disposition: attachment; filename=\"notes.txt\"",
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "caf=C3=A9 =3D cr=C3=A8me  ",
      "line two with a soft=",
      " break",
      "--t--",
      "",
    ].join("\n");

    const parts = extract_mime_attachments(raw);

    expect(new TextDecoder().decode(parts[0]!.data)).toBe(
      "café = crème\r\nline two with a soft break",
    );
  });

  it("decodes RFC 2231 and RFC 2047 filenames", () => {
    const raw = multipart("mixed", "names", [
      text_part("plain", "body"),
      file_part({
        filename_header: "filename*=UTF-8''r%C3%A9sum%C3%A9%20final.pdf",
        content_type: "application/pdf",
        data: pdf_bytes,
      }),
      file_part({
        filename_header:
          "filename*0*=UTF-8''%E6%97%A5%E6%9C%AC; filename*1*=%E8%AA%9E; filename*2=.txt",
        content_type: "text/plain",
        data: new TextEncoder().encode("x"),
      }),
      file_part({
        filename_header: 'filename="=?UTF-8?B?0J/RgNC40LLQtdGCLmRvY3g=?="',
        content_type:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        data: new TextEncoder().encode("docx"),
      }),
      file_part({
        filename_header: 'filename="=?ISO-8859-1?Q?caf=E9_menu.txt?="',
        content_type: "text/plain",
        data: new TextEncoder().encode("menu"),
      }),
    ]);

    expect(extract_mime_attachments(raw).map((p) => p.filename)).toEqual([
      "résumé final.pdf",
      "日本語.txt",
      "Привет.docx",
      "café menu.txt",
    ]);
  });

  it("falls back to the Content-Type name parameter", () => {
    const raw = multipart("mixed", "n", [
      text_part("plain", "body"),
      'Content-Type: application/zip; name="archive.zip"\r\nContent-Transfer-Encoding: base64\r\n\r\nUEsDBA==',
    ]);

    const parts = extract_mime_attachments(raw);

    expect(parts[0]?.filename).toBe("archive.zip");
    expect(Array.from(parts[0]!.data)).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it("keeps every attachment when several are present", () => {
    const files = Array.from({ length: 6 }, (_, i) =>
      file_part({
        filename_header: `filename="file_${i}.bin"`,
        content_type: "application/octet-stream",
        data: pseudo_random_bytes(100 + i, i + 1),
      }),
    );
    const raw = multipart("mixed", "many", [text_part("plain", "b"), ...files]);

    expect(extract_mime_attachments(raw).map((p) => p.filename)).toEqual(
      Array.from({ length: 6 }, (_, i) => `file_${i}.bin`),
    );
  });

  it("decodes a multi-megabyte attachment byte for byte", async () => {
    const data = pseudo_random_bytes(6 * 1024 * 1024, 1234);
    const raw = multipart("mixed", "big", [
      text_part("plain", "big file"),
      file_part({
        filename_header: 'filename="big.bin"',
        content_type: "application/octet-stream",
        data,
      }),
    ]);

    const parts = extract_mime_attachments(raw);

    expect(parts[0]?.data.length).toBe(data.length);
    expect(await sha256_hex(parts[0]!.data)).toBe(await sha256_hex(data));
  });

  it("skips signatures, protected headers, and body parts inside multipart/signed", () => {
    const signed = multipart(
      "signed",
      "sig",
      [
        multipart("mixed", "inner", [
          'Content-Type: text/plain; charset=utf-8; protected-headers="v1"\r\nContent-Disposition: inline\r\n\r\nSubject: hidden',
          'Content-Type: text/rfc822-headers; protected-headers="v1"\r\n\r\nSubject: hidden',
          text_part("html", "<p>body</p>"),
          file_part({
            filename_header: 'filename="kept.pdf"',
            content_type: "application/pdf",
            data: pdf_bytes,
          }),
        ]),
        'Content-Type: application/pgp-signature; name="signature.asc"\r\nContent-Disposition: attachment; filename="signature.asc"\r\n\r\n-----BEGIN PGP SIGNATURE-----\r\nAAAA\r\n-----END PGP SIGNATURE-----',
      ],
      '; protocol="application/pgp-signature"; micalg=pgp-sha256',
    );

    expect(extract_mime_attachments(signed).map((p) => p.filename)).toEqual([
      "kept.pdf",
    ]);
  });
});

describe("decode_encoded_words", () => {
  it("joins adjacent encoded words without the space between them", () => {
    expect(
      decode_encoded_words("=?UTF-8?Q?caf=C3=A9?= =?UTF-8?Q?_bar.txt?="),
    ).toBe("café bar.txt");
  });
});
