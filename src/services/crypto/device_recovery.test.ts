import type { DeviceSnapshotRecord } from "./device_recovery_store";

import * as openpgp from "openpgp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const snapshots = new Map<string, DeviceSnapshotRecord>();
const server_secrets = new Map<string, string>();
const vaults_by_blob = new Map<string, Record<string, unknown>>();
const inactive_sets = new Map<string, string>();
let device_key: CryptoKey | null = null;
let flag_on = true;
let memory_vault: Record<string, unknown> | null = null;
let memory_passphrase: string | null = null;

const put_device_recovery_secret = vi.fn();
const fetch_device_recovery_secrets = vi.fn();
const delete_device_recovery_secrets = vi.fn();
const consume_inactive_key_set = vi.fn();
const commit_recovered_keys = vi.fn();
const save_device_snapshot = vi.fn();

vi.mock("../api/account_key", () => ({
  get_account_key_capabilities: async () => ({ device_recovery: flag_on }),
}));

vi.mock("../api/recovery", () => ({
  put_device_recovery_secret: (id: string, secret: string) =>
    put_device_recovery_secret(id, secret),
  fetch_device_recovery_secrets: (ids: string[]) =>
    fetch_device_recovery_secrets(ids),
  delete_device_recovery_secrets: (ids: string[]) =>
    delete_device_recovery_secrets(ids),
  list_inactive_key_sets: async () => ({
    data: {
      inactive_key_sets: [...inactive_sets.keys()].map((id) => ({ id })),
    },
  }),
  fetch_inactive_key_set: async (id: string) => ({
    data: {
      encrypted_vault: inactive_sets.get(id),
      vault_nonce: "n",
      vault_version: 2,
    },
  }),
  consume_inactive_key_set: (id: string) => consume_inactive_key_set(id),
}));

vi.mock("./device_recovery_store", () => ({
  load_device_recovery_key: async (create: boolean) => {
    if (!device_key && create) {
      device_key = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
    }

    return device_key;
  },
  list_device_snapshots: async (user_id: string) =>
    [...snapshots.values()]
      .filter((record) => record.user_id === user_id)
      .sort((a, b) => b.created_at - a.created_at),
  save_device_snapshot: (record: DeviceSnapshotRecord) =>
    save_device_snapshot(record),
  delete_device_snapshots: async (ids: string[]) => {
    for (const id of ids) snapshots.delete(id);
  },
}));

vi.mock("./key_manager", () => ({
  decrypt_vault: async (blob: string, _nonce: string, passphrase: string) => {
    const vault = vaults_by_blob.get(blob);

    if (!vault || vault.__passphrase !== passphrase) {
      throw new Error("bad vault");
    }

    return structuredClone(vault);
  },
}));

vi.mock("./memory_key_store", () => ({
  get_vault_from_memory: () => memory_vault,
  get_passphrase_from_memory: () => memory_passphrase,
}));

vi.mock("./restore_inactive_keys", () => ({
  harvest_storage_keys: async () => [new Uint8Array(32).fill(7)],
  commit_recovered_keys: (commit: unknown) => commit_recovered_keys(commit),
}));

vi.mock("./vault_write_lock", () => ({
  with_vault_write_lock: (fn: () => Promise<unknown>) => fn(),
}));

import {
  open_device_snapshot,
  refresh_device_snapshot,
  run_device_recovery,
  seal_device_snapshot,
  vault_ciphertext_hash,
} from "./device_recovery";

const USER = "user-1";

async function make_key(passphrase: string) {
  const { privateKey } = await openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ name: "a", email: "a@example.com" }],
    passphrase,
    format: "armored",
  });
  const fingerprint = (
    await openpgp.readPrivateKey({ armoredKey: privateKey })
  ).getFingerprint();

  return { armored: privateKey, fingerprint };
}

function blob(label: string): string {
  return btoa(`vault-ciphertext-${label}-${Math.random()}`);
}

function install_vault(
  label: string,
  identity_key: string,
  passphrase: string,
): { blob: string; vault: Record<string, unknown> } {
  const encoded = blob(label);
  const vault = {
    __passphrase: passphrase,
    identity_key,
    previous_keys: [identity_key],
    legacy_identity_keys: [],
    ratchet_identity_key: `ratchet-${label}`,
    ratchet_identity_public: `ratchet-public-${label}`,
    ratchet_signed_prekey: "spk",
    ratchet_signed_prekey_public: "spk-pub",
  };

  vaults_by_blob.set(encoded, vault);
  localStorage.setItem(`astermail_encrypted_vault_${USER}`, encoded);
  localStorage.setItem(`astermail_vault_nonce_${USER}`, "nonce");
  memory_vault = structuredClone(vault);
  memory_passphrase = passphrase;

  return { blob: encoded, vault };
}

describe("device recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    snapshots.clear();
    server_secrets.clear();
    vaults_by_blob.clear();
    inactive_sets.clear();
    localStorage.clear();
    device_key = null;
    flag_on = true;
    memory_vault = null;
    memory_passphrase = null;

    put_device_recovery_secret.mockImplementation(
      async (id: string, secret: string) => {
        server_secrets.set(id, secret);

        return { data: { success: true } };
      },
    );
    fetch_device_recovery_secrets.mockImplementation(async (ids: string[]) => ({
      data: {
        secrets: ids
          .filter((id) => server_secrets.has(id))
          .map((id) => ({ snapshot_id: id, secret: server_secrets.get(id) })),
      },
    }));
    delete_device_recovery_secrets.mockImplementation(async (ids: string[]) => {
      for (const id of ids) server_secrets.delete(id);

      return { data: { success: true } };
    });
    consume_inactive_key_set.mockResolvedValue({ data: { success: true } });
    commit_recovered_keys.mockResolvedValue(true);
    save_device_snapshot.mockImplementation(
      async (record: DeviceSnapshotRecord) => {
        snapshots.set(record.snapshot_id, record);

        return true;
      },
    );
  });

  describe("sealing", () => {
    const payload = {
      v: 1,
      identity_key: "id",
      previous_keys: [],
      legacy_identity_keys: [],
      unlocked_keys: [["id", "unlocked"]] as [string, string][],
      storage_keys: [],
      ratchet_keys: [],
    };
    const meta = { user_id: USER, snapshot_id: "snap-1", source_hash: "h1" };

    async function sealed_record() {
      const key = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
      const secret = crypto.getRandomValues(new Uint8Array(32));
      const { iv, sealed } = await seal_device_snapshot(
        payload,
        secret,
        key,
        meta,
      );
      const record: DeviceSnapshotRecord = {
        ...meta,
        created_at: 1,
        iv,
        sealed,
      };

      return { key, secret, record };
    }

    it("opens with the matching device key and server secret", async () => {
      const { key, secret, record } = await sealed_record();

      expect(await open_device_snapshot(record, secret, key)).toEqual(payload);
    });

    it("rejects a wrong server secret", async () => {
      const { key, record } = await sealed_record();
      const wrong = crypto.getRandomValues(new Uint8Array(32));

      expect(await open_device_snapshot(record, wrong, key)).toBeNull();
    });

    it("rejects a different device key", async () => {
      const { secret, record } = await sealed_record();
      const other = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );

      expect(await open_device_snapshot(record, secret, other)).toBeNull();
    });

    it("rejects a record whose bound metadata was swapped", async () => {
      const { key, secret, record } = await sealed_record();

      expect(
        await open_device_snapshot(
          { ...record, source_hash: "h2" },
          secret,
          key,
        ),
      ).toBeNull();
      expect(
        await open_device_snapshot(
          { ...record, user_id: "user-2" },
          secret,
          key,
        ),
      ).toBeNull();
    });
  });

  it("does nothing while the flag is off", async () => {
    flag_on = false;
    const key = await make_key("pw");

    install_vault("a", key.armored, "pw");
    inactive_sets.set("set-1", "Zm9v");

    expect(await run_device_recovery(USER)).toBe(0);
    expect(put_device_recovery_secret).not.toHaveBeenCalled();
    expect(commit_recovered_keys).not.toHaveBeenCalled();
    expect(consume_inactive_key_set).not.toHaveBeenCalled();
    expect(snapshots.size).toBe(0);
  });

  it("takes one snapshot per vault version and stores the secret first", async () => {
    const key = await make_key("pw");

    install_vault("a", key.armored, "pw");

    expect(await refresh_device_snapshot(USER)).toBe(true);
    expect(await refresh_device_snapshot(USER)).toBe(false);
    expect(snapshots.size).toBe(1);
    expect(server_secrets.size).toBe(1);

    const [record] = [...snapshots.values()];

    expect(server_secrets.has(record.snapshot_id)).toBe(true);
    expect(put_device_recovery_secret.mock.invocationCallOrder[0]).toBeLessThan(
      save_device_snapshot.mock.invocationCallOrder[0],
    );
    expect(JSON.stringify([...snapshots.values()])).not.toContain(
      "PRIVATE KEY",
    );
  });

  it("keeps nothing locally when the server refuses the secret", async () => {
    const key = await make_key("pw");

    install_vault("a", key.armored, "pw");
    put_device_recovery_secret.mockResolvedValue({ error: "rate limited" });

    expect(await refresh_device_snapshot(USER)).toBe(false);
    expect(snapshots.size).toBe(0);
  });

  it("drops the server secret when the local save fails", async () => {
    const key = await make_key("pw");

    install_vault("a", key.armored, "pw");
    save_device_snapshot.mockResolvedValue(false);

    expect(await refresh_device_snapshot(USER)).toBe(false);
    expect(server_secrets.size).toBe(0);
  });

  it("recovers old keys under the new password after a reset", async () => {
    const old_key = await make_key("old-pw");
    const old = install_vault("old", old_key.armored, "old-pw");

    await refresh_device_snapshot(USER);

    const new_key = await make_key("new-pw");

    install_vault("new", new_key.armored, "new-pw");
    inactive_sets.set("set-1", old.blob);

    expect(await run_device_recovery(USER)).toBe(1);
    expect(consume_inactive_key_set).toHaveBeenCalledWith("set-1");

    const commit = commit_recovered_keys.mock.calls[0][0] as {
      passphrase: string;
      identity_keys: { previous_keys: string[]; absorbed: boolean[] };
      ratchet_groups: { ratchet_identity_public: string }[][];
      storage_keys: Uint8Array[];
    };

    expect(commit.passphrase).toBe("new-pw");
    expect(commit.identity_keys.absorbed).toEqual([true]);
    expect(commit.storage_keys).toHaveLength(1);

    let recovered_old = false;

    for (const armored of commit.identity_keys.previous_keys) {
      const locked = await openpgp.readPrivateKey({ armoredKey: armored });

      expect(locked.isDecrypted()).toBe(false);
      if (locked.getFingerprint() !== old_key.fingerprint) continue;

      await openpgp.decryptKey({ privateKey: locked, passphrase: "new-pw" });
      recovered_old = true;
    }

    expect(recovered_old).toBe(true);

    const remaining = [...snapshots.values()];
    const new_hash = await vault_ciphertext_hash(
      localStorage.getItem(`astermail_encrypted_vault_${USER}`)!,
    );

    expect(remaining).toHaveLength(1);
    expect(remaining[0].source_hash).toBe(new_hash);
    expect(server_secrets.size).toBe(1);
  });

  it("keeps the archive when the snapshot does not match it", async () => {
    const old_key = await make_key("old-pw");

    install_vault("old", old_key.armored, "old-pw");
    await refresh_device_snapshot(USER);

    const new_key = await make_key("new-pw");

    install_vault("new", new_key.armored, "new-pw");
    inactive_sets.set("set-1", btoa("a-different-archive"));

    expect(await run_device_recovery(USER)).toBe(0);
    expect(fetch_device_recovery_secrets).not.toHaveBeenCalled();
    expect(commit_recovered_keys).not.toHaveBeenCalled();
    expect(consume_inactive_key_set).not.toHaveBeenCalled();
    expect(snapshots.size).toBe(2);
  });

  it("keeps the archive and snapshot when saving the vault fails", async () => {
    const old_key = await make_key("old-pw");
    const old = install_vault("old", old_key.armored, "old-pw");

    await refresh_device_snapshot(USER);

    const new_key = await make_key("new-pw");

    install_vault("new", new_key.armored, "new-pw");
    inactive_sets.set("set-1", old.blob);
    commit_recovered_keys.mockResolvedValue(false);

    expect(await run_device_recovery(USER)).toBe(0);
    expect(consume_inactive_key_set).not.toHaveBeenCalled();

    const old_hash = await vault_ciphertext_hash(old.blob);

    expect(
      [...snapshots.values()].some((record) => record.source_hash === old_hash),
    ).toBe(true);
  });

  it("leaves the vault alone when no snapshot matches an archive", async () => {
    const key = await make_key("pw");

    install_vault("a", key.armored, "pw");
    await refresh_device_snapshot(USER);
    inactive_sets.set("set-1", btoa("unrelated-archive"));

    await run_device_recovery(USER);
    await run_device_recovery(USER);

    expect(commit_recovered_keys).not.toHaveBeenCalled();
    expect(put_device_recovery_secret).toHaveBeenCalledTimes(1);
  });

  it("cannot recover once the server secret is gone", async () => {
    const old_key = await make_key("old-pw");
    const old = install_vault("old", old_key.armored, "old-pw");

    await refresh_device_snapshot(USER);
    server_secrets.clear();

    const new_key = await make_key("new-pw");

    install_vault("new", new_key.armored, "new-pw");
    inactive_sets.set("set-1", old.blob);

    expect(await run_device_recovery(USER)).toBe(0);
    expect(commit_recovered_keys).not.toHaveBeenCalled();
    expect(consume_inactive_key_set).not.toHaveBeenCalled();
  });

  it("prunes old snapshots but keeps any that match an archive", async () => {
    const key = await make_key("pw");
    const first = install_vault("v1", key.armored, "pw");

    await refresh_device_snapshot(USER);
    for (const label of ["v2", "v3", "v4"]) {
      install_vault(label, key.armored, "pw");
      await refresh_device_snapshot(USER);
    }
    inactive_sets.set("set-1", first.blob);
    commit_recovered_keys.mockResolvedValue(false);

    await run_device_recovery(USER);

    const hashes = [...snapshots.values()].map((record) => record.source_hash);

    expect(hashes).toContain(await vault_ciphertext_hash(first.blob));
    expect(snapshots.size).toBe(3);
    expect(server_secrets.size).toBe(3);
  });
});
