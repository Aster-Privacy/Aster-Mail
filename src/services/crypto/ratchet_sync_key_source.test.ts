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

const holder: {
  user_id: string | undefined;
  vault: Record<string, unknown> | null;
  data_kek: Uint8Array;
} = { user_id: "user-1", vault: null, data_kek: new Uint8Array(32) };

vi.mock("@/services/account_manager", () => ({
  get_current_account: vi.fn(async () =>
    holder.user_id ? { user: { id: holder.user_id } } : null,
  ),
}));

vi.mock("./storage_write_key", () => ({
  load_storage_write_key_bytes: vi.fn(async () => holder.data_kek.slice()),
}));

vi.mock("./memory_key_store", () => ({
  get_vault_from_memory: vi.fn(() => holder.vault),
}));

import * as conversation from "./ratchet_conversation";

const data_kek = Uint8Array.from({ length: 32 }, (_, i) => i + 1);

const vault_under_old_login = {
  data_kek_random: true,
  data_kek: "kek-under-old-login",
  kdf_salt: "old-salt",
};

const vault_under_new_login = {
  data_kek_random: true,
  data_kek: "kek-under-new-login",
  kdf_salt: "new-salt",
};

async function seal(key: CryptoKey, text: string) {
  const iv = new Uint8Array(12);
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(text),
  );

  return { iv, sealed };
}

async function open_with(
  key: CryptoKey,
  box: { iv: Uint8Array; sealed: ArrayBuffer },
) {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: box.iv },
    key,
    box.sealed,
  );

  return new TextDecoder().decode(plain);
}

type WaitFn = (attempts?: number, retry_ms?: number) => Promise<unknown>;

describe("ratchet sync key source", () => {
  beforeEach(() => {
    holder.user_id = "user-1";
    holder.data_kek = data_kek;
    holder.vault = null;
  });

  it("gives the same key before and after the login key changes", async () => {
    holder.vault = vault_under_old_login;
    const before = await conversation.get_sync_encryption_key();

    holder.vault = vault_under_new_login;
    const after = await conversation.get_sync_encryption_key();

    expect(before).not.toBeNull();
    expect(after).not.toBeNull();

    const box = await seal(before!.state_key, "state");

    expect(await open_with(after!.state_key, box)).toBe("state");
  });

  it("gives no key while the storage key still comes from the password", async () => {
    holder.vault = { data_kek_random: false, data_kek: "password-derived" };

    expect(await conversation.get_sync_encryption_key()).toBeNull();
  });

  it("retries once the account has loaded", async () => {
    const lookup = conversation as Record<string, unknown>;
    const wait = lookup.wait_for_sync_encryption_key as WaitFn | undefined;

    expect(wait).toBeTypeOf("function");

    holder.vault = vault_under_old_login;
    holder.user_id = undefined;

    const pending = wait?.(4, 5);

    setTimeout(() => {
      holder.user_id = "user-1";
    }, 2);

    expect(await pending).not.toBeNull();
  });
});
