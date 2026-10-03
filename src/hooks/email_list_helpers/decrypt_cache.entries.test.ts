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

import { describe, it, expect, beforeEach } from "vitest";

import {
  clear_list_decrypt_cache,
  decrypt_list_item_cached,
} from "./decrypt_cache";
import { mail_to_email } from "./mapping";

const FORMAT = { date_format: "MM/DD/YYYY", time_format: "24h" } as never;

const item = {
  id: "m1",
  encrypted_envelope: "env-1",
  envelope_nonce: "nonce-1",
  encrypted_metadata: "meta-1",
  metadata_nonce: "meta-nonce-1",
  metadata_version: 1,
  message_ts: "2026-08-01T10:00:00Z",
  created_at: "2026-08-01T10:00:00Z",
  item_type: "received",
  is_read: false,
  labels: [{ token: "work", name: "Work" }],
} as never;

function full_envelope(): DecryptedEnvelope {
  return {
    subject: "Weekly update",
    body_text: "Hello team, here is the weekly update. ".repeat(200),
    body_html: `<html><body><p>${"Hello team. ".repeat(500)}</p></body></html>`,
    from: { name: "Alias Sender", email: "reverse@simplelogin.co" },
    to: [{ name: "Me", email: "me@example.test" }],
    cc: [{ name: "Other", email: "other@example.test" }],
    bcc: [],
    sent_at: "2026-08-01T10:00:00Z",
    sender_verification: "valid" as never,
    list_unsubscribe: "<mailto:unsubscribe@example.test>",
    raw_headers: [
      { name: "Received", value: "from mx.example.test by relay" },
      { name: "X-SimpleLogin-Type", value: "Forward" },
      {
        name: "X-SimpleLogin-Original-From",
        value: "Real <real@example.test>",
      },
      { name: "Reply-To", value: "Desk <desk@example.test>" },
      { name: "List-Id", value: "<updates.example.test>" },
      { name: "Precedence", value: "bulk" },
      { name: "DKIM-Signature", value: "v=1; d=example.test; s=sel" },
      { name: "Authentication-Results", value: "spf=pass" },
    ],
    attachment_keys: [{ seq: 1, key: "k1", filename: "a.pdf" }],
  };
}

const metadata = { is_read: false, is_starred: true } as MailItemMetadata;

describe("list decrypt cache entries", () => {
  beforeEach(() => {
    clear_list_decrypt_cache();
  });

  it("maps a cached message exactly like the freshly decrypted one", async () => {
    const fresh = await decrypt_list_item_cached(
      item,
      "me@example.test",
      async () => ({
        envelope: full_envelope(),
        metadata,
      }),
    );
    const cached = await decrypt_list_item_cached(
      item,
      "me@example.test",
      async () => {
        throw new Error("should be a cache hit");
      },
    );

    expect(cached.body_summary).toBeDefined();
    expect(
      mail_to_email(item, cached.envelope, cached.metadata, FORMAT, {
        body_summary: cached.body_summary,
      }),
    ).toEqual(mail_to_email(item, fresh.envelope, fresh.metadata, FORMAT));
  });

  it("keeps only what the list needs, not the message bodies", async () => {
    await decrypt_list_item_cached(item, "me@example.test", async () => ({
      envelope: full_envelope(),
      metadata,
    }));
    const cached = await decrypt_list_item_cached(
      item,
      "me@example.test",
      async () => {
        throw new Error("should be a cache hit");
      },
    );
    const envelope = cached.envelope!;

    expect(envelope.body_text).toBe("");
    expect(envelope.body_html).toBeUndefined();
    expect(envelope.cc).toEqual([]);
    expect(envelope.raw_headers?.map((header) => header.name)).toEqual([
      "X-SimpleLogin-Type",
      "X-SimpleLogin-Original-From",
      "Reply-To",
      "List-Id",
      "Precedence",
      "DKIM-Signature",
    ]);
    expect(envelope.attachment_keys).toEqual([
      { seq: 1, key: "k1", filename: "a.pdf" },
    ]);
  });

  it("hands out copies that callers cannot use to change the cache", async () => {
    const first = await decrypt_list_item_cached(
      item,
      "me@example.test",
      async () => ({
        envelope: full_envelope(),
        metadata,
      }),
    );

    first.envelope!.from.name = "Changed by the fresh caller";

    const second = await decrypt_list_item_cached(
      item,
      "me@example.test",
      async () => {
        throw new Error("should be a cache hit");
      },
    );

    second.envelope!.from.name = "Changed by a cached caller";
    second.envelope!.to[0].name = "Changed";

    const third = await decrypt_list_item_cached(
      item,
      "me@example.test",
      async () => {
        throw new Error("should be a cache hit");
      },
    );

    expect(third.envelope!.from.name).toBe("Alias Sender");
    expect(third.envelope!.to[0].name).toBe("Me");
  });
});
