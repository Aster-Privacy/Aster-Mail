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
import { describe, it, expect, beforeEach, vi } from "vitest";

import type { EncryptedVault } from "@/services/crypto/key_manager_core";

import {
  VAULT_KDF_ITERATIONS_LEGACY,
  VAULT_KDF_ITERATIONS_LEVEL2,
  get_current_vault_iterations,
  get_level2_admission,
  known_vault_kdf_iterations,
  mark_level2_admitted,
  note_current_vault_iterations,
  record_vault_kdf_iterations,
  reset_level2_state,
  stored_vault_write_iterations,
  VAULT_LEVEL2_NOT_ADMITTED,
  write_vault_at_level,
  type SealedVault,
  type VaultKdfIterations,
} from "./vault_level2";
import { prepare_vault_write } from "./key_manager_pgp_vault";
import {
  generate_identity_keypair,
  generate_signed_prekey,
  decrypt_vault,
} from "@/services/crypto/key_manager";
import { generate_rotated_credential } from "@/services/crypto/shared_mailbox";

const OLD_SECRET = "b2xkLWxvZ2luLXNlY3JldC0zMi1ieXRlcy1vbGQ=";
const PASSWORD = "work-factor-test-password";

interface WriteResult {
  error?: string;
  status?: number;
  server_code?: string;
  data?: { success: boolean };
}

type Send = (
  sealed: SealedVault,
  field: { vault_kdf_iterations?: VaultKdfIterations },
) => Promise<WriteResult>;

const DOWNGRADE: WriteResult = {
  error: "This key vault uses a stronger work factor.",
  status: 409,
  server_code: "VAULT_KDF_DOWNGRADE",
};

const LEVEL2_REFUSED: WriteResult = {
  error: "The stronger work factor is not available.",
  status: 409,
  server_code: VAULT_LEVEL2_NOT_ADMITTED,
};

async function mailbox_vault(): Promise<EncryptedVault> {
  const identity = await generate_identity_keypair(
    "family",
    "family@astermail.org",
    OLD_SECRET,
  );
  const { keypair: prekey } = await generate_signed_prekey(
    "family",
    "family@astermail.org",
    OLD_SECRET,
    identity.secret_key,
  );

  return {
    identity_key: identity.secret_key,
    signed_prekey: prekey.public_key,
    signed_prekey_private: prekey.secret_key,
    recovery_codes: [],
  };
}

function plain_vault(): EncryptedVault {
  return {
    identity_key: "identity-key",
    signed_prekey: "signed-prekey",
    signed_prekey_private: "signed-prekey-private",
    recovery_codes: ["ASTER-ONE"],
  };
}

function fake_seal() {
  return vi.fn(async (iterations: VaultKdfIterations) => ({
    encrypted_vault: `vault-${iterations}`,
    vault_nonce: "nonce",
  }));
}

function downgrade_then_success() {
  return vi
    .fn<Send>()
    .mockResolvedValueOnce(DOWNGRADE)
    .mockResolvedValueOnce({ data: { success: true } });
}

beforeEach(() => {
  reset_level2_state();
});

describe("vault writes keep the stored work factor", () => {
  it("reseals at the stronger factor when the server reports a downgrade", async () => {
    const seal = fake_seal();
    const send = downgrade_then_success();

    const result = await write_vault_at_level(
      VAULT_KDF_ITERATIONS_LEGACY,
      seal,
      send,
    );

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toEqual({
      encrypted_vault: "vault-600000",
      vault_nonce: "nonce",
    });
    expect(send.mock.calls[1][1]).toEqual({
      vault_kdf_iterations: VAULT_KDF_ITERATIONS_LEVEL2,
    });
    expect(result.iterations).toBe(VAULT_KDF_ITERATIONS_LEVEL2);
  });

  it("does not resend when the server accepts the first write", async () => {
    const seal = fake_seal();
    const send = vi.fn<Send>().mockResolvedValue({ data: { success: true } });

    await write_vault_at_level(VAULT_KDF_ITERATIONS_LEGACY, seal, send);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("stops after one resend when the stronger write is also refused", async () => {
    const seal = fake_seal();
    const send = vi.fn<Send>().mockResolvedValue(DOWNGRADE);

    const result = await write_vault_at_level(
      VAULT_KDF_ITERATIONS_LEGACY,
      seal,
      send,
    );

    expect(send).toHaveBeenCalledTimes(2);
    expect(seal.mock.calls.map(([iterations]) => iterations)).toEqual([
      VAULT_KDF_ITERATIONS_LEGACY,
      VAULT_KDF_ITERATIONS_LEVEL2,
    ]);
    expect(result.response).toEqual(DOWNGRADE);
    expect(result.iterations).toBe(VAULT_KDF_ITERATIONS_LEVEL2);
  });

  it("never resends a write that already uses the stronger factor", async () => {
    const seal = fake_seal();
    const send = vi.fn<Send>().mockResolvedValue(DOWNGRADE);

    const result = await write_vault_at_level(
      VAULT_KDF_ITERATIONS_LEVEL2,
      seal,
      send,
    );

    expect(send).toHaveBeenCalledTimes(1);
    expect(seal).toHaveBeenCalledTimes(1);
    expect(result.response).toEqual(DOWNGRADE);
    expect(result.iterations).toBe(VAULT_KDF_ITERATIONS_LEVEL2);
  });

  it.each([
    {
      label: "another conflict code",
      refusal: { status: 409, server_code: "VAULT_GENERATION_STALE" },
    },
    { label: "a conflict with no code", refusal: { status: 409 } },
    {
      label: "the downgrade code on another status",
      refusal: { status: 400, server_code: "VAULT_KDF_DOWNGRADE" },
    },
  ])("does not resend on $label", async ({ refusal }) => {
    const seal = fake_seal();
    const send = vi
      .fn<Send>()
      .mockResolvedValue({ error: "refused", ...refusal });

    const result = await write_vault_at_level(
      VAULT_KDF_ITERATIONS_LEGACY,
      seal,
      send,
    );

    expect(send).toHaveBeenCalledTimes(1);
    expect(seal).toHaveBeenCalledTimes(1);
    expect(result.iterations).toBe(VAULT_KDF_ITERATIONS_LEGACY);
  });

  it("picks the stored factor reported by the server", () => {
    expect(stored_vault_write_iterations(600000)).toBe(
      VAULT_KDF_ITERATIONS_LEVEL2,
    );
    expect(stored_vault_write_iterations("600000")).toBe(
      VAULT_KDF_ITERATIONS_LEVEL2,
    );
    expect(stored_vault_write_iterations(310000)).toBe(
      VAULT_KDF_ITERATIONS_LEGACY,
    );
    expect(stored_vault_write_iterations(undefined)).toBe(
      VAULT_KDF_ITERATIONS_LEGACY,
    );
    expect(stored_vault_write_iterations(null, null)).toBe(
      VAULT_KDF_ITERATIONS_LEGACY,
    );
  });

  it("falls back to the factor the stored vault opened with", () => {
    record_vault_kdf_iterations("stored-strong", VAULT_KDF_ITERATIONS_LEVEL2);
    record_vault_kdf_iterations("stored-legacy", VAULT_KDF_ITERATIONS_LEGACY);

    expect(stored_vault_write_iterations(undefined, "stored-strong")).toBe(
      VAULT_KDF_ITERATIONS_LEVEL2,
    );
    expect(stored_vault_write_iterations(310000, "stored-strong")).toBe(
      VAULT_KDF_ITERATIONS_LEVEL2,
    );
    expect(stored_vault_write_iterations(undefined, "stored-legacy")).toBe(
      VAULT_KDF_ITERATIONS_LEGACY,
    );
    expect(stored_vault_write_iterations(undefined, "never-seen")).toBe(
      VAULT_KDF_ITERATIONS_LEGACY,
    );
  });

  it("seals a rotated shared mailbox vault at the stored factor", async () => {
    const vault = await mailbox_vault();
    const rotated = await generate_rotated_credential(
      vault,
      OLD_SECRET,
      VAULT_KDF_ITERATIONS_LEVEL2,
    );

    reset_level2_state();
    await decrypt_vault(
      rotated.encrypted_vault,
      rotated.vault_nonce,
      rotated.login_secret,
    );

    expect(known_vault_kdf_iterations(rotated.encrypted_vault)).toBe(
      VAULT_KDF_ITERATIONS_LEVEL2,
    );
  });
});

describe("prepare_vault_write", () => {
  it("sends a vault that opens at the stronger factor after a downgrade", async () => {
    const prepared = await prepare_vault_write(
      plain_vault(),
      PASSWORD,
      VAULT_KDF_ITERATIONS_LEGACY,
    );
    const send = downgrade_then_success();

    const written = await prepared.write(send);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0]).toEqual(prepared.sealed);
    expect(send.mock.calls[0][1]).toEqual({});
    expect(send.mock.calls[1][0]).toEqual(written.sealed);
    expect(send.mock.calls[1][1]).toEqual({
      vault_kdf_iterations: VAULT_KDF_ITERATIONS_LEVEL2,
    });
    expect(written.iterations).toBe(VAULT_KDF_ITERATIONS_LEVEL2);
    expect(get_current_vault_iterations()).toBe(VAULT_KDF_ITERATIONS_LEVEL2);

    reset_level2_state();
    const opened = await decrypt_vault(
      written.sealed.encrypted_vault,
      written.sealed.vault_nonce,
      PASSWORD,
    );

    expect(opened.recovery_codes).toEqual(["ASTER-ONE"]);
    expect(known_vault_kdf_iterations(written.sealed.encrypted_vault)).toBe(
      VAULT_KDF_ITERATIONS_LEVEL2,
    );
  });

  it("keeps the signed-in factor when the vault belongs to someone else", async () => {
    note_current_vault_iterations(VAULT_KDF_ITERATIONS_LEGACY);

    const prepared = await prepare_vault_write(
      plain_vault(),
      PASSWORD,
      VAULT_KDF_ITERATIONS_LEGACY,
      false,
    );
    const send = downgrade_then_success();

    const written = await prepared.write(send);

    expect(written.iterations).toBe(VAULT_KDF_ITERATIONS_LEVEL2);
    expect(get_current_vault_iterations()).toBe(VAULT_KDF_ITERATIONS_LEGACY);
    expect(known_vault_kdf_iterations(written.sealed.encrypted_vault)).toBe(
      VAULT_KDF_ITERATIONS_LEVEL2,
    );
  });

  it("leaves the signed-in admission alone when another account refuses the stronger factor", async () => {
    mark_level2_admitted();
    note_current_vault_iterations(VAULT_KDF_ITERATIONS_LEGACY);

    const prepared = await prepare_vault_write(
      plain_vault(),
      PASSWORD,
      VAULT_KDF_ITERATIONS_LEVEL2,
      false,
    );
    const send = vi
      .fn<Send>()
      .mockResolvedValueOnce(LEVEL2_REFUSED)
      .mockResolvedValueOnce({ data: { success: true } });

    const written = await prepared.write(send);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][1]).toEqual({});
    expect(written.iterations).toBe(VAULT_KDF_ITERATIONS_LEGACY);
    expect(get_level2_admission()).toBe("admitted");
    expect(get_current_vault_iterations()).toBe(VAULT_KDF_ITERATIONS_LEGACY);
  });

  it("answers another account's refusal without reading the signed-in factor", async () => {
    note_current_vault_iterations(VAULT_KDF_ITERATIONS_LEVEL2);

    const prepared = await prepare_vault_write(
      plain_vault(),
      PASSWORD,
      VAULT_KDF_ITERATIONS_LEVEL2,
      false,
    );
    const send = vi
      .fn<Send>()
      .mockResolvedValueOnce(LEVEL2_REFUSED)
      .mockResolvedValueOnce({ data: { success: true } });

    const written = await prepared.write(send);

    expect(send).toHaveBeenCalledTimes(2);
    expect(written.iterations).toBe(VAULT_KDF_ITERATIONS_LEGACY);
    expect(get_level2_admission()).toBe("unknown");
    expect(get_current_vault_iterations()).toBe(VAULT_KDF_ITERATIONS_LEVEL2);
  });

  it("records nothing when the write fails", async () => {
    const prepared = await prepare_vault_write(
      plain_vault(),
      PASSWORD,
      VAULT_KDF_ITERATIONS_LEVEL2,
    );
    const send = vi
      .fn<Send>()
      .mockResolvedValue({ error: "unavailable", status: 503 });

    const written = await prepared.write(send);

    expect(send).toHaveBeenCalledTimes(1);
    expect(written.response.error).toBe("unavailable");
    expect(get_current_vault_iterations()).toBeNull();
  });
});
