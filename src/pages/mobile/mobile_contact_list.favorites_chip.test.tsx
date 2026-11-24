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

import { MobileContactList } from "./mobile_contact_list";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/hooks/use_contact_groups", () => ({
  use_contact_groups: () => ({ groups: [] }),
}));

vi.mock("@/components/mobile/mobile_header", () => ({
  MobileHeader: () => null,
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => {};

function render_list(
  root: Root,
  filter: "all" | "favorites",
  favorites_count: number,
  set_filter: (v: "all" | "favorites") => void,
) {
  root.render(
    <MobileContactList
      contacts={[]}
      deselect_all={noop}
      exit_select_mode={noop}
      favorites_count={favorites_count}
      filter={filter}
      filtered_contacts={[]}
      group_filter={null}
      grouped={[]}
      is_loading={false}
      is_select_mode={false}
      is_syncing={false}
      load_failed={false}
      on_contact_press={noop}
      on_long_press_consume={() => false}
      on_long_press_end={noop}
      on_long_press_start={noop}
      on_mass_copy_emails={noop}
      on_mass_email={noop}
      on_mass_favorite={noop}
      on_open_create={noop}
      on_open_drawer={noop}
      on_retry_load={noop}
      on_show_delete_confirm={noop}
      on_show_sync_confirm={noop}
      search_query=""
      select_all={noop}
      selected_ids={new Set()}
      set_filter={set_filter}
      set_group_filter={noop}
      set_is_select_mode={noop}
      set_search_query={noop}
      toggle_select={noop}
    />,
  );
}

function find_favorites_chip(container: HTMLElement): HTMLButtonElement | null {
  return (
    Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("common.favorites"),
    ) ?? null
  );
}

describe("mobile contact list favorites chip", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("hides the chip when no contact is a favorite and the filter is off", async () => {
    await act(async () => {
      render_list(root, "all", 0, noop);
    });

    expect(find_favorites_chip(container)).toBeNull();
  });

  it("keeps the chip while the favorites filter is on after the last favorite is removed", async () => {
    const set_filter = vi.fn();

    await act(async () => {
      render_list(root, "favorites", 0, set_filter);
    });

    const chip = find_favorites_chip(container);

    expect(chip).not.toBeNull();
    expect(chip?.className).toContain("bg-[var(--accent-color)]");
    expect(chip?.getAttribute("aria-pressed")).toBe("true");
  });
});
