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

const queue_email_to_server = vi.fn();
const queue_email = vi.fn();
const execute_external_send = vi.fn();
let undo_send_delay_ms = 0;
const undo_send_add = vi.fn();

vi.mock("@/services/send_queue", () => ({
  queue_email_to_server: (...args: unknown[]) => queue_email_to_server(...args),
  queue_email: (...args: unknown[]) => queue_email(...args),
  execute_external_send: (...args: unknown[]) => execute_external_send(...args),
  get_undo_send_delay_ms: () => undo_send_delay_ms,
}));

vi.mock("@/hooks/use_undo_send", () => ({
  undo_send_manager: {
    add: (...args: unknown[]) => undo_send_add(...args),
    remove: vi.fn(),
  },
  store_pending_send_payload: vi.fn(),
}));

vi.mock("@/services/api/external_accounts", () => ({
  send_via_external_account: vi.fn(),
}));

vi.mock("@/services/crypto/attachment_crypto", () => ({
  prepare_external_attachments: vi.fn(async () => []),
}));

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: vi.fn(),
}));

vi.mock("@/hooks/use_mail_stats", () => ({ invalidate_mail_stats: vi.fn() }));

vi.mock("@/hooks/mail_events", () => ({ emit_email_sent: vi.fn() }));

const { execute_internal_send, execute_external_email_send } = await import(
  "@/components/compose/compose_send_actions"
);

function make_ctx(overrides: Record<string, unknown> = {}) {
  return {
    undo_send_enabled: false,
    undo_send_seconds: 0,
    undo_send_period: "off",
    message: "",
    session_storage_key: "compose_test",
    on_close: vi.fn(),
    reset_form: vi.fn(),
    set_queued_email_id: vi.fn(),
    t: (key: string) => key,
    ...overrides,
  } as never;
}

const email_data = {
  to: ["someone@example.com"],
  subject: "hello",
  body: "body",
};

describe("send actions report whether the message was handed off", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    undo_send_delay_ms = 0;
  });

  it("reports failure when the immediate internal queue refuses the message", async () => {
    queue_email.mockReturnValue(null);

    await expect(execute_internal_send(make_ctx(), email_data)).resolves.toBe(
      false,
    );
  });

  it("reports success when the immediate internal queue accepts the message", async () => {
    queue_email.mockReturnValue("queued_1");

    await expect(execute_internal_send(make_ctx(), email_data)).resolves.toBe(
      true,
    );
  });

  it("reports failure when an immediate external send throws", async () => {
    execute_external_send.mockRejectedValue(new Error("smtp refused"));

    await expect(
      execute_external_email_send(make_ctx(), email_data),
    ).resolves.toBe(false);
  });

  it("reports success when an immediate external send resolves", async () => {
    execute_external_send.mockResolvedValue(undefined);

    await expect(
      execute_external_email_send(make_ctx(), email_data),
    ).resolves.toBe(true);
  });

  it("keeps the draft while a secure external send is only scheduled", async () => {
    undo_send_delay_ms = 30000;
    const confirm_draft_deleted = vi.fn(async () => {});

    await expect(
      execute_external_email_send(make_ctx({ confirm_draft_deleted }), {
        ...email_data,
        secure_external: true,
      }),
    ).resolves.toBe(false);

    expect(confirm_draft_deleted).not.toHaveBeenCalled();
  });

  it("deletes the draft once the scheduled secure external send is delivered", async () => {
    undo_send_delay_ms = 30000;
    execute_external_send.mockResolvedValue(undefined);
    const confirm_draft_deleted = vi.fn(async () => {});

    await execute_external_email_send(make_ctx({ confirm_draft_deleted }), {
      ...email_data,
      secure_external: true,
    });

    const pending = undo_send_add.mock.calls[0][0] as {
      on_send_immediately: () => Promise<void>;
    };

    await pending.on_send_immediately();

    expect(confirm_draft_deleted).toHaveBeenCalledTimes(1);
  });
});

describe("the stashed plaintext message is cleared once it is no longer needed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    undo_send_delay_ms = 30000;
    sessionStorage.clear();
  });

  it("clears the stash after a queued internal send is delivered", async () => {
    queue_email_to_server.mockResolvedValue({ queue_id: "q1" });

    await execute_internal_send(
      make_ctx({ message: "secret body" }),
      email_data,
    );

    expect(sessionStorage.getItem("compose_test")).not.toBeNull();

    const callbacks = queue_email_to_server.mock.calls[0][2] as {
      on_sent: () => void;
    };

    callbacks.on_sent();

    expect(sessionStorage.getItem("compose_test")).toBeNull();
  });

  it("keeps the stash when a queued internal send fails", async () => {
    queue_email_to_server.mockResolvedValue({ queue_id: "q2" });

    await execute_internal_send(
      make_ctx({ message: "secret body" }),
      email_data,
    );

    const callbacks = queue_email_to_server.mock.calls[0][2] as {
      on_error: (error: string) => void;
    };

    callbacks.on_error("smtp refused");

    expect(sessionStorage.getItem("compose_test")).not.toBeNull();
  });

  it("clears the stash after a scheduled secure external send is delivered", async () => {
    execute_external_send.mockResolvedValue(undefined);

    await execute_external_email_send(make_ctx({ message: "secret body" }), {
      ...email_data,
      secure_external: true,
    });

    expect(sessionStorage.getItem("compose_test")).not.toBeNull();

    const pending = undo_send_add.mock.calls[0][0] as {
      on_send_immediately: () => Promise<void>;
    };

    await pending.on_send_immediately();

    expect(sessionStorage.getItem("compose_test")).toBeNull();
  });
});
