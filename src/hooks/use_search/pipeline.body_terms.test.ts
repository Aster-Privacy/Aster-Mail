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

import { describe, expect, it, vi } from "vitest";

const { mailbox } = vi.hoisted(() => ({
  mailbox: [] as MailItem[],
}));

vi.mock("@/services/api/mail", () => ({
  list_encrypted_mail_items: async ({
    cursor,
    limit,
  }: {
    cursor?: string;
    limit: number;
  }) => {
    const start = cursor ? Number(cursor) : 0;
    const end = start + limit;

    return {
      data: {
        items: mailbox.slice(start, end),
        next_cursor: end < mailbox.length ? String(end) : undefined,
      },
    };
  },
  list_mail_items: async () => ({ data: { items: [] } }),
}));
vi.mock("@/services/crypto/mail_metadata", () => ({
  decrypt_mail_metadata: async () => null,
  extract_metadata_from_server: (
    _decrypted: unknown,
    server_fields: Record<string, unknown>,
  ) => ({ ...server_fields }),
}));
vi.mock("@/hooks/use_search/envelope", () => ({
  decrypt_envelope_for_search: async (
    _envelope: string,
    _nonce: string,
    id: string,
  ) =>
    id === "item-broken"
      ? null
      : {
          subject: `Subject ${id}`,
          body_text: "",
          body_html: `<p>Body of ${id}</p>`,
          from: { name: "Sender", email: "sender@example.com" },
          to: [],
          cc: [],
          bcc: [],
          sent_at: "2026-01-01T00:00:00Z",
        },
  reset_legacy_migration_state: () => {},
}));
vi.mock("@/services/locked_folders", () => ({
  filter_locked_mail_items: (items: MailItem[]) => items,
}));
import { build_generation, empty_index } from "./index_cache";
import { run_index_pipeline } from "./pipeline";

function make_item(index: number): MailItem {
  return {
    id: `item-${index}`,
    item_type: "received",
    encrypted_envelope: "sealed",
    envelope_nonce: "nonce",
    message_ts: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    is_read: false,
    is_starred: false,
    is_pinned: false,
    is_trashed: false,
    is_archived: false,
    is_spam: false,
  } as MailItem;
}

describe("run_index_pipeline body terms", () => {
  it("gives every indexed message a term list so its chunk can be probed", async () => {
    const sealed = make_item(0);
    const unsealed = { ...make_item(1), encrypted_envelope: undefined };
    const broken = { ...make_item(2), id: "item-broken" };

    mailbox.length = 0;
    mailbox.push(sealed, unsealed as unknown as MailItem, broken);

    const hot = empty_index("user@example.com", true);

    await run_index_pipeline({
      user_email: "user@example.com",
      include_body: true,
      my_gen: build_generation,
      max_items: 3,
      hot,
      writer: null,
    });

    expect(hot.decrypted.get("item-0")?.index_terms).toContain("body");
    expect(hot.decrypted.get("item-1")?.index_terms).toEqual([]);
    expect(hot.decrypted.get("item-broken")?.index_terms).toEqual([]);
  });

  it("builds no term lists when bodies are not indexed", async () => {
    mailbox.length = 0;
    mailbox.push(make_item(0), {
      ...make_item(1),
      encrypted_envelope: undefined,
    } as unknown as MailItem);

    const hot = empty_index("user@example.com", false);

    await run_index_pipeline({
      user_email: "user@example.com",
      include_body: false,
      my_gen: build_generation,
      max_items: 2,
      hot,
      writer: null,
    });

    expect(hot.decrypted.get("item-0")?.index_terms).toBeUndefined();
    expect(hot.decrypted.get("item-1")?.index_terms).toBeUndefined();
  });
});
