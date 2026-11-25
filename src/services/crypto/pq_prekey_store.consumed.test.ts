//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  storage: new Map<string, unknown>(),
  delete_mock: vi.fn(),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async () => ({ error: "not found", code: "NOT_FOUND" })),
    post: vi.fn(),
    delete: (...args: unknown[]) => h.delete_mock(...args),
  },
}));

vi.mock("./memory_key_store", () => ({
  has_vault_in_memory: () => true,
}));

vi.mock("./storage_write_key", () => ({
  load_storage_write_key_bytes: async () => new Uint8Array(32),
}));

vi.mock("./encrypted_storage", () => ({
  encrypted_get: async (key: string) => h.storage.get(key) ?? null,
  encrypted_set: async (key: string, value: unknown) => {
    h.storage.set(key, JSON.parse(JSON.stringify(value)));
  },
  encrypted_delete: async (key: string) => {
    h.storage.delete(key);
  },
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => "u1",
}));

import {
  consume_pq_prekey,
  MAX_PQ_CONSUMED_ENTRIES,
  pq_prekey_accepts,
  pq_prekey_consumer,
  refuse_used_pq_prekey,
  with_pq_prekey_consumed,
} from "./pq_prekey_store";

describe("one-time pq prekey consumption", () => {
  beforeEach(() => {
    h.delete_mock.mockReset();
    h.delete_mock.mockResolvedValue({ data: { deleted: true } });
  });

  it("accepts a key nobody has used, or the same opening message again", () => {
    expect(pq_prekey_accepts(null, "eph-a")).toBe(true);
    expect(pq_prekey_accepts(undefined, "eph-a")).toBe(true);
    expect(pq_prekey_accepts("eph-a", "eph-a")).toBe(true);
    expect(pq_prekey_accepts("eph-a", "eph-b")).toBe(false);
  });

  it("keeps the first ephemeral for a key and bounds the record", () => {
    const first = with_pq_prekey_consumed({}, 7, "eph-a");

    expect(with_pq_prekey_consumed(first, 7, "eph-b")).toBe(first);

    let record = {};

    for (let id = 0; id < MAX_PQ_CONSUMED_ENTRIES + 5; id++) {
      record = with_pq_prekey_consumed(record, id, `eph-${id}`);
    }

    expect(Object.keys(record)).toHaveLength(MAX_PQ_CONSUMED_ENTRIES);
    expect((record as Record<string, string>)["0"]).toBeUndefined();
    expect(
      (record as Record<string, string>)[String(MAX_PQ_CONSUMED_ENTRIES + 4)],
    ).toBe(`eph-${MAX_PQ_CONSUMED_ENTRIES + 4}`);
  });

  it("records the use, drops the local secret and deletes it on the server", async () => {
    h.storage.set("pq_prekey_secret_u1_101", {
      key_id: 101,
      secret_key_b64: "AQID",
    });
    await consume_pq_prekey(101, "eph-a");

    expect(await pq_prekey_consumer(101)).toBe("eph-a");
    expect(h.storage.has("pq_prekey_secret_u1_101")).toBe(false);
    expect(h.delete_mock).toHaveBeenCalledWith(
      "/crypto/v1/ratchet/pq-secret/101",
    );
  });

  it("refuses a second opening message on a used key and deletes the secret again", async () => {
    await consume_pq_prekey(202, "eph-a");
    h.delete_mock.mockClear();

    expect(await refuse_used_pq_prekey(202, "eph-a")).toBe(false);
    expect(h.delete_mock).not.toHaveBeenCalled();

    expect(await refuse_used_pq_prekey(202, "eph-b")).toBe(true);
    expect(h.delete_mock).toHaveBeenCalledWith(
      "/crypto/v1/ratchet/pq-secret/202",
    );
  });

  it("lets an unused key through", async () => {
    expect(await refuse_used_pq_prekey(303, "eph-a")).toBe(false);
    expect(h.delete_mock).not.toHaveBeenCalled();
  });
});
