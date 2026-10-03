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
// GNU Affero General Public License for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { AliasRule } from "@/services/api/alias_rules";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const show_toast = vi.fn();
const create_alias_rule = vi.fn(async (_id?: unknown, _req?: unknown) => ({
  data: { id: "new-rule" },
}));
const update_alias_rule = vi.fn(
  async (_id?: unknown, _rule_id?: unknown, _req?: unknown) => ({
    data: { id: "rule-1" },
  }),
);

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: (...args: unknown[]) => show_toast(...args),
}));

vi.mock("@/services/api/alias_rules", () => ({
  create_alias_rule: (id?: unknown, req?: unknown) =>
    create_alias_rule(id, req),
  update_alias_rule: (id?: unknown, rule_id?: unknown, req?: unknown) =>
    update_alias_rule(id, rule_id, req),
  create_domain_address_rule: vi.fn(),
  update_domain_address_rule: vi.fn(),
}));

vi.mock("@aster/ui", async (import_original) => ({
  ...(await import_original<typeof import("@aster/ui")>()),
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/modal", () => {
  const Pass = ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  );

  return {
    Modal: ({
      is_open,
      children,
    }: {
      is_open: boolean;
      children: React.ReactNode;
    }) => (is_open ? <div>{children}</div> : null),
    ModalHeader: Pass,
    ModalTitle: Pass,
    ModalDescription: Pass,
    ModalBody: Pass,
    ModalFooter: Pass,
  };
});

vi.mock("@/components/ui/dropdown_menu", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );

  return {
    DropdownMenu: Pass,
    DropdownMenuTrigger: Pass,
    DropdownMenuContent: Pass,
    DropdownMenuLabel: Pass,
    DropdownMenuSeparator: () => null,
    DropdownMenuItem: ({
      children,
      onSelect,
    }: {
      children: React.ReactNode;
      onSelect?: () => void;
    }) => (
      <button data-menu-item="" type="button" onClick={() => onSelect?.()}>
        {children}
      </button>
    ),
  };
});

vi.mock("@/components/ui/popover", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );

  return { Popover: Pass, PopoverTrigger: Pass, PopoverContent: Pass };
});

import { AliasRuleEditorModal } from "@/components/settings/aliases/alias_rule_editor_modal";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  show_toast.mockClear();
  create_alias_rule.mockClear();
  update_alias_rule.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function field_items(): HTMLButtonElement[] {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>("[data-menu-item]"),
  ).filter((el) => /^mail_rules\.field_/.test(el.textContent ?? ""));
}

function offered_fields(): string[] {
  return Array.from(new Set(field_items().map((el) => el.textContent ?? "")));
}

function click_button(label: string) {
  const btn = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent === label,
  );

  if (!btn) throw new Error(`button not found: ${label}`);
  act(() => btn.click());
}

describe("AliasRuleEditorModal field picker", () => {
  it("only offers the fields alias rules support", () => {
    act(() => {
      root.render(
        <AliasRuleEditorModal
          is_open
          alias_id="alias-1"
          on_close={() => {}}
          on_saved={() => {}}
        />,
      );
    });

    expect(offered_fields().sort()).toEqual([
      "mail_rules.field_from",
      "mail_rules.field_subject",
      "mail_rules.field_to",
    ]);
  });

  it("never saves an unsupported field as From", async () => {
    const rule = {
      id: "rule-1",
      priority: 0,
      is_enabled: true,
      conditions: [
        { field: "body", operator: "contains", value: "unsubscribe" },
      ],
      actions: { block: true },
    } as unknown as AliasRule;

    act(() => {
      root.render(
        <AliasRuleEditorModal
          is_open
          alias_id="alias-1"
          on_close={() => {}}
          on_saved={() => {}}
          rule={rule}
        />,
      );
    });

    await act(async () => {
      click_button("settings.alias_rule_save_changes");
    });

    expect(update_alias_rule).not.toHaveBeenCalled();
    expect(show_toast).toHaveBeenCalledWith(expect.any(String), "error");
  });

  it("hides the match-case toggle the alias API cannot store", () => {
    act(() => {
      root.render(
        <AliasRuleEditorModal
          is_open
          alias_id="alias-1"
          on_close={() => {}}
          on_saved={() => {}}
        />,
      );
    });

    expect(container.textContent).toContain("mail_rules.value_placeholder");
    expect(
      container.querySelector('[aria-label="mail_rules.match_case"]'),
    ).toBeNull();
  });
});
