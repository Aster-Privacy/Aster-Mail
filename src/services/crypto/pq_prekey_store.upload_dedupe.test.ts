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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const get_mock = vi.fn();
const post_mock = vi.fn();
const delete_mock = vi.fn();

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: (...args: unknown[]) => get_mock(...args),
    post: (...args: unknown[]) => post_mock(...args),
    delete: (...args: unknown[]) => delete_mock(...args),
  },
}));

let master_byte = 1;

vi.mock("./memory_key_store", () => ({
  has_vault_in_memory: () => true,
  get_derived_encryption_key: () => new Uint8Array(32).fill(master_byte),
}));

const storage = new Map<string, unknown>();

vi.mock("./encrypted_storage", () => ({
  encrypted_get: async (key: string) =>
    storage.has(key) ? structuredClone(storage.get(key)) : null,
  encrypted_set: async (key: string, value: unknown) => {
    storage.set(key, structuredClone(value));
  },
  encrypted_delete: async (key: string) => {
    storage.delete(key);
  },
}));

vi.mock("./ratchet_sync", () => ({
  derive_ratchet_encryption_key: async (master: Uint8Array) =>
    crypto.subtle.importKey(
      "raw",
      master,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    ),
  derive_ratchet_encryption_key_from_base: async () => ({}) as CryptoKey,
}));

vi.mock("./legacy_keks", () => ({
  decrypt_with_legacy_derived_keys: async () => null,
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => "u1",
}));

import {
  backfill_pq_secrets_to_server,
  delete_pq_secret,
  resolve_upload_state,
  select_ids_needing_upload,
} from "./pq_prekey_store";

const DAY_MS = 24 * 60 * 60 * 1000;

let server_ids: number[] = [];

function seed_local(ids: number[]): void {
  storage.set("pq_prekey_secret_index_u1", [...ids]);
  for (const id of ids) {
    storage.set(`pq_prekey_secret_u1_${id}`, {
      key_id: id,
      secret_key_b64: "AAAAAAAAAAA=",
    });
  }
}

function uploaded_ids_per_call(): number[][] {
  return post_mock.mock.calls
    .filter(([url]) => url === "/crypto/v1/ratchet/pq-secret/bulk")
    .map(([, body]) =>
      (body as { secrets: { key_id: number }[] }).secrets.map((s) => s.key_id),
    );
}

beforeEach(() => {
  storage.clear();
  get_mock.mockReset();
  post_mock.mockReset();
  delete_mock.mockReset();
  master_byte = 1;
  server_ids = [];
  get_mock.mockImplementation(async (url: string) => {
    if (url === "/crypto/v1/keys/prekeys/ids") {
      return { data: { pq_key_ids: [...server_ids] } };
    }

    return { error: "unexpected", code: "NOT_FOUND" };
  });
  post_mock.mockResolvedValue({ data: { stored: 1 } });
  delete_mock.mockResolvedValue({ data: { success: true } });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-07T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("resolve_upload_state", () => {
  const now = 1_000_000_000_000;

  it("keeps a state that matches the wrap key and is inside the refresh window", () => {
    const state = resolve_upload_state(
      {
        fingerprint: "fp",
        epoch_started_at: now - DAY_MS,
        uploaded_ids: [1, 2],
      },
      "fp",
      now,
    );

    expect(state.uploaded_ids).toEqual([1, 2]);
    expect(state.epoch_started_at).toBe(now - DAY_MS);
  });

  it("starts over when the wrap key fingerprint changed", () => {
    const state = resolve_upload_state(
      { fingerprint: "old", epoch_started_at: now, uploaded_ids: [1, 2] },
      "new",
      now,
    );

    expect(state).toEqual({
      fingerprint: "new",
      epoch_started_at: now,
      uploaded_ids: [],
    });
  });

  it("starts over after the seven day refresh window", () => {
    const state = resolve_upload_state(
      {
        fingerprint: "fp",
        epoch_started_at: now - 7 * DAY_MS,
        uploaded_ids: [1],
      },
      "fp",
      now,
    );

    expect(state.uploaded_ids).toEqual([]);
  });

  it("starts over when the clock moved backwards", () => {
    const state = resolve_upload_state(
      { fingerprint: "fp", epoch_started_at: now + 1000, uploaded_ids: [1] },
      "fp",
      now,
    );

    expect(state.uploaded_ids).toEqual([]);
  });

  it("starts over on malformed stored state", () => {
    for (const stored of [
      null,
      undefined,
      "x",
      { key_id: 4, secret_key_b64: "AAAA" },
      { fingerprint: "fp", epoch_started_at: now, uploaded_ids: ["1"] },
      { fingerprint: "", epoch_started_at: now, uploaded_ids: [] },
    ]) {
      expect(resolve_upload_state(stored, "fp", now).uploaded_ids).toEqual([]);
    }
  });

  it("selects only ids not yet uploaded", () => {
    expect(
      select_ids_needing_upload([1, 2, 3], {
        fingerprint: "fp",
        epoch_started_at: now,
        uploaded_ids: [2],
      }),
    ).toEqual([1, 3]);
  });
});

describe("backfill uploads each secret once per wrap key", () => {
  it("uploads the server-held secrets on the first run and nothing on the next", async () => {
    seed_local([1, 2, 3, 4]);
    server_ids = [2, 3, 4, 99];

    await backfill_pq_secrets_to_server();
    expect(uploaded_ids_per_call()).toEqual([[2, 3, 4]]);

    post_mock.mockClear();
    await backfill_pq_secrets_to_server();
    expect(post_mock).not.toHaveBeenCalled();
  });

  it("uploads only a newly listed id on a later run", async () => {
    seed_local([1, 2, 3]);
    server_ids = [1, 2];

    await backfill_pq_secrets_to_server();
    post_mock.mockClear();

    server_ids = [1, 2, 3];
    await backfill_pq_secrets_to_server();

    expect(uploaded_ids_per_call()).toEqual([[3]]);
  });

  it("re-uploads everything after the wrap key changes", async () => {
    seed_local([1, 2, 3]);
    server_ids = [1, 2, 3];

    await backfill_pq_secrets_to_server();
    post_mock.mockClear();

    master_byte = 2;
    await backfill_pq_secrets_to_server();

    expect(uploaded_ids_per_call()).toEqual([[1, 2, 3]]);

    post_mock.mockClear();
    await backfill_pq_secrets_to_server();
    expect(post_mock).not.toHaveBeenCalled();
  });

  it("re-uploads everything once the refresh window passes", async () => {
    seed_local([1, 2]);
    server_ids = [1, 2];

    await backfill_pq_secrets_to_server();
    post_mock.mockClear();

    vi.setSystemTime(new Date(Date.now() + 6 * DAY_MS));
    await backfill_pq_secrets_to_server();
    expect(post_mock).not.toHaveBeenCalled();

    vi.setSystemTime(new Date(Date.now() + 2 * DAY_MS));
    await backfill_pq_secrets_to_server();
    expect(uploaded_ids_per_call()).toEqual([[1, 2]]);
  });

  it("does not record a failed upload and retries it next time", async () => {
    seed_local([1, 2]);
    server_ids = [1, 2];
    post_mock.mockResolvedValueOnce({ error: "boom", code: "SERVER_ERROR" });

    await backfill_pq_secrets_to_server();
    expect(uploaded_ids_per_call()).toEqual([[1, 2]]);

    post_mock.mockClear();
    await backfill_pq_secrets_to_server();
    expect(uploaded_ids_per_call()).toEqual([[1, 2]]);
  });

  it("keeps progress from earlier chunks when a later chunk is rate limited", async () => {
    const ids = Array.from({ length: 450 }, (_, i) => i + 1);

    seed_local(ids);
    server_ids = ids;
    post_mock
      .mockResolvedValueOnce({ data: { stored: 200 } })
      .mockResolvedValueOnce({
        error: "rate limited",
        code: "RATE_LIMIT_EXCEEDED",
      });

    await backfill_pq_secrets_to_server();
    expect(uploaded_ids_per_call().map((c) => c.length)).toEqual([200, 200]);

    post_mock.mockReset();
    post_mock.mockResolvedValue({ data: { stored: 1 } });
    vi.setSystemTime(new Date(Date.now() + 2 * 60 * 1000));
    await backfill_pq_secrets_to_server();

    const resumed = uploaded_ids_per_call().flat();

    expect(resumed).toHaveLength(250);
    expect(resumed[0]).toBe(201);
  });

  it("uploads nothing when the server id list is unavailable", async () => {
    seed_local([1, 2]);
    get_mock.mockResolvedValue({ error: "boom", code: "SERVER_ERROR" });

    await backfill_pq_secrets_to_server();

    expect(post_mock).not.toHaveBeenCalled();
  });

  it("forgets a deleted id so a reused id is uploaded again", async () => {
    seed_local([1, 2]);
    server_ids = [1, 2];

    await backfill_pq_secrets_to_server();
    await delete_pq_secret(2);
    post_mock.mockClear();

    seed_local([1, 2]);
    await backfill_pq_secrets_to_server();

    expect(uploaded_ids_per_call()).toEqual([[2]]);
  });

  it("never sends the same nonce twice for a re-upload", async () => {
    seed_local([1]);
    server_ids = [1];

    await backfill_pq_secrets_to_server();
    master_byte = 3;
    await backfill_pq_secrets_to_server();

    const nonces = post_mock.mock.calls.map(
      ([, body]) =>
        (body as { secrets: { secret_nonce: string }[] }).secrets[0]
          .secret_nonce,
    );

    expect(nonces).toHaveLength(2);
    expect(nonces[0]).not.toBe(nonces[1]);
  });
});
