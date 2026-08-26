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

import { describe, it, expect, vi, beforeEach } from "vitest";

import { fetch_mail_from_api, UNKNOWN_TOTAL } from "./email_list_helpers";

vi.mock("@/services/api/mail", async (import_original) => {
  const original =
    await import_original<typeof import("@/services/api/mail")>();

  return {
    ...original,
    list_mail_items: vi.fn(),
  };
});

const { list_mail_items } = await import("@/services/api/mail");

const envelope = {
  from: { email: "sender@example.com", name: "Sender" },
  to: [{ email: "me@example.com" }],
  subject: "hello",
  body_text: "plain body",
  sent_at: "2026-07-01T09:59:00Z",
};

function make_item(id: string): MailItem {
  return {
    id,
    item_type: "received",
    encrypted_envelope: btoa(JSON.stringify(envelope)),
    envelope_nonce: "",
    created_at: "2026-07-01T10:00:00Z",
    message_ts: "2026-07-01T10:00:00Z",
    is_read: false,
    is_external: false,
  } as unknown as MailItem;
}

const format_options = {
  date_format: "MM/DD/YYYY" as const,
  time_format: "12h" as const,
};

describe("unknown total sentinel", () => {
  beforeEach(() => {
    vi.mocked(list_mail_items).mockReset();
  });

  it("sends skip_total once past the first page", async () => {
    vi.mocked(list_mail_items).mockResolvedValue({
      data: { items: [make_item("a")], total: -1, has_more: true },
    } as never);

    await fetch_mail_from_api(
      "inbox",
      new AbortController().signal,
      format_options,
      "me@example.com",
      50,
      undefined,
      50,
    );

    const params = vi.mocked(list_mail_items).mock.calls[0][0] as {
      skip_total?: boolean;
      offset?: number;
    };

    expect(params.skip_total).toBe(true);
    expect(params.offset).toBe(50);
  });

  it("preserves the -1 sentinel instead of collapsing it to zero", async () => {
    vi.mocked(list_mail_items).mockResolvedValue({
      data: {
        items: [make_item("a"), make_item("b")],
        total: -1,
        has_more: true,
      },
    } as never);

    const result = await fetch_mail_from_api(
      "inbox",
      new AbortController().signal,
      format_options,
      "me@example.com",
      50,
      undefined,
      50,
    );

    expect(result).not.toBeNull();
    expect(result!.total).toBe(UNKNOWN_TOTAL);
    expect(result!.total).toBeLessThan(0);
    expect(result!.has_more).toBe(true);
    expect(result!.emails.length).toBe(2);
  });

  it("still reports a real total on the first page", async () => {
    vi.mocked(list_mail_items).mockResolvedValue({
      data: { items: [make_item("a")], total: 36050, has_more: true },
    } as never);

    const result = await fetch_mail_from_api(
      "inbox",
      new AbortController().signal,
      format_options,
      "me@example.com",
      50,
      undefined,
      0,
    );

    const params = vi.mocked(list_mail_items).mock.calls[0][0] as {
      skip_total?: boolean;
    };

    expect(params.skip_total).toBeUndefined();
    expect(result!.total).toBe(36050);
  });
});
