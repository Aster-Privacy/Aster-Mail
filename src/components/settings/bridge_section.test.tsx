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
import { copy_text_or_throw } from "@/utils/copy_text";
import { show_toast } from "@/components/toast/simple_toast";
import { en } from "@/lib/i18n/translations/en";

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
    expect(text).toContain("settings.desktop_bridge_description");
    expect(text).not.toContain("settings.desktop_bridge_description_short");
  });

  function cli_tab(label: string) {
    return Array.from(
      container.querySelectorAll('[role="group"] button[aria-pressed]'),
    ).find((node) => node.textContent === label) as
      HTMLButtonElement | undefined;
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

  it("names the platform on the command line download button", async () => {
    set_plan("supernova");
    await render();

    const expected = [
      [
        "settings.bridge_cli_windows_link",
        "settings.bridge_cli_download_windows",
        "cli-windows",
      ],
      [
        "settings.bridge_cli_macos_link",
        "settings.bridge_cli_download_macos",
        "cli-macos",
      ],
      [
        "settings.bridge_cli_linux_link",
        "settings.bridge_cli_download_linux",
        "cli-linux-x64",
      ],
    ];

    for (const [tab_label, button_label, platform] of expected) {
      await act(async () => {
        cli_tab(tab_label)?.click();
      });

      const link = Array.from(container.querySelectorAll("a")).find((node) =>
        node.getAttribute("href")?.endsWith(`/${platform}`),
      );

      expect(link?.textContent).toBe(button_label);
    }
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
      container.querySelector('[role="group"]')?.getAttribute("aria-label"),
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
    expect(text).toContain("settings.bridge_upgrade_summary");
    expect(container.querySelector(".plan_badge_tier_star")).toBeTruthy();
  });

  it("shortens the section description when the upgrade card shows", async () => {
    set_plan("free");
    await render();

    const text = container.textContent ?? "";
    expect(text).toContain("settings.desktop_bridge_description_short");
    expect(text.split("settings.desktop_bridge_description").length - 1).toBe(
      1,
    );

    const short = en.settings.desktop_bridge_description_short;
    for (const benefit of [
      en.settings.bridge_upgrade_benefit_clients,
      en.settings.bridge_upgrade_benefit_local,
    ]) {
      expect(short).not.toBe(benefit);
    }
    for (const client of ["Apple Mail", "Thunderbird", "Outlook"]) {
      expect(short).not.toContain(client);
    }
    expect(short.toLowerCase()).not.toContain("encrypt");
    expect(short.toLowerCase()).not.toContain("locally");
  });

  it("opens billing when a locked download button is clicked", async () => {
    set_plan("free");
    await render();

    const listener = vi.fn();
    window.addEventListener("navigate-settings", listener);

    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        '[data-testid="bridge-locked-download"]',
      ),
    );

    expect(buttons.length).toBeGreaterThanOrEqual(4);
    expect(container.querySelector('a[href*="/cli-"]')).toBeNull();

    for (const button of buttons) {
      expect(button.disabled).toBe(false);
      await act(async () => {
        button.click();
      });
    }

    window.removeEventListener("navigate-settings", listener);

    expect(listener).toHaveBeenCalledTimes(buttons.length);
    for (const [event] of listener.mock.calls) {
      expect((event as CustomEvent).detail).toBe("billing");
    }
  });

  it("keeps the upgrade summary distinct from the section description", () => {
    const summary = en.settings.bridge_upgrade_summary;
    const description = en.settings.desktop_bridge_description;
    const clients_benefit = en.settings.bridge_upgrade_benefit_clients;

    expect(summary).toContain("Star");
    expect(description).not.toContain("re-serve");
    expect(en.settings.bridge_popover_description).not.toContain("re-serve");
    for (const client of ["Apple Mail", "Thunderbird", "Outlook"]) {
      expect(description).toContain(client);
      expect(clients_benefit).toContain(client);
      expect(summary).not.toContain(client);
    }
  });

  it("marks only the selected platform as pressed", async () => {
    set_plan("supernova");
    await render();

    const linux = cli_tab("settings.bridge_cli_linux_link");

    await act(async () => {
      linux?.click();
    });

    const pressed = container.querySelectorAll(
      '[role="group"] button[aria-pressed="true"]',
    );

    expect(pressed).toHaveLength(1);
    expect(pressed[0].textContent).toBe("settings.bridge_cli_linux_link");
    expect(container.textContent ?? "").toContain(
      "settings.bridge_cli_shell_terminal",
    );
  });

  it("copies the exact commands without prompt markers", async () => {
    set_plan("supernova");
    await render();

    await act(async () => {
      cli_tab("settings.bridge_cli_windows_link")?.click();
    });

    const copy_button = container.querySelector(
      'button[aria-label="settings.bridge_cli_copy_command"]',
    ) as HTMLButtonElement | null;

    expect(copy_button).toBeTruthy();
    expect(container.textContent ?? "").toContain(
      "settings.bridge_cli_shell_powershell",
    );

    await act(async () => {
      copy_button?.click();
    });

    const copied = vi.mocked(copy_text_or_throw).mock.calls[0]?.[0] ?? "";

    expect(copied.startsWith("Expand-Archive aster-bridge-cli-*.zip")).toBe(
      true,
    );
    expect(copied).not.toContain("PS>");
    expect(copied.split("\n")).toHaveLength(3);
    expect(show_toast).toHaveBeenCalledWith("common.copied", "success");
    expect(copy_button?.textContent).toBe("common.copy");
  });

  it("shows an error toast when copying fails", async () => {
    set_plan("supernova");
    await render();

    vi.mocked(copy_text_or_throw).mockRejectedValueOnce(new Error("denied"));

    const copy_button = container.querySelector(
      'button[aria-label="settings.bridge_cli_copy_command"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      copy_button?.click();
    });

    expect(show_toast).toHaveBeenCalledWith("common.failed_to_copy", "error");
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
