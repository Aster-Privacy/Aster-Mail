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
  build_signed_mime_payload: vi.fn(
    async (_params: Record<string, unknown>) => ({
      signed_mime: "bWltZQ==",
      signed_mime_signature: "signature",
      signed_mime_micalg: "pgp-sha512",
    }),
  ),
  queue_email: vi.fn(async () => ({ queue_id: "queue-1" })),
}));

vi.mock("./send_queue_signed_mime", async (import_original) => ({
  ...(await import_original<typeof import("./send_queue_signed_mime")>()),
  should_attach_signed_mime: () => true,
  build_signed_mime_payload: h.build_signed_mime_payload,
}));

vi.mock("./undo_send_manager", () => ({
  undo_send_manager: { queue_email: h.queue_email },
}));

vi.mock("./current_identity", () => ({
  resolve_current_user: async () => ({ email: "me@astermail.org" }),
}));

vi.mock("./send_queue_body_encryption", async (import_original) => ({
  ...(await import_original<typeof import("./send_queue_body_encryption")>()),
  check_send_readiness_internal: () => ({ ready: true }),
}));

vi.mock("./send_queue_envelope", () => ({
  create_sent_envelope: async () => ({
    encrypted_envelope: "envelope",
    envelope_nonce: "nonce",
    folder_token: "folder",
  }),
}));

vi.mock("./send_queue_ephemeral", () => ({
  encrypt_with_ephemeral_key: async () => ({
    encrypted_recipients: "r",
    encrypted_subject: "s",
    encrypted_body: "b",
    ephemeral_key: "k",
    nonce: "n",
  }),
}));

vi.mock("./send_private_bcc", () => ({
  encrypt_with_private_bcc: async (body: string) => ({
    encrypted_body: body,
    is_encrypted: false,
  }),
  encrypt_attachments_with_private_bcc: async () => [],
}));

vi.mock("./recipient_classification", () => ({
  classify_recipients: async () => {},
  is_internal_recipient: () => false,
}));

vi.mock("./api/send", () => ({
  send_external_email: vi.fn(async () => ({
    data: { success: true, mail_item_id: "mail-1" },
  })),
  send_simple_email: vi.fn(),
}));

vi.mock("./api/mail", () => ({
  mark_thread_read: vi.fn(async () => ({ data: {} })),
}));

import { execute_external_send } from "./send_queue_execute";
import { queue_email_to_server } from "./send_queue";

const plain_email = {
  to: ["reader@example.org"],
  subject: "Plain",
  body: "Use &lt;project&gt;<br>Then restart.",
  is_plain_text: true,
};

beforeEach(() => {
  h.build_signed_mime_payload.mockClear();
  h.queue_email.mockClear();
});

describe("plain text mode reaches the signed mime builder", () => {
  it("on an immediate external send", async () => {
    await execute_external_send(plain_email);

    expect(h.build_signed_mime_payload).toHaveBeenCalledTimes(1);
    expect(h.build_signed_mime_payload.mock.calls[0][0]).toMatchObject({
      body: plain_email.body,
      is_plain_text: true,
    });
  });

  it("on a send held in the undo queue", async () => {
    await queue_email_to_server(plain_email, 10);

    expect(h.build_signed_mime_payload).toHaveBeenCalledTimes(1);
    expect(h.build_signed_mime_payload.mock.calls[0][0]).toMatchObject({
      body: plain_email.body,
      is_plain_text: true,
    });
    expect(h.queue_email).toHaveBeenCalledTimes(1);
  });

  it("leaves a rich text send on the html alternative", async () => {
    await execute_external_send({ ...plain_email, is_plain_text: undefined });

    expect(
      h.build_signed_mime_payload.mock.calls[0][0].is_plain_text,
    ).toBeFalsy();
  });
});
