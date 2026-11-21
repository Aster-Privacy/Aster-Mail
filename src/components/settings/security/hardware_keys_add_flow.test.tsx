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

const registration_options = {
  challenge: "AAAA",
  challenge_token: "token",
  rp: { name: "Aster", id: "app.astermail.org" },
  user: { id: "user", name: "fate", displayName: "fate" },
  pubKeyCredParams: [{ type: "public-key", alg: -7 }],
  timeout: 60000,
  attestation: "none",
  authenticatorSelection: {
    residentKey: "discouraged",
    userVerification: "preferred",
  },
  excludeCredentials: [{ type: "public-key", id: "AQID" }],
};

const initiate_mock = vi.fn();
const perform_mock = vi.fn();
const toast_mock = vi.fn();

vi.mock("@/native/invoke_bridge", () => ({
  is_desktop: () => false,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/services/api/webauthn", () => ({
  list_hardware_keys: vi.fn(async () => ({ data: { keys: [] } })),
  initiate_hardware_key_registration: (proof?: unknown) => initiate_mock(proof),
  perform_webauthn_registration: (options: unknown, name: unknown) =>
    perform_mock(options, name),
  remove_hardware_key: vi.fn(),
  rename_hardware_key: vi.fn(),
  is_webauthn_supported: () => true,
  HardwareKeyInfo: {},
}));

vi.mock("@/services/api/webauthn_errors", () => ({
  SECURITY_KEY_PROMPT_ERROR: "security_key_prompt_error",
}));

vi.mock("@/services/api/step_up", () => ({
  STEP_UP_REQUIRED_CODE: "step_up_required",
  is_reauth_required: (code?: string) => code === "step_up_required",
  to_reauth_proof: (credentials: unknown) => credentials,
}));

vi.mock("@/components/settings/step_up_modal", () => ({
  StepUpModal: ({
    is_open,
    on_confirm,
    security_key_hint,
  }: {
    is_open: boolean;
    on_confirm: (credentials: unknown) => Promise<void>;
    security_key_hint?: string;
  }) =>
    is_open && security_key_hint ? (
      <div>
        <p>{security_key_hint}</p>
        <button onClick={() => void on_confirm({ password_hash: "hash" })}>
          step_up_confirm
        </button>
      </div>
    ) : null,
}));

vi.mock("@/components/email/inbox/inbox_confirmation_dialog", () => ({
  ConfirmModal: () => null,
}));

vi.mock("@aster/ui", async (import_original) => ({
  ...(await import_original<typeof import("@aster/ui")>()),
  Button: ({
    children,
    onClick,
  }: {
    children?: unknown;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children as never}</button>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children?: unknown;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {children as never}
    </button>
  ),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: (message: string, kind: string) => toast_mock(message, kind),
}));

vi.mock("@/components/ui/input", () => ({
  Input: () => <input />,
}));

vi.mock("@/components/ui/modal", () => ({
  Modal: ({ children, is_open }: { children?: unknown; is_open?: boolean }) =>
    is_open ? <div>{children as never}</div> : null,
  ModalHeader: ({ children }: { children?: unknown }) => (
    <div>{children as never}</div>
  ),
  ModalTitle: ({ children }: { children?: unknown }) => (
    <div>{children as never}</div>
  ),
  ModalDescription: ({ children }: { children?: unknown }) => (
    <div>{children as never}</div>
  ),
  ModalBody: ({ children }: { children?: unknown }) => (
    <div>{children as never}</div>
  ),
  ModalFooter: ({ children }: { children?: unknown }) => (
    <div>{children as never}</div>
  ),
}));

import { HardwareKeysSection } from "./hardware_keys_section";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("HardwareKeysSection add flow", () => {
  let container: HTMLDivElement;
  let root: Root;

  const click = async (label: string) => {
    const button = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes(label),
    );

    expect(button).toBeDefined();
    await act(async () => {
      button!.click();
    });
  };

  const reach_confirmed_step = async () => {
    await act(async () => {
      root.render(<HardwareKeysSection />);
    });
    await click("settings.add_security_key");
    await click("common.continue");
    await click("step_up_confirm");
  };

  beforeEach(() => {
    initiate_mock.mockReset();
    perform_mock.mockReset();
    toast_mock.mockReset();
    initiate_mock.mockImplementation(async (proof?: unknown) =>
      proof
        ? { data: registration_options }
        : { error: "confirm", server_code: "step_up_required" },
    );
    perform_mock.mockResolvedValue({
      data: { key_id: "key_2", success: true },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("asks for an existing key before the new one", async () => {
    await act(async () => {
      root.render(<HardwareKeysSection />);
    });
    await click("settings.add_security_key");

    expect(container.textContent).toContain("settings.name_your_key");

    await click("common.continue");

    expect(container.textContent).toContain(
      "common.security_key_add_step_up_hint",
    );
    expect(perform_mock).not.toHaveBeenCalled();
  });

  it("waits for a second click before it prompts for the new key", async () => {
    await reach_confirmed_step();

    expect(initiate_mock).toHaveBeenCalledTimes(2);
    expect(initiate_mock.mock.calls[1][0]).toEqual({ password_hash: "hash" });
    expect(perform_mock).not.toHaveBeenCalled();
    expect(container.textContent).toContain("common.security_key_add_ready");
    expect(container.textContent).not.toContain(
      "common.security_key_add_step_up_hint",
    );

    await click("common.continue");

    expect(perform_mock).toHaveBeenCalledTimes(1);
    expect(perform_mock.mock.calls[0][0]).toBe(registration_options);
    expect(initiate_mock).toHaveBeenCalledTimes(2);
    expect(toast_mock).toHaveBeenCalledWith(
      "settings.security_key_registered",
      "success",
    );
    expect(container.textContent).not.toContain(
      "common.security_key_add_ready",
    );
  });

  it("lets you retry the new key after a prompt error", async () => {
    perform_mock.mockResolvedValueOnce({
      error: "prompt_error_text",
      server_code: "security_key_prompt_error",
    });
    await reach_confirmed_step();
    await click("common.continue");

    expect(toast_mock).toHaveBeenCalledWith("prompt_error_text", "error");
    expect(container.textContent).toContain("common.security_key_add_ready");

    await click("common.continue");

    expect(perform_mock).toHaveBeenCalledTimes(2);
    expect(initiate_mock).toHaveBeenCalledTimes(2);
  });

  it("asks you to confirm again after a server error", async () => {
    perform_mock.mockResolvedValueOnce({ error: "server_error_text" });
    await reach_confirmed_step();
    await click("common.continue");

    expect(toast_mock).toHaveBeenCalledWith("server_error_text", "error");
    expect(container.textContent).toContain("settings.name_your_key");
    expect(container.textContent).not.toContain(
      "common.security_key_add_ready",
    );
  });

  it("asks you to confirm again when the confirmation is too old", async () => {
    await reach_confirmed_step();

    const now = Date.now();
    const now_spy = vi.spyOn(Date, "now").mockReturnValue(now + 101_000);

    await click("common.continue");
    now_spy.mockRestore();

    expect(perform_mock).not.toHaveBeenCalled();
    expect(toast_mock).toHaveBeenCalledWith(
      "common.security_key_confirmation_expired",
      "error",
    );
    expect(container.textContent).toContain(
      "common.security_key_add_step_up_hint",
    );
  });
});
