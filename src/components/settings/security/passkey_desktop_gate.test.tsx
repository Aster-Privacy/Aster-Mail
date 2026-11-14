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

const desktop_state = { value: false };
const webauthn_state = { value: true };
const open_external_mock = vi.fn();

vi.mock("@/native/invoke_bridge", () => ({
  is_desktop: () => desktop_state.value,
}));

vi.mock("@/utils/open_link", () => ({
  open_external: (url: string) => open_external_mock(url),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
  use_translation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: { username: "fate" } }),
}));

vi.mock("@/contexts/auth/session_passphrase", () => ({
  get_session_passphrase: () => "pass",
}));

vi.mock("@/services/api/webauthn", () => ({
  list_hardware_keys: vi.fn(async () => ({ data: { keys: [] } })),
  remove_hardware_key: vi.fn(),
  HardwareKeyInfo: {},
}));

vi.mock("@/services/api/passkeys", () => ({
  register_platform_passkey: vi.fn(),
  register_security_key: vi.fn(),
  is_passkey_supported: () => webauthn_state.value,
  is_platform_passkey_available: vi.fn(async () => false),
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
  Badge: ({ children }: { children?: unknown }) => (
    <span>{children as never}</span>
  ),
  Tooltip: ({ children }: { children?: unknown }) => (
    <span>{children as never}</span>
  ),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

import { PasskeySection } from "./passkey_section";

import { SettingsCacheProvider } from "@/contexts/settings_cache_context";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("PasskeySection desktop gate", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = async () => {
    await act(async () => {
      root.render(
        <SettingsCacheProvider>
          <PasskeySection />
        </SettingsCacheProvider>,
      );
    });
  };

  beforeEach(() => {
    webauthn_state.value = true;
    open_external_mock.mockClear();
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

  it("shows the desktop note on desktop", async () => {
    desktop_state.value = true;
    await render();

    expect(container.textContent).toContain("settings.passkeys_desktop_note");
  });

  it("shows the desktop note instead of the browser warning without webauthn", async () => {
    desktop_state.value = true;
    webauthn_state.value = false;
    await render();

    expect(container.textContent).toContain("settings.passkeys_desktop_note");
    expect(container.textContent).not.toContain("passkeys.not_supported");
  });

  it("opens security settings in the browser from the desktop note", async () => {
    desktop_state.value = true;
    webauthn_state.value = false;
    await render();

    const button = Array.from(container.querySelectorAll("button")).find(
      (node) => node.textContent === "settings.passkeys_open_in_browser",
    );

    expect(button).toBeDefined();
    await act(async () => {
      button?.click();
    });
    expect(open_external_mock).toHaveBeenCalledWith("/settings/security");
  });

  it("keeps the browser warning on web without webauthn", async () => {
    desktop_state.value = false;
    webauthn_state.value = false;
    await render();

    expect(container.textContent).toContain("passkeys.not_supported");
    expect(container.textContent).not.toContain(
      "settings.passkeys_open_in_browser",
    );
  });

  it("hides the desktop note on web", async () => {
    desktop_state.value = false;
    await render();

    expect(container.textContent).not.toContain(
      "settings.passkeys_desktop_note",
    );
  });
});
