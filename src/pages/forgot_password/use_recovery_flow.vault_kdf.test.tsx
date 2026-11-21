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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

import {
  VAULT_KDF_ITERATIONS_LEGACY,
  VAULT_KDF_ITERATIONS_LEVEL2,
  get_current_vault_iterations,
  note_current_vault_iterations,
  reset_level2_state,
} from "@/services/crypto/vault_level2";

const NEW_PASSWORD = "Recovered-Passw0rd";

interface CompleteResult {
  error?: string;
  status?: number;
  server_code?: string;
  data?: { success: boolean };
}

const initiate_recovery_mock = vi.fn();
const complete_recovery_mock = vi.fn<(...args: unknown[]) => Promise<CompleteResult>>();
const prepare_calls: unknown[][] = [];

function source_vault(): EncryptedVault {
  return {
    identity_key: "identity-key",
    signed_prekey: "signed-prekey",
    signed_prekey_private: "signed-prekey-private",
    recovery_codes: [],
  };
}

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/contexts/theme_context", () => ({
  useTheme: () => ({ theme: "light" }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/services/sanitize", async () => {
  const actual =
    await vi.importActual<typeof import("@/services/sanitize")>(
      "@/services/sanitize",
    );

  return { ...actual, timing_safe_delay: async () => undefined };
});

vi.mock("@/services/api/recovery", () => ({
  forgot_password_email: vi.fn(),
  get_verifier_salts: async () => ({
    error: null,
    data: { verifier_salts: [], code_hash_optional: false },
  }),
  initiate_recovery: (...args: unknown[]) => initiate_recovery_mock(...args),
  complete_recovery: (...args: unknown[]) => complete_recovery_mock(...args),
}));

vi.mock("@/services/crypto/recovery_key", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/crypto/recovery_key")
  >("@/services/crypto/recovery_key");

  return {
    ...actual,
    is_valid_recovery_code: () => true,
    hash_recovery_code: async () => "code-hash",
    build_verifier_candidates: async () => [],
    decrypt_recovery_key_with_code: async () => new Uint8Array(32),
    open_recovery_backup: async () => ({
      vault: source_vault(),
      user_id: "",
      generation: 0,
    }),
    encrypt_vault_backup: async () => ({
      encrypted_data: "backup",
      nonce: "backup-nonce",
      salt: "backup-salt",
    }),
    generate_all_recovery_shares: async () => [],
  };
});

vi.mock("@/services/crypto/recovery_backup_refresh", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/crypto/recovery_backup_refresh")
  >("@/services/crypto/recovery_backup_refresh");

  return { ...actual, stored_user_id_for_email: async () => "" };
});

vi.mock("@/services/crypto/backup_unlocked_keys", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/crypto/backup_unlocked_keys")
  >("@/services/crypto/backup_unlocked_keys");

  return {
    ...actual,
    build_backup_vault: async (vault: EncryptedVault) => vault,
    read_unlocked_keys: () => new Map<string, string>(),
    strip_backup_fields: (vault: EncryptedVault) => ({ ...vault }),
  };
});

vi.mock("@/services/crypto/recovery_vault_reseal", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/crypto/recovery_vault_reseal")
  >("@/services/crypto/recovery_vault_reseal");

  return {
    ...actual,
    recovery_needs_previous_password: async () => false,
    reseal_recovery_vault: async () => ({
      vault: source_vault(),
      identity_locked: false,
    }),
  };
});

vi.mock("@/services/crypto/recovery_escrow_rescue", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/crypto/recovery_escrow_rescue")
  >("@/services/crypto/recovery_escrow_rescue");

  return { ...actual, rescue_account_key_from_escrow: async () => null };
});

vi.mock("@/services/crypto/recovery_reencrypt", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/crypto/recovery_reencrypt")
  >("@/services/crypto/recovery_reencrypt");

  return { ...actual, store_pending_reencryption: async () => undefined };
});

vi.mock("@/services/crypto/key_manager", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/crypto/key_manager")
  >("@/services/crypto/key_manager");

  return {
    ...actual,
    derive_password_hash: async () => ({
      hash: "password-hash",
      salt: "password-salt",
      hash_v2: "password-hash-v2",
    }),
  };
});

vi.mock("@/services/crypto/key_manager_pgp_vault", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/crypto/key_manager_pgp_vault")
  >("@/services/crypto/key_manager_pgp_vault");

  return {
    ...actual,
    prepare_vault_write: (
      ...args: Parameters<typeof actual.prepare_vault_write>
    ) => {
      prepare_calls.push(args);

      return actual.prepare_vault_write(...args);
    },
  };
});

const { use_recovery_flow } = await import("./use_recovery_flow");

type Flow = ReturnType<typeof use_recovery_flow>;

let latest: Flow | null = null;

function Probe() {
  latest = use_recovery_flow();

  return null;
}

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function flow(): Flow {
  if (!latest) throw new Error("hook did not render");

  return latest;
}

function initiate_with(vault_kdf_iterations?: number) {
  return {
    error: null,
    data: {
      encrypted_vault_backup: "backup",
      vault_backup_nonce: "nonce",
      recovery_key_salt: "salt",
      encrypted_recovery_key: "key",
      recovery_key_nonce: "key-nonce",
      code_salt: "code-salt",
      recovery_token: "token",
      ...(vault_kdf_iterations === undefined ? {} : { vault_kdf_iterations }),
    },
  };
}

async function recover_with(vault_kdf_iterations?: number) {
  initiate_recovery_mock.mockResolvedValueOnce(
    initiate_with(vault_kdf_iterations),
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={["/forgot-password"]}>
        <Probe />
      </MemoryRouter>,
    );
  });
  await act(async () => {
    flow().set_username("alice");
  });
  await act(async () => {
    flow().handle_email_next();
  });
  await act(async () => {
    flow().set_step("code");
    flow().set_recovery_code("ASTER-TEST");
  });
  await act(async () => {
    await flow().handle_code_submit();
  });

  expect(flow().step).toBe("password");

  await act(async () => {
    flow().set_password(NEW_PASSWORD);
    flow().set_confirm_password(NEW_PASSWORD);
  });
  await act(async () => {
    await flow().handle_password_submit();
  });
}

describe("account recovery keeps the stored vault work factor", () => {
  beforeEach(() => {
    reset_level2_state();
    note_current_vault_iterations(VAULT_KDF_ITERATIONS_LEGACY);
    initiate_recovery_mock.mockReset();
    complete_recovery_mock.mockReset();
    complete_recovery_mock.mockResolvedValue({ data: { success: true } });
    prepare_calls.length = 0;
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    latest = null;
  });

  it("seals at the stored factor and sends it with the request", async () => {
    await recover_with(VAULT_KDF_ITERATIONS_LEVEL2);

    expect(flow().error).toBe("");
    expect(flow().step).toBe("new_codes");
    expect(prepare_calls).toHaveLength(1);
    expect(prepare_calls[0][1]).toBe(NEW_PASSWORD);
    expect(prepare_calls[0][2]).toBe(VAULT_KDF_ITERATIONS_LEVEL2);
    expect(complete_recovery_mock).toHaveBeenCalledTimes(1);
    expect(complete_recovery_mock.mock.calls[0][19]).toBe(
      VAULT_KDF_ITERATIONS_LEVEL2,
    );
  }, 30000);

  it("leaves the signed-in account's factor alone", async () => {
    await recover_with(VAULT_KDF_ITERATIONS_LEVEL2);

    expect(flow().step).toBe("new_codes");
    expect(prepare_calls[0][3]).toBe(false);
    expect(get_current_vault_iterations()).toBe(VAULT_KDF_ITERATIONS_LEGACY);
  }, 30000);

  it("uses the legacy factor and names none when the server reports none", async () => {
    await recover_with();

    expect(flow().step).toBe("new_codes");
    expect(prepare_calls[0][2]).toBe(VAULT_KDF_ITERATIONS_LEGACY);
    expect(complete_recovery_mock).toHaveBeenCalledTimes(1);
    expect(complete_recovery_mock.mock.calls[0][19]).toBeUndefined();
  }, 30000);

  it("resends at the stronger factor when the server reports a downgrade", async () => {
    complete_recovery_mock.mockReset();
    complete_recovery_mock
      .mockResolvedValueOnce({
        error: "This key vault uses a stronger work factor.",
        status: 409,
        server_code: "VAULT_KDF_DOWNGRADE",
      })
      .mockResolvedValueOnce({ data: { success: true } });

    await recover_with(VAULT_KDF_ITERATIONS_LEGACY);

    expect(flow().step).toBe("new_codes");
    expect(complete_recovery_mock).toHaveBeenCalledTimes(2);
    expect(complete_recovery_mock.mock.calls[0][19]).toBeUndefined();
    expect(complete_recovery_mock.mock.calls[1][19]).toBe(
      VAULT_KDF_ITERATIONS_LEVEL2,
    );
    expect(complete_recovery_mock.mock.calls[1][3]).not.toBe(
      complete_recovery_mock.mock.calls[0][3],
    );
    expect(get_current_vault_iterations()).toBe(VAULT_KDF_ITERATIONS_LEGACY);
  }, 30000);
});
