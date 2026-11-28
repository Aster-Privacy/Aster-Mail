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
import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get_mail_item: vi.fn(),
  decrypt_mail_envelope: vi.fn(),
  fetch_and_decrypt_thread_messages: vi.fn(),
  resolve_inbound_pgp_body: vi.fn(),
}));

vi.mock("@/utils/email_crypto", async (import_original) => {
  const actual = await import_original<typeof import("@/utils/email_crypto")>();

  return {
    ...actual,
    resolve_inbound_pgp_body: mocks.resolve_inbound_pgp_body,
  };
});

vi.mock("@/services/api/mail", () => ({
  get_mail_item: mocks.get_mail_item,
}));

vi.mock("@/components/email/shared/decrypt_envelope", () => ({
  decrypt_mail_envelope: mocks.decrypt_mail_envelope,
}));

vi.mock("@/services/thread_service", () => ({
  fetch_and_decrypt_thread_messages: mocks.fetch_and_decrypt_thread_messages,
  resolve_reaction_emojis: vi.fn(async () => undefined),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  on_vault_stored: () => () => {},
  get_vault_from_memory: () => null,
  wait_for_keys_ready: vi.fn(async () => undefined),
  are_keys_ready: () => true,
  get_vault_account_epoch: () => 0,
  on_vault_cleared: () => () => {},
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account: vi.fn(async () => null),
}));

vi.mock("@/services/attachment_meta_cache", () => ({
  prefetch_attachment_meta: vi.fn(async () => undefined),
  clear_attachment_meta_cache: vi.fn(),
}));

vi.mock("@/services/attachment_preview_cache", () => ({
  prefetch_attachment_previews: vi.fn(async () => undefined),
  clear_attachment_preview_cache: vi.fn(),
}));

import {
  clear_preload_cache,
  get_preload_cache,
  preload_email_detail,
} from "./preload_cache";

const ARMORED =
  "-----BEGIN PGP MESSAGE-----\n\nwcBMA\n-----END PGP MESSAGE-----";

function seed_server(decrypted: boolean) {
  mocks.get_mail_item.mockResolvedValue({
    data: {
      id: "msg_pgp",
      item_type: "received",
      thread_token: null,
      is_external: true,
      encrypted_envelope: "env",
      envelope_nonce: "nonce",
      created_at: "2026-01-02T10:00:00Z",
      message_ts: "2026-01-02T10:00:00Z",
      metadata: { is_read: false, is_starred: false, has_attachments: false },
    },
  });
  mocks.decrypt_mail_envelope.mockResolvedValue({
    subject: "Forwarded",
    body_text: ARMORED,
    from: { name: "Relay", email: "relay@example.com" },
    to: [],
    cc: [],
    bcc: [],
    sent_at: "2026-01-02T10:00:00Z",
  });
  mocks.resolve_inbound_pgp_body.mockResolvedValue(
    decrypted
      ? {
          body: "See the attached file.",
          decrypted: true,
          verified: false,
          decrypted_content_tag: "tag_1",
          decrypted_attachments: [
            { filename: "report.pdf", content_type: "application/pdf" },
          ],
        }
      : { body: ARMORED, decrypted: false, verified: false },
  );
}

describe("preload_email_detail with decrypted attachments", () => {
  beforeEach(() => {
    clear_preload_cache();
    vi.clearAllMocks();
  });

  it("keeps the decrypted content tag on the preloaded message", async () => {
    seed_server(true);

    await preload_email_detail("msg_pgp", undefined, true, false);

    const entry = get_preload_cache().get("msg_pgp");

    expect(entry?.thread_messages[0]?.decrypted_content_tag).toBe("tag_1");
    expect(entry?.email.has_attachment).toBe(true);
  });

  it("leaves the tag off a message it could not decrypt", async () => {
    seed_server(false);

    await preload_email_detail("msg_pgp", undefined, true, false);

    const entry = get_preload_cache().get("msg_pgp");

    expect(entry?.thread_messages[0]?.decrypted_content_tag).toBeUndefined();
    expect(entry?.email.has_attachment).toBe(false);
  });
});
