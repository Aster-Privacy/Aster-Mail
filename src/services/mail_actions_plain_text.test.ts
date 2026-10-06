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

const { queue_email, queue_email_to_server } = vi.hoisted(() => ({
  queue_email: vi.fn((_email: Record<string, unknown>) => "queued-local-id"),
  queue_email_to_server: vi.fn(async (_email: Record<string, unknown>) => ({
    queue_id: "queued-server-id",
  })),
}));

vi.mock("./send_queue", () => ({
  queue_email,
  queue_email_to_server,
  cancel_send: vi.fn(),
  send_now: vi.fn(),
  cancel_server_queued_email: vi.fn(),
  send_server_queued_immediately: vi.fn(),
}));

vi.mock("./reply_send_gate", () => ({
  check_reply_send: vi.fn(async () => null),
}));

vi.mock("./key_trust_consent", () => ({
  ensure_external_key_trust: vi.fn(async () => true),
}));

vi.mock("./post_quantum_consent", () => ({
  ensure_post_quantum_consent: vi.fn(async () => ({
    proceed: true,
    allow_non_post_quantum: false,
  })),
}));

vi.mock("./thread_service", () => ({
  get_or_create_thread_token: vi.fn(async () => undefined),
}));

vi.mock("./account_manager", () => ({
  get_current_account: vi.fn(async () => ({
    user: { email: "me@astermail.org" },
  })),
}));

vi.mock("@/components/compose/compose_shared_core", () => ({
  get_aster_footer: vi.fn(() => ""),
}));

vi.mock("@/lib/html_sanitizer", () => ({
  sanitize_outgoing_html: vi.fn((s: string) => s),
}));

import { send_forward, send_reply } from "./mail_actions";

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

describe("plain text replies and forwards reach the server queue marked plain", () => {
  beforeEach(() => {
    queue_email.mockClear();
    queue_email_to_server.mockClear();
  });

  it("marks a plain text reply", async () => {
    await send_reply(
      { original, message: "my reply", is_plain_text: true },
      callbacks,
      5000,
    );

    expect(queue_email_to_server.mock.calls[0]![0].is_plain_text).toBe(true);
  });

  it("marks a plain text forward", async () => {
    await send_forward(
      {
        original,
        recipients: ["reader@example.org"],
        message: "fyi",
        is_plain_text: true,
      },
      callbacks,
      5000,
    );

    expect(queue_email_to_server.mock.calls[0]![0].is_plain_text).toBe(true);
  });

  it("leaves a rich reply unmarked", async () => {
    await send_reply({ original, message: "<b>my reply</b>" }, callbacks, 5000);

    expect(queue_email_to_server.mock.calls[0]![0].is_plain_text).toBeFalsy();
  });
});
