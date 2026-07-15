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
        max_alias_directories: { limit: 10, current: 2, is_at_limit: false },
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

const directories = [
  {
    id: "1",
    label: "shopping",
    domain: "astermail.org",
    auto_create_enabled: true,
  },
  {
    id: "2",
    label: "newsletters",
    domain: "astermail.org",
    auto_create_enabled: false,
  },
];

vi.mock("@/services/api/alias_directories", () => ({
  DIRECTORY_DOMAINS: ["astermail.org", "aster.cx"],
  list_alias_directories: vi.fn(async () => ({ data: { directories } })),
  decrypt_alias_directory: vi.fn(async (d: unknown) => d),
  create_alias_directory: vi.fn(),
  update_alias_directory: vi.fn(),
  delete_alias_directory: vi.fn(),
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

describe("AliasDirectoriesSection list, search and count", () => {
  let container: HTMLDivElement;
  let root: Root;

  const flush = async () => {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  beforeEach(async () => {
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

  const search_input = () =>
    container.querySelector(
      'input[placeholder="settings.alias_directory_search_placeholder"]',
    ) as HTMLInputElement;

  const type_search = async (value: string) => {
    const input = search_input();
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(input),
      "value",
    )!.set!;

    await act(async () => {
      setter.call(input, value);
      input.dispatchEvent(new window.InputEvent("input", { bubbles: true }));
    });
  };

  it("shows the used / max count badge", async () => {
    const badge = Array.from(container.querySelectorAll("span")).find((s) =>
      /^\s*2\s*\/\s*10\s*$/.test(s.textContent ?? ""),
    );

    expect(badge).toBeTruthy();
  });

  it("renders every directory before searching", async () => {
    expect(container.textContent).toContain("anything.shopping@astermail.org");
    expect(container.textContent).toContain(
      "anything.newsletters@astermail.org",
    );
  });

  it("filters the list by the search query", async () => {
    await type_search("shop");

    expect(container.textContent).toContain("anything.shopping@astermail.org");
    expect(container.textContent).not.toContain(
      "anything.newsletters@astermail.org",
    );
  });

  it("matches case-insensitively", async () => {
    await type_search("SHOP");

    expect(container.textContent).toContain("anything.shopping@astermail.org");
    expect(container.textContent).not.toContain(
      "anything.newsletters@astermail.org",
    );
  });

  it("matches against the domain too", async () => {
    await type_search("astermail");

    expect(container.textContent).toContain("anything.shopping@astermail.org");
    expect(container.textContent).toContain(
      "anything.newsletters@astermail.org",
    );
  });

  it("restores the full list when the query is cleared", async () => {
    await type_search("shop");
    expect(container.textContent).not.toContain(
      "anything.newsletters@astermail.org",
    );

    await type_search("");
    expect(container.textContent).toContain("anything.shopping@astermail.org");
    expect(container.textContent).toContain(
      "anything.newsletters@astermail.org",
    );
  });

  it("shows the no-matches message when nothing matches", async () => {
    await type_search("zzzznope");

    expect(container.textContent).toContain(
      "settings.alias_directory_no_matches",
    );
    expect(container.textContent).not.toContain(
      "anything.shopping@astermail.org",
    );
  });
});
