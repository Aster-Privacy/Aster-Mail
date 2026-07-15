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
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const config = vi.hoisted(() => ({
  locked: false,
  limit: -1 as number,
}));

const stable_i18n = { t: (k: string) => k };

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => stable_i18n,
}));

vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => ({
    is_feature_locked: () => config.locked,
    is_loading: false,
    limits: {
      limits: {
        max_alias_directories: {
          limit: config.limit,
          current: 1,
          is_at_limit: false,
        },
      },
    },
  }),
}));

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));

vi.mock("@/components/settings/settings_skeleton", () => ({
  SettingsSkeleton: () => null,
}));

vi.mock("@/components/settings/aliases/feature_lock", () => ({
  FeatureLockOverlay: () => <div>locked-overlay</div>,
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
  Button: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
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

describe("AliasDirectoriesSection count edge cases", () => {
  let container: HTMLDivElement;
  let root: Root;

  const flush = async () => {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  const render = async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<AliasDirectoriesSection />);
    });
    await flush();
  };

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    config.locked = false;
    config.limit = -1;
  });

  it("renders the infinity glyph when the plan is unlimited", async () => {
    config.locked = false;
    config.limit = -1;
    await render();

    const badge = Array.from(container.querySelectorAll("span")).find((s) =>
      /^\s*1\s*\/\s*∞\s*$/.test(s.textContent ?? ""),
    );

    expect(badge).toBeTruthy();
  });

  it("hides the count badge and list when the feature is locked", async () => {
    config.locked = true;
    config.limit = 0;
    await render();

    expect(container.textContent).toContain("locked-overlay");
    expect(container.textContent).not.toContain(
      "anything.shopping@astermail.org",
    );
    const badge = Array.from(container.querySelectorAll("span")).find((s) =>
      /\d+\s*\/\s*(\d+|∞)/.test(s.textContent ?? ""),
    );

    expect(badge).toBeFalsy();
    expect(
      container.querySelector(
        'input[placeholder="settings.alias_directory_search_placeholder"]',
      ),
    ).toBeNull();
  });
});
