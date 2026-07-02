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

const stable_i18n = { t: (k: string) => k };

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => stable_i18n,
}));

vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => ({
    is_feature_locked: () => false,
    is_loading: false,
  }),
}));

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));

vi.mock("@/components/settings/settings_skeleton", () => ({
  SettingsSkeleton: () => null,
}));

vi.mock("@/components/settings/aliases/feature_lock", () => ({
  FeatureLockOverlay: () => null,
}));

vi.mock("@/components/settings/aliases/info_hint", () => ({
  InfoHint: () => null,
}));

vi.mock("@/components/auth/turnstile_widget", () => ({
  TurnstileWidget: () => null,
  TURNSTILE_SITE_KEY: "",
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: () => null,
}));

vi.mock("@aster/ui", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button data-disabled={disabled ? "true" : "false"} onClick={onClick}>
      {children}
    </button>
  ),
  Switch: () => null,
}));

const check_directory_availability = vi.fn();

vi.mock("@/services/api/alias_directories", () => ({
  DIRECTORY_DOMAIN: "astermail.org",
  list_alias_directories: vi.fn(async () => ({ data: { directories: [] } })),
  decrypt_alias_directory: vi.fn(),
  create_alias_directory: vi.fn(),
  update_alias_directory: vi.fn(),
  delete_alias_directory: vi.fn(),
  check_directory_availability: (key: string) =>
    check_directory_availability(key),
}));

import { AliasDirectoriesSection } from "./alias_directories_section";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("AliasDirectoriesSection availability", () => {
  let container: HTMLDivElement;
  let root: Root;

  const flush = async () => {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  const wait_debounce = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 650));
    });
    await flush();
  };

  beforeEach(async () => {
    check_directory_availability.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<AliasDirectoriesSection />);
    });
    await flush();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  const type_key = async (value: string) => {
    const input = container.querySelector("input") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(input),
      "value",
    )!.set!;

    await act(async () => {
      setter.call(input, value);
      input.dispatchEvent(new window.InputEvent("input", { bubbles: true }));
    });
  };

  it("shows the available message when the key is free", async () => {
    check_directory_availability.mockResolvedValue({
      data: { available: true },
    });

    await type_key("shopping");
    await wait_debounce();

    expect(check_directory_availability).toHaveBeenCalledWith("shopping");
    expect(container.textContent).toContain("settings.alias_directory_available");
    expect(container.textContent).not.toContain(
      "settings.alias_directory_not_available",
    );
  });

  it("shows the taken message and disables create when the key is taken", async () => {
    check_directory_availability.mockResolvedValue({
      data: { available: false },
    });

    await type_key("taken");
    await wait_debounce();

    expect(container.textContent).toContain(
      "settings.alias_directory_not_available",
    );

    const create_button = Array.from(
      container.querySelectorAll("button"),
    ).find((b) => b.textContent?.includes("settings.alias_directory_create"));

    expect(create_button?.getAttribute("data-disabled")).toBe("true");
  });

  it("renders the full-address preview while typing", async () => {
    check_directory_availability.mockResolvedValue({
      data: { available: true },
    });

    await type_key("shop");
    await flush();

    expect(container.textContent).toContain("anything.shop@astermail.org");
  });
});
