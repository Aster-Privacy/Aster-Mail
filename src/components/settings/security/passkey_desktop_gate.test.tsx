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

vi.mock("@/native/invoke_bridge", () => ({
  is_desktop: () => desktop_state.value,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
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
  is_passkey_supported: () => true,
  is_platform_passkey_available: vi.fn(async () => false),
}));

vi.mock("@aster/ui", () => ({
  Button: ({
    children,
    onClick,
  }: {
    children?: unknown;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children as never}</button>,
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

import { PasskeySection } from "./passkey_section";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("PasskeySection desktop gate", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = async () => {
    await act(async () => {
      root.render(<PasskeySection />);
    });
  };

  beforeEach(() => {
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

  it("hides the desktop note on web", async () => {
    desktop_state.value = false;
    await render();

    expect(container.textContent).not.toContain(
      "settings.passkeys_desktop_note",
    );
  });
});
