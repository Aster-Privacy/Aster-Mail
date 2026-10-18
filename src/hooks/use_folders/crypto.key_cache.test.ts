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
import type { FolderDefinition } from "@/services/api/folders";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  array_to_base64,
  base64_to_array,
  decrypt_folder,
  decrypt_folder_field,
  derive_folder_key,
  encrypt_folder_field,
} from "./crypto";

import { clear_vault_from_memory } from "@/services/crypto/memory_key_store";
import { start_session } from "@/services/crypto/crypto_key_cache";

const IDENTITY_A = "-----BEGIN PGP PRIVATE KEY BLOCK-----\nalpha\n";
const IDENTITY_B = "-----BEGIN PGP PRIVATE KEY BLOCK-----\nbravo\n";
const FOLDER_COUNT = 30;

async function encrypt_with_derived_key(
  field: string,
  identity_key: string,
): Promise<{ encrypted: string; nonce: string }> {
  const key = await derive_folder_key(identity_key);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(field),
  );

  return {
    encrypted: array_to_base64(new Uint8Array(encrypted)),
    nonce: array_to_base64(nonce),
  };
}

async function build_folder(
  index: number,
  identity_key: string,
): Promise<FolderDefinition> {
  const name = await encrypt_with_derived_key(`Folder ${index}`, identity_key);
  const color = await encrypt_with_derived_key("#123456", identity_key);
  const icon = await encrypt_with_derived_key("star", identity_key);

  return {
    id: `f${index}`,
    folder_token: `token-${index}`,
    encrypted_name: name.encrypted,
    name_nonce: name.nonce,
    encrypted_color: color.encrypted,
    color_nonce: color.nonce,
    encrypted_icon: icon.encrypted,
    icon_nonce: icon.nonce,
    is_system: false,
    sort_order: index,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } as FolderDefinition;
}

function key_derivations(spy: { mock: { calls: unknown[][] } }): number {
  return spy.mock.calls.filter((call) =>
    new TextDecoder()
      .decode(call[1] as Uint8Array)
      .endsWith("astermail-labels-v1"),
  ).length;
}

function aes_imports(spy: { mock: { calls: unknown[][] } }): number {
  return spy.mock.calls.filter(
    (call) => (call[2] as { name?: string })?.name === "AES-GCM",
  ).length;
}

let folders_a: FolderDefinition[] = [];

beforeEach(async () => {
  clear_vault_from_memory();
  folders_a = await Promise.all(
    Array.from({ length: FOLDER_COUNT }, (_, i) => build_folder(i, IDENTITY_A)),
  );
  start_session();
});

afterEach(() => {
  vi.restoreAllMocks();
  clear_vault_from_memory();
});

describe("folder field key cache", () => {
  it("derives the key once for every field of every folder", async () => {
    const digest = vi.spyOn(crypto.subtle, "digest");
    const import_key = vi.spyOn(crypto.subtle, "importKey");

    const decrypted = await Promise.all(
      folders_a.map((folder) => decrypt_folder(folder, IDENTITY_A)),
    );

    expect(decrypted.map((folder) => folder?.name)).toEqual(
      Array.from({ length: FOLDER_COUNT }, (_, i) => `Folder ${i}`),
    );
    expect(decrypted.every((folder) => folder?.color === "#123456")).toBe(true);
    expect(decrypted.every((folder) => folder?.icon === "star")).toBe(true);
    expect(key_derivations(digest)).toBe(1);
    expect(aes_imports(import_key)).toBe(1);

    await Promise.all(
      folders_a.map((folder) => decrypt_folder(folder, IDENTITY_A)),
    );
    await encrypt_folder_field("New", IDENTITY_A);
    expect(key_derivations(digest)).toBe(1);
    expect(aes_imports(import_key)).toBe(1);
  });

  it("encrypts fields that the derived key still decrypts", async () => {
    const { encrypted, nonce } = await encrypt_folder_field(
      "Receipts",
      IDENTITY_A,
    );
    const key = await derive_folder_key(IDENTITY_A);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64_to_array(nonce) },
      key,
      base64_to_array(encrypted),
    );

    expect(new TextDecoder().decode(plain)).toBe("Receipts");
  });

  it("derives the key again after the vault is cleared", async () => {
    const digest = vi.spyOn(crypto.subtle, "digest");
    const import_key = vi.spyOn(crypto.subtle, "importKey");

    await decrypt_folder(folders_a[0], IDENTITY_A);
    clear_vault_from_memory();
    start_session();
    const decrypted = await decrypt_folder(folders_a[1], IDENTITY_A);

    expect(decrypted?.name).toBe("Folder 1");
    expect(aes_imports(import_key)).toBe(2);
    expect(
      digest.mock.calls.filter((call) =>
        new TextDecoder()
          .decode(call[1] as Uint8Array)
          .startsWith("folder_field_key\x00"),
      ),
    ).toHaveLength(2);
  });

  it("does not keep a key that finished deriving after the vault was cleared", async () => {
    const import_key = vi.spyOn(crypto.subtle, "importKey");
    const first = decrypt_folder(folders_a[0], IDENTITY_A);

    clear_vault_from_memory();
    start_session();
    await first;
    await decrypt_folder(folders_a[1], IDENTITY_A);

    expect(aes_imports(import_key)).toBe(2);
  });

  it("keeps a separate key for each identity key", async () => {
    const folder_b = await build_folder(0, IDENTITY_B);
    const import_key = vi.spyOn(crypto.subtle, "importKey");

    const [from_a, from_b] = await Promise.all([
      decrypt_folder(folders_a[0], IDENTITY_A),
      decrypt_folder(folder_b, IDENTITY_B),
    ]);

    expect(from_a?.name).toBe("Folder 0");
    expect(from_b?.name).toBe("Folder 0");
    expect(aes_imports(import_key)).toBe(2);
    await expect(
      decrypt_folder_field(
        folder_b.encrypted_name,
        folder_b.name_nonce,
        IDENTITY_A,
      ),
    ).rejects.toThrow();
    expect(await decrypt_folder(folder_b, IDENTITY_A)).toBeNull();
  });

  it("does not cache a key derived after sign-out", async () => {
    clear_vault_from_memory();
    const import_key = vi.spyOn(crypto.subtle, "importKey");

    const first = await decrypt_folder(folders_a[0], IDENTITY_A);
    const second = await decrypt_folder(folders_a[1], IDENTITY_A);

    expect(first?.name).toBe("Folder 0");
    expect(second?.name).toBe("Folder 1");
    expect(aes_imports(import_key)).toBe(6);
  });

  it("never builds a cache id from the identity key", async () => {
    const map_set = vi.spyOn(Map.prototype, "set");

    await decrypt_folder(folders_a[0], IDENTITY_A);

    const ids = map_set.mock.calls
      .map((call) => call[0])
      .filter((id): id is string => typeof id === "string")
      .filter((id) => id !== IDENTITY_A);

    expect(ids.some((id) => id.startsWith("folder_field_key:"))).toBe(true);
    expect(ids.some((id) => id.includes("PRIVATE KEY"))).toBe(false);
    expect(ids.some((id) => id.includes(IDENTITY_A))).toBe(false);
  });
});
