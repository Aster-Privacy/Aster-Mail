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

vi.mock("@/services/crypto/storage_write_key", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/crypto/storage_write_key")
  >()),
  get_storage_write_crypto_key: async () => key_holder.key,
}));

vi.mock("./client", () => ({
  api_client: {
    patch: vi.fn(async () => ({ data: { success: true } })),
  },
}));

const { api_client } = await import("./client");
const {
  decrypt_domain_address,
  encrypt_address_field,
  update_domain_address,
  decrypt_address_field,
} = await import("./domains");

function last_body(): Record<string, unknown> {
  const calls = vi.mocked(api_client.patch).mock.calls;

  return calls[calls.length - 1][1] as Record<string, unknown>;
}

async function make_address(websites?: { encrypted: string; nonce: string }) {
  const local_part = await encrypt_address_field("shop");

  return {
    id: "addr-1",
    domain_id: "domain-1",
    encrypted_local_part: local_part.encrypted,
    local_part_nonce: local_part.nonce,
    encrypted_websites: websites?.encrypted ?? null,
    websites_nonce: websites?.nonce ?? null,
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

describe("custom domain address websites", () => {
  it("decrypts the stored websites", async () => {
    const websites = await encrypt_address_field(
      JSON.stringify(["https://shop.example.com", "https://news.example.org"]),
    );
    const decrypted = await decrypt_domain_address(await make_address(websites));

    expect(decrypted.local_part).toBe("shop");
    expect(decrypted.websites).toEqual([
      "https://shop.example.com",
      "https://news.example.org",
    ]);
  });

  it("loads the address without websites when none are stored", async () => {
    const decrypted = await decrypt_domain_address(await make_address());

    expect(decrypted.websites).toBeUndefined();
  });

  it("still loads the address when the websites cannot be decrypted", async () => {
    const decrypted = await decrypt_domain_address(
      await make_address({ encrypted: "AAAA", nonce: "AAAAAAAAAAAAAAAA" }),
    );

    expect(decrypted.local_part).toBe("shop");
    expect(decrypted.websites).toBeUndefined();
  });

  it("encrypts normalized websites on update", async () => {
    await update_domain_address("domain-1", "addr-1", {
      websites: ["shop.example.com", "not a site", "https://news.example.org"],
    });

    const body = last_body();

    expect(
      JSON.parse(
        await decrypt_address_field(
          body.encrypted_websites as string,
          body.websites_nonce as string,
        ),
      ),
    ).toEqual(["https://shop.example.com", "https://news.example.org"]);
  });

  it("clears the websites when the list is saved empty", async () => {
    await update_domain_address("domain-1", "addr-1", { websites: [] });

    expect(last_body()).toEqual({
      encrypted_websites: null,
      websites_nonce: null,
    });
  });

  it("leaves the websites alone when the update does not mention them", async () => {
    await update_domain_address("domain-1", "addr-1", { note: "Receipts" });

    const body = last_body();

    expect(body).not.toHaveProperty("encrypted_websites");
    expect(body).not.toHaveProperty("websites_nonce");
  });
});
