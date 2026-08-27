import { beforeEach, describe, expect, it, vi } from "vitest";

import { array_to_base64 } from "./base64";

const OLD_PASSWORD = "the-password-set-on-the-phone";
const NEW_PASSWORD = "the-password-set-during-recovery";

const list_inactive_key_sets = vi.fn();
const fetch_inactive_key_set = vi.fn();
const consume_inactive_key_set = vi.fn();

const archived_vault: { value: unknown } = { value: null };

vi.mock("../api/recovery", () => ({
  list_inactive_key_sets: () => list_inactive_key_sets(),
  fetch_inactive_key_set: (id: string) => fetch_inactive_key_set(id),
  consume_inactive_key_set: (id: string) => consume_inactive_key_set(id),
}));

vi.mock("../account_manager", () => ({
  get_current_account: async () => ({ user: { id: "user-1" } }),
}));

vi.mock("./key_manager", () => ({
  decrypt_vault: async (
    _encrypted: string,
    _nonce: string,
    password: string,
  ) => {
    if (password !== OLD_PASSWORD) {
      throw new Error("wrong password");
    }

    return archived_vault.value;
  },
  encrypt_vault: async () => ({
    encrypted_vault: "encrypted",
    vault_nonce: "nonce",
  }),
}));

vi.mock("./ensure_ratchet_keys", () => ({
  push_vault_to_server: async () => true,
  verify_vault_roundtrip: async () => true,
}));

const { restore_inactive_key_sets } = await import("./restore_inactive_keys");
const { store_vault_in_memory, clear_vault_from_memory } = await import(
  "./memory_key_store"
);
const { decrypt_alias_field } = await import("@/services/api/aliases/crypto");

function random_key(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

async function seal_under(
  raw_key: Uint8Array,
  value: string,
): Promise<{ encrypted: string; nonce: string }> {
  const key = await crypto.subtle.importKey(
    "raw",
    raw_key,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(value),
  );

  return {
    encrypted: array_to_base64(new Uint8Array(ciphertext)),
    nonce: array_to_base64(nonce),
  };
}

function vault_with_storage_key(raw_key: Uint8Array) {
  return {
    identity_key: "identity",
    signed_prekey: "prekey",
    signed_prekey_private: "prekey-private",
    vault_format: 2,
    kdf_version: 2,
    data_kek: array_to_base64(raw_key),
  };
}

function legacy_vault() {
  return {
    identity_key: "identity",
    signed_prekey: "prekey",
    signed_prekey_private: "prekey-private",
  };
}

describe("alias recovery after a password change", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clear_vault_from_memory();
    localStorage.clear();
    list_inactive_key_sets.mockResolvedValue({
      data: { inactive_key_sets: [{ id: "archived-1" }] },
    });
    fetch_inactive_key_set.mockResolvedValue({
      data: { encrypted_vault: "old", vault_nonce: "old-nonce" },
    });
    consume_inactive_key_set.mockResolvedValue({ data: {} });
  });

  it("reads an alias sealed under the retired storage key", async () => {
    const old_key = random_key();
    const new_key = random_key();
    const sealed = await seal_under(old_key, "bills@astermail.org");

    archived_vault.value = vault_with_storage_key(old_key);

    await store_vault_in_memory(
      vault_with_storage_key(new_key) as never,
      NEW_PASSWORD,
      "user-1",
    );

    await expect(
      decrypt_alias_field(sealed.encrypted, sealed.nonce),
    ).rejects.toThrow();

    expect(await restore_inactive_key_sets(OLD_PASSWORD)).toBe(1);

    expect(await decrypt_alias_field(sealed.encrypted, sealed.nonce)).toBe(
      "bills@astermail.org",
    );
  });

  it("leaves the alias sealed when the old password is wrong", async () => {
    const old_key = random_key();
    const new_key = random_key();
    const sealed = await seal_under(old_key, "shopping@astermail.org");

    archived_vault.value = vault_with_storage_key(old_key);

    await store_vault_in_memory(
      vault_with_storage_key(new_key) as never,
      NEW_PASSWORD,
      "user-1",
    );

    expect(await restore_inactive_key_sets("not-the-old-password")).toBe(0);

    await expect(
      decrypt_alias_field(sealed.encrypted, sealed.nonce),
    ).rejects.toThrow();
  });

  it("still reads aliases sealed under the current storage key", async () => {
    const old_key = random_key();
    const new_key = random_key();
    const current = await seal_under(new_key, "work@astermail.org");

    archived_vault.value = vault_with_storage_key(old_key);

    await store_vault_in_memory(
      vault_with_storage_key(new_key) as never,
      NEW_PASSWORD,
      "user-1",
    );

    await restore_inactive_key_sets(OLD_PASSWORD);

    expect(await decrypt_alias_field(current.encrypted, current.nonce)).toBe(
      "work@astermail.org",
    );
  });

  it("reads an alias sealed two password changes ago", async () => {
    const oldest_key = random_key();
    const old_key = random_key();
    const new_key = random_key();
    const sealed = await seal_under(oldest_key, "banking@astermail.org");

    archived_vault.value = {
      ...vault_with_storage_key(old_key),
      legacy_keks: [
        {
          k: array_to_base64(oldest_key),
          added_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    };

    await store_vault_in_memory(
      vault_with_storage_key(new_key) as never,
      NEW_PASSWORD,
      "user-1",
    );

    await expect(
      decrypt_alias_field(sealed.encrypted, sealed.nonce),
    ).rejects.toThrow();

    expect(await restore_inactive_key_sets(OLD_PASSWORD)).toBe(1);

    expect(await decrypt_alias_field(sealed.encrypted, sealed.nonce)).toBe(
      "banking@astermail.org",
    );
  });
  it("reads an alias sealed under the retired key when the live vault is a legacy vault", async () => {
    const old_key = random_key();
    const sealed = await seal_under(old_key, "work@astermail.org");

    archived_vault.value = vault_with_storage_key(old_key);

    await store_vault_in_memory(
      legacy_vault() as never,
      NEW_PASSWORD,
      "user-1",
    );

    await expect(
      decrypt_alias_field(sealed.encrypted, sealed.nonce),
    ).rejects.toThrow();

    expect(await restore_inactive_key_sets(OLD_PASSWORD)).toBe(1);

    expect(await decrypt_alias_field(sealed.encrypted, sealed.nonce)).toBe(
      "work@astermail.org",
    );
  });
});
