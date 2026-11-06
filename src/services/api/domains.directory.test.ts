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
import { beforeAll, describe, expect, it, vi } from "vitest";

const key_holder: { key: CryptoKey | null } = { key: null };

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_or_create_derived_encryption_crypto_key: async () => key_holder.key,
  get_derived_encryption_key: () => null,
}));

vi.mock("./client", () => ({
  api_client: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
}));

const {
  decrypt_domain_address,
  decrypt_domain_addresses,
  encrypt_address_field,
  is_valid_directory_local_part,
} = await import("./domains");

function to_base64(bytes: Uint8Array): string {
  let binary = "";

  for (const b of bytes) binary += String.fromCharCode(b);

  return btoa(binary);
}

async function sha256_base64(bytes: Uint8Array): Promise<string> {
  return to_base64(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  );
}

async function directory_address(local_part: string, id = "dir-1") {
  const bytes = new TextEncoder().encode(local_part);

  return {
    id,
    domain_id: "domain-1",
    encrypted_local_part: to_base64(bytes),
    local_part_nonce: "",
    local_part_hash: await sha256_base64(bytes),
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

describe("directory-created domain addresses", () => {
  it("recovers every separator the server accepts", async () => {
    const local_parts = [
      "one.stub",
      "booking+shop",
      "shop/finance",
      "shop#finance",
      "a-b_c.key",
    ];

    for (const local_part of local_parts) {
      const decrypted = await decrypt_domain_address(
        await directory_address(local_part),
      );

      expect(decrypted.local_part).toBe(local_part);
    }
  });

  it("rejects a record whose hash does not match", async () => {
    const address = await directory_address("one.stub");
    const other = await directory_address("two.stub");

    await expect(
      decrypt_domain_address({
        ...address,
        local_part_hash: other.local_part_hash,
      }),
    ).rejects.toThrow();
  });

  it("rejects a record without a hash", async () => {
    const address = await directory_address("one.stub");

    await expect(
      decrypt_domain_address({ ...address, local_part_hash: "" }),
    ).rejects.toThrow();
    await expect(
      decrypt_domain_address({ ...address, local_part_hash: undefined }),
    ).rejects.toThrow();
  });

  it("rejects invalid local parts even with a matching hash", async () => {
    const invalid = [
      "",
      ".stub",
      "stub.",
      "one..stub",
      "one+.stub",
      "Upper.stub",
      "one stub",
      "one\nstub",
      "one@stub",
      "mérchant.stub",
      "<b>x</b>",
      "a".repeat(65),
    ];

    for (const local_part of invalid) {
      await expect(
        decrypt_domain_address(await directory_address(local_part)),
      ).rejects.toThrow();
    }
  });

  it("keeps AES-GCM records on the encrypted path", async () => {
    const local_part = await encrypt_address_field("regular");
    const decrypted = await decrypt_domain_address({
      id: "enc-1",
      domain_id: "domain-1",
      encrypted_local_part: local_part.encrypted,
      local_part_nonce: local_part.nonce,
      local_part_hash: "unrelated",
      is_enabled: true,
      is_primary: false,
      created_at: "2026-01-01T00:00:00Z",
    });

    expect(decrypted.local_part).toBe("regular");
  });

  it("never reads a nonced record as plain text", async () => {
    const address = await directory_address("one.stub");

    await expect(
      decrypt_domain_address({
        ...address,
        local_part_nonce: "AAAAAAAAAAAAAAAA",
      }),
    ).rejects.toThrow();
  });

  it("lists directory addresses alongside encrypted ones", async () => {
    const encrypted = await encrypt_address_field("regular");
    const addresses = [
      await directory_address("one.stub", "dir-1"),
      await directory_address("two.stub", "dir-2"),
      {
        id: "enc-1",
        domain_id: "domain-1",
        encrypted_local_part: encrypted.encrypted,
        local_part_nonce: encrypted.nonce,
        is_enabled: true,
        is_primary: false,
        created_at: "2026-01-01T00:00:00Z",
      },
    ];

    const decrypted = await decrypt_domain_addresses(addresses);

    expect(decrypted.map((a) => a.local_part)).toEqual([
      "one.stub",
      "two.stub",
      "regular",
    ]);
  });

  it("validates the local part shape directly", () => {
    expect(is_valid_directory_local_part("one.stub")).toBe(true);
    expect(is_valid_directory_local_part("one/#stub")).toBe(false);
    expect(is_valid_directory_local_part("-stub")).toBe(false);
  });
});
