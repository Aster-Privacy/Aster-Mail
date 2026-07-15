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
    limits: {
      limits: {
        max_alias_directories: { limit: 10, current: 4, is_at_limit: false },
      },
    },
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

vi.mock("@/components/modals/confirmation_modal", () => ({
  ConfirmationModal: ({
    is_open,
    on_confirm,
    on_cancel,
    title,
  }: {
    is_open: boolean;
    on_confirm: () => void;
    on_cancel: () => void;
    title: string;
  }) =>
    is_open ? (
      <div data-testid="confirm-modal">
        <span>{title}</span>
        <button onClick={on_confirm}>confirm-delete</button>
        <button onClick={on_cancel}>cancel-delete</button>
      </div>
    ) : null,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
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

const delete_alias_directory = vi.fn(async (_id?: string) => ({
  data: { success: true },
}));

const directories = [
  {
    id: "b",
    label: "banking",
    domain: "astermail.org",
    auto_create_enabled: false,
  },
  {
    id: "a",
    label: "alpha",
    domain: "astermail.org",
    auto_create_enabled: true,
  },
  {
    id: "c",
    label: "charity",
    domain: "astermail.org",
    auto_create_enabled: false,
  },
  {
    id: "d",
    label: "delta",
    domain: "astermail.org",
    auto_create_enabled: true,
  },
];

vi.mock("@/services/api/alias_directories", () => ({
  DIRECTORY_DOMAINS: ["astermail.org", "aster.cx"],
  list_alias_directories: vi.fn(async () => ({ data: { directories } })),
  decrypt_alias_directory: vi.fn(async (d: unknown) => d),
  create_alias_directory: vi.fn(),
  update_alias_directory: vi.fn(),
  delete_alias_directory: (id: string) => delete_alias_directory(id),
  check_directory_availability: vi.fn(async () => ({
    data: { available: true },
  })),
}));

vi.mock("@/services/api/domains", () => ({
  list_domains: vi.fn(async () => ({ data: { domains: [] } })),
}));

import { AliasDirectoriesSection } from "./alias_directories_section";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("AliasDirectoriesSection ordering and delete", () => {
  let container: HTMLDivElement;
  let root: Root;

  const flush = async () => {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  beforeEach(async () => {
    delete_alias_directory.mockClear();
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

  const rendered_labels = () =>
    Array.from(container.querySelectorAll("p.text-sm.font-medium"))
      .map((p) => p.textContent ?? "")
      .filter((txt) => txt.startsWith("anything."));

  const trash_buttons = () =>
    Array.from(container.querySelectorAll("button")).filter(
      (b) => b.querySelector("svg") && !(b.textContent ?? "").trim(),
    );

  it("orders active directories above disabled ones, stable within each group", () => {
    expect(rendered_labels()).toEqual([
      "anything.alpha@astermail.org",
      "anything.delta@astermail.org",
      "anything.banking@astermail.org",
      "anything.charity@astermail.org",
    ]);
  });

  it("asks for confirmation before deleting and does not delete on open", async () => {
    await act(async () => {
      trash_buttons()[0].click();
    });

    expect(
      container.querySelector('[data-testid="confirm-modal"]'),
    ).toBeTruthy();
    expect(container.textContent).toContain(
      "settings.alias_directory_delete_title",
    );
    expect(delete_alias_directory).not.toHaveBeenCalled();
  });

  it("deletes only after the confirmation is accepted", async () => {
    await act(async () => {
      trash_buttons()[0].click();
    });

    const confirm = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("confirm-delete"),
    );

    await act(async () => {
      confirm?.click();
    });
    await flush();

    expect(delete_alias_directory).toHaveBeenCalledTimes(1);
    expect(delete_alias_directory).toHaveBeenCalledWith("a");
  });

  it("does not delete when the confirmation is cancelled", async () => {
    await act(async () => {
      trash_buttons()[0].click();
    });

    const cancel = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("cancel-delete"),
    );

    await act(async () => {
      cancel?.click();
    });
    await flush();

    expect(delete_alias_directory).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="confirm-modal"]')).toBeNull();
  });
});
