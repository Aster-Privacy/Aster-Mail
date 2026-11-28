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
import type { Rule } from "postcss";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import postcss from "postcss";
import {
  SidebarSectionAddButton,
  SidebarSectionToggle,
  SidebarTagRow,
} from "@aster/ui";

interface CssRule {
  selectors: string[];
  declarations: Map<string, string>;
  in_hover_media: boolean;
}

const STATE_PSEUDO = /:(hover|focus-visible|focus|active)\b/g;

function load_rules(): CssRule[] {
  const css = readFileSync(
    resolve(__dirname, "../../../styles/globals.css"),
    "utf8",
  );
  const rules: CssRule[] = [];

  postcss.parse(css).walkRules((rule: Rule) => {
    const declarations = new Map<string, string>();

    rule.walkDecls((decl) => {
      declarations.set(decl.prop, decl.value);
    });
    const parent = rule.parent;
    const in_hover_media =
      parent?.type === "atrule" &&
      "params" in parent &&
      String(parent.params).includes("hover: hover");

    rules.push({ selectors: rule.selectors, declarations, in_hover_media });
  });

  return rules;
}

function matches_ignoring_state(element: Element, selector: string): boolean {
  try {
    return element.matches(selector.replace(STATE_PSEUDO, ":is(*)"));
  } catch {
    return false;
  }
}

function rules_matching(
  rules: CssRule[],
  element: Element,
  predicate: (selector: string) => boolean,
): CssRule[] {
  return rules.filter((rule) =>
    rule.selectors.some(
      (selector) =>
        predicate(selector) && matches_ignoring_state(element, selector),
    ),
  );
}

const has_hover = (selector: string) => selector.includes(":hover");
const has_plain_focus = (selector: string) =>
  /:focus(?!-visible|-within)\b/.test(selector);
const has_focus_visible = (selector: string) =>
  selector.includes(":focus-visible");
const any_selector = () => true;

describe("sidebar press and focus states", () => {
  let rules: CssRule[];
  let container: HTMLDivElement;
  let root: Root;
  let section_row: HTMLElement;
  let toggle_button: HTMLButtonElement;
  let add_button: HTMLButtonElement;
  let row_chevron: HTMLElement;

  beforeAll(() => {
    rules = load_rules();
    document.documentElement.setAttribute("data-input-modality", "keyboard");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <aside data-sidebar-root="true">
          <SidebarSectionToggle
            is_collapsed={false}
            label="Labels"
            on_toggle={() => {}}
            right_slot={
              <SidebarSectionAddButton
                label="Create label"
                on_click={() => {}}
              />
            }
            section_collapsed={false}
          />
          <SidebarTagRow
            icon_slot={<span data-testid="row-chevron" role="button" />}
            label="Work"
          />
        </aside>,
      );
    });

    const toggle = container.querySelector<HTMLButtonElement>(
      "aside .mt-5.mb-1 button",
    );
    const add = container.querySelector<HTMLButtonElement>(
      'aside .mt-5.mb-1 button[aria-label="Create label"]',
    );
    const chevron = container.querySelector<HTMLElement>(
      '[data-testid="row-chevron"]',
    );

    if (!toggle || !add || !chevron || !toggle.parentElement) {
      throw new Error("sidebar fixture did not render");
    }
    toggle_button = toggle;
    add_button = add;
    row_chevron = chevron;
    section_row = toggle.parentElement;
  });

  afterAll(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.documentElement.removeAttribute("data-input-modality");
  });

  it("stretches the section toggle across the full header row", () => {
    const stretch = rules_matching(rules, toggle_button, any_selector).filter(
      (rule) =>
        rule.declarations.get("position") === "absolute" &&
        rule.declarations.get("inset") === "0",
    );

    expect(stretch.length).toBeGreaterThan(0);
    expect(
      rules_matching(rules, section_row, any_selector).some(
        (rule) => rule.declarations.get("position") === "relative",
      ),
    ).toBe(true);
    expect(
      rules_matching(rules, add_button, any_selector).some(
        (rule) => rule.declarations.get("position") === "relative",
      ),
    ).toBe(true);
  });

  it("keeps the row chevron icon-only with no hover fill", () => {
    const fills = rules_matching(rules, row_chevron, has_hover).filter(
      (rule) =>
        rule.declarations.get("background-color") === "var(--aster-hover)",
    );

    expect(fills).toHaveLength(0);
    expect(
      rules_matching(rules, row_chevron, any_selector).some(
        (rule) => rule.declarations.get("background") === "none",
      ),
    ).toBe(true);
  });

  it("gives every sidebar control the same hover background and radius", () => {
    for (const element of [toggle_button, add_button]) {
      const hover = rules_matching(rules, element, has_hover).filter(
        (rule) =>
          rule.in_hover_media &&
          rule.declarations.get("background-color") === "var(--aster-hover)",
      );
      const radius = rules_matching(rules, element, any_selector).filter(
        (rule) =>
          rule.declarations.get("border-radius") === "var(--aster-radius-item)",
      );

      expect(hover.length).toBeGreaterThan(0);
      expect(radius.length).toBeGreaterThan(0);
    }
  });

  it("never paints focus styles on plain focus after a click", () => {
    const painted = ["background", "background-color", "box-shadow"];

    for (const element of [toggle_button, add_button, row_chevron]) {
      for (const rule of rules_matching(rules, element, has_plain_focus)) {
        for (const prop of painted) {
          expect(rule.declarations.has(prop)).toBe(false);
        }
        const outline = rule.declarations.get("outline");

        expect(outline === undefined || outline === "none").toBe(true);
      }
      expect(element.className).not.toMatch(/(^|\s)focus:/);
    }
  });

  it("shows the shared accent outline for keyboard focus", () => {
    for (const element of [toggle_button, add_button, row_chevron]) {
      const ring = rules_matching(rules, element, has_focus_visible).filter(
        (rule) =>
          rule.declarations.get("outline") === "2px solid var(--accent-color)",
      );

      expect(ring.length).toBeGreaterThan(0);
    }
  });
});
