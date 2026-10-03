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
import type { Contact, ContactFormData } from "@/types/contacts";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const keys = vi.hoisted(() => ({
  raw: new Uint8Array(32).fill(7),
  vault_cleared: [] as Array<() => void>,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_derived_encryption_key: () => keys.raw.slice(),
  get_or_create_derived_encryption_crypto_key: () =>
    crypto.subtle.importKey("raw", keys.raw, "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]),
  on_vault_cleared: (callback: () => void) => {
    keys.vault_cleared.push(callback);

    return () => undefined;
  },
}));

vi.mock("./client", () => ({ api_client: {} }));

import { decrypt_contacts, encrypt_contact_data } from "./contacts";

import { clear_all_keys } from "@/services/crypto/crypto_key_cache";
import { CONTACT_DATA_VERSION } from "@/types/contacts";

const CONTACT_COUNT = 50;

async function encrypted_contact(index: number): Promise<Contact> {
  const form = {
    first_name: `Person ${index}`,
    last_name: "Example",
    emails: [`person${index}@example.com`],
  } as ContactFormData;
  const encrypted = await encrypt_contact_data(form);

  return {
    id: `c${index}`,
    contact_token: "token",
    encrypted_data: encrypted.encrypted_data,
    data_nonce: encrypted.data_nonce,
    integrity_hash: encrypted.integrity_hash,
    data_version: CONTACT_DATA_VERSION,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function hmac_imports(spy: { mock: { calls: unknown[][] } }): number {
  return spy.mock.calls.filter(
    (call) => (call[2] as { name?: string })?.name === "HMAC",
  ).length;
}

function clear_vault(): void {
  clear_all_keys();
  keys.vault_cleared.forEach((callback) => callback());
}

let contacts: Contact[] = [];

beforeEach(async () => {
  clear_vault();
  contacts = await Promise.all(
    Array.from({ length: CONTACT_COUNT }, (_, i) => encrypted_contact(i)),
  );
  clear_vault();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("contacts integrity key", () => {
  it("imports the key once for a whole page of contacts", async () => {
    const import_key = vi.spyOn(crypto.subtle, "importKey");

    const decrypted = await decrypt_contacts(contacts);

    expect(decrypted).toHaveLength(CONTACT_COUNT);
    expect(decrypted[7].first_name).toBe("Person 7");
    expect(hmac_imports(import_key)).toBe(1);

    await decrypt_contacts(contacts);
    expect(hmac_imports(import_key)).toBe(1);
  });

  it("imports the key again after the vault is cleared", async () => {
    const import_key = vi.spyOn(crypto.subtle, "importKey");

    await decrypt_contacts(contacts);
    clear_vault();
    const decrypted = await decrypt_contacts(contacts);

    expect(decrypted).toHaveLength(CONTACT_COUNT);
    expect(hmac_imports(import_key)).toBe(2);
  });

  it("does not keep a key that finished importing after the vault was cleared", async () => {
    const import_key = vi.spyOn(crypto.subtle, "importKey");
    const first = decrypt_contacts(contacts);

    clear_vault();
    await first;
    await decrypt_contacts(contacts);

    expect(hmac_imports(import_key)).toBe(2);
  });

  it("still rejects a contact whose integrity hash does not match", async () => {
    const tampered = {
      ...contacts[0],
      integrity_hash: contacts[1].integrity_hash,
    };

    const decrypted = await decrypt_contacts([tampered, contacts[2]]);

    expect(decrypted.map((contact) => contact.id)).toEqual(["c2"]);
  });
});
