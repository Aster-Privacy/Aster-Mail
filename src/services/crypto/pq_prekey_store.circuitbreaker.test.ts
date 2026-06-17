import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const store = new Map<string, string>();

vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
});

const post_mock = vi.fn();
const get_mock = vi.fn();
const delete_mock = vi.fn();

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: (...args: unknown[]) => get_mock(...args),
    post: (...args: unknown[]) => post_mock(...args),
    delete: (...args: unknown[]) => delete_mock(...args),
  },
}));

vi.mock("../api/client", () => ({
  api_client: {
    get: (...args: unknown[]) => get_mock(...args),
    post: (...args: unknown[]) => post_mock(...args),
    delete: (...args: unknown[]) => delete_mock(...args),
  },
}));

vi.mock("./memory_key_store", () => ({
  has_vault_in_memory: () => true,
  get_derived_encryption_key: () => new Uint8Array(32),
}));

const encrypted_set_mock = vi.fn(async (..._args: unknown[]) => {});
const encrypted_delete_mock = vi.fn(async (..._args: unknown[]) => {});

vi.mock("./encrypted_storage", () => ({
  encrypted_get: async () => null,
  encrypted_set: (...args: unknown[]) => encrypted_set_mock(...args),
  encrypted_delete: (...args: unknown[]) => encrypted_delete_mock(...args),
}));

async function make_aes_key(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new Uint8Array(32),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

vi.mock("./ratchet_sync", () => ({
  derive_ratchet_encryption_key: async () => make_aes_key(),
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => "u1",
}));

async function fresh_store() {
  vi.resetModules();
  return import("./pq_prekey_store");
}

async function fresh_prekey_service() {
  vi.resetModules();
  return import("./prekey_service");
}

beforeEach(() => {
  store.clear();
  post_mock.mockReset();
  get_mock.mockReset();
  delete_mock.mockReset();
  encrypted_set_mock.mockClear();
  encrypted_delete_mock.mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-17T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("pq upload circuit breaker (POST-storm fix)", () => {
  it("trips the cooldown on a 429 bulk response, throws, then clears after 60s", async () => {
    const mod = await fresh_store();

    post_mock.mockResolvedValue({
      code: "RATE_LIMIT_EXCEEDED",
      error: "rate limited",
    });

    expect(mod.is_pq_upload_rate_limited()).toBe(false);

    await expect(
      mod.save_pq_secrets_bulk([
        { key_id: 1001, secret: new Uint8Array(32) },
        { key_id: 1002, secret: new Uint8Array(32) },
      ]),
    ).rejects.toThrow("pq_upload_rate_limited");

    expect(post_mock).toHaveBeenCalledTimes(1);
    expect(mod.is_pq_upload_rate_limited()).toBe(true);

    vi.advanceTimersByTime(59000);
    expect(mod.is_pq_upload_rate_limited()).toBe(true);

    vi.advanceTimersByTime(2000);
    expect(mod.is_pq_upload_rate_limited()).toBe(false);
  });

  it("trips the cooldown on a 429 single-secret upload via save_pq_secret", async () => {
    const mod = await fresh_store();

    post_mock.mockResolvedValue({
      code: "RATE_LIMIT_EXCEEDED",
      error: "rate limited",
    });

    await expect(
      mod.save_pq_secret(2001, new Uint8Array(32)),
    ).rejects.toThrow("pq_upload_rate_limited");

    expect(post_mock).toHaveBeenCalledTimes(1);
    expect(mod.is_pq_upload_rate_limited()).toBe(true);
  });

  it("does NOT set the cooldown on a normal 200 bulk response", async () => {
    const mod = await fresh_store();

    post_mock.mockResolvedValue({ data: { ok: true } });

    await mod.save_pq_secrets_bulk([
      { key_id: 3001, secret: new Uint8Array(32) },
    ]);

    expect(post_mock).toHaveBeenCalledTimes(1);
    expect(mod.is_pq_upload_rate_limited()).toBe(false);
  });
});

describe("no re-storm under cooldown (force retrigger)", () => {
  it("generate_and_upload_prekeys(force) returns false without any POST while rate limited", async () => {
    const store_mod = await fresh_store();
    const service_mod = await import("./prekey_service");

    post_mock.mockResolvedValue({
      code: "RATE_LIMIT_EXCEEDED",
      error: "rate limited",
    });

    await expect(
      store_mod.save_pq_secrets_bulk([
        { key_id: 4001, secret: new Uint8Array(32) },
      ]),
    ).rejects.toThrow("pq_upload_rate_limited");

    expect(store_mod.is_pq_upload_rate_limited()).toBe(true);

    const posts_before = post_mock.mock.calls.length;

    const result = await service_mod.generate_and_upload_prekeys(true);

    expect(result).toBe(false);
    expect(post_mock.mock.calls.length).toBe(posts_before);
  });
});

describe("bulk path = one request + local persistence", () => {
  it("issues a single bulk POST and writes each secret locally", async () => {
    const mod = await fresh_store();

    post_mock.mockResolvedValue({ data: { ok: true } });

    const items = [
      { key_id: 5001, secret: new Uint8Array(32) },
      { key_id: 5002, secret: new Uint8Array(32) },
      { key_id: 5003, secret: new Uint8Array(32) },
    ];

    await mod.save_pq_secrets_bulk(items);

    expect(post_mock).toHaveBeenCalledTimes(1);

    const [url, payload] = post_mock.mock.calls[0];

    expect(url).toBe("/crypto/v1/ratchet/pq-secret/bulk");
    expect(Array.isArray((payload as { secrets: unknown[] }).secrets)).toBe(
      true,
    );
    expect((payload as { secrets: unknown[] }).secrets).toHaveLength(3);

    const record_calls = encrypted_set_mock.mock.calls.filter(([key]) =>
      String(key).startsWith("pq_prekey_secret_u1_"),
    );
    const written_ids = record_calls.map(([key]) =>
      String(key).replace("pq_prekey_secret_u1_", ""),
    );

    expect(written_ids).toContain("5001");
    expect(written_ids).toContain("5002");
    expect(written_ids).toContain("5003");
  });

  it("full replenishment issues at most 2 bulk POSTs to pq-secret, not 70", async () => {
    await fresh_store();
    const service_mod = await fresh_prekey_service();

    post_mock.mockResolvedValue({ data: { ok: true } });

    const result = await service_mod.generate_and_upload_prekeys(true);

    expect(result).toBe(true);

    const pq_secret_posts = post_mock.mock.calls.filter(([url]) =>
      String(url).startsWith("/crypto/v1/ratchet/pq-secret"),
    );

    expect(pq_secret_posts.length).toBeLessThanOrEqual(2);
    for (const [url] of pq_secret_posts) {
      expect(url).toBe("/crypto/v1/ratchet/pq-secret/bulk");
    }
  });
});
