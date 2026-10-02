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
import type { SenderOption } from "@/hooks/use_sender_aliases";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const i18n = vi.hoisted(() => ({ t: (key: string) => key }));

vi.mock("@/lib/i18n/context", () => ({ use_i18n: () => i18n }));

vi.mock("@/provider", () => ({ use_should_reduce_motion: () => true }));

vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: () => null,
}));

import { SenderSelector } from "@/components/compose/sender_selector";

const primary: SenderOption = {
  id: "primary",
  email: "me@example.com",
  type: "primary",
  is_enabled: true,
};
const saved: SenderOption = {
  id: "domain-a1",
  email: "support@example.com",
  type: "domain",
  is_enabled: true,
  address_hash: "hash_1",
};
const catch_all: SenderOption = {
  id: "catch-all-d1-shopping@example.com",
  email: "shopping@example.com",
  type: "domain",
  is_enabled: true,
  is_catch_all: true,
};

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
});

function row_for(email: string): HTMLElement {
  const label = Array.from(
    document.body.querySelectorAll<HTMLElement>("p.text-sm.truncate"),
  ).find((el) => el.textContent === email);

  return label!.closest<HTMLElement>(".group")!;
}

describe("SenderSelector catch-all identities", () => {
  it("labels a catch-all identity on the chip and in the menu", () => {
    act(() => {
      root.render(
        <SenderSelector
          on_select={() => undefined}
          on_set_preferred={() => undefined}
          options={[primary, saved, catch_all]}
          selected={catch_all}
        />,
      );
    });
    const trigger = container.querySelector("button")!;

    expect(trigger.textContent).toBe(
      "shopping@example.comsettings.catch_all_label",
    );
    act(() => {
      trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(row_for(catch_all.email).textContent).toContain(
      "settings.catch_all_label",
    );
    expect(row_for(saved.email).textContent).not.toContain(
      "settings.catch_all_label",
    );
    expect(
      row_for(catch_all.email).querySelector(
        '[aria-label="common.pin_preferred_sender"]',
      ),
    ).toBeNull();
    expect(
      row_for(saved.email).querySelector(
        '[aria-label="common.pin_preferred_sender"]',
      ),
    ).not.toBeNull();
  });

  it("shows no label for a saved address", () => {
    act(() => {
      root.render(
        <SenderSelector
          on_select={() => undefined}
          options={[primary, saved, catch_all]}
          selected={saved}
        />,
      );
    });

    expect(container.textContent).not.toContain("settings.catch_all_label");
  });
});
