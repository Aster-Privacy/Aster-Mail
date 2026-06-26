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

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  plan_state: {
    limits: { limits: { has_folder_retention: { limit: 1 } } } as {
      limits: Record<string, { limit: number }>;
    } | null,
    is_loading: false,
  },
  folders: [
    { folder_token: "AAEC", name: "Newsletters", is_system: false },
    { folder_token: "SYS1", name: "Inbox", is_system: true },
  ],
  api: {
    list_retention_policies: vi.fn(),
    create_retention_policy: vi.fn(),
    update_retention_policy: vi.fn(),
    delete_retention_policy: vi.fn(),
    preview_retention_policy: vi.fn(),
  },
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
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
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Switch: ({
    checked,
    onCheckedChange,
  }: {
    checked: boolean;
    onCheckedChange: (v: boolean) => void;
  }) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange(e.currentTarget.checked)}
    />
  ),
}));

vi.mock("@/components/ui/modal", () => ({
  Modal: ({
    is_open,
    children,
  }: {
    is_open: boolean;
    children: React.ReactNode;
  }) => (is_open ? <div data-testid="modal">{children}</div> : null),
  ModalHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    disabled,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    disabled?: boolean;
    children: React.ReactNode;
  }) => (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onValueChange(e.currentTarget.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => <option value={value}>{children}</option>,
}));

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));
vi.mock("@/components/settings/search_context", () => ({
  use_register_search_items: () => {},
}));
vi.mock("@/hooks/use_folders", () => ({
  use_folders: () => ({
    state: { folders: h.folders, is_loading: false },
    fetch_folders: () => {},
    get_folder_by_token: (tok: string) =>
      h.folders.find((f) => f.folder_token === tok),
  }),
}));
vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => h.plan_state,
}));
vi.mock("@/services/api/retention_policies", () => h.api);

import { FolderRetentionSection } from "./folder_retention_section";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  h.plan_state = {
    limits: { limits: { has_folder_retention: { limit: 1 } } },
    is_loading: false,
  };
  h.api.list_retention_policies.mockResolvedValue({ data: [] });
  h.api.preview_retention_policy.mockResolvedValue({ data: 0 });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function render() {
  act(() => {
    root.render(<FolderRetentionSection />);
  });
  await flush();
  act(() => {});
}

async function click_button_containing(text: string) {
  const btn = Array.from(container.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes(text),
  ) as HTMLButtonElement | undefined;
  if (!btn) throw new Error(`button containing "${text}" not found`);
  act(() => {
    btn.click();
  });
  await flush();
  act(() => {});
}

async function set_select(value: string) {
  const sel = container.querySelector("select") as HTMLSelectElement;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    "value",
  )!.set!;
  act(() => {
    setter.call(sel, value);
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await flush();
  act(() => {});
}

describe("FolderRetentionSection", () => {
  it("lists existing policies and resolves the folder name", async () => {
    h.api.list_retention_policies.mockResolvedValue({
      data: [
        {
          id: "p1",
          folder_token: "AAEC",
          retention_days: 30,
          delete_mode: "trash",
          enabled: true,
          last_swept_at: null,
          created_at: "",
          updated_at: "",
        },
      ],
    });
    await render();
    const text = container.textContent ?? "";
    expect(text).toContain("Newsletters");
    expect(text).toContain("folder_retention.summary_older_than");
    expect(text).toContain("folder_retention.summary_trash");
  });

  it("shows the upgrade modal when a non-entitled user clicks Add", async () => {
    h.plan_state = {
      limits: { limits: { has_folder_retention: { limit: 0 } } },
      is_loading: false,
    };
    await render();
    await click_button_containing("folder_retention.add");
    const text = container.textContent ?? "";
    expect(text).toContain("folder_retention.upgrade_title");
    expect(text).not.toContain("folder_retention.edit_title");
  });

  it("does NOT show upgrade while plan limits are still loading (paid-user race fix)", async () => {
    h.plan_state = { limits: null, is_loading: true };
    await render();
    await click_button_containing("folder_retention.add");
    const text = container.textContent ?? "";
    expect(text).toContain("folder_retention.edit_title");
    expect(text).not.toContain("folder_retention.upgrade_title");
  });

  it("excludes system folders from the picker and offers custom folders", async () => {
    await render();
    await click_button_containing("folder_retention.add");
    const options = Array.from(container.querySelectorAll("option")).map(
      (o) => o.textContent,
    );
    expect(options).toContain("Newsletters");
    expect(options).not.toContain("Inbox");
  });

  it("creates a trash policy through the editor", async () => {
    h.api.create_retention_policy.mockResolvedValue({
      data: {
        id: "new1",
        folder_token: "AAEC",
        retention_days: 30,
        delete_mode: "trash",
        enabled: true,
        last_swept_at: null,
        created_at: "",
        updated_at: "",
      },
    });
    await render();
    await click_button_containing("folder_retention.add");
    await set_select("AAEC");
    await click_button_containing("folder_retention.save");
    expect(h.api.create_retention_policy).toHaveBeenCalledWith(
      expect.objectContaining({
        folder_token: "AAEC",
        delete_mode: "trash",
        retention_days: 30,
      }),
    );
  });

  it("requires confirmation before creating a permanent policy", async () => {
    h.api.create_retention_policy.mockResolvedValue({
      data: {
        id: "new2",
        folder_token: "AAEC",
        retention_days: 30,
        delete_mode: "permanent",
        enabled: true,
        last_swept_at: null,
        created_at: "",
        updated_at: "",
      },
    });
    await render();
    await click_button_containing("folder_retention.add");
    await set_select("AAEC");
    await click_button_containing("folder_retention.mode_permanent");
    await click_button_containing("folder_retention.save");
    expect(h.api.create_retention_policy).not.toHaveBeenCalled();
    expect(container.textContent ?? "").toContain(
      "folder_retention.permanent_confirm",
    );
    await click_button_containing("folder_retention.delete");
    expect(h.api.create_retention_policy).toHaveBeenCalledWith(
      expect.objectContaining({ delete_mode: "permanent" }),
    );
  });

  it("toggles a policy's enabled state optimistically", async () => {
    h.api.list_retention_policies.mockResolvedValue({
      data: [
        {
          id: "p1",
          folder_token: "AAEC",
          retention_days: 30,
          delete_mode: "trash",
          enabled: true,
          last_swept_at: null,
          created_at: "",
          updated_at: "",
        },
      ],
    });
    h.api.update_retention_policy.mockResolvedValue({ data: {} });
    await render();
    const checkbox = container.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    act(() => {
      checkbox.click();
    });
    await flush();
    expect(h.api.update_retention_policy).toHaveBeenCalledWith("p1", {
      enabled: false,
    });
  });
});
