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
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const switches = vi.hoisted(() => ({ vault: false, attachment: false }));

vi.mock("@/services/api/account_key", () => ({
  get_account_key_capabilities: async () => ({}),
  peek_account_key_capabilities: () => ({
    bound_vault_writes: switches.vault,
    bound_attachment_writes: switches.attachment,
  }),
}));

import { encrypt_data_with_session_key } from "./attachment_crypto";
import { decrypt_vault, encrypt_vault } from "./key_manager_pgp_vault";
import { reset_level2_state } from "./vault_level2";

const PASSWORD = "correct horse battery staple";
const VAULT_AAD = new TextEncoder().encode("aster-vault-v1");
const ATTACHMENT_AAD = new TextEncoder().encode(
  "aster-attachment-v2|att=2|part=data",
);

function vault_write_aad(spy: ReturnType<typeof vi.spyOn>): unknown {
  const params = spy.mock.calls[0][0] as AesGcmParams;

  return params.additionalData;
}

async function attachment_key(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new Uint8Array(32).fill(5),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

beforeEach(() => {
  switches.vault = false;
  switches.attachment = false;
  reset_level2_state();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("vault write form", () => {
  it("writes the form every app version reads while the switch is off", async () => {
    const spy = vi.spyOn(crypto.subtle, "encrypt");
    const sealed = await encrypt_vault(
      { identity_key: "plain" } as never,
      PASSWORD,
    );

    expect(vault_write_aad(spy)).toBeUndefined();

    const opened = await decrypt_vault(
      sealed.encrypted_vault,
      sealed.vault_nonce,
      PASSWORD,
    );

    expect(opened.identity_key).toBe("plain");
  }, 30_000);

  it("writes the bound form once the server turns the switch on", async () => {
    switches.vault = true;

    const spy = vi.spyOn(crypto.subtle, "encrypt");
    const sealed = await encrypt_vault(
      { identity_key: "bound" } as never,
      PASSWORD,
    );

    expect(vault_write_aad(spy)).toEqual(VAULT_AAD);

    const opened = await decrypt_vault(
      sealed.encrypted_vault,
      sealed.vault_nonce,
      PASSWORD,
    );

    expect(opened.identity_key).toBe("bound");
  }, 30_000);
});

describe("attachment write form", () => {
  const data = new TextEncoder().encode("file body");

  it("writes the unbound form while the switch is off", async () => {
    const key = await attachment_key();
    const { encrypted, nonce } = await encrypt_data_with_session_key(
      data.buffer,
      key,
      2,
      false,
    );
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      encrypted,
    );

    expect(new Uint8Array(plain)).toEqual(data);
  });

  it("binds the data to its slot when the switch is on", async () => {
    const key = await attachment_key();
    const { encrypted, nonce } = await encrypt_data_with_session_key(
      data.buffer,
      key,
      2,
      true,
    );
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce, additionalData: ATTACHMENT_AAD },
      key,
      encrypted,
    );

    expect(new Uint8Array(plain)).toEqual(data);
    await expect(
      crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, encrypted),
    ).rejects.toThrow();
  });
});
