import { beforeEach, describe, expect, it, vi } from "vitest";

const save_recovery_backup = vi.fn();
const build_backup_vault = vi.fn();
const encrypt_vault_backup = vi.fn();
const generate_all_recovery_shares = vi.fn();
const clear_recovery_key = vi.fn();
const recovery_key = new Uint8Array(32).fill(9);

vi.mock("../api/recovery", () => ({
  save_recovery_backup: (...args: unknown[]) => save_recovery_backup(...args),
}));

vi.mock("./backup_unlocked_keys", () => ({
  build_backup_vault: (...args: unknown[]) => build_backup_vault(...args),
}));

vi.mock("./recovery_key", () => ({
  generate_recovery_key: () => recovery_key,
  encrypt_vault_backup: (...args: unknown[]) => encrypt_vault_backup(...args),
  generate_all_recovery_shares: (...args: unknown[]) =>
    generate_all_recovery_shares(...args),
  clear_recovery_key: (key: Uint8Array) => clear_recovery_key(key),
}));

vi.mock("@/lib/ignore_error", () => ({ ignore_error: vi.fn() }));

import { refresh_recovery_backup } from "./recovery_backup_refresh";

const CODES = ["ASTER-AAAA-BBBB-CCCC-DDDD", "ASTER-EEEE-FFFF-GGGG-HHHH"];

function vault(recovery_codes: unknown[] = CODES) {
  return {
    identity_key: "identity",
    signed_prekey: "spk",
    signed_prekey_private: "spk-priv",
    recovery_codes: recovery_codes as string[],
    vault_format: 2,
    data_kek: "a2Vr",
  };
}

describe("refresh_recovery_backup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    build_backup_vault.mockImplementation(async (v: unknown) => ({
      ...(v as object),
      unlocked_keys: [["identity", "identity-open"]],
    }));
    encrypt_vault_backup.mockResolvedValue({
      encrypted_data: "evb",
      nonce: "vbn",
      salt: "rks",
    });
    generate_all_recovery_shares.mockResolvedValue([{ share_index: 0 }]);
    save_recovery_backup.mockResolvedValue({ data: { success: true } });
  });

  it("rewraps the backup for every current code without a vault update", async () => {
    await expect(refresh_recovery_backup(vault(), "pass")).resolves.toBe(true);

    expect(build_backup_vault).toHaveBeenCalledWith(vault(), "pass");
    expect(encrypt_vault_backup.mock.calls[0][1]).toBe(recovery_key);
    expect(generate_all_recovery_shares).toHaveBeenCalledWith(
      CODES,
      recovery_key,
    );
    expect(save_recovery_backup).toHaveBeenCalledWith("evb", "vbn", "rks", [
      { share_index: 0 },
    ]);
    expect(clear_recovery_key).toHaveBeenCalledWith(recovery_key);
  });

  it("does nothing when the vault holds no recovery codes", async () => {
    await expect(refresh_recovery_backup(vault([]), "pass")).resolves.toBe(
      false,
    );
    await expect(
      refresh_recovery_backup(vault(["", null]), "pass"),
    ).resolves.toBe(false);

    expect(save_recovery_backup).not.toHaveBeenCalled();
  });

  it("reports a rejected save and still clears the key", async () => {
    save_recovery_backup.mockResolvedValue({ error: "nope" });

    await expect(refresh_recovery_backup(vault(), "pass")).resolves.toBe(false);
    expect(clear_recovery_key).toHaveBeenCalledWith(recovery_key);
  });

  it("swallows a failure while building the backup", async () => {
    build_backup_vault.mockRejectedValue(new Error("boom"));

    await expect(refresh_recovery_backup(vault(), "pass")).resolves.toBe(false);
    expect(save_recovery_backup).not.toHaveBeenCalled();
    expect(clear_recovery_key).toHaveBeenCalledWith(recovery_key);
  });
});
