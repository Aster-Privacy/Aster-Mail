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
import type { DecryptedEnvelope } from "@/types/email";

import { describe, it, expect, vi, beforeEach } from "vitest";

const reencrypt_mail_item_envelope = vi.fn(
  async (): Promise<{ data?: { success: boolean }; status?: number }> => ({
    data: { success: true },
  }),
);

vi.mock("@/services/api/mail", () => ({
  list_encrypted_mail_items: vi.fn(),
  reencrypt_mail_item_envelope: (...args: unknown[]) =>
    reencrypt_mail_item_envelope(...(args as [])),
}));
vi.mock("@/services/crypto/stored_envelope_write", () => ({
  encrypt_envelope_for_storage: vi.fn(async () => ({
    encrypted: "ZW52",
    nonce: "bm9uY2U=",
  })),
}));
vi.mock("@/services/crypto/memory_key_store", () => ({
  on_vault_cleared: () => () => {},
  on_vault_stored: () => () => {},
  get_passphrase_bytes: vi.fn(),
  get_passphrase_from_memory: vi.fn(),
  get_vault_from_memory: () => ({ identity_key: "identity" }),
  wait_for_keys_ready: vi.fn(async () => undefined),
}));
vi.mock("@/workers/pgp_decrypt_pool", () => ({
  decrypt_pgp_message_parallel: vi.fn(),
}));

function make_envelope(): DecryptedEnvelope {
  return {
    subject: "Subject",
    body_text: "body",
    body_html: "<p>body</p>",
    from: { name: "Alice", email: "alice@example.com" },
    to: [],
    cc: [],
    bcc: [],
    sent_at: "2026-01-01T00:00:00Z",
  } as unknown as DecryptedEnvelope;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

async function load_module() {
  vi.resetModules();

  return import("@/hooks/use_search/envelope");
}

describe("legacy envelope migration retirement", () => {
  beforeEach(() => {
    reencrypt_mail_item_envelope.mockClear();
    localStorage.clear();
  });

  it("sends a single probe before fanning out", async () => {
    let release: () => void = () => undefined;

    reencrypt_mail_item_envelope.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ status: 410 });
        }),
    );

    const mod = await load_module();

    mod.reset_legacy_migration_state();
    for (const id of ["a", "b", "c", "d", "e"]) {
      mod.schedule_legacy_envelope_migration(id, "received", make_envelope());
    }
    await flush();
    await flush();

    expect(reencrypt_mail_item_envelope).toHaveBeenCalledTimes(1);

    release();
    await flush();
    await flush();

    expect(reencrypt_mail_item_envelope).toHaveBeenCalledTimes(1);
    expect(mod.is_legacy_migration_retired()).toBe(true);
  });

  it("remembers a retired endpoint across reloads", async () => {
    reencrypt_mail_item_envelope.mockResolvedValueOnce({ status: 410 });

    const first = await load_module();

    first.reset_legacy_migration_state();
    first.schedule_legacy_envelope_migration("x", "received", make_envelope());
    await flush();
    await flush();

    expect(localStorage.getItem(first.LEGACY_MIGRATION_RETIRED_KEY)).toBe("1");

    const second = await load_module();

    second.reset_legacy_migration_state();
    second.schedule_legacy_envelope_migration("y", "received", make_envelope());
    await flush();

    expect(reencrypt_mail_item_envelope).toHaveBeenCalledTimes(1);
  });

  it("fans out once the first migration succeeds", async () => {
    const mod = await load_module();

    mod.reset_legacy_migration_state();
    mod.schedule_legacy_envelope_migration("p", "received", make_envelope());
    await flush();
    await flush();

    for (const id of ["q", "r", "s"]) {
      mod.schedule_legacy_envelope_migration(id, "received", make_envelope());
    }
    await flush();
    await flush();

    expect(reencrypt_mail_item_envelope).toHaveBeenCalledTimes(4);
  });
});
