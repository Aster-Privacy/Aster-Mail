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

const STATUS_URL = "/crypto/v1/keys/prekeys/status";
const UPLOAD_URL = "/crypto/v1/keys/prekeys";

function prekey_uploads(): unknown[][] {
  return post_mock.mock.calls.filter(([url]) => String(url) === UPLOAD_URL);
}

function set_status(response: unknown) {
  get_mock.mockImplementation(async (url: string) =>
    String(url) === STATUS_URL ? response : { error: "unexpected" },
  );
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
  post_mock.mockResolvedValue({ data: { status: "ok" } });
  delete_mock.mockResolvedValue({ data: { success: true } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("prekey replenishment only uploads when the pool is actually low", () => {
  it("uploads nothing when the server reports a healthy pool", async () => {
    const service_mod = await fresh_prekey_service();

    set_status({
      data: { pq_prekeys_available: 260, needs_pq_replenishment: false },
    });

    const result = await service_mod.generate_and_upload_prekeys();

    expect(result).toBe(false);
    expect(prekey_uploads()).toHaveLength(0);
  });

  it("uploads when the server reports the pool is below threshold", async () => {
    const service_mod = await fresh_prekey_service();

    set_status({
      data: { pq_prekeys_available: 2, needs_pq_replenishment: true },
    });

    const result = await service_mod.generate_and_upload_prekeys();

    expect(result).toBe(true);
    expect(prekey_uploads()).toHaveLength(1);
  });

  it("uploads for a brand new account with an empty pool", async () => {
    const service_mod = await fresh_prekey_service();

    set_status({
      data: { pq_prekeys_available: 0, needs_pq_replenishment: true },
    });

    const result = await service_mod.generate_and_upload_prekeys();

    expect(result).toBe(true);
    expect(prekey_uploads()).toHaveLength(1);
  });

  it("still uploads when the status check fails so the pool can never starve", async () => {
    const service_mod = await fresh_prekey_service();

    set_status({ error: "server error" });

    const result = await service_mod.generate_and_upload_prekeys();

    expect(result).toBe(true);
    expect(prekey_uploads()).toHaveLength(1);
  });

  it("still uploads when the status request throws", async () => {
    const service_mod = await fresh_prekey_service();

    get_mock.mockImplementation(async () => {
      throw new Error("network down");
    });

    const result = await service_mod.generate_and_upload_prekeys();

    expect(result).toBe(true);
    expect(prekey_uploads()).toHaveLength(1);
  });

  it("keeps the forced self-heal path unconditional", async () => {
    const service_mod = await fresh_prekey_service();

    set_status({
      data: { pq_prekeys_available: 500, needs_pq_replenishment: false },
    });

    const result = await service_mod.generate_and_upload_prekeys(true);

    expect(result).toBe(true);
    expect(prekey_uploads()).toHaveLength(1);
    expect(
      get_mock.mock.calls.filter(([url]) => String(url) === STATUS_URL),
    ).toHaveLength(0);
  });
});
