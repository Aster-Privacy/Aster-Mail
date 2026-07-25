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
    "aria-label": aria_label,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    "aria-label"?: string;
  }) => (
    <button
      aria-label={aria_label}
      data-disabled={disabled ? "true" : "false"}
      onClick={onClick}
    >
      {children}
    </button>
  ),
  Switch: () => null,
}));

const check_directory_availability = vi.fn();
const create_alias_directory = vi.fn();
const list_alias_directories = vi.fn(async () => ({
  data: { directories: [] },
}));
const list_deleted_alias_directories = vi.fn(
  async (): Promise<{
    data: { directories: Record<string, unknown>[]; total: number };
  }> => ({ data: { directories: [], total: 0 } }),
);
const restore_alias_directory = vi.fn();
const purge_deleted_alias_directory = vi.fn();
const empty_deleted_alias_directories = vi.fn();
const list_domains = vi.fn(async () => ({
  data: {
    domains: [
      { id: "d1", domain_name: "example.com", status: "active" },
      { id: "d2", domain_name: "pending.com", status: "pending" },
    ],
    total: 2,
    max_domains: 5,
  },
}));

vi.mock("@/services/api/alias_directories", () => ({
  DIRECTORY_DOMAINS: ["astermail.org", "aster.cx"],
  list_alias_directories: () => list_alias_directories(),
  decrypt_alias_directory: vi.fn(),
  create_alias_directory: (...args: unknown[]) =>
    create_alias_directory(...args),
  update_alias_directory: vi.fn(),
  delete_alias_directory: vi.fn(),
  check_directory_availability: (key: string, domain: string) =>
    check_directory_availability(key, domain),
  list_deleted_alias_directories: () => list_deleted_alias_directories(),
  restore_alias_directory: (id: string) => restore_alias_directory(id),
  purge_deleted_alias_directory: (id: string) =>
    purge_deleted_alias_directory(id),
  empty_deleted_alias_directories: () => empty_deleted_alias_directories(),
  decrypt_deleted_alias_directory: vi.fn(
    async (d: { label?: string }, fallback: string) => ({
      ...d,
      label: (d as { plain_label?: string }).plain_label ?? fallback,
    }),
  ),
}));

vi.mock("@/components/modals/confirmation_modal", () => ({
  ConfirmationModal: ({
    is_open,
    on_confirm,
  }: {
    is_open: boolean;
    on_confirm: () => void;
  }) =>
    is_open ? (
      <button data-testid="confirm-modal" onClick={on_confirm}>
        confirm
      </button>
    ) : null,
}));

vi.mock("@/components/ui/spinner", () => ({
  Spinner: () => null,
}));

vi.mock("@/services/api/domains", () => ({
  list_domains: () => list_domains(),
}));

import { AliasDirectoriesSection } from "./alias_directories_section";

declare global {
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
    create_alias_directory.mockReset();
    list_alias_directories.mockClear();
    list_deleted_alias_directories.mockClear();
    restore_alias_directory.mockReset();
    purge_deleted_alias_directory.mockReset();
    empty_deleted_alias_directories.mockReset();
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

    expect(check_directory_availability).toHaveBeenCalledWith(
      "shopping",
      "astermail.org",
    );
    expect(container.textContent).toContain(
      "settings.alias_directory_available",
    );
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

    const create_button = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("settings.alias_directory_create"),
    );

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

  it("offers default and active custom domains, not pending ones", async () => {
    expect(container.textContent).toContain("@astermail.org");
    expect(container.textContent).toContain("@aster.cx");
    expect(container.textContent).toContain("@example.com");
    expect(container.textContent).not.toContain("@pending.com");
  });

  it("creates with the selected domain", async () => {
    check_directory_availability.mockResolvedValue({
      data: { available: true },
    });
    create_alias_directory.mockResolvedValue({
      data: { id: "1", success: true },
    });

    await type_key("shopping");
    await wait_debounce();

    const create_button = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("settings.alias_directory_create"),
    );

    await act(async () => {
      create_button?.click();
    });
    await flush();

    expect(create_alias_directory).toHaveBeenCalledWith(
      "shopping",
      "astermail.org",
      true,
      undefined,
      undefined,
    );
  });

  it("hides the recently deleted section when trash is empty", async () => {
    expect(list_deleted_alias_directories).toHaveBeenCalled();
    expect(container.textContent).not.toContain(
      "settings.recently_deleted_directories_title",
    );
  });

  it("keeps the key input wide enough to read and lets the row wrap", () => {
    const input = container.querySelector("input") as HTMLInputElement;

    expect(input.className).toContain("min-w-[180px]");
    expect(input.className).not.toContain("min-w-0");
    expect(input.parentElement?.className).toContain("flex-wrap");
  });
});

describe("AliasDirectoriesSection recently deleted", () => {
  let container: HTMLDivElement;
  let root: Root;

  const flush = async () => {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  const trash_entry = {
    id: "del-1",
    directory_hash: "aGFzaA==",
    domain: "astermail.org",
    deleted_at: "2026-07-18T10:00:00Z",
    plain_label: "shopping",
  };

  beforeEach(async () => {
    check_directory_availability.mockReset();
    list_alias_directories.mockClear();
    list_deleted_alias_directories.mockReset();
    restore_alias_directory.mockReset();
    purge_deleted_alias_directory.mockReset();
    empty_deleted_alias_directories.mockReset();
    list_deleted_alias_directories.mockResolvedValue({
      data: { directories: [trash_entry], total: 1 },
    });
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

  const expand_trash = async () => {
    const toggle = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("settings.recently_deleted_directories_title"),
    );

    await act(async () => {
      toggle?.click();
    });
    await flush();
  };

  it("lists trashed directories with their decrypted label", async () => {
    expect(container.textContent).toContain(
      "settings.recently_deleted_directories_title",
    );

    await expand_trash();

    expect(container.textContent).toContain("anything.shopping@astermail.org");
  });

  it("restores a trashed directory and reloads the active list", async () => {
    restore_alias_directory.mockResolvedValue({
      data: { id: "dir-1", success: true },
    });

    await expand_trash();

    const initial_loads = list_alias_directories.mock.calls.length;
    const restore_button = Array.from(
      container.querySelectorAll("button"),
    ).find((b) => b.textContent?.includes("settings.restore_alias_action"));

    await act(async () => {
      restore_button?.click();
    });
    await flush();

    expect(restore_alias_directory).toHaveBeenCalledWith("del-1");
    expect(list_alias_directories.mock.calls.length).toBeGreaterThan(
      initial_loads,
    );
    expect(container.textContent).not.toContain(
      "anything.shopping@astermail.org",
    );
  });

  it("purges a trashed directory after confirmation", async () => {
    purge_deleted_alias_directory.mockResolvedValue({
      data: { status: "purged" },
    });

    await expand_trash();

    const purge_button = Array.from(container.querySelectorAll("button")).find(
      (b) =>
        b.getAttribute("aria-label") ===
        "settings.delete_alias_permanently_action",
    );

    await act(async () => {
      purge_button?.click();
    });
    await flush();

    const confirm = container.querySelector(
      '[data-testid="confirm-modal"]',
    ) as HTMLButtonElement;

    await act(async () => {
      confirm?.click();
    });
    await flush();

    expect(purge_deleted_alias_directory).toHaveBeenCalledWith("del-1");
    expect(container.textContent).not.toContain(
      "anything.shopping@astermail.org",
    );
  });

  it("empties the trash after confirmation", async () => {
    empty_deleted_alias_directories.mockResolvedValue({
      data: { status: "emptied", count: 1 },
    });

    await expand_trash();

    const empty_button = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("settings.recently_deleted_empty_trash"),
    );

    await act(async () => {
      empty_button?.click();
    });
    await flush();

    const confirm = container.querySelector(
      '[data-testid="confirm-modal"]',
    ) as HTMLButtonElement;

    await act(async () => {
      confirm?.click();
    });
    await flush();

    expect(empty_deleted_alias_directories).toHaveBeenCalled();
    expect(container.textContent).not.toContain(
      "anything.shopping@astermail.org",
    );
  });
});
