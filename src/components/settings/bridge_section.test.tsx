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

import { BridgeSection } from "./bridge_section";

import { use_plan_limits } from "@/hooks/use_plan_limits";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
  use_translation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: vi.fn(),
}));

vi.mock("@/services/api/devices", () => ({
  list_devices: vi.fn(async () => []),
  revoke_device: vi.fn(),
}));

vi.mock("@/components/settings/smtp_tokens_section", () => ({
  SmtpTokensSection: () => null,
}));

vi.mock("@/utils/copy_text", () => ({
  copy_text_or_throw: vi.fn(async () => undefined),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

const mocked_plan_limits = vi.mocked(use_plan_limits);

function set_plan(plan_code: string) {
  mocked_plan_limits.mockReturnValue({
    limits: { plan_code },
    is_loading: false,
    load_failed: false,
    refresh: vi.fn(),
  } as unknown as ReturnType<typeof use_plan_limits>);
}

describe("BridgeSection", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  async function render() {
    await act(async () => {
      root.render(<BridgeSection />);
    });
  }

  it("shows the command line card on a paid plan", async () => {
    set_plan("supernova");
    await render();

    const text = container.textContent ?? "";
    expect(text).toContain("settings.bridge_cli_name");
    expect(text).toContain("settings.bridge_cli_desc");
    expect(text).toContain("settings.bridge_cli_download");
  });

  function cli_tab(label: string) {
    return Array.from(container.querySelectorAll('[role="tab"]')).find(
      (node) => node.textContent === label,
    ) as HTMLButtonElement | undefined;
  }

  it("shows the install command and the docs link", async () => {
    set_plan("supernova");
    await render();

    const tab = cli_tab("settings.bridge_cli_linux_link");

    expect(tab).toBeTruthy();
    await act(async () => {
      tab?.click();
    });

    const text = container.textContent ?? "";
    expect(text).toContain("settings.bridge_cli_install_hint");
    expect(text).toContain("install -m 755 aster-bridge-cli-*/aster-bridge");
    expect(text).toContain("settings.bridge_cli_docs_link");
  });

  it("switches the command line tab to windows", async () => {
    set_plan("supernova");
    await render();

    const tab = cli_tab("settings.bridge_cli_windows_link");

    expect(tab).toBeTruthy();
    await act(async () => {
      tab?.click();
    });

    const text = container.textContent ?? "";
    expect(text).toContain("settings.bridge_cli_install_hint_windows");
    expect(text).toContain("Expand-Archive aster-bridge-cli-*.zip");
  });

  it("lists every desktop platform alongside the command line", async () => {
    set_plan("supernova");
    await render();

    const text = container.textContent ?? "";
    expect(text).toContain("settings.bridge_windows_name");
    expect(text).toContain("settings.bridge_macos_name");
    expect(text).toContain("settings.bridge_linux_name");
    expect(text).toContain("settings.bridge_cli_name");
    expect(
      container.querySelector('[role="tablist"]')?.getAttribute("aria-label"),
    ).toBe("settings.bridge_all_platforms");
    expect(text).toContain("settings.bridge_installations_description");
  });

  it("shows the upgrade card with its benefits on the free plan", async () => {
    set_plan("free");
    await render();

    const text = container.textContent ?? "";
    expect(text).toContain("settings.desktop_bridge_upgrade_title");
    expect(text).toContain("settings.bridge_upgrade_benefit_clients");
    expect(text).toContain("settings.bridge_upgrade_benefit_local");
    expect(text).toContain("settings.bridge_upgrade_benefit_platforms");
    expect(text).toContain("settings.bridge_upgrade_benefit_cli");
    expect(text).toContain("settings.desktop_bridge_upgrade_cta");
  });

  it("shows the support links as cards", async () => {
    set_plan("supernova");
    await render();

    const text = container.textContent ?? "";
    expect(text).toContain("settings.bridge_support_help");
    expect(text).toContain("settings.bridge_support_discord");
    expect(text).toContain("settings.bridge_support_reddit");
    expect(text).toContain("settings.bridge_support_github");
  });

  it("keeps the command line card visible on the free plan", async () => {
    set_plan("free");
    await render();

    expect(container.textContent ?? "").toContain("settings.bridge_cli_name");
  });
});
