import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map<string, string>();

vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
});

const get_mock = vi.fn();

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: (...args: unknown[]) => get_mock(...args),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("./memory_key_store", () => ({
  has_vault_in_memory: () => true,
  get_derived_encryption_key: () => new Uint8Array(32),
}));

vi.mock("./encrypted_storage", () => ({
  encrypted_get: async () => null,
  encrypted_set: async () => {},
  encrypted_delete: async () => {},
}));

vi.mock("./ratchet_sync", () => ({
  derive_ratchet_encryption_key: async () => ({}) as CryptoKey,
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => "u1",
}));

import { load_pq_secret } from "./pq_prekey_store";

describe("pq prekey negative cache (404 flood fix)", () => {
  beforeEach(() => {
    store.clear();
    get_mock.mockReset();
  });

  it("does not re-fetch a genuinely missing (404) secret", async () => {
    get_mock.mockResolvedValue({ error: "not found", code: "NOT_FOUND" });

    const first = await load_pq_secret(596772);
    const second = await load_pq_secret(596772);
    const third = await load_pq_secret(596772);

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(third).toBeNull();
    // Only the first call hits the network; the rest are served from the
    // negative cache. This is the flood fix.
    expect(get_mock).toHaveBeenCalledTimes(1);
  });

  it("keeps the negative cache in memory without writing localStorage", async () => {
    get_mock.mockResolvedValue({ error: "not found", code: "NOT_FOUND" });
    await load_pq_secret(688968);
    expect(get_mock).toHaveBeenCalledTimes(1);
    // A later lookup still skips the fetch, served from the in-memory cache.
    await load_pq_secret(688968);
    expect(get_mock).toHaveBeenCalledTimes(1);
    // The missing set is never persisted to clear-text storage.
    expect(store.size).toBe(0);
  });

  it("short-circuits repeated fetches for transient errors within the same session", async () => {
    get_mock.mockResolvedValue({ error: "boom", code: "SERVER_ERROR" });

    await load_pq_secret(424242);
    await load_pq_secret(424242);

    // First call hits the network; the second is suppressed by the in-memory
    // transient error cache (60s TTL, clears on page reload).
    expect(get_mock).toHaveBeenCalledTimes(1);
  });
});
