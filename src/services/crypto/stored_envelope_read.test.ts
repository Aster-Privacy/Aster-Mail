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
import type { EncryptedVault } from "./key_manager_core";

import { afterEach, describe, expect, it, vi } from "vitest";

const capabilities = { bound_envelope_writes: false };

vi.mock("@/services/api/account_key", () => ({
  peek_account_key_capabilities: () => capabilities,
}));

vi.mock("./vault_level2", () => ({
  is_level2_admitted: () => true,
}));

import { array_to_base64, base64_to_array } from "./base64";
import { decrypt_mail_envelope } from "@/components/email/shared/decrypt_envelope";
import { encrypt_envelope_v2 } from "./envelope_v2";
import {
  MASTER_KEY_VAULT_FORMAT,
  clear_vault_from_memory,
  store_vault_in_memory,
} from "./memory_key_store";
import { open_stored_envelope } from "./stored_envelope_read";
import { encrypt_envelope_for_storage } from "./stored_envelope_write";

const PASSWORD = "Binding-Passw0rd-31";
const OWNER = "11111111-2222-4333-8444-555555555555";
const LONG_TEST = { timeout: 120000 };

async function unlock(): Promise<{ vault: EncryptedVault; key: Uint8Array }> {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const vault: EncryptedVault = {
    identity_key: "test-identity-key",
    signed_prekey: "test-signed-prekey",
    signed_prekey_private: "test-signed-prekey-private",
    recovery_codes: [],
    data_kek: array_to_base64(key),
    data_kek_random: true,
    vault_format: MASTER_KEY_VAULT_FORMAT,
  } as EncryptedVault;

  await store_vault_in_memory(vault, PASSWORD, OWNER);

  return { vault, key };
}

afterEach(() => {
  capabilities.bound_envelope_writes = false;
  clear_vault_from_memory();
});

describe("stored envelope reads and writes", () => {
  it("writes unbound envelopes while the server switch is off", LONG_TEST, async () => {
    const { vault } = await unlock();
    const sealed = await encrypt_envelope_for_storage({ subject: "a" }, vault, "item-a");

    expect(sealed.nonce).toBe("Ag==");
  });

  it("binds envelopes to the item once the switch is on", LONG_TEST, async () => {
    capabilities.bound_envelope_writes = true;

    const { vault } = await unlock();
    const sealed = await encrypt_envelope_for_storage({ subject: "a" }, vault, "item-a");
    const nonce = base64_to_array(sealed.nonce);

    expect(sealed.nonce).toBe("Aw==");
    expect(
      await open_stored_envelope(sealed.encrypted, nonce, vault, "item-a"),
    ).toEqual({ subject: "a" });
    expect(
      await open_stored_envelope(sealed.encrypted, nonce, vault, "item-b"),
    ).toBeNull();
    expect(
      await open_stored_envelope(sealed.encrypted, nonce, vault, undefined),
    ).toBeNull();
  });

  it("refuses a bound envelope copied onto another mail item", LONG_TEST, async () => {
    const { key } = await unlock();
    const sealed = await encrypt_envelope_v2({ subject: "moved" }, key, {
      owner_id: OWNER,
      item_id: "item-a",
    });

    expect(
      await decrypt_mail_envelope(sealed.encrypted, sealed.nonce, "item-a"),
    ).toMatchObject({ subject: "moved" });
    expect(
      await decrypt_mail_envelope(sealed.encrypted, sealed.nonce, "item-b"),
    ).toBeNull();
  });

  it("opens unbound envelopes older clients wrote", LONG_TEST, async () => {
    const { key } = await unlock();
    const sealed = await encrypt_envelope_v2({ subject: "old" }, key);

    expect(
      await decrypt_mail_envelope(sealed.encrypted, sealed.nonce, "item-a"),
    ).toMatchObject({ subject: "old" });
  });
});
