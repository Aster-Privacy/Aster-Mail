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

import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha256 } from "@noble/hashes/sha256";

const mock_get_vault = vi.fn();
const mock_write_key = vi.fn();
const mock_list_aliases = vi.fn();
const mock_list_contacts = vi.fn();
const mock_rekey_user_data = vi.fn();

vi.mock("./memory_key_store", async (original) => ({
  ...(await original<object>()),
  get_vault_from_memory: () => mock_get_vault(),
}));

vi.mock("./storage_write_key", async (original) => ({
  ...(await original<object>()),
  load_storage_write_key_bytes: () => mock_write_key(),
}));

vi.mock("@/services/api/aliases", () => ({
  list_aliases: (...args: unknown[]) => mock_list_aliases(...args),
}));

vi.mock("@/services/api/contacts", () => ({
  list_contacts: (...args: unknown[]) => mock_list_contacts(...args),
}));

vi.mock("@/services/api/auth", () => ({
  rekey_user_data: (...args: unknown[]) => mock_rekey_user_data(...args),
}));

import { array_to_base64 } from "./base64";
import {
  decrypt_envelope_v2_with_vault,
  encrypt_envelope_v2,
  envelope_v2_keys_from_vault,
} from "./envelope_v2";
import { auto_rekey_if_needed, reset_rekey_flag } from "./auto_rekey";

const PUBLIC_ENVELOPE_RAW = sha256(
  new TextEncoder().encode("undefined" + "astermail-envelope-v1"),
);
const PUBLIC_IMPORT_RAW = sha256(
  new TextEncoder().encode("undefined" + "astermail-import-v1"),
);

function vault_with(legacy: Uint8Array[]): EncryptedVault {
  return {
    identity_key: "identity",
    previous_keys: [],
    signed_prekey: "signed_prekey_public",
    signed_prekey_private: "signed_prekey_private",
    recovery_codes: ["code_one"],
    data_kek: array_to_base64(crypto.getRandomValues(new Uint8Array(32))),
    legacy_keks: legacy.map((raw) => ({
      k: array_to_base64(raw),
      added_at: "2026-01-01T00:00:00Z",
    })),
  } as EncryptedVault;
}

function same_bytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

async function seal_alias_under(raw: Uint8Array, local_part: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(raw),
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(local_part),
    ),
  );

  return {
    id: "alias_one",
    is_random: false,
    domain: "astermail.org",
    encrypted_local_part: array_to_base64(sealed),
    local_part_nonce: array_to_base64(iv),
  };
}

describe("stored mail keys that anyone can compute", () => {
  beforeEach(() => {
    reset_rekey_flag();
    mock_get_vault.mockReset();
    mock_write_key.mockReset();
    mock_list_aliases.mockReset();
    mock_list_contacts.mockReset();
    mock_rekey_user_data.mockReset();
  });

  it("are left out of the level two read keys", () => {
    const older = crypto.getRandomValues(new Uint8Array(32));
    const keys = envelope_v2_keys_from_vault(
      vault_with([PUBLIC_ENVELOPE_RAW, PUBLIC_IMPORT_RAW, older]),
    );

    expect(keys.some((key) => same_bytes(key, PUBLIC_ENVELOPE_RAW))).toBe(
      false,
    );
    expect(keys.some((key) => same_bytes(key, PUBLIC_IMPORT_RAW))).toBe(false);
    expect(keys.some((key) => same_bytes(key, older))).toBe(true);
  });

  it("do not open a level two envelope", async () => {
    const { encrypted } = await encrypt_envelope_v2(
      { subject: "planted" },
      PUBLIC_ENVELOPE_RAW,
    );

    expect(
      await decrypt_envelope_v2_with_vault(
        encrypted,
        vault_with([PUBLIC_ENVELOPE_RAW]),
      ),
    ).toBeNull();
  });

  it("still open a level two envelope under an ordinary older key", async () => {
    const older = crypto.getRandomValues(new Uint8Array(32));
    const { encrypted } = await encrypt_envelope_v2({ subject: "kept" }, older);

    expect(
      await decrypt_envelope_v2_with_vault(encrypted, vault_with([older])),
    ).toMatchObject({ subject: "kept" });
  });

  it("are never used to rewrite stored data", async () => {
    mock_get_vault.mockReturnValue(vault_with([PUBLIC_IMPORT_RAW]));
    mock_write_key.mockResolvedValue(crypto.getRandomValues(new Uint8Array(32)));
    mock_list_aliases.mockResolvedValue({
      data: {
        aliases: [await seal_alias_under(PUBLIC_IMPORT_RAW, "planted")],
        has_more: false,
      },
    });
    mock_list_contacts.mockResolvedValue({
      data: { items: [], has_more: false },
    });
    mock_rekey_user_data.mockResolvedValue({ data: {} });

    await auto_rekey_if_needed();

    expect(mock_rekey_user_data).not.toHaveBeenCalled();
  });

  it("leave ordinary older keys available to rewrite stored data", async () => {
    const older = crypto.getRandomValues(new Uint8Array(32));

    mock_get_vault.mockReturnValue(vault_with([older]));
    mock_write_key.mockResolvedValue(crypto.getRandomValues(new Uint8Array(32)));
    mock_list_aliases.mockResolvedValue({
      data: {
        aliases: [await seal_alias_under(older, "kept")],
        has_more: false,
      },
    });
    mock_list_contacts.mockResolvedValue({
      data: { items: [], has_more: false },
    });
    mock_rekey_user_data.mockResolvedValue({ data: {} });

    await auto_rekey_if_needed();

    expect(mock_rekey_user_data).toHaveBeenCalledTimes(1);
  });
});
