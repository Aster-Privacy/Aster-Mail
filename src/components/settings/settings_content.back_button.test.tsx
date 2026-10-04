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

import { pt } from "@/lib/i18n/translations/pt";

vi.mock("./use_settings_content", () => ({
  use_settings_content: () => ({
    is_popup: false,
    t: (key: string) => key,
    mail_stats: { storage_total_bytes: 0, storage_used_bytes: 0 },
    mail_stats_ready: false,
    storage_percentage: 0,
    sidebar_width: 256,
    section: "none",
    set_section: () => {},
    show_mobile_nav: false,
    set_show_mobile_nav: () => {},
    is_suspended: false,
    is_family_plan: false,
    search_query: "",
    set_search_query: () => {},
    set_scroll_target: () => {},
    show_inline_totp_setup: false,
    set_show_inline_totp_setup: () => {},
    section_ref: { current: "none" },
    indicator_style: { top: 0, height: 0, opacity: 0 },
    should_animate_indicator: false,
    nav_container_ref: { current: null },
    content_container_ref: { current: null },
    nav_item_refs: { current: {} },
    handle_account_deleted: () => {},
    has_devices: false,
    dev_mode_enabled: false,
    nav_items: [],
    is_searching: false,
    search_results: [],
    registry_results: [],
  }),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/components/settings/billing_section", () => ({
  prefetch_billing_data: () => {},
}));

vi.mock("@/components/settings/billing/family_section/family_cache", () => ({
  prefetch_family_data: () => {},
}));

vi.mock("@/components/layout/storage_meter", () => ({
  StorageMeter: () => null,
  scroll_to_storage_addons: () => {},
}));

vi.mock("@/components/settings/settings_save_indicator", () => ({
  SettingsSaveIndicator: () => null,
}));

const { SettingsContent } = await import("./settings_content");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function render_settings(): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <SettingsContent on_close={() => {}} on_section_change={() => {}} />,
    );
  });

  return container;
}

describe("settings sidebar back to inbox button", () => {
  it("keeps the label on one line and the arrow at full size", () => {
    const el = render_settings();
    const label = Array.from(el.querySelectorAll("aside span")).find(
      (span) => span.textContent === "common.back_to_inbox",
    );

    expect(label).toBeDefined();
    expect(label!.classList.contains("truncate")).toBe(true);
    const icon = label!.parentElement!.querySelector("svg");

    expect(icon?.classList.contains("flex-shrink-0")).toBe(true);
  });

  it("uses the short European Portuguese label", () => {
    expect(pt.common.back_to_inbox).toBe("Voltar à caixa de entrada");
    expect(pt.common.back_to_inbox).toBe(pt.auth.back_to_inbox);
  });
});
