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
  select_ids_missing_on_server,
  upload_state_is_current,
} from "./pq_prekey_store";

const DAY_MS = 24 * 60 * 60 * 1000;
const SECRET_IDS_URL = "/crypto/v1/ratchet/pq-secret/ids";

let server_ids: number[] = [];
let secret_ids_response: () => Promise<unknown> = async () => ({
  data: { key_ids: [] },
});

function seed_local(ids: number[]): void {
  storage.set("pq_prekey_secret_index_u1", [...ids]);
  for (const id of ids) {
    storage.set(`pq_prekey_secret_u1_${id}`, {
      key_id: id,
      secret_key_b64: "AAAAAAAAAAA=",
    });
  }
}

function serve_secret_ids(ids: number[]): void {
  secret_ids_response = async () => ({ data: { key_ids: [...ids] } });
}

function uploaded_ids_per_call(): number[][] {
  return post_mock.mock.calls
    .filter(([url]) => url === "/crypto/v1/ratchet/pq-secret/bulk")
    .map(([, body]) =>
      (body as { secrets: { key_id: number }[] }).secrets.map((s) => s.key_id),
    );
}

function secret_ids_fetches(): number {
  return get_mock.mock.calls.filter(([url]) => url === SECRET_IDS_URL).length;
}

async function prime_state(ids: number[]): Promise<void> {
  seed_local(ids);
  server_ids = [...ids];
  await backfill_pq_secrets_to_server();
  post_mock.mockClear();
  get_mock.mockClear();
}

beforeEach(() => {
  storage.clear();
  get_mock.mockReset();
  post_mock.mockReset();
  delete_mock.mockReset();
  master_byte = 1;
  server_ids = [];
  serve_secret_ids([]);
  get_mock.mockImplementation(async (url: string) => {
    if (url === "/crypto/v1/keys/prekeys/ids") {
      return { data: { pq_key_ids: [...server_ids] } };
    }
    if (url === SECRET_IDS_URL) return secret_ids_response();

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

describe("upload_state_is_current", () => {
  const now = 1_000_000_000_000;

  it("accepts a matching fingerprint inside the refresh window", () => {
    expect(
      upload_state_is_current(
        { fingerprint: "fp", epoch_started_at: now - DAY_MS },
        "fp",
        now,
      ),
    ).toBe(true);
  });

  it("accepts a state written by the previous format", () => {
    expect(
      upload_state_is_current(
        { fingerprint: "fp", epoch_started_at: now, uploaded_ids: [1] },
        "fp",
        now,
      ),
    ).toBe(true);
  });

  it("rejects a changed or missing fingerprint, a stale or future epoch, and malformed state", () => {
    const valid = { fingerprint: "fp", epoch_started_at: now };

    expect(upload_state_is_current(valid, "other", now)).toBe(false);
    expect(upload_state_is_current(valid, null, now)).toBe(false);
    expect(
      upload_state_is_current(
        { fingerprint: "fp", epoch_started_at: now - 7 * DAY_MS },
        "fp",
        now,
      ),
    ).toBe(false);
    expect(
      upload_state_is_current(
        { fingerprint: "fp", epoch_started_at: now + 1000 },
        "fp",
        now,
      ),
    ).toBe(false);
    for (const stored of [
      null,
      undefined,
      "x",
      { key_id: 4, secret_key_b64: "AAAA" },
      { fingerprint: "", epoch_started_at: now },
      { fingerprint: "fp", epoch_started_at: Number.NaN },
    ]) {
      expect(upload_state_is_current(stored, "fp", now)).toBe(false);
    }
  });
});

describe("select_ids_missing_on_server", () => {
  it("keeps only ids the server does not list", () => {
    expect(select_ids_missing_on_server([1, 2, 3], new Set([2]))).toEqual([
      1, 3,
    ]);
  });

  it("keeps every id when the server list is unknown", () => {
    expect(select_ids_missing_on_server([1, 2, 3], null)).toEqual([1, 2, 3]);
  });
});

describe("backfill decides uploads from the server secret list", () => {
  it("uploads every eligible secret on the first run without asking for the secret list", async () => {
    seed_local([1, 2, 3, 4]);
    server_ids = [2, 3, 4, 99];
    serve_secret_ids([2, 3, 4]);

    await backfill_pq_secrets_to_server();

    expect(uploaded_ids_per_call()).toEqual([[2, 3, 4]]);
    expect(secret_ids_fetches()).toBe(0);
  });

  it("uploads nothing when the server holds every secret under the same wrap key", async () => {
    await prime_state([1, 2, 3]);
    serve_secret_ids([1, 2, 3]);

    await backfill_pq_secrets_to_server();

    expect(secret_ids_fetches()).toBe(1);
    expect(post_mock).not.toHaveBeenCalled();
  });

  it("uploads a secret the server lost even though an earlier run uploaded it", async () => {
    await prime_state([1, 2, 3]);
    serve_secret_ids([1, 3]);

    await backfill_pq_secrets_to_server();

    expect(uploaded_ids_per_call()).toEqual([[2]]);
  });

  it("uploads a newly listed prekey the server holds no secret for", async () => {
    await prime_state([1, 2]);
    seed_local([1, 2, 3]);
    server_ids = [1, 2, 3];
    serve_secret_ids([1, 2]);

    await backfill_pq_secrets_to_server();

    expect(uploaded_ids_per_call()).toEqual([[3]]);
  });

  it("uploads everything when the secret list returns 404", async () => {
    await prime_state([1, 2]);
    secret_ids_response = async () => ({
      error: "not found",
      code: "NOT_FOUND",
    });

    await backfill_pq_secrets_to_server();

    expect(uploaded_ids_per_call()).toEqual([[1, 2]]);
  });

  it("uploads everything when the secret list request throws", async () => {
    await prime_state([1, 2]);
    secret_ids_response = async () => {
      throw new Error("network");
    };

    await backfill_pq_secrets_to_server();

    expect(uploaded_ids_per_call()).toEqual([[1, 2]]);
  });

  it("uploads everything when the secret list is malformed", async () => {
    for (const data of [
      undefined,
      null,
      {},
      { key_ids: "1,2" },
      { key_ids: [1, "2"] },
      { key_ids: [1, 2.5] },
      { pq_key_ids: [1, 2] },
    ]) {
      storage.clear();
      await prime_state([1, 2]);
      secret_ids_response = async () => ({ data });

      await backfill_pq_secrets_to_server();

      expect(uploaded_ids_per_call()).toEqual([[1, 2]]);
    }
  });

  it("uploads everything after a wrap key change even when the server lists every id", async () => {
    await prime_state([1, 2, 3]);
    serve_secret_ids([1, 2, 3]);
    master_byte = 2;

    await backfill_pq_secrets_to_server();

    expect(uploaded_ids_per_call()).toEqual([[1, 2, 3]]);
    expect(secret_ids_fetches()).toBe(0);

    post_mock.mockClear();
    await backfill_pq_secrets_to_server();
    expect(post_mock).not.toHaveBeenCalled();
  });

  it("uploads everything once the refresh window passes", async () => {
    await prime_state([1, 2]);
    serve_secret_ids([1, 2]);

    vi.setSystemTime(new Date(Date.now() + 6 * DAY_MS));
    await backfill_pq_secrets_to_server();
    expect(post_mock).not.toHaveBeenCalled();

    vi.setSystemTime(new Date(Date.now() + 2 * DAY_MS));
    await backfill_pq_secrets_to_server();
    expect(uploaded_ids_per_call()).toEqual([[1, 2]]);
  });

  it("keeps doing full uploads until one completes without a failed chunk", async () => {
    seed_local([1, 2]);
    server_ids = [1, 2];
    serve_secret_ids([1, 2]);
    post_mock.mockResolvedValueOnce({ error: "boom", code: "SERVER_ERROR" });

    await backfill_pq_secrets_to_server();
    expect(uploaded_ids_per_call()).toEqual([[1, 2]]);

    post_mock.mockClear();
    await backfill_pq_secrets_to_server();
    expect(uploaded_ids_per_call()).toEqual([[1, 2]]);

    post_mock.mockClear();
    await backfill_pq_secrets_to_server();
    expect(post_mock).not.toHaveBeenCalled();
  });

  it("does not record the wrap key when a full upload is rate limited partway", async () => {
    const ids = Array.from({ length: 450 }, (_, i) => i + 1);

    seed_local(ids);
    server_ids = ids;
    serve_secret_ids(ids);
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
    get_mock.mockClear();
    vi.setSystemTime(new Date(Date.now() + 2 * 60 * 1000));
    await backfill_pq_secrets_to_server();

    expect(uploaded_ids_per_call().flat()).toHaveLength(450);
    expect(secret_ids_fetches()).toBe(0);
  });

  it("uploads nothing when the prekey id list is unavailable", async () => {
    seed_local([1, 2]);
    server_ids = [1, 2];
    get_mock.mockResolvedValue({ error: "boom", code: "SERVER_ERROR" });

    await backfill_pq_secrets_to_server();

    expect(post_mock).not.toHaveBeenCalled();
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
