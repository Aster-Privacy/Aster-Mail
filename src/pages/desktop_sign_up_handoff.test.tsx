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
import { MemoryRouter, Route, Routes } from "react-router-dom";

const open_external_mock = vi.fn();
const tauri_state = { enabled: true };
const invoke_mock = vi.fn();
const request_device_code_mock = vi.fn();
const poll_device_code_status_mock = vi.fn();

vi.mock("@/utils/open_link", () => ({
  open_external: (...args: unknown[]) => open_external_mock(...args),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke_mock(...args),
}));

vi.mock("@/native/desktop_device_auth", () => ({
  is_tauri: () => tauri_state.enabled,
  request_device_code: (...args: unknown[]) =>
    request_device_code_mock(...args),
  poll_device_code_status: (...args: unknown[]) =>
    poll_device_code_status_mock(...args),
  complete_device_pairing: vi.fn(),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

vi.mock("@/services/crypto/key_manager", () => ({
  decrypt_vault: vi.fn(),
}));

vi.mock("@/services/api/auth", () => ({
  get_user_info: vi.fn(),
}));

const { DesktopSignUpHandoff } = await import("./desktop_sign_up_handoff");
const { DesktopCodeSignIn } = await import(
  "@/components/common/desktop_code_sign_in"
);

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render_tree(node: React.ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(node);
  });
}

describe("desktop sign-up handoff", () => {
  beforeEach(() => {
    open_external_mock.mockClear();
    invoke_mock.mockReset();
    request_device_code_mock.mockReset();
    poll_device_code_status_mock.mockReset();
    invoke_mock.mockResolvedValue({
      ed25519_pk: "pk",
      x25519_pk: "xpk",
      device_id: null,
    });
    request_device_code_mock.mockResolvedValue({
      code: "ABCD-EFGH",
      expires_in: 600,
    });
    poll_device_code_status_mock.mockResolvedValue({ status: "pending" });
  });

  afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it("opens registration in the system browser and returns to sign-in", async () => {
    await render_tree(
      <MemoryRouter initialEntries={["/register?ref=friend"]}>
        <Routes>
          <Route element={<DesktopSignUpHandoff />} path="/register" />
          <Route
            element={<div data-testid="sign-in-route" />}
            path="/sign-in"
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(open_external_mock).toHaveBeenCalledWith(
      "https://app.astermail.org/register?ref=friend",
    );
    expect(
      container!.querySelector('[data-testid="sign-in-route"]'),
    ).not.toBeNull();
    expect(container!.querySelector("form")).toBeNull();
  });

  it("hands a family claim link to the browser as well", async () => {
    await render_tree(
      <MemoryRouter initialEntries={["/family/claim/tok-1"]}>
        <Routes>
          <Route
            element={<DesktopSignUpHandoff />}
            path="/family/claim/:token"
          />
          <Route
            element={<div data-testid="sign-in-route" />}
            path="/sign-in"
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(open_external_mock).toHaveBeenCalledWith(
      "https://app.astermail.org/family/claim/tok-1",
    );
    expect(
      container!.querySelector('[data-testid="sign-in-route"]'),
    ).not.toBeNull();
  });

  it("requests a code on the desktop sign-in screen and sends sign-up to the browser", async () => {
    await render_tree(<DesktopCodeSignIn on_signed_in={async () => {}} />);
    for (let i = 0; i < 50 && !container!.textContent?.includes("A"); i++) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
    }

    expect(invoke_mock).toHaveBeenCalledWith("device_get_pubkeys");
    expect(request_device_code_mock).toHaveBeenCalled();
    expect(container!.textContent).toContain("A");
    expect(container!.textContent).toContain("H");
    expect(container!.querySelector('input[type="password"]')).toBeNull();
    expect(container!.querySelector('a[href="/register"]')).toBeNull();

    const buttons = Array.from(container!.querySelectorAll("button"));
    const create_account = buttons.find(
      (button) => button.textContent === "auth.create_account",
    );

    expect(create_account).toBeDefined();

    await act(async () => {
      create_account!.click();
    });

    expect(open_external_mock).toHaveBeenCalledWith(
      "https://app.astermail.org/register",
    );
  });
});
