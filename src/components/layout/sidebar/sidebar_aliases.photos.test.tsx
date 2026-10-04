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
import type { ReactNode } from "react";
import type { DecryptedEmailAlias } from "@/services/api/aliases";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/i18n/context", () => {
  const stable_t = (k: string) => k;
  const i18n = { t: stable_t };

  return {
    use_i18n: () => i18n,
  };
});

vi.mock("@/components/layout/sidebar/alias_context_menu", () => ({
  AliasContextMenu: ({ children }: { children: ReactNode }) => children,
}));

import { SidebarAliases } from "./sidebar_aliases";

const photo = "data:image/png;base64,iVBORw0KGgo=";

function make_alias(
  id: string,
  full_address: string,
  profile_picture?: string,
): DecryptedEmailAlias {
  const [local_part, domain] = full_address.split("@");

  return {
    id,
    local_part,
    domain,
    full_address,
    alias_address_hash: `hash-${id}`,
    is_enabled: true,
    is_random: false,
    profile_picture,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render_aliases(aliases: DecryptedEmailAlias[]) {
  act(() => {
    root!.render(
      createElement(SidebarAliases, {
        is_collapsed: false,
        effective_selected: null,
        aliases,
        aliases_expanded: true,
        set_aliases_expanded: vi.fn(),
        is_loading: false,
        handle_nav_click: (callback: () => void) => callback(),
        set_selected_item: vi.fn(),
        navigate: vi.fn(),
        on_settings_click: vi.fn(),
        on_create_alias: vi.fn(),
        alias_refs: { current: {} },
      }),
    );
  });
}

function row_image(address: string): HTMLImageElement | null {
  const label = Array.from(container!.querySelectorAll("button")).find(
    (button) => button.textContent?.includes(address),
  );

  return label?.querySelector("img") ?? null;
}

describe("SidebarAliases photos", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it("shows each alias photo in its sidebar row", () => {
    render_aliases([
      make_alias("a1", "dana@astermail.org", photo),
      make_alias("domain-a2", "hello@example.com", photo),
      make_alias("a3", "plain@aster.cx"),
    ]);

    expect(row_image("dana@astermail.org")?.getAttribute("src")).toBe(photo);
    expect(row_image("hello@example.com")?.getAttribute("src")).toBe(photo);
    expect(row_image("plain@aster.cx")).toBeNull();
  });

  it("updates a row when the alias photo changes", () => {
    render_aliases([make_alias("a1", "dana@astermail.org")]);
    expect(row_image("dana@astermail.org")).toBeNull();

    render_aliases([make_alias("a1", "dana@astermail.org", photo)]);
    expect(row_image("dana@astermail.org")?.getAttribute("src")).toBe(photo);
  });
});
