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
import type { EncryptedVault } from "@/services/crypto/key_manager_core";

import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch_latest_vault: vi.fn(),
  rotate_identity_key: vi.fn(),
  encrypt_vault: vi.fn(),
}));

vi.mock("@/services/crypto/vault_cas_write", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/crypto/vault_cas_write")
  >()),
  fetch_latest_vault: mocks.fetch_latest_vault,
}));

vi.mock("@/services/api/key_rotation", async (import_original) => ({
  ...(await import_original<typeof import("@/services/api/key_rotation")>()),
  rotate_identity_key: mocks.rotate_identity_key,
}));

vi.mock("@/services/crypto/key_manager", async (import_original) => ({
  ...(await import_original<typeof import("@/services/crypto/key_manager")>()),
  encrypt_vault: mocks.encrypt_vault,
}));

import {
  submit_identity_rotation,
  type IdentityRotationFields,
} from "@/services/key_rotation_service";
import {
  VAULT_KDF_ITERATIONS_LEGACY,
  VAULT_KDF_ITERATIONS_LEVEL2,
  get_current_vault_iterations,
  mark_level2_admitted,
  note_opened_vault_iterations,
  reset_level2_state,
} from "@/services/crypto/vault_level2";

const FIELDS: IdentityRotationFields = {
  new_identity_key: "new-identity",
  rotation_signature: "proof",
  vault_format: 2,
};

const NEW_VAULT = { identity_key: "new" } as unknown as EncryptedVault;

const SUCCESS = {
  data: {
    success: true,
    new_identity_key: "new-identity",
    rotated_at: "2026-11-07T00:00:00Z",
    new_key_fingerprint: "fp",
  },
};

function snapshot(vault_sha256: string | null = "c2hhLW9mLXN0b3JlZA==") {
  return {
    kind: "ok",
    snapshot: {
      encrypted_vault: "stored-vault",
      vault_nonce: "stored-nonce",
      vault_sha256,
    },
  };
}

describe("submit_identity_rotation", () => {
  beforeEach(() => {
    reset_level2_state();
    mocks.fetch_latest_vault.mockReset();
    mocks.rotate_identity_key.mockReset();
    mocks.encrypt_vault.mockReset();
    mocks.encrypt_vault.mockImplementation(
      async (_vault: EncryptedVault, _password: string, iterations: number) => ({
        encrypted_vault: `sealed-${iterations}`,
        vault_nonce: `nonce-${iterations}`,
      }),
    );
  });

  it("seals at 600k and sends the work factor and vault hash when the vault is strong", async () => {
    note_opened_vault_iterations(VAULT_KDF_ITERATIONS_LEVEL2);
    mocks.fetch_latest_vault.mockResolvedValue(snapshot());
    mocks.rotate_identity_key.mockResolvedValue(SUCCESS);

    const result = await submit_identity_rotation(FIELDS, NEW_VAULT, "pw");

    expect(result.ok).toBe(true);
    expect(mocks.encrypt_vault).toHaveBeenCalledTimes(1);
    expect(mocks.encrypt_vault).toHaveBeenCalledWith(
      NEW_VAULT,
      "pw",
      VAULT_KDF_ITERATIONS_LEVEL2,
    );
    expect(mocks.rotate_identity_key).toHaveBeenCalledTimes(1);
    expect(mocks.rotate_identity_key).toHaveBeenCalledWith({
      ...FIELDS,
      encrypted_vault: "sealed-600000",
      vault_nonce: "nonce-600000",
      vault_kdf_iterations: VAULT_KDF_ITERATIONS_LEVEL2,
      expected_vault_sha256: "c2hhLW9mLXN0b3JlZA==",
    });
    if (result.ok) {
      expect(result.sealed.encrypted_vault).toBe("sealed-600000");
      expect(result.iterations).toBe(VAULT_KDF_ITERATIONS_LEVEL2);
    }
    expect(get_current_vault_iterations()).toBe(VAULT_KDF_ITERATIONS_LEVEL2);
  });

  it("uses 600k once the account is admitted", async () => {
    mark_level2_admitted();
    mocks.fetch_latest_vault.mockResolvedValue(snapshot());
    mocks.rotate_identity_key.mockResolvedValue(SUCCESS);

    await submit_identity_rotation(FIELDS, NEW_VAULT, "pw");

    expect(mocks.rotate_identity_key.mock.calls[0][0].vault_kdf_iterations).toBe(
      VAULT_KDF_ITERATIONS_LEVEL2,
    );
  });

  it("sends 310k explicitly for a legacy account that is not admitted", async () => {
    mocks.fetch_latest_vault.mockResolvedValue(snapshot());
    mocks.rotate_identity_key.mockResolvedValue(SUCCESS);

    await submit_identity_rotation(FIELDS, NEW_VAULT, "pw");

    expect(mocks.encrypt_vault).toHaveBeenCalledWith(
      NEW_VAULT,
      "pw",
      VAULT_KDF_ITERATIONS_LEGACY,
    );
    expect(mocks.rotate_identity_key.mock.calls[0][0].vault_kdf_iterations).toBe(
      VAULT_KDF_ITERATIONS_LEGACY,
    );
  });

  it("falls back to 310k once when the server refuses level 2", async () => {
    mark_level2_admitted();
    mocks.fetch_latest_vault.mockResolvedValue(snapshot());
    mocks.rotate_identity_key
      .mockResolvedValueOnce({
        error: "not admitted",
        error_code: "VAULT_LEVEL2_NOT_ADMITTED",
        status: 409,
        server_code: "VAULT_LEVEL2_NOT_ADMITTED",
      })
      .mockResolvedValueOnce(SUCCESS);

    const result = await submit_identity_rotation(FIELDS, NEW_VAULT, "pw");

    expect(result.ok).toBe(true);
    expect(mocks.rotate_identity_key).toHaveBeenCalledTimes(2);
    const retried = mocks.rotate_identity_key.mock.calls[1][0];

    expect(retried.vault_kdf_iterations).toBe(VAULT_KDF_ITERATIONS_LEGACY);
    expect(retried.encrypted_vault).toBe("sealed-310000");
    expect(retried.expected_vault_sha256).toBe("c2hhLW9mLXN0b3JlZA==");
  });

  it("fails cleanly on VAULT_CHANGED without retrying or recording the write", async () => {
    note_opened_vault_iterations(VAULT_KDF_ITERATIONS_LEGACY);
    mocks.fetch_latest_vault.mockResolvedValue(snapshot());
    mocks.rotate_identity_key.mockResolvedValue({
      error: "vault changed",
      error_code: "VAULT_CHANGED",
      status: 409,
      server_code: "VAULT_CHANGED",
    });

    const result = await submit_identity_rotation(FIELDS, NEW_VAULT, "pw");

    expect(result).toEqual({
      ok: false,
      error: "vault_changed",
      error_code: "VAULT_CHANGED",
    });
    expect(mocks.fetch_latest_vault).toHaveBeenCalledTimes(1);
    expect(mocks.rotate_identity_key).toHaveBeenCalledTimes(1);
    expect(get_current_vault_iterations()).toBe(VAULT_KDF_ITERATIONS_LEGACY);
  });

  it("does not post when the fresh vault read fails", async () => {
    mocks.fetch_latest_vault.mockResolvedValue({ kind: "error" });

    const result = await submit_identity_rotation(FIELDS, NEW_VAULT, "pw");

    expect(result).toEqual({ ok: false, error: "vault_unavailable" });
    expect(mocks.encrypt_vault).not.toHaveBeenCalled();
    expect(mocks.rotate_identity_key).not.toHaveBeenCalled();
  });

  it("omits the hash when the server has no vault yet", async () => {
    mocks.fetch_latest_vault.mockResolvedValue({ kind: "missing" });
    mocks.rotate_identity_key.mockResolvedValue(SUCCESS);

    await submit_identity_rotation(FIELDS, NEW_VAULT, "pw");

    expect(
      "expected_vault_sha256" in mocks.rotate_identity_key.mock.calls[0][0],
    ).toBe(false);
  });

  it("passes through other server errors", async () => {
    mocks.fetch_latest_vault.mockResolvedValue(snapshot(null));
    mocks.rotate_identity_key.mockResolvedValue({
      error: "stale",
      error_code: "STALE_KEY_VAULT",
      status: 409,
      server_code: "STALE_KEY_VAULT",
    });

    const result = await submit_identity_rotation(FIELDS, NEW_VAULT, "pw");

    expect(result).toEqual({
      ok: false,
      error: "stale",
      error_code: "STALE_KEY_VAULT",
    });
    expect(
      "expected_vault_sha256" in mocks.rotate_identity_key.mock.calls[0][0],
    ).toBe(false);
  });
});
