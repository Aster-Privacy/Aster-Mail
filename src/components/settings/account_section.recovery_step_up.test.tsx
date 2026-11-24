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

const save_mock = vi.fn();
const derive_mock = vi.fn();

const stable = vi.hoisted(() => ({
  i18n: { t: (key: string) => key },
  auth: {
    user: { email: "robin@aster.cx", username: "robin" },
    update_user: async () => undefined,
    vault: { identity_key: "identity" },
  },
  preferences: {
    preferences: { profile_color: "#123456" },
    update_preference: () => undefined,
    reset_to_defaults: () => undefined,
  },
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => stable.i18n,
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => stable.auth,
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => stable.preferences,
}));

vi.mock("@/services/api/user", () => ({
  update_display_name: vi.fn(),
  update_profile_color: vi.fn(),
  fetch_my_badges: vi.fn(async () => ({ data: [] })),
  fetch_badge_preferences: vi.fn(async () => ({
    data: {
      active_badge_slug: null,
      show_badge_profile: false,
      show_badge_signature: false,
      show_badge_ring: false,
    },
  })),
  update_badge_preferences: vi.fn(),
}));

vi.mock("@/services/api/auth", () => ({
  get_inactivity_settings: vi.fn(async () => ({
    data: { inactivity_window_months: 24 },
  })),
  set_inactivity_settings: vi.fn(),
}));

vi.mock("@/services/api/primary_address", () => ({
  load_primary_address_eligibility: vi.fn(async () => ({ data: null })),
  primary_address_eligibility_failed: () => false,
  PRIMARY_ADDRESS_FEATURE_KEY: "primary_address",
}));

vi.mock("@/components/settings/change_primary_address_modal", () => ({
  ChangePrimaryAddressModal: () => null,
}));

vi.mock("@/services/api/recovery_email", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/api/recovery_email")
  >()),
  get_recovery_email: vi.fn(async () => ({
    data: { email: null, verified: false, exists: false, step_up_required: false },
  })),
  save_recovery_email: (...args: unknown[]) => save_mock(...args),
  resend_recovery_verification: vi.fn(),
  remove_recovery_email: vi.fn(),
}));

vi.mock("@/services/api/step_up", async (import_original) => ({
  ...(await import_original<typeof import("@/services/api/step_up")>()),
  derive_step_up_credentials: (password: string, code?: string) =>
    derive_mock(password, code),
  fetch_step_up_requirements: vi.fn(async () => ({ totp_required: false })),
}));

vi.mock("@/services/api/webauthn", () => ({
  list_hardware_keys: vi.fn(async () => ({ data: { keys: [] } })),
  perform_step_up_webauthn_assertion: vi.fn(),
}));

vi.mock("@/services/guard/sign_action", () => ({
  build_step_up_proof: vi.fn(),
  passkey_step_up_proof: vi.fn(),
}));

vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => ({ limits: null }),
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

vi.mock("@/components/ui/button", () => ({
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

vi.mock("@aster/ui", async (import_original) => ({
  ...(await import_original<typeof import("@aster/ui")>()),
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

import { AccountSection } from "./account_section";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

async function wait_until(predicate: () => boolean, timeout = 5000) {
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

function find_buttons(label: string): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll("button")).filter(
    (button) => button.textContent?.trim() === label,
  );
}

function recovery_input(): HTMLInputElement | null {
  return container.querySelector(
    'input[placeholder="common.enter_recovery_email"]',
  );
}

function password_input(): HTMLInputElement | null {
  return container.querySelector("#step-up-password");
}

async function click(button: HTMLButtonElement) {
  await act(async () => {
    button.click();
  });
}

async function open_recovery_modal_and_save(email: string) {
  await wait_until(() => find_buttons("common.add").length > 0);
  await click(find_buttons("common.add")[0]);
  await wait_until(() => recovery_input() !== null);
  set_input(recovery_input()!, email);
  const save = find_buttons("common.save");

  await click(save[save.length - 1]);
}

describe("AccountSection recovery email confirmation", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    save_mock.mockReset();
    derive_mock.mockReset();
    derive_mock.mockImplementation(async (_password: string, code?: string) => ({
      password_hash: "derived-hash",
      totp_code: code,
    }));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("asks for the password when the server requires confirmation and sends it on save", async () => {
    save_mock
      .mockResolvedValueOnce({
        data: { success: false },
        code: "FORBIDDEN",
        server_code: "STEP_UP_REQUIRED",
        error: "To make this change, confirm your password.",
      })
      .mockResolvedValueOnce({ data: { success: true } });

    await act(async () => {
      root.render(<AccountSection />);
    });

    await open_recovery_modal_and_save("new.address@example.com");

    await wait_until(() => password_input() !== null);
    expect(recovery_input()).toBeNull();
    expect(container.textContent).not.toContain(
      "To make this change, confirm your password.",
    );
    expect(save_mock).toHaveBeenCalledTimes(1);
    expect(save_mock.mock.calls[0][2]).toBeUndefined();

    set_input(password_input()!, "correct horse");
    const save = find_buttons("common.save");

    await click(save[save.length - 1]);

    await wait_until(() => save_mock.mock.calls.length === 2);
    expect(derive_mock).toHaveBeenCalledWith("correct horse", undefined);
    expect(save_mock.mock.calls[1][0]).toBe("new.address@example.com");
    expect(save_mock.mock.calls[1][2]).toEqual(
      expect.objectContaining({ password_hash: "derived-hash" }),
    );
    await wait_until(() => password_input() === null);
  });

  it("opens the confirmation when the server asks for an authenticator code", async () => {
    save_mock.mockResolvedValueOnce({
      data: { success: false },
      code: "VALIDATION_ERROR",
      server_code: "TOTP_REQUIRED",
      error: "Enter your authenticator code.",
    });

    await act(async () => {
      root.render(<AccountSection />);
    });

    await open_recovery_modal_and_save("new.address@example.com");

    await wait_until(() => password_input() !== null);
  });

  it("shows the server message for errors that do not need confirmation", async () => {
    save_mock.mockResolvedValueOnce({
      data: { success: false },
      code: "FORBIDDEN",
      server_code: "FORBIDDEN",
      error: "Recovery email changes are paused.",
    });

    await act(async () => {
      root.render(<AccountSection />);
    });

    await open_recovery_modal_and_save("new.address@example.com");

    await wait_until(() =>
      (container.textContent ?? "").includes(
        "Recovery email changes are paused.",
      ),
    );
    expect(password_input()).toBeNull();
  });
});
