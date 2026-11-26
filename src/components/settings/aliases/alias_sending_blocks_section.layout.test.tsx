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
import type { SenderOption } from "@/hooks/use_sender_aliases";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const long_email =
  "verylonglocalpartthatkeepsgoingwithoutanybreaks1234567890@an-extremely-long-custom-domain-name.example";

const scenario: { options: SenderOption[]; loading: boolean } = {
  options: [],
  loading: false,
};

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, string>) =>
      params?.email ? `${key}:${params.email}` : key,
    language: "en",
  }),
}));

vi.mock("@/hooks/use_sender_aliases", () => ({
  use_sender_aliases: () => ({
    sender_options: scenario.options,
    loading: scenario.loading,
  }),
}));

vi.mock("@/hooks/mail_events", () => ({
  emit_aliases_changed: vi.fn(),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

vi.mock("@/services/api/alias_sending_blocks", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/api/alias_sending_blocks")
  >()),
  update_sending_blocks: vi.fn(async () => ({ data: { success: true } })),
}));

const { AliasSendingBlocksSection } =
  await import("./alias_sending_blocks_section");

let container: HTMLDivElement;
let root: Root;

async function render_section() {
  await act(async () => {
    root.render(<AliasSendingBlocksSection />);
  });
}

describe("AliasSendingBlocksSection layout", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    scenario.loading = false;
    scenario.options = [
      {
        id: "primary",
        email: "me@astermail.org",
        type: "primary",
        is_enabled: true,
      },
      {
        id: "a1",
        email: "shopping@astermail.org",
        type: "alias",
        is_enabled: true,
      },
      {
        id: "a2",
        email: long_email,
        type: "alias",
        is_enabled: true,
        sending_disabled: true,
      },
    ];
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders each address as a settings toggle row", async () => {
    await render_section();
    const list = container.querySelector("[data-testid=sending-blocks-list]");

    expect(list).not.toBeNull();
    expect(list?.querySelector("ul, li")).toBeNull();

    const rows = list?.querySelectorAll(".aster_island_row") ?? [];

    expect(rows.length).toBe(3);
    rows.forEach((row) => {
      const switch_el = row.querySelector(".aster_switch_input");

      expect(switch_el).not.toBeNull();
      expect(switch_el?.closest(".aster_island_row_trailing")).not.toBeNull();
    });
  });

  it("keeps the search field outside the list", async () => {
    await render_section();
    const input = container.querySelector("input:not(.aster_switch_input)");
    const list = container.querySelector("[data-testid=sending-blocks-list]");

    expect(input).not.toBeNull();
    expect(list?.contains(input)).toBe(false);
  });

  it("truncates long addresses instead of pushing the switch", async () => {
    await render_section();
    const label = container.querySelector(`[title="${long_email}"]`);

    expect(label).not.toBeNull();
    expect(label?.classList.contains("truncate")).toBe(true);
    expect(label?.closest(".aster_island_row_trailing")).toBeNull();
  });

  it("reflects the sending state on each switch", async () => {
    await render_section();
    const switches = [
      ...container.querySelectorAll<HTMLInputElement>(
        "[data-testid=sending-blocks-list] .aster_switch_input",
      ),
    ];

    expect(switches.map((el) => el.checked)).toEqual([true, true, false]);
  });

  it("lists the primary address with a label", async () => {
    await render_section();
    const primary = container.querySelector('[title="me@astermail.org"]');

    expect(primary).not.toBeNull();
    expect(container.textContent).toContain(
      "settings.sending_blocks_primary_label",
    );
  });

  it("explains when every address has sending turned off", async () => {
    await render_section();
    expect(
      container.querySelector("[data-testid=sending-blocks-all-disabled]"),
    ).toBeNull();

    scenario.options = scenario.options.map((option) => ({
      ...option,
      sending_disabled: true,
    }));
    await render_section();

    expect(
      container.querySelector("[data-testid=sending-blocks-all-disabled]")
        ?.textContent,
    ).toContain("settings.sending_blocks_all_disabled");
  });
});
