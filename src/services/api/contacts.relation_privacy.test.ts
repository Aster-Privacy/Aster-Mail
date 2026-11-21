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

import { describe, it, expect, vi, beforeEach } from "vitest";

const keys = vi.hoisted(() => ({
  raw: new Uint8Array(32).fill(9),
  vault: { data_kek: btoa(String.fromCharCode(...new Uint8Array(32).fill(9))) },
}));

const api = vi.hoisted(() => ({
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  get: vi.fn(),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_derived_encryption_key: () => keys.raw.slice(),
  get_vault_from_memory: () => keys.vault,
  get_or_create_derived_encryption_crypto_key: () =>
    crypto.subtle.importKey("raw", keys.raw, "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]),
  on_vault_cleared: () => () => undefined,
  on_vault_stored: () => () => undefined,
  get_vault_account_epoch: () => 0,
}));

vi.mock("./client", () => ({ api_client: api }));

import {
  create_contact_encrypted,
  decrypt_contact,
  decrypt_contacts,
  encrypt_contact_data,
  update_contact_encrypted,
} from "./contacts";

import { CONTACT_DATA_VERSION } from "@/types/contacts";

const MARKERS = [
  "Ana Lima",
  "Godparent",
  "Rui Marques",
  "mother",
  "relative",
  "Mei Chen",
  "Guitar teacher",
  "Studio portfolio",
  "studio.example.net",
  "jarvis-handle",
];

function form(): ContactFormData {
  return {
    first_name: "Relation",
    last_name: "Probe",
    emails: ["relation.probe@example.com"],
    related_people: [
      { value: "Ana Lima", type: "parent", relation: "mother" },
      { value: "Rui Marques", type: "other", label: "Godparent" },
      { value: "Mei Chen", type: "other", relation: "relative" },
      { value: "  ", type: "friend" },
      { value: "Ana Lima", type: "parent", relation: "mother" },
    ],
    social_networks: [
      {
        value: "https://studio.example.net/portfolio",
        type: "other",
        label: "Studio portfolio",
      },
      { value: "jarvis-handle", type: "other", label: "Guitar teacher" },
      { value: "", type: "other", label: "Empty" },
    ],
  } as ContactFormData;
}

function as_contact(encrypted: {
  encrypted_data: string;
  data_nonce: string;
  integrity_hash: string;
}): Contact {
  return {
    id: "c1",
    contact_token: "token",
    encrypted_data: encrypted.encrypted_data,
    data_nonce: encrypted.data_nonce,
    integrity_hash: encrypted.integrity_hash,
    data_version: CONTACT_DATA_VERSION,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function expect_no_plaintext(body: unknown) {
  const serialized = JSON.stringify(body);

  for (const marker of MARKERS) {
    expect(serialized).not.toContain(marker);
    expect(serialized.toLowerCase()).not.toContain(marker.toLowerCase());
  }
  const decoded = Object.values(body as Record<string, unknown>)
    .filter((value): value is string => typeof value === "string")
    .map((value) => {
      try {
        return atob(value);
      } catch {
        return "";
      }
    })
    .join("\n");

  for (const marker of MARKERS) expect(decoded).not.toContain(marker);
}

describe("contact relation and custom social privacy", () => {
  beforeEach(() => {
    api.post.mockReset().mockResolvedValue({ data: { id: "c1" } });
    api.put.mockReset().mockResolvedValue({ data: { id: "c1" } });
  });

  it("sends only ciphertext on create", async () => {
    await create_contact_encrypted(form());
    expect(api.post).toHaveBeenCalledTimes(1);
    const [path, body] = api.post.mock.calls[0];

    expect(path).toBe("/contacts/v1");
    expect(Object.keys(body).sort()).toEqual(
      [
        "company_search_token",
        "contact_token",
        "data_nonce",
        "data_version",
        "email_search_token",
        "encrypted_data",
        "integrity_hash",
        "name_search_token",
      ].sort(),
    );
    expect(body).not.toHaveProperty("related_people");
    expect(body).not.toHaveProperty("social_networks");
    expect_no_plaintext(body);
  });

  it("sends only ciphertext on update", async () => {
    await update_contact_encrypted("c1", form());
    expect(api.put).toHaveBeenCalledTimes(1);
    const [path, body] = api.put.mock.calls[0];

    expect(path).toBe("/contacts/v1/c1");
    expect(body).not.toHaveProperty("related_people");
    expect(body).not.toHaveProperty("social_networks");
    expect_no_plaintext(body);
  });

  it("round-trips normalized relations and custom socials", async () => {
    const decrypted = await decrypt_contact(
      as_contact(await encrypt_contact_data(form())),
    );

    expect(decrypted.related_people).toEqual([
      { value: "Ana Lima", type: "parent", relation: "mother" },
      { value: "Rui Marques", type: "other", label: "Godparent" },
      { value: "Mei Chen", type: "other", relation: "relative" },
    ]);
    expect(decrypted.social_networks).toEqual([
      {
        value: "https://studio.example.net/portfolio",
        type: "other",
        label: "Studio portfolio",
      },
      { value: "jarvis-handle", type: "other", label: "Guitar teacher" },
    ]);
  });

  it("keeps unknown future relation fields through decrypt and re-encrypt", async () => {
    const future = {
      ...form(),
      related_people: [
        {
          value: "Noor",
          type: "godmother",
          relation: "godmother",
          since: "2020",
        },
      ],
    } as unknown as ContactFormData;
    const first = await decrypt_contact(
      as_contact(await encrypt_contact_data(future)),
    );
    const second = await decrypt_contact(
      as_contact(
        await encrypt_contact_data(first as unknown as ContactFormData),
      ),
    );

    expect(second.related_people).toEqual([
      { value: "Noor", type: "godmother", relation: "godmother", since: "2020" },
    ]);
  });

  it("skips a contact whose payload fails to decrypt", async () => {
    const good = as_contact(await encrypt_contact_data(form()));
    const bad = {
      ...good,
      id: "c2",
      integrity_hash: undefined,
      encrypted_data: btoa("not real ciphertext at all"),
    } as unknown as Contact;
    const result = await decrypt_contacts([good, bad]);

    expect(result.map((contact) => contact.id)).toEqual(["c1"]);
  });
});
