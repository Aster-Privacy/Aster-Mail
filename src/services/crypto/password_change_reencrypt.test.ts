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
import { describe, it, expect, vi, beforeEach } from "vitest";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto });
}

const mock_list_aliases = vi.fn();

function key_material(passphrase: string): Uint8Array {
  const bytes = new Uint8Array(32);

  bytes.set(new TextEncoder().encode(passphrase).slice(0, 32));

  return bytes;
}

vi.mock("./memory_key_store", () => ({
  derive_encryption_key_from_passphrase: async (passphrase: Uint8Array) =>
    key_material(new TextDecoder().decode(passphrase)),
}));

vi.mock("../api/aliases", () => ({
  list_aliases: (...args: unknown[]) => mock_list_aliases(...args),
}));

vi.mock("../api/contacts", () => ({
  list_contacts: () =>
    Promise.resolve({ data: { items: [], has_more: false }, error: undefined }),
}));

vi.mock("../api/alias_pins", () => ({
  list_alias_pins: () => Promise.resolve({ data: { pins: [] }, error: undefined }),
}));

vi.mock("../api/alias_contacts", () => ({
  list_alias_contacts: () =>
    Promise.resolve({ data: { contacts: [] }, error: undefined }),
}));

vi.mock("../api/alias_destinations", () => ({
  list_alias_destinations: () =>
    Promise.resolve({ data: { destinations: [] }, error: undefined }),
}));

vi.mock("../api/alias_directories", () => ({
  list_alias_directories: () =>
    Promise.resolve({ data: { directories: [] }, error: undefined }),
}));

vi.mock("../api/domains", () => ({
  list_domains: () => Promise.resolve({ data: { domains: [] }, error: undefined }),
  list_domain_addresses: () =>
    Promise.resolve({ data: { addresses: [] }, error: undefined }),
}));

import { re_encrypt_user_data } from "./password_change_reencrypt";

const OLD_PASSPHRASE = "current-passphrase";
const NEW_PASSPHRASE = "replacement-passphrase";
const ABANDONED_PASSPHRASE = "passphrase-from-an-earlier-change";

function to_base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

async function key_for(passphrase: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    key_material(passphrase),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function seal(
  passphrase: string,
  plaintext: string,
): Promise<{ encrypted: string; nonce: string }> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    await key_for(passphrase),
    new TextEncoder().encode(plaintext),
  );

  return { encrypted: to_base64(new Uint8Array(ciphertext)), nonce: to_base64(nonce) };
}

async function open(
  passphrase: string,
  encrypted: string,
  nonce: string,
): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: Buffer.from(nonce, "base64") },
    await key_for(passphrase),
    Buffer.from(encrypted, "base64"),
  );

  return new TextDecoder().decode(plaintext);
}

async function alias_page(overrides: Record<string, unknown>) {
  const local_part = await seal(OLD_PASSPHRASE, "personal");

  return {
    data: {
      aliases: [
        {
          id: "alias-1",
          domain: "astermail.org",
          is_random: false,
          encrypted_local_part: local_part.encrypted,
          local_part_nonce: local_part.nonce,
          ...overrides,
        },
      ],
    },
    error: undefined,
  };
}

describe("re_encrypt_user_data", () => {
  beforeEach(() => {
    mock_list_aliases.mockReset();
  });

  it("does not block a password change on a note left under an abandoned key", async () => {
    const stale_note = await seal(ABANDONED_PASSPHRASE, "billing account");

    mock_list_aliases
      .mockResolvedValueOnce(
        await alias_page({
          encrypted_note: stale_note.encrypted,
          note_nonce: stale_note.nonce,
        }),
      )
      .mockResolvedValue({ data: { aliases: [] }, error: undefined });

    const result = await re_encrypt_user_data(OLD_PASSPHRASE, NEW_PASSPHRASE);

    expect(result.re_encrypted_aliases).toHaveLength(1);

    const alias = result.re_encrypted_aliases[0];

    expect(await open(NEW_PASSPHRASE, alias.encrypted_local_part, alias.local_part_nonce))
      .toBe("personal");

    expect(alias.encrypted_note).toBe(stale_note.encrypted);
    expect(alias.note_nonce).toBe(stale_note.nonce);
  });

  it("re-encrypts a readable note under the new key", async () => {
    const note = await seal(OLD_PASSPHRASE, "billing account");

    mock_list_aliases
      .mockResolvedValueOnce(
        await alias_page({ encrypted_note: note.encrypted, note_nonce: note.nonce }),
      )
      .mockResolvedValue({ data: { aliases: [] }, error: undefined });

    const result = await re_encrypt_user_data(OLD_PASSPHRASE, NEW_PASSPHRASE);
    const alias = result.re_encrypted_aliases[0];

    expect(alias.encrypted_note).not.toBe(note.encrypted);
    expect(await open(NEW_PASSPHRASE, alias.encrypted_note!, alias.note_nonce!)).toBe(
      "billing account",
    );
  });

  it("still refuses when the address itself cannot be decrypted", async () => {
    const unreadable = await seal(ABANDONED_PASSPHRASE, "personal");

    mock_list_aliases.mockResolvedValueOnce({
      data: {
        aliases: [
          {
            id: "alias-1",
            domain: "astermail.org",
            is_random: false,
            encrypted_local_part: unreadable.encrypted,
            local_part_nonce: unreadable.nonce,
          },
        ],
      },
      error: undefined,
    });

    await expect(
      re_encrypt_user_data(OLD_PASSPHRASE, NEW_PASSPHRASE),
    ).rejects.toThrow(/alias_reencrypt_failed/);
  });
});
