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

const store = new Map<string, string>();

vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
});

const generate_mock = vi.fn();
const list_ids_mock = vi.fn();
const server_ids_mock = vi.fn();
const load_mock = vi.fn();
const get_mock = vi.fn();
const backfill_mock = vi.fn();

vi.mock("@/services/crypto/prekey_service", () => ({
  generate_and_upload_prekeys: (...args: unknown[]) => generate_mock(...args),
}));

vi.mock("@/services/crypto/pq_prekey_store", () => ({
  list_pq_secret_ids: () => list_ids_mock(),
  fetch_server_pq_key_ids: () => server_ids_mock(),
  load_pq_secret: (key_id: number) => load_mock(key_id),
  backfill_pq_secrets_to_server: () => backfill_mock(),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  has_vault_in_memory: () => true,
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => "u1",
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: (...args: unknown[]) => get_mock(...args),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

import {
  reconcile_pq_secrets_with_server,
  handle_missing_pq_secret,
  select_unknown_server_ids,
} from "./pq_secret_reconciler";

function server_count(count: number | null): void {
  get_mock.mockResolvedValue(
    count === null
      ? { error: "boom", code: "SERVER_ERROR" }
      : { data: { one_time_prekeys: 0, pq_prekeys: count } },
  );
}

beforeEach(() => {
  store.clear();
  generate_mock.mockReset();
  generate_mock.mockResolvedValue(true);
  list_ids_mock.mockReset();
  server_ids_mock.mockReset();
  load_mock.mockReset();
  get_mock.mockReset();
  backfill_mock.mockReset();
});

describe("select_unknown_server_ids", () => {
  it("returns server ids the device does not hold", () => {
    expect(select_unknown_server_ids(new Set([1, 2, 3]), [2, 9])).toEqual([
      1, 3,
    ]);
  });
});

describe("reconciler compares key id sets", () => {
  it("does not run the backfill itself", async () => {
    server_count(1);
    list_ids_mock.mockResolvedValue([1, 2]);

    await reconcile_pq_secrets_with_server();

    expect(backfill_mock).not.toHaveBeenCalled();
  });

  it("does not rotate when the server count is covered locally", async () => {
    server_count(2);
    list_ids_mock.mockResolvedValue([1, 2]);

    await reconcile_pq_secrets_with_server();

    expect(generate_mock).not.toHaveBeenCalled();
    expect(server_ids_mock).not.toHaveBeenCalled();
  });

  it("does not rotate on a second device whose missing secrets the server returns", async () => {
    server_count(40);
    list_ids_mock.mockResolvedValue([1, 2]);
    server_ids_mock.mockResolvedValue(
      new Set(Array.from({ length: 40 }, (_, i) => i + 1)),
    );
    load_mock.mockImplementation(async () => new Uint8Array(4).fill(7));

    await reconcile_pq_secrets_with_server();

    expect(generate_mock).not.toHaveBeenCalled();
    expect(load_mock).toHaveBeenCalledTimes(5);
    expect(load_mock.mock.calls.map(([id]) => id)).toEqual([3, 4, 5, 6, 7]);

    await reconcile_pq_secrets_with_server();
    expect(generate_mock).not.toHaveBeenCalled();
    expect(load_mock).toHaveBeenCalledTimes(5);
  });

  it("rotates when a missing secret cannot be read from the server", async () => {
    server_count(10);
    list_ids_mock.mockResolvedValue([1]);
    server_ids_mock.mockResolvedValue(new Set([1, 2, 3]));
    load_mock
      .mockResolvedValueOnce(new Uint8Array(4))
      .mockResolvedValueOnce(null);

    await reconcile_pq_secrets_with_server();

    expect(generate_mock).toHaveBeenCalledTimes(1);
    expect(generate_mock).toHaveBeenCalledWith(true);
  });

  it("rotates when the probe throws", async () => {
    server_count(10);
    list_ids_mock.mockResolvedValue([1]);
    server_ids_mock.mockResolvedValue(new Set([1, 2]));
    load_mock.mockRejectedValue(new Error("boom"));

    await reconcile_pq_secrets_with_server();

    expect(generate_mock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the count rule when the id list is unavailable", async () => {
    server_count(10);
    list_ids_mock.mockResolvedValue([1]);
    server_ids_mock.mockResolvedValue(null);

    await reconcile_pq_secrets_with_server();

    expect(generate_mock).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the server count is unavailable", async () => {
    server_count(null);
    list_ids_mock.mockResolvedValue([]);

    await reconcile_pq_secrets_with_server();

    expect(generate_mock).not.toHaveBeenCalled();
  });
});

describe("self-heal mints once per missing key", () => {
  it("does not mint again for the same key after the cooldown", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-07T00:00:00Z"));

    await handle_missing_pq_secret(77);
    expect(generate_mock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-10-07T01:00:00Z"));
    await handle_missing_pq_secret(77);
    expect(generate_mock).toHaveBeenCalledTimes(1);

    await handle_missing_pq_secret(78);
    expect(generate_mock).toHaveBeenCalledTimes(2);

    vi.setSystemTime(new Date("2026-10-15T00:00:00Z"));
    await handle_missing_pq_secret(77);
    expect(generate_mock).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it("retries a key whose mint failed once the cooldown passes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-07T00:00:00Z"));
    generate_mock.mockResolvedValueOnce(false);

    await handle_missing_pq_secret(5);
    vi.setSystemTime(new Date("2026-10-07T00:11:00Z"));
    await handle_missing_pq_secret(5);

    expect(generate_mock).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("keeps the ten minute cooldown across different keys", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-07T00:00:00Z"));

    await handle_missing_pq_secret(1);
    await handle_missing_pq_secret(2);

    expect(generate_mock).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
