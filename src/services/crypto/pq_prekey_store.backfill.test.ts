/*
 * Aster Communications Inc.
 *
 * Copyright (c) 2026 Aster Communications Inc.
 *
 * This file is part of this project.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map<string, string>();

vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
});

const get_mock = vi.fn();
const post_mock = vi.fn();

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: (...args: unknown[]) => get_mock(...args),
    post: (...args: unknown[]) => post_mock(...args),
    delete: vi.fn(),
  },
}));

vi.mock("./memory_key_store", () => ({
  has_vault_in_memory: () => true,
  get_derived_encryption_key: () => new Uint8Array(32),
}));

const index = [11, 12, 13, 14];

vi.mock("./encrypted_storage", () => ({
  encrypted_get: async (key: string) => {
    if (key.startsWith("pq_prekey_secret_index")) return index;
    const key_id = Number(key.split("_").pop());

    return { key_id, secret_key_b64: "AAAA" };
  },
  encrypted_set: async () => {},
  encrypted_delete: async () => {},
}));

vi.mock("./ratchet_sync", () => ({
  derive_ratchet_encryption_key: async () => ({}) as CryptoKey,
  derive_ratchet_encryption_key_from_base: async () => ({}) as CryptoKey,
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => "u1",
}));

import {
  backfill_pq_secrets_to_server,
  select_backfill_key_ids,
} from "./pq_prekey_store";

describe("pq secret backfill follows the server prekey set", () => {
  beforeEach(() => {
    store.clear();
    get_mock.mockReset();
    post_mock.mockReset();
  });

  it("keeps only secrets whose prekey the server still holds", () => {
    expect(select_backfill_key_ids([1, 2, 3, 4], new Set([2, 4, 9]))).toEqual([
      2, 4,
    ]);
  });

  it("uploads nothing when the server prekey list is unavailable", () => {
    expect(select_backfill_key_ids([1, 2, 3], null)).toEqual([]);
  });

  it("skips the upload entirely when the prekey list request fails", async () => {
    get_mock.mockResolvedValue({ error: "boom", code: "SERVER_ERROR" });

    await backfill_pq_secrets_to_server();

    expect(post_mock).not.toHaveBeenCalled();
  });
});
