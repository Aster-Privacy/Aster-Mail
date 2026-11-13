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

const h = vi.hoisted(() => ({
  secrets: new Map<number, string>(),
  storage_available: true,
  save_fails: false,
  api_get: vi.fn(),
  api_post: vi.fn(),
}));

vi.mock("./ec_prekey_store", () => ({
  ec_one_time_storage_available: async () => h.storage_available,
  encrypt_ec_one_time_secret: async (d: string) => ({
    encrypted_secret: `sealed:${d.length}`,
    secret_nonce: "nonce",
  }),
  save_ec_one_time_secret: async (key_id: number, d: string) => {
    if (h.save_fails) throw new Error("storage refused");

    h.secrets.set(key_id, d);
  },
  has_local_ec_one_time_secret: async (key_id: number) =>
    h.secrets.has(key_id),
  delete_local_ec_one_time_secret: async (key_id: number) => {
    h.secrets.delete(key_id);
  },
}));

vi.mock("./pq_prekey_store", () => ({
  save_pq_secrets_bulk: vi.fn(async () => {}),
  delete_pq_secret: vi.fn(async () => true),
  is_pq_upload_rate_limited: () => true,
  list_pq_secret_ids: vi.fn(async () => []),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: h.api_get,
    post: h.api_post,
  },
}));

import {
  EC_PREKEY_BATCH_MAX,
  EC_PREKEY_RECHECK_MS,
  planned_ec_prekey_upload_count,
  replenish_ec_one_time_prekeys,
  reset_ec_prekey_replenishment_state,
} from "./ec_prekey_service";
import { check_and_replenish_prekeys } from "./prekey_service";

interface UploadedPrekey {
  key_id: number;
  public_key: string;
  encrypted_secret: string;
  secret_nonce: string;
}

function uploaded_prekeys(): UploadedPrekey[] {
  return h.api_post.mock.calls[0][1].prekeys as UploadedPrekey[];
}

function base64_length(value: string): number {
  return atob(value).length;
}

beforeEach(() => {
  h.secrets.clear();
  h.storage_available = true;
  h.save_fails = false;
  h.api_get.mockReset();
  h.api_post.mockReset();
  h.api_post.mockResolvedValue({ data: { uploaded: 0, available: 0 } });
  reset_ec_prekey_replenishment_state();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("one-time prekey upload planning", () => {
  it("plans nothing unless the server says it accepts uploads", () => {
    for (const status of [
      null,
      undefined,
      {},
      { available: 0, target: 20, max_upload: 20 },
      { accepted: false, available: 0, target: 20, max_upload: 20 },
      {
        accepted: "true" as unknown as boolean,
        available: 0,
        target: 20,
        max_upload: 20,
      },
      {
        accepted: 1 as unknown as boolean,
        available: 0,
        target: 20,
        max_upload: 20,
      },
    ]) {
      expect(planned_ec_prekey_upload_count(status)).toBe(0);
    }
  });

  it("plans nothing for a status with missing or malformed numbers", () => {
    for (const status of [
      { accepted: true },
      { accepted: true, available: 0, target: 20 },
      { accepted: true, available: -1, target: 20, max_upload: 20 },
      { accepted: true, available: 0, target: 0, max_upload: 20 },
      { accepted: true, available: 0, target: 20, max_upload: 0 },
      { accepted: true, available: NaN, target: 20, max_upload: 20 },
      {
        accepted: true,
        available: "0" as unknown as number,
        target: 20,
        max_upload: 20,
      },
    ]) {
      expect(planned_ec_prekey_upload_count(status)).toBe(0);
    }
  });

  it("fills the pool up to the target within every cap", () => {
    expect(
      planned_ec_prekey_upload_count({
        accepted: true,
        available: 5,
        target: 20,
        max_upload: 50,
      }),
    ).toBe(15);
    expect(
      planned_ec_prekey_upload_count({
        accepted: true,
        available: 0,
        target: 40,
        max_upload: 10,
      }),
    ).toBe(10);
    expect(
      planned_ec_prekey_upload_count({
        accepted: true,
        available: 0,
        target: 5000,
        max_upload: 5000,
      }),
    ).toBe(EC_PREKEY_BATCH_MAX);
    expect(
      planned_ec_prekey_upload_count({
        accepted: true,
        available: 20,
        target: 20,
        max_upload: 50,
      }),
    ).toBe(0);
    expect(
      planned_ec_prekey_upload_count({
        accepted: true,
        available: 30,
        target: 20,
        max_upload: 50,
      }),
    ).toBe(0);
  });
});

describe("one-time prekey replenishment", () => {
  it("uploads nothing against a server that does not know the route", async () => {
    h.api_get.mockResolvedValue({ error: "Not found", code: "NOT_FOUND" });

    await expect(replenish_ec_one_time_prekeys()).resolves.toBe(0);

    expect(h.api_post).not.toHaveBeenCalled();
    expect(h.secrets.size).toBe(0);
  });

  it("uploads nothing when the status request throws", async () => {
    h.api_get.mockRejectedValue(new Error("offline"));

    await expect(replenish_ec_one_time_prekeys()).resolves.toBe(0);

    expect(h.api_post).not.toHaveBeenCalled();
  });

  it("uploads nothing while the server reports the feature as off", async () => {
    h.api_get.mockResolvedValue({
      data: { accepted: false, available: 0, target: 20, max_upload: 20 },
    });

    await expect(replenish_ec_one_time_prekeys()).resolves.toBe(0);

    expect(h.api_post).not.toHaveBeenCalled();
    expect(h.secrets.size).toBe(0);
  });

  it("does not ask an unwilling server again until the recheck window passes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    h.api_get.mockResolvedValue({ error: "Not found", code: "NOT_FOUND" });

    await replenish_ec_one_time_prekeys();
    await replenish_ec_one_time_prekeys();
    await replenish_ec_one_time_prekeys();

    expect(h.api_get).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + EC_PREKEY_RECHECK_MS + 1);

    await replenish_ec_one_time_prekeys();

    expect(h.api_get).toHaveBeenCalledTimes(2);
  });

  it("uploads nothing and asks nothing without storage for the secrets", async () => {
    h.storage_available = false;
    h.api_get.mockResolvedValue({
      data: { accepted: true, available: 0, target: 20, max_upload: 20 },
    });

    await expect(replenish_ec_one_time_prekeys()).resolves.toBe(0);

    expect(h.api_get).not.toHaveBeenCalled();
    expect(h.api_post).not.toHaveBeenCalled();
  });

  it("uploads the planned number of keys once the server accepts them", async () => {
    h.api_get.mockResolvedValue({
      data: { accepted: true, available: 17, target: 20, max_upload: 20 },
    });

    await expect(replenish_ec_one_time_prekeys()).resolves.toBe(3);

    expect(h.api_get).toHaveBeenCalledWith("/crypto/v1/keys/ec-prekeys/status");
    expect(h.api_post).toHaveBeenCalledTimes(1);
    expect(h.api_post.mock.calls[0][0]).toBe("/crypto/v1/keys/ec-prekeys");

    const prekeys = uploaded_prekeys();

    expect(prekeys).toHaveLength(3);
    expect(new Set(prekeys.map((p) => p.key_id)).size).toBe(3);

    for (const prekey of prekeys) {
      expect(Object.keys(prekey).sort()).toEqual([
        "encrypted_secret",
        "key_id",
        "public_key",
        "secret_nonce",
      ]);
      expect(Number.isInteger(prekey.key_id)).toBe(true);
      expect(prekey.key_id).toBeGreaterThanOrEqual(1);
      expect(prekey.key_id).toBeLessThanOrEqual(0x7fffffff);
      expect(base64_length(prekey.public_key)).toBe(65);
      expect(atob(prekey.public_key).charCodeAt(0)).toBe(0x04);
      expect(h.secrets.has(prekey.key_id)).toBe(true);
    }

    expect(h.secrets.size).toBe(3);
  });

  it("never sends a private scalar to the server in the clear", async () => {
    h.api_get.mockResolvedValue({
      data: { accepted: true, available: 0, target: 2, max_upload: 20 },
    });

    await replenish_ec_one_time_prekeys();

    const body = JSON.stringify(h.api_post.mock.calls[0][1]);

    for (const d of h.secrets.values()) {
      expect(body.includes(d)).toBe(false);
    }
  });

  it("uploads nothing when the pool is already full", async () => {
    h.api_get.mockResolvedValue({
      data: { accepted: true, available: 20, target: 20, max_upload: 20 },
    });

    await expect(replenish_ec_one_time_prekeys()).resolves.toBe(0);

    expect(h.api_post).not.toHaveBeenCalled();
  });

  it("drops the local secrets when the upload is rejected", async () => {
    h.api_get.mockResolvedValue({
      data: { accepted: true, available: 0, target: 4, max_upload: 20 },
    });
    h.api_post.mockResolvedValue({ error: "Too many", code: "RATE_LIMITED" });

    await expect(replenish_ec_one_time_prekeys()).resolves.toBe(0);

    expect(h.api_post).toHaveBeenCalledTimes(1);
    expect(h.secrets.size).toBe(0);
  });

  it("drops the local secrets when the upload throws", async () => {
    h.api_get.mockResolvedValue({
      data: { accepted: true, available: 0, target: 4, max_upload: 20 },
    });
    h.api_post.mockRejectedValue(new Error("offline"));

    await expect(replenish_ec_one_time_prekeys()).resolves.toBe(0);

    expect(h.secrets.size).toBe(0);
  });

  it("uploads nothing when a secret cannot be stored", async () => {
    h.save_fails = true;
    h.api_get.mockResolvedValue({
      data: { accepted: true, available: 0, target: 4, max_upload: 20 },
    });

    await expect(replenish_ec_one_time_prekeys()).resolves.toBe(0);

    expect(h.api_post).not.toHaveBeenCalled();
    expect(h.secrets.size).toBe(0);
  });
});

describe("prekey replenishment entry point", () => {
  it("finishes without an error against a server without the new routes", async () => {
    h.api_get.mockResolvedValue({ error: "Not found", code: "NOT_FOUND" });
    h.api_post.mockResolvedValue({ error: "Not found", code: "NOT_FOUND" });

    await expect(check_and_replenish_prekeys()).resolves.toBeUndefined();

    expect(h.api_get).toHaveBeenCalledWith("/crypto/v1/keys/ec-prekeys/status");
    expect(h.api_post).not.toHaveBeenCalled();
    expect(h.secrets.size).toBe(0);
  });
});
