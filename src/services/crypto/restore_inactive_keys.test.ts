import { beforeEach, describe, expect, it, vi } from "vitest";

const list_inactive_key_sets = vi.fn();
const fetch_inactive_key_set = vi.fn();
const consume_inactive_key_set = vi.fn();
const decrypt_vault = vi.fn();
const encrypt_vault = vi.fn();
const push_vault_to_server = vi.fn();
const verify_vault_roundtrip = vi.fn();
const store_vault_in_memory = vi.fn();
const get_vault_from_memory = vi.fn();
const get_passphrase_from_memory = vi.fn();
const get_current_account = vi.fn();

vi.mock("../api/recovery", () => ({
  list_inactive_key_sets: () => list_inactive_key_sets(),
  fetch_inactive_key_set: (id: string) => fetch_inactive_key_set(id),
  consume_inactive_key_set: (id: string) => consume_inactive_key_set(id),
}));

vi.mock("./key_manager", () => ({
  decrypt_vault: (...args: unknown[]) => decrypt_vault(...args),
  encrypt_vault: (...args: unknown[]) => encrypt_vault(...args),
}));

vi.mock("./ensure_ratchet_keys", () => ({
  push_vault_to_server: (...args: unknown[]) => push_vault_to_server(...args),
  verify_vault_roundtrip: (...args: unknown[]) =>
    verify_vault_roundtrip(...args),
}));

vi.mock("./memory_key_store", () => ({
  store_vault_in_memory: (...args: unknown[]) => store_vault_in_memory(...args),
  get_vault_from_memory: () => get_vault_from_memory(),
  get_passphrase_from_memory: () => get_passphrase_from_memory(),
  get_storage_kdf_version: (vault: { kdf_version?: number }) =>
    vault?.kdf_version === 2 ? 2 : 1,
  derive_encryption_key_from_passphrase: (
    passphrase_bytes: Uint8Array,
    kdf_version = 1,
  ) => {
    const out = new Uint8Array(32);

    out.set(passphrase_bytes.slice(0, 31), 0);
    out[31] = kdf_version;

    return Promise.resolve(out);
  },
  STORAGE_KDF_VERSION_LEGACY: 1,
  STORAGE_KDF_VERSION_STRETCHED: 2,
}));

vi.mock("../account_manager", () => ({
  get_current_account: () => get_current_account(),
}));

vi.mock("./vault_write_lock", () => ({
  with_vault_write_lock: (fn: () => Promise<unknown>) => fn(),
}));

import {
  count_inactive_key_sets,
  discard_inactive_key_sets,
  restore_inactive_key_sets,
} from "./restore_inactive_keys";

function key_set(public_key: string) {
  return {
    ratchet_identity_key: `private-${public_key}`,
    ratchet_identity_public: public_key,
    ratchet_signed_prekey: "spk",
    ratchet_signed_prekey_public: "spk-pub",
  };
}

function current_vault() {
  return {
    identity_key: "identity",
    signed_prekey: "spk",
    signed_prekey_private: "spk-priv",
    recovery_codes: [],
    vault_format: 2,
    data_kek: "Y3VycmVudC1kYXRhLWtlaw==",
    legacy_keks: [
      { k: "b2xkZXItYWxyZWFkeS1oZWxk", added_at: "2026-01-01T00:00:00.000Z" },
    ],
    ...key_set("current-public"),
    ratchet_previous_keys: [key_set("recent-public")],
  };
}

const ARCHIVED_DATA_KEK = "YXJjaGl2ZWQtZGF0YS1rZWs=";

describe("restore_inactive_key_sets", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    list_inactive_key_sets.mockResolvedValue({
      data: { inactive_key_sets: [{ id: "archived-1" }] },
    });
    fetch_inactive_key_set.mockResolvedValue({
      data: { encrypted_vault: "blob", vault_nonce: "nonce", vault_version: 2 },
    });
    consume_inactive_key_set.mockResolvedValue({ data: { success: true } });
    decrypt_vault.mockResolvedValue({
      ...key_set("archived-public"),
      ratchet_previous_keys: [key_set("archived-previous")],
    });
    encrypt_vault.mockResolvedValue({
      encrypted_vault: "new-blob",
      vault_nonce: "new-nonce",
    });
    verify_vault_roundtrip.mockResolvedValue(true);
    push_vault_to_server.mockResolvedValue(true);
    get_vault_from_memory.mockReturnValue(current_vault());
    get_passphrase_from_memory.mockReturnValue("passphrase");
    get_current_account.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("merges the archived identity keys into the prior key list", async () => {
    expect(await restore_inactive_key_sets("old-password")).toBe(1);

    const saved = encrypt_vault.mock.calls[0][0] as ReturnType<
      typeof current_vault
    >;
    const publics = saved.ratchet_previous_keys.map(
      (set) => set.ratchet_identity_public,
    );

    expect(publics).toContain("archived-public");
    expect(publics).toContain("archived-previous");
    expect(publics).toContain("recent-public");
  });

  it("keeps the active identity key untouched", async () => {
    await restore_inactive_key_sets("old-password");

    const saved = encrypt_vault.mock.calls[0][0] as ReturnType<
      typeof current_vault
    >;

    expect(saved.ratchet_identity_public).toBe("current-public");
  });

  it("consumes the archived set only after the vault is stored", async () => {
    await restore_inactive_key_sets("old-password");

    expect(push_vault_to_server).toHaveBeenCalled();
    expect(consume_inactive_key_set).toHaveBeenCalledWith("archived-1");
  });

  it("does nothing when the old password does not unlock the archive", async () => {
    decrypt_vault.mockRejectedValue(new Error("bad password"));

    expect(await restore_inactive_key_sets("wrong")).toBe(0);
    expect(encrypt_vault).not.toHaveBeenCalled();
    expect(consume_inactive_key_set).not.toHaveBeenCalled();
  });

  it("never consumes an archive it could not store", async () => {
    push_vault_to_server.mockResolvedValue(false);

    expect(await restore_inactive_key_sets("old-password")).toBe(0);
    expect(consume_inactive_key_set).not.toHaveBeenCalled();
  });

  it("never consumes an archive that fails the roundtrip check", async () => {
    verify_vault_roundtrip.mockResolvedValue(false);

    expect(await restore_inactive_key_sets("old-password")).toBe(0);
    expect(push_vault_to_server).not.toHaveBeenCalled();
    expect(consume_inactive_key_set).not.toHaveBeenCalled();
  });

  it("unlocks only the archives the password opens", async () => {
    list_inactive_key_sets.mockResolvedValue({
      data: { inactive_key_sets: [{ id: "archived-1" }, { id: "archived-2" }] },
    });
    decrypt_vault
      .mockResolvedValueOnce({ ...key_set("archived-public") })
      .mockRejectedValueOnce(new Error("different password"));

    expect(await restore_inactive_key_sets("old-password")).toBe(1);
    expect(consume_inactive_key_set).toHaveBeenCalledWith("archived-1");
    expect(consume_inactive_key_set).not.toHaveBeenCalledWith("archived-2");
  });

  it("does not duplicate a key the vault already holds", async () => {
    decrypt_vault.mockResolvedValue({ ...key_set("recent-public") });

    await restore_inactive_key_sets("old-password");

    const saved = encrypt_vault.mock.calls[0][0] as ReturnType<
      typeof current_vault
    >;

    expect(
      saved.ratchet_previous_keys.filter(
        (set) => set.ratchet_identity_public === "recent-public",
      ),
    ).toHaveLength(1);
  });

  it("stops before touching the vault when nothing is archived", async () => {
    list_inactive_key_sets.mockResolvedValue({
      data: { inactive_key_sets: [] },
    });

    expect(await restore_inactive_key_sets("old-password")).toBe(0);
    expect(fetch_inactive_key_set).not.toHaveBeenCalled();
    expect(encrypt_vault).not.toHaveBeenCalled();
  });

  it("stops when the vault is locked", async () => {
    get_passphrase_from_memory.mockReturnValue(null);

    expect(await restore_inactive_key_sets("old-password")).toBe(0);
    expect(encrypt_vault).not.toHaveBeenCalled();
  });

  it("carries the archived storage key into the vault legacy key list", async () => {
    decrypt_vault.mockResolvedValue({
      ...key_set("archived-public"),
      vault_format: 2,
      data_kek: ARCHIVED_DATA_KEK,
    });

    expect(await restore_inactive_key_sets("old-password")).toBe(1);

    const saved = encrypt_vault.mock.calls[0][0] as {
      legacy_keks?: Array<{ k: string }>;
    };

    expect(saved.legacy_keks?.map((entry) => entry.k)).toContain(
      ARCHIVED_DATA_KEK,
    );
  });

  it("keeps the legacy keys the vault already held", async () => {
    decrypt_vault.mockResolvedValue({
      ...key_set("archived-public"),
      vault_format: 2,
      data_kek: ARCHIVED_DATA_KEK,
    });

    await restore_inactive_key_sets("old-password");

    const saved = encrypt_vault.mock.calls[0][0] as {
      legacy_keks?: Array<{ k: string }>;
    };

    expect(saved.legacy_keks?.map((entry) => entry.k)).toContain(
      "b2xkZXItYWxyZWFkeS1oZWxk",
    );
  });

  it("chains the legacy keys the archived vault itself carried", async () => {
    decrypt_vault.mockResolvedValue({
      ...key_set("archived-public"),
      vault_format: 2,
      data_kek: ARCHIVED_DATA_KEK,
      legacy_keks: [
        { k: "ZXZlbi1vbGRlci1rZXk=", added_at: "2025-06-01T00:00:00.000Z" },
      ],
    });

    await restore_inactive_key_sets("old-password");

    const saved = encrypt_vault.mock.calls[0][0] as {
      legacy_keks?: Array<{ k: string }>;
    };

    expect(saved.legacy_keks?.map((entry) => entry.k)).toContain(
      "ZXZlbi1vbGRlci1rZXk=",
    );
  });

  it("derives a storage key from the old password for a legacy archived vault", async () => {
    decrypt_vault.mockResolvedValue({
      ...key_set("archived-public"),
      vault_format: 1,
    });

    expect(await restore_inactive_key_sets("old-password")).toBe(1);

    const saved = encrypt_vault.mock.calls[0][0] as {
      legacy_keks?: Array<{ k: string }>;
    };

    expect(saved.legacy_keks?.length ?? 0).toBeGreaterThan(1);
  });

  it("adds no legacy key when the old password opens nothing", async () => {
    decrypt_vault.mockRejectedValue(new Error("bad password"));

    await restore_inactive_key_sets("wrong");

    expect(encrypt_vault).not.toHaveBeenCalled();
  });

  it("reports how many archives are waiting", async () => {
    expect(await count_inactive_key_sets()).toBe(1);
  });
});

describe("discard_inactive_key_sets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("consumes every archive without touching the vault", async () => {
    list_inactive_key_sets.mockResolvedValue({
      data: {
        inactive_key_sets: [{ id: "archived-1" }, { id: "archived-2" }],
      },
    });
    consume_inactive_key_set.mockResolvedValue({ data: { success: true } });

    await expect(discard_inactive_key_sets()).resolves.toBe(2);

    expect(consume_inactive_key_set).toHaveBeenCalledWith("archived-1");
    expect(consume_inactive_key_set).toHaveBeenCalledWith("archived-2");
    expect(fetch_inactive_key_set).not.toHaveBeenCalled();
    expect(push_vault_to_server).not.toHaveBeenCalled();
    expect(store_vault_in_memory).not.toHaveBeenCalled();
  });

  it("counts only the archives the server confirmed", async () => {
    list_inactive_key_sets.mockResolvedValue({
      data: {
        inactive_key_sets: [{ id: "archived-1" }, { id: "archived-2" }],
      },
    });
    consume_inactive_key_set
      .mockResolvedValueOnce({ data: { success: true } })
      .mockResolvedValueOnce({ error: "not found" });

    await expect(discard_inactive_key_sets()).resolves.toBe(1);
  });

  it("returns zero when nothing is archived", async () => {
    list_inactive_key_sets.mockResolvedValue({
      data: { inactive_key_sets: [] },
    });

    await expect(discard_inactive_key_sets()).resolves.toBe(0);
    expect(consume_inactive_key_set).not.toHaveBeenCalled();
  });
});
