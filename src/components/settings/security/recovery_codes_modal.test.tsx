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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  RecoveryCodesModal,
  type RecoveryCodesModalMode,
} from "./recovery_codes_modal";

import { api_client } from "@/services/api/client";
import {
  save_recovery_backup,
  verify_codes_step_up,
} from "@/services/api/recovery";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";
import {
  hash_recovery_code,
  decrypt_recovery_key_with_code,
  decrypt_vault_backup,
} from "@/services/crypto/recovery_key";

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock("@/services/api/recovery", () => ({
  save_recovery_backup: vi.fn(),
  verify_codes_step_up: vi.fn(),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: vi.fn(),
  get_passphrase_from_memory: vi.fn(() => "correct horse battery staple"),
  store_vault_in_memory: vi.fn(),
}));

vi.mock("@/services/crypto/key_manager_pgp_vault", async (import_original) => ({
  ...((await import_original()) as object),
  encrypt_vault: vi.fn(async () => ({
    encrypted_vault: "encrypted-vault",
    vault_nonce: "vault-nonce",
  })),
}));

vi.mock("@/contexts/auth/session_passphrase", () => ({
  store_encrypted_vault: vi.fn(),
}));

vi.mock("@/services/crypto/recovery_pdf", () => ({
  generate_recovery_pdf: vi.fn(),
  download_recovery_text: vi.fn(),
  print_recovery_codes: vi.fn(),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: { id: "user-1", email: "test@astermail.org" } }),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

vi.mock("@/components/ui/modal", () => ({
  Modal: ({ is_open, children }: { is_open: boolean; children?: unknown }) =>
    is_open ? <div data-testid="modal">{children as never}</div> : null,
  ModalHeader: ({ children }: { children?: unknown }) => (
    <div>{children as never}</div>
  ),
  ModalTitle: ({ children }: { children?: unknown }) => (
    <h2>{children as never}</h2>
  ),
  ModalDescription: ({ children }: { children?: unknown }) => (
    <p>{children as never}</p>
  ),
  ModalBody: ({ children }: { children?: unknown }) => (
    <div>{children as never}</div>
  ),
  ModalFooter: ({ children }: { children?: unknown }) => (
    <div>{children as never}</div>
  ),
}));

vi.mock("@aster/ui", () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children?: unknown;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {children as never}
    </button>
  ),
}));

const mocked_get = vi.mocked(api_client.get);
const mocked_save = vi.mocked(save_recovery_backup);
const mocked_step_up = vi.mocked(verify_codes_step_up);
const mocked_vault = vi.mocked(get_vault_from_memory);

const vault_fixture = {
  identity_key: "identity-key-material",
  signed_prekey: "signed-prekey",
  signed_prekey_private: "signed-prekey-private",
  recovery_codes: [],
  data_kek: "data-kek-material",
  vault_format: 3,
};

let container: HTMLDivElement;
let root: Root;

function render_modal(
  props: { has_codes?: boolean; mode?: RecoveryCodesModalMode } = {},
) {
  act(() => {
    root.render(
      <RecoveryCodesModal
        is_open
        has_codes={props.has_codes ?? false}
        mode={props.mode ?? "regenerate"}
        on_close={() => {}}
        on_saved={() => {}}
      />,
    );
  });
}

async function wait_until(predicate: () => boolean, timeout = 15000) {
  const start = Date.now();

  while (!predicate()) {
    if (Date.now() - start > timeout) {
      throw new Error(`timed out waiting; content: ${container.textContent}`);
    }

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }
}

function set_input(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;

  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function find_button(label: string): HTMLButtonElement {
  const match = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.includes(label),
  );

  if (!match) throw new Error(`button not found: ${label}`);

  return match;
}

async function submit_password(label: string, value = "correct horse") {
  const password_input = container.querySelector(
    "#codes-current-password",
  ) as HTMLInputElement;

  expect(password_input).toBeTruthy();
  set_input(password_input, value);

  await act(async () => {
    find_button(label).click();
  });
}

describe("RecoveryCodesModal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocked_get.mockReset();
    mocked_save.mockReset();
    mocked_step_up.mockReset();
    mocked_vault.mockReset();
    mocked_vault.mockReturnValue(vault_fixture as never);
    mocked_get.mockResolvedValue({
      data: { salt: btoa("0123456789abcdef"), totp_required: false },
    } as never);
    mocked_step_up.mockResolvedValue({
      data: {
        step_up_token: "step-up-token",
        expires_at: new Date().toISOString(),
        codes: [],
      },
    } as never);
    mocked_save.mockResolvedValue({ data: { success: true } } as never);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("asks to confirm before replacing an existing set", () => {
    render_modal({ has_codes: true, mode: "regenerate" });
    expect(container.textContent).toContain(
      "settings.recovery_codes_regenerate_warning",
    );
  });

  it("goes straight to the step-up when no codes exist", () => {
    render_modal({ has_codes: false, mode: "regenerate" });
    expect(container.textContent).toContain(
      "settings.recovery_codes_confirm_title",
    );
    expect(container.textContent).not.toContain(
      "settings.recovery_codes_regenerate_warning",
    );
  });

  it("generates codes whose shares and backup restore the vault", async () => {
    vi.useRealTimers();
    render_modal();

    await submit_password("settings.recovery_codes_regenerate");
    await wait_until(() => mocked_save.mock.calls.length === 1);
    await wait_until(
      () => container.querySelectorAll(".font-mono").length === 10,
    );

    expect(mocked_step_up).toHaveBeenCalledWith(expect.any(String), undefined);

    const [encrypted_backup, backup_nonce, backup_salt, shares, options] =
      mocked_save.mock.calls[0];

    expect(shares).toHaveLength(10);
    expect(options).toMatchObject({
      step_up_token: "step-up-token",
      encrypted_vault: "encrypted-vault",
      vault_nonce: "vault-nonce",
    });

    const shown_codes = Array.from(
      container.querySelectorAll(".font-mono"),
    ).map((el) => el.textContent?.trim() ?? "");

    for (const code of shown_codes) {
      expect(code).toMatch(/^ASTER-/);
    }

    const first_code = shown_codes[0];
    const first_hash = await hash_recovery_code(first_code);
    const matching_share = shares.find(
      (share) => share.code_hash === first_hash,
    );

    expect(matching_share).toBeTruthy();

    const recovery_key = await decrypt_recovery_key_with_code(
      {
        encrypted_key: matching_share!.encrypted_recovery_key,
        nonce: matching_share!.recovery_key_nonce,
        salt: matching_share!.code_salt,
      },
      first_code,
    );

    const restored_vault = await decrypt_vault_backup(
      {
        encrypted_data: encrypted_backup,
        nonce: backup_nonce,
        salt: backup_salt,
      },
      recovery_key,
    );

    expect(restored_vault).toMatchObject({
      ...vault_fixture,
      recovery_codes: shown_codes,
    });
  });

  it("does not save when the step-up fails", async () => {
    vi.useRealTimers();
    mocked_step_up.mockResolvedValue({
      error: "settings.incorrect_password_error",
    } as never);
    render_modal();

    await submit_password("settings.recovery_codes_regenerate", "wrong");
    await wait_until(() =>
      (container.textContent ?? "").includes(
        "settings.incorrect_password_error",
      ),
    );

    expect(mocked_save).not.toHaveBeenCalled();
  });

  it("asks for a 2FA code when the account requires it", async () => {
    vi.useRealTimers();
    mocked_get.mockResolvedValue({
      data: { salt: btoa("0123456789abcdef"), totp_required: true },
    } as never);
    render_modal();

    await submit_password("settings.recovery_codes_regenerate");
    await wait_until(() => container.querySelector("#codes-totp-code") !== null);

    expect(mocked_step_up).not.toHaveBeenCalled();

    const totp_input = container.querySelector(
      "#codes-totp-code",
    ) as HTMLInputElement;

    set_input(totp_input, "123456");

    await act(async () => {
      find_button("settings.recovery_codes_regenerate").click();
    });
    await wait_until(() => mocked_save.mock.calls.length === 1);

    expect(mocked_step_up).toHaveBeenCalledWith(expect.any(String), "123456");
  });

  it("shows stored codes with used ones struck through", async () => {
    vi.useRealTimers();

    const stored = ["ASTER-AAAA-BBBB-CCCC-DDDD", "ASTER-EEEE-FFFF-GGGG-HHHH"];

    mocked_vault.mockReturnValue({
      ...vault_fixture,
      recovery_codes: stored,
    } as never);
    mocked_step_up.mockResolvedValue({
      data: {
        step_up_token: "step-up-token",
        expires_at: new Date().toISOString(),
        codes: [
          {
            code_hash: await hash_recovery_code(stored[1]),
            status: "used",
            used_at: new Date().toISOString(),
          },
        ],
      },
    } as never);
    render_modal({ has_codes: true, mode: "show" });

    await submit_password("settings.recovery_codes_show");
    await wait_until(
      () => container.querySelectorAll(".font-mono").length === 2,
    );

    const rendered = Array.from(container.querySelectorAll(".font-mono"));

    expect(mocked_save).not.toHaveBeenCalled();
    expect(rendered[0].className).not.toContain("line-through");
    expect(rendered[1].className).toContain("line-through");
  });

  it("reports when stored codes are not on this device", async () => {
    vi.useRealTimers();
    render_modal({ has_codes: true, mode: "show" });

    await submit_password("settings.recovery_codes_show");
    await wait_until(() =>
      (container.textContent ?? "").includes(
        "settings.recovery_codes_unavailable",
      ),
    );

    expect(mocked_save).not.toHaveBeenCalled();
  });
});
