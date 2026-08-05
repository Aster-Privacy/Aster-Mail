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

vi.mock("./encrypted_storage", () => ({
  encrypted_get: async () => null,
  encrypted_set: async () => {},
  encrypted_delete: async () => {},
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

const ROLLBACK_KEY = "aster_pq_pending_rollback:u1";

function pq_secret_deletes(): unknown[][] {
  return delete_mock.mock.calls.filter(([url]) =>
    String(url).startsWith("/crypto/v1/ratchet/pq-secret/"),
  );
}

function queued_ids(): number[] {
  return JSON.parse(store.get(ROLLBACK_KEY) || "[]");
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
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-05T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("pq secret rollback never storms the server", () => {
  it("stops deleting after a short failure streak and queues the rest", async () => {
    const service_mod = await fresh_prekey_service();

    post_mock.mockImplementation(async (url: string) =>
      String(url).startsWith("/crypto/v1/ratchet/pq-secret")
        ? { data: { ok: true } }
        : { error: "server error" },
    );
    delete_mock.mockResolvedValue({ error: "server error" });

    const result = await service_mod.generate_and_upload_prekeys(true);

    expect(result).toBe(false);
    expect(pq_secret_deletes().length).toBe(3);
    expect(queued_ids().length).toBeGreaterThan(3);
  });

  it("holds off further deletes while the backoff window is open", async () => {
    const service_mod = await fresh_prekey_service();

    post_mock.mockImplementation(async (url: string) =>
      String(url).startsWith("/crypto/v1/ratchet/pq-secret")
        ? { data: { ok: true } }
        : { error: "server error" },
    );
    delete_mock.mockResolvedValue({ error: "server error" });

    await service_mod.generate_and_upload_prekeys(true);
    const after_first = pq_secret_deletes().length;

    vi.setSystemTime(new Date("2026-08-05T00:01:00Z"));
    await service_mod.generate_and_upload_prekeys(true);

    expect(pq_secret_deletes().length).toBe(after_first);
  });

  it("caps the queued rollback backlog across repeated failures", async () => {
    const service_mod = await fresh_prekey_service();

    post_mock.mockImplementation(async (url: string) =>
      String(url).startsWith("/crypto/v1/ratchet/pq-secret")
        ? { data: { ok: true } }
        : { error: "server error" },
    );
    delete_mock.mockResolvedValue({ error: "server error" });

    for (let i = 0; i < 6; i++) {
      vi.setSystemTime(new Date(Date.now() + 600000));
      await service_mod.generate_and_upload_prekeys(true);
    }

    expect(queued_ids().length).toBeLessThanOrEqual(200);
  });

  it("treats a missing server secret as deleted", async () => {
    const store_mod = await import("./pq_prekey_store");

    delete_mock.mockResolvedValue({ code: "NOT_FOUND", error: "not found" });

    await expect(store_mod.delete_pq_secret(1234)).resolves.toBe(true);
  });
});
