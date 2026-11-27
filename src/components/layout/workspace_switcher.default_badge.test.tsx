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
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { WorkspaceSwitcherView } from "@aster/ui";

const noop = () => undefined;

function rule_block_for(selector_fragment: string): string {
  const css = readFileSync(
    resolve(__dirname, "../../styles/globals.css"),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const match = Array.from(css.matchAll(/^([^{}]+)\{([^}]*)\}/gm)).find(
    (block) => block[1].includes(selector_fragment),
  );

  if (!match) throw new Error(`no rule for ${selector_fragment}`);

  return match[0];
}

function filled_badge_selectors(): string[] {
  const block = rule_block_for(".plan_badge,");

  return block
    .slice(0, block.indexOf("{"))
    .split(",")
    .map((selector) => selector.trim())
    .filter(Boolean);
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function render_switcher() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);

  act(() => {
    root!.render(
      <WorkspaceSwitcherView
        is_open
        accounts={[
          {
            id: "a",
            name: "Team",
            email: "team@example.org",
            avatar: <span />,
            href: "/?account=a",
            badge: { label: "Default" },
          },
          {
            id: "b",
            name: "Other",
            email: "other@example.org",
            avatar: <span />,
            href: "/?account=b",
            badge: { label: "Expired", muted: true },
          },
        ]}
        display_name="Me"
        email="me@example.org"
        header_avatar={<span />}
        labels={{
          official_sender: "",
          manage_account: "",
          storage_used: "",
          resubscribe: "",
          add_account: "",
          sign_out: "",
          sign_out_all: "",
        }}
        on_add_account={noop}
        on_copy_email={noop}
        on_manage_account={noop}
        on_open_change={noop}
        on_sign_out={noop}
        on_switch_account={noop}
        storage_percent={0}
        trigger={<button type="button">open</button>}
      />,
    );
  });
}

function badge_with_text(text: string): HTMLElement {
  const badge = Array.from(
    document.body.querySelectorAll<HTMLElement>(".account_menu_badge"),
  ).find((el) => el.textContent === text);

  if (!badge) throw new Error(`badge ${text} not rendered`);

  return badge;
}

describe("account menu default badge", () => {
  it("shares the filled plan badge rule", () => {
    const block = rule_block_for(".plan_badge,");

    expect(filled_badge_selectors()).toContain(".plan_badge");
    expect(block).toMatch(/color:\s*#fff;/);
    expect(block).toMatch(/border-radius:\s*999px;/);
  });

  it("renders the default tag as a filled pill and keeps muted tags muted", () => {
    render_switcher();

    const selectors = filled_badge_selectors().filter(
      (selector) => selector !== ".plan_badge",
    );
    const matches_filled = (el: HTMLElement) =>
      selectors.some((selector) => el.matches(selector));

    expect(selectors.length).toBeGreaterThan(0);
    expect(matches_filled(badge_with_text("Default"))).toBe(true);
    expect(matches_filled(badge_with_text("Expired"))).toBe(false);
  });

  it("leaves badges outside the account menu rows on the outlined style", () => {
    const card = document.createElement("div");
    const badge = document.createElement("span");

    badge.className = "account_menu_badge";
    card.appendChild(badge);
    document.body.appendChild(card);

    const selectors = filled_badge_selectors().filter(
      (selector) => selector !== ".plan_badge",
    );

    expect(selectors.some((selector) => badge.matches(selector))).toBe(false);
    card.remove();
  });
});
