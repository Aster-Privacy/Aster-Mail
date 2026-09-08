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

import { QuickSecurityPanel } from "./quick_security_panel";

import { format_key_fingerprint } from "@/hooks/use_security_overview";

const totp_status = vi.fn();
const hardware_keys = vi.fn();
const login_alerts = vi.fn();
const recovery_email = vi.fn();

let preferences = {
  block_tracking_pixels: false,
  block_remote_images: false,
  strip_exif_on_compose: false,
};

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences }),
}));

vi.mock("@/lib/overlay_layer_stack", () => ({
  use_escape_layer: () => {},
}));

vi.mock("@/services/api/totp", () => ({
  get_totp_status: () => totp_status(),
}));

vi.mock("@/services/api/webauthn", () => ({
  list_hardware_keys: () => hardware_keys(),
}));

vi.mock("@/services/api/auth", () => ({
  get_login_alerts_status: () => login_alerts(),
}));

vi.mock("@/services/api/recovery_email", () => ({
  get_recovery_email: () => recovery_email(),
}));

vi.mock("@/services/api/sessions", () => ({
  list_sessions: () => Promise.resolve({ data: { sessions: [{ id: "a" }] } }),
}));

vi.mock("@/services/api/trusted_devices", () => ({
  list_trusted_devices: () => Promise.resolve({ data: { devices: [] } }),
}));

vi.mock("@/services/api/vanguard", () => ({
  get_vanguard_status: () => Promise.resolve({ data: { enabled: true } }),
}));

vi.mock("@/services/api/lockdown", () => ({
  get_lockdown_status: () => Promise.resolve({ data: { enabled: false } }),
}));

vi.mock("@/services/api/key_rotation", () => ({
  get_identity_key_status: () =>
    Promise.resolve({ data: { key_fingerprint: "ab:cd:ef:12:34:56:78:9a" } }),
}));

vi.mock("@/services/api/aliases", () => ({
  get_alias_counts: () => Promise.resolve({ data: { count: 3, max: 10 } }),
}));

let alias_cache: {
  id: string;
  full_address: string;
  is_enabled: boolean;
}[] = [];

vi.mock("@/hooks/use_sidebar_aliases", () => ({
  subscribe_aliases: () => () => {},
  get_cached_aliases: () => alias_cache,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => ({ id: "vault" }),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("quick security panel", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render_panel = async (is_open = true) => {
    await act(async () => {
      root.render(
        <QuickSecurityPanel
          is_open={is_open}
          is_top_inset={false}
          on_close={() => {}}
        />,
      );
    });
  };

  beforeEach(() => {
    preferences = {
      block_tracking_pixels: false,
      block_remote_images: false,
      strip_exif_on_compose: false,
    };
    totp_status.mockResolvedValue({ data: { enabled: false } });
    hardware_keys.mockResolvedValue({ data: { keys: [] } });
    login_alerts.mockResolvedValue({ data: { enabled: false } });
    recovery_email.mockResolvedValue({ data: { verified: false } });
    alias_cache = [];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
    document.documentElement.style.removeProperty("--quick_panel_inset");
  });

  it("fetches nothing while it stays closed", async () => {
    await render_panel(false);

    expect(totp_status).not.toHaveBeenCalled();
    expect(container.querySelector("aside")!.classList.contains("hidden")).toBe(
      true,
    );
    expect(container.querySelector("aside")!.classList.contains("flex")).toBe(
      false,
    );
  });

  it("shows the panel once it opens", async () => {
    await render_panel();

    const panel = container.querySelector("aside")!;

    expect(panel.classList.contains("flex")).toBe(true);
    expect(panel.classList.contains("hidden")).toBe(false);
  });

  it("lists every unmet criterion as a recommended action", async () => {
    await render_panel();

    const pending = container.querySelectorAll(
      "ul:first-of-type > li > button",
    );

    expect(pending).toHaveLength(7);
    expect(container.textContent).toContain(
      "settings.security_center_recommended",
    );
    expect(container.textContent).toContain(
      "settings.security_center_protection_score",
    );
  });

  it("moves a met criterion into the protected list", async () => {
    totp_status.mockResolvedValue({ data: { enabled: true } });
    preferences = {
      block_tracking_pixels: true,
      block_remote_images: true,
      strip_exif_on_compose: true,
    };
    await render_panel();

    const lists = container.querySelectorAll("ul");

    expect(lists).toHaveLength(2);
    expect(lists[0].querySelectorAll("li")).toHaveLength(3);
    expect(lists[1].querySelectorAll("li")).toHaveLength(4);
  });

  it("previews enabled aliases first and counts the remainder", async () => {
    alias_cache = [
      { id: "1", full_address: "archive@aster.cx", is_enabled: false },
      { id: "2", full_address: "shop@aster.cx", is_enabled: true },
      { id: "3", full_address: "news@aster.cx", is_enabled: true },
      { id: "4", full_address: "games@aster.cx", is_enabled: true },
      { id: "5", full_address: "travel@aster.cx", is_enabled: true },
      { id: "6", full_address: "work@aster.cx", is_enabled: true },
    ];
    await render_panel();

    const rows = Array.from(container.querySelectorAll("ul")).find((list) =>
      list.textContent?.includes("@aster.cx"),
    );

    expect(rows).toBeTruthy();
    expect(
      Array.from(rows!.querySelectorAll("li")).map((li) => li.textContent),
    ).toEqual([
      "games@aster.cx",
      "news@aster.cx",
      "shop@aster.cx",
      "travel@aster.cx",
    ]);
    expect(container.textContent).toContain("common.n_more");
  });

  it("hides the alias preview when there are no aliases", async () => {
    await render_panel();

    expect(container.textContent).not.toContain("@aster.cx");
    expect(container.textContent).not.toContain("common.n_more");
  });

  it("reports a fully protected account with no recommendations", async () => {
    totp_status.mockResolvedValue({ data: { enabled: true } });
    hardware_keys.mockResolvedValue({ data: { keys: [{ id: "key" }] } });
    login_alerts.mockResolvedValue({ data: { enabled: true } });
    recovery_email.mockResolvedValue({ data: { verified: true } });
    preferences = {
      block_tracking_pixels: true,
      block_remote_images: true,
      strip_exif_on_compose: true,
    };
    await render_panel();

    expect(container.textContent).toContain(
      "settings.security_center_all_clear",
    );
    expect(container.textContent).toContain(
      "settings.account_protection_strong",
    );
  });

  it("deep-links a criterion into its settings section", async () => {
    const events: unknown[] = [];
    const listener = (event: Event) => {
      events.push((event as CustomEvent).detail);
    };

    window.addEventListener("navigate-settings", listener);
    await render_panel();

    const first = container.querySelector<HTMLButtonElement>(
      "ul:first-of-type > li > button",
    );

    await act(async () => {
      first?.click();
    });
    window.removeEventListener("navigate-settings", listener);

    expect(events).toEqual([{ section: "security", anchor: "sec-2fa" }]);
  });

  it("shows our own protection signals alongside the criteria", async () => {
    await render_panel();

    expect(container.textContent).toContain("settings.vanguard_title");
    expect(container.textContent).toContain("settings.lockdown_title");
    expect(container.textContent).toContain("settings_search.sessions");
    expect(container.textContent).toContain("settings.trusted_devices");
    expect(container.textContent).toContain("3/10");
    expect(container.textContent).toContain(
      "settings.security_center_encryption_title",
    );
    expect(container.textContent).toContain("3456 789A");
  });

  it("carries no refresh control in the header", async () => {
    await render_panel();

    const header_buttons = container.querySelectorAll(
      "aside > div:first-child > button",
    );

    expect(header_buttons).toHaveLength(1);
    expect(header_buttons[0].getAttribute("aria-label")).toBe("common.close");
  });

  it("writes the panel inset while it is open", async () => {
    await render_panel();

    expect(
      document.documentElement.style.getPropertyValue("--quick_panel_inset"),
    ).toBe("0px");
  });

  it("offers a retry when a status request fails", async () => {
    totp_status.mockRejectedValue(new Error("offline"));
    await render_panel();

    expect(container.textContent).toContain(
      "settings.failed_load_security_status",
    );
    expect(container.textContent).toContain(
      "settings.security_center_recommended",
    );

    const retry = container.querySelector<HTMLButtonElement>(
      ".flex-1.overflow-y-auto > button",
    );

    totp_status.mockResolvedValue({ data: { enabled: true } });
    await act(async () => {
      retry?.click();
    });

    expect(container.textContent).not.toContain(
      "settings.failed_load_security_status",
    );
  });
});

describe("format_key_fingerprint", () => {
  it("returns nothing without a fingerprint", () => {
    expect(format_key_fingerprint(null)).toBe("");
  });

  it("groups the last eight characters of a fingerprint", () => {
    expect(format_key_fingerprint("ab:cd:ef:12:34:56:78:9a")).toBe("3456 789A");
  });

  it("returns a short fingerprint unchanged", () => {
    expect(format_key_fingerprint("ab-cd")).toBe("ABCD");
  });
});
