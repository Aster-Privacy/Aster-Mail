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

vi.mock("@/services/api/webauthn", () => ({
  list_hardware_keys: vi.fn(async () => ({ data: { keys: [] } })),
  initiate_hardware_key_registration: vi.fn(),
  perform_webauthn_registration: vi.fn(),
  remove_hardware_key: vi.fn(),
  is_webauthn_supported: () => true,
  HardwareKeyInfo: {},
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

vi.mock("@/components/ui/input", () => ({
  Input: (props: Record<string, unknown>) => <input {...(props as object)} />,
}));

vi.mock("@/components/ui/modal", () => ({
  Modal: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  ModalHeader: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  ModalTitle: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  ModalDescription: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  ModalBody: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  ModalFooter: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
}));

import { HardwareKeysSection } from "./hardware_keys_section";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("HardwareKeysSection desktop gate", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = async () => {
    await act(async () => {
      root.render(<HardwareKeysSection />);
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

  it("hides the add button and shows the desktop note on desktop", async () => {
    desktop_state.value = true;
    await render();

    const add_button = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("settings.add_security_key"),
    );

    expect(add_button).toBeUndefined();
    expect(container.textContent).toContain(
      "settings.security_keys_desktop_note",
    );
  });

  it("shows the add button and no desktop note on web", async () => {
    desktop_state.value = false;
    await render();

    const add_button = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("settings.add_security_key"),
    );

    expect(add_button).toBeDefined();
    expect(container.textContent).not.toContain(
      "settings.security_keys_desktop_note",
    );
  });
});
