import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map<string, string>();

vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
});

const generate_and_upload_prekeys_mock = vi.fn();

vi.mock("@/services/crypto/prekey_service", () => ({
  generate_and_upload_prekeys: (...args: unknown[]) =>
    generate_and_upload_prekeys_mock(...args),
}));

vi.mock("@/services/crypto/pq_prekey_store", () => ({
  list_pq_secret_ids: async () => [],
  backfill_pq_secrets_to_server: async () => {},
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  has_vault_in_memory: () => true,
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => "u1",
}));

vi.mock("@/services/api/client", () => ({
  api_client: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

import { handle_missing_pq_secret } from "./pq_secret_reconciler";

describe("handle_missing_pq_secret concurrency (494-request storm fix)", () => {
  beforeEach(() => {
    store.clear();
    generate_and_upload_prekeys_mock.mockReset();
    generate_and_upload_prekeys_mock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 5));

      return true;
    });
  });

  it("runs rotate_pq_pool only once when many decrypt failures fire concurrently", async () => {
    const calls = Array.from({ length: 494 }, () => handle_missing_pq_secret());

    await Promise.all(calls);

    expect(generate_and_upload_prekeys_mock).toHaveBeenCalledTimes(1);
  });

  it("still self-heals normally for a single, isolated failure", async () => {
    await handle_missing_pq_secret();

    expect(generate_and_upload_prekeys_mock).toHaveBeenCalledTimes(1);
    expect(generate_and_upload_prekeys_mock).toHaveBeenCalledWith(true);
  });

  it("respects the 10-minute cooldown for a second isolated failure right after the first", async () => {
    await handle_missing_pq_secret();
    await handle_missing_pq_secret();

    expect(generate_and_upload_prekeys_mock).toHaveBeenCalledTimes(1);
  });
});
