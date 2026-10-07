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
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const key_holder: { key: CryptoKey | null } = { key: null };

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_or_create_derived_encryption_crypto_key: async () => key_holder.key,
  get_derived_encryption_key: () => null,
}));

vi.mock("./client", () => ({
  api_client: {
    patch: vi.fn(async () => ({ data: { success: true } })),
    post: vi.fn(async () => ({ data: { created: 1, failed: 0 } })),
  },
}));

const { api_client } = await import("./client");
const {
  decrypt_domain_address,
  encrypt_address_field,
  update_domain_address,
  decrypt_address_field,
} = await import("./domains");

function last_body(method: "patch" | "post"): Record<string, unknown> {
  const calls = vi.mocked(api_client[method]).mock.calls;

  return calls[calls.length - 1][1] as Record<string, unknown>;
}

async function make_address(note?: { encrypted: string; nonce: string }) {
  const local_part = await encrypt_address_field("billing");

  return {
    id: "addr-1",
    domain_id: "domain-1",
    encrypted_local_part: local_part.encrypted,
    local_part_nonce: local_part.nonce,
    encrypted_note: note?.encrypted ?? null,
    note_nonce: note?.nonce ?? null,
    is_enabled: true,
    is_primary: false,
    created_at: "2026-01-01T00:00:00Z",
  };
}

beforeAll(async () => {
  key_holder.key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
});

beforeEach(() => {
  vi.mocked(api_client.patch).mockClear();
});

describe("custom domain address notes", () => {
  it("decrypts the stored note", async () => {
    const note = await encrypt_address_field("Invoices only");
    const decrypted = await decrypt_domain_address(await make_address(note));

    expect(decrypted.local_part).toBe("billing");
    expect(decrypted.note).toBe("Invoices only");
  });

  it("loads the address without a note when none is stored", async () => {
    const decrypted = await decrypt_domain_address(await make_address());

    expect(decrypted.note).toBeUndefined();
  });

  it("still loads the address when the note cannot be decrypted", async () => {
    const decrypted = await decrypt_domain_address(
      await make_address({ encrypted: "AAAA", nonce: "AAAAAAAAAAAAAAAA" }),
    );

    expect(decrypted.local_part).toBe("billing");
    expect(decrypted.note).toBeUndefined();
  });

  it("encrypts a new note on update", async () => {
    await update_domain_address("domain-1", "addr-1", { note: "New note" });

    const body = last_body("patch");

    expect(body.encrypted_note).toEqual(expect.any(String));
    expect(body.note_nonce).toEqual(expect.any(String));
    expect(
      await decrypt_address_field(
        body.encrypted_note as string,
        body.note_nonce as string,
      ),
    ).toBe("New note");
  });

  it("clears the note when it is saved empty", async () => {
    await update_domain_address("domain-1", "addr-1", { note: "" });

    expect(last_body("patch")).toEqual({
      encrypted_note: null,
      note_nonce: null,
    });
  });

  it("leaves the note alone when the update does not mention it", async () => {
    await update_domain_address("domain-1", "addr-1", { is_enabled: false });

    expect(last_body("patch")).toEqual({ is_enabled: false });
  });
});
