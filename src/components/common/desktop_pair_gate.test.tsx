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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const invoke_mock = vi.fn();
const login_mock = vi.fn();
const relogin_mock = vi.fn();
const consume_pending_mock = vi.fn();
const resume_mock = vi.fn();
const forget_mock = vi.fn();
const clear_session_mock = vi.fn();
const resolve_session_mock = vi.fn();
const update_device_id_mock = vi.fn();
const current_account_mock = vi.fn();
const locked_account_mock = vi.fn();
const settle_unlock_mock = vi.fn();

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("framer-motion", async () => {
  const react = await import("react");

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      react.createElement(react.Fragment, null, children),
    motion: {
      div: ({
        children,
        className,
      }: {
        children: React.ReactNode;
        className?: string;
      }) => react.createElement("div", { className }, children),
    },
  };
});

vi.mock("@/components/auth/auth_styles", () => ({
  Logo: () => null,
}));

vi.mock("@/components/ui/spinner", () => ({
  Spinner: () => null,
}));

vi.mock("@/hooks/mail_events", () => ({
  emit_auth_ready: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke_mock(...args),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ is_authenticated: false, login: login_mock }),
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account: async () => current_account_mock(),
  update_account_device_id: (...args: unknown[]) =>
    update_device_id_mock(...args),
}));

vi.mock("./desktop_code_sign_in", () => ({
  DesktopCodeSignIn: () => "pair_screen",
  resolve_device_login_session: (...args: unknown[]) =>
    resolve_session_mock(...args),
}));

vi.mock("@/components/mobile/app_lock", () => ({
  WebPinOverlay: ({
    account_id,
    on_sign_out,
  }: {
    account_id: string;
    on_sign_out: () => void;
  }) => (
    <button type="button" onClick={on_sign_out}>
      {`pin_overlay:${account_id}`}
    </button>
  ),
}));

vi.mock("@/services/app_lock_store", () => ({
  get_app_lock_config: () => ({ enabled: true, digits: 4 }),
}));

vi.mock("@/services/app_lock_wrap", () => ({
  settle_app_unlock: (...args: unknown[]) => settle_unlock_mock(...args),
}));

vi.mock("@/native/desktop_device_auth", () => ({
  is_tauri: () => true,
  locked_device_login_account_id: () => locked_account_mock(),
  init_desktop_device_auth: async () => undefined,
  consume_pending_device_login: () => consume_pending_mock(),
  relogin_with_retries: (...args: unknown[]) => relogin_mock(...args),
  resume_device_login_after_unlock: (...args: unknown[]) =>
    resume_mock(...args),
  forget_device_account: (...args: unknown[]) => forget_mock(...args),
  clear_device_session: (...args: unknown[]) => clear_session_mock(...args),
  clear_explicit_sign_out: () => undefined,
  take_explicit_sign_out: () => false,
}));

const { DesktopPairGate } = await import("./desktop_pair_gate");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const resumed_login = {
  login_response: { user_id: "account_1" },
  passphrase: "unlocked passphrase",
  device_id: "device_1",
};

const resolved_session = {
  user: { id: "account_1", username: "user", email: "user@example.test" },
  vault: {},
  passphrase: "unlocked passphrase",
  encrypted_vault: "vault",
  vault_nonce: "nonce",
  device_id: "device_1",
};

async function render_gate() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<DesktopPairGate>mail_app</DesktopPairGate>);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("desktop pair gate with a PIN locked device", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invoke_mock.mockResolvedValue({ device_id: "device_1" });
    consume_pending_mock.mockReturnValue(null);
    relogin_mock.mockResolvedValue("locked");
    forget_mock.mockResolvedValue(undefined);
    clear_session_mock.mockResolvedValue(undefined);
    update_device_id_mock.mockResolvedValue(undefined);
    login_mock.mockResolvedValue(undefined);
    resolve_session_mock.mockResolvedValue(resolved_session);
    current_account_mock.mockReturnValue({
      id: "account_1",
      device_id: "device_1",
    });
    locked_account_mock.mockReturnValue("account_1");
  });

  afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it("signs in with the unlocked passphrase instead of asking to link again", async () => {
    resume_mock.mockResolvedValue(resumed_login);

    await render_gate();

    expect(resume_mock).toHaveBeenCalledWith(
      "account_1",
      undefined,
      expect.any(Function),
    );
    expect(resolve_session_mock).toHaveBeenCalledWith(
      resumed_login.login_response,
      "unlocked passphrase",
      "device_1",
    );
    expect(login_mock).toHaveBeenCalledTimes(1);
    expect(update_device_id_mock).toHaveBeenCalledWith("account_1", "device_1");
    expect(forget_mock).not.toHaveBeenCalled();
    expect(clear_session_mock).not.toHaveBeenCalled();
    expect(container!.textContent).not.toContain("pair_screen");
  });

  it("keeps the pairing when the unlock does not finish", async () => {
    resume_mock.mockResolvedValue(null);

    await render_gate();

    expect(login_mock).not.toHaveBeenCalled();
    expect(forget_mock).not.toHaveBeenCalled();
    expect(clear_session_mock).not.toHaveBeenCalled();
    expect(container!.textContent).toContain("pair_screen");
  });

  it("offers a retry when signing in fails after the unlock", async () => {
    resume_mock.mockResolvedValue(resumed_login);
    login_mock.mockRejectedValue(new Error("offline"));

    await render_gate();

    expect(forget_mock).not.toHaveBeenCalled();
    expect(container!.textContent).toContain("common.retry");
    expect(container!.textContent).not.toContain("pair_screen");
  });

  it("unlocks with the signed in account when the account list cannot be read", async () => {
    current_account_mock.mockReturnValue(null);
    resume_mock.mockResolvedValue(resumed_login);

    await render_gate();

    expect(resume_mock).toHaveBeenCalledWith(
      "account_1",
      undefined,
      expect.any(Function),
    );
    expect(login_mock).toHaveBeenCalledTimes(1);
    expect(container!.textContent).not.toContain("pair_screen");
  });

  it("shows the PIN prompt itself while the device waits for an unlock", async () => {
    current_account_mock.mockReturnValue(null);
    let finish: (value: unknown) => void = () => undefined;

    resume_mock.mockImplementation(
      (account_id: string, _source: unknown, on_needed: (id: string) => void) =>
        new Promise((resolve) => {
          on_needed(account_id);
          finish = resolve;
        }),
    );
    settle_unlock_mock.mockImplementation(() => finish(null));

    await render_gate();

    const overlay = container!.querySelector("button");

    expect(container!.textContent).toContain("pin_overlay:account_1");
    expect(container!.textContent).not.toContain("pair_screen");

    await act(async () => {
      overlay!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(settle_unlock_mock).toHaveBeenCalledWith("account_1", false);
    expect(login_mock).not.toHaveBeenCalled();
    expect(container!.textContent).toContain("pair_screen");
  });

  it("still forgets a pairing the server rejects", async () => {
    relogin_mock.mockResolvedValue("rejected");

    await render_gate();

    expect(resume_mock).not.toHaveBeenCalled();
    expect(forget_mock).toHaveBeenCalledWith("device_1");
    expect(container!.textContent).toContain("pair_screen");
  });
});
