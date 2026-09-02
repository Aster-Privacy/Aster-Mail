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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  clear_all_flag_intents,
  note_flag_intents,
} from "@/services/read_intent";

const h = vi.hoisted(() => ({
  items: [] as Record<string, unknown>[],
}));

vi.mock("@/services/api/mail", () => ({
  list_mail_items: vi.fn(async () => ({
    data: {
      items: h.items,
      total: h.items.length,
      has_more: false,
      next_cursor: undefined,
    },
    error: null,
  })),
}));

vi.mock("./decrypt", () => ({
  decrypt_envelope: vi.fn(async () => ({
    subject: "readable",
    from: { email: "s@x.test" },
  })),
}));

vi.mock("@/services/crypto/mail_metadata", () => ({
  decrypt_mail_metadata: vi.fn(async () => null),
}));

vi.mock("@/utils/email_crypto", () => ({
  decrypt_body_text_with_bundle: vi.fn(async (body: string) => ({
    body,
    subject: null,
  })),
}));

vi.mock("./mapping", () => ({
  mail_to_email_safe: (
    item: { id: string; item_type: string },
    envelope: { subject?: string } | null,
  ) => ({
    id: item.id,
    subject: envelope?.subject ?? "",
    item_type: item.item_type,
    is_read: true,
    is_starred: false,
    is_pinned: false,
    is_trashed: false,
    is_spam: false,
    is_archived: false,
    snoozed_until: undefined,
  }),
}));

vi.mock("@/services/api/sender_profiles", () => ({
  resolve_sender_profiles: vi.fn(async () => undefined),
}));

vi.mock("@/services/locked_folders", () => ({
  filter_locked_mail_items: (items: unknown[]) => items,
  is_folder_token_locked: () => false,
  request_folder_unlock: vi.fn(),
}));

const { fetch_mail_from_api } = await import("./fetch_api");

function make_item(id: string) {
  return {
    id,
    encrypted_envelope: "env",
    envelope_nonce: "nonce",
    message_ts: "2026-08-01T00:00:00Z",
    created_at: "2026-08-01T00:00:00Z",
    item_type: "received",
    is_read: true,
  };
}

async function fetch_view(view: string) {
  const result = await fetch_mail_from_api(
    view as never,
    new AbortController().signal,
    {} as never,
    "me@x.test",
    50,
    undefined,
    0,
    false,
  );

  return result!.emails;
}

describe("fetch_mail_from_api with pending flag intents", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_700_000_000_000);
    clear_all_flag_intents();
    h.items = [make_item("stale"), make_item("plain"), make_item("gone")];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("corrects stale flags and drops rows the user already removed", async () => {
    note_flag_intents(["stale"], { is_starred: true, is_read: false });
    note_flag_intents(["gone"], { is_trashed: true });

    const emails = await fetch_view("inbox");
    const by_id = new Map(emails.map((email) => [email.id, email]));

    expect([...by_id.keys()].sort()).toEqual(["plain", "stale"]);
    expect(by_id.get("stale")?.is_starred).toBe(true);
    expect(by_id.get("stale")?.is_read).toBe(false);
    expect(by_id.get("plain")?.is_starred).toBe(false);
  });

  it("keeps a row the user just trashed when viewing trash", async () => {
    note_flag_intents(["gone"], { is_trashed: true });

    const emails = await fetch_view("trash");

    const gone = emails.find((email) => email.id === "gone");

    expect(gone?.is_trashed).toBe(true);
  });

  it("drops a row snoozed into the future from the inbox", async () => {
    note_flag_intents(["gone"], {
      snoozed_until: new Date(1_700_000_060_000).toISOString(),
    });

    const emails = await fetch_view("inbox");

    expect(emails.map((email) => email.id).sort()).toEqual(["plain", "stale"]);
  });
});
