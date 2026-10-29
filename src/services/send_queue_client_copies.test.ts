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

const h = vi.hoisted(() => ({
  queue_email: vi.fn(),
  send_simple: vi.fn(),
  build_copies: vi.fn(),
  seal_attachments: vi.fn(),
  signed_payload: vi.fn(),
}));

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));

vi.mock("./send_queue_encryption", async (import_original) => ({
  ...(await import_original<typeof import("./send_queue_encryption")>()),
  check_send_readiness_internal: () => ({ ready: true }),
  create_sent_envelope: vi.fn(async () => ({
    encrypted_envelope: "env",
    envelope_nonce: "nonce",
    folder_token: "folder",
  })),
}));

vi.mock("@/services/crypto/memory_key_store", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/crypto/memory_key_store")
  >()),
  get_vault_from_memory: () => ({ identity_key: "identity" }),
  has_passphrase_in_memory: () => true,
}));

vi.mock("./send_queue_envelope", () => ({
  create_sent_envelope: vi.fn(async () => ({
    encrypted_envelope: "env",
    envelope_nonce: "nonce",
    folder_token: "folder",
  })),
}));

vi.mock("./send_private_bcc", () => ({
  encrypt_with_private_bcc: vi.fn(async (body: string) => ({
    encrypted_body: body,
    is_encrypted: false,
  })),
  encrypt_attachments_with_private_bcc: h.seal_attachments,
}));

vi.mock("./current_identity", () => ({
  resolve_current_user: vi.fn(async () => ({ email: "me@astermail.org" })),
}));

vi.mock("./recipient_classification", () => ({
  classify_recipients: vi.fn(async () => new Map()),
  is_internal_recipient: (email: string) => email.endsWith("@astermail.org"),
}));

vi.mock("./send_queue_signed_mime", () => ({
  should_attach_signed_mime: () => true,
  build_signed_mime_payload: h.signed_payload,
}));

vi.mock("./client_pgp_copies", () => ({
  CLIENT_COPY_PLACEHOLDER_BODY: " ",
  build_client_pgp_copies: h.build_copies,
}));

vi.mock("./api/send", () => ({
  send_simple_email: h.send_simple,
  send_external_email: vi.fn(),
}));

vi.mock("./api/mail", () => ({
  mark_thread_read: vi.fn(async () => undefined),
}));

vi.mock("./undo_send_manager", () => ({
  undo_send_manager: { queue_email: h.queue_email },
}));

import { queue_email_to_server } from "./send_queue";
import { execute_send } from "./send_queue_execute";

function sent_request(): Record<string, unknown> {
  return h.queue_email.mock.calls[0]![0] as Record<string, unknown>;
}

describe("queue_email_to_server outside copies", () => {
  beforeEach(() => {
    h.queue_email.mockReset();
    h.queue_email.mockResolvedValue({ queue_id: "q1" });
    h.build_copies.mockReset();
    h.seal_attachments.mockReset();
    h.seal_attachments.mockResolvedValue([]);
    h.signed_payload.mockReset();
    h.signed_payload.mockResolvedValue({
      signed_mime: "bWltZQ==",
      signed_mime_signature: "sig",
      signed_mime_micalg: "pgp-sha512",
    });
  });

  it("sends only the encrypted copies and no readable content", async () => {
    h.build_copies.mockResolvedValue({ "pal@example.com": "armored" });

    await queue_email_to_server(
      {
        to: ["pal@example.com", "friend@astermail.org"],
        subject: "Private subject",
        body: "Private body",
      },
      5,
    );

    const request = sent_request();

    expect(request.external_pgp_bodies).toEqual({
      "pal@example.com": "armored",
    });
    expect(request.subject).toBe("");
    expect(request.body).toBe(" ");
    expect(request.signed_mime).toBeUndefined();
    expect(JSON.stringify(request)).not.toContain("Private subject");
    expect(JSON.stringify(request)).not.toContain("Private body");
    expect(h.build_copies.mock.calls[0]![0].outside_recipients).toEqual([
      "pal@example.com",
    ]);
  });

  it("keeps the existing request when no copies are made", async () => {
    h.build_copies.mockResolvedValue(undefined);

    await queue_email_to_server(
      { to: ["pal@example.com"], subject: "Hello", body: "Body" },
      5,
    );

    const request = sent_request();

    expect(request.external_pgp_bodies).toBeUndefined();
    expect(request.subject).toBe("Hello");
    expect(request.body).toBe("Body");
    expect(request.signed_mime).toBe("bWltZQ==");
  });

  it("seals attachment details when copies carry the attachments", async () => {
    h.build_copies.mockResolvedValue({ "pal@example.com": "armored" });

    await queue_email_to_server(
      {
        to: ["pal@example.com"],
        subject: "s",
        body: "b",
        attachments: [
          {
            id: "a",
            name: "a.pdf",
            size: "4",
            size_bytes: 4,
            mime_type: "application/pdf",
            data: new Uint8Array(4).buffer,
          },
        ],
      } as never,
      5,
    );

    expect(h.seal_attachments).toHaveBeenCalledTimes(1);
    expect(h.seal_attachments.mock.calls[0]![3]).toBe(true);
  });

  it("skips copies for internal-only sends", async () => {
    await queue_email_to_server(
      { to: ["friend@astermail.org"], subject: "s", body: "b" },
      5,
    );

    expect(h.build_copies).not.toHaveBeenCalled();
    expect(sent_request().external_pgp_bodies).toBeUndefined();
  });
});

describe("execute_send outside copies", () => {
  function queued(extra: Record<string, unknown> = {}) {
    return {
      id: "local-1",
      to: ["pal@example.com", "friend@astermail.org"],
      subject: "Private subject",
      body: "Private body",
      scheduled_time: 0,
      timeout_id: 0,
      callbacks: { on_complete: () => {}, on_cancel: () => {} },
      ...extra,
    } as never;
  }

  function simple_request(): Record<string, unknown> {
    return h.send_simple.mock.calls[0]![0] as Record<string, unknown>;
  }

  beforeEach(() => {
    h.send_simple.mockReset();
    h.send_simple.mockResolvedValue({
      data: { success: true, mail_item_id: "m1" },
    });
    h.build_copies.mockReset();
    h.seal_attachments.mockReset();
    h.seal_attachments.mockResolvedValue([]);
  });

  it("sends only the encrypted copies and no readable content", async () => {
    h.build_copies.mockResolvedValue({ "pal@example.com": "armored" });

    await execute_send(queued());

    const request = simple_request();

    expect(request.external_pgp_bodies).toEqual({
      "pal@example.com": "armored",
    });
    expect(request.subject).toBe("");
    expect(request.body).toBe(" ");
    expect(JSON.stringify(request)).not.toContain("Private subject");
    expect(JSON.stringify(request)).not.toContain("Private body");
    expect(h.build_copies.mock.calls[0]![0].outside_recipients).toEqual([
      "pal@example.com",
    ]);
  });

  it("keeps the existing request when no copies are made", async () => {
    h.build_copies.mockResolvedValue(undefined);

    await execute_send(queued());

    const request = simple_request();

    expect(request.external_pgp_bodies).toBeUndefined();
    expect(request.subject).toBe("Private subject");
  });

  it("skips copies for expiring messages", async () => {
    await execute_send(queued({ expires_at: "2030-01-01T00:00:00Z" }));

    expect(h.build_copies).not.toHaveBeenCalled();
    expect(simple_request().external_pgp_bodies).toBeUndefined();
  });

  it("refuses a locked recipient that has no encrypted copy", async () => {
    h.build_copies.mockResolvedValue(undefined);

    await expect(
      execute_send(queued({ pgp_recipients: ["Pal@Example.com"] })),
    ).rejects.toBeTruthy();

    expect(h.send_simple).not.toHaveBeenCalled();
  });

  it("sends a locked recipient that has an encrypted copy", async () => {
    h.build_copies.mockResolvedValue({ "pal@example.com": "armored" });

    await execute_send(queued({ pgp_recipients: ["pal@example.com"] }));

    expect(simple_request().external_pgp_bodies).toEqual({
      "pal@example.com": "armored",
    });
  });
});

describe("queue_email_to_server expiring messages", () => {
  beforeEach(() => {
    h.queue_email.mockReset();
    h.queue_email.mockResolvedValue({ queue_id: "q1" });
    h.build_copies.mockReset();
    h.seal_attachments.mockReset();
    h.seal_attachments.mockResolvedValue([]);
    h.signed_payload.mockReset();
    h.signed_payload.mockResolvedValue({
      signed_mime: "bWltZQ==",
      signed_mime_signature: "sig",
      signed_mime_micalg: "pgp-sha512",
    });
  });

  it("skips copies when the message expires", async () => {
    await queue_email_to_server(
      {
        to: ["pal@example.com"],
        subject: "s",
        body: "b",
        expires_at: "2030-01-01T00:00:00Z",
      },
      5,
    );

    expect(h.build_copies).not.toHaveBeenCalled();
    expect(sent_request().external_pgp_bodies).toBeUndefined();
  });
});
