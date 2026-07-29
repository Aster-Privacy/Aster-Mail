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
import type { MailItem } from "@/services/api/mail";
import type { DecryptedEnvelope, MailItemMetadata } from "@/types/email";

import { describe, it, expect } from "vitest";

import {
  metadata_fingerprint,
  build_snapshot,
  slim_envelope_for_index,
  MAX_INDEX_RECIPIENTS,
} from "@/services/search_index_store";

function make_item(overrides: Partial<MailItem> = {}): MailItem {
  return {
    id: "msg-1",
    item_type: "received",
    encrypted_envelope: "ciphertext-envelope",
    envelope_nonce: "nonce",
    folder_token: "inbox",
    is_external: false,
    created_at: "2026-01-01T00:00:00Z",
    encrypted_metadata: "abcdefghijklmnopqrstuvwxyz0123456789",
    metadata_nonce: "meta-nonce",
    ...overrides,
  } as MailItem;
}

describe("metadata_fingerprint", () => {
  it("is stable for identical ciphertext", () => {
    expect(metadata_fingerprint(make_item())).toBe(
      metadata_fingerprint(make_item()),
    );
  });

  it("changes when the encrypted metadata changes", () => {
    const a = metadata_fingerprint(make_item());
    const b = metadata_fingerprint(
      make_item({ encrypted_metadata: "ZYXWVUTSRQPONMLKJIHGFEDCBA9876543210" }),
    );

    expect(a).not.toBe(b);
  });

  it("changes when the metadata nonce changes", () => {
    const a = metadata_fingerprint(make_item());
    const b = metadata_fingerprint(make_item({ metadata_nonce: "other" }));

    expect(a).not.toBe(b);
  });

  it("handles items without metadata", () => {
    const item = make_item({
      encrypted_metadata: undefined,
      metadata_nonce: undefined,
    });

    expect(metadata_fingerprint(item)).toBe(":0:");
  });
});

describe("build_snapshot", () => {
  const envelope: DecryptedEnvelope = {
    subject: "Hello",
    body_text: "plain body",
    body_html: "<p>huge html</p>",
    html_body: "<p>huge html</p>",
    from: { name: "Alice", email: "alice@example.com" },
    to: [],
    cc: [],
    bcc: [],
    sent_at: "2026-01-01T00:00:00Z",
  } as DecryptedEnvelope;

  const metadata = {
    is_read: true,
    is_starred: false,
    has_attachments: false,
    size_bytes: 10,
  } as MailItemMetadata;

  it("strips ciphertext from items and html from envelopes", () => {
    const item = make_item();
    const entries = new Map([
      [
        item.id,
        {
          envelope,
          metadata,
          search_body_text: "plain body",
          meta_fp: metadata_fingerprint(item),
          has_body: true,
        },
      ],
    ]);
    const snapshot = build_snapshot("user@example.com", [item], entries);

    expect(snapshot.user_email).toBe("user@example.com");
    expect(snapshot.items[0].encrypted_envelope).toBe("");
    expect(snapshot.items[0].envelope_nonce).toBe("");
    expect(snapshot.items[0].encrypted_metadata).toBe("");
    expect(snapshot.entries[0].envelope?.body_html).toBe("");
    expect(snapshot.entries[0].envelope?.html_body).toBe("");
    expect(snapshot.entries[0].envelope?.body_text).toBe("plain body");
    expect(snapshot.entries[0].envelope?.subject).toBe("Hello");
    expect(snapshot.entries[0].search_body_text).toBe("plain body");
    expect(snapshot.entries[0].has_body).toBe(true);
  });

  it("preserves the fingerprint so a later build can reuse entries", () => {
    const item = make_item();
    const fp = metadata_fingerprint(item);
    const entries = new Map([
      [
        item.id,
        {
          envelope,
          metadata,
          search_body_text: "",
          meta_fp: fp,
          has_body: false,
        },
      ],
    ]);
    const snapshot = build_snapshot("user@example.com", [item], entries);

    expect(snapshot.entries[0].meta_fp).toBe(fp);
    expect(metadata_fingerprint(make_item())).toBe(fp);
  });
});

describe("slim_envelope_for_index recipients", () => {
  const full_envelope = (
    overrides: Partial<DecryptedEnvelope> = {},
  ): DecryptedEnvelope =>
    ({
      subject: "Contract",
      body_text: "body",
      body_html: "<p>body</p>",
      from: { name: "", email: "me@astermail.org" },
      to: [{ name: "Dana Reyes", email: "dana@partner.com" }],
      cc: [{ name: "Priya Nair", email: "priya@partner.com" }],
      bcc: [{ name: "Omar Diaz", email: "omar@partner.com" }],
      sent_at: "2026-01-01T00:00:00Z",
      ...overrides,
    }) as DecryptedEnvelope;

  it("keeps cc and bcc so sent mail stays searchable by recipient", () => {
    const slim = slim_envelope_for_index(full_envelope());

    expect(slim.to).toEqual([{ name: "Dana Reyes", email: "dana@partner.com" }]);
    expect(slim.cc).toEqual([{ name: "Priya Nair", email: "priya@partner.com" }]);
    expect(slim.bcc).toEqual([{ name: "Omar Diaz", email: "omar@partner.com" }]);
  });

  it("bounds how many cc and bcc entries are stored", () => {
    const many = Array.from({ length: MAX_INDEX_RECIPIENTS + 40 }, (_, i) => ({
      name: `Person ${i}`,
      email: `p${i}@partner.com`,
    }));
    const slim = slim_envelope_for_index(
      full_envelope({ cc: many, bcc: many }),
    );

    expect(slim.cc).toHaveLength(MAX_INDEX_RECIPIENTS);
    expect(slim.bcc).toHaveLength(MAX_INDEX_RECIPIENTS);
  });

  it("still drops html bodies", () => {
    const slim = slim_envelope_for_index(full_envelope());

    expect(slim.body_html).toBe("");
    expect(slim.html_body).toBe("");
  });
});
