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

const api_mocks = vi.hoisted(() => ({
  get_mail_item: vi.fn(),
  create_thread: vi.fn(),
  link_mail_to_thread: vi.fn(),
}));

const key_mocks = vi.hoisted(() => ({
  get_passphrase_bytes: vi.fn(),
  wait_for_keys_ready: vi.fn(async () => undefined),
}));

vi.mock("./api/mail", () => ({
  get_thread_messages: vi.fn(),
  list_mail_items: vi.fn(),
  ...api_mocks,
}));

vi.mock("./crypto/memory_key_store", () => ({
  get_vault_from_memory: vi.fn(),
  ...key_mocks,
}));

vi.mock("./crypto/envelope", () => ({ array_to_base64: vi.fn(() => "") }));
vi.mock("./crypto/ratchet_manager", () => ({
  parse_ratchet_envelope: vi.fn(),
  decrypt_ratchet_message: vi.fn(),
}));
vi.mock("./crypto/secure_memory", () => ({ zero_uint8_array: vi.fn() }));
vi.mock("./crypto/mail_metadata", () => ({ decrypt_mail_metadata: vi.fn() }));
vi.mock("@/components/email/shared/decrypt_envelope", () => ({
  decrypt_mail_envelope: vi.fn(),
}));
vi.mock("@/lib/i18n/translations", () => ({
  get_active_translations: vi.fn(() => ({ common: {} })),
}));
vi.mock("@/services/crypto/constants", () => ({ HASH_ALG: "SHA-256" }));
vi.mock("@/utils/email_crypto", () => ({
  try_extract_mime_body: vi.fn(),
  RATCHET_UNDECRYPTABLE_SENTINEL: "",
  extract_subject_bundle: vi.fn(),
  unwrap_bundle_html: vi.fn(),
  is_ratchet_envelope: vi.fn(),
  is_password_protected_body: vi.fn(),
  resolve_inbound_pgp_body: vi.fn(),
}));
vi.mock("@/services/locked_folders", () => ({
  filter_locked_mail_items: vi.fn(),
}));
vi.mock("@/utils/forwarding_alias", () => ({
  resolve_forwarding_display: vi.fn(),
}));
vi.mock("@/lib/reaction_payload", () => ({
  is_reaction_payload_body: vi.fn(),
}));
vi.mock("@/utils/email_timestamp", () => ({
  compare_timestamps_asc: vi.fn(),
}));

import { get_or_create_thread_token } from "./thread_service";

describe("get_or_create_thread_token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the token the caller already has without touching the server", async () => {
    const result = await get_or_create_thread_token("item-1", "known-token");

    expect(result).toBe("known-token");
    expect(api_mocks.get_mail_item).not.toHaveBeenCalled();
    expect(api_mocks.create_thread).not.toHaveBeenCalled();
    expect(api_mocks.link_mail_to_thread).not.toHaveBeenCalled();
  });

  it("reuses the thread the item already belongs to instead of relinking it", async () => {
    api_mocks.get_mail_item.mockResolvedValue({
      data: { id: "item-1", thread_token: "server-token" },
    });

    const result = await get_or_create_thread_token("item-1");

    expect(result).toBe("server-token");
    expect(api_mocks.create_thread).not.toHaveBeenCalled();
    expect(api_mocks.link_mail_to_thread).not.toHaveBeenCalled();
  });

  it("does not link anything when the item has no thread and keys are unavailable", async () => {
    api_mocks.get_mail_item.mockResolvedValue({
      data: { id: "item-1", thread_token: undefined },
    });
    key_mocks.get_passphrase_bytes.mockReturnValue(null);

    const result = await get_or_create_thread_token("item-1");

    expect(result).toBeNull();
    expect(api_mocks.link_mail_to_thread).not.toHaveBeenCalled();
  });

  it("falls back to no token when the item lookup fails", async () => {
    api_mocks.get_mail_item.mockRejectedValue(new Error("network"));
    key_mocks.get_passphrase_bytes.mockReturnValue(null);

    const result = await get_or_create_thread_token("item-1");

    expect(result).toBeNull();
    expect(api_mocks.create_thread).not.toHaveBeenCalled();
  });
});
