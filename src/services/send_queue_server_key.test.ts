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

vi.mock("./send_private_bcc", () => ({
  encrypt_with_private_bcc: vi.fn(async (body: string) => ({
    encrypted_body: body,
    is_encrypted: false,
  })),
  encrypt_attachments_with_private_bcc: vi.fn(async () => []),
}));

vi.mock("./current_identity", () => ({
  resolve_current_user: vi.fn(async () => ({ email: "me@astermail.org" })),
}));

vi.mock("./recipient_classification", () => ({
  classify_recipients: vi.fn(async () => new Map()),
  is_internal_recipient: (email: string) => email.endsWith("@astermail.org"),
}));

vi.mock("./send_queue_signed_mime", () => ({
  should_attach_signed_mime: () => false,
  build_signed_mime_payload: vi.fn(),
}));

vi.mock("./undo_send_manager", () => ({
  undo_send_manager: { queue_email: h.queue_email },
}));

import { queue_email_to_server } from "./send_queue";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sent_request(): Record<string, unknown> {
  return h.queue_email.mock.calls[0]![0] as Record<string, unknown>;
}

describe("queue_email_to_server retry key", () => {
  beforeEach(() => {
    h.queue_email.mockReset();
    h.queue_email.mockResolvedValue({ queue_id: "q1" });
  });

  it("sends the caller's key so a retry cannot queue the email twice", async () => {
    const key = "0b6a5e2d-3c4f-4a1b-9d8e-7f6a5b4c3d2e";

    await queue_email_to_server(
      {
        to: ["friend@astermail.org", "someone@example.com"],
        subject: "Hello",
        body: "Body",
        client_send_id: key,
      },
      1,
    );

    expect(h.queue_email).toHaveBeenCalledTimes(1);
    expect(sent_request().client_send_id).toBe(key);
    expect(sent_request().delay_seconds).toBe(1);
  });

  it("replaces a missing or malformed key with a fresh one", async () => {
    await queue_email_to_server(
      { to: ["someone@example.com"], subject: "s", body: "b" },
      5,
    );
    await queue_email_to_server(
      {
        to: ["someone@example.com"],
        subject: "s",
        body: "b",
        client_send_id: "not-a-uuid",
      },
      5,
    );

    const first = h.queue_email.mock.calls[0]![0].client_send_id as string;
    const second = h.queue_email.mock.calls[1]![0].client_send_id as string;

    expect(first).toMatch(UUID_PATTERN);
    expect(second).toMatch(UUID_PATTERN);
    expect(second).not.toBe("not-a-uuid");
    expect(first).not.toBe(second);
  });
});
