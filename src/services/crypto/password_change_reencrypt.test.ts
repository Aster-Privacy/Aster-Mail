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
const mock_list_contacts = vi.fn();
const mock_list_alias_pins = vi.fn();
const mock_list_alias_contacts = vi.fn();
const mock_list_alias_destinations = vi.fn();
const mock_list_alias_directories = vi.fn();
const mock_list_domains = vi.fn();
const mock_list_domain_addresses = vi.fn();

let session_crypto_key: CryptoKey | null = null;

function key_material(passphrase: string): Uint8Array {
  const bytes = new Uint8Array(32);

  bytes.set(new TextEncoder().encode(passphrase).slice(0, 32));

  return bytes;
}

vi.mock("./memory_key_store", () => ({
  derive_encryption_key_from_passphrase: async (passphrase: Uint8Array) =>
    key_material(new TextDecoder().decode(passphrase)),
  get_or_create_derived_encryption_crypto_key: async () => session_crypto_key,
}));

vi.mock("../api/aliases", () => ({
  list_aliases: (...args: unknown[]) => mock_list_aliases(...args),
}));

vi.mock("../api/contacts", () => ({
  list_contacts: (...args: unknown[]) => mock_list_contacts(...args),
}));

vi.mock("../api/alias_pins", () => ({
  list_alias_pins: (...args: unknown[]) => mock_list_alias_pins(...args),
}));

vi.mock("../api/alias_contacts", () => ({
  list_alias_contacts: (...args: unknown[]) => mock_list_alias_contacts(...args),
}));

vi.mock("../api/alias_destinations", () => ({
  list_alias_destinations: (...args: unknown[]) =>
    mock_list_alias_destinations(...args),
}));

vi.mock("../api/alias_directories", () => ({
  list_alias_directories: (...args: unknown[]) =>
    mock_list_alias_directories(...args),
}));

vi.mock("../api/domains", () => ({
  list_domains: (...args: unknown[]) => mock_list_domains(...args),
  list_domain_addresses: (...args: unknown[]) => mock_list_domain_addresses(...args),
}));

import { re_encrypt_user_data } from "./password_change_reencrypt";
import {
  load_legacy_keks_into_memory,
  clear_legacy_keks_from_memory,
  serialize_kek_for_vault,
} from "./legacy_keks";

const OLD_PASSPHRASE = "current-passphrase";
const NEW_PASSPHRASE = "replacement-passphrase";
const ABANDONED_PASSPHRASE = "passphrase-from-an-earlier-change";
const SESSION_PASSPHRASE = "unrelated-session-key";
const MASTER_PASSPHRASE = "master-key-from-adoption";
const LOST_PASSPHRASE = "key-that-no-longer-exists-anywhere";

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

function vault_kek(passphrase: string): { k: string } {
  return { k: to_base64(key_material(passphrase)) };
}

function single_alias_page(alias: Record<string, unknown>) {
  return {
    data: { aliases: [alias], has_more: false },
    error: undefined,
  };
}

async function alias_sealed_with(
  passphrase: string,
  overrides: Record<string, unknown> = {},
) {
  const local_part = await seal(passphrase, "personal");

  return single_alias_page({
    id: "alias-1",
    domain: "astermail.org",
    is_random: false,
    encrypted_local_part: local_part.encrypted,
    local_part_nonce: local_part.nonce,
    ...overrides,
  });
}

describe("re_encrypt_user_data", () => {
  beforeEach(() => {
    session_crypto_key = null;
    mock_list_aliases.mockReset();
    mock_list_contacts.mockReset();
    mock_list_alias_pins.mockReset();
    mock_list_alias_contacts.mockReset();
    mock_list_alias_destinations.mockReset();
    mock_list_alias_directories.mockReset();
    mock_list_domains.mockReset();
    mock_list_domain_addresses.mockReset();
    clear_legacy_keks_from_memory();

    mock_list_aliases.mockResolvedValue({
      data: { aliases: [], has_more: false },
      error: undefined,
    });
    mock_list_contacts.mockResolvedValue({
      data: { items: [], has_more: false },
      error: undefined,
    });
    mock_list_alias_pins.mockResolvedValue({
      data: { pins: [] },
      error: undefined,
    });
    mock_list_alias_contacts.mockResolvedValue({
      data: { contacts: [] },
      error: undefined,
    });
    mock_list_alias_destinations.mockResolvedValue({
      data: { destinations: [] },
      error: undefined,
    });
    mock_list_alias_directories.mockResolvedValue({
      data: { directories: [] },
      error: undefined,
    });
    mock_list_domains.mockResolvedValue({
      data: { domains: [] },
      error: undefined,
    });
    mock_list_domain_addresses.mockResolvedValue({
      data: { addresses: [] },
      error: undefined,
    });
  });

  it("recovers an address sealed under the typed password while a different session key is loaded", async () => {
    session_crypto_key = await key_for(SESSION_PASSPHRASE);

    mock_list_aliases.mockResolvedValueOnce(
      await alias_sealed_with(OLD_PASSPHRASE),
    );

    const result = await re_encrypt_user_data(OLD_PASSPHRASE, NEW_PASSPHRASE);
    const alias = result.re_encrypted_aliases[0];

    expect(result.skipped.alias_ids).toEqual([]);
    expect(
      await open(NEW_PASSPHRASE, alias.encrypted_local_part, alias.local_part_nonce),
    ).toBe("personal");
  });

  it("recovers an address sealed under a legacy key held only in the vault", async () => {
    mock_list_aliases.mockResolvedValueOnce(
      await alias_sealed_with(ABANDONED_PASSPHRASE),
    );

    const result = await re_encrypt_user_data(OLD_PASSPHRASE, NEW_PASSPHRASE, {
      legacy_keks: [vault_kek(ABANDONED_PASSPHRASE)],
    });
    const alias = result.re_encrypted_aliases[0];

    expect(result.skipped.alias_ids).toEqual([]);
    expect(
      await open(NEW_PASSPHRASE, alias.encrypted_local_part, alias.local_part_nonce),
    ).toBe("personal");
  });

  it("recovers an address sealed under a master key held in the vault", async () => {
    mock_list_aliases.mockResolvedValueOnce(
      await alias_sealed_with(MASTER_PASSPHRASE),
    );

    const result = await re_encrypt_user_data(OLD_PASSPHRASE, NEW_PASSPHRASE, {
      data_kek: to_base64(key_material(MASTER_PASSPHRASE)),
    });
    const alias = result.re_encrypted_aliases[0];

    expect(result.skipped.alias_ids).toEqual([]);
    expect(
      await open(NEW_PASSPHRASE, alias.encrypted_local_part, alias.local_part_nonce),
    ).toBe("personal");
  });

  it("recovers an address sealed under a legacy key loaded into memory at login", async () => {
    await load_legacy_keks_into_memory([
      serialize_kek_for_vault(key_material(ABANDONED_PASSPHRASE)),
    ]);

    mock_list_aliases.mockResolvedValueOnce(
      await alias_sealed_with(ABANDONED_PASSPHRASE),
    );

    const result = await re_encrypt_user_data(OLD_PASSPHRASE, NEW_PASSPHRASE);
    const alias = result.re_encrypted_aliases[0];

    expect(
      await open(NEW_PASSPHRASE, alias.encrypted_local_part, alias.local_part_nonce),
    ).toBe("personal");
  });

  it("completes the password change and reports the alias when the key is gone", async () => {
    mock_list_aliases.mockResolvedValueOnce(await alias_sealed_with(LOST_PASSPHRASE));

    const result = await re_encrypt_user_data(OLD_PASSPHRASE, NEW_PASSPHRASE);

    expect(result.re_encrypted_aliases).toHaveLength(0);
    expect(result.skipped.alias_ids).toEqual(["alias-1"]);
  });

  it("does not block a password change on a note left under an abandoned key", async () => {
    const stale_note = await seal(LOST_PASSPHRASE, "billing account");

    mock_list_aliases.mockResolvedValueOnce(
      await alias_sealed_with(OLD_PASSPHRASE, {
        encrypted_note: stale_note.encrypted,
        note_nonce: stale_note.nonce,
      }),
    );

    const result = await re_encrypt_user_data(OLD_PASSPHRASE, NEW_PASSPHRASE);

    expect(result.re_encrypted_aliases).toHaveLength(1);

    const alias = result.re_encrypted_aliases[0];

    expect(await open(NEW_PASSPHRASE, alias.encrypted_local_part, alias.local_part_nonce))
      .toBe("personal");

    expect(alias.encrypted_note).toBe(stale_note.encrypted);
    expect(alias.note_nonce).toBe(stale_note.nonce);
    expect(result.skipped.unreadable_field_count).toBe(1);
  });

  it("re-encrypts a readable note under the new key", async () => {
    const note = await seal(OLD_PASSPHRASE, "billing account");

    mock_list_aliases.mockResolvedValueOnce(
      await alias_sealed_with(OLD_PASSPHRASE, {
        encrypted_note: note.encrypted,
        note_nonce: note.nonce,
      }),
    );

    const result = await re_encrypt_user_data(OLD_PASSPHRASE, NEW_PASSPHRASE);
    const alias = result.re_encrypted_aliases[0];

    expect(alias.encrypted_note).not.toBe(note.encrypted);
    expect(await open(NEW_PASSPHRASE, alias.encrypted_note!, alias.note_nonce!)).toBe(
      "billing account",
    );
    expect(result.skipped.unreadable_field_count).toBe(0);
  });

  it("uses the same candidate keys for pins, alias contacts, destinations and directories", async () => {
    session_crypto_key = await key_for(SESSION_PASSPHRASE);

    const pin = await seal(ABANDONED_PASSPHRASE, "sender@example.com");
    const alias_contact = await seal(ABANDONED_PASSPHRASE, "friend@example.com");
    const destination = await seal(ABANDONED_PASSPHRASE, "inbox@example.com");
    const directory = await seal(ABANDONED_PASSPHRASE, "work");

    mock_list_aliases.mockResolvedValueOnce(
      await alias_sealed_with(ABANDONED_PASSPHRASE),
    );
    mock_list_alias_pins.mockResolvedValue({
      data: {
        pins: [
          { id: "pin-1", encrypted_sender: pin.encrypted, sender_nonce: pin.nonce },
        ],
      },
      error: undefined,
    });
    mock_list_alias_contacts.mockResolvedValue({
      data: {
        contacts: [
          {
            id: "alias-contact-1",
            encrypted_contact: alias_contact.encrypted,
            contact_nonce: alias_contact.nonce,
          },
        ],
      },
      error: undefined,
    });
    mock_list_alias_destinations.mockResolvedValue({
      data: {
        destinations: [
          {
            id: "destination-1",
            encrypted_destination: destination.encrypted,
            destination_nonce: destination.nonce,
          },
        ],
      },
      error: undefined,
    });
    mock_list_alias_directories.mockResolvedValue({
      data: {
        directories: [
          {
            id: "directory-1",
            encrypted_label: directory.encrypted,
            label_nonce: directory.nonce,
          },
        ],
      },
      error: undefined,
    });

    const result = await re_encrypt_user_data(OLD_PASSPHRASE, NEW_PASSPHRASE, {
      legacy_keks: [vault_kek(ABANDONED_PASSPHRASE)],
    });

    expect(
      await open(
        NEW_PASSPHRASE,
        result.re_encrypted_pins[0].encrypted_sender,
        result.re_encrypted_pins[0].sender_nonce,
      ),
    ).toBe("sender@example.com");
    expect(
      await open(
        NEW_PASSPHRASE,
        result.re_encrypted_alias_contacts[0].encrypted_contact,
        result.re_encrypted_alias_contacts[0].contact_nonce,
      ),
    ).toBe("friend@example.com");
    expect(
      await open(
        NEW_PASSPHRASE,
        result.re_encrypted_destinations[0].encrypted_destination,
        result.re_encrypted_destinations[0].destination_nonce,
      ),
    ).toBe("inbox@example.com");
    expect(
      await open(
        NEW_PASSPHRASE,
        result.re_encrypted_directories[0].encrypted_label,
        result.re_encrypted_directories[0].label_nonce,
      ),
    ).toBe("work");
  });

  it("uses the same candidate keys for contacts and reports the ones that stay sealed", async () => {
    session_crypto_key = await key_for(SESSION_PASSPHRASE);

    const readable = await seal(
      ABANDONED_PASSPHRASE,
      JSON.stringify({
        first_name: "Ada",
        last_name: "Lovelace",
        emails: ["ada@example.com"],
      }),
    );
    const sealed_forever = await seal(
      LOST_PASSPHRASE,
      JSON.stringify({ first_name: "Grace" }),
    );

    mock_list_contacts.mockResolvedValue({
      data: {
        items: [
          {
            id: "contact-1",
            encrypted_data: readable.encrypted,
            data_nonce: readable.nonce,
          },
          {
            id: "contact-2",
            encrypted_data: sealed_forever.encrypted,
            data_nonce: sealed_forever.nonce,
          },
        ],
        has_more: false,
      },
      error: undefined,
    });

    const result = await re_encrypt_user_data(OLD_PASSPHRASE, NEW_PASSPHRASE, {
      legacy_keks: [vault_kek(ABANDONED_PASSPHRASE)],
    });

    expect(result.re_encrypted_contacts).toHaveLength(1);
    expect(result.skipped.contact_ids).toEqual(["contact-2"]);
    expect(
      JSON.parse(
        await open(
          NEW_PASSPHRASE,
          result.re_encrypted_contacts[0].encrypted_data,
          result.re_encrypted_contacts[0].data_nonce,
        ),
      ).first_name,
    ).toBe("Ada");
  });

  it("uses the same candidate keys for custom domain addresses", async () => {
    session_crypto_key = await key_for(SESSION_PASSPHRASE);

    const local_part = await seal(ABANDONED_PASSPHRASE, "hello");
    const lost_local_part = await seal(LOST_PASSPHRASE, "gone");

    mock_list_domains.mockResolvedValue({
      data: { domains: [{ id: "domain-1", domain_name: "example.com" }] },
      error: undefined,
    });
    mock_list_domain_addresses.mockResolvedValue({
      data: {
        addresses: [
          {
            id: "address-1",
            encrypted_local_part: local_part.encrypted,
            local_part_nonce: local_part.nonce,
          },
          {
            id: "address-2",
            encrypted_local_part: lost_local_part.encrypted,
            local_part_nonce: lost_local_part.nonce,
          },
        ],
      },
      error: undefined,
    });

    const result = await re_encrypt_user_data(OLD_PASSPHRASE, NEW_PASSPHRASE, {
      legacy_keks: [vault_kek(ABANDONED_PASSPHRASE)],
    });

    expect(result.re_encrypted_domain_addresses).toHaveLength(1);
    expect(result.skipped.domain_address_ids).toEqual(["address-2"]);
    expect(
      await open(
        NEW_PASSPHRASE,
        result.re_encrypted_domain_addresses[0].encrypted_local_part,
        result.re_encrypted_domain_addresses[0].local_part_nonce,
      ),
    ).toBe("hello");
  });
});
