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
import { beforeEach, describe, expect, it, vi } from "vitest";

const { queue_email, queue_email_to_server, internal } = vi.hoisted(() => ({
  queue_email: vi.fn((_email: Record<string, unknown>) => "queued-local-id"),
  queue_email_to_server: vi.fn(
    async (
      _email: Record<string, unknown>,
      _delay_seconds: number,
      _callbacks: unknown,
    ): Promise<{ queue_id: string } | null> => ({
      queue_id: "queued-server-id",
    }),
  ),
  internal: new Set<string>(),
}));

vi.mock("./send_queue", () => ({
  queue_email,
  queue_email_to_server,
  cancel_send: vi.fn(),
  send_now: vi.fn(),
  cancel_server_queued_email: vi.fn(),
  send_server_queued_immediately: vi.fn(),
}));

vi.mock("./recipient_classification", () => ({
  classify_recipients: vi.fn(async () => new Map()),
  is_internal_recipient: (email: string) => internal.has(email),
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

import { send_forward, send_reply, server_queue_seconds } from "./mail_actions";

const callbacks = () => ({
  on_complete: vi.fn(),
  on_cancel: vi.fn(),
  on_error: vi.fn(),
});

beforeEach(() => {
  internal.clear();
  internal.add("me@astermail.org");
  internal.add("friend@astermail.org");
  queue_email.mockClear();
  queue_email_to_server.mockClear();
});

describe("server_queue_seconds", () => {
  it("keeps the undo delay when one is set", () => {
    expect(
      server_queue_seconds(["friend@astermail.org", "bob@example.com"], 10),
    ).toBe(10);
  });

  it("uses a one second server delay for a mixed send with no undo delay", () => {
    expect(
      server_queue_seconds(["friend@astermail.org", "bob@example.com"], 0),
    ).toBe(1);
  });

  it("sends Aster-only mail directly with no undo delay", () => {
    expect(server_queue_seconds(["friend@astermail.org"], 0)).toBe(0);
  });

  it("sends outside-only mail directly with no undo delay", () => {
    expect(server_queue_seconds(["bob@example.com"], 0)).toBe(0);
  });

  it("returns zero for no recipients", () => {
    expect(server_queue_seconds([], 0)).toBe(0);
  });
});

const original = {
  sender_email: "friend@astermail.org",
  sender_name: "Friend",
  subject: "Hello",
  body: "hi",
  timestamp: new Date(0).toISOString(),
};

describe("reply routing", () => {
  it("routes a mixed reply-all through the server queue without an undo delay", async () => {
    const result = await send_reply(
      {
        original: { ...original, cc: ["bob@example.com"] },
        message: "reply",
        reply_all: true,
      },
      callbacks(),
      0,
    );

    expect(queue_email).not.toHaveBeenCalled();
    expect(queue_email_to_server).toHaveBeenCalledTimes(1);
    expect(queue_email_to_server.mock.calls[0][1]).toBe(1);
    expect(result).toMatchObject({ success: true, is_server_queued: true });
  });

  it("keeps an Aster-only reply on the direct path without an undo delay", async () => {
    const result = await send_reply(
      { original, message: "reply" },
      callbacks(),
      0,
    );

    expect(queue_email_to_server).not.toHaveBeenCalled();
    expect(queue_email).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ success: true });
  });
});

describe("forward routing", () => {
  it("routes a forward with an outside Bcc to the server queue", async () => {
    await send_forward(
      {
        original,
        message: "fyi",
        recipients: ["friend@astermail.org"],
        bcc_recipients: ["bob@example.com"],
      },
      callbacks(),
      0,
    );

    expect(queue_email).not.toHaveBeenCalled();
    expect(queue_email_to_server).toHaveBeenCalledTimes(1);
    const [sent, delay] = queue_email_to_server.mock.calls[0];

    expect(delay).toBe(1);
    expect(sent.bcc).toEqual(["bob@example.com"]);
  });

  it("keeps an outside-only forward on the direct path without an undo delay", async () => {
    await send_forward(
      { original, message: "fyi", recipients: ["bob@example.com"] },
      callbacks(),
      0,
    );

    expect(queue_email_to_server).not.toHaveBeenCalled();
    expect(queue_email).toHaveBeenCalledTimes(1);
  });

  it("uses the undo delay for a mixed forward when one is set", async () => {
    await send_forward(
      {
        original,
        message: "fyi",
        recipients: ["friend@astermail.org", "bob@example.com"],
      },
      callbacks(),
      7000,
    );

    expect(queue_email_to_server.mock.calls[0][1]).toBe(7);
  });
});
