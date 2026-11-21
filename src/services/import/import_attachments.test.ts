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
import type { ImportLoadItem } from "./import_collection";
import type { ParsedEmail } from "./types";

import { describe, it, expect, vi, beforeEach } from "vitest";

const encrypt_mock = vi.hoisted(() => vi.fn());

vi.mock("@/services/crypto/attachment_crypto", () => ({
  encrypt_attachments_for_send: encrypt_mock,
}));

import { parse_eml } from "./eml_parser";
import { build_import_collection } from "./import_collection";
import { plan_import_fills, should_flush_import_batch } from "./import_fill";
import {
  encrypt_import_attachments,
  encrypted_attachment_bytes,
} from "./attachments";
import { extract_part_filename, may_carry_attachments } from "./mime_utils";

const PDF_BYTES = new TextEncoder().encode(
  "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << >>\n%%EOF\n",
);
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0xff, 0x00, 0x80, 0x7f,
]);

function to_base64(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replace(/(.{60})/g, "$1\r\n");
}

function make_eml(message_id: string): string {
  return [
    "From: Sender <sender@example.com>",
    "To: user@example.com",
    "Subject: Quarterly report",
    `Message-ID: <${message_id}>`,
    "Date: Mon, 05 Jan 2026 10:00:00 +0000",
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="outer"',
    "",
    "--outer",
    'Content-Type: multipart/related; boundary="inner"',
    "",
    "--inner",
    "Content-Type: text/html; charset=utf-8",
    "",
    '<p>See the chart <img src="cid:chart@example.com"></p>',
    "--inner",
    "Content-Type: image/png",
    "Content-Transfer-Encoding: base64",
    "Content-ID: <chart@example.com>",
    "Content-Disposition: inline",
    "",
    to_base64(PNG_BYTES),
    "--inner--",
    "",
    "--outer",
    "Content-Type: application/pdf",
    "Content-Transfer-Encoding: base64",
    "Content-Disposition: attachment; filename*=UTF-8''R%C3%A9sum%C3%A9%20Q1.pdf",
    "",
    to_base64(PDF_BYTES),
    "--outer",
    "Content-Type: message/rfc822",
    "",
    "From: other@example.com",
    "Subject: Forwarded",
    "",
    "forwarded body",
    "--outer--",
    "",
  ].join("\r\n");
}

function make_mbox(): string {
  const first = make_eml("first@example.com");
  const second = [
    "From: Plain <plain@example.com>",
    "To: user@example.com",
    "Subject: No files",
    "Message-ID: <second@example.com>",
    "Date: Tue, 06 Jan 2026 10:00:00 +0000",
    "",
    "just text",
    "",
  ].join("\r\n");

  return (
    "From sender@example.com Mon Jan 05 10:00:00 2026\r\n" +
    first +
    "\r\nFrom plain@example.com Tue Jan 06 10:00:00 2026\r\n" +
    second
  );
}

function as_file(text: string, name: string): File {
  return new File([new TextEncoder().encode(text)], name);
}

async function collect(
  generator: AsyncGenerator<ImportLoadItem>,
): Promise<ImportLoadItem[]> {
  const items: ImportLoadItem[] = [];

  for await (const item of generator) items.push(item);

  return items;
}

function by_name(email: ParsedEmail, name: string) {
  return email.attachments.find((attachment) => attachment.filename === name);
}

describe("EML attachments", () => {
  it("keeps only metadata when content is not requested", () => {
    const email = parse_eml(make_eml("meta@example.com"));

    expect(email.attachments.map((a) => a.filename)).toEqual([
      "attachment",
      "Résumé Q1.pdf",
      "message.eml",
    ]);
    expect(email.attachments.every((a) => a.content.length === 0)).toBe(true);
  });

  it("decodes attachment bytes, inline images, and attached messages", () => {
    const email = parse_eml(make_eml("full@example.com"), {
      attachment_content: true,
    });
    const pdf = by_name(email, "Résumé Q1.pdf");
    const image = email.attachments.find((a) => a.content_type === "image/png");
    const forwarded = by_name(email, "message.eml");

    expect(pdf?.content).toEqual(PDF_BYTES);
    expect(pdf?.content_type).toBe("application/pdf");
    expect(pdf?.is_inline).toBeUndefined();
    expect(image?.content).toEqual(PNG_BYTES);
    expect(image?.content_id).toBe("chart@example.com");
    expect(image?.is_inline).toBe(true);
    expect(new TextDecoder().decode(forwarded?.content)).toContain(
      "Subject: Forwarded",
    );
    expect(email.html_body).toContain("cid:chart@example.com");
  });

  it("loads attachment bytes from an EML file in the collection", async () => {
    const collection = await build_import_collection([
      as_file(make_eml("file@example.com"), "report.eml"),
    ]);
    const [without] = await collect(collection.load(new Set([0])));
    const [with_content] = await collect(
      collection.load(new Set([0]), { attachment_content: true }),
    );

    expect(
      without.email?.attachments.every((a) => a.content.length === 0),
    ).toBe(true);
    expect(by_name(with_content.email!, "Résumé Q1.pdf")?.content).toEqual(
      PDF_BYTES,
    );
  });
});

describe("filename encodings", () => {
  it("reads RFC 2231 continuations and encoded words", () => {
    expect(
      extract_part_filename(
        "attachment; filename*0*=UTF-8''%E6%97%A5; filename*1*=%E6%9C%AC.pdf",
        "application/pdf",
      ),
    ).toBe("日本.pdf");
    expect(
      extract_part_filename(
        'attachment; filename*0="long name "; filename*1="part.txt"',
        "text/plain",
      ),
    ).toBe("long name part.txt");
    expect(
      extract_part_filename("", 'image/png; name="=?UTF-8?B?w6l0w6kucG5n?="'),
    ).toBe("été.png");
  });
});

describe("MBOX attachments", () => {
  it("streams attachment bytes for each message when requested", async () => {
    const collection = await build_import_collection([
      as_file(make_mbox(), "Inbox.mbox"),
    ]);

    expect(collection.summaries).toHaveLength(2);
    expect(collection.summaries[0].attachment_hint).toBe(true);
    expect(collection.summaries[1].attachment_hint).toBe(false);

    const [first, second] = await collect(
      collection.load(new Set([0, 1]), { attachment_content: true }),
    );

    expect(by_name(first.email!, "Résumé Q1.pdf")?.content).toEqual(PDF_BYTES);
    expect(second.email?.attachments).toEqual([]);

    const [summary_only] = await collect(collection.load(new Set([0])));

    expect(
      summary_only.email?.attachments.every((a) => a.content.length === 0),
    ).toBe(true);
  });

  it("flags only content types that can carry files", () => {
    expect(may_carry_attachments("multipart/mixed; boundary=x")).toBe(true);
    expect(may_carry_attachments("application/pdf")).toBe(true);
    expect(may_carry_attachments("multipart/alternative; boundary=x")).toBe(
      false,
    );
    expect(may_carry_attachments("text/plain")).toBe(false);
    expect(may_carry_attachments(undefined)).toBe(false);
  });
});

describe("re-import fill planning", () => {
  const emails = [
    parse_eml(make_eml("a@example.com")),
    parse_eml(
      "From: x@example.com\r\nMessage-ID: <b@example.com>\r\n\r\nhi\r\n",
    ),
    parse_eml(make_eml("c@example.com")),
  ];
  const hashes = new Map([
    ["a@example.com", "hash-a"],
    ["b@example.com", "hash-b"],
    ["c@example.com", "hash-c"],
  ]);

  it("fills nothing on the free plan", () => {
    expect(
      plan_import_fills(emails, hashes, new Set(["hash-a", "hash-b"]), false),
    ).toEqual(new Set());
  });

  it("fills duplicates that are missing attachments on paid plans", () => {
    expect(
      plan_import_fills(emails, hashes, new Set(["hash-a", "hash-b"]), true),
    ).toEqual(new Set([0]));
  });

  it("splits batches before they pass the byte limit", () => {
    expect(should_flush_import_batch(0, 0, 500, 100)).toBe(false);
    expect(should_flush_import_batch(2, 60, 30, 100)).toBe(false);
    expect(should_flush_import_batch(2, 60, 50, 100)).toBe(true);
  });
});

describe("encrypt_import_attachments", () => {
  beforeEach(() => {
    encrypt_mock.mockReset();
    encrypt_mock.mockImplementation(async (attachments: unknown[]) =>
      attachments.map((_, index) => ({
        encrypted_data: `data-${index}`,
        data_nonce: `nonce-${index}`,
        sender_encrypted_meta: `meta-${index}`,
        sender_meta_nonce: `meta-nonce-${index}`,
        recipient_encrypted_meta: "plain",
        size_bytes: 1,
      })),
    );
  });

  it("encrypts decoded parts with zero-based sequence numbers", async () => {
    const email = parse_eml(make_eml("enc@example.com"), {
      attachment_content: true,
    });
    const encrypted = await encrypt_import_attachments(email);

    expect(encrypt_mock).toHaveBeenCalledTimes(1);

    const [attachments, recipient_keys] = encrypt_mock.mock.calls[0];

    expect(recipient_keys).toBeUndefined();
    expect(
      attachments.map((a: { name: string; is_inline?: boolean }) => [
        a.name,
        a.is_inline === true,
      ]),
    ).toEqual([
      ["attachment", true],
      ["Résumé Q1.pdf", false],
      ["message.eml", false],
    ]);
    expect(encrypted.map((a) => a.seq_num)).toEqual([0, 1, 2]);
    expect(encrypted[1]).toEqual({
      encrypted_data: "data-1",
      data_nonce: "nonce-1",
      encrypted_meta: "meta-1",
      meta_nonce: "meta-nonce-1",
      seq_num: 1,
    });
    expect(encrypted_attachment_bytes(encrypted)).toBeGreaterThan(0);
  });

  it("skips the encryptor when no attachment bytes were loaded", async () => {
    const email = parse_eml(make_eml("none@example.com"));

    expect(await encrypt_import_attachments(email)).toEqual([]);
    expect(encrypt_mock).not.toHaveBeenCalled();
  });
});
