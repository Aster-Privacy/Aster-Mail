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

import { build_reply_recipients, send_reply } from "./mail_actions";

const original = {
  sender_email: "sender@example.com",
  sender_name: "Sender",
  subject: "Hello",
  body: "hi",
  timestamp: new Date(0).toISOString(),
  to: ["me@astermail.org"],
  cc: ["alice@example.com", "bob@example.com"],
};

const callbacks = {
  on_complete: vi.fn(),
  on_cancel: vi.fn(),
  on_error: vi.fn(),
};

describe("build_reply_recipients", () => {
  it("keeps cc recipients when replying to all", () => {
    const result = build_reply_recipients(
      { original, message: "", reply_all: true },
      "me@astermail.org",
    );

    expect(result.to).toEqual(["sender@example.com"]);
    expect(result.cc).toEqual(["alice@example.com", "bob@example.com"]);
  });

  it("drops cc recipients on a plain reply", () => {
    const result = build_reply_recipients(
      { original, message: "", reply_all: false },
      "me@astermail.org",
    );

    expect(result.to).toEqual(["sender@example.com"]);
    expect(result.cc).toEqual([]);
  });

  it("excludes every own alias, not just the primary address", () => {
    const result = build_reply_recipients(
      {
        original: {
          ...original,
          to: ["me@astermail.org", "alias@astermail.org", "carol@example.com"],
          cc: ["ghost@realiased.me", "dave@example.com"],
        },
        message: "",
        reply_all: true,
        own_addresses: ["alias@astermail.org", "ghost@realiased.me"],
      },
      "me@astermail.org",
    );

    expect(result.to).toEqual(["sender@example.com", "carol@example.com"]);
    expect(result.cc).toEqual(["dave@example.com"]);
  });

  it("deduplicates case-insensitively across to and cc", () => {
    const result = build_reply_recipients(
      {
        original: {
          ...original,
          to: ["Sender@Example.com", "carol@example.com"],
          cc: ["CAROL@example.com", "dave@example.com"],
        },
        message: "",
        reply_all: true,
      },
      "me@astermail.org",
    );

    expect(result.to).toEqual(["sender@example.com", "carol@example.com"]);
    expect(result.cc).toEqual(["dave@example.com"]);
  });

  it("replies to the original recipient when the sender is the user", () => {
    const result = build_reply_recipients(
      {
        original: {
          ...original,
          sender_email: "me@astermail.org",
          to: ["carol@example.com"],
          cc: ["dave@example.com"],
        },
        message: "",
        reply_all: true,
      },
      "me@astermail.org",
    );

    expect(result.to).toEqual(["carol@example.com"]);
    expect(result.cc).toEqual(["dave@example.com"]);
  });

  it("honours explicit overrides from the composer", () => {
    const result = build_reply_recipients(
      {
        original,
        message: "",
        reply_all: true,
        to_recipients: ["typed@example.com"],
        cc_recipients: ["typed_cc@example.com"],
      },
      "me@astermail.org",
    );

    expect(result.to).toEqual(["typed@example.com"]);
    expect(result.cc).toEqual(["typed_cc@example.com"]);
  });
});

describe("send_reply cc wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queues a reply-all with cc as a real cc header", async () => {
    await send_reply({ original, message: "body", reply_all: true }, callbacks);

    const payload = queue_email.mock.calls[0][0];

    expect(payload.to).toEqual(["sender@example.com"]);
    expect(payload.cc).toEqual(["alice@example.com", "bob@example.com"]);
  });

  it("omits cc entirely on a plain reply", async () => {
    await send_reply({ original, message: "body" }, callbacks);

    const payload = queue_email.mock.calls[0][0];

    expect(payload.to).toEqual(["sender@example.com"]);
    expect(payload.cc).toBeUndefined();
  });

  it("carries cc through the server queue path", async () => {
    await send_reply(
      { original, message: "body", reply_all: true },
      callbacks,
      5000,
    );

    const payload = queue_email_to_server.mock.calls[0][0];

    expect(payload.cc).toEqual(["alice@example.com", "bob@example.com"]);
  });
});
