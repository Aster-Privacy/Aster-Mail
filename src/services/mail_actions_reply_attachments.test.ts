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
import { describe, it, expect, vi, beforeEach } from "vitest";

const { queue_email, queue_email_to_server, parse_undo_send_period } =
  vi.hoisted(() => ({
    queue_email: vi.fn((_email: Record<string, unknown>) => "queued-local-id"),
    queue_email_to_server: vi.fn(async (_email: Record<string, unknown>) => ({
      queue_id: "queued-server-id",
    })),
    parse_undo_send_period: vi.fn(() => 0),
  }));

vi.mock("./send_queue", () => ({
  queue_email,
  queue_email_to_server,
  parse_undo_send_period,
  cancel_send: vi.fn(),
  send_now: vi.fn(),
  cancel_server_queued_email: vi.fn(),
  send_server_queued_immediately: vi.fn(),
}));

vi.mock("./thread_service", () => ({
  get_or_create_thread_token: vi.fn(async () => undefined),
}));

vi.mock("./account_manager", () => ({
  get_current_account: vi.fn(async () => ({
    user: { email: "me@astermail.org" },
  })),
}));

vi.mock("@/components/compose/compose_shared", () => ({
  get_aster_footer: vi.fn(() => ""),
}));

vi.mock("@/lib/html_sanitizer", () => ({
  sanitize_outgoing_html: vi.fn((s: string) => s),
}));

import { send_reply } from "./mail_actions";

const original = {
  sender_email: "friend@astermail.org",
  sender_name: "Friend",
  subject: "Hello",
  body: "hi",
  timestamp: new Date(0).toISOString(),
};

const callbacks = {
  on_complete: () => {},
  on_cancel: () => {},
  on_error: () => {},
};

function make_attachment() {
  return {
    id: "att-1",
    name: "report.pdf",
    size: "1 KB",
    size_bytes: 1024,
    mime_type: "application/pdf",
    data: new Uint8Array(1024).buffer,
    is_inline: false,
  } as unknown as import("@/components/compose/compose_shared").Attachment;
}

describe("send_reply carries attachments (regression for silent reply-attachment drop)", () => {
  beforeEach(() => {
    queue_email.mockClear();
    queue_email_to_server.mockClear();
  });

  it("forwards attachments to the server queue (undo-send ON)", async () => {
    parse_undo_send_period.mockReturnValueOnce(5000);
    const att = make_attachment();

    await send_reply(
      { original, message: "my reply", attachments: [att] },
      callbacks,
      "5 seconds",
    );

    expect(queue_email_to_server).toHaveBeenCalledTimes(1);
    const sent = queue_email_to_server.mock.calls[0]![0];

    expect(sent.attachments).toEqual([att]);
  });

  it("forwards attachments to the local queue (undo-send OFF)", async () => {
    parse_undo_send_period.mockReturnValueOnce(0);
    const att = make_attachment();

    await send_reply(
      { original, message: "my reply", attachments: [att] },
      callbacks,
      "0 seconds",
    );

    expect(queue_email).toHaveBeenCalledTimes(1);
    const sent = queue_email.mock.calls[0]![0];

    expect(sent.attachments).toEqual([att]);
  });
});
