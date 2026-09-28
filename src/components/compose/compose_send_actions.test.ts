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
import {
  clear_pending_send_stash,
  has_pending_send_stash,
} from "@/components/compose/pending_send_stash";

const queue_email_to_server = vi.fn();
const queue_email = vi.fn();
const execute_external_send = vi.fn();
let undo_send_delay_ms = 0;
const undo_send_add = vi.fn();
const store_pending_send_payload = vi.fn();
const dispatch_undo_send_event = vi.fn();

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
  store_pending_send_payload: (...args: unknown[]) =>
    store_pending_send_payload(...args),
  dispatch_undo_send_event: (...args: unknown[]) =>
    dispatch_undo_send_event(...args),
}));

vi.mock("@/services/api/external_accounts", () => ({
  send_via_external_account: vi.fn(),
}));

vi.mock("@/services/crypto/attachment_crypto", () => ({
  prepare_external_attachments: vi.fn(async () => []),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(() => "toast_1"),
  dismiss_toast: vi.fn(),
}));

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: vi.fn(),
}));

vi.mock("@/hooks/use_mail_stats", () => ({ invalidate_mail_stats: vi.fn() }));

vi.mock("@/hooks/mail_events", () => ({ emit_email_sent: vi.fn() }));

const { execute_internal_send, execute_external_email_send } =
  await import("@/components/compose/compose_send_actions");

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

  it("closes the window and keeps the draft when an immediate external send throws", async () => {
    execute_external_send.mockRejectedValue(new Error("smtp refused"));
    const confirm_draft_deleted = vi.fn(async () => {});
    const ctx = make_ctx({ confirm_draft_deleted }) as unknown as {
      on_close: ReturnType<typeof vi.fn>;
    };

    await expect(
      execute_external_email_send(ctx as never, email_data),
    ).resolves.toBe(false);

    expect(ctx.on_close).toHaveBeenCalledTimes(1);
    expect(confirm_draft_deleted).not.toHaveBeenCalled();
  });

  it("reopens the message when an immediate external send throws", async () => {
    execute_external_send.mockRejectedValue(new Error("smtp refused"));

    await execute_external_email_send(make_ctx(), email_data);

    expect(dispatch_undo_send_event).toHaveBeenCalledTimes(1);
    const [, pending, payload] = dispatch_undo_send_event.mock.calls[0];

    expect(pending.to).toEqual(email_data.to);
    expect(payload.subject).toBe("hello");
    expect(payload.body).toBe("body");
  });

  it("does not reopen the message when an immediate external send succeeds", async () => {
    execute_external_send.mockResolvedValue(undefined);

    await execute_external_email_send(make_ctx(), email_data);

    expect(dispatch_undo_send_event).not.toHaveBeenCalled();
  });

  it("closes the window before an immediate external send finishes", async () => {
    let finish_send: () => void = () => {};

    execute_external_send.mockReturnValue(
      new Promise<void>((resolve) => {
        finish_send = resolve;
      }),
    );
    const confirm_draft_deleted = vi.fn(async () => {});
    const ctx = make_ctx({ confirm_draft_deleted }) as unknown as {
      on_close: ReturnType<typeof vi.fn>;
    };

    const pending = execute_external_email_send(ctx as never, email_data);

    expect(ctx.on_close).toHaveBeenCalledTimes(1);
    expect(confirm_draft_deleted).not.toHaveBeenCalled();

    finish_send();
    await pending;

    expect(confirm_draft_deleted).toHaveBeenCalledTimes(1);
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
    clear_pending_send_stash("compose_test");
  });

  it("clears the stash after a queued internal send is delivered", async () => {
    queue_email_to_server.mockResolvedValue({ queue_id: "q1" });

    await execute_internal_send(
      make_ctx({ message: "secret body" }),
      email_data,
    );

    expect(has_pending_send_stash("compose_test")).toBe(true);

    const callbacks = queue_email_to_server.mock.calls[0][2] as {
      on_sent: () => void;
    };

    callbacks.on_sent();

    expect(has_pending_send_stash("compose_test")).toBe(false);
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

    expect(has_pending_send_stash("compose_test")).toBe(true);
  });

  it("clears the stash after a scheduled secure external send is delivered", async () => {
    execute_external_send.mockResolvedValue(undefined);

    await execute_external_email_send(make_ctx({ message: "secret body" }), {
      ...email_data,
      secure_external: true,
    });

    expect(has_pending_send_stash("compose_test")).toBe(true);

    const pending = undo_send_add.mock.calls[0][0] as {
      on_send_immediately: () => Promise<void>;
    };

    await pending.on_send_immediately();

    expect(has_pending_send_stash("compose_test")).toBe(false);
  });
});

describe("the pending payload keeps the draft context for undo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    undo_send_delay_ms = 10_000;
  });

  it("stores the reply context, expiry, and thread token alongside the message", async () => {
    queue_email_to_server.mockResolvedValue({ queue_id: "queue_9" });

    const ctx = make_ctx({
      undo_send_enabled: true,
      undo_send_seconds: 10,
      undo_send_period: "seconds",
      edit_draft: {
        id: "",
        version: 0,
        draft_type: "reply",
        reply_to_id: "mail-uuid",
        rfc_message_id: "<abc@example.com>",
        thread_token: "thread-1",
        to_recipients: [],
        cc_recipients: [],
        bcc_recipients: [],
        subject: "",
        message: "",
        updated_at: "",
      },
    });

    await execute_internal_send(ctx, {
      ...email_data,
      expires_at: "2030-01-01T00:00:00.000Z",
    });

    expect(store_pending_send_payload).toHaveBeenCalledWith(
      "queue_9",
      expect.objectContaining({
        draft_type: "reply",
        reply_to_id: "mail-uuid",
        rfc_message_id: "<abc@example.com>",
        thread_token: "thread-1",
        expires_at: "2030-01-01T00:00:00.000Z",
      }),
    );
    expect(undo_send_add).toHaveBeenCalledWith(
      expect.objectContaining({ thread_token: "thread-1" }),
    );
  });
});

describe("send actions stop before closing when the plan lacks the feature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    undo_send_delay_ms = 30000;
  });

  const locked_ctx = (on_close: () => void) =>
    make_ctx({
      on_close,
      limits_loaded: true,
      is_feature_locked: (key: string) =>
        key === "has_email_expiration" ||
        key === "has_password_protected_messages",
    });

  it("keeps the composer open for a locked password-protected external send", async () => {
    const on_close = vi.fn();

    await expect(
      execute_external_email_send(locked_ctx(on_close), {
        ...email_data,
        expires_at: "2030-01-01T00:00:00.000Z",
        expiry_password: "hunter22",
        secure_external: true,
      }),
    ).resolves.toBe(false);

    expect(on_close).not.toHaveBeenCalled();
    expect(undo_send_add).not.toHaveBeenCalled();
    expect(execute_external_send).not.toHaveBeenCalled();
  });

  it("never queues a locked internal send with an expiry", async () => {
    const on_close = vi.fn();

    await expect(
      execute_internal_send(locked_ctx(on_close), {
        ...email_data,
        expires_at: "2030-01-01T00:00:00.000Z",
      }),
    ).resolves.toBe(false);

    expect(on_close).not.toHaveBeenCalled();
    expect(queue_email_to_server).not.toHaveBeenCalled();
  });

  it("sends normally when the plan includes the feature", async () => {
    undo_send_delay_ms = 0;
    execute_external_send.mockResolvedValue(undefined);

    await expect(
      execute_external_email_send(
        make_ctx({ limits_loaded: true, is_feature_locked: () => false }),
        {
          ...email_data,
          expires_at: "2030-01-01T00:00:00.000Z",
          expiry_password: "hunter22",
          secure_external: true,
        },
      ),
    ).resolves.toBe(true);
  });
});

describe("a queued send that fails after compose closes returns to Drafts", () => {
  const attachment = {
    id: "att_1",
    name: "photo.jpg",
    size: "1 MB",
    size_bytes: 1_048_576,
    mime_type: "image/jpeg",
    data: new ArrayBuffer(8),
  };

  const with_attachment = {
    ...email_data,
    attachments: [attachment],
  } as never;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("saves the message with its attachments when the server queue fails", async () => {
    undo_send_delay_ms = 10_000;
    queue_email_to_server.mockResolvedValue({ queue_id: "q_fail" });
    const on_send_failed = vi.fn();

    await execute_internal_send(make_ctx({ on_send_failed }), with_attachment);

    const callbacks = queue_email_to_server.mock.calls[0][2] as {
      on_error: (error: string) => void;
    };

    callbacks.on_error("timeout");

    expect(on_send_failed).toHaveBeenCalledTimes(1);
    expect(on_send_failed).toHaveBeenCalledWith(
      expect.objectContaining({ attachments: [attachment] }),
    );
  });

  it("saves the message with its attachments when an immediate send fails", async () => {
    undo_send_delay_ms = 0;
    queue_email.mockReturnValue("local_fail");
    const on_send_failed = vi.fn();

    await execute_internal_send(make_ctx({ on_send_failed }), with_attachment);

    const queued = queue_email.mock.calls[0][0] as {
      on_error: (error: string) => void;
    };

    queued.on_error("upload failed");

    expect(on_send_failed).toHaveBeenCalledWith(
      expect.objectContaining({ attachments: [attachment] }),
    );
  });

  it("leaves compose open without a new draft when the send fails before hand-off", async () => {
    undo_send_delay_ms = 10_000;
    const on_send_failed = vi.fn();
    const on_close = vi.fn();

    queue_email_to_server.mockImplementation(
      async (
        _data: unknown,
        _delay: number,
        callbacks: { on_error: (e: string) => void },
      ) => {
        callbacks.on_error("no keys");

        return null;
      },
    );

    await expect(
      execute_internal_send(
        make_ctx({ on_send_failed, on_close }),
        with_attachment,
      ),
    ).resolves.toBe(false);

    expect(on_send_failed).not.toHaveBeenCalled();
    expect(on_close).not.toHaveBeenCalled();
  });
});
