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
  vault: {
    identity_key: "identity-secret",
    ratchet_identity_key: "",
    ratchet_identity_public: "",
  } as Record<string, unknown> | null,
  passphrase_bytes: null as Uint8Array | null,
  has_passphrase: true,
  account: {
    user: { id: "user-1", username: "owner", email: "owner@astermail.org" },
  } as Record<string, unknown> | null,
  simple_send_response: {
    data: { success: true, mail_item_id: "mail-1" },
  } as Record<string, unknown>,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => h.vault,
  get_passphrase_from_memory: () => "passphrase",
  get_passphrase_bytes: () =>
    h.passphrase_bytes === null ? null : h.passphrase_bytes.slice(),
  has_passphrase_in_memory: () => h.has_passphrase,
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account: vi.fn(async () => h.account),
}));

vi.mock("@/stores/ghost_alias_store", () => ({
  is_ghost_email: () => false,
  looks_like_unregistered_ghost_email: () => false,
}));

vi.mock("@/services/api/keys", async (import_original) => {
  const actual = await import_original<Record<string, unknown>>();

  return {
    ...actual,
    get_recipient_public_key: vi.fn(async () => ({
      data: { public_key: "recipient-public-key" },
    })),
  };
});

vi.mock("@/services/crypto/key_manager", () => ({
  encrypt_message_multi: vi.fn(async () => "PGP-CIPHERTEXT"),
}));

vi.mock("@/services/api/send", () => ({
  send_simple_email: vi.fn(async () => h.simple_send_response),
  send_external_email: vi.fn(async () => ({ data: { success: true } })),
}));

vi.mock("@/services/api/mail", () => ({
  mark_thread_read: vi.fn(async () => ({ data: {} })),
  list_encrypted_mail_items: vi.fn(async () => ({
    data: { items: [], next_cursor: null },
  })),
  update_mail_item: vi.fn(async () => ({ data: {} })),
}));

vi.mock("@/services/api/attachments", () => ({
  create_attachment: vi.fn(async () => ({ data: {} })),
}));

vi.mock("@/services/crypto/mail_metadata", () => ({
  encrypt_mail_metadata: vi.fn(async () => ({
    encrypted_metadata: "meta-ct",
    metadata_nonce: "meta-nonce",
  })),
}));

vi.mock("@/services/crypto/attachment_crypto", () => ({
  encrypt_attachments_for_send: vi.fn(async () => []),
  prepare_external_attachments: vi.fn(() => []),
}));

vi.mock("@/services/crypto/ensure_ratchet_keys", () => ({
  ensure_ratchet_keys: vi.fn(async () => {}),
}));

vi.mock("@/utils/email_crypto", () => ({
  discover_external_recipient_keys: vi.fn(async () => ({
    recipients_with_keys: [],
  })),
  build_subject_bundle: (subject: string, body: string) => `${subject} ${body}`,
  derive_own_public_key: vi.fn(async () => null),
}));

import { execute_send } from "./send_queue_encryption";
import { send_simple_email } from "./api/send";

import type { QueuedEmailInternal } from "./send_queue_types";

function queued(
  overrides: Partial<QueuedEmailInternal> = {},
): QueuedEmailInternal {
  return {
    id: "queued-1",
    to: ["outsider@example.com"],
    subject: "Hello",
    body: "Plain body",
    allow_non_post_quantum: true,
    scheduled_time: Date.now(),
    timeout_id: 0,
    callbacks: { on_complete: () => {}, on_cancel: () => {} },
    ...overrides,
  } as QueuedEmailInternal;
}

function last_request() {
  return vi.mocked(send_simple_email).mock.calls[0][0];
}

beforeEach(() => {
  h.vault = {
    identity_key: "identity-secret",
    ratchet_identity_key: "",
    ratchet_identity_public: "",
  };
  h.passphrase_bytes = new Uint8Array(32).fill(7);
  h.has_passphrase = true;
  h.account = {
    user: { id: "user-1", username: "owner", email: "owner@astermail.org" },
  };
  h.simple_send_response = { data: { success: true, mail_item_id: "mail-1" } };
  vi.clearAllMocks();
});

describe("mixed internal and external recipients", () => {
  it("still seals a copy for the internal recipients", async () => {
    await execute_send(
      queued({ to: ["friend@astermail.org", "outsider@example.com"] }),
    );

    expect(last_request().internal_encrypted_body).toBe("PGP-CIPHERTEXT");
  });

  it("keeps the external leg readable so smtp can deliver it", async () => {
    await execute_send(
      queued({
        to: ["friend@astermail.org", "outsider@example.com"],
        subject: "Hi",
        body: "Body text",
      }),
    );

    const request = last_request();

    expect(request.is_e2e_encrypted).toBe(false);
    expect(request.body).toBe("Body text");
    expect(request.subject).toBe("Hi");
  });

  it("bundles the subject into the sealed internal copy", async () => {
    await execute_send(
      queued({
        to: ["friend@astermail.org", "outsider@example.com"],
        subject: "Secret subject",
        body: "Body text",
      }),
    );

    const { encrypt_message_multi } = await import("./crypto/key_manager");
    const [plaintext] = vi.mocked(encrypt_message_multi).mock.calls[0];

    expect(plaintext).toBe("Secret subject Body text");
  });

  it("refuses to downgrade when post-quantum consent was not given", async () => {
    await expect(
      execute_send(
        queued({
          to: ["friend@astermail.org", "outsider@example.com"],
          allow_non_post_quantum: false,
        }),
      ),
    ).rejects.toMatchObject({
      type: "post_quantum_unavailable",
      recipients: ["friend@astermail.org"],
    });

    expect(vi.mocked(send_simple_email)).not.toHaveBeenCalled();
  });
});

describe("unmixed sends are unchanged", () => {
  it("puts the ciphertext in the body for an internal-only send", async () => {
    await execute_send(queued({ to: ["friend@astermail.org"] }));

    const request = last_request();

    expect(request.is_e2e_encrypted).toBe(true);
    expect(request.body).toBe("PGP-CIPHERTEXT");
    expect(request.subject).toBe("");
    expect(request.internal_encrypted_body).toBeUndefined();
  });

  it("seals nothing for an external-only send", async () => {
    await execute_send(queued({ to: ["outsider@example.com"] }));

    const request = last_request();

    expect(request.is_e2e_encrypted).toBe(false);
    expect(request.internal_encrypted_body).toBeUndefined();
  });
});
