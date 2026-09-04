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
import { beforeEach, describe, expect, it, vi } from "vitest";

const api_get = vi.fn();
const decrypt_aes_gcm_with_fallback = vi.fn();

vi.mock("./client", () => ({
  api_client: {
    get: (...args: unknown[]) => api_get(...args),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("./contacts", () => ({
  get_contacts_encryption_key: () => Promise.resolve({} as CryptoKey),
  encrypt_contact_data: vi.fn(),
  generate_contact_token: vi.fn(),
}));

vi.mock("@/services/crypto/legacy_keks", () => ({
  decrypt_aes_gcm_with_fallback: (...args: unknown[]) =>
    decrypt_aes_gcm_with_fallback(...args),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_derived_encryption_key: () => null,
}));

import { list_sync_sources } from "./contact_sync";

function source(id: string) {
  return {
    id,
    source_type: "carddav",
    encrypted_config: btoa(id),
    config_nonce: btoa("nonce"),
    contacts_synced: 0,
    is_enabled: true,
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

function encoded_config(server_url: string): ArrayBuffer {
  return new TextEncoder().encode(JSON.stringify({ server_url })).buffer;
}

describe("list_sync_sources", () => {
  beforeEach(() => {
    api_get.mockReset();
    decrypt_aes_gcm_with_fallback.mockReset();
  });

  it("returns the readable sources when one cannot be decrypted", async () => {
    api_get.mockResolvedValue({ data: { items: [source("a"), source("b")] } });
    decrypt_aes_gcm_with_fallback
      .mockRejectedValueOnce(new Error("bad key"))
      .mockResolvedValueOnce(encoded_config("https://dav.example/b"));

    const result = await list_sync_sources();

    expect(result.error).toBeUndefined();
    expect(result.data?.map((item) => item.id)).toEqual(["b"]);
    expect(result.data?.[0].config.server_url).toBe("https://dav.example/b");
    expect(result.details?.failed_count).toBe(1);
  });

  it("reports an error only when every source fails", async () => {
    api_get.mockResolvedValue({ data: { items: [source("a")] } });
    decrypt_aes_gcm_with_fallback.mockRejectedValue(new Error("bad key"));

    const result = await list_sync_sources();

    expect(result.data).toBeUndefined();
    expect(result.error).toBeTruthy();
  });

  it("returns an empty list with no failures when nothing is configured", async () => {
    api_get.mockResolvedValue({ data: { items: [] } });

    const result = await list_sync_sources();

    expect(result.data).toEqual([]);
    expect(result.details?.failed_count).toBe(0);
  });
});
