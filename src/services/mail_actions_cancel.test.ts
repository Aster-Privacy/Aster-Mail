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

const { cancel_send, cancel_server_queued_email_with_reason } = vi.hoisted(
  () => ({
    cancel_send: vi.fn((_id: string): unknown => null),
    cancel_server_queued_email_with_reason: vi.fn(
      async (_id: string): Promise<string> => "cancelled",
    ),
  }),
);

vi.mock("./send_queue", () => ({
  queue_email: vi.fn(),
  queue_email_to_server: vi.fn(),
  cancel_send,
  send_now: vi.fn(),
  cancel_server_queued_email_with_reason,
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

import { cancel_mail_action } from "./mail_actions";

describe("cancelling a queued reply reports the real outcome", () => {
  beforeEach(() => {
    cancel_send.mockReset();
    cancel_send.mockReturnValue(null);
    cancel_server_queued_email_with_reason.mockReset();
    cancel_server_queued_email_with_reason.mockResolvedValue("cancelled");
  });

  it("is cancelled when the local queue still held the message", async () => {
    cancel_send.mockReturnValue({ id: "q1" });

    await expect(cancel_mail_action("q1")).resolves.toBe("cancelled");
    expect(cancel_server_queued_email_with_reason).not.toHaveBeenCalled();
  });

  it("is cancelled when the server confirms the cancel", async () => {
    await expect(cancel_mail_action("q2")).resolves.toBe("cancelled");
    expect(cancel_server_queued_email_with_reason).toHaveBeenCalledWith("q2");
  });

  it("is expired when the server already sent the message", async () => {
    cancel_server_queued_email_with_reason.mockResolvedValue("expired");

    await expect(cancel_mail_action("q3")).resolves.toBe("expired");
  });

  it("is failed when the server cancel does not go through", async () => {
    cancel_server_queued_email_with_reason.mockResolvedValue("failed");

    await expect(cancel_mail_action("q4")).resolves.toBe("failed");
  });

  it("is failed when the server cancel throws", async () => {
    cancel_server_queued_email_with_reason.mockRejectedValue(
      new Error("offline"),
    );

    await expect(cancel_mail_action("q5")).resolves.toBe("failed");
  });
});
