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
const request_device_code_mock = vi.fn();
const poll_device_code_status_mock = vi.fn();
const complete_device_pairing_mock = vi.fn();
const show_toast_mock = vi.fn();

vi.mock("@/utils/open_link", () => ({
  open_external: vi.fn(),
}));

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

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke_mock(...args),
}));

vi.mock("@/native/desktop_device_auth", () => ({
  request_device_code: (...args: unknown[]) =>
    request_device_code_mock(...args),
  poll_device_code_status: (...args: unknown[]) =>
    poll_device_code_status_mock(...args),
  complete_device_pairing: (...args: unknown[]) =>
    complete_device_pairing_mock(...args),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: (...args: unknown[]) => show_toast_mock(...args),
}));

vi.mock("@/services/crypto/key_manager", () => ({
  decrypt_vault: vi.fn(),
}));

vi.mock("@/services/api/auth", () => ({
  get_user_info: vi.fn(),
}));

const { DesktopCodeSignIn } = await import("./desktop_code_sign_in");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render_sign_in() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<DesktopCodeSignIn on_signed_in={async () => {}} />);
  });
  await advance(100);
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("desktop code sign-in", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invoke_mock.mockReset();
    request_device_code_mock.mockReset();
    poll_device_code_status_mock.mockReset();
    complete_device_pairing_mock.mockReset();
    show_toast_mock.mockReset();
    invoke_mock.mockResolvedValue({
      ed25519_pk: "pk",
      mlkem_pk: "mpk",
      x25519_pk: "xpk",
      machine_name: "desk",
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
    vi.useRealTimers();
  });

  it("keeps the code on screen for its whole lifetime", async () => {
    await render_sign_in();
    await advance(590_000);

    expect(container!.textContent).toContain("auth.device_code_title");
    expect(container!.textContent).not.toContain("auth.device_code_expired");
    expect(poll_device_code_status_mock.mock.calls.length).toBeGreaterThan(60);
  });

  it("keeps polling after a failed status request", async () => {
    poll_device_code_status_mock
      .mockRejectedValueOnce(new Error("device_code_status_unavailable"))
      .mockRejectedValueOnce(new Error("device_code_status_unavailable"));

    await render_sign_in();
    await advance(20_000);

    expect(container!.textContent).toContain("auth.device_code_title");
    expect(poll_device_code_status_mock.mock.calls.length).toBeGreaterThan(2);
  });

  it("expires when the code runs out and stops polling", async () => {
    await render_sign_in();
    await advance(601_000);

    expect(container!.textContent).toContain("auth.device_code_expired");

    const calls_at_expiry = poll_device_code_status_mock.mock.calls.length;

    await advance(60_000);

    expect(poll_device_code_status_mock.mock.calls.length).toBe(
      calls_at_expiry,
    );
  });

  it("expires when the server reports the code as expired", async () => {
    poll_device_code_status_mock.mockResolvedValue({ status: "expired" });

    await render_sign_in();
    await advance(4_000);

    expect(container!.textContent).toContain("auth.device_code_expired");
  });

  it("requests a fresh code after expiry", async () => {
    poll_device_code_status_mock.mockResolvedValueOnce({ status: "expired" });

    await render_sign_in();
    await advance(4_000);

    const get_new = Array.from(container!.querySelectorAll("button")).find(
      (button) => button.textContent === "auth.device_code_get_new",
    );

    await act(async () => {
      get_new!.click();
    });
    await advance(100);

    expect(request_device_code_mock).toHaveBeenCalledTimes(2);
    expect(container!.textContent).toContain("auth.device_code_title");
  });

  it("copies the code with a toast and leaves the button label alone", async () => {
    await render_sign_in();

    const copy = Array.from(container!.querySelectorAll("button")).find(
      (button) => button.textContent === "auth.device_code_copy",
    );

    await act(async () => {
      copy!.click();
    });
    await advance(100);

    expect(invoke_mock).toHaveBeenCalledWith(
      "plugin:clipboard-manager|write_text",
      { text: "ABCDEFGH" },
    );
    expect(show_toast_mock).toHaveBeenCalledWith(
      "common.copied_to_clipboard",
      "success",
    );
    expect(copy!.textContent).toBe("auth.device_code_copy");
  });
});
