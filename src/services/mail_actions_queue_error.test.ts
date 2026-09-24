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

type QueueCallbacks = { on_error?: (error: string) => void };

const { queue_email, queue_email_to_server } = vi.hoisted(() => ({
  queue_email: vi.fn((_email: Record<string, unknown>) => "queued-local-id"),
  queue_email_to_server: vi.fn(
    async (
      _email: Record<string, unknown>,
      _delay_seconds: number,
      _callbacks: QueueCallbacks,
    ): Promise<{ queue_id: string } | null> => ({
      queue_id: "queued-server-id",
    }),
  ),
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

import { send_forward, send_reply } from "./mail_actions";

import { get_active_translations } from "@/lib/i18n/translations";

const original = {
  sender_email: "friend@astermail.org",
  sender_name: "Friend",
  subject: "Hello",
  body: "hi",
  timestamp: new Date(0).toISOString(),
};

const SERVER_ERROR = "Upgrade your plan to set an expiration.";

function reject_with_server_error() {
  queue_email_to_server.mockImplementationOnce(
    async (_email, _delay_seconds, queue_callbacks) => {
      queue_callbacks.on_error?.(SERVER_ERROR);

      return null;
    },
  );
}

function make_callbacks() {
  return {
    on_complete: vi.fn(),
    on_cancel: vi.fn(),
    on_error: vi.fn(),
  };
}

describe("reply and forward report a queue failure once", () => {
  beforeEach(() => {
    queue_email.mockClear();
    queue_email_to_server.mockClear();
  });

  it("keeps the server message for a rejected reply", async () => {
    reject_with_server_error();
    const callbacks = make_callbacks();

    const result = await send_reply(
      { original, message: "my reply" },
      callbacks,
      5000,
    );

    expect(callbacks.on_error).toHaveBeenCalledTimes(1);
    expect(callbacks.on_error).toHaveBeenCalledWith(SERVER_ERROR);
    expect(result).toEqual({ success: false, error: SERVER_ERROR });
  });

  it("keeps the server message for a rejected forward", async () => {
    reject_with_server_error();
    const callbacks = make_callbacks();

    const result = await send_forward(
      { original, message: "fyi", recipients: ["other@astermail.org"] },
      callbacks,
      5000,
    );

    expect(callbacks.on_error).toHaveBeenCalledTimes(1);
    expect(callbacks.on_error).toHaveBeenCalledWith(SERVER_ERROR);
    expect(result).toEqual({ success: false, error: SERVER_ERROR });
  });

  it("falls back to the generic message when nothing was reported", async () => {
    queue_email_to_server.mockResolvedValueOnce(null);
    const callbacks = make_callbacks();

    const result = await send_reply(
      { original, message: "my reply" },
      callbacks,
      5000,
    );

    const generic = get_active_translations().errors.failed_queue_reply;

    expect(callbacks.on_error).toHaveBeenCalledTimes(1);
    expect(callbacks.on_error).toHaveBeenCalledWith(generic);
    expect(result).toEqual({ success: false, error: generic });
  });
});
