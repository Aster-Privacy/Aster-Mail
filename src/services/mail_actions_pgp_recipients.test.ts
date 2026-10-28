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

const { queue_email_to_server } = vi.hoisted(() => ({
  queue_email_to_server: vi.fn(
    async (
      _email: Record<string, unknown>,
      _delay_seconds: number,
      _callbacks: unknown,
    ): Promise<{ queue_id: string } | null> => ({
      queue_id: "queued-server-id",
    }),
  ),
}));

vi.mock("./send_queue", () => ({
  queue_email: vi.fn(() => "queued-local-id"),
  queue_email_to_server,
  cancel_send: vi.fn(),
  send_now: vi.fn(),
  cancel_server_queued_email: vi.fn(),
  send_server_queued_immediately: vi.fn(),
}));

vi.mock("./recipient_classification", async (original) => ({
  ...(await original<typeof import("./recipient_classification")>()),
  is_internal_recipient: (email: string) => email.endsWith("@astermail.org"),
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
import {
  forget_recipient_lock_statuses,
  record_recipient_lock_status,
} from "./recipient_lock_state";

import { get_active_translations } from "@/lib/i18n/translations";

const original = {
  sender_email: "bob@example.com",
  sender_name: "Bob",
  subject: "Hello",
  body: "hi",
  timestamp: new Date(0).toISOString(),
};

function make_callbacks() {
  return {
    on_complete: vi.fn(),
    on_cancel: vi.fn(),
    on_error: vi.fn(),
  };
}

function queued_pgp_recipients(): unknown {
  return queue_email_to_server.mock.calls[0]?.[0]?.pgp_recipients;
}

describe("reply and forward carry the recipients shown with a lock", () => {
  beforeEach(() => {
    queue_email_to_server.mockClear();
    forget_recipient_lock_statuses();
  });

  it("lists a locked outside recipient on a reply", async () => {
    record_recipient_lock_status("Bob@Example.com", "encrypted");

    await send_reply({ original, message: "my reply" }, make_callbacks(), 5000);

    expect(queued_pgp_recipients()).toEqual(["bob@example.com"]);
  });

  it("leaves out recipients without a lock and Aster recipients", async () => {
    record_recipient_lock_status("carol@example.com", "available");
    record_recipient_lock_status("friend@astermail.org", "encrypted");

    await send_forward(
      {
        original,
        message: "fyi",
        recipients: ["carol@example.com", "friend@astermail.org"],
      },
      make_callbacks(),
      5000,
    );

    expect(queued_pgp_recipients()).toEqual([]);
  });

  it("lists a locked outside recipient on a forward", async () => {
    record_recipient_lock_status("dave@example.com", "encrypted");

    await send_forward(
      { original, message: "fyi", recipients: ["dave@example.com"] },
      make_callbacks(),
      5000,
    );

    expect(queued_pgp_recipients()).toEqual(["dave@example.com"]);
  });

  it("refuses an expiring reply to a locked recipient", async () => {
    record_recipient_lock_status("bob@example.com", "encrypted");
    const callbacks = make_callbacks();

    const result = await send_reply(
      {
        original,
        message: "my reply",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
      callbacks,
      5000,
    );

    const message = get_active_translations().common.expiry_no_pgp;

    expect(queue_email_to_server).not.toHaveBeenCalled();
    expect(callbacks.on_error).toHaveBeenCalledWith(message);
    expect(result).toEqual({ success: false, error: message });
  });
});
