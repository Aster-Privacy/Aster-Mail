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
import type { DecryptedEnvelope, MailItemMetadata } from "@/types/email";
import type { MailItem } from "@/services/api/mail";

import { describe, it, expect } from "vitest";

import { matches_query } from "./matching";

import { parse_search_query } from "@/utils/search_operators";
import { slim_envelope_for_index } from "@/services/search_index_store";
const envelope: DecryptedEnvelope = {
  subject: "Invoice",
  body_text: "Please see the attached document.",
  body_html: "",
  from: { name: "Billing", email: "billing@example.com" },
  to: [],
  cc: [],
  bcc: [],
  sent_at: "2026-01-01T00:00:00Z",
  attachment_keys: [
    {
      seq: 0,
      key: "test-key",
      filename: "Invoice.PDF",
      content_type: "application/pdf",
    },
  ],
};
const metadata = { has_attachments: true } as MailItemMetadata;
const item = {
  id: "invoice",
  item_type: "received",
  is_trashed: false,
  is_spam: false,
  created_at: envelope.sent_at,
} as MailItem;

function match(query: string, source: DecryptedEnvelope = envelope) {
  return matches_query(
    [],
    parse_search_query(query).operators,
    source,
    metadata,
    item,
  );
}
describe("attachment search", () => {
  it.each([
    "filename:invoice.pdf",
    "attachment:invoice",
    "has:pdf",
    "has:attachment",
  ])("matches actual attachment metadata with %s", (query) =>
    expect(match(query)).toBe(true),
  );
  it("does not match body mentions of a filename or type", () => {
    const source = {
      ...envelope,
      body_text: "Send invoice.pdf next week.",
      attachment_keys: [
        {
          seq: 0,
          key: "test-key",
          filename: "photo.png",
          content_type: "image/png",
        },
      ],
    };

    expect(match("filename:invoice.pdf", source)).toBe(false);
    expect(match("has:pdf", source)).toBe(false);
  });
  it("matches PDFs without an extension using their MIME type", () => {
    expect(
      match("has:pdf", {
        ...envelope,
        attachment_keys: [
          {
            seq: 0,
            key: "test-key",
            filename: "invoice",
            content_type: "application/pdf",
          },
        ],
      }),
    ).toBe(true);
  });
  it("does not mistake a middle-of-name extension for a file type", () => {
    expect(
      match("has:pdf", {
        ...envelope,
        attachment_keys: [
          {
            seq: 0,
            key: "test-key",
            filename: "invoice.pdf.txt",
            content_type: "text/plain",
          },
        ],
      }),
    ).toBe(false);
  });
  it("keeps names and MIME types in the index without attachment keys", () => {
    const slim = slim_envelope_for_index(envelope);

    expect(slim.attachment_metadata).toEqual([
      { filename: "Invoice.PDF", content_type: "application/pdf" },
    ]);
    expect(slim.attachment_keys).toBeUndefined();
    expect(JSON.stringify(slim)).not.toContain("test-key");
    expect(match("filename:invoice.pdf", slim)).toBe(true);
    expect(match("has:pdf", slim)).toBe(true);
    expect(match("filename:invoice.pdf", slim_envelope_for_index(slim))).toBe(
      true,
    );
  });
  it("supports negated filename filters", () => {
    expect(match("-filename:invoice.pdf")).toBe(false);
    expect(match("-filename:other.pdf")).toBe(true);
  });
  it("falls back to message text when the envelope lists no attachments", () => {
    const source = {
      ...envelope,
      body_text: "invoice.pdf",
      attachment_keys: undefined,
    };

    expect(match("filename:invoice.pdf", source)).toBe(true);
    expect(match("has:pdf", source)).toBe(true);
    expect(match("has:video", source)).toBe(false);
    expect(slim_envelope_for_index(source).attachment_metadata).toBeUndefined();
  });
  it("bounds the attachment metadata kept in the index", () => {
    const slim = slim_envelope_for_index({
      ...envelope,
      attachment_keys: Array.from({ length: 80 }, (_, seq) => ({
        seq,
        key: "test-key",
        filename: "a".repeat(400),
        content_type: "application/pdf",
      })),
    });

    expect(slim.attachment_metadata).toHaveLength(50);
    expect(slim.attachment_metadata?.[0].filename).toHaveLength(255);
  });
});
