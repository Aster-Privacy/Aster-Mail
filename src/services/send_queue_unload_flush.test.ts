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

const execute_send_mock = vi.fn();

vi.mock("./send_queue_encryption", () => ({
  check_send_readiness_internal: () => ({ ready: true }),
  execute_send: (...args: unknown[]) => execute_send_mock(...args),
  encrypt_for_recipients: vi.fn(),
  create_sent_envelope: vi.fn(),
  fetch_internal_public_keys: vi.fn(),
  execute_external_send: vi.fn(),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

vi.mock("@/hooks/use_mail_stats", async (import_original) => ({
  ...(await import_original<Record<string, unknown>>()),
  invalidate_mail_stats: vi.fn(),
}));

vi.mock("@/hooks/mail_events", async (import_original) => ({
  ...(await import_original<Record<string, unknown>>()),
  emit_email_sent: vi.fn(),
}));

import {
  queue_email,
  pending_send_count,
  flush_pending_sends,
} from "./send_queue";

function make_email() {
  return {
    to: ["someone@example.com"],
    subject: "hello",
    body: "<p>hello</p>",
    on_complete: vi.fn(),
    on_cancel: vi.fn(),
  };
}

describe("send queue unload flush", () => {
  beforeEach(() => {
    execute_send_mock.mockReset();
    execute_send_mock.mockResolvedValue(undefined);
    flush_pending_sends();
  });

  it("sends a queued email instead of losing it when the page goes away", async () => {
    const email = make_email();

    queue_email(email, 10_000);
    expect(pending_send_count()).toBe(1);
    expect(execute_send_mock).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("pagehide"));
    await vi.waitFor(() => expect(execute_send_mock).toHaveBeenCalledTimes(1));

    expect(pending_send_count()).toBe(0);
    expect(email.on_complete).toHaveBeenCalled();
  });

  it("sends every queued email when several are waiting", async () => {
    queue_email(make_email(), 10_000);
    queue_email(make_email(), 10_000);
    expect(pending_send_count()).toBe(2);

    window.dispatchEvent(new Event("pagehide"));
    await vi.waitFor(() => expect(execute_send_mock).toHaveBeenCalledTimes(2));

    expect(pending_send_count()).toBe(0);
  });

  it("leaves an empty queue alone when the page goes away", async () => {
    window.dispatchEvent(new Event("pagehide"));
    await Promise.resolve();

    expect(execute_send_mock).not.toHaveBeenCalled();
  });
});
