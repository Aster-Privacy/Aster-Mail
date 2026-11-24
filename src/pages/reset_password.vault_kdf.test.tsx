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
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

import {
  VAULT_KDF_ITERATIONS_LEGACY,
  VAULT_KDF_ITERATIONS_LEVEL2,
  get_current_vault_iterations,
  note_current_vault_iterations,
  record_vault_kdf_iterations,
  reset_level2_state,
} from "@/services/crypto/vault_level2";

const CURRENT_PASSWORD = "Earlier-Passw0rd";
const NEW_PASSWORD = "Replaced-Passw0rd";
const STORED_VAULT = "stored-encrypted-vault";

interface ResetResult {
  error?: string;
  status?: number;
  server_code?: string;
  data?: { success: boolean };
}

const reset_vault_state: { vault_kdf_iterations?: number } = {};
const stored_copy: { sealed: { encrypted_vault: string; vault_nonce: string } | null } =
  { sealed: null };
const reset_password_mock = vi.fn<(...args: unknown[]) => Promise<ResetResult>>();
const prepare_calls: unknown[][] = [];

function kept_vault(): EncryptedVault {
  return {
    identity_key: "identity-key",
    signed_prekey: "signed-prekey",
    signed_prekey_private: "signed-prekey-private",
    recovery_codes: [],
  };
}

vi.mock("framer-motion", async () => {
  const react = await import("react");
  const actual =
    await vi.importActual<typeof import("framer-motion")>("framer-motion");
  const motion_props = new Set([
    "animate",
    "exit",
    "initial",
    "transition",
    "variants",
    "layout",
    "layoutId",
    "custom",
    "whileHover",
    "whileTap",
    "onAnimationComplete",
  ]);
  const plain = new Map<string, (props: Record<string, unknown>) => ReactNode>();
  const motion = new Proxy(
    {},
    {
      get: (_target, tag) => {
        if (typeof tag !== "string") return undefined;

        const known = plain.get(tag);

        if (known) return known;

        const render = (props: Record<string, unknown>) =>
          react.createElement(
            tag,
            Object.fromEntries(
              Object.entries(props).filter(([key]) => !motion_props.has(key)),
            ),
          );

        plain.set(tag, render);

        return render;
      },
    },
  );

  return {
    ...actual,
    motion,
    AnimatePresence: ({ children }: { children?: ReactNode }) =>
      react.createElement(react.Fragment, null, children),
  };
});

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
  get_reset_second_factor_status: async () => ({
    data: {
      address: "alice@astermail.org",
      required: false,
      verified: true,
      totp: false,
      backup_codes: false,
      hardware_key: false,
    },
  }),
  get_reset_vault: async () => ({
    data: {
      encrypted_vault: stored_copy.sealed?.encrypted_vault ?? STORED_VAULT,
      vault_nonce: stored_copy.sealed?.vault_nonce ?? "stored-nonce",
      vault_version: 1,
      ...reset_vault_state,
    },
  }),
  reset_password_with_token: (...args: unknown[]) =>
    reset_password_mock(...args),
  get_reset_hardware_key_options: vi.fn(),
  verify_reset_hardware_key: vi.fn(),
  verify_reset_second_factor: vi.fn(),
}));

vi.mock("@/services/crypto/reset_vault_proof", () => ({
  derive_reset_vault_proof: async () => "vault-proof",
}));

vi.mock("@/services/crypto/reset_link_vault", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/crypto/reset_link_vault")
  >("@/services/crypto/reset_link_vault");

  return { ...actual, keep_vault_keys_through_reset: async () => kept_vault() };
});

vi.mock("@/services/crypto/backup_unlocked_keys", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/crypto/backup_unlocked_keys")
  >("@/services/crypto/backup_unlocked_keys");

  return {
    ...actual,
    build_backup_vault: async (vault: EncryptedVault) => vault,
  };
});

vi.mock("@/services/crypto/recovery_key", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/crypto/recovery_key")
  >("@/services/crypto/recovery_key");

  return {
    ...actual,
    encrypt_vault_backup: async () => ({
      encrypted_data: "backup",
      nonce: "backup-nonce",
      salt: "backup-salt",
    }),
    generate_all_recovery_shares: async () => [],
  };
});

vi.mock("@/services/crypto/key_manager", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/crypto/key_manager")
  >("@/services/crypto/key_manager");

  return {
    ...actual,
    decrypt_vault: (...args: Parameters<typeof actual.decrypt_vault>) =>
      stored_copy.sealed
        ? actual.decrypt_vault(...args)
        : Promise.resolve(kept_vault()),
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

const { default: ResetPasswordPage } = await import("./reset_password");
const { encrypt_vault } = await import(
  "@/services/crypto/key_manager_pgp_vault"
);

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const set_input_value = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  "value",
)!.set!;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function input_with(placeholder: string): HTMLInputElement {
  const input = container!.querySelector<HTMLInputElement>(
    `input[placeholder="${placeholder}"]`,
  );

  if (!input) throw new Error(`no input for ${placeholder}`);

  return input;
}

async function type_into(placeholder: string, value: string) {
  await act(async () => {
    const input = input_with(placeholder);

    set_input_value.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function reset_with_current_password() {
  window.history.replaceState(
    {},
    "",
    "/reset-password?token=reset-token&email=alice%40astermail.org",
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={["/reset-password"]}>
        <ResetPasswordPage />
      </MemoryRouter>,
    );
  });

  await vi.waitFor(() => input_with("auth.new_password_placeholder"));

  await type_into("auth.reset_current_password", CURRENT_PASSWORD);
  await type_into("auth.new_password_placeholder", NEW_PASSWORD);
  await type_into("auth.confirm_password_placeholder", NEW_PASSWORD);

  const submit = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.includes("auth.set_new_password"),
  );

  if (!submit) throw new Error("no submit button");

  await act(async () => {
    submit.click();
  });
  await vi.waitFor(() => expect(reset_password_mock).toHaveBeenCalled(), {
    timeout: 20000,
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("password reset keeps the stored vault work factor", () => {
  beforeEach(() => {
    reset_level2_state();
    note_current_vault_iterations(VAULT_KDF_ITERATIONS_LEGACY);
    delete reset_vault_state.vault_kdf_iterations;
    stored_copy.sealed = null;
    reset_password_mock.mockReset();
    reset_password_mock.mockResolvedValue({ data: { success: true } });
    prepare_calls.length = 0;
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("seals at the stored factor and sends it with the request", async () => {
    reset_vault_state.vault_kdf_iterations = VAULT_KDF_ITERATIONS_LEVEL2;

    await reset_with_current_password();

    expect(prepare_calls).toHaveLength(1);
    expect(prepare_calls[0][1]).toBe(NEW_PASSWORD);
    expect(prepare_calls[0][2]).toBe(VAULT_KDF_ITERATIONS_LEVEL2);
    expect(reset_password_mock).toHaveBeenCalledTimes(1);
    expect(reset_password_mock.mock.calls[0][18]).toBe(
      VAULT_KDF_ITERATIONS_LEVEL2,
    );
  }, 30000);

  it("leaves the signed-in account's factor alone", async () => {
    reset_vault_state.vault_kdf_iterations = VAULT_KDF_ITERATIONS_LEVEL2;

    await reset_with_current_password();

    expect(prepare_calls[0][3]).toBe(false);
    expect(get_current_vault_iterations()).toBe(VAULT_KDF_ITERATIONS_LEGACY);
  }, 30000);

  it("falls back to the factor the stored vault opened with", async () => {
    reset_vault_state.vault_kdf_iterations = VAULT_KDF_ITERATIONS_LEGACY;
    record_vault_kdf_iterations(STORED_VAULT, VAULT_KDF_ITERATIONS_LEVEL2);

    await reset_with_current_password();

    expect(prepare_calls[0][2]).toBe(VAULT_KDF_ITERATIONS_LEVEL2);
    expect(reset_password_mock.mock.calls[0][18]).toBe(
      VAULT_KDF_ITERATIONS_LEVEL2,
    );
  }, 30000);

  it("uses the legacy factor and names none for a legacy vault", async () => {
    reset_vault_state.vault_kdf_iterations = VAULT_KDF_ITERATIONS_LEGACY;

    await reset_with_current_password();

    expect(prepare_calls[0][2]).toBe(VAULT_KDF_ITERATIONS_LEGACY);
    expect(reset_password_mock.mock.calls[0][18]).toBeUndefined();
  }, 30000);
});

describe("password reset opens the stored vault for its own account", () => {
  beforeEach(() => {
    reset_level2_state();
    note_current_vault_iterations(VAULT_KDF_ITERATIONS_LEGACY);
    delete reset_vault_state.vault_kdf_iterations;
    reset_password_mock.mockReset();
    reset_password_mock.mockResolvedValue({ data: { success: true } });
    prepare_calls.length = 0;
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    stored_copy.sealed = null;
  });

  it("keeps the signed-in factor when the stored vault opens at the stronger factor", async () => {
    stored_copy.sealed = await encrypt_vault(
      kept_vault(),
      CURRENT_PASSWORD,
      VAULT_KDF_ITERATIONS_LEVEL2,
    );
    reset_vault_state.vault_kdf_iterations = VAULT_KDF_ITERATIONS_LEVEL2;
    reset_level2_state();
    note_current_vault_iterations(VAULT_KDF_ITERATIONS_LEGACY);

    await reset_with_current_password();

    expect(reset_password_mock).toHaveBeenCalledTimes(1);
    expect(prepare_calls[0][2]).toBe(VAULT_KDF_ITERATIONS_LEVEL2);
    expect(get_current_vault_iterations()).toBe(VAULT_KDF_ITERATIONS_LEGACY);
  }, 60000);
});
