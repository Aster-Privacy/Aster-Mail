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
const platform_state = { value: false };
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
  initiate_hardware_key_registration: vi.fn(),
  list_hardware_keys: vi.fn(async () => ({ data: { keys: [] } })),
  remove_hardware_key: vi.fn(),
  HardwareKeyInfo: {},
}));

vi.mock("@/services/api/passkeys", () => ({
  register_platform_passkey: vi.fn(),
  register_security_key: vi.fn(),
  is_passkey_supported: () => webauthn_state.value,
  is_platform_passkey_available: vi.fn(async () => platform_state.value),
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

describe("PasskeySection without a platform authenticator", () => {
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

  const button_labels = () =>
    Array.from(container.querySelectorAll("button")).map(
      (node) => node.textContent,
    );

  beforeEach(() => {
    desktop_state.value = false;
    webauthn_state.value = true;
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

  it("offers passkey creation when the browser reports no platform authenticator", async () => {
    platform_state.value = false;
    await render();

    expect(button_labels()).toContain("passkeys.add_passkey");
    expect(button_labels()).toContain("passkeys.add_security_key");
  });

  it("offers passkey creation when a platform authenticator is present", async () => {
    platform_state.value = true;
    await render();

    expect(button_labels()).toContain("passkeys.add_passkey");
  });

  it("offers no creation buttons without webauthn", async () => {
    webauthn_state.value = false;
    await render();

    expect(button_labels()).not.toContain("passkeys.add_passkey");
    expect(button_labels()).not.toContain("passkeys.add_security_key");
  });
});
